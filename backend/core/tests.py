import base64
from unittest.mock import patch

from django.core.files.storage import default_storage
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .models import ApplicantDocument, Application, Program, User
from .upload_views import upload_document

# Create your tests here.


class DocumentUploadTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='upload-test@example.com',
            password='TestPass123!',
            full_name='Upload Test',
        )
        self.program = Program.objects.create(
            code='TEST',
            name='Test Program',
        )
        self.application = Application.objects.create(
            applicant=self.user,
            program=self.program,
            status='draft',
        )
        self.factory = APIRequestFactory()

    def tearDown(self):
        for document in ApplicantDocument.objects.filter(application=self.application):
            if default_storage.exists(document.file_path):
                default_storage.delete(document.file_path)

    def upload(self, file_name='document.txt', content=b'test document', document_type='other'):
        request = self.factory.post(
            '/api/upload/document/',
            {
                'application_id': str(self.application.id),
                'document_type': document_type,
                'file_name': file_name,
                'file_data': base64.b64encode(content).decode('ascii'),
                'mime_type': 'text/plain',
            },
            format='json',
        )
        force_authenticate(request, user=self.user)
        return upload_document(request)

    def test_upload_records_sha256_and_file_availability(self):
        response = self.upload()

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['file_available'], True)
        self.assertEqual(len(response.data['file_sha256']), 64)

    def test_duplicate_upload_returns_conflict_without_new_record(self):
        first = self.upload()
        second = self.upload()

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.data['code'], 'duplicate_document')
        self.assertEqual(ApplicantDocument.objects.filter(application=self.application).count(), 1)

    @patch('core.upload_views.OCR_EXECUTOR.submit')
    def test_tor_upload_returns_before_ocr_and_preserves_original_file(self, submit):
        response = self.upload(
            file_name='tor.pdf',
            content=b'%PDF-original-tor',
            document_type='tor',
        )

        self.assertEqual(response.status_code, 201)
        document = ApplicantDocument.objects.get(id=response.data['id'])
        self.assertEqual(document.ocr_status, 'pending')
        self.assertEqual(document.ocr_error, '')
        self.assertTrue(default_storage.exists(document.file_path))
        submit.assert_called_once()

    @patch('core.upload_views.EVALUATION_EXECUTOR.submit')
    def test_evaluation_returns_accepted_and_runs_in_background(self, submit):
        from .upload_views import process_application

        request = self.factory.post(
            '/api/application/process/',
            {'application_id': str(self.application.id)},
            format='json',
        )
        self.user.role = 'evaluator'
        self.user.save(update_fields=['role'])
        force_authenticate(request, user=self.user)

        response = process_application(request)

        self.assertEqual(response.status_code, 202)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'processing')
        submit.assert_called_once()

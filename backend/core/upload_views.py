from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.http import FileResponse, Http404
from django.db import transaction
from django.db.models import Q
import mimetypes
from asgiref.sync import async_to_sync
import base64
import hashlib
import uuid
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from django.db import close_old_connections

from .models import (
    Application, TORDocument, TORSubject,
    SubjectMatch, CurriculumSubject, ChatConversation, ChatMessage,
    WorkExperience, ApplicantDocument, Prediction, Program
)
from .serializers import (
    TORDocumentSerializer, ChatMessageSerializer,
    ApplicantDocumentSerializer, ApplicationSerializer
)
from .gemini_service import gemini_service, LOCAL_SUBJECT_PATTERN, fitz
from .views import _get_work_experience_evidence


OCR_EXECUTOR = ThreadPoolExecutor(max_workers=2)
EVALUATION_EXECUTOR = ThreadPoolExecutor(max_workers=1)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def preview_document(request, document_id):
    """
    Stream the document file for preview.
    Applicants can view their own docs; evaluators/admins can view any doc.
    """
    try:
        doc = ApplicantDocument.objects.get(id=document_id)
    except ApplicantDocument.DoesNotExist:
        return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)
    
    # Permission check
    user = request.user
    if user.role not in ['evaluator', 'admin'] and doc.application.applicant != user:
        return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
    
    if not default_storage.exists(doc.file_path):
        return Response({
            'error': 'The uploaded file is no longer available. Please upload this document again.',
            'code': 'file_unavailable',
            'document_id': str(doc.id),
        }, status=status.HTTP_404_NOT_FOUND)
    
    try:
        file_obj = default_storage.open(doc.file_path, 'rb')
        content_type = doc.mime_type or mimetypes.guess_type(doc.file_name)[0] or 'application/octet-stream'
        response = FileResponse(file_obj, content_type=content_type)
        safe_file_name = os.path.basename(doc.file_name).replace('"', '')
        response['Content-Disposition'] = f'inline; filename="{safe_file_name}"'
        return response
    except Exception as e:
        return Response({'error': f'Failed to open file: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_document(request):
    """
    Upload any document (TOR, PSA, Job Description, etc.)
    """
    application_id = request.data.get('application_id')
    document_type = request.data.get('document_type', 'other')
    file_name = request.data.get('file_name', f'doc_{uuid.uuid4()}')
    file_data = request.data.get('file_data')
    mime_type = request.data.get('mime_type', 'application/octet-stream')
    
    if not application_id or not file_data:
        return Response(
            {'error': 'application_id and file_data are required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        application = Application.objects.get(id=application_id, applicant=request.user)
    except Application.DoesNotExist:
        return Response(
            {'error': 'Application not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Decode base64 if needed
    if isinstance(file_data, str) and 'base64,' in file_data:
        _, file_data = file_data.split('base64,', 1)
    
    try:
        file_content = base64.b64decode(file_data, validate=True)
    except Exception as e:
        return Response({'error': f'Invalid file data: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    if not file_content:
        return Response({'error': 'Uploaded file is empty'}, status=status.HTTP_400_BAD_REQUEST)
    file_sha256 = hashlib.sha256(file_content).hexdigest()

    duplicate = ApplicantDocument.objects.filter(
        application=application,
        document_type=document_type,
    ).filter(
        Q(file_sha256=file_sha256)
        | Q(file_name=file_name, file_size=len(file_content))
    ).first()
    if duplicate:
        return Response({
            'error': 'This document has already been uploaded for this application.',
            'code': 'duplicate_document',
            'document': ApplicantDocumentSerializer(duplicate).data,
        }, status=status.HTTP_409_CONFLICT)
    
    # Save file locally
    ext = mime_type.split('/')[-1] if '/' in mime_type else 'bin'
    saved_filename = f"docs/{document_type}_{uuid.uuid4()}.{ext}"
    try:
        with transaction.atomic():
            saved_path = default_storage.save(saved_filename, ContentFile(file_content))
            doc = ApplicantDocument.objects.create(
                application=application,
                document_type=document_type,
                file_name=file_name,
                file_path=saved_path,
                file_size=len(file_content),
                file_sha256=file_sha256,
                mime_type=mime_type,
                ocr_status='pending' if document_type in ['tor', 'job_description'] else 'not_applicable'
            )
    except Exception as e:
        if default_storage.exists(saved_filename):
            default_storage.delete(saved_filename)
        return Response({'error': f'Unable to save document: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    response_data = ApplicantDocumentSerializer(doc).data

    # OCR runs after the upload response so the applicant does not wait for
    # PDF conversion and AI extraction. The worker reads the saved original.
    if document_type in ['tor', 'job_description']:
        OCR_EXECUTOR.submit(process_document_ocr_background, doc.id)
    
    return Response(
        response_data,
        status=status.HTTP_201_CREATED
    )


def process_document_ocr_background(doc_id):
    """Process a saved document without blocking the upload request."""
    close_old_connections()
    try:
        doc = ApplicantDocument.objects.get(id=doc_id)
        if not default_storage.exists(doc.file_path):
            raise FileNotFoundError(f'Uploaded file is unavailable: {doc.file_path}')

        with default_storage.open(doc.file_path, 'rb') as file_obj:
            file_base64 = base64.b64encode(file_obj.read()).decode('utf-8')

        if doc.document_type == 'tor':
            process_tor_ocr_sync(doc.id, file_base64, clear_existing=False)
        elif doc.document_type == 'job_description':
            process_job_description_ocr_sync(doc.id, file_base64)
    except Exception as exc:
        print(f'Background OCR error for {doc_id}: {exc}')
        ApplicantDocument.objects.filter(id=doc_id).update(
            ocr_status='failed',
            ocr_error=str(exc),
        )
    finally:
        close_old_connections()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_curriculum(request):
    """Upload a curriculum PDF for a program and parse subjects.

    Expects: program_code (e.g., 'BSIT'), file_name, file_data (base64), mime_type
    Only admin users can upload/replace curriculum.
    """
    # Allow admin and evaluators (department chairs) to upload curricula
    if request.user.role not in ['admin', 'evaluator']:
        return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

    program_code = request.data.get('program_code')
    file_name = request.data.get('file_name', f'curriculum_{uuid.uuid4()}.pdf')
    file_data = request.data.get('file_data')
    mime_type = request.data.get('mime_type', 'application/pdf')

    if not program_code or not file_data:
        return Response({'error': 'program_code and file_data are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        program = Program.objects.get(code__iexact=program_code)
    except Program.DoesNotExist:
        return Response({'error': 'Program not found'}, status=status.HTTP_404_NOT_FOUND)

    # Decode base64
    if isinstance(file_data, str) and 'base64,' in file_data:
        _, file_data = file_data.split('base64,', 1)

    try:
        file_content = base64.b64decode(file_data)
    except Exception as e:
        return Response({'error': f'Invalid file data: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    # Save file
    saved_filename = f"curricula/{program.code}_{uuid.uuid4()}.pdf"
    saved_path = default_storage.save(saved_filename, ContentFile(file_content))

    # Extract text using fitz if available
    text = ''
    try:
        if fitz:
            # default_storage path may be abstract; open file via default_storage
            with default_storage.open(saved_path, 'rb') as f:
                doc = fitz.open(stream=f.read(), filetype='pdf')
                for page in doc:
                    text += page.get_text('text') + '\n'
        else:
            return Response({'error': 'PDF text extraction not available (missing fitz).'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': f'Failed to extract PDF text: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Parse subjects using LOCAL_SUBJECT_PATTERN from gemini_service
    subjects = []
    try:
        for m in LOCAL_SUBJECT_PATTERN.finditer(text):
            code = (m.group('code') or '').strip()
            title = (m.group('title') or '').strip()
            units_raw = m.group('units') if m.group('units') else '0'
            try:
                units = int(float(units_raw))
            except Exception:
                units = 0
            subjects.append({'code': code, 'title': title, 'units': units})
    except Exception as e:
        return Response({'error': f'Failed to parse curriculum subjects: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # If preview flag set, return parsed subjects without saving
    preview = bool(request.data.get('preview', False))
    if preview:
        return Response({'preview': True, 'subjects': subjects})

    # Replace existing curriculum for this program
    CurriculumSubject.objects.filter(program=program).delete()

    created = []
    for s in subjects:
        if not s['code']:
            continue
        cs = CurriculumSubject.objects.create(
            program=program,
            code=s['code'],
            title=s['title'][:255],
            description='',
            units=s['units'] or 0,
            year=0,
            semester=0
        )
        created.append({'id': str(cs.id), 'code': cs.code, 'title': cs.title, 'units': cs.units})

    return Response({'message': 'Curriculum uploaded', 'created_count': len(created), 'subjects': created})


def process_tor_ocr_sync(doc_id, image_base64, clear_existing=True):
    """Synchronous wrapper for OCR processing"""
    try:
        doc = ApplicantDocument.objects.get(id=doc_id)
        doc.ocr_status = 'processing'
        doc.ocr_error = ''
        doc.save()
        
        # Call async Gemini service synchronously
        subjects_data = async_to_sync(gemini_service.extract_subjects_from_tor)(image_base64)
        
        doc.ocr_raw = json.dumps(subjects_data) if subjects_data else ''
        doc.extracted_text = json.dumps(subjects_data) if subjects_data else ''
        
        if clear_existing:
            TORSubject.objects.filter(application=doc.application).delete()

        # Create TOR subject records
        created_count = 0
        for subject_data in (subjects_data or []):
            code = (subject_data.get('code') or '').strip()
            title = (subject_data.get('title') or '').strip()
            if code and code != 'UNCLEAR' and title:
                TORSubject.objects.create(
                    application=doc.application,
                    code=code,
                    title=title,
                    grade=str(subject_data.get('grade', 'Passed')),
                    units=float(subject_data.get('units', 0) or 0),
                    year_level=int(subject_data.get('year_level', 1) or 1),
                    semester=int(subject_data.get('semester', 1) or 1),
                    school_year=str(subject_data.get('school_year', '') or ''),
                    term_label=str(subject_data.get('term_label', '') or ''),
                    raw_text=json.dumps(subject_data)
                )
                created_count += 1
        
        print(f"Successfully processed TOR doc {doc_id}: Extracted {created_count} subjects.")
        doc.ocr_status = 'completed'
        doc.ocr_error = ''
        doc.save()
        return created_count
    
    except Exception as e:
        print(f"OCR processing error: {str(e)}")
        try:
            doc = ApplicantDocument.objects.get(id=doc_id)
            doc.ocr_status = 'failed'
            doc.ocr_error = str(e)
            doc.save()
        except Exception:
            pass


def process_job_description_ocr_sync(doc_id, image_base64):
    """Synchronous wrapper for job description extraction"""
    try:
        doc = ApplicantDocument.objects.get(id=doc_id)
        doc.ocr_status = 'processing'
        doc.ocr_error = ''
        doc.save()

        work_data = async_to_sync(gemini_service.extract_work_experience_from_job_description)(image_base64)

        doc.ocr_raw = json.dumps(work_data) if work_data else ''
        doc.extracted_text = json.dumps(work_data) if work_data else ''

        doc.ocr_status = 'completed'
        doc.ocr_error = ''
        doc.save()

    except Exception as e:
        print(f"Job description OCR processing error: {str(e)}")
        try:
            doc = ApplicantDocument.objects.get(id=doc_id)
            doc.ocr_status = 'failed'
            doc.ocr_error = str(e)
            doc.save()
        except Exception:
            pass


def ensure_tor_subjects_from_documents(application):
    """Rebuild TORSubject rows from uploaded TOR documents when none exist yet.

    This is a recovery path for older uploads where OCR completed but no
    transcript subjects were extracted, so re-running AI evaluation can still
    populate the BSIT curriculum match list.
    """
    if TORSubject.objects.filter(application=application).exists():
        return {
            'documents': ApplicantDocument.objects.filter(application=application, document_type='tor').count(),
            'readable_documents': None,
            'subjects_created': 0,
            'missing_documents': [],
            'errors': [],
            'reused_existing_subjects': True,
        }

    tor_documents = ApplicantDocument.objects.filter(application=application, document_type='tor')
    missing_documents = []
    subjects_created = 0
    errors = []
    for document in tor_documents:
        try:
            if not default_storage.exists(document.file_path):
                missing_documents.append(document.file_name)
                continue

            with default_storage.open(document.file_path, 'rb') as file_obj:
                file_bytes = file_obj.read()

            if not file_bytes:
                continue

            file_base64 = base64.b64encode(file_bytes).decode('utf-8')
            subjects_created += process_tor_ocr_sync(document.id, file_base64, clear_existing=False) or 0
        except Exception as e:
            print(f"TOR recovery reprocess error for {document.id}: {e}")
            errors.append(f'{document.file_name}: {str(e)}')

    return {
        'documents': tor_documents.count(),
        'readable_documents': tor_documents.count() - len(missing_documents),
        'subjects_created': subjects_created,
        'missing_documents': missing_documents,
        'errors': errors,
        'reused_existing_subjects': False,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_work_experience(request):
    """Add work experience to an application"""
    application_id = request.data.get('application_id')
    
    try:
        application = Application.objects.get(id=application_id, applicant=request.user)
    except Application.DoesNotExist:
        return Response({'error': 'Application not found'}, status=status.HTTP_404_NOT_FOUND)
    
    work_exp = WorkExperience.objects.create(
        application=application,
        company_name=request.data.get('company_name', ''),
        job_title=request.data.get('job_title', ''),
        years=float(request.data.get('years', 0)),
        job_description=request.data.get('job_description', ''),
        start_date=request.data.get('start_date') or None,
        end_date=request.data.get('end_date') or None,
        is_current=request.data.get('is_current', False),
    )
    
    return Response({
        'id': str(work_exp.id),
        'company_name': work_exp.company_name,
        'job_title': work_exp.job_title,
        'years': work_exp.years,
        'job_description': work_exp.job_description,
        'is_current': work_exp.is_current,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def process_application(request):
    """
    Process application: match TOR subjects + work experience to curriculum.
    Generate course recommendation and predictions.

    This endpoint is restricted to evaluators and admins only.
    AI matching is intentionally deferred from applicant submission and is
    triggered manually by the Department Chair via the evaluator review page.
    """
    # Only evaluators and admins can trigger AI evaluation
    if request.user.role not in ['evaluator', 'admin']:
        return Response(
            {'error': 'Only evaluators and administrators can run AI evaluation.'},
            status=status.HTTP_403_FORBIDDEN
        )

    application_id = request.data.get('application_id')
    
    try:
        application = Application.objects.get(id=application_id)
    except Application.DoesNotExist:
        return Response({'error': 'Application not found'}, status=status.HTTP_404_NOT_FOUND)

    if application.status == 'processing':
        return Response({
            'message': 'AI evaluation is already processing',
            'status': 'processing',
            'application_id': str(application.id),
        }, status=status.HTTP_202_ACCEPTED)
    
    application.status = 'processing'
    application.evaluation_error = ''
    application.save()

    EVALUATION_EXECUTOR.submit(process_application_background, application.id)
    return Response({
        'message': 'AI evaluation started',
        'status': 'processing',
        'application_id': str(application.id),
    }, status=status.HTTP_202_ACCEPTED)


def process_application_background(application_id):
    """Run evaluation without holding the evaluator's HTTP request open."""
    close_old_connections()
    try:
        deadline = time.monotonic() + 120
        while ApplicantDocument.objects.filter(
            application_id=application_id,
            document_type='tor',
            ocr_status__in=['pending', 'processing'],
        ).exists():
            if time.monotonic() >= deadline:
                raise TimeoutError('TOR scanning did not finish within two minutes.')
            time.sleep(1)

        evaluation = run_full_evaluation_sync(str(application_id))
        print(f'Application {application_id} evaluation completed: {evaluation}')
    except Exception as exc:
        print(f'Process application error: {exc}')
        Application.objects.filter(id=application_id).update(
            status='submitted',
            evaluation_error=str(exc),
        )
    finally:
        close_old_connections()



def _match_single_tor_subject(tor_subject, program, curriculum_list):
    """Match a single TOR subject against the curriculum (sync)."""
    tor_data = {
        'code': tor_subject.code,
        'title': tor_subject.title,
        'units': tor_subject.units
    }
    return gemini_service.match_subject_sync(tor_data, curriculum_list)


def run_full_evaluation_sync(application_id):
    """Run full AI evaluation - ultra-fast sync evaluation"""
    application = Application.objects.get(id=application_id)

    reviewed_statuses = ['approved', 'rejected', 'overridden']
    pending_statuses = ['pending']

    # Recovery path: older TOR uploads may have completed OCR but never created
    # TORSubject rows, which leaves evaluation with nothing to match.
    scan_result = ensure_tor_subjects_from_documents(application)
    
    work_experiences_list = _get_work_experience_evidence(application)
    work_exp_objects = list(WorkExperience.objects.filter(application=application))
    
    # Step 1: Course Recommendation based on work experience
    if work_experiences_list:
        try:
            recommendation = gemini_service.recommend_program_sync(work_experiences_list)
            application.recommended_program = recommendation.get('program', 'BSIT')
            application.recommendation_reasoning = recommendation.get('reasoning', '')
            application.save()
        except Exception as e:
            print(f"Recommendation error: {e}")
    
    # Step 2: Match TOR subjects to curriculum
    # Exclude curriculum subjects that have already been reviewed/approved for this application
    approved_curriculum_ids = set(
        SubjectMatch.objects.filter(
            application=application,
            status__in=reviewed_statuses,
            curriculum_subject__isnull=False
        ).values_list('curriculum_subject_id', flat=True)
    )
    
    all_curriculum_subjects = list(CurriculumSubject.objects.filter(program=application.program))
    curriculum_obj_map = {
        cs.code.upper().replace(' ', '').replace('-', ''): cs
        for cs in all_curriculum_subjects
    }
    
    curriculum_qs = [cs for cs in all_curriculum_subjects if cs.id not in approved_curriculum_ids]
    curriculum_list = [
        {
            'id': str(cs.id),
            'code': cs.code,
            'title': cs.title,
            'description': cs.description,
            'units': cs.units
        }
        for cs in curriculum_qs
    ]
    
    tor_subjects = list(TORSubject.objects.filter(application=application))
    
    # Pre-fetch reviewed matches in 1 query
    reviewed_tor_subject_ids = set(
        SubjectMatch.objects.filter(
            application=application,
            status__in=reviewed_statuses,
            tor_subject__isnull=False
        ).values_list('tor_subject_id', flat=True)
    )

    # Delete all pending matches to reprocess in 1 fast query
    SubjectMatch.objects.filter(
        application=application,
        status__in=pending_statuses,
    ).delete()

    tor_subjects_to_process = [s for s in tor_subjects if s.id not in reviewed_tor_subject_ids]
    matches_to_create = []
    claimed_curriculum_ids = set(approved_curriculum_ids)

    # Process TOR subjects using fast matching engine with strict 1-to-1 matching
    for tor_subject in tor_subjects_to_process:
        try:
            available_curriculum_list = [
                cs for cs in curriculum_list
                if cs['id'] not in claimed_curriculum_ids and uuid.UUID(cs['id']) not in claimed_curriculum_ids
            ]
            matches = _match_single_tor_subject(tor_subject, application.program, available_curriculum_list)
            
            assigned_subj = None
            assigned_match_info = None

            if matches and len(matches) > 0:
                for cand in matches:
                    norm_target_code = (cand.get('curriculum_code') or '').upper().replace(' ', '').replace('-', '')
                    curriculum_subj = curriculum_obj_map.get(norm_target_code)
                    if not curriculum_subj or curriculum_subj.id in claimed_curriculum_ids or str(curriculum_subj.id) in claimed_curriculum_ids:
                        continue

                    # Enforce Unit Sufficiency Rule: Applicant units must be >= curriculum units
                    if tor_subject.units and curriculum_subj.units and tor_subject.units < curriculum_subj.units:
                        continue

                    assigned_subj = curriculum_subj
                    assigned_match_info = cand
                    break

            if assigned_subj:
                claimed_curriculum_ids.add(assigned_subj.id)
                claimed_curriculum_ids.add(str(assigned_subj.id))
                matches_to_create.append(SubjectMatch(
                    application=application,
                    tor_subject=tor_subject,
                    curriculum_subject=assigned_subj,
                    source='tor',
                    confidence=float(assigned_match_info.get('confidence', 0)),
                    matching_reason=assigned_match_info.get('reasoning', ''),
                    status='pending'
                ))
            else:
                matches_to_create.append(SubjectMatch(
                    application=application,
                    tor_subject=tor_subject,
                    curriculum_subject=None,
                    source='tor',
                    confidence=0,
                    status='pending',
                    matching_reason='No unassigned matching curriculum subject found'
                ))
        except Exception as e:
            print(f"TOR matching error for {tor_subject.code}: {e}")
            matches_to_create.append(SubjectMatch(
                application=application,
                tor_subject=tor_subject,
                curriculum_subject=None,
                source='tor',
                confidence=0,
                status='pending',
                matching_reason=f'Error: {str(e)}'
            ))

    # Step 3: Match work experience to curriculum (UNLIMITED CREDITING)
    # A single work experience role can match and credit multiple BSIT curriculum subjects.
    reviewed_curriculum_ids = set(
        SubjectMatch.objects.filter(
            application=application,
            status__in=reviewed_statuses
        ).values_list('curriculum_subject_id', flat=True)
    )

    for work_exp in work_exp_objects:
        try:
            # Delete only pending matches for this work experience to avoid duplicate suggestions
            SubjectMatch.objects.filter(
                application=application,
                work_experience=work_exp,
                status__in=pending_statuses,
            ).delete()

            exp_data = {
                'job_title': work_exp.job_title,
                'years': work_exp.years,
                'description': work_exp.job_description
            }
            
            work_matches = gemini_service.match_work_experience_sync(exp_data, curriculum_list)
            
            for match in (work_matches or [])[:10]:
                norm_work_code = (match.get('curriculum_code') or '').upper().replace(' ', '').replace('-', '')
                curriculum_subj = curriculum_obj_map.get(norm_work_code)
                
                if curriculum_subj and curriculum_subj.id not in reviewed_curriculum_ids:
                    # Ensure we don't assign the same curriculum subject twice in the same batch
                    already_queued = any(m.curriculum_subject_id == curriculum_subj.id for m in matches_to_create)
                    already_in_db = SubjectMatch.objects.filter(
                        application=application,
                        curriculum_subject=curriculum_subj,
                    ).exists()

                    if not already_queued and not already_in_db:
                        matches_to_create.append(SubjectMatch(
                            application=application,
                            work_experience=work_exp,
                            curriculum_subject=curriculum_subj,
                            source='work_experience',
                            confidence=float(match.get('confidence', 0)),
                            matching_reason=match.get('reasoning', ''),
                            status='pending'
                        ))
        except Exception as e:
            print(f"Work matching error for {work_exp.job_title}: {e}")

    # Bulk insert all matches in 1 ultra-fast transaction
    if matches_to_create:
        SubjectMatch.objects.bulk_create(matches_to_create)
    
    # Step 4: Generate prediction
    try:
        approved_matches = SubjectMatch.objects.filter(
            application=application,
            status__in=['approved', 'overridden']
        ).values_list('curriculum_subject_id', flat=True)

        if not approved_matches.exists():
            approved_matches = SubjectMatch.objects.filter(
                application=application,
                confidence__gte=60
            ).values_list('curriculum_subject_id', flat=True)
        
        credited_subject_ids = set(approved_matches)
        all_subjects = CurriculumSubject.objects.filter(program=application.program)
        remaining = all_subjects.exclude(id__in=credited_subject_ids)
        
        remaining_units = sum(s.units for s in remaining)
        semesters_min = max(1, (remaining_units // 21))
        semesters_max = max(2, (remaining_units // 15))
        
        plan = []
        sem_subjects = []
        current_units = 0
        sem_num = 1
        
        for subj in remaining.order_by('year', 'semester'):
            if current_units + subj.units > 21:
                plan.append({
                    'semester': sem_num,
                    'subjects': sem_subjects,
                    'total_units': current_units
                })
                sem_subjects = []
                current_units = 0
                sem_num += 1
            
            sem_subjects.append({
                'code': subj.code,
                'title': subj.title,
                'units': subj.units
            })
            current_units += subj.units
        
        if sem_subjects:
            plan.append({
                'semester': sem_num,
                'subjects': sem_subjects,
                'total_units': current_units
            })
        
        Prediction.objects.filter(application=application).delete()
        Prediction.objects.create(
            application=application,
            semesters_min=semesters_min,
            semesters_max=semesters_max,
            plan_json={'semesters': plan, 'remaining_units': remaining_units}
        )
    except Exception as e:
        print(f"Prediction error: {e}")
    
    application.status = 'under_review'
    application.save()
    return {
        'subjects_scanned': len(tor_subjects),
        'matches_created': len(matches_to_create),
        'matches_total': SubjectMatch.objects.filter(application=application).count(),
        'scan': scan_result,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recommend_course(request):
    """Recommend a course based on work experience (without saving)"""
    work_experiences = request.data.get('work_experiences', [])
    
    if not work_experiences:
        return Response({'error': 'work_experiences required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        recommendation = async_to_sync(gemini_service.recommend_program)(work_experiences)
        return Response(recommendation)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def chat_message(request):
    """Send message to chatbot and get response"""
    conversation_id = request.data.get('conversation_id')
    message = request.data.get('message')
    
    if not message:
        return Response(
            {'error': 'message is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Get or create conversation
    if conversation_id:
        try:
            conversation = ChatConversation.objects.get(id=conversation_id)
        except ChatConversation.DoesNotExist:
            conversation = ChatConversation.objects.create(
                user=request.user if request.user.is_authenticated else None
            )
    else:
        conversation = ChatConversation.objects.create(
            user=request.user if request.user.is_authenticated else None
        )
    
    # Save user message
    user_msg = ChatMessage.objects.create(
        conversation=conversation,
        role='user',
        content=message
    )
    
    # Get user context if authenticated
    user_context = None
    if request.user.is_authenticated:
        applications = Application.objects.filter(applicant=request.user)
        if applications.exists():
            user_context = f"User has {applications.count()} application(s). Latest status: {applications.first().status}"
    
    # Get bot response (sync wrapper around async Gemini call)
    try:
        bot_response = async_to_sync(gemini_service.chat_with_bot)(
            conversation_history=[],
            user_message=message,
            user_context=user_context
        )
    except Exception as e:
        print(f"Chat error: {e}")
        bot_response = "I apologize, but I'm having trouble right now. Please try again."
    
    # Save bot response
    bot_msg = ChatMessage.objects.create(
        conversation=conversation,
        role='assistant',
        content=bot_response
    )
    
    return Response({
        'conversation_id': str(conversation.id),
        'user_message': ChatMessageSerializer(user_msg).data,
        'bot_message': ChatMessageSerializer(bot_msg).data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_predictions(request):
    """Get prediction for an application"""
    application_id = request.query_params.get('application_id')
    
    if not application_id:
        return Response({'error': 'application_id required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        application = Application.objects.get(id=application_id)
        if application.applicant != request.user and request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        if request.user.role == 'applicant' and application.status != 'finalized':
            return Response(
                {'error': 'Results are not available until the Department Chair finalizes accreditation'},
                status=status.HTTP_403_FORBIDDEN
            )
    except Application.DoesNotExist:
        return Response({'error': 'Application not found'}, status=status.HTTP_404_NOT_FOUND)
    
    prediction = Prediction.objects.filter(application=application).first()
    
    if not prediction:
        return Response({
            'application_id': str(application.id),
            'semesters_min': 0,
            'semesters_max': 0,
            'plan_json': {'semesters': [], 'remaining_units': 0}
        })
    
    return Response({
        'application_id': str(application.id),
        'semesters_min': prediction.semesters_min,
        'semesters_max': prediction.semesters_max,
        'plan_json': prediction.plan_json,
        'created_at': prediction.created_at.isoformat()
    })

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from asgiref.sync import async_to_sync
from django.conf import settings
from django.utils import timezone
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import os
import base64
import json
import uuid
from dotenv import load_dotenv

from .models import (
    User, Program, CurriculumSubject, Application,
    TORDocument, TORSubject, SubjectMatch, Prediction,
    Report, ChatConversation, ChatMessage,
    WorkExperience, ApplicantDocument
)
from .serializers import (
    UserSerializer, RegisterSerializer, LoginSerializer,
    ProgramSerializer, CurriculumSubjectSerializer,
    ApplicationSerializer, TORDocumentSerializer,
    TORSubjectSerializer, SubjectMatchSerializer,
    PredictionSerializer, ReportSerializer,
    ChatConversationSerializer, ChatMessageSerializer,
    WorkExperienceSerializer, ApplicantDocumentSerializer
)
from .gemini_service import gemini_service

load_dotenv()

IT_KEYWORDS = {
    'it', 'information technology', 'software', 'developer', 'programmer',
    'web', 'database', 'network', 'systems', 'system admin', 'devops',
    'qa', 'test automation', 'cybersecurity', 'cloud', 'data analyst',
    'ui', 'ux', 'frontend', 'backend', 'full stack', 'technical support'
}


def _is_it_related_work_data(job_title, job_description):
    return _is_it_related_text(f"{job_title or ''} {job_description or ''}")


def _get_work_experience_evidence(application):
    work_experiences = list(WorkExperience.objects.filter(application=application).values(
        'job_title', 'years', 'job_description'
    ))

    job_description_docs = ApplicantDocument.objects.filter(
        application=application,
        document_type='job_description',
        ocr_status='completed'
    )

    for doc in job_description_docs:
        parsed_data = {}
        for raw_value in [doc.ocr_raw, doc.extracted_text]:
            if not raw_value:
                continue
            try:
                parsed_data = json.loads(raw_value)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed_data, dict):
                break
            parsed_data = {}

        if isinstance(parsed_data, dict) and parsed_data.get('job_title'):
            years_value = parsed_data.get('years', 0) or 0
            try:
                years_value = float(years_value)
            except (TypeError, ValueError):
                years_value = 0

            work_experiences.append({
                'job_title': parsed_data.get('job_title', ''),
                'years': years_value,
                'job_description': parsed_data.get('job_description', ''),
            })

    return work_experiences


def _is_it_related_text(text):
    normalized = (text or '').lower()
    return any(keyword in normalized for keyword in IT_KEYWORDS)


def _tor_meets_bsit_two_year_requirement(application):
    tor_subjects = TORSubject.objects.filter(application=application)
    if not tor_subjects.exists():
        return False, 'TOR analysis not found. Please upload a readable TOR first.'

    total_units = sum(max(subject.units or 0, 0) for subject in tor_subjects)
    it_related_subjects = 0

    for subject in tor_subjects:
        subject_text = f"{subject.code} {subject.title}"
        if _is_it_related_text(subject_text):
            it_related_subjects += 1

    # 2 academic years is typically around 60 units; require a minimum IT density as well.
    if total_units < 60:
        return False, f'TOR has only {total_units} units. At least 60 units (2 years) is required for BSIT ETEEAP.'

    if it_related_subjects < 8:
        return False, (
            'TOR does not show enough BSIT-related coursework '
            f'({it_related_subjects} IT-related subjects found, minimum is 8).'
        )

    return True, ''


def _work_experience_is_it_related(application):
    work_experiences = _get_work_experience_evidence(application)
    if not work_experiences:
        return False, 'At least one IT-related work experience is required before submission.'

    if not any(_is_it_related_work_data(exp.get('job_title'), exp.get('job_description')) for exp in work_experiences):
        return False, 'Work experience is not clearly IT-related.'

    return True, ''


def _ai_supports_bsit_fit(application):
    work_experiences = _get_work_experience_evidence(application)
    if not work_experiences:
        return False, 'At least one work experience entry is required.'

    recommendation = async_to_sync(gemini_service.recommend_program)(work_experiences)
    recommended_program = str(recommendation.get('program', '')).strip().upper()
    reasoning = str(recommendation.get('reasoning', '')).strip()

    # If AI service is unavailable and returns fallback, rely on deterministic checks only.
    fallback_markers = {'local fallback recommendation', 'default recommendation'}
    if reasoning.lower() in fallback_markers:
        return True, ''

    if recommended_program and recommended_program != 'BSIT':
        reason = reasoning or f'AI recommended {recommended_program} instead of BSIT.'
        return False, f'Work role is not aligned to BSIT. {reason}'

    return True, ''


def _collect_bsit_prequalification_failures(application):
    failures = []

    is_tor_eligible, tor_message = _tor_meets_bsit_two_year_requirement(application)
    if not is_tor_eligible and tor_message:
        failures.append(tor_message)

    is_work_eligible, work_message = _work_experience_is_it_related(application)
    if not is_work_eligible and work_message:
        failures.append(work_message)

    # Run AI fit check only if basic work requirement passed.
    if is_work_eligible:
        ai_fit_ok, ai_message = _ai_supports_bsit_fit(application)
        if not ai_fit_ok and ai_message:
            failures.append(ai_message)

    return failures

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh)
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh)
        })
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def google_auth(request):
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    token = request.data.get('token')
    if not token:
        return Response({'error': 'Token required'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        idinfo = id_token.verify_oauth2_token(
            token, 
            google_requests.Request(), 
            settings.GOOGLE_CLIENT_ID
        )
        
        email = idinfo['email']
        google_id = idinfo['sub']
        full_name = idinfo.get('name', email.split('@')[0])
        
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'full_name': full_name,
                'google_id': google_id,
                'role': 'applicant'
            }
        )
        
        if not user.google_id:
            user.google_id = google_id
            user.save()
        
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh)
        })
    
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)

class ProgramViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Program.objects.all()
    serializer_class = ProgramSerializer
    permission_classes = [AllowAny]

class CurriculumSubjectViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CurriculumSubjectSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = CurriculumSubject.objects.all().order_by('year', 'semester', 'code')
        program_id = self.request.query_params.get('program_id')
        if program_id:
            queryset = queryset.filter(program_id=program_id)
        return queryset

class ApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        program_id = self.request.query_params.get('program_id')
        if user.role == 'admin':
            qs = Application.objects.all().order_by('-created_at')
            if program_id:
                qs = qs.filter(program_id=program_id)
            return qs
        elif user.role == 'evaluator':
            qs = Application.objects.exclude(status='draft').order_by('-created_at')
            if program_id:
                qs = qs.filter(program_id=program_id)
            return qs
        else:
            qs = Application.objects.filter(applicant=user).order_by('-created_at')
            if program_id:
                qs = qs.filter(program_id=program_id)
            return qs
    
    def create(self, request):
        program_id = request.data.get('program_id')
        if not program_id:
            # Auto-assign BSIT as default
            program = Program.objects.filter(code='BSIT').first()
            if not program:
                return Response({'error': 'No program available'}, status=status.HTTP_400_BAD_REQUEST)
            program_id = str(program.id)
        
        application = Application.objects.create(
            applicant=request.user,
            program_id=program_id,
            status='draft',
            phone=request.data.get('phone', ''),
            address=request.data.get('address', ''),
            birth_date=request.data.get('birth_date') or None,
        )
        return Response(ApplicationSerializer(application).data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        application = self.get_object()
        if application.applicant != request.user:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        
        # TOR requirement removed: applicants may submit without uploading a TOR.

        # Prequalification gate removed: allow applicants to submit regardless of BSIT checks.
        
        application.status = 'submitted'
        application.save()
        return Response(ApplicationSerializer(application).data)
    
    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        application = self.get_object()
        if request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        
        application.status = 'finalized'
        application.finalized_at = timezone.now()
        application.evaluator_note = request.data.get('evaluator_note', '')
        application.save()
        return Response(ApplicationSerializer(application).data)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        application = self.get_object()
        # Only evaluators or admins can reopen a finalized application
        if request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        # Allow reopening from finalized state (or rejected) back to under_review
        application.status = 'under_review'
        application.finalized_at = None
        application.save()
        return Response(ApplicationSerializer(application).data)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        application = self.get_object()
        if request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        
        application.status = 'rejected'
        application.evaluator_note = request.data.get('evaluator_note', '')
        application.save()
        return Response(ApplicationSerializer(application).data)

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """Generate a short applicant summary for Department Chair based on work experience and uploaded job docs."""
        application = self.get_object()
        if request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        work_experiences = list(
            WorkExperience.objects.filter(application=application).values(
                'job_title', 'years', 'job_description'
            )
        )

        job_docs = []
        docs = ApplicantDocument.objects.filter(
            application=application,
            document_type='job_description',
            ocr_status='completed'
        )
        for d in docs:
            text = d.extracted_text or d.ocr_raw or ''
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    job_docs.append(parsed.get('job_description', '') or json.dumps(parsed))
                elif isinstance(parsed, list):
                    job_docs.append(' '.join(str(x) for x in parsed)[:500])
                else:
                    job_docs.append(str(parsed)[:500])
            except Exception:
                job_docs.append(str(text)[:500])

        payload = {'work_experiences': work_experiences, 'job_docs': job_docs}

        try:
            summary = async_to_sync(gemini_service.summarize_applicant)(payload)
            return Response(summary)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class WorkExperienceViewSet(viewsets.ModelViewSet):
    serializer_class = WorkExperienceSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        application_id = self.request.query_params.get('application_id')
        
        if user.role in ['evaluator', 'admin']:
            queryset = WorkExperience.objects.all()
        else:
            queryset = WorkExperience.objects.filter(application__applicant=user)
        
        if application_id:
            queryset = queryset.filter(application_id=application_id)
        
        return queryset

class TORDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = TORDocumentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.role in ['evaluator', 'admin']:
            return TORDocument.objects.all()
        return TORDocument.objects.filter(application__applicant=user)

class ApplicantDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicantDocumentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        application_id = self.request.query_params.get('application_id')
        
        if user.role in ['evaluator', 'admin']:
            queryset = ApplicantDocument.objects.all()
        else:
            queryset = ApplicantDocument.objects.filter(application__applicant=user)
        
        if application_id:
            queryset = queryset.filter(application_id=application_id)
        
        return queryset

    @action(detail=True, methods=['post'])
    def reprocess(self, request, pk=None):
        document = self.get_object()

        if document.application.applicant != request.user and request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        try:
            from .upload_views import process_tor_ocr_sync, process_job_description_ocr_sync

            file_bytes = None
            from django.core.files.storage import default_storage
            if not default_storage.exists(document.file_path):
                return Response({'error': 'File not found on disk'}, status=status.HTTP_404_NOT_FOUND)

            with default_storage.open(document.file_path, 'rb') as file_obj:
                file_bytes = file_obj.read()

            if document.document_type == 'tor':
                TORSubject.objects.filter(application=document.application).delete()

            import base64
            file_base64 = base64.b64encode(file_bytes).decode('utf-8')

            if document.document_type == 'tor':
                process_tor_ocr_sync(document.id, file_base64)
            elif document.document_type == 'job_description':
                process_job_description_ocr_sync(document.id, file_base64)
            else:
                return Response(
                    {'error': 'Reprocess is only available for TOR and Job Description documents.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            document.refresh_from_db()
            return Response(ApplicantDocumentSerializer(document).data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class SubjectMatchViewSet(viewsets.ModelViewSet):
    serializer_class = SubjectMatchSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        application_id = self.request.query_params.get('application_id')
        
        if user.role in ['evaluator', 'admin']:
            queryset = SubjectMatch.objects.all()
        else:
            queryset = SubjectMatch.objects.filter(
                application__applicant=user,
                application__status='finalized'
            )
        
        if application_id:
            queryset = queryset.filter(application_id=application_id)
            if user.role not in ['evaluator', 'admin']:
                queryset = queryset.filter(application__status='finalized')
        
        return queryset.select_related('tor_subject', 'curriculum_subject', 'work_experience')
    
    @action(detail=True, methods=['post'])
    def flag(self, request, pk=None):
        match = self.get_object()
        if match.application.applicant != request.user:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        
        match.flagged_by_applicant = True
        match.applicant_note = request.data.get('note', '')
        match.save()
        return Response(SubjectMatchSerializer(match).data)

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """Generate a short applicant summary for Department Chair based on work experience and uploaded docs."""
        application = self.get_object()
        # Only evaluator or admin can fetch chair summary
        if request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        # Gather evidence
        work_experiences = list(WorkExperience.objects.filter(application=application).values('job_title', 'years', 'job_description'))
        job_docs = []
        docs = ApplicantDocument.objects.filter(application=application, document_type='job_description', ocr_status='completed')
        for d in docs:
            # prefer extracted_text then ocr_raw
            text = d.extracted_text or d.ocr_raw or ''
            # if it's JSON, try to parse and turn into summary
            try:
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    job_docs.append(parsed.get('job_description','') or json.dumps(parsed))
                elif isinstance(parsed, list):
                    job_docs.append(' '.join(str(x) for x in parsed)[:500])
                else:
                    job_docs.append(str(parsed)[:500])
            except Exception:
                job_docs.append(str(text)[:500])

        payload = {'work_experiences': work_experiences, 'job_docs': job_docs}

        try:
            summary = async_to_sync(gemini_service.summarize_applicant)(payload)
            return Response(summary)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        
        match = self.get_object()
        match.status = 'approved'
        match.evaluator_note = request.data.get('note', '')
        match.save()
        return Response(SubjectMatchSerializer(match).data)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        
        match = self.get_object()
        match.status = 'rejected'
        match.evaluator_note = request.data.get('note', '')
        match.save()
        return Response(SubjectMatchSerializer(match).data)
    
    @action(detail=True, methods=['post'])
    def override(self, request, pk=None):
        if request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        
        match = self.get_object()
        new_curriculum_id = request.data.get('curriculum_subject_id')
        if new_curriculum_id:
            match.curriculum_subject_id = new_curriculum_id
        match.status = 'overridden'
        match.evaluator_note = request.data.get('note', '')
        match.save()
        return Response(SubjectMatchSerializer(match).data)

class ChatConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ChatConversationSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        if self.request.user.is_authenticated:
            return ChatConversation.objects.filter(user=self.request.user)
        return ChatConversation.objects.filter(user__isnull=True)
    
    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            serializer.save(user=self.request.user)
        else:
            serializer.save()

@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({
        'status': 'ok',
        'message': 'ACREDIA API is running',
        'version': '1.0.0'
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Get dashboard statistics based on user role"""
    user = request.user
    stats = {}
    
    if user.role == 'applicant':
        applications = Application.objects.filter(applicant=user)
        stats = {
            'total_applications': applications.count(),
            'draft': applications.filter(status='draft').count(),
            'submitted': applications.filter(status='submitted').count(),
            'under_review': applications.filter(status='under_review').count(),
            'finalized': applications.filter(status='finalized').count(),
        }
    elif user.role == 'evaluator':
        applications = Application.objects.exclude(status='draft')
        stats = {
            'total': applications.count(),
            'pending_review': applications.filter(status__in=['submitted', 'processing', 'under_review']).count(),
            'finalized': applications.filter(status='finalized').count(),
            'rejected': applications.filter(status='rejected').count(),
        }
    elif user.role == 'admin':
        stats = {
            'total_applications': Application.objects.count(),
            'total_users': User.objects.count(),
            'total_applicants': User.objects.filter(role='applicant').count(),
            'total_evaluators': User.objects.filter(role='evaluator').count(),
            'finalized_applications': Application.objects.filter(status='finalized').count(),
            'pending_applications': Application.objects.exclude(status__in=['finalized', 'rejected', 'draft']).count(),
        }
    
    return Response(stats)

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
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

load_dotenv()

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
        if user.role == 'admin':
            return Application.objects.all().order_by('-created_at')
        elif user.role == 'evaluator':
            return Application.objects.exclude(status='draft').order_by('-created_at')
        else:
            return Application.objects.filter(applicant=user).order_by('-created_at')
    
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
        
        # Enforce TOR requirement
        from .models import ApplicantDocument
        has_tor = ApplicantDocument.objects.filter(
            application=application, 
            document_type='tor'
        ).exists()
        if not has_tor:
            return Response(
                {'error': 'Transcript of Records (TOR) is required before submission.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
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
    def reject(self, request, pk=None):
        application = self.get_object()
        if request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        
        application.status = 'rejected'
        application.evaluator_note = request.data.get('evaluator_note', '')
        application.save()
        return Response(ApplicationSerializer(application).data)

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

class SubjectMatchViewSet(viewsets.ModelViewSet):
    serializer_class = SubjectMatchSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        application_id = self.request.query_params.get('application_id')
        
        if user.role in ['evaluator', 'admin']:
            queryset = SubjectMatch.objects.all()
        else:
            queryset = SubjectMatch.objects.filter(application__applicant=user)
        
        if application_id:
            queryset = queryset.filter(application_id=application_id)
        
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

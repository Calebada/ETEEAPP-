from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.http import FileResponse, Http404
from asgiref.sync import async_to_sync
import base64
import uuid
import json
import os

from .models import (
    Application, TORDocument, TORSubject,
    SubjectMatch, CurriculumSubject, ChatConversation, ChatMessage,
    WorkExperience, ApplicantDocument, Prediction, Program
)
from .serializers import (
    TORDocumentSerializer, ChatMessageSerializer,
    ApplicantDocumentSerializer, ApplicationSerializer
)
from .gemini_service import gemini_service


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
        return Response({'error': 'File not found on disk'}, status=status.HTTP_404_NOT_FOUND)
    
    try:
        file_obj = default_storage.open(doc.file_path, 'rb')
        response = FileResponse(file_obj, content_type=doc.mime_type or 'application/octet-stream')
        response['Content-Disposition'] = f'inline; filename="{doc.file_name}"'
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
        file_content = base64.b64decode(file_data)
    except Exception as e:
        return Response({'error': f'Invalid file data: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Save file locally
    ext = mime_type.split('/')[-1] if '/' in mime_type else 'bin'
    saved_filename = f"docs/{document_type}_{uuid.uuid4()}.{ext}"
    saved_path = default_storage.save(saved_filename, ContentFile(file_content))
    
    # Create document record
    doc = ApplicantDocument.objects.create(
        application=application,
        document_type=document_type,
        file_name=file_name,
        file_path=saved_path,
        file_size=len(file_content),
        mime_type=mime_type,
        ocr_status='pending' if document_type == 'tor' else 'not_applicable'
    )
    
    # Process TOR with OCR (synchronous wrapper around async Gemini call)
    if document_type == 'tor':
        try:
            file_base64 = base64.b64encode(file_content).decode('utf-8')
            process_tor_ocr_sync(doc.id, file_base64)
        except Exception as e:
            print(f"OCR error: {e}")
            doc.ocr_status = 'failed'
            doc.save()
    
    return Response(
        ApplicantDocumentSerializer(doc).data,
        status=status.HTTP_201_CREATED
    )


def process_tor_ocr_sync(doc_id, image_base64):
    """Synchronous wrapper for OCR processing"""
    try:
        doc = ApplicantDocument.objects.get(id=doc_id)
        doc.ocr_status = 'processing'
        doc.save()
        
        # Call async Gemini service synchronously
        subjects_data = async_to_sync(gemini_service.extract_subjects_from_tor)(image_base64)
        
        doc.ocr_raw = json.dumps(subjects_data) if subjects_data else ''
        doc.extracted_text = json.dumps(subjects_data) if subjects_data else ''
        
        # Create TOR subject records
        for subject_data in (subjects_data or []):
            if subject_data.get('code') and subject_data.get('code') != 'UNCLEAR':
                TORSubject.objects.create(
                    application=doc.application,
                    code=subject_data.get('code', ''),
                    title=subject_data.get('title', ''),
                    grade=str(subject_data.get('grade', '')),
                    units=subject_data.get('units', 0) or 0,
                    raw_text=json.dumps(subject_data)
                )
        
        doc.ocr_status = 'completed'
        doc.save()
    
    except Exception as e:
        print(f"OCR processing error: {str(e)}")
        try:
            doc = ApplicantDocument.objects.get(id=doc_id)
            doc.ocr_status = 'failed'
            doc.save()
        except Exception:
            pass


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
    Process application: match TOR subjects + work experience to curriculum
    Generate course recommendation and predictions
    """
    application_id = request.data.get('application_id')
    
    try:
        application = Application.objects.get(id=application_id)
        if application.applicant != request.user and request.user.role not in ['evaluator', 'admin']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
    except Application.DoesNotExist:
        return Response({'error': 'Application not found'}, status=status.HTTP_404_NOT_FOUND)
    
    application.status = 'processing'
    application.save()
    
    try:
        run_full_evaluation_sync(str(application.id))
        application.refresh_from_db()
        return Response({
            'message': 'Application processed successfully',
            'application': ApplicationSerializer(application).data
        })
    except Exception as e:
        print(f"Process application error: {str(e)}")
        application.status = 'submitted'
        application.save()
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def run_full_evaluation_sync(application_id):
    """Run full AI evaluation - SYNC version with sync ORM and async_to_sync for Gemini calls"""
    application = Application.objects.get(id=application_id)
    
    # Clear existing matches
    SubjectMatch.objects.filter(application=application).delete()
    
    work_experiences_list = list(WorkExperience.objects.filter(application=application).values(
        'job_title', 'years', 'job_description'
    ))
    work_exp_objects = list(WorkExperience.objects.filter(application=application))
    
    # Step 1: Course Recommendation based on work experience
    if work_experiences_list:
        try:
            recommendation = async_to_sync(gemini_service.recommend_program)(work_experiences_list)
            application.recommended_program = recommendation.get('program', 'BSIT')
            application.recommendation_reasoning = recommendation.get('reasoning', '')
            application.save()
        except Exception as e:
            print(f"Recommendation error: {e}")
    
    # Step 2: Match TOR subjects to curriculum
    tor_subjects = list(TORSubject.objects.filter(application=application))
    curriculum_qs = CurriculumSubject.objects.filter(program=application.program)
    curriculum_list = list(curriculum_qs.values('id', 'code', 'title', 'description', 'units'))
    
    # Convert UUIDs to strings for JSON serialization
    for c in curriculum_list:
        c['id'] = str(c['id'])
    
    for tor_subject in tor_subjects:
        tor_data = {
            'code': tor_subject.code,
            'title': tor_subject.title,
            'units': tor_subject.units
        }
        
        try:
            matches = async_to_sync(gemini_service.match_subject)(tor_data, curriculum_list)
            
            if matches and len(matches) > 0:
                best_match = matches[0]
                curriculum_subj = CurriculumSubject.objects.filter(
                    code=best_match['curriculum_code'],
                    program=application.program
                ).first()
                
                SubjectMatch.objects.create(
                    application=application,
                    tor_subject=tor_subject,
                    curriculum_subject=curriculum_subj,
                    source='tor',
                    confidence=float(best_match.get('confidence', 0)),
                    matching_reason=best_match.get('reasoning', ''),
                    status='pending'
                )
            else:
                SubjectMatch.objects.create(
                    application=application,
                    tor_subject=tor_subject,
                    curriculum_subject=None,
                    source='tor',
                    confidence=0,
                    status='pending',
                    matching_reason='No matching curriculum subject found'
                )
        except Exception as e:
            print(f"TOR matching error for {tor_subject.code}: {e}")
    
    # Step 3: Match work experience to curriculum
    for work_exp in work_exp_objects:
        try:
            exp_data = {
                'job_title': work_exp.job_title,
                'years': work_exp.years,
                'description': work_exp.job_description
            }
            
            work_matches = async_to_sync(gemini_service.match_work_experience)(exp_data, curriculum_list)
            
            for match in (work_matches or [])[:5]:
                curriculum_subj = CurriculumSubject.objects.filter(
                    code=match['curriculum_code'],
                    program=application.program
                ).first()
                
                if curriculum_subj:
                    existing = SubjectMatch.objects.filter(
                        application=application,
                        curriculum_subject=curriculum_subj,
                        source='tor'
                    ).first()
                    
                    if not existing:
                        SubjectMatch.objects.create(
                            application=application,
                            work_experience=work_exp,
                            curriculum_subject=curriculum_subj,
                            source='work_experience',
                            confidence=float(match.get('confidence', 0)),
                            matching_reason=match.get('reasoning', ''),
                            status='pending'
                        )
        except Exception as e:
            print(f"Work matching error: {e}")
    
    # Step 4: Generate prediction
    try:
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

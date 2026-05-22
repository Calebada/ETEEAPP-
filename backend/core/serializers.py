from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import (
    User, Program, CurriculumSubject, Application,
    TORDocument, TORSubject, SubjectMatch, Prediction,
    Report, ChatConversation, ChatMessage,
    WorkExperience, ApplicantDocument
)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'role', 'created_at']
        read_only_fields = ['id', 'created_at']

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, min_length=8)
    
    class Meta:
        model = User
        fields = ['email', 'password', 'full_name', 'role']
    
    def create(self, validated_data):
        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            full_name=validated_data['full_name'],
            role=validated_data.get('role', 'applicant')
        )
        return user

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    
    def validate(self, data):
        email = data.get('email')
        password = data.get('password')
        
        if email and password:
            user = authenticate(email=email, password=password)
            if not user:
                raise serializers.ValidationError('Invalid credentials')
            if not user.is_active:
                raise serializers.ValidationError('User account is disabled')
        else:
            raise serializers.ValidationError('Must include email and password')
        
        data['user'] = user
        return data

class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ['id', 'code', 'name']

class CurriculumSubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = CurriculumSubject
        fields = ['id', 'program', 'code', 'title', 'description', 'units', 'year', 'semester', 'prerequisites']

class WorkExperienceSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkExperience
        fields = [
            'id', 'application', 'company_name', 'job_title', 'years',
            'job_description', 'start_date', 'end_date', 'is_current', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

class ApplicantDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApplicantDocument
        fields = [
            'id', 'application', 'document_type', 'file_name', 'file_path',
            'file_size', 'mime_type', 'ocr_status', 'extracted_text', 'uploaded_at'
        ]
        read_only_fields = ['id', 'uploaded_at', 'ocr_status', 'extracted_text', 'ocr_raw']

class TORDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TORDocument
        fields = ['id', 'application', 'file_path', 'ocr_status', 'ocr_raw', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at', 'ocr_status', 'ocr_raw']

class TORSubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = TORSubject
        fields = ['id', 'application', 'code', 'title', 'grade', 'units', 'raw_text']

class SubjectMatchSerializer(serializers.ModelSerializer):
    tor_subject = TORSubjectSerializer(read_only=True)
    curriculum_subject = CurriculumSubjectSerializer(read_only=True)
    work_experience = WorkExperienceSerializer(read_only=True)
    
    class Meta:
        model = SubjectMatch
        fields = [
            'id', 'application', 'tor_subject', 'curriculum_subject', 'work_experience',
            'source', 'confidence', 'status', 'evaluator_note', 'flagged_by_applicant',
            'applicant_note', 'matching_reason'
        ]

class ApplicationSerializer(serializers.ModelSerializer):
    applicant = UserSerializer(read_only=True)
    program = ProgramSerializer(read_only=True)
    program_id = serializers.UUIDField(write_only=True, required=False)
    work_experiences = WorkExperienceSerializer(many=True, read_only=True)
    documents = ApplicantDocumentSerializer(many=True, read_only=True)
    
    class Meta:
        model = Application
        fields = [
            'id', 'applicant', 'program', 'program_id', 'status',
            'phone', 'address', 'birth_date',
            'recommended_program', 'recommendation_reasoning',
            'created_at', 'finalized_at', 'evaluator_note',
            'work_experiences', 'documents'
        ]
        read_only_fields = ['id', 'created_at', 'finalized_at']

class PredictionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prediction
        fields = ['id', 'application', 'semesters_min', 'semesters_max', 'plan_json', 'created_at']
        read_only_fields = ['id', 'created_at']

class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ['id', 'application', 'file_path', 'generated_at']
        read_only_fields = ['id', 'generated_at']

class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'conversation', 'role', 'content', 'created_at']
        read_only_fields = ['id', 'created_at']

class ChatConversationSerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)
    
    class Meta:
        model = ChatConversation
        fields = ['id', 'user', 'created_at', 'messages']
        read_only_fields = ['id', 'created_at']

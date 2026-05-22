from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone
import uuid

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = [
        ('applicant', 'Applicant'),
        ('evaluator', 'Evaluator'),
        ('admin', 'Administrator'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, max_length=255)
    full_name = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='applicant')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    
    google_id = models.CharField(max_length=255, null=True, blank=True, unique=True)
    
    objects = UserManager()
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']
    
    class Meta:
        db_table = 'users'
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['google_id']),
        ]
    
    def __str__(self):
        return self.email

class Program(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    
    class Meta:
        db_table = 'programs'
    
    def __str__(self):
        return f"{self.code} - {self.name}"

class CurriculumSubject(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='subjects')
    code = models.CharField(max_length=50)
    title = models.CharField(max_length=255)
    description = models.TextField()
    units = models.IntegerField()
    year = models.IntegerField()
    semester = models.IntegerField()
    prerequisites = models.JSONField(default=list, blank=True)
    
    class Meta:
        db_table = 'curriculum_subjects'
        indexes = [
            models.Index(fields=['program', 'code']),
        ]
    
    def __str__(self):
        return f"{self.code} - {self.title}"

class Application(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('processing', 'Processing'),
        ('under_review', 'Under Review'),
        ('finalized', 'Finalized'),
        ('rejected', 'Rejected'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    applicant = models.ForeignKey(User, on_delete=models.CASCADE, related_name='applications')
    program = models.ForeignKey(Program, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    # Personal info
    phone = models.CharField(max_length=50, blank=True)
    address = models.TextField(blank=True)
    birth_date = models.DateField(null=True, blank=True)
    
    # AI Recommendation
    recommended_program = models.CharField(max_length=100, blank=True)
    recommendation_reasoning = models.TextField(blank=True)
    
    created_at = models.DateTimeField(default=timezone.now)
    finalized_at = models.DateTimeField(null=True, blank=True)
    evaluator_note = models.TextField(blank=True)
    
    class Meta:
        db_table = 'applications'
        indexes = [
            models.Index(fields=['applicant', 'status']),
        ]
    
    def __str__(self):
        return f"Application {self.id} - {self.applicant.email}"

class WorkExperience(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='work_experiences')
    company_name = models.CharField(max_length=255)
    job_title = models.CharField(max_length=255)
    years = models.FloatField(default=0)
    job_description = models.TextField()
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_current = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'work_experiences'
    
    def __str__(self):
        return f"{self.job_title} at {self.company_name}"

class ApplicantDocument(models.Model):
    DOCUMENT_TYPES = [
        ('tor', 'Transcript of Records'),
        ('psa', 'PSA Birth Certificate'),
        ('job_description', 'Job Description'),
        ('certificate', 'Certificate'),
        ('resume', 'Resume'),
        ('other', 'Other'),
    ]
    
    OCR_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('not_applicable', 'Not Applicable'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=30, choices=DOCUMENT_TYPES)
    file_name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)
    file_size = models.IntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)
    ocr_status = models.CharField(max_length=20, choices=OCR_STATUS_CHOICES, default='pending')
    ocr_raw = models.TextField(blank=True)
    extracted_text = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'applicant_documents'
        indexes = [
            models.Index(fields=['application', 'document_type']),
        ]
    
    def __str__(self):
        return f"{self.document_type} - {self.file_name}"

# Keep TORDocument for backward compatibility
class TORDocument(models.Model):
    OCR_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='tor_documents')
    file_path = models.CharField(max_length=500)
    ocr_status = models.CharField(max_length=20, choices=OCR_STATUS_CHOICES, default='pending')
    ocr_raw = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'tor_documents'

class TORSubject(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='tor_subjects')
    code = models.CharField(max_length=50)
    title = models.CharField(max_length=255)
    grade = models.CharField(max_length=10)
    units = models.IntegerField()
    raw_text = models.TextField(blank=True)
    
    class Meta:
        db_table = 'tor_subjects'
        indexes = [
            models.Index(fields=['application']),
        ]
    
    def __str__(self):
        return f"{self.code} - {self.title}"

class SubjectMatch(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('overridden', 'Overridden'),
    ]
    
    SOURCE_CHOICES = [
        ('tor', 'TOR'),
        ('work_experience', 'Work Experience'),
        ('certification', 'Certification'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='subject_matches')
    tor_subject = models.ForeignKey(TORSubject, on_delete=models.CASCADE, null=True, blank=True)
    work_experience = models.ForeignKey(WorkExperience, on_delete=models.CASCADE, null=True, blank=True)
    curriculum_subject = models.ForeignKey(CurriculumSubject, on_delete=models.CASCADE, null=True, blank=True)
    source = models.CharField(max_length=30, choices=SOURCE_CHOICES, default='tor')
    confidence = models.FloatField(default=0.0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    evaluator_note = models.TextField(blank=True)
    flagged_by_applicant = models.BooleanField(default=False)
    applicant_note = models.TextField(blank=True)
    matching_reason = models.TextField(blank=True)
    
    class Meta:
        db_table = 'subject_matches'
        indexes = [
            models.Index(fields=['application', 'status']),
            models.Index(fields=['source']),
        ]
    
    def __str__(self):
        return f"Match {self.id} - {self.source} - {self.confidence}%"

class Prediction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='predictions')
    semesters_min = models.IntegerField()
    semesters_max = models.IntegerField()
    plan_json = models.JSONField()
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'predictions'
    
    def __str__(self):
        return f"Prediction {self.id}"

class Report(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name='reports')
    file_path = models.CharField(max_length=500)
    generated_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'reports'
    
    def __str__(self):
        return f"Report {self.id}"

class ChatConversation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='conversations')
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'chat_conversations'
    
    def __str__(self):
        return f"Conversation {self.id}"

class ChatMessage(models.Model):
    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(ChatConversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'chat_messages'
        ordering = ['created_at']
    
    def __str__(self):
        return f"Message {self.id} - {self.role}"

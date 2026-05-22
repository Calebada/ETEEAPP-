import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { applicationApi, documentApi, workExperienceApi, courseApi } from '../lib/api';
import {
  ArrowRight, ArrowLeft, Upload, FileText, Briefcase, CheckCircle2,
  Loader2, X, Sparkles, Plus, FileCheck, AlertCircle, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

export const ApplyPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Step 1: Personal Info
  const [personalInfo, setPersonalInfo] = useState({
    phone: '',
    address: '',
    birth_date: '',
  });
  
  // Step 2: Documents
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  
  // Step 3: Work Experience
  const [workExperiences, setWorkExperiences] = useState([]);
  const [newWorkExp, setNewWorkExp] = useState({
    company_name: '',
    job_title: '',
    years: '',
    job_description: '',
    is_current: false,
  });
  const [recommendation, setRecommendation] = useState(null);
  
  useEffect(() => {
    loadApplication();
  }, [id]);

  const loadApplication = async () => {
    try {
      const response = await applicationApi.get(id);
      setApplication(response.data);
      setPersonalInfo({
        phone: response.data.phone || '',
        address: response.data.address || '',
        birth_date: response.data.birth_date || '',
      });
      setDocuments(response.data.documents || []);
      setWorkExperiences(response.data.work_experiences || []);
    } catch (err) {
      toast.error('Failed to load application');
      navigate('/applicant');
    }
    setLoading(false);
  };

  const savePersonalInfo = async () => {
    try {
      await applicationApi.update(id, personalInfo);
      toast.success('Personal info saved');
      setStep(2);
    } catch (err) {
      toast.error('Failed to save info');
    }
  };

  const handleFileUpload = async (event, documentType) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Max 10MB.');
      return;
    }
    
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        const response = await documentApi.upload({
          application_id: id,
          document_type: documentType,
          file_name: file.name,
          file_data: base64,
          mime_type: file.type,
        });
        
        setDocuments(prev => [...prev, response.data]);
        toast.success(`${documentType.toUpperCase()} uploaded successfully`);
        
        if (documentType === 'tor') {
          toast.info('AI is now analyzing your TOR. This may take a moment.');
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error('Upload failed');
      setUploading(false);
    }
  };

  const addWorkExperience = async () => {
    if (!newWorkExp.company_name || !newWorkExp.job_title || !newWorkExp.job_description) {
      toast.error('Please fill all required fields');
      return;
    }
    
    try {
      const response = await workExperienceApi.add({
        application_id: id,
        ...newWorkExp,
        years: parseFloat(newWorkExp.years) || 0,
      });
      
      setWorkExperiences(prev => [...prev, response.data]);
      setNewWorkExp({
        company_name: '',
        job_title: '',
        years: '',
        job_description: '',
        is_current: false,
      });
      toast.success('Work experience added');
    } catch (err) {
      toast.error('Failed to add work experience');
    }
  };

  const getRecommendation = async () => {
    if (workExperiences.length === 0) {
      toast.error('Add at least one work experience first');
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await courseApi.recommend(workExperiences);
      setRecommendation(response.data);
      toast.success('AI recommendation generated!');
    } catch (err) {
      toast.error('Failed to get recommendation');
    }
    setSubmitting(false);
  };

  const submitApplication = async () => {
    setSubmitting(true);
    try {
      await applicationApi.submit(id);
      toast.success('Application submitted! AI is processing...');
      
      // Trigger AI processing
      try {
        await applicationApi.process(id);
      } catch (e) {
        console.log('Processing started in background');
      }
      
      navigate(`/applicant/evaluation/${id}`);
    } catch (err) {
      toast.error('Failed to submit application');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-maroon" />
        </div>
      </div>
    );
  }

  const torDocs = documents.filter(d => d.document_type === 'tor');
  const psaDocs = documents.filter(d => d.document_type === 'psa');
  const jobDescDocs = documents.filter(d => d.document_type === 'job_description');
  const certDocs = documents.filter(d => d.document_type === 'certificate');

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="apply-page">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => navigate('/applicant')} className="mb-4" data-testid="back-to-dashboard-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-2">ETEEAP Application</h1>
          <p className="text-gray-600">Complete the steps below to submit your application.</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: 'Personal Info' },
              { num: 2, label: 'Upload Documents' },
              { num: 3, label: 'Work Experience' },
              { num: 4, label: 'Review & Submit' },
            ].map((s, i) => (
              <React.Fragment key={s.num}>
                <div className="flex flex-col items-center" data-testid={`step-indicator-${s.num}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold smooth-transition ${
                    step >= s.num ? 'bg-maroon text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > s.num ? <CheckCircle2 className="w-5 h-5" /> : s.num}
                  </div>
                  <div className={`text-xs mt-2 font-medium ${step >= s.num ? 'text-maroon' : 'text-gray-400'}`}>
                    {s.label}
                  </div>
                </div>
                {i < 3 && (
                  <div className={`flex-1 h-0.5 mx-2 ${step > s.num ? 'bg-maroon' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step 1: Personal Info */}
        {step === 1 && (
          <Card className="p-8 border-gray-200" data-testid="step-1-content">
            <h2 className="font-serif text-2xl font-semibold mb-6">Personal Information</h2>
            <div className="space-y-4">
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={personalInfo.phone}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, phone: e.target.value })}
                  placeholder="+63 912 345 6789"
                  data-testid="phone-input"
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={personalInfo.address}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, address: e.target.value })}
                  placeholder="Street, Barangay, City"
                  data-testid="address-input"
                />
              </div>
              <div>
                <Label htmlFor="birth_date">Birth Date</Label>
                <Input
                  id="birth_date"
                  type="date"
                  value={personalInfo.birth_date}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, birth_date: e.target.value })}
                  data-testid="birthdate-input"
                />
              </div>
              <div className="flex justify-end pt-4">
                <Button 
                  onClick={savePersonalInfo}
                  className="bg-maroon hover:bg-maroon-dark text-white"
                  data-testid="step-1-next-btn"
                >
                  Next: Upload Documents
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 2: Documents */}
        {step === 2 && (
          <Card className="p-8 border-gray-200" data-testid="step-2-content">
            <h2 className="font-serif text-2xl font-semibold mb-2">Upload Documents</h2>
            <p className="text-gray-600 mb-6">Upload your supporting documents. All documents are processed by AI.</p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <DocumentUploadCard
                title="Transcript of Records (TOR)"
                description="Required - AI will extract your subjects"
                docType="tor"
                docs={torDocs}
                onUpload={(e) => handleFileUpload(e, 'tor')}
                uploading={uploading}
                primary
              />
              <DocumentUploadCard
                title="PSA Birth Certificate"
                description="Government-issued ID document"
                docType="psa"
                docs={psaDocs}
                onUpload={(e) => handleFileUpload(e, 'psa')}
                uploading={uploading}
              />
              <DocumentUploadCard
                title="Job Description"
                description="Optional - For work experience credit"
                docType="job_description"
                docs={jobDescDocs}
                onUpload={(e) => handleFileUpload(e, 'job_description')}
                uploading={uploading}
              />
              <DocumentUploadCard
                title="Certifications"
                description="Optional - Professional certificates"
                docType="certificate"
                docs={certDocs}
                onUpload={(e) => handleFileUpload(e, 'certificate')}
                uploading={uploading}
              />
            </div>
            
            <div className="flex justify-between pt-6 mt-6 border-t border-gray-200">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="step-2-back-btn">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={() => setStep(3)}
                className="bg-maroon hover:bg-maroon-dark text-white"
                disabled={torDocs.length === 0}
                data-testid="step-2-next-btn"
              >
                Next: Work Experience
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Work Experience */}
        {step === 3 && (
          <Card className="p-8 border-gray-200" data-testid="step-3-content">
            <h2 className="font-serif text-2xl font-semibold mb-2">Work Experience</h2>
            <p className="text-gray-600 mb-6">Add your professional experience to get additional credit through ETEEAP.</p>
            
            {/* Existing experiences */}
            {workExperiences.length > 0 && (
              <div className="space-y-3 mb-6">
                {workExperiences.map((exp, i) => (
                  <Card key={exp.id || i} className="p-4 border-gray-200 bg-gray-50" data-testid={`work-exp-${i}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-maroon/10 flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-5 h-5 text-maroon" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold">{exp.job_title}</div>
                        <div className="text-sm text-gray-600">
                          {exp.company_name} · {exp.years} years
                        </div>
                        <div className="text-sm text-gray-700 mt-2">{exp.job_description}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Add new experience form */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Work Experience
              </h3>
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <div>
                  <Label htmlFor="job_title" className="text-xs">Job Title *</Label>
                  <Input
                    id="job_title"
                    value={newWorkExp.job_title}
                    onChange={(e) => setNewWorkExp({ ...newWorkExp, job_title: e.target.value })}
                    placeholder="e.g., Web Developer"
                    data-testid="job-title-input"
                  />
                </div>
                <div>
                  <Label htmlFor="company_name" className="text-xs">Company *</Label>
                  <Input
                    id="company_name"
                    value={newWorkExp.company_name}
                    onChange={(e) => setNewWorkExp({ ...newWorkExp, company_name: e.target.value })}
                    placeholder="e.g., ABC Tech Corp"
                    data-testid="company-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="years" className="text-xs">Years of Experience *</Label>
                  <Input
                    id="years"
                    type="number"
                    step="0.5"
                    value={newWorkExp.years}
                    onChange={(e) => setNewWorkExp({ ...newWorkExp, years: e.target.value })}
                    placeholder="3"
                    data-testid="years-input"
                  />
                </div>
              </div>
              <div className="mb-3">
                <Label htmlFor="job_description" className="text-xs">Job Description *</Label>
                <Textarea
                  id="job_description"
                  value={newWorkExp.job_description}
                  onChange={(e) => setNewWorkExp({ ...newWorkExp, job_description: e.target.value })}
                  placeholder="Describe your role, responsibilities, and skills used..."
                  rows={3}
                  data-testid="job-description-input"
                />
              </div>
              <Button 
                onClick={addWorkExperience}
                className="bg-maroon hover:bg-maroon-dark text-white"
                data-testid="add-work-exp-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Experience
              </Button>
            </div>

            {/* AI Recommendation */}
            {workExperiences.length > 0 && (
              <div className="mt-6 bg-gradient-to-br from-maroon/5 to-gold/5 p-6 rounded-lg border border-maroon/20">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-maroon" />
                    <h3 className="font-serif font-semibold text-lg">AI Course Recommendation</h3>
                  </div>
                  {!recommendation && (
                    <Button
                      onClick={getRecommendation}
                      disabled={submitting}
                      variant="outline"
                      className="border-maroon text-maroon hover:bg-maroon hover:text-white"
                      data-testid="get-recommendation-btn"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get Recommendation'}
                    </Button>
                  )}
                </div>
                {recommendation && (
                  <div data-testid="recommendation-result">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className="bg-maroon text-white">
                        {recommendation.program}
                      </Badge>
                      <span className="text-sm text-gray-600">
                        {recommendation.confidence}% confidence
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{recommendation.reasoning}</p>
                    {recommendation.career_alignment && (
                      <p className="text-xs text-gray-600 italic">{recommendation.career_alignment}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between pt-6 mt-6 border-t border-gray-200">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="step-3-back-btn">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={() => setStep(4)}
                className="bg-maroon hover:bg-maroon-dark text-white"
                data-testid="step-3-next-btn"
              >
                Next: Review
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 4: Review & Submit */}
        {step === 4 && (
          <Card className="p-8 border-gray-200" data-testid="step-4-content">
            <h2 className="font-serif text-2xl font-semibold mb-2">Review & Submit</h2>
            <p className="text-gray-600 mb-6">Review your application before submitting for AI evaluation.</p>
            
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="font-semibold mb-2 flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-maroon" />
                  Personal Information
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>Phone: {personalInfo.phone || 'Not provided'}</div>
                  <div>Address: {personalInfo.address || 'Not provided'}</div>
                  <div>Birth Date: {personalInfo.birth_date || 'Not provided'}</div>
                </div>
              </div>
              
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="font-semibold mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-maroon" />
                  Documents ({documents.length})
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>TOR: {torDocs.length} uploaded</div>
                  <div>PSA: {psaDocs.length} uploaded</div>
                  <div>Job Description: {jobDescDocs.length} uploaded</div>
                  <div>Certificates: {certDocs.length} uploaded</div>
                </div>
              </div>
              
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="font-semibold mb-2 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-maroon" />
                  Work Experience ({workExperiences.length})
                </div>
                {workExperiences.length === 0 ? (
                  <div className="text-sm text-gray-500">No work experience added</div>
                ) : (
                  <div className="text-sm text-gray-600 space-y-1">
                    {workExperiences.map((exp, i) => (
                      <div key={i}>• {exp.job_title} at {exp.company_name} ({exp.years} years)</div>
                    ))}
                  </div>
                )}
              </div>
              
              {torDocs.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <strong>Warning:</strong> No TOR uploaded. We recommend uploading your transcript for accurate evaluation.
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-6 mt-6 border-t border-gray-200">
              <Button variant="outline" onClick={() => setStep(3)} data-testid="step-4-back-btn">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={submitApplication}
                disabled={submitting}
                className="bg-maroon hover:bg-maroon-dark text-white"
                data-testid="submit-application-btn"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                ) : (
                  <>Submit Application <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
            </div>
          </Card>
        )}
      </div>

      <ChatbotWidget />
    </div>
  );
};

const DocumentUploadCard = ({ title, description, docType, docs, onUpload, uploading, primary }) => (
  <div className={`border rounded-lg p-4 ${primary ? 'border-maroon/30 bg-maroon/5' : 'border-gray-200'}`} data-testid={`upload-card-${docType}`}>
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="font-semibold flex items-center gap-2">
          {primary && <span className="text-maroon text-xs">★</span>}
          {title}
        </div>
        <div className="text-xs text-gray-600 mt-1">{description}</div>
      </div>
      {docs.length > 0 && (
        <Badge className="bg-green-100 text-green-700">
          {docs.length} uploaded
        </Badge>
      )}
    </div>
    
    {docs.length > 0 && (
      <div className="mb-3 space-y-1">
        {docs.map((doc) => (
          <div key={doc.id} className="text-xs bg-white rounded px-2 py-1 flex items-center gap-2">
            <FileText className="w-3 h-3 text-gray-400" />
            <span className="truncate flex-1">{doc.file_name}</span>
            {doc.ocr_status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-600" />}
            {doc.ocr_status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-yellow-600" />}
          </div>
        ))}
      </div>
    )}
    
    <label className="block">
      <input
        type="file"
        accept="image/*,.pdf"
        onChange={onUpload}
        disabled={uploading}
        className="hidden"
        data-testid={`file-input-${docType}`}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full cursor-pointer"
        disabled={uploading}
        asChild
      >
        <span>
          {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Choose File
        </span>
      </Button>
    </label>
  </div>
);

export default ApplyPage;

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { applicationApi, documentApi, workExperienceApi, courseApi, programApi } from '../lib/api';
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
  
  // Personal Info
  const [personalInfo, setPersonalInfo] = useState({
    phone: '',
    address: '',
    birth_date: '',
  });

  const handlePhoneChange = (e) => {
    // allow digits only, limit to 11 characters
    const digits = (e.target.value || '').replace(/\D/g, '').slice(0, 11);
    setPersonalInfo({ ...personalInfo, phone: digits });
  };
  
  // Documents
  const [documents, setDocuments] = useState([]);
  // Track uploading state per document type so only the relevant card shows loading
  const [uploadingByType, setUploadingByType] = useState({});
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [reprocessingDocId, setReprocessingDocId] = useState(null);
  const [prequalificationError, setPrequalificationError] = useState('');
  const [prequalificationCauses, setPrequalificationCauses] = useState([]);

  // Build a short, human-friendly summary from the backend causes
  const buildPrequalificationSummary = (causes) => {
    if (!causes || causes.length === 0) return 'No failures reported.';

    // Prioritize common failure categories
    const lower = causes.map(c => c.toLowerCase());
    if (lower.some(c => c.includes('work experience') || c.includes('it-related'))) {
      return 'No qualifying IT-related work experience found. Add at least one IT role.';
    }
    if (lower.some(c => c.includes('years') || c.includes('2 year') || c.includes('60 units'))) {
      return 'TOR does not show the required two-year (60-unit) equivalent for BSIT.';
    }
    // Fallback: join a couple of causes into a short sentence
    const top = causes.slice(0, 2).join('; ');
    return `Failed requirements: ${top}`;
  };

  // Review scanning/loading states
  const [reviewScanning, setReviewScanning] = useState(false);
  const [scanningTor, setScanningTor] = useState(false);
  const [scanningJob, setScanningJob] = useState(false);
  const pollRef = useRef(null);
  const scanTimeoutRef = useRef(null);

  // Work Experience
  const [workExperiences, setWorkExperiences] = useState([]);
  const [newWorkExp, setNewWorkExp] = useState({
    company_name: '',
    job_title: '',
    years: '',
    job_description: '',
    is_current: false,
  });
  const [editingId, setEditingId] = useState(null);
  const [editingValues, setEditingValues] = useState({
    company_name: '',
    job_title: '',
    years: '',
    job_description: '',
    is_current: false,
  });
  const [recommendation, setRecommendation] = useState(null);

  // Programs for Pick Program step
  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [savingProgram, setSavingProgram] = useState(false);

  useEffect(() => {
    const loadPrograms = async () => {
      try {
        const resp = await programApi.list();
        setPrograms(resp.data || []);
        // set default selected program from application if available
        if (application && application.program) setSelectedProgramId(application.program.id);
      } catch (e) {
        // ignore
      }
    };
    loadPrograms();
  }, [application]);

  useEffect(() => {
    loadApplication();
  }, [id]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
    };
  }, []);

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
    // Validate required personal info fields
    const missing = [];
    if (!personalInfo.phone || !/^\d{11}$/.test(personalInfo.phone)) missing.push('Phone (must be 11 digits)');
    if (!personalInfo.address || personalInfo.address.trim() === '') missing.push('Address');
    if (!personalInfo.birth_date) missing.push('Birth Date');

    if (missing.length > 0) {
      toast.error(`Please fill required fields: ${missing.join(', ')}`);
      return;
    }

    // Require at least one work experience with required fields
    const workMissing = [];
    if (!workExperiences || workExperiences.length === 0) {
      workMissing.push('At least one Work Experience');
    } else {
      workExperiences.forEach((we, i) => {
        const errs = [];
        if (!we.company_name || String(we.company_name).trim() === '') errs.push('Company');
        if (!we.job_title || String(we.job_title).trim() === '') errs.push('Job Title');
        if (we.years === undefined || we.years === null || String(we.years).trim() === '') errs.push('Years');
        if (!we.job_description || String(we.job_description).trim() === '') errs.push('Job Description');
        if (errs.length > 0) workMissing.push(`Work #${i + 1} missing: ${errs.join(', ')}`);
      });
    }

    if (workMissing.length > 0) {
      toast.error(`Work experience required: ${workMissing.join('; ')}`);
      return;
    }

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
    
    setUploadingByType(prev => ({ ...prev, [documentType]: true }));
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
        setPrequalificationError('');
        setPrequalificationCauses([]);
        toast.success(`${documentType.toUpperCase()} uploaded successfully`);
        
        if (documentType === 'tor') {
          toast.info('AI is now analyzing your TOR. This may take a moment.');
        }
        setUploadingByType(prev => ({ ...prev, [documentType]: false }));
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast.error('Upload failed');
      setUploadingByType(prev => ({ ...prev, [documentType]: false }));
    }
  };

  const addWorkExperience = async () => {
    if (!newWorkExp.company_name || !newWorkExp.job_title || !newWorkExp.job_description || !newWorkExp.years) {
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
      setPrequalificationError('');
      setPrequalificationCauses([]);
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

  const removeWorkExperience = async (weId) => {
    try {
      await workExperienceApi.delete(weId);
      setWorkExperiences(prev => prev.filter(w => w.id !== weId));
      toast.success('Work experience removed');
    } catch (err) {
      toast.error('Failed to remove work experience');
    }
  };

  const startEditWorkExperience = (we) => {
    setEditingId(we.id);
    setEditingValues({
      company_name: we.company_name || '',
      job_title: we.job_title || '',
      years: we.years || '',
      job_description: we.job_description || '',
      is_current: !!we.is_current,
    });
  };

  const cancelInlineEdit = () => {
    setEditingId(null);
    setEditingValues({ company_name: '', job_title: '', years: '', job_description: '', is_current: false });
  };

  const saveInlineEdit = async () => {
    if (!editingValues.company_name || !editingValues.job_title || !editingValues.job_description || !editingValues.years) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      const payload = { ...editingValues };
      await workExperienceApi.update(editingId, payload);
      setWorkExperiences(prev => prev.map(w => (w.id === editingId ? { ...w, ...payload } : w)));
      toast.success('Work experience updated');
      cancelInlineEdit();
    } catch (err) {
      toast.error('Failed to save work experience');
    }
  };

  const handleGoToReview = async () => {
    setPrequalificationError('');
    setPrequalificationCauses([]);
    setStep(3);

    const torPending = documents.filter(d => d.document_type === 'tor' && d.ocr_status !== 'completed').length > 0;
    const jobPending = documents.filter(d => d.document_type === 'job_description' && d.ocr_status !== 'completed').length > 0;

    setScanningTor(torPending);
    setScanningJob(jobPending);

    if (torPending || jobPending) {
      setReviewScanning(true);

      // Poll application documents until OCR statuses complete or timeout
      pollRef.current = setInterval(async () => {
        try {
          const resp = await applicationApi.get(id);
          setApplication(resp.data);
          setDocuments(resp.data.documents || []);

          const newTorPending = (resp.data.documents || []).filter(d => d.document_type === 'tor' && d.ocr_status !== 'completed').length > 0;
          const newJobPending = (resp.data.documents || []).filter(d => d.document_type === 'job_description' && d.ocr_status !== 'completed').length > 0;

          setScanningTor(newTorPending);
          setScanningJob(newJobPending);

          if (!newTorPending && !newJobPending) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            if (scanTimeoutRef.current) {
              clearTimeout(scanTimeoutRef.current);
              scanTimeoutRef.current = null;
            }
            setReviewScanning(false);
          }
        } catch (e) {
          console.error('Polling error', e);
        }
      }, 2000);

      // Safety timeout: stop polling after 30s
      scanTimeoutRef.current = setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setReviewScanning(false);
        setScanningTor(false);
        setScanningJob(false);
      }, 30000);
    }
  };

  const getRecommendation = async () => {
    // Build combined work experiences: include manually added ones and parsed job description docs
    const combined = [...workExperiences];
    const jobDocs = (documents || []).filter(d => d.document_type === 'job_description' && d.ocr_status === 'completed');
    for (const doc of jobDocs) {
      if (doc.extracted_text) {
        try {
          const parsed = JSON.parse(doc.extracted_text);
          if (parsed && (parsed.job_title || parsed.job_description)) {
            combined.push({
              job_title: parsed.job_title || parsed.title || '',
              years: parsed.years || parsed.years_experience || 0,
              job_description: parsed.job_description || parsed.description || ''
            });
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }

    if (combined.length === 0) {
      toast.error('Add at least one work experience or upload a Job Description');
      return;
    }

    setSubmitting(true);
    try {
      const response = await courseApi.recommend(combined);
      setRecommendation(response.data);
      toast.success('AI recommendation generated!');
    } catch (err) {
      toast.error('Failed to get recommendation');
    }
    setSubmitting(false);
  };

  const buildRecommendationChoiceReason = (rec, workExps) => {
    if (!rec) return '';
    const parts = [];
    // Use AI reasoning if available
    if (rec.reasoning) parts.push(rec.reasoning);

    // Add a human-friendly tie to the applicant's experience
    if (workExps && workExps.length > 0) {
      const top = workExps[0];
      const title = top.job_title || 'your role';
      const comp = top.company_name ? ` at ${top.company_name}` : '';
      const yrs = top.years ? ` for ${top.years} year${Number(top.years) === 1 ? '' : 's'}` : '';
      parts.push(`Based on your experience as ${title}${comp}${yrs}, this program aligns with your demonstrated skills and career path.`);
    }

    // If AI returned a local fallback marker, be transparent
    if ((rec.reasoning || '').toLowerCase().includes('local fallback')) {
      parts.push('Note: this recommendation used a local fallback and may be less certain.');
    }

    return parts.join(' ');
  };

  const saveSelectedProgram = async () => {
    if (!selectedProgramId) {
      toast.error('Select a program first');
      return;
    }
    setSavingProgram(true);
    try {
      await applicationApi.update(id, { program_id: selectedProgramId });
      const resp = await applicationApi.get(id);
      setApplication(resp.data);
      toast.success('Program selection saved');
    } catch (e) {
      toast.error('Failed to save program');
    }
    setSavingProgram(false);
  };

  const removeDocument = async (documentId) => {
    setDeletingDocId(documentId);
    try {
      await documentApi.delete(documentId);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      setPrequalificationError('');
      setPrequalificationCauses([]);
      toast.success('Document removed');
    } catch (err) {
      toast.error('Failed to remove document');
    }
    setDeletingDocId(null);
  };

  const reprocessDocument = async (documentId) => {
    setReprocessingDocId(documentId);
    try {
      const response = await documentApi.reprocess(documentId);
      setDocuments((prev) => prev.map((doc) => (doc.id === documentId ? response.data : doc)));
      setPrequalificationError('');
      setPrequalificationCauses([]);
      toast.success('Document processed successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to process document');
    }
    setReprocessingDocId(null);
  };

  const previewDocument = async (documentId) => {
    try {
      const resp = await documentApi.preview(documentId);
      // resp.data is a Blob
      const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data]);
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Revoke after some time
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error('Preview error', e);
      toast.error('Failed to preview document');
    }
  };

  const submitApplication = async () => {
    setPrequalificationError('');
    setPrequalificationCauses([]);

    // TOR is optional now; allow submission without a TOR document.
    
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
      const causes = Array.isArray(err.response?.data?.causes) ? err.response.data.causes : [];
      const reason = err.response?.data?.error || err.response?.data?.detail || 'Failed to submit application';
      setPrequalificationError(reason);
      setPrequalificationCauses(causes);
      toast.error(reason);
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
              { num: 3, label: 'Pick Program' },
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
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  value={personalInfo.phone}
                  onChange={handlePhoneChange}
                  data-testid="phone-input"
                />
              </div>
              <div>
                <Label htmlFor="address">Address *</Label>
                <Textarea
                  id="address"
                  value={personalInfo.address}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, address: e.target.value })}
                  placeholder="Street, Barangay, City"
                  data-testid="address-input"
                />
              </div>
              <div>
                <Label htmlFor="birth_date">Birth Date *</Label>
                <Input
                  id="birth_date"
                  type="date"
                  value={personalInfo.birth_date}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, birth_date: e.target.value })}
                  data-testid="birthdate-input"
                />
              </div>

              {/* Work Experience (moved into Personal Info) */}
              <div className="pt-4">
                {workExperiences.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {workExperiences.map((exp, i) => (
                      <Card key={exp.id || i} className="p-4 border-gray-200 bg-gray-50" data-testid={`work-exp-${i}`}>
                        {editingId === exp.id ? (
                          <div className="space-y-3">
                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs">Job Title *</Label>
                                <Input value={editingValues.job_title} onChange={(e) => setEditingValues({ ...editingValues, job_title: e.target.value })} />
                              </div>
                              <div>
                                <Label className="text-xs">Company *</Label>
                                <Input value={editingValues.company_name} onChange={(e) => setEditingValues({ ...editingValues, company_name: e.target.value })} />
                              </div>
                              <div>
                                <Label className="text-xs">Years *</Label>
                                <Input type="number" step="0.5" value={editingValues.years} onChange={(e) => setEditingValues({ ...editingValues, years: e.target.value })} />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Job Description *</Label>
                              <Textarea value={editingValues.job_description} onChange={(e) => setEditingValues({ ...editingValues, job_description: e.target.value })} rows={3} />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button variant="outline" onClick={cancelInlineEdit}>Cancel</Button>
                              <Button onClick={saveInlineEdit} className="bg-maroon text-white">Save</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-maroon/10 flex items-center justify-center flex-shrink-0">
                              <Briefcase className="w-5 h-5 text-maroon" />
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold">{exp.job_title}</div>
                              <div className="text-sm text-gray-600">{exp.company_name} · {exp.years} years</div>
                              <div className="text-sm text-gray-700 mt-2">{exp.job_description}</div>
                            </div>
                            <div className="flex flex-col gap-2 ml-4">
                              <Button variant="ghost" size="sm" onClick={() => startEditWorkExperience(exp)} data-testid={`edit-work-exp-${exp.id || i}`}>
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-600" onClick={() => removeWorkExperience(exp.id)} data-testid={`remove-work-exp-${exp.id || i}`}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
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
                  <div className="flex items-center gap-3">
                    <Button onClick={addWorkExperience} className="bg-maroon hover:bg-maroon-dark text-white" data-testid="add-work-exp-btn">
                      <Plus className="w-4 h-4 mr-2" /> Add Experience
                    </Button>
                    {/* Recommendation moved to Pick Program step */}
                  </div>
                  {recommendation && (
                    <div className="mt-4" data-testid="recommendation-result">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className="bg-maroon text-white">{recommendation.program}</Badge>
                        <span className="text-sm text-gray-600">{recommendation.confidence}% confidence</span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{recommendation.reasoning}</p>
                      {recommendation.career_alignment && (
                        <p className="text-xs text-gray-600 italic">{recommendation.career_alignment}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={savePersonalInfo} className="bg-maroon hover:bg-maroon-dark text-white" data-testid="step-1-next-btn">
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
                description="AI will extract your subjects"
                docType="tor"
                docs={torDocs}
                onUpload={(e) => handleFileUpload(e, 'tor')}
                onRemove={removeDocument}
                onReprocess={reprocessDocument}
                onPreview={previewDocument}
                uploading={!!uploadingByType['tor']}
                deletingDocId={deletingDocId}
                reprocessingDocId={reprocessingDocId}
                primary
              />
              <DocumentUploadCard
                title="PSA Birth Certificate"
                description="Government-issued ID document"
                docType="psa"
                docs={psaDocs}
                onUpload={(e) => handleFileUpload(e, 'psa')}
                onRemove={removeDocument}
                onReprocess={reprocessDocument}
                onPreview={previewDocument}
                uploading={!!uploadingByType['psa']}
                deletingDocId={deletingDocId}
                reprocessingDocId={reprocessingDocId}
              />
              <DocumentUploadCard
                title="Job Description"
                description="Optional - For work experience credit"
                docType="job_description"
                docs={jobDescDocs}
                onUpload={(e) => handleFileUpload(e, 'job_description')}
                onRemove={removeDocument}
                onReprocess={reprocessDocument}
                onPreview={previewDocument}
                uploading={!!uploadingByType['job_description']}
                deletingDocId={deletingDocId}
                reprocessingDocId={reprocessingDocId}
              />
            </div>
            
            {/* TOR warning removed per request - TOR is no longer required before proceeding. */}
            
            <div className="flex justify-between pt-6 mt-6 border-t border-gray-200">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="step-2-back-btn">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={handleGoToReview}
                className="bg-maroon hover:bg-maroon-dark text-white"
                data-testid="step-2-next-btn"
              >
                Next: Review
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Pick Program */}
        {step === 3 && (
          <Card className="p-8 border-gray-200" data-testid="step-3-content">
            <h2 className="font-serif text-2xl font-semibold mb-2">Pick Program</h2>
            <p className="text-gray-600 mb-4">The AI system can suggest the best program for you based on your Job Description and Work Experience. You can accept the suggestion or choose any program.</p>

            <div className="space-y-4">
              <div>
                {!recommendation && (
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={getRecommendation}
                      disabled={submitting}
                      className="bg-maroon hover:bg-maroon-dark text-white"
                      data-testid="analyze-btn"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Analyze Job Description & Work Experience'}
                    </Button>
                    <span className="text-sm text-gray-500">(Optional) Get AI suggestions</span>
                  </div>
                )}

                {recommendation && (
                  <div className="mt-3 p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className="bg-maroon text-white">{recommendation.program}</Badge>
                      <span className="text-sm text-gray-600">{recommendation.confidence}% confidence</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{recommendation.reasoning}</p>
                    {recommendation.alternatives && recommendation.alternatives.length > 0 && (
                      <div className="text-xs text-gray-600">
                        Alternatives: {recommendation.alternatives.join(', ')}
                      </div>
                    )}
                    {/* Explain why the applicant might pick this program */}
                    <div className="mt-3 bg-gray-50 p-3 rounded">
                      <div className="text-sm font-medium">Best Program based on your work experience</div>
                      <div className="text-sm text-gray-700 mt-1">{buildRecommendationChoiceReason(recommendation, workExperiences)}</div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Available Programs</div>
                <div className="space-y-2">
                  {programs.map((p) => (
                    <label key={p.id} className="flex items-center gap-3 p-3 border rounded hover:bg-gray-50">
                      <input
                        type="radio"
                        name="program"
                        value={p.id}
                        checked={selectedProgramId === p.id}
                        onChange={() => setSelectedProgramId(p.id)}
                        className="form-radio"
                      />
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-gray-600">{p.description || ''}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 justify-end">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={saveSelectedProgram} disabled={savingProgram} className="bg-maroon text-white">
                  {savingProgram ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Program'}
                </Button>
                <Button onClick={() => setStep(4)} className="bg-maroon hover:bg-maroon-dark text-white">Next: Review</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 4: Review & Submit */}
        {step === 4 && (
          <Card className="p-8 border-gray-200" data-testid="step-3-content">
            <h2 className="font-serif text-2xl font-semibold mb-2">Review & Submit</h2>
            <p className="text-gray-600 mb-6">Review your application before submitting for AI evaluation.</p>
            {reviewScanning && (
              <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-3 w-80">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-maroon" />
                    <div className="font-medium">AI scanning TOR</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-maroon" />
                    <div className="font-medium">Job description scanning</div>
                  </div>
                  <div className="text-sm text-gray-600 mt-2">This may take a few seconds.</div>
                </div>
              </div>
            )}
            
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
                <div className="text-sm text-gray-600 space-y-2">
                  {documents.length === 0 ? (
                    <div>No documents uploaded</div>
                  ) : (
                    documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between gap-3 bg-white rounded p-2">
                        <div className="flex-1 text-sm text-gray-800 truncate">{doc.document_type.toUpperCase()}: {doc.file_name}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{doc.ocr_status === 'completed' ? 'Processed' : doc.ocr_status}</span>
                          <Button variant="ghost" size="sm" onClick={() => previewDocument(doc.id)} data-testid={`review-preview-doc-${doc.id}`}>
                            Preview
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="font-semibold mb-2 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-maroon" />
                  Work Experience ({workExperiences.length}) *
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
              
              {/* TOR missing warning removed — TOR is optional for submission now. */}

              {prequalificationError && (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 flex flex-col gap-3" data-testid="prequalification-error">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-800">
                      <strong>Not Qualified Yet:</strong> {prequalificationError}
                    </div>
                  </div>

                  {/* Short summary line */}
                  <div className="px-2">
                    <div className="text-sm font-medium text-red-800">Summary:</div>
                    <div className="text-sm text-gray-700 mt-1" data-testid="prequalification-summary">
                      {buildPrequalificationSummary(prequalificationCauses)}
                    </div>
                  </div>

                  {/* Detailed causes list */}
                  {prequalificationCauses.length > 0 && (
                    <div className="px-2">
                      <div className="text-xs text-gray-600 font-semibold mt-1">Details</div>
                      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-gray-800">
                        {prequalificationCauses.map((cause, idx) => (
                          <li key={`${idx}-${cause}`}>{cause}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-6 mt-6 border-t border-gray-200">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="step-3-back-btn">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={submitApplication}
                disabled={submitting || torDocs.length === 0}
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

  const DocumentUploadCard = ({ title, description, docType, docs, onUpload, onRemove, onReprocess, onPreview, uploading, deletingDocId, reprocessingDocId, primary, required }) => (
  <div className={`border rounded-lg p-4 ${primary ? 'border-maroon/30 bg-maroon/5' : 'border-gray-200'} ${required && docs.length === 0 ? 'border-red-300 bg-red-50/30' : ''}`} data-testid={`upload-card-${docType}`}>
    <div className="flex items-start justify-between mb-3">
      <div>
        <div className="font-semibold flex items-center gap-2">
          {primary && <span className="text-maroon text-xs">★</span>}
          {title}
        </div>
        <div className="text-xs text-gray-600 mt-1">{description}</div>
      </div>
      {docs.length > 0 ? (
        <Badge className="bg-green-100 text-green-700">
          {docs.length} uploaded
        </Badge>
      ) : required ? (
        <Badge className="bg-red-100 text-red-700">Required</Badge>
      ) : null}
    </div>
    
    {docs.length > 0 && (
      <div className="mb-3 space-y-1">
        {docs.map((doc) => (
          <div key={doc.id} className="text-xs bg-white rounded px-2 py-1 flex items-center gap-2">
            <FileText className="w-3 h-3 text-gray-400" />
            <span className="truncate flex-1">{doc.file_name}</span>
            {doc.ocr_status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-600" />}
            {doc.ocr_status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-yellow-600" />}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-red-600 hover:text-red-700"
              onClick={() => onRemove(doc.id)}
              disabled={deletingDocId === doc.id || uploading}
              data-testid={`remove-doc-${doc.id}`}
            >
              {deletingDocId === doc.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-6 px-2 text-xs text-gray-700 hover:text-gray-800"
              onClick={() => onPreview && onPreview(doc.id)}
              disabled={uploading}
              data-testid={`preview-doc-${doc.id}`}
            >
              Preview
            </Button>
            {/* Re-scan button removed per request */}
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

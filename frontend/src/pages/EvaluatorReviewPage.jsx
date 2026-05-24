import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { applicationApi, subjectMatchApi, predictionApi, programApi } from '../lib/api';
import {
  ArrowLeft, Loader2, FileText, Briefcase, CheckCircle2, XCircle,
  AlertCircle, BookOpen, User, Calendar, MapPin, Phone, Sparkles, Flag, Eye
} from 'lucide-react';
import { toast } from 'sonner';

export const EvaluatorReviewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [matches, setMatches] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [curriculum, setCurriculum] = useState([]);
  const [appSummary, setAppSummary] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [evaluatorNote, setEvaluatorNote] = useState('');
  const [actioning, setActioning] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewFocus, setPreviewFocus] = useState(null);
  const [torEvidenceMatch, setTorEvidenceMatch] = useState(null);

  const openDocumentPreview = (doc, focus = null) => {
    setPreviewDoc(doc);
    setPreviewFocus(focus);
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [appResp, matchesResp, predResp] = await Promise.all([
        applicationApi.get(id),
        subjectMatchApi.list(id),
        predictionApi.get(id).catch(() => ({ data: null }))
      ]);
      setApplication(appResp.data);
      setMatches(matchesResp.data);
      setPrediction(predResp.data);
      setEvaluatorNote(appResp.data.evaluator_note || '');
      // load curriculum for the application's program so evaluator can assign subjects
      try {
        if (appResp.data && appResp.data.program && appResp.data.program.id) {
          const curResp = await programApi.curriculum(appResp.data.program.id);
          setCurriculum(curResp.data || []);
        }
        // load generated applicant summary (if available)
        try {
          const sumResp = await applicationApi.summary(id);
          setAppSummary(sumResp.data || null);
        } catch (e) {
          setAppSummary(null);
        }
      } catch (e) { setCurriculum([]); }
    } catch (err) {
      toast.error('Failed to load application');
    }
    setLoading(false);
  };

  const handleApproveMatch = async (matchId) => {
    try {
      await subjectMatchApi.approve(matchId, '');
      toast.success('Match approved');
      loadData();
    } catch (err) {
      toast.error('Failed');
    }
  };

  const handleRejectMatch = async (matchId) => {
    try {
      await subjectMatchApi.reject(matchId, '');
      toast.success('Match rejected');
      loadData();
    } catch (err) {
      toast.error('Failed');
    }
  };

  const handleFinalize = async () => {
    setActioning(true);
    try {
      await applicationApi.finalize(id, { evaluator_note: evaluatorNote });
      toast.success('Application finalized!');
      navigate('/evaluator');
    } catch (err) {
      toast.error('Failed to finalize');
    }
    setActioning(false);
  };

  const handleReject = async () => {
    if (!evaluatorNote) {
      toast.error('Please provide a note explaining the rejection');
      return;
    }
    setActioning(true);
    try {
      await applicationApi.reject(id, { evaluator_note: evaluatorNote });
      toast.success('Application rejected');
      navigate('/evaluator');
    } catch (err) {
      toast.error('Failed');
    }
    setActioning(false);
  };

  const handleReopen = async () => {
    setActioning(true);
    try {
      await applicationApi.reopen(id);
      toast.success('Application moved to Under Review');
      loadData();
    } catch (err) {
      toast.error('Failed to reopen application');
    }
    setActioning(false);
  };

  const handleRunAI = async () => {
    setActioning(true);
    toast.info('Running AI evaluation - this may take 30-60 seconds...');
    try {
      await applicationApi.process(id);
      toast.success('AI evaluation complete!');
      loadData();
    } catch (err) {
      toast.error('AI evaluation failed: ' + (err.response?.data?.error || err.message));
    }
    setActioning(false);
  };

  const loadApplicantSummary = async () => {
    setSummaryLoading(true);
    try {
      const resp = await applicationApi.summary(id);
      setAppSummary(resp.data || null);
      setSummaryOpen(true);
    } catch (err) {
      toast.error('Failed to load applicant summary');
    }
    setSummaryLoading(false);
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 85) return 'bg-green-100 text-green-700 border-green-300';
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
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

  const torMatches = matches.filter(m => m.source === 'tor');
  const workMatches = matches.filter(m => m.source === 'work_experience');
  const isFinalized = application?.status === 'finalized' || application?.status === 'rejected';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="evaluator-review-page">
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/evaluator')} className="mb-4" data-testid="back-to-queue-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Queue
          </Button>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-serif text-3xl font-bold mb-1">{application?.applicant?.full_name}</h1>
              <p className="text-gray-600">
                Application #{application?.id?.slice(0, 8)} · {application?.applicant?.email}
              </p>
            </div>
            <Badge className="text-base px-3 py-1" variant="outline">
              {application?.status?.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Applicant Info & Documents */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="p-5 border-gray-200">
              <h3 className="font-serif font-semibold mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-maroon" />
                Personal Info
              </h3>
              <div className="space-y-2 text-sm">
                {application?.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-gray-400" />
                    <span>{application.phone}</span>
                  </div>
                )}
                {application?.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3 h-3 text-gray-400 mt-0.5" />
                    <span>{application.address}</span>
                  </div>
                )}
                {application?.birth_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span>{new Date(application.birth_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </Card>

            {appSummary && (
              <Card className="p-5 border-gray-200">
                <h3 className="font-serif font-semibold mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-maroon" />
                  Applicant Summary
                </h3>
                <div className="text-sm text-gray-700 mb-2">{appSummary.summary}</div>
                {appSummary.highlights && appSummary.highlights.length > 0 && (
                  <ul className="text-xs list-disc list-inside text-gray-600">
                    {appSummary.highlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                )}
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={loadApplicantSummary} disabled={summaryLoading}>
                    {summaryLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Regenerate Summary
                  </Button>
                </div>
              </Card>
            )}

            {/* AI Recommendation removed for Department Chair view */}

            <Card className="p-5 border-gray-200">
              <h3 className="font-serif font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-maroon" />
                Documents ({application?.documents?.length || 0})
              </h3>
              <div className="space-y-2">
                {application?.documents?.length > 0 ? (
                  application.documents.map((doc) => (
                    <button 
                      key={doc.id} 
                      onClick={() => openDocumentPreview(doc)}
                      className="w-full text-left text-xs bg-gray-50 hover:bg-maroon/5 hover:border-maroon/30 border border-transparent rounded p-2 smooth-transition group" 
                      data-testid={`doc-preview-${doc.id}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs capitalize">
                          {doc.document_type?.replace('_', ' ')}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {doc.ocr_status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                          {doc.ocr_status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-yellow-600" />}
                          {doc.ocr_status === 'failed' && <XCircle className="w-3 h-3 text-red-600" />}
                          <div className="text-xs text-gray-500 group-hover:text-maroon flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            <span>Preview</span>
                          </div>
                        </div>
                      </div>
                      <div className="truncate font-medium text-gray-800">{doc.file_name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {Math.round((doc.file_size || 0) / 1024)} KB · Click to preview
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">No documents</p>
                )}
              </div>
            </Card>

            <Card className="p-5 border-gray-200">
              <h3 className="font-serif font-semibold mb-3 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-maroon" />
                Work Experience ({application?.work_experiences?.length || 0})
              </h3>
              <div className="space-y-3">
                {application?.work_experiences?.length > 0 ? (
                  application.work_experiences.map((exp) => (
                    <div key={exp.id} className="text-sm" data-testid={`work-exp-${exp.id}`}>
                      <div className="font-semibold">{exp.job_title}</div>
                      <div className="text-xs text-gray-600">{exp.company_name} · {exp.years} years</div>
                      <div className="text-xs text-gray-700 mt-1">{exp.job_description}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">No work experience</p>
                )}
              </div>
            </Card>
          </div>

          {/* Right: Matches */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5 border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif font-semibold text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-maroon" />
                  Subject Matches ({matches.length})
                </h3>
                {!isFinalized && (
                  <Button 
                    onClick={handleRunAI}
                    disabled={actioning}
                    size="sm"
                    variant="outline"
                    className="border-maroon text-maroon hover:bg-maroon hover:text-white"
                    data-testid="run-ai-eval-btn-top"
                  >
                    {actioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {matches.length === 0 ? 'Run AI Evaluation' : 'Re-run AI Evaluation'}
                  </Button>
                )}
              </div>
              
              <Tabs defaultValue="all">
                <TabsList className="mb-4">
                  <TabsTrigger value="all">All ({matches.length})</TabsTrigger>
                  <TabsTrigger value="tor">From TOR ({torMatches.length})</TabsTrigger>
                  <TabsTrigger value="work">From Work ({workMatches.length})</TabsTrigger>
                </TabsList>
                
                <TabsContent value="all">
                  <MatchesList
                    matches={matches}
                    onApprove={handleApproveMatch}
                    onReject={handleRejectMatch}
                    getConfidenceColor={getConfidenceColor}
                    disabled={isFinalized}
                    curriculum={curriculum}
                    documents={application?.documents || []}
                    onOpenTorEvidence={setTorEvidenceMatch}
                  />
                </TabsContent>
                <TabsContent value="tor">
                  <MatchesList
                    matches={torMatches}
                    onApprove={handleApproveMatch}
                    onReject={handleRejectMatch}
                    getConfidenceColor={getConfidenceColor}
                    disabled={isFinalized}
                    curriculum={curriculum}
                    documents={application?.documents || []}
                    onOpenTorEvidence={setTorEvidenceMatch}
                  />
                </TabsContent>
                <TabsContent value="work">
                  <MatchesList
                    matches={workMatches}
                    onApprove={handleApproveMatch}
                    onReject={handleRejectMatch}
                    getConfidenceColor={getConfidenceColor}
                    disabled={isFinalized}
                    curriculum={curriculum}
                    documents={application?.documents || []}
                    onOpenTorEvidence={setTorEvidenceMatch}
                  />
                </TabsContent>
              </Tabs>
            </Card>

            {/* Action Panel */}
            {!isFinalized && (
              <Card className="p-5 border-gray-200">
                <h3 className="font-serif font-semibold mb-3">Department Chair Decision</h3>
                <Textarea
                  placeholder="Add notes for the applicant..."
                  value={evaluatorNote}
                  onChange={(e) => setEvaluatorNote(e.target.value)}
                  rows={3}
                  className="mb-4"
                  data-testid="evaluator-note-input"
                />
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    onClick={handleFinalize}
                    disabled={actioning}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    data-testid="finalize-btn"
                  >
                    {actioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Finalize Accreditation
                  </Button>
                  <Button 
                    onClick={handleReject}
                    disabled={actioning}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    data-testid="reject-btn"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </div>
              </Card>
            )}

            {application?.status === 'finalized' && (
              <Card className="p-5 border-gray-200">
                <h3 className="font-serif font-semibold mb-3">Reopen Application</h3>
                <p className="text-sm text-gray-600 mb-3">Move this finalized application back to Under Review.</p>
                <div className="flex gap-2">
                  <Button onClick={handleReopen} disabled={actioning} className="bg-maroon text-white" data-testid="reopen-btn">
                    {actioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Move to Under Review'}
                  </Button>
                </div>
              </Card>
            )}

            {isFinalized && application?.evaluator_note && (
              <Card className="p-5 border-gray-200 bg-gray-50">
                <h3 className="font-serif font-semibold mb-2">Department Chair Note</h3>
                <p className="text-sm text-gray-700">{application.evaluator_note}</p>
              </Card>
            )}
          </div>
        </div>
      </div>

      <ChatbotWidget />
      <DocumentPreviewModal 
        document={previewDoc} 
        open={!!previewDoc} 
        focusSubject={previewFocus}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewFocus(null);
        }} 
      />

      <Dialog open={!!torEvidenceMatch} onOpenChange={(open) => !open && setTorEvidenceMatch(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto" data-testid="tor-evidence-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-maroon" />
              TOR Subject Evidence
            </DialogTitle>
          </DialogHeader>

          {torEvidenceMatch?.match && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Matched Subject</div>
                <div className="text-sm text-gray-900">
                  {torEvidenceMatch.match.tor_subject?.code} - {torEvidenceMatch.match.tor_subject?.title}
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  Applicant Grade: <span className="font-semibold text-gray-800">{torEvidenceMatch.match.tor_subject?.grade || 'N/A'}</span>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">TOR Document Proof</div>
                <div className="space-y-3">
                  {torEvidenceMatch.evidence && torEvidenceMatch.evidence.length > 0 ? (
                    torEvidenceMatch.evidence.map((item) => (
                      <div key={item.doc.id} className="rounded-md border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{item.doc.file_name}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              OCR: {item.doc.ocr_status || 'unknown'}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDocumentPreview(item.doc, {
                              code: torEvidenceMatch.match?.tor_subject?.code || '',
                              title: torEvidenceMatch.match?.tor_subject?.title || '',
                              grade: torEvidenceMatch.match?.tor_subject?.grade || '',
                            })}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Preview
                          </Button>
                        </div>

                        {item.subjectEvidence && (
                          <div className="mt-3 text-xs bg-maroon/5 border border-maroon/20 rounded p-2">
                            <div className="font-semibold text-maroon mb-1">Extracted Subject Row</div>
                            <div>Code: {item.subjectEvidence.code || 'N/A'}</div>
                            <div>Title: {item.subjectEvidence.title || 'N/A'}</div>
                            <div>Grade: {item.subjectEvidence.grade || 'N/A'}</div>
                            <div>Units: {item.subjectEvidence.units ?? 'N/A'}</div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-500">No parsed TOR evidence found for this subject yet.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto" data-testid="applicant-summary-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-maroon" />
              Applicant Summary
            </DialogTitle>
          </DialogHeader>

          {appSummary ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Summary</div>
                <p className="text-sm text-gray-800 leading-6">{appSummary.summary}</p>
              </div>

              {appSummary.highlights && appSummary.highlights.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <div className="text-sm font-semibold text-gray-700 mb-2">Highlights</div>
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                    {appSummary.highlights.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {typeof appSummary.confidence === 'number' && (
                <div className="text-xs text-gray-500">Confidence: {appSummary.confidence}%</div>
              )}

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Document Evidence</div>
                <div className="space-y-2">
                  {application?.documents?.length > 0 ? (
                    application.documents.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => {
                          openDocumentPreview(doc);
                          // keep summary open while previewing
                        }}
                        className="w-full text-left rounded-md border border-gray-200 px-3 py-2 hover:border-maroon/40 hover:bg-maroon/5 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">
                              {doc.file_name}
                            </div>
                            <div className="text-xs text-gray-500 capitalize">
                              {doc.document_type?.replace('_', ' ')}
                            </div>
                          </div>
                          <span className="text-xs text-maroon font-medium">Preview</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-sm text-gray-500">No uploaded documents available.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">No summary available.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MatchesList = ({ matches, onApprove, onReject, getConfidenceColor, disabled, curriculum, documents, onOpenTorEvidence }) => {
  const normalize = (val) => (val || '').toString().toUpperCase().replace(/\s|-/g, '');

  const parseExtractedSubjects = (doc) => {
    if (!doc?.extracted_text) return [];
    try {
      const parsed = JSON.parse(doc.extracted_text);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  };

  const buildTorEvidence = (match, documents) => {
    const torDocs = (documents || []).filter((d) => d.document_type === 'tor');
    const targetCode = normalize(match?.tor_subject?.code);
    const targetTitle = (match?.tor_subject?.title || '').toLowerCase().trim();
    const evidence = [];

    for (const doc of torDocs) {
      const rows = parseExtractedSubjects(doc);
      let subjectEvidence = null;

      for (const row of rows) {
        const codeMatch = targetCode && normalize(row?.code) === targetCode;
        const rowTitle = (row?.title || '').toLowerCase().trim();
        const titleMatch = !!targetTitle && !!rowTitle && (rowTitle.includes(targetTitle) || targetTitle.includes(rowTitle));
        if (codeMatch || titleMatch) {
          subjectEvidence = row;
          break;
        }
      }

      if (subjectEvidence) {
        evidence.push({ doc, subjectEvidence });
      }
    }

    if (evidence.length === 0 && torDocs.length > 0) {
      return torDocs.map((doc) => ({ doc, subjectEvidence: null }));
    }

    return evidence;
  };

  if (matches.length === 0) {
    return <p className="text-sm text-gray-500 py-4">No matches in this category</p>;
  }
  
  return (
    <div className="space-y-2">
      {matches.map((match) => (
        <div key={match.id} className="border border-gray-200 rounded-lg p-3" data-testid={`review-match-${match.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge className={getConfidenceColor(match.confidence)}>
                  {match.confidence.toFixed(0)}%
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {match.source === 'tor' ? (
                    <><FileText className="w-3 h-3 mr-1" /> TOR</>
                  ) : (
                    <><Briefcase className="w-3 h-3 mr-1" /> Work</>
                  )}
                </Badge>
                {match.flagged_by_applicant && (
                  <Badge className="bg-orange-100 text-orange-700 text-xs">
                    <Flag className="w-3 h-3 mr-1" />
                    Flagged
                  </Badge>
                )}
                {match.status !== 'pending' && (
                  <Badge className={match.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {match.status}
                  </Badge>
                )}
              </div>
              {match.curriculum_subject ? (
                <div className="text-sm">
                  <span className="font-semibold">{match.curriculum_subject.code}</span>
                  <span className="ml-2">{match.curriculum_subject.title}</span>
                  <span className="ml-2 text-xs text-gray-500">({match.curriculum_subject.units}u)</span>
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  <Badge className="bg-red-50 text-red-700 text-xs">Not credited</Badge>
                </div>
              )}
              {match.tor_subject && (
                <div className="text-xs text-gray-500 mt-1">
                  ← TOR: {match.tor_subject.code} - {match.tor_subject.title}
                  {match.tor_subject.grade ? ` (Grade: ${match.tor_subject.grade})` : ''}
                </div>
              )}
              {match.source === 'tor' && match.tor_subject && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      const evidence = buildTorEvidence(match, documents || []);
                      if (onOpenTorEvidence) {
                        onOpenTorEvidence({ match, evidence });
                      }
                    }}
                    data-testid={`tor-evidence-${match.id}`}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Preview TOR Evidence
                  </Button>
                </div>
              )}
              {match.work_experience && (
                <div className="text-xs text-gray-500 mt-1">
                  ← {match.work_experience.job_title} ({match.work_experience.years}y)
                </div>
              )}
              {match.matching_reason && (
                <div className="text-xs text-gray-600 italic mt-1">{match.matching_reason}</div>
              )}
              {match.applicant_note && (
                <div className="text-xs bg-orange-50 rounded p-1.5 mt-2">
                  <strong>Applicant note:</strong> {match.applicant_note}
                </div>
              )}
            </div>
            
            {!disabled && match.status === 'pending' && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-green-600 hover:bg-green-50 h-7 text-xs"
                    onClick={() => onApprove(match.id)}
                    data-testid={`approve-match-${match.id}`}
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Approve
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-red-600 hover:bg-red-50 h-7 text-xs"
                    onClick={() => onReject(match.id)}
                    data-testid={`reject-match-${match.id}`}
                  >
                    <XCircle className="w-3 h-3 mr-1" />
                    Reject
                  </Button>
                </div>

                {/* If unmatched, allow assigning a curriculum subject and approving in one action */}
                {!match.curriculum_subject && curriculum && curriculum.length > 0 && (
                  <AssignAndApprove match={match} curriculum={curriculum} onApprove={onApprove} />
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const AssignAndApprove = ({ match, curriculum, onApprove }) => {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAssign = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      // call override then approve
      await subjectMatchApi.override(match.id, { curriculum_subject_id: selected, note: 'Assigned by chair' });
      await subjectMatchApi.approve(match.id, 'Approved after manual assignment');
      onApprove(match.id);
    } catch (e) {
      // fallback: just call onApprove to refresh
    }
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <select className="border px-2 py-1 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">Assign curriculum subject</option>
        {curriculum.map(c => (
          <option key={c.id} value={c.id}>{c.code} - {c.title} ({c.units}u)</option>
        ))}
      </select>
      <Button size="sm" onClick={handleAssign} disabled={!selected || busy} className="text-xs">
        {busy ? 'Assigning...' : 'Assign & Approve'}
      </Button>
    </div>
  );
};

export default EvaluatorReviewPage;

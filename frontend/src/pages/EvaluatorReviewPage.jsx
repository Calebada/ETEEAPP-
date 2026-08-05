import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { applicationApi, subjectMatchApi, predictionApi, programApi } from '../lib/api';
import {
  ArrowLeft, Loader2, FileText, Briefcase, CheckCircle2, XCircle,
  AlertCircle, BookOpen, User, Calendar, MapPin, Phone, Sparkles, Flag, Eye, Download, Home
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

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
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectMatchId, setRejectMatchId] = useState(null);
  const [finalizationComplete, setFinalizationComplete] = useState(false);
  const approvedTableRef = useRef(null);

  const downloadApprovedAsPDF = () => {
    try {
      const approved = matches.filter(m => m.status === 'approved');
      if (approved.length === 0) {
        toast.error('No approved subjects to download');
        return;
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      let yPosition = margin + 10;

      // Add title
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('Approved Subjects Report', margin, yPosition);
      yPosition += 10;

      // Add metadata
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Application ID: ${application?.id || 'N/A'}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Applicant: ${application?.applicant?.first_name} ${application?.applicant?.last_name}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPosition);
      yPosition += 10;

      // Table headers
      const colWidths = [25, 65, 20, 40, 25];
      const headers = ['Code', 'Title', 'Units', 'Source', 'Confidence'];
      
      // Draw header row
      doc.setFillColor(37, 99, 235);
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);

      let xPosition = margin;
      headers.forEach((header, idx) => {
        doc.rect(xPosition, yPosition - 5, colWidths[idx], 8, 'F');
        doc.text(header, xPosition + 1, yPosition, { maxWidth: colWidths[idx] - 2 });
        xPosition += colWidths[idx];
      });

      yPosition += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');

      // Draw data rows
      approved.forEach((match, idx) => {
        if (yPosition > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          yPosition = margin;
        }

        // Alternating row colors
        if (idx % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, yPosition - 5, pageWidth - 2 * margin, 8, 'F');
        }

        const rowData = [
          match.curriculum_subject?.code || 'N/A',
          match.curriculum_subject?.title || 'N/A',
          match.curriculum_subject?.units || 0,
          match.source === 'tor' ? 'TOR' : 'Work Exp',
          `${match.confidence.toFixed(0)}%`
        ];

        xPosition = margin;
        rowData.forEach((data, idx) => {
          const dataStr = String(data);
          doc.text(dataStr, xPosition + 1, yPosition, { 
            maxWidth: colWidths[idx] - 2,
            align: idx === 2 || idx === 4 ? 'center' : 'left'
          });
          xPosition += colWidths[idx];
        });

        // Draw borders
        doc.setDrawColor(200, 200, 200);
        xPosition = margin;
        headers.forEach((_, idx) => {
          doc.rect(xPosition, yPosition - 5, colWidths[idx], 8);
          xPosition += colWidths[idx];
        });

        yPosition += 8;
      });

      // Add summary footer
      yPosition += 5;
      const totalUnits = approved.reduce((sum, match) => sum + (match.curriculum_subject?.units || 0), 0);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(11);
      doc.text(`Total Approved Subjects: ${approved.length}`, margin, yPosition);
      yPosition += 7;
      doc.text(`Total Units: ${totalUnits}`, margin, yPosition);

      // Save PDF
      doc.save(`approved-subjects-${application?.id || 'report'}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF');
    }
  };

  const openDocumentPreview = (doc, focus = null) => {
    setPreviewDoc(doc);
    setPreviewFocus(focus);
  };

  const getDetailedTorMatchExplanation = (payload) => {
    const match = payload?.match;
    const evidence = payload?.evidence || [];
    if (!match) return [];

    const normalize = (val) => (val || '').toString().toUpperCase().replace(/\s|-/g, '');
    const torCode = normalize(match?.tor_subject?.code);
    const curCode = normalize(match?.curriculum_subject?.code);
    const confidence = Number(match?.confidence || 0).toFixed(0);
    const codeAligned = !!torCode && !!curCode && torCode === curCode;
    const extractedHits = evidence.filter((item) => !!item.subjectEvidence).length;

    const details = [];
    if (codeAligned) {
      details.push(`The TOR subject code ${match.tor_subject?.code || 'N/A'} directly aligns with the matched curriculum code ${match.curriculum_subject?.code || 'N/A'}.`);
    } else {
      details.push(`The TOR and curriculum subjects were matched based on title/description similarity, not exact code equality.`);
      details.push(`TOR: ${match.tor_subject?.title || 'N/A'} | Curriculum: ${match.curriculum_subject?.title || 'N/A'}`);
    }

    details.push(`The AI assigned ${confidence}% confidence for this match.`);

    if (match?.matching_reason) {
      details.push(`AI rationale: ${match.matching_reason}`);
    }

    if (extractedHits > 0) {
      details.push(`Verification: This subject was found in ${extractedHits} extracted TOR row(s) from uploaded document proof.`);
    } else {
      details.push('Verification: The exact extracted row was not found in parsed TOR text, so manual document checking is recommended.');
    }

    if (match?.tor_subject?.grade) {
      details.push(`Applicant grade evidence: ${match.tor_subject.grade}.`);
    }

    return details;
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

  const handleApproveAllTorMatches = async () => {
    const pendingTorMatches = matches.filter(m => m.source === 'tor' && m.status === 'pending');
    
    if (pendingTorMatches.length === 0) {
      toast.info('No pending TOR matches to approve');
      return;
    }

    setActioning(true);
    let successCount = 0;
    let failCount = 0;

    for (const match of pendingTorMatches) {
      try {
        await subjectMatchApi.approve(match.id, '');
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    setActioning(false);
    if (failCount === 0) {
      toast.success(`All ${successCount} TOR matches approved!`);
    } else {
      toast.error(`Approved ${successCount}, failed ${failCount}`);
    }
    loadData();
  };

  const handleApproveAllWorkMatches = async () => {
    const pendingWorkMatches = matches.filter(m => m.source === 'work_experience' && m.status === 'pending');
    
    if (pendingWorkMatches.length === 0) {
      toast.info('No pending work experience matches to approve');
      return;
    }

    setActioning(true);
    let successCount = 0;
    let failCount = 0;

    for (const match of pendingWorkMatches) {
      try {
        await subjectMatchApi.approve(match.id, '');
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    setActioning(false);
    if (failCount === 0) {
      toast.success(`All ${successCount} work matches approved!`);
    } else {
      toast.error(`Approved ${successCount}, failed ${failCount}`);
    }
    loadData();
  };

  const handleRejectMatch = async (matchId) => {
    setRejectMatchId(matchId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const submitRejectMatch = async () => {
    const trimmedReason = rejectReason.trim();
    if (!trimmedReason) {
      toast.error('Please provide a short rejection reason');
      return;
    }

    setActioning(true);
    try {
      await subjectMatchApi.reject(rejectMatchId, trimmedReason);
      toast.success('Match rejected');
      setRejectDialogOpen(false);
      setRejectMatchId(null);
      setRejectReason('');
      loadData();
    } catch (err) {
      toast.error('Failed');
    }
    setActioning(false);
  };

  const handleFinalize = async () => {
    setActioning(true);
    try {
      await applicationApi.finalize(id, { evaluator_note: evaluatorNote });
      toast.success('Application finalized!');
      setFinalizationComplete(true);
    } catch (err) {
      toast.error('Failed to finalize');
      setActioning(false);
    }
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
        {/* Finalization Complete Summary */}
        {finalizationComplete && (
          <div className="mb-8">
            <Card className="p-8 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
              <div className="text-center mb-6">
                <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-3" />
                <h2 className="font-serif text-3xl font-bold text-green-900 mb-2">Accreditation Complete!</h2>
                <p className="text-green-700">All approvals have been recorded. Below is a summary of the credited subjects.</p>
              </div>

              {/* Approved Subjects Summary */}
              <div className="space-y-4 mb-6">
                {(() => {
                  const approved = matches.filter(m => m.status === 'approved');
                  const torApproved = approved.filter(m => m.source === 'tor');
                  const workApproved = approved.filter(m => m.source === 'work_experience');
                  const totalUnits = approved.reduce((sum, m) => sum + (m.curriculum_subject?.units || 0), 0);

                  return (
                    <>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <Card className="p-4 bg-white border-green-200">
                          <div className="text-3xl font-bold text-green-600">{approved.length}</div>
                          <div className="text-sm text-gray-600">Total Approved Subjects</div>
                        </Card>
                        <Card className="p-4 bg-white border-green-200">
                          <div className="text-3xl font-bold text-maroon">{totalUnits}</div>
                          <div className="text-sm text-gray-600">Total Units Credited</div>
                        </Card>
                        <Card className="p-4 bg-white border-green-200">
                          <div className="text-3xl font-bold text-blue-600">{torApproved.length + workApproved.length}</div>
                          <div className="text-sm text-gray-600">Sources (TOR + Work)</div>
                        </Card>
                      </div>

                      {/* TOR Subjects */}
                      {torApproved.length > 0 && (
                        <Card className="p-4 border-blue-200 bg-blue-50/50">
                          <h3 className="font-serif font-semibold mb-3 flex items-center gap-2 text-blue-900">
                            <FileText className="w-5 h-5" />
                            From Transcript of Records ({torApproved.length})
                          </h3>
                          <div className="space-y-2">
                            {torApproved.map((match) => (
                              <div key={match.id} className="bg-white rounded p-3 border border-blue-100">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="font-semibold text-gray-900">
                                      {match.curriculum_subject?.code}
                                    </div>
                                    <div className="text-sm text-gray-700">{match.curriculum_subject?.title}</div>
                                    {match.tor_subject && (
                                      <div className="text-xs text-gray-600 mt-1">
                                        From: {match.tor_subject.code} - {match.tor_subject.title}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <Badge className="bg-green-100 text-green-700 text-xs mb-1 block">
                                      {match.confidence.toFixed(0)}% match
                                    </Badge>
                                    <div className="text-sm font-semibold text-maroon">{match.curriculum_subject?.units}u</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      )}

                      {/* Work Experience Subjects */}
                      {workApproved.length > 0 && (
                        <Card className="p-4 border-purple-200 bg-purple-50/50">
                          <h3 className="font-serif font-semibold mb-3 flex items-center gap-2 text-purple-900">
                            <Briefcase className="w-5 h-5" />
                            From Work Experience ({workApproved.length})
                          </h3>
                          <div className="space-y-2">
                            {workApproved.map((match) => (
                              <div key={match.id} className="bg-white rounded p-3 border border-purple-100">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="font-semibold text-gray-900">
                                      {match.curriculum_subject?.code}
                                    </div>
                                    <div className="text-sm text-gray-700">{match.curriculum_subject?.title}</div>
                                    {match.work_experience && (
                                      <div className="text-xs text-gray-600 mt-1">
                                        From: {match.work_experience.job_title} at {match.work_experience.company_name}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <Badge className="bg-green-100 text-green-700 text-xs mb-1 block">
                                      {match.confidence.toFixed(0)}% match
                                    </Badge>
                                    <div className="text-sm font-semibold text-maroon">{match.curriculum_subject?.units}u</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      )}

                      {/* Rejected Subjects */}
                      {(() => {
                        const rejected = matches.filter(m => m.status === 'rejected');
                        return rejected.length > 0 ? (
                          <Card className="p-4 border-red-200 bg-red-50/50">
                            <h3 className="font-serif font-semibold mb-3 flex items-center gap-2 text-red-900">
                              <XCircle className="w-5 h-5" />
                              Rejected Subjects ({rejected.length})
                            </h3>
                            <div className="space-y-2">
                              {rejected.map((match) => (
                                <div key={match.id} className="bg-white rounded p-3 border border-red-100">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                      <div className="font-semibold text-gray-900">
                                        {match.curriculum_subject?.code || 'No Match'}
                                      </div>
                                      <div className="text-sm text-gray-700">{match.curriculum_subject?.title}</div>
                                      {match.evaluator_note && (
                                        <div className="text-xs text-red-700 mt-1 italic">
                                          Reason: {match.evaluator_note}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </Card>
                        ) : null;
                      })()}
                    </>
                  );
                })()}
              </div>

              <div className="flex gap-3 justify-center">
                <Button 
                  onClick={() => navigate('/evaluator')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 flex items-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Dashboard
                </Button>
                <Button 
                  onClick={() => navigate('/evaluator')}
                  className="bg-green-600 hover:bg-green-700 text-white px-6"
                >
                  Return to Queue
                </Button>
                <Button 
                  onClick={() => navigate(`/evaluator/review/${id}`)}
                  variant="outline"
                  className="px-6"
                >
                  View Full Details
                </Button>
              </div>
            </Card>
          </div>
        )}

        {!finalizationComplete && (
          <>
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
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="font-serif font-semibold text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-maroon" />
                  Subject Matches ({matches.length})
                </h3>
                <div className="flex gap-2 flex-wrap">
                  {!isFinalized && torMatches.filter(m => m.status === 'pending').length > 0 && (
                    <Button 
                      onClick={handleApproveAllTorMatches}
                      disabled={actioning}
                      size="sm"
                      variant="outline"
                      className="border-green-300 text-green-600 hover:bg-green-50"
                      data-testid="approve-all-tor-btn"
                    >
                      {actioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Approve All TOR ({torMatches.filter(m => m.status === 'pending').length})
                    </Button>
                  )}
                  {!isFinalized && workMatches.filter(m => m.status === 'pending').length > 0 && (
                    <Button 
                      onClick={handleApproveAllWorkMatches}
                      disabled={actioning}
                      size="sm"
                      variant="outline"
                      className="border-purple-300 text-purple-600 hover:bg-purple-50"
                      data-testid="approve-all-work-btn"
                    >
                      {actioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Approve All Work ({workMatches.filter(m => m.status === 'pending').length})
                    </Button>
                  )}
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
              </div>
              
              <Tabs defaultValue="all">
                <TabsList className="mb-4">
                  <TabsTrigger value="all">All ({matches.length})</TabsTrigger>
                  <TabsTrigger value="tor">From TOR ({torMatches.length})</TabsTrigger>
                  <TabsTrigger value="work">From Work ({workMatches.length})</TabsTrigger>
                </TabsList>
                
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white">
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
                </div>
              </Tabs>
            </Card>

            {/* Action Panel */}
            {!isFinalized && (
              <Card className="p-5 border-gray-200">
                <h3 className="font-serif font-semibold mb-3">Department Chair Decision</h3>
                
                {/* Summary Preview */}
                {(() => {
                  const approved = matches.filter(m => m.status === 'approved');
                  const rejected = matches.filter(m => m.status === 'rejected');
                  const pending = matches.filter(m => m.status === 'pending');
                  
                  if (approved.length > 0 || rejected.length > 0) {
                    return (
                      <div className="mb-6 space-y-4">
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                          <div className="flex justify-between items-center mb-3">
                            <h4 className="font-semibold text-blue-900 flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4" />
                              Approved Subjects ({approved.length})
                            </h4>
                            <Button
                              onClick={downloadApprovedAsPDF}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                            >
                              <Download className="w-4 h-4" />
                              Download PDF
                            </Button>
                          </div>
                          <div className="overflow-x-auto max-h-64 overflow-y-auto border border-blue-100 rounded">
                            <table className="w-full text-sm">
                              <thead className="sticky top-0 bg-blue-100">
                                <tr className="border-b border-blue-200">
                                  <th className="text-left py-2 px-2 font-semibold text-blue-900">Code</th>
                                  <th className="text-left py-2 px-2 font-semibold text-blue-900">Title</th>
                                  <th className="text-center py-2 px-2 font-semibold text-blue-900">Units</th>
                                  <th className="text-left py-2 px-2 font-semibold text-blue-900">Source</th>
                                  <th className="text-center py-2 px-2 font-semibold text-blue-900">Confidence</th>
                                </tr>
                              </thead>
                              <tbody>
                                {approved.map((match) => (
                                  <tr key={match.id} className="border-b border-blue-100 hover:bg-blue-100">
                                    <td className="py-2 px-2 font-mono text-blue-700">{match.curriculum_subject?.code || 'N/A'}</td>
                                    <td className="py-2 px-2">{match.curriculum_subject?.title || 'N/A'}</td>
                                    <td className="py-2 px-2 text-center font-semibold">{match.curriculum_subject?.units || 0}</td>
                                    <td className="py-2 px-2 text-xs">
                                      <Badge variant="outline" className="text-xs">
                                        {match.source === 'tor' ? 'TOR' : 'Work Exp'}
                                      </Badge>
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <Badge className="bg-green-100 text-green-700 text-xs">{match.confidence.toFixed(0)}%</Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {rejected.length > 0 && (
                          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                            <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                              <XCircle className="w-4 h-4" />
                              Rejected Subjects ({rejected.length})
                            </h4>
                            <div className="overflow-x-auto max-h-64 overflow-y-auto border border-red-100 rounded">
                              <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-red-100">
                                  <tr className="border-b border-red-200">
                                    <th className="text-left py-2 px-2 font-semibold text-red-900">Code</th>
                                    <th className="text-left py-2 px-2 font-semibold text-red-900">Title</th>
                                    <th className="text-left py-2 px-2 font-semibold text-red-900">Reason</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rejected.map((match) => (
                                    <tr key={match.id} className="border-b border-red-100 hover:bg-red-100">
                                      <td className="py-2 px-2 font-mono text-red-700">{match.curriculum_subject?.code || 'N/A'}</td>
                                      <td className="py-2 px-2">{match.curriculum_subject?.title || 'N/A'}</td>
                                      <td className="py-2 px-2 text-xs italic text-red-800">{match.evaluator_note || 'No reason provided'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

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
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleReopen} disabled={actioning} className="bg-maroon text-white" data-testid="reopen-btn">
                    {actioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Move to Under Review'}
                  </Button>
                  <Button 
                    onClick={() => navigate(`/applicant/dashboard?app=${application?.id}&view=accreditation-summary`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    View Accreditation Summary
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
        </>
        )}
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

              <div className="rounded-lg border border-maroon/20 bg-maroon/5 p-4">
                <div className="text-sm font-semibold text-maroon mb-2">Why This Subject Matched</div>
                <div className="space-y-1.5">
                  {getDetailedTorMatchExplanation(torEvidenceMatch).map((line, index) => (
                    <p key={index} className="text-xs text-gray-700 leading-5">
                      {line}
                    </p>
                  ))}
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

      <Dialog
        open={rejectDialogOpen}
        onOpenChange={(open) => {
          setRejectDialogOpen(open);
          if (!open) {
            setRejectMatchId(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent className="max-w-xl" data-testid="reject-reason-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              Reason for Rejecting
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Enter a short reason why this subject match is being rejected. This note will be shown to the applicant in the View Evaluation page.
            </p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Example: TOR subject title does not align with the BSIT curriculum and the units are incomplete."
              className="min-h-[140px]"
              data-testid="reject-reason-input"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={actioning}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitRejectMatch}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={actioning}
              data-testid="submit-reject-reason"
            >
              {actioning ? 'Saving...' : 'Reject Subject'}
            </Button>
          </DialogFooter>
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

  const getShortMatchReason = (match) => {
    const confidence = Number(match?.confidence || 0);
    const sourceLabel = match?.source === 'tor' ? 'TOR' : 'work experience';

    if (match?.source === 'tor' && match?.tor_subject && match?.curriculum_subject) {
      const torCode = normalize(match.tor_subject.code);
      const curCode = normalize(match.curriculum_subject.code);
      const codeAligned = torCode && curCode && torCode === curCode;
      if (codeAligned) {
        return `Matched by exact subject code alignment (${match.tor_subject.code} = ${match.curriculum_subject.code}) with ${confidence.toFixed(0)}% confidence.`;
      }
      return `Matched by subject title similarity between TOR and curriculum with ${confidence.toFixed(0)}% confidence.`;
    }

    if (match?.source === 'work_experience' && match?.work_experience && match?.curriculum_subject) {
      return `Matched from ${match.work_experience.job_title} experience to ${match.curriculum_subject.code} based on skill overlap (${confidence.toFixed(0)}% confidence).`;
    }

    if (!match?.curriculum_subject) {
      return `No strong curriculum equivalent was found from ${sourceLabel} evidence yet.`;
    }

    return `Matched from ${sourceLabel} evidence with ${confidence.toFixed(0)}% confidence.`;
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
              <div className="text-xs text-gray-700 mt-2 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                <span className="font-semibold">Why matched:</span> {getShortMatchReason(match)}
              </div>
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

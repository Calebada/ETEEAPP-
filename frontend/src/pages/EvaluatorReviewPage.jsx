import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { applicationApi, subjectMatchApi, predictionApi, programApi } from '../lib/api';
import {
  ArrowLeft, Loader2, FileText, Briefcase, CheckCircle2, XCircle,
  AlertCircle, BookOpen, User, Calendar, MapPin, Phone, Sparkles, Flag, Eye, Download, Pencil, Trash2,
  GraduationCap, Clock, ChevronDown, ChevronRight, Check, Search, Filter
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

// Helper to group BSIT Curriculum subjects by Academic Year and Semester
export const groupCurriculumByYearAndSem = (curriculumList = []) => {
  const groups = {};

  const yearNames = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };
  const semNames = { 1: '1st Semester', 2: '2nd Semester', 3: 'Summer Term' };

  (curriculumList || []).forEach((subject) => {
    const year = Number(subject.year) || 1;
    const sem = Number(subject.semester) || 1;
    const key = `y${year}_s${sem}`;
    const yearLabel = yearNames[year] || `Year ${year}`;
    const semLabel = semNames[sem] || `Semester ${sem}`;
    const title = `${yearLabel} · ${semLabel}`;
    const sortOrder = year * 10 + sem;

    if (!groups[key]) {
      groups[key] = {
        key,
        year,
        sem,
        yearLabel,
        semLabel,
        title,
        sortOrder,
        subjects: [],
      };
    }
    groups[key].subjects.push(subject);
  });

  return Object.values(groups).sort((a, b) => a.sortOrder - b.sortOrder);
};

export const EvaluatorReviewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [matches, setMatches] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [curriculum, setCurriculum] = useState([]);
  const [torSubjects, setTorSubjects] = useState([]);
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
  const [removeMatchId, setRemoveMatchId] = useState(null);
  const [browseModalTarget, setBrowseModalTarget] = useState(null);
  const [finalizationComplete, setFinalizationComplete] = useState(false);
  const [showFullReview, setShowFullReview] = useState(false);
  const [workCreditTarget, setWorkCreditTarget] = useState({ workId: '', curriculumId: '' });

  // Accordion state for Year/Semester dropdown groups
  const [expandedTerms, setExpandedTerms] = useState({});
  // Disregard unmatched TOR subject
  const [disregardDialogOpen, setDisregardDialogOpen] = useState(false);
  const [disregardSubject, setDisregardSubject] = useState(null);
  const [disregardReason, setDisregardReason] = useState('');
  const [disregarding, setDisregarding] = useState(false);

  const downloadApprovedAsPDF = () => {
    try {
      const approved = matches.filter(m => m.status === 'approved');
      const rejected = matches.filter(m => m.status === 'rejected');

      if (approved.length === 0 && rejected.length === 0) {
        toast.error('No accreditation records to export');
        return;
      }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - (margin * 2);

      let yPos = margin;

      const applicantName = application?.applicant?.full_name || 
        `${application?.applicant?.first_name || ''} ${application?.applicant?.last_name || ''}`.trim() || 'Applicant';
      const programName = application?.program?.name || 'Bachelor of Science in Information Technology';
      const programCode = application?.program?.code || 'BSIT';
      const totalApprovedUnits = approved.reduce((sum, m) => sum + Number(m.curriculum_subject?.units || 0), 0);

      const renderHeader = (isFirstPage = true) => {
        doc.setFillColor(122, 30, 43); // CIT-U Maroon
        doc.rect(0, 0, pageWidth, 6, 'F');
        doc.setFillColor(212, 175, 55); // CIT-U Gold
        doc.rect(0, 6, pageWidth, 1.5, 'F');

        if (isFirstPage) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          doc.setTextColor(122, 30, 43);
          doc.text('CEBU INSTITUTE OF TECHNOLOGY - UNIVERSITY', margin, 16);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(100, 116, 139);
          doc.text('Expanded Tertiary Education Equivalency and Accreditation Program (ETEEAP)', margin, 21);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(15);
          doc.setTextColor(15, 23, 42);
          doc.text('Official Subject Accreditation & Equivalency Report', margin, 29);

          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.5);
          doc.line(margin, 32, pageWidth - margin, 32);
        }
      };

      renderHeader(true);
      yPos = 36;

      // Metadata Info Box
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, yPos, contentWidth, 23, 2, 2, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, yPos, contentWidth, 23, 2, 2, 'S');
      doc.setFillColor(122, 30, 43);
      doc.rect(margin, yPos, 2.5, 23, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('APPLICANT NAME:', margin + 6, yPos + 5.5);
      doc.text('DEGREE PROGRAM:', margin + 6, yPos + 12);
      doc.text('APPLICATION ID:', margin + 6, yPos + 18.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(applicantName, margin + 38, yPos + 5.5);
      doc.text(`${programName} (${programCode})`, margin + 38, yPos + 12);
      doc.text(`#${application?.id || 'N/A'}`, margin + 38, yPos + 18.5);

      const col2X = margin + 105;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.text('DATE GENERATED:', col2X, yPos + 5.5);
      doc.text('TOTAL CREDITS:', col2X, yPos + 12);
      doc.text('STATUS:', col2X, yPos + 18.5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), col2X + 30, yPos + 5.5);
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(122, 30, 43);
      doc.text(`${totalApprovedUnits} Units (${approved.length} Subjects)`, col2X + 30, yPos + 12);

      doc.setTextColor(22, 101, 52);
      doc.text(application?.status === 'finalized' ? 'FINALIZED / ACCREDITED' : 'UNDER REVIEW', col2X + 30, yPos + 18.5);

      yPos += 28;

      const checkPageBreak = (neededHeight = 20) => {
        if (yPos + neededHeight > pageHeight - margin - 25) {
          doc.addPage();
          renderHeader(false);
          yPos = 16;
        }
      };

      // Table Header
      checkPageBreak(15);
      doc.setFillColor(122, 30, 43);
      doc.rect(margin, yPos, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text('#', margin + 3, yPos + 5.5);
      doc.text('CURRICULUM COURSE', margin + 12, yPos + 5.5);
      doc.text('MATCHED APPLICANT EVIDENCE', margin + 65, yPos + 5.5);
      doc.text('UNITS', margin + 130, yPos + 5.5);
      doc.text('SOURCE', margin + 148, yPos + 5.5);
      doc.text('MATCH', margin + 168, yPos + 5.5);

      yPos += 8;

      approved.forEach((m, idx) => {
        checkPageBreak(12);
        doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
        doc.rect(margin, yPos, contentWidth, 10, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, yPos + 10, margin + contentWidth, yPos + 10);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(String(idx + 1), margin + 3, yPos + 6);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(m.curriculum_subject?.code || '', margin + 12, yPos + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        const curTitle = doc.splitTextToSize(m.curriculum_subject?.title || '', 50);
        doc.text(curTitle[0] || '', margin + 12, yPos + 8.5);

        let evidenceText = 'N/A';
        if (m.source === 'tor' && m.tor_subject) {
          evidenceText = `${m.tor_subject.code} - ${m.tor_subject.title} (${m.tor_subject.units}u)`;
        } else if (m.source === 'work_experience' && m.work_experience) {
          evidenceText = `${m.work_experience.job_title} (${m.work_experience.years}y)`;
        }
        const splittedEv = doc.splitTextToSize(evidenceText, 62);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text(splittedEv[0] || '', margin + 65, yPos + 6);

        doc.setFont('helvetica', 'bold');
        doc.text(String(m.curriculum_subject?.units || 0), margin + 133, yPos + 6);

        doc.setFont('helvetica', 'normal');
        doc.text(m.source === 'tor' ? 'TOR' : 'Work Exp', margin + 148, yPos + 6);

        doc.setTextColor(22, 101, 52);
        doc.text(`${Math.round(m.confidence || 100)}%`, margin + 168, yPos + 6);

        yPos += 10;
      });

      yPos += 15;
      checkPageBreak(30);

      const sigColWidth = contentWidth / 2;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.5);
      doc.line(margin + 6, yPos + 14, margin + sigColWidth - 12, yPos + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('DEPARTMENT CHAIR', margin + 6, yPos + 18.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('CIT-U ETEEAP Evaluator', margin + 6, yPos + 22.5);

      doc.line(margin + sigColWidth + 6, yPos + 14, margin + contentWidth - 6, yPos + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('UNIVERSITY REGISTRAR / DEAN', margin + sigColWidth + 6, yPos + 18.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Cebu Institute of Technology - University', margin + sigColWidth + 6, yPos + 22.5);

      const cleanFileName = `ETEEAP_Accreditation_${applicantName.replace(/[^a-zA-Z0-9]/g, '_')}_${application?.id?.slice(0, 8) || 'Report'}.pdf`;
      doc.save(cleanFileName);
      toast.success('Official PDF Report downloaded successfully!');
    } catch (err) {
      console.error('PDF Export error:', err);
      toast.error('Failed to generate PDF: ' + err.message);
    }
  };

  const openDocumentPreview = (doc, focusSubject = null) => {
    setPreviewDoc(doc);
    setPreviewFocus(focusSubject);
  };

  const buildTorEvidence = (match, documents) => {
    const torDocs = (documents || []).filter((d) => d.document_type === 'tor');
    const normalize = (val) => (val || '').toString().toUpperCase().replace(/\s|-/g, '');
    const targetCode = normalize(match?.tor_subject?.code);
    const targetTitle = (match?.tor_subject?.title || '').toLowerCase().trim();
    const evidence = [];

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

  const getDetailedTorMatchExplanation = (evidenceItem) => {
    if (!evidenceItem) return [];
    const { match, evidence } = evidenceItem;
    const details = [];

    const confidence = Number(match?.confidence || 0);
    const torCode = match?.tor_subject?.code || 'N/A';
    const torTitle = match?.tor_subject?.title || 'N/A';
    const curCode = match?.curriculum_subject?.code || 'N/A';
    const curTitle = match?.curriculum_subject?.title || 'N/A';

    const normalizedTorCode = (torCode || '').toUpperCase().replace(/\s|-/g, '');
    const normalizedCurCode = (curCode || '').toUpperCase().replace(/\s|-/g, '');
    const isCodeMatch = normalizedTorCode && normalizedCurCode && normalizedTorCode === normalizedCurCode;

    if (isCodeMatch) {
      details.push(`Exact subject code match: Applicant course "${torCode}" matches curriculum course code "${curCode}".`);
    } else {
      details.push(`Subject title match: Applicant course "${torTitle}" aligns with curriculum course "${curTitle}".`);
    }

    details.push(`Calculated AI matching confidence: ${confidence.toFixed(0)}%.`);

    const extractedHits = (evidence || []).filter(e => !!e.subjectEvidence).length;
    if (match?.matching_reason) {
      details.push(`AI rationale: ${match.matching_reason}`);
    }
    if (extractedHits > 0) {
      details.push(`Verification: This subject was found in ${extractedHits} extracted TOR row(s) from uploaded document proof.`);
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
      setMatches(matchesResp.data || []);
      setPrediction(predResp.data);
      setTorSubjects(appResp.data.tor_subjects || []);
      setEvaluatorNote(appResp.data.evaluator_note || '');
      setFinalizationComplete(appResp.data.status === 'finalized' || appResp.data.status === 'rejected');
      
      try {
        if (appResp.data && appResp.data.program && appResp.data.program.id) {
          const curResp = await programApi.curriculum(appResp.data.program.id);
          setCurriculum(curResp.data || []);
        }
        try {
          const sumResp = await applicationApi.summary(id);
          setAppSummary(sumResp.data || null);
        } catch (e) {
          setAppSummary(null);
        }
      } catch (e) { 
        setCurriculum([]); 
      }
    } catch (err) {
      toast.error('Failed to load application');
    }
    setLoading(false);
  };

  const handleApproveMatch = async (matchId) => {
    try {
      await subjectMatchApi.approve(matchId, '');
      toast.success('Subject match approved');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to approve match');
    }
  };

  const handleRejectMatch = (matchId) => {
    setRejectMatchId(matchId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const submitRejectMatch = async () => {
    if (!rejectMatchId) return;
    setActioning(true);
    try {
      await subjectMatchApi.reject(rejectMatchId, rejectReason.trim());
      toast.success('Subject match rejected');
      setRejectDialogOpen(false);
      setRejectMatchId(null);
      setRejectReason('');
      await loadData();
    } catch (err) {
      toast.error('Failed to reject match');
    } finally {
      setActioning(false);
    }
  };

  const handleDisregardUnmatched = (subject) => {
    setDisregardSubject(subject);
    setDisregardReason('');
    setDisregardDialogOpen(true);
  };

  const submitDisregard = async () => {
    if (!disregardSubject) return;
    setDisregarding(true);
    try {
      await subjectMatchApi.disregardTorSubject(
        id,
        disregardSubject.id,
        disregardReason.trim() || 'Disregarded — not applicable to any BSIT curriculum subject'
      );
      toast.success(`"${disregardSubject.code}" disregarded and moved to Rejected Subjects`);
      setDisregardDialogOpen(false);
      setDisregardSubject(null);
      setDisregardReason('');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to disregard subject');
    } finally {
      setDisregarding(false);
    }
  };

  const handleRemoveMatch = async (matchId) => {
    const targetId = matchId || removeMatchId;
    if (!targetId) return;
    setActioning(true);
    try {
      await subjectMatchApi.delete(targetId);
      toast.success('Subject match removed');
      setRemoveMatchId(null);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove subject match');
    } finally {
      setActioning(false);
    }
  };

  const handleApproveAllTorMatches = async () => {
    const pendingTorMatches = matches.filter(m => m.source === 'tor' && m.status === 'pending' && m.curriculum_subject);
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

  const handleManualMatchTorToCurriculum = async (torSubjectId, curriculumSubjectId) => {
    if (!torSubjectId || !curriculumSubjectId) {
      toast.info('Please select a BSIT Curriculum Subject to match.');
      return;
    }

    const curSubj = (curriculum || []).find(c => c.id === curriculumSubjectId);
    const torSubj = (torSubjects || []).find(s => s.id === torSubjectId);

    if (torSubj && curSubj && Number(torSubj.units || 0) < Number(curSubj.units || 0)) {
      toast.error(`Cannot match: Applicant course "${torSubj.code}" has ${torSubj.units} unit(s), but BSIT course "${curSubj.code}" requires ${curSubj.units} unit(s).`);
      return;
    }

    setActioning(true);
    try {
      await subjectMatchApi.create({
        application_id: application.id,
        curriculum_subject_id: curriculumSubjectId,
        tor_subject_id: torSubjectId,
        note: 'Manually matched and approved by evaluator'
      });
      toast.success(`Matched "${torSubj?.code || 'Course'}" to "${curSubj?.code || 'BSIT Course'}" successfully!`);
      await loadData();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to match subject');
    } finally {
      setActioning(false);
    }
  };

  const handleCreditWorkExperience = async (workExperienceId, curriculumSubjectId) => {
    if (!workExperienceId || !curriculumSubjectId) {
      toast.info('Please select both a work experience and a BSIT curriculum course.');
      return;
    }

    const curSubj = (curriculum || []).find(c => c.id === curriculumSubjectId);
    const workExp = (application?.work_experiences || []).find(w => w.id === workExperienceId);

    setActioning(true);
    try {
      await subjectMatchApi.create({
        application_id: application.id,
        curriculum_subject_id: curriculumSubjectId,
        work_experience_id: workExperienceId,
        note: `Credited from work experience (${workExp?.job_title || 'Work Experience'}) by evaluator`
      });
      toast.success(`Credited "${curSubj?.code || 'BSIT Subject'}" from "${workExp?.job_title || 'Work Experience'}" successfully!`);
      setWorkCreditTarget({ workId: '', curriculumId: '' });
      await loadData();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to credit from work experience');
    } finally {
      setActioning(false);
    }
  };

  const handleFinalize = async () => {
    const approvedMatches = matches.filter(m => m.status === 'approved');
    if (approvedMatches.length === 0) {
      toast.error('Cannot finalize: No subjects have been approved for accreditation.');
      return;
    }

    if (!window.confirm(`Are you sure you want to finalize accreditation for ${application?.applicant?.full_name}? This will record ${approvedMatches.length} accredited subjects.`)) {
      return;
    }

    setActioning(true);
    try {
      await applicationApi.finalize(id, evaluatorNote);
      toast.success('Application finalized successfully!');
      setFinalizationComplete(true);
      setShowFullReview(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to finalize application');
    }
    setActioning(false);
  };

  const handleReject = async () => {
    if (!window.confirm('Are you sure you want to reject this entire application?')) {
      return;
    }
    setActioning(true);
    try {
      await applicationApi.reject(id, evaluatorNote);
      toast.success('Application rejected');
      navigate('/evaluator');
    } catch (err) {
      toast.error('Failed to reject application');
    }
    setActioning(false);
  };

  const handleReopen = async () => {
    if (!window.confirm('Are you sure you want to reopen this application for review and editing?')) {
      return;
    }
    setActioning(true);
    try {
      await applicationApi.update(id, { status: 'under_review' });
      toast.success('Application moved back to Under Review');
      setFinalizationComplete(false);
      setShowFullReview(false);
      loadData();
    } catch (err) {
      toast.error('Failed to reopen application');
    }
    setActioning(false);
  };

  const handleRunAI = async () => {
    setActioning(true);
    try {
      const resp = await applicationApi.runFullEvaluation(id);
      toast.success(resp.data?.message || 'AI evaluation complete');
      loadData();
    } catch (err) {
      toast.error('Failed to run AI evaluation');
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
    if (confidence >= 85) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (confidence >= 60) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  // Group scanned TOR subjects by Academic Year and Semester
  const termGroups = useMemo(() => {
    const groups = {};

    (torSubjects || []).forEach(subject => {
      const year = subject.year_level || 1;
      const sem = subject.semester || 1;
      const schoolYear = (subject.school_year || '').trim();
      const termLabel = (subject.term_label || '').trim();

      let key = '';
      let title = '';
      let sortOrder = 0;

      if (termLabel) {
        key = termLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
        title = termLabel;
        const yMatch = termLabel.match(/(\d+)(?:st|nd|rd|th)?\s*year/i);
        const sMatch = termLabel.match(/(\d+)(?:st|nd|rd|th)?\s*sem/i);
        const yVal = yMatch ? parseInt(yMatch[1], 10) : year;
        const sVal = sMatch ? parseInt(sMatch[1], 10) : sem;
        sortOrder = yVal * 10 + sVal;
      } else if (year > 0 && sem > 0) {
        const yearNames = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };
        const semNames = { 1: '1st Semester', 2: '2nd Semester', 3: 'Summer Term' };
        const yName = yearNames[year] || `Year ${year}`;
        const sName = semNames[sem] || `Semester ${sem}`;
        key = `y${year}_s${sem}`;
        title = `${yName} · ${sName}${schoolYear ? ` (${schoolYear})` : ''}`;
        sortOrder = year * 10 + sem;
      } else if (schoolYear) {
        key = `sy_${schoolYear.replace(/[^a-z0-9]/g, '_')}`;
        title = `Academic Year ${schoolYear}`;
        sortOrder = 90;
      } else {
        key = 'general_transcript';
        title = 'General Transcript Subjects';
        sortOrder = 99;
      }

      if (!groups[key]) {
        groups[key] = {
          key,
          title,
          schoolYear,
          year,
          sem,
          sortOrder,
          subjects: []
        };
      }
      groups[key].subjects.push(subject);
    });

    return Object.values(groups).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [torSubjects]);

  // Expand / collapse term accordions
  const handleToggleTerm = (termKey) => {
    setExpandedTerms(prev => ({
      ...prev,
      [termKey]: !prev[termKey]
    }));
  };

  const handleExpandAllTerms = () => {
    const allExpanded = {};
    termGroups.forEach(g => {
      allExpanded[g.key] = true;
    });
    setExpandedTerms(allExpanded);
  };

  const handleCollapseAllTerms = () => {
    setExpandedTerms({});
  };

  // Set first term open by default when data loads
  useEffect(() => {
    if (termGroups.length > 0 && Object.keys(expandedTerms).length === 0) {
      const initial = {};
      termGroups.forEach((g, idx) => {
        if (idx === 0) initial[g.key] = true;
      });
      setExpandedTerms(initial);
    }
  }, [termGroups]);

  // Approved curriculum IDs
  const approvedCurriculumIds = new Set(
    matches
      .filter(m => m.curriculum_subject && m.status === 'approved')
      .map(m => m.curriculum_subject.id)
  );

  // Available BSIT Curriculum subjects not yet approved
  const availableCurriculumSubjects = (curriculum || []).filter(
    c => !approvedCurriculumIds.has(c.id)
  );

  // Group available curriculum subjects by Year & Semester
  const availableCurriculumGroups = useMemo(() => {
    return groupCurriculumByYearAndSem(availableCurriculumSubjects);
  }, [availableCurriculumSubjects]);

  // Approved TOR subject IDs (strict 1-to-1 matching for transcript courses)
  const approvedTorSubjectIds = new Set(
    matches
      .filter(m => m.tor_subject && m.status === 'approved')
      .map(m => m.tor_subject.id)
  );

  const availableTorSubjects = (torSubjects || []).filter(
    s => !approvedTorSubjectIds.has(s.id)
  );

  // Matched TOR subject IDs (pending, approved, or rejected — rejected subjects
  // should NOT reappear in the Unmatched list; they are shown in Rejected Subjects)
  const matchedTorIds = new Set(
    matches
      .filter(m => m.tor_subject && (m.curriculum_subject || m.status === 'rejected'))
      .map(m => m.tor_subject.id)
  );

  // Unmatched Applicant Scanned Subjects (TOR subjects without a curriculum match)
  const unmatchedTorSubjects = (torSubjects || []).filter(
    s => !matchedTorIds.has(s.id)
  );

  // Available Work Experiences (UNLIMITED crediting: all work experiences remain selectable)
  const availableWorkExperiences = application?.work_experiences || [];

  const torMatches = matches.filter(m => m.source === 'tor' && m.curriculum_subject);
  const workMatches = matches.filter(m => m.source === 'work_experience' && m.curriculum_subject);
  const allMatchedItems = matches.filter(m => m.curriculum_subject);

  const approvedMatchesList = matches.filter(m => m.status === 'approved' && m.curriculum_subject);
  // Include all rejected matches (with or without a curriculum subject match)
  const rejectedMatchesList = matches.filter(m => m.status === 'rejected');
  const pendingMatchesList = matches.filter(m => m.status === 'pending' && m.curriculum_subject);
  const pendingTorMatches = matches.filter(m => m.source === 'tor' && m.status === 'pending' && m.curriculum_subject);
  const pendingWorkMatches = matches.filter(m => m.source === 'work_experience' && m.status === 'pending' && m.curriculum_subject);
  const totalApprovedUnits = approvedMatchesList.reduce((sum, m) => sum + Number(m.curriculum_subject?.units || 0), 0);

  const isFinalized = application?.status === 'finalized' || application?.status === 'rejected';

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="evaluator-review-page">
        {/* Finalization Complete Summary */}
        {finalizationComplete && !showFullReview && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <Button
                variant="ghost"
                onClick={() => navigate('/evaluator')}
                className="text-gray-600 hover:text-gray-900 -ml-2"
                data-testid="back-to-queue-btn"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Review Queue
              </Button>
            </div>

            <Card className="p-6 bg-white border border-gray-200 shadow-xs rounded-xl">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Accreditation Finalized & Certified
                  </div>
                  <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
                    Official Accreditation Summary
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">
                    Candidate: <strong className="text-gray-800">{application?.applicant?.full_name || 'Applicant'}</strong>
                    {' '}· Program: <span className="font-medium text-maroon">{application?.program?.code || 'BSIT'}</span> - {application?.program?.name || 'Bachelor of Science in Information Technology'}
                    {' '}· Application <span className="font-mono text-gray-500">#{application?.id?.slice(0, 8)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={downloadApprovedAsPDF}
                    className="bg-maroon hover:bg-maroon/90 text-white font-semibold px-5 py-2.5 shadow-xs flex items-center gap-2"
                    data-testid="download-pdf-btn"
                  >
                    <Download className="w-4 h-4" />
                    Download Official PDF Report
                  </Button>
                  <Button
                    onClick={() => setShowFullReview(true)}
                    variant="outline"
                    className="border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    data-testid="toggle-audit-view-btn"
                  >
                    <Eye className="w-4 h-4" />
                    Full Audit View
                  </Button>
                  <Button
                    onClick={handleReopen}
                    disabled={actioning}
                    variant="outline"
                    className="border-amber-300 text-amber-900 hover:bg-amber-50 flex items-center gap-2"
                    data-testid="reopen-for-edit-btn"
                  >
                    {actioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4 text-amber-700" />}
                    Reopen for Review
                  </Button>
                </div>
              </div>
            </Card>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{approvedMatchesList.length}</div>
                  <div className="text-xs text-gray-500 font-medium">Subjects Credited & Approved</div>
                </div>
              </Card>

              <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-maroon flex-shrink-0">
                  <BookOpen className="w-6 h-6 text-maroon" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-maroon">{totalApprovedUnits} Units</div>
                  <div className="text-xs text-gray-500 font-medium">Total Academic Units Credited</div>
                </div>
              </Card>

              <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-900">
                    {approvedMatchesList.filter(m => m.source === 'tor').length} TOR · {approvedMatchesList.filter(m => m.source === 'work_experience').length} Work
                  </div>
                  <div className="text-xs text-gray-500 font-medium">Credited Evidence Distribution</div>
                </div>
              </Card>
            </div>

            {/* Credited Subjects Table */}
            <Card className="bg-white border border-gray-200 shadow-xs rounded-xl overflow-hidden">
              <div className="px-6 py-4 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h2 className="font-semibold text-gray-900">
                    Credited Curriculum Subjects ({approvedMatchesList.length})
                  </h2>
                </div>
                <span className="text-xs text-gray-500">
                  Official Record of Verified & Accredited BSIT Subjects
                </span>
              </div>

              {approvedMatchesList.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No approved subjects recorded for this application.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                        <th className="py-3 px-4 w-12 text-center">#</th>
                        <th className="py-3 px-4">BSIT Curriculum Subject</th>
                        <th className="py-3 px-4">Matched Applicant Evidence</th>
                        <th className="py-3 px-4 text-center w-20">Units</th>
                        <th className="py-3 px-4 text-center w-28">Source</th>
                        <th className="py-3 px-4 text-center w-28">Match</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {approvedMatchesList.map((match, idx) => (
                        <tr key={match.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-3.5 px-4 text-center text-xs font-medium text-gray-400">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold text-maroon text-sm">
                              {match.curriculum_subject?.code}
                            </div>
                            <div className="text-gray-900 font-medium text-xs mt-0.5">
                              {match.curriculum_subject?.title}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {match.source === 'tor' && match.tor_subject ? (
                              <div className="space-y-0.5">
                                <div className="font-semibold text-gray-900 text-xs">
                                  <span className="font-mono text-blue-700 font-bold mr-1">{match.tor_subject.code}</span>
                                  {match.tor_subject.title}
                                </div>
                                <div className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                                  <span>Units: <strong>{match.tor_subject.units || 0}u</strong></span>
                                  <span>·</span>
                                  <span>Grade: <strong>{match.tor_subject.grade || 'Passed'}</strong></span>
                                </div>
                              </div>
                            ) : match.source === 'work_experience' && match.work_experience ? (
                              <div className="space-y-0.5">
                                <div className="font-semibold text-purple-900 text-xs">
                                  {match.work_experience.job_title}
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  {match.work_experience.company_name} ({match.work_experience.years || 0} yrs)
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">No direct evidence details</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="font-bold text-gray-900 text-xs bg-gray-100 px-2 py-0.5 rounded">
                              {match.curriculum_subject?.units || 0}u
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <Badge className={match.source === 'tor' ? 'bg-blue-50 text-blue-700 border-blue-200 text-xs' : 'bg-purple-50 text-purple-700 border-purple-200 text-xs'}>
                              {match.source === 'tor' ? 'TOR' : 'Work Exp'}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <Badge className={getConfidenceColor(match.confidence)}>
                              {match.confidence.toFixed(0)}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl">
              <h3 className="font-semibold text-gray-900 text-sm mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-maroon" />
                Department Chair & Committee Endorsement
              </h3>
              {application?.evaluator_note ? (
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200 italic">
                  "{application.evaluator_note}"
                </p>
              ) : (
                <p className="text-xs text-gray-500 italic">
                  This accreditation decision has been officially approved and recorded under the CIT-U ETEEAP Guidelines.
                </p>
              )}
            </Card>

            <div className="flex items-center justify-between flex-wrap gap-4 pt-4 border-t border-gray-200">
              <Button
                onClick={() => navigate('/evaluator')}
                variant="outline"
                className="px-6 border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Evaluator Queue
              </Button>

              <Button
                onClick={downloadApprovedAsPDF}
                className="bg-maroon hover:bg-maroon/90 text-white font-semibold px-6 shadow-xs flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Official PDF Report
              </Button>
            </div>
          </div>
        )}

        {/* Audit Mode Notification */}
        {finalizationComplete && showFullReview && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-sm text-amber-900 font-medium">
              <AlertCircle className="w-4 h-4 text-amber-700" />
              <span>Viewing in Audit Mode (Application is Finalized & Certified)</span>
            </div>
            <Button
              onClick={() => setShowFullReview(false)}
              className="bg-maroon text-white text-xs px-4"
              data-testid="exit-audit-view-btn"
            >
              Back to Summary View
            </Button>
          </div>
        )}

        {/* Main Evaluator Review Workspace */}
        {(!finalizationComplete || showFullReview) && (
          <>
            {/* Header */}
            <div className="mb-6">
              <Button variant="ghost" onClick={() => navigate('/evaluator')} className="mb-4 -ml-2" data-testid="back-to-queue-btn">
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
                <Badge className="text-base px-3 py-1 uppercase" variant="outline">
                  {application?.status?.replace('_', ' ')}
                </Badge>
              </div>
            </div>

            {/* Top Applicant Overview Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Card 1: Personal Info & Summary */}
              <Card className="p-4 border-gray-200 bg-white shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-serif font-semibold text-sm flex items-center gap-1.5 text-gray-900">
                    <User className="w-4 h-4 text-maroon" />
                    Personal Info
                  </h3>
                  {appSummary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={loadApplicantSummary}
                      disabled={summaryLoading}
                      className="text-[11px] h-6 px-2 text-maroon hover:bg-maroon/10"
                    >
                      {summaryLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1 text-maroon" />}
                      Summary
                    </Button>
                  )}
                </div>
                <div className="space-y-1 text-xs text-gray-700">
                  {application?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>{application.phone}</span>
                    </div>
                  )}
                  {application?.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span className="line-clamp-1">{application.address}</span>
                    </div>
                  )}
                  {application?.birth_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>{new Date(application.birth_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {appSummary?.summary && (
                    <div className="text-[11px] text-gray-600 bg-gray-50 p-2 rounded border border-gray-200 mt-1 line-clamp-2">
                      {appSummary.summary}
                    </div>
                  )}
                </div>
              </Card>

              {/* Card 2: Uploaded Documents */}
              <Card className="p-4 border-gray-200 bg-white shadow-2xs">
                <h3 className="font-serif font-semibold text-sm mb-2 flex items-center gap-1.5 text-gray-900">
                  <FileText className="w-4 h-4 text-maroon" />
                  Uploaded Documents ({application?.documents?.length || 0})
                </h3>
                <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                  {application?.documents?.length > 0 ? (
                    application.documents.map((doc) => (
                      <button 
                        key={doc.id} 
                        onClick={() => openDocumentPreview(doc)}
                        className="w-full text-left text-xs bg-gray-50 hover:bg-maroon/5 hover:border-maroon/30 border border-transparent rounded p-1.5 transition-colors group flex items-center justify-between gap-2" 
                        data-testid={`doc-preview-${doc.id}`}
                      >
                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-gray-800 text-[11px] truncate block">{doc.file_name}</span>
                          <span className="text-[10px] text-gray-500 capitalize">{doc.document_type?.replace('_', ' ')} · {Math.round((doc.file_size || 0) / 1024)} KB</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {doc.ocr_status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                          {doc.ocr_status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-yellow-600" />}
                          {doc.ocr_status === 'failed' && <XCircle className="w-3 h-3 text-red-600" />}
                          <Eye className="w-3.5 h-3.5 text-gray-400 group-hover:text-maroon" />
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 italic">No documents uploaded</p>
                  )}
                </div>
              </Card>

              {/* Card 3: Work Experience */}
              <Card className="p-4 border-gray-200 bg-white shadow-2xs">
                <h3 className="font-serif font-semibold text-sm mb-2 flex items-center gap-1.5 text-gray-900">
                  <Briefcase className="w-4 h-4 text-purple-700" />
                  Work Experience ({application?.work_experiences?.length || 0})
                </h3>
                <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                  {application?.work_experiences?.length > 0 ? (
                    application.work_experiences.map((exp) => (
                      <div key={exp.id} className="text-xs p-1.5 rounded bg-purple-50/60 border border-purple-100" data-testid={`work-exp-${exp.id}`}>
                        <div className="font-semibold text-purple-950 text-[11px] truncate">{exp.job_title}</div>
                        <div className="text-[10px] text-purple-700">{exp.company_name} · {exp.years} years</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 italic">No work experience listed</p>
                  )}
                </div>
              </Card>
            </div>

            {/* Side-by-Side Main Evaluation Workspace */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              {/* LEFT COLUMN: Subject Matches & Unmatched Scanned Subjects */}
              <div
                className="space-y-6 xl:sticky xl:top-6 panel-scroll"
                style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' }}
              >
                <Card className="p-5 border-gray-200 bg-white shadow-2xs">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <h3 className="font-serif font-semibold text-lg flex items-center gap-2 text-gray-900">
                      <BookOpen className="w-5 h-5 text-maroon" />
                      Subject Matches ({pendingMatchesList.length})
                    </h3>
                    <div className="flex gap-2 flex-wrap">
                      {!isFinalized && pendingTorMatches.length > 0 && (
                        <Button 
                          onClick={handleApproveAllTorMatches}
                          disabled={actioning}
                          size="sm"
                          variant="outline"
                          className="border-green-300 text-green-600 hover:bg-green-50 text-xs h-8"
                          data-testid="approve-all-tor-btn"
                        >
                          {actioning ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                          Approve All TOR ({pendingTorMatches.length})
                        </Button>
                      )}
                      {!isFinalized && (
                        <Button 
                          onClick={handleRunAI}
                          disabled={actioning}
                          size="sm"
                          variant="outline"
                          className="border-maroon text-maroon hover:bg-maroon hover:text-white text-xs h-8"
                          data-testid="run-ai-eval-btn-top"
                        >
                          {actioning ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                          {matches.length === 0 ? 'Run AI Evaluation' : 'Re-run AI'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* ── TOR Extraction Smart Summary ── */}
                  {torSubjects && torSubjects.length > 0 && (() => {
                    const totalExtracted   = torSubjects.length;
                    const totalUnits       = torSubjects.reduce((s, t) => s + Number(t.units || 0), 0);
                    const approvedCount    = approvedMatchesList.length;
                    const approvedUnits    = approvedMatchesList.reduce((s, m) => s + Number(m.curriculum_subject?.units || 0), 0);
                    const rejectedCount    = rejectedMatchesList.length;
                    const pendingCount     = pendingMatchesList.length;
                    const unmatchedCount   = unmatchedTorSubjects.length;
                    const reviewedCount    = approvedCount + rejectedCount;
                    const progressPct      = totalExtracted > 0 ? Math.round((reviewedCount / totalExtracted) * 100) : 0;

                    return (
                      <div className="mb-4 rounded-xl border border-blue-100 bg-gradient-to-br from-slate-50 to-blue-50/60 p-3.5 space-y-3">
                        {/* Title row */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-maroon" />
                            <span className="text-xs font-semibold text-gray-800">TOR Extraction Summary</span>
                          </div>
                          <span className="text-[11px] text-gray-500 italic">
                            {totalExtracted} subject{totalExtracted !== 1 ? 's' : ''} extracted · {totalUnits} total units scanned
                          </span>
                        </div>

                        {/* Stat chips */}
                        <div className="flex flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-[11px] font-semibold text-gray-700">{approvedCount}</span>
                            <span className="text-[11px] text-gray-500">Approved</span>
                            {approvedCount > 0 && (
                              <span className="text-[10px] text-emerald-700 font-medium ml-0.5">({approvedUnits}u credited)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                            <span className="text-[11px] font-semibold text-gray-700">{pendingCount}</span>
                            <span className="text-[11px] text-gray-500">Pending Review</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
                            <div className="w-2 h-2 rounded-full bg-orange-400" />
                            <span className="text-[11px] font-semibold text-gray-700">{unmatchedCount}</span>
                            <span className="text-[11px] text-gray-500">Unmatched</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <span className="text-[11px] font-semibold text-gray-700">{rejectedCount}</span>
                            <span className="text-[11px] text-gray-500">Rejected</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-500 font-medium">Evaluation Progress</span>
                            <span className="text-[10px] font-bold text-gray-700">{progressPct}% reviewed</span>
                          </div>
                          <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${progressPct}%`,
                                background: progressPct === 100
                                  ? 'linear-gradient(90deg, #10b981, #059669)'
                                  : 'linear-gradient(90deg, #7a1e2b, #d4a747)'
                              }}
                            />
                          </div>
                          <div className="text-[10px] text-gray-400 text-right">
                            {reviewedCount} of {totalExtracted} subjects reviewed
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <Tabs defaultValue="all">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <TabsList>
                        <TabsTrigger value="all">All ({pendingMatchesList.length})</TabsTrigger>
                        <TabsTrigger value="tor">From TOR ({pendingTorMatches.length})</TabsTrigger>
                        <TabsTrigger value="work">From Work ({pendingWorkMatches.length})</TabsTrigger>
                      </TabsList>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleExpandAllTerms}
                          className="text-xs h-7 text-gray-600 hover:text-gray-900"
                        >
                          Expand All
                        </Button>
                        <span className="text-gray-300">·</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCollapseAllTerms}
                          className="text-xs h-7 text-gray-600 hover:text-gray-900"
                        >
                          Collapse All
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      {/* TAB: ALL PENDING MATCHES GROUPED BY YEAR & SEMESTER */}
                      <TabsContent value="all" className="space-y-4">
                        {pendingMatchesList.length === 0 ? (
                          <div className="p-8 text-center text-gray-500 text-sm border rounded-lg bg-white shadow-2xs">
                            {approvedMatchesList.length > 0 ? (
                              <div>
                                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-80" />
                                <div className="font-semibold text-gray-800 mb-1">All matched subjects have been approved!</div>
                                <div className="text-xs text-gray-500">
                                  Check the <strong>Approved Subjects</strong> table on the right for credited courses and PDF export.
                                </div>
                              </div>
                            ) : (
                              'No subjects matched yet. Match subjects from the Unmatched Applicant Scanned Subjects table below.'
                            )}
                          </div>
                        ) : (
                          <>
                            {termGroups.map((group) => {
                              const isExpanded = !!expandedTerms[group.key];
                              const groupMatches = group.subjects
                                .map(s => matches.find(m => m.tor_subject?.id === s.id && m.curriculum_subject && m.status === 'pending'))
                                .filter(Boolean);
                              
                              if (groupMatches.length === 0) return null;

                              const groupTotalUnits = groupMatches.reduce(
                                (sum, m) => sum + Number(m.curriculum_subject?.units || m.tor_subject?.units || 0),
                                0
                              );

                              return (
                                <div key={group.key} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                                  {/* Semester Accordion Dropdown Header */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTerm(group.key)}
                                    className="w-full flex items-center justify-between p-3.5 bg-gray-50/80 hover:bg-gray-100/90 transition-colors text-left border-b border-gray-200"
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div className="p-1 rounded bg-white border border-gray-200 text-gray-600">
                                        {isExpanded ? (
                                          <ChevronDown className="w-4 h-4 text-maroon" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4 text-gray-500" />
                                        )}
                                      </div>
                                      <span className="font-semibold text-sm text-gray-900">
                                        {group.title}
                                      </span>
                                      <Badge variant="outline" className="text-xs bg-white font-medium">
                                        {groupMatches.length} {groupMatches.length === 1 ? 'Pending Subject' : 'Pending Subjects'} · {groupTotalUnits} Units
                                      </Badge>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                                        {groupMatches.length} Pending
                                      </Badge>
                                    </div>
                                  </button>

                                  {/* Dropped Down Subjects of That Semester */}
                                  {isExpanded && (
                                    <div className="p-4 space-y-3 bg-gray-50/30">
                                      {group.subjects.map((subj) => {
                                        const match = matches.find(
                                          m => m.tor_subject?.id === subj.id && m.curriculum_subject && m.status === 'pending'
                                        );
                                        if (!match) return null;
                                        return (
                                          <SubjectMatchCard
                                            key={subj.id}
                                            subject={subj}
                                            match={match}
                                            onApprove={handleApproveMatch}
                                            onReject={handleRejectMatch}
                                            getConfidenceColor={getConfidenceColor}
                                            disabled={isFinalized}
                                            documents={application?.documents || []}
                                            onOpenTorEvidence={(m) => {
                                              const evidence = buildTorEvidence(m, application?.documents || []);
                                              setTorEvidenceMatch({ match: m, evidence });
                                            }}
                                            torSubjects={availableTorSubjects}
                                            workExperiences={availableWorkExperiences}
                                            availableCurriculum={availableCurriculumSubjects}
                                            onManualMatch={handleManualMatchTorToCurriculum}
                                            onReassign={loadData}
                                            onBrowseModal={setBrowseModalTarget}
                                            onRemoveMatch={setRemoveMatchId}
                                          />
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Pending Work matches in All tab */}
                            {pendingWorkMatches.length > 0 && (
                              <div className="space-y-3 pt-2">
                                <div className="flex items-center gap-2 pb-1 border-b border-gray-200">
                                  <Briefcase className="w-4 h-4 text-purple-700" />
                                  <h4 className="font-semibold text-sm text-gray-900">Pending Work Experience Review ({pendingWorkMatches.length})</h4>
                                </div>
                                {pendingWorkMatches.map((match) => (
                                  <WorkMatchCard
                                    key={match.id}
                                    match={match}
                                    onApprove={handleApproveMatch}
                                    onReject={handleRejectMatch}
                                    getConfidenceColor={getConfidenceColor}
                                    disabled={isFinalized}
                                    onBrowseModal={setBrowseModalTarget}
                                    onRemoveMatch={setRemoveMatchId}
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* TAB: FROM TOR */}
                      <TabsContent value="tor" className="space-y-4">
                        {pendingTorMatches.length === 0 ? (
                          <div className="p-8 text-center text-gray-500 text-sm border rounded-lg bg-white shadow-2xs">
                            {approvedMatchesList.filter(m => m.source === 'tor').length > 0 ? (
                              <div>
                                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-80" />
                                <div className="font-semibold text-gray-800 mb-1">All transcript subject matches have been approved!</div>
                                <div className="text-xs text-gray-500">
                                  Check the <strong>Approved Subjects</strong> table on the right for credited courses and PDF export.
                                </div>
                              </div>
                            ) : (
                              'No transcript subjects matched yet. Match subjects from the Unmatched Applicant Scanned Subjects table below.'
                            )}
                          </div>
                        ) : (
                          termGroups.map((group) => {
                            const isExpanded = !!expandedTerms[group.key];
                            const groupMatches = group.subjects
                              .map(s => matches.find(m => m.tor_subject?.id === s.id && m.curriculum_subject && m.status === 'pending'))
                              .filter(Boolean);
                            
                            if (groupMatches.length === 0) return null;

                            const groupTotalUnits = groupMatches.reduce(
                              (sum, m) => sum + Number(m.curriculum_subject?.units || m.tor_subject?.units || 0),
                              0
                            );

                            return (
                              <div key={group.key} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => handleToggleTerm(group.key)}
                                  className="w-full flex items-center justify-between p-3.5 bg-gray-50/80 hover:bg-gray-100/90 transition-colors text-left border-b border-gray-200"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="p-1 rounded bg-white border border-gray-200 text-gray-600">
                                      {isExpanded ? <ChevronDown className="w-4 h-4 text-maroon" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                    </div>
                                    <span className="font-semibold text-sm text-gray-900">{group.title}</span>
                                    <Badge variant="outline" className="text-xs bg-white font-medium">
                                      {groupMatches.length} {groupMatches.length === 1 ? 'Pending Subject' : 'Pending Subjects'} · {groupTotalUnits} Units
                                    </Badge>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                                      {groupMatches.length} Pending
                                    </Badge>
                                  </div>
                                </button>

                                {isExpanded && (
                                  <div className="p-4 space-y-3 bg-gray-50/30">
                                    {group.subjects.map((subj) => {
                                      const match = matches.find(
                                        m => m.tor_subject?.id === subj.id && m.curriculum_subject && m.status === 'pending'
                                      );
                                      if (!match) return null;
                                      return (
                                        <SubjectMatchCard
                                          key={subj.id}
                                          subject={subj}
                                          match={match}
                                          onApprove={handleApproveMatch}
                                          onReject={handleRejectMatch}
                                          getConfidenceColor={getConfidenceColor}
                                          disabled={isFinalized}
                                          documents={application?.documents || []}
                                          onOpenTorEvidence={(m) => {
                                            const evidence = buildTorEvidence(m, application?.documents || []);
                                            setTorEvidenceMatch({ match: m, evidence });
                                          }}
                                          torSubjects={availableTorSubjects}
                                          workExperiences={availableWorkExperiences}
                                          availableCurriculum={availableCurriculumSubjects}
                                          onManualMatch={handleManualMatchTorToCurriculum}
                                          onReassign={loadData}
                                          onBrowseModal={setBrowseModalTarget}
                                          onRemoveMatch={setRemoveMatchId}
                                        />
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </TabsContent>

                      {/* TAB: FROM WORK */}
                      <TabsContent value="work" className="space-y-4">
                        {/* Multi-Crediting Evaluator Tool for Work Experience */}
                        {!isFinalized && availableWorkExperiences.length > 0 && availableCurriculumSubjects.length > 0 && (
                          <Card className="p-4 bg-purple-50/70 border border-purple-200 rounded-lg shadow-2xs mb-3 space-y-2">
                            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                              <h4 className="font-semibold text-purple-950 text-xs flex items-center gap-1.5">
                                <Briefcase className="w-3.5 h-3.5 text-purple-700" />
                                Credit Work Experience to BSIT Course (Multi-Subject Crediting)
                              </h4>
                              <span className="text-[11px] text-purple-700 font-medium">
                                A single work experience role can credit multiple BSIT subjects
                              </span>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                              {availableWorkExperiences.length > 1 ? (
                                <select
                                  className="border border-purple-300 text-xs rounded px-2.5 py-1.5 bg-white text-gray-800 flex-1 min-w-[200px] focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  value={workCreditTarget.workId || availableWorkExperiences[0]?.id || ''}
                                  onChange={(e) => setWorkCreditTarget(prev => ({ ...prev, workId: e.target.value }))}
                                >
                                  {availableWorkExperiences.map(w => (
                                    <option key={w.id} value={w.id}>
                                      {w.job_title} at {w.company_name} ({w.years} yrs)
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="text-xs font-medium text-purple-950 bg-white border border-purple-200 px-3 py-1.5 rounded flex-1">
                                  {availableWorkExperiences[0]?.job_title} at {availableWorkExperiences[0]?.company_name} ({availableWorkExperiences[0]?.years} yrs)
                                </div>
                              )}

                              <Button
                                size="sm"
                                onClick={() => {
                                  const targetWork = availableWorkExperiences.find(w => String(w.id) === String(workCreditTarget.workId || availableWorkExperiences[0]?.id));
                                  if (targetWork) {
                                    setBrowseModalTarget({ workExperience: targetWork });
                                  }
                                }}
                                className="bg-purple-700 hover:bg-purple-800 text-white text-xs h-8 px-4 flex-shrink-0 flex items-center gap-1.5 font-medium shadow-2xs"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                                Browse Curriculum to Credit
                              </Button>
                            </div>
                          </Card>
                        )}

                        {pendingWorkMatches.length === 0 ? (
                          <div className="p-8 text-center text-gray-500 text-sm border rounded-lg bg-white shadow-2xs">
                            {approvedMatchesList.filter(m => m.source === 'work_experience').length > 0 ? (
                              <div>
                                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-80" />
                                <div className="font-semibold text-gray-800 mb-1">All work experience matches have been approved!</div>
                                <div className="text-xs text-gray-500">
                                  Check the <strong>Approved Subjects</strong> table on the right for credited courses and PDF export.
                                </div>
                              </div>
                            ) : (
                              'No BSIT courses currently pending review from work experience. Click "Browse Curriculum to Credit" above to credit from applicant\'s work experience.'
                            )}
                          </div>
                        ) : (
                          pendingWorkMatches.map((match) => (
                            <WorkMatchCard
                              key={match.id}
                              match={match}
                              onApprove={handleApproveMatch}
                              onReject={handleRejectMatch}
                              getConfidenceColor={getConfidenceColor}
                              disabled={isFinalized}
                              availableCurriculum={availableCurriculumSubjects}
                              onReassign={loadData}
                              onBrowseModal={setBrowseModalTarget}
                              onRemoveMatch={setRemoveMatchId}
                            />
                          ))
                        )}
                      </TabsContent>
                    </div>
                  </Tabs>
                </Card>

                {/* Unmatched Applicant Scanned Subjects Table */}
                {unmatchedTorSubjects.length > 0 && (
                  <UnmatchedApplicantSubjectsTable
                    unmatchedSubjects={unmatchedTorSubjects}
                    onBrowseSubject={(subj) => setBrowseModalTarget({ subject: subj })}
                    onDisregard={!isFinalized ? handleDisregardUnmatched : null}
                    isFinalized={isFinalized}
                    onPreviewTor={openDocumentPreview}
                    documents={application?.documents || []}
                  />
                )}
              </div>

              {/* RIGHT COLUMN: Department Chair Decision (Summary of Approved & Rejected Subjects) */}
              <div
                className="space-y-6 xl:sticky xl:top-6 panel-scroll"
                style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' }}
              >
                {!isFinalized && (
                  <Card className="p-5 border-gray-200 shadow-sm bg-white space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-200">
                      <div>
                        <h3 className="font-serif font-semibold text-lg text-gray-900 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-maroon" />
                          Department Chair Decision
                        </h3>
                        <p className="text-xs text-gray-500">Live accreditation summary & official certification records</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-xs px-2.5 py-1">
                          {totalApprovedUnits} Units Credited ({approvedMatchesList.length} Subjects)
                        </Badge>
                        {approvedMatchesList.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={downloadApprovedAsPDF}
                            className="text-xs h-7 flex items-center gap-1.5 border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            PDF
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Summary Tables: Approved & Rejected */}
                    <div className="space-y-4">
                      {/* Approved Subjects Table */}
                      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                        <div className="mb-2.5 flex items-center justify-between flex-wrap gap-2">
                          <h4 className="font-semibold text-blue-950 flex items-center gap-1.5 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Approved Subjects ({approvedMatchesList.length})
                          </h4>
                          <span className="text-xs text-blue-800 bg-blue-100/90 px-2 py-0.5 rounded-full font-semibold">
                            {totalApprovedUnits} Units
                          </span>
                        </div>

                        {approvedMatchesList.length === 0 ? (
                          <div className="p-6 text-center text-xs text-gray-500 bg-white rounded-lg border border-blue-100 italic">
                            No subjects approved yet. Review matched subjects on the left and click "Approve" to record accreditation.
                          </div>
                        ) : (
                          <div
                            className="overflow-x-auto border border-blue-200 rounded-lg bg-white shadow-2xs table-scroll"
                            style={{ maxHeight: '260px', overflowY: 'auto' }}
                          >
                            <table className="w-full text-xs">
                              <thead className="bg-blue-100/80 border-b border-blue-200 text-blue-950 font-semibold uppercase tracking-wider text-[11px] sticky top-0 z-10">
                                <tr>
                                  <th className="text-left py-2.5 px-3 w-[26%]">BSIT Subject</th>
                                  <th className="text-left py-2.5 px-3 w-[40%]">Applicant Evidence</th>
                                  <th className="text-center py-2.5 px-2 w-[8%]">Units</th>
                                  <th className="text-center py-2.5 px-2 w-[10%]">Source</th>
                                  <th className="text-center py-2.5 px-2 w-[16%]">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-blue-100/70">
                                {approvedMatchesList.map((match) => (
                                  <tr key={match.id} className="hover:bg-blue-50/40 transition-colors">
                                    <td className="py-2.5 px-3 align-top">
                                      <div className="font-mono font-bold text-blue-700 text-xs">{match.curriculum_subject?.code || 'N/A'}</div>
                                      <div className="text-[11px] text-gray-800 font-medium leading-tight mt-0.5">{match.curriculum_subject?.title || 'N/A'}</div>
                                    </td>
                                    <td className="py-2.5 px-3 align-top">
                                      {match.tor_subject ? (
                                        <div className="bg-amber-50/90 border border-amber-200 rounded p-1.5">
                                          <div className="font-semibold text-amber-950 text-[11px]">
                                            {match.tor_subject.code} - {match.tor_subject.title}
                                          </div>
                                          <div className="text-amber-800 text-[10px] mt-0.5 flex items-center gap-1.5">
                                            <span>Units: <strong>{match.tor_subject.units || 0}u</strong></span>
                                            <span>·</span>
                                            <span>Grade: <strong>{match.tor_subject.grade || 'Passed'}</strong></span>
                                          </div>
                                        </div>
                                      ) : match.work_experience ? (
                                        <div className="bg-purple-50/90 border border-purple-200 rounded p-1.5">
                                          <div className="font-semibold text-purple-950 text-[11px]">
                                            {match.work_experience.job_title}
                                          </div>
                                          <div className="text-purple-800 text-[10px] mt-0.5">
                                            {match.work_experience.company_name} ({match.work_experience.years || 0} yrs)
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 italic text-[11px]">None</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2 align-middle text-center font-bold text-gray-800 text-xs">
                                      {match.curriculum_subject?.units || 0}u
                                    </td>
                                    <td className="py-2.5 px-2 align-middle text-center">
                                      <Badge variant="outline" className={`text-[10px] font-medium px-1.5 py-0.5 ${match.source === 'tor' ? 'border-amber-300 text-amber-800 bg-amber-50' : 'border-purple-300 text-purple-800 bg-purple-50'}`}>
                                        {match.source === 'tor' ? 'TOR' : 'Work'}
                                      </Badge>
                                    </td>
                                    <td className="py-2.5 px-2 align-middle text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-6 px-2 text-[11px] text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 font-medium flex items-center gap-1"
                                          onClick={() => setBrowseModalTarget({ match })}
                                          title="Browse and change BSIT curriculum course"
                                        >
                                          <BookOpen className="w-3 h-3 text-blue-600" />
                                          Browse / Edit
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-6 px-1.5 text-[11px] text-red-700 bg-red-50 hover:bg-red-100 border-red-200 font-medium"
                                          onClick={() => setRemoveMatchId(match.id)}
                                          title="Remove match"
                                        >
                                          <Trash2 className="w-3 h-3 text-red-600" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Rejected Subjects Table */}
                      {rejectedMatchesList.length > 0 && (
                        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                          <div className="mb-2.5 flex items-center justify-between flex-wrap gap-2">
                            <h4 className="font-semibold text-red-950 flex items-center gap-1.5 text-sm">
                              <XCircle className="w-4 h-4 text-red-600" />
                              Rejected Subjects ({rejectedMatchesList.length})
                            </h4>
                            <span className="text-xs text-red-800 bg-red-100/90 px-2 py-0.5 rounded-full font-medium">
                              Not Credited
                            </span>
                          </div>

                          <div
                            className="overflow-x-auto border border-red-200 rounded-lg bg-white shadow-2xs table-scroll"
                            style={{ maxHeight: '260px', overflowY: 'auto' }}
                          >
                            <table className="w-full text-xs">
                              <thead className="bg-red-100/80 border-b border-red-200 text-red-950 font-semibold uppercase tracking-wider text-[11px] sticky top-0 z-10">
                                <tr>
                                  <th className="text-left py-2.5 px-3 w-[30%]">Applicant Subject</th>
                                  <th className="text-left py-2.5 px-3 w-[45%]">Reason</th>
                                  <th className="text-center py-2.5 px-2 w-[25%]">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-red-100/70">
                                {rejectedMatchesList.map((match) => (
                                  <tr key={match.id} className="hover:bg-red-50/40 transition-colors">
                                    <td className="py-2.5 px-3 align-top">
                                      {match.tor_subject ? (
                                        <>
                                          {/* Primary: Applicant's scanned TOR subject — bold maroon */}
                                          <div className="font-mono font-bold text-[#7a1e2b] text-xs">{match.tor_subject.code}</div>
                                          <div className="text-[11px] text-gray-800 font-medium leading-tight mt-0.5">{match.tor_subject.title}</div>
                                          {/* Secondary: which BSIT subject it was matched to */}
                                          {match.curriculum_subject && (
                                            <div className="mt-1 text-[10px] text-gray-400 italic">
                                              → attempted: {match.curriculum_subject.code} — {match.curriculum_subject.title}
                                            </div>
                                          )}
                                        </>
                                      ) : match.curriculum_subject ? (
                                        <>
                                          <div className="font-mono font-bold text-[#7a1e2b] text-xs">{match.curriculum_subject.code}</div>
                                          <div className="text-[11px] text-gray-800 font-medium leading-tight mt-0.5">{match.curriculum_subject.title}</div>
                                        </>
                                      ) : (
                                        <div className="text-[11px] text-gray-400">N/A</div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 align-top text-[11px] text-red-900 italic">
                                      {match.evaluator_note || 'Rejected by evaluator'}
                                    </td>
                                    <td className="py-2.5 px-2 align-middle text-center">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 px-2 text-[11px] text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 font-medium"
                                        onClick={() => setBrowseModalTarget({ match })}
                                      >
                                        Reconsider
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      <label className="text-xs font-semibold text-gray-700 block mb-1">
                        Department Chair Notes & Endorsement:
                      </label>
                      <Textarea
                        placeholder="Add remarks or notes for official accreditation records..."
                        value={evaluatorNote}
                        onChange={(e) => setEvaluatorNote(e.target.value)}
                        rows={2}
                        className="text-xs mb-3"
                        data-testid="evaluator-note-input"
                      />
                    </div>

                    <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-200">
                      <Button 
                        onClick={handleFinalize}
                        disabled={actioning || approvedMatchesList.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-4 flex items-center font-medium shadow-2xs"
                        data-testid="finalize-btn"
                      >
                        {actioning ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                        Finalize Accreditation ({totalApprovedUnits} Units)
                      </Button>
                      <Button 
                        onClick={handleReject}
                        disabled={actioning}
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50 text-xs h-8 px-3"
                        data-testid="reject-btn"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Reject Application
                      </Button>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Document Preview Modal */}
      <DocumentPreviewModal 
        document={previewDoc} 
        open={!!previewDoc} 
        focusSubject={previewFocus}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewFocus(null);
        }} 
      />

      {/* TOR Evidence Modal */}
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

      {/* Remove Match Modal */}
      <Dialog
        open={!!removeMatchId}
        onOpenChange={(open) => !open && setRemoveMatchId(null)}
      >
        <DialogContent className="max-w-md" data-testid="remove-match-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5 text-red-600" />
              Remove Subject Match?
            </DialogTitle>
          </DialogHeader>
          
          {(() => {
            const matchToRemove = matches.find(m => m.id === removeMatchId);
            if (!matchToRemove) return null;
            return (
              <div className="space-y-3 py-2">
                <p className="text-sm text-gray-600">
                  Are you sure you want to remove this match? The BSIT curriculum subject will return to uncredited status, and the applicant's evidence will become available again.
                </p>
                <div className="p-3 bg-red-50/80 border border-red-200 rounded-lg text-xs space-y-1.5">
                  <div>
                    <span className="font-semibold text-red-950">BSIT Subject:</span>{' '}
                    <span className="font-mono font-bold text-red-700">{matchToRemove.curriculum_subject?.code}</span> - {matchToRemove.curriculum_subject?.title} ({matchToRemove.curriculum_subject?.units}u)
                  </div>
                  <div>
                    <span className="font-semibold text-red-950">Matched Evidence:</span>{' '}
                    {matchToRemove.tor_subject ? (
                      <span className="text-amber-900 font-medium">
                        {matchToRemove.tor_subject.code} - {matchToRemove.tor_subject.title} ({matchToRemove.tor_subject.units}u)
                      </span>
                    ) : matchToRemove.work_experience ? (
                      <span className="text-purple-900 font-medium">
                        {matchToRemove.work_experience.job_title} at {matchToRemove.work_experience.company_name} ({matchToRemove.work_experience.years} yrs)
                      </span>
                    ) : (
                      <span className="italic text-gray-500">None</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRemoveMatchId(null)} disabled={actioning}>
              Cancel
            </Button>
            <Button
              onClick={handleRemoveMatch}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={actioning}
              data-testid="confirm-remove-match-btn"
            >
              {actioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {actioning ? 'Removing...' : 'Confirm Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified Curriculum Browser Modal for Matching & Editing */}
      <CurriculumMatchModal
        open={!!browseModalTarget}
        onClose={() => setBrowseModalTarget(null)}
        subject={browseModalTarget?.subject}
        match={browseModalTarget?.match}
        workExperience={browseModalTarget?.workExperience}
        availableCurriculum={availableCurriculumSubjects}
        applicationId={application?.id}
        onMatched={() => {
          setBrowseModalTarget(null);
          loadData();
        }}
      />

      {/* Reject Dialog */}
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
              Enter a short reason why this subject match is being rejected. This note will be recorded for evaluation records.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Quick Reason Presets:</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Insufficient units (applicant units < curriculum requirement)',
                  'Course syllabus does not align with BSIT curriculum competencies',
                  'Grade does not meet the minimum passing crediting requirement',
                  'Incomplete course syllabus documentation / missing proof'
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="text-[11px] bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded px-2 py-1 transition-colors text-left"
                    onClick={() => setRejectReason(preset)}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Type reason or select a preset above..."
              className="min-h-[100px] text-xs"
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

      {/* Disregard Unmatched Subject Dialog */}
      <Dialog
        open={disregardDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDisregardDialogOpen(false);
            setDisregardSubject(null);
            setDisregardReason('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-800">
              <XCircle className="w-5 h-5 text-red-600" />
              Disregard Subject
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {disregardSubject && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <div className="font-mono font-bold text-[#7a1e2b] text-sm">{disregardSubject.code}</div>
                <div className="text-xs text-gray-700 mt-0.5">{disregardSubject.title}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{disregardSubject.units || 0} units · {disregardSubject.term_label || ''}</div>
              </div>
            )}

            <p className="text-xs text-gray-600">
              This subject has no applicable BSIT curriculum equivalent. Disregarding will move it out of the Unmatched list and record it under
              <strong> Rejected Subjects</strong>.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700">Quick Presets:</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Not applicable to any BSIT curriculum subject',
                  'General education subject with no BSIT equivalent',
                  'Religious / PE subject not credited in BSIT program',
                  'Duplicate or remedial subject — not creditable',
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="text-[11px] bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 rounded px-2 py-1 transition-colors text-left"
                    onClick={() => setDisregardReason(preset)}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              value={disregardReason}
              onChange={(e) => setDisregardReason(e.target.value)}
              placeholder="Optional: type a reason or select a preset above..."
              className="min-h-[80px] text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisregardDialogOpen(false)}
              disabled={disregarding}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitDisregard}
              className="bg-red-700 hover:bg-red-800 text-white"
              disabled={disregarding}
            >
              {disregarding ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Disregarding...</> : 'Disregard Subject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Applicant Summary Modal */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto" data-testid="applicant-summary-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-maroon" />
              Applicant Summary
            </DialogTitle>
          </DialogHeader>

          {appSummary && (
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* --- EXACT MATCH CARD COMPONENT --- */
const SubjectMatchCard = ({
  subject,
  match,
  onApprove,
  onReject,
  getConfidenceColor,
  disabled,
  documents,
  onOpenTorEvidence,
  onBrowseModal,
  onRemoveMatch
}) => {
  if (!match || !match.curriculum_subject) return null;

  const isApproved = match.status === 'approved';
  const isPending = match.status === 'pending';
  const isRejected = match.status === 'rejected';

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-2xs space-y-3">
      {/* Top Header Row: Badges on Left, Actions on Right */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={getConfidenceColor(match.confidence)}>
            {match.confidence ? match.confidence.toFixed(0) : 100}%
          </Badge>

          <Badge variant="outline" className="text-xs">
            <FileText className="w-3 h-3 mr-1" /> TOR
          </Badge>

          {isApproved && (
            <Badge className="bg-emerald-100 text-emerald-800 text-xs font-semibold">
              Approved
            </Badge>
          )}
          {isPending && (
            <Badge className="bg-amber-100 text-amber-800 text-xs font-semibold">
              Pending Review
            </Badge>
          )}
          {isRejected && (
            <Badge className="bg-red-100 text-red-800 text-xs font-semibold">
              Rejected
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        {!disabled && (
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {isPending && (
              <>
                <button
                  type="button"
                  onClick={() => onApprove(match.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onReject(match.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5 text-red-600" />
                  Reject
                </button>
              </>
            )}

            {isApproved && (
              <button
                type="button"
                onClick={() => onRemoveMatch(match.id)}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                title="Remove match"
              >
                <Trash2 className="w-3 h-3 text-red-600" />
                Remove
              </button>
            )}

            {/* Browse / Change Match Button */}
            <Button
              size="sm"
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50 h-7 text-xs px-2.5 flex items-center gap-1 font-medium transition-colors"
              onClick={() => onBrowseModal && onBrowseModal({ subject, match })}
              title="Browse BSIT curriculum courses to change match"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-600 mr-0.5" />
              Browse / Change Match
            </Button>
          </div>
        )}
      </div>

      {/* Blue Box: BSIT Curriculum */}
      <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg">
        <div className="text-xs font-semibold text-blue-700 mb-1">BSIT Curriculum:</div>
        <div className="text-sm font-semibold text-gray-900">
          <span>{match.curriculum_subject.code}</span>
          <span className="ml-2 font-normal text-gray-800">{match.curriculum_subject.title}</span>
          <span className="ml-1.5 text-xs text-gray-600 font-normal">({match.curriculum_subject.units}u)</span>
        </div>
      </div>

      {/* Amber Box: Applicant's TOR Subject */}
      <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg">
        <div className="text-xs font-semibold text-amber-800 mb-1">Applicant's TOR Subject:</div>
        <div className="text-xs font-semibold text-gray-900">
          <span>{subject.code}</span>
          <span className="ml-2 font-normal text-gray-800">{subject.title}</span>
          {subject.units ? <span className="ml-1.5 text-gray-600 font-normal">({subject.units}u)</span> : null}
          {subject.grade ? <span className="ml-2 font-semibold text-amber-900">[Grade: {subject.grade}]</span> : null}
        </div>
      </div>

      {/* Evidence and Rationale Button */}
      {match && onOpenTorEvidence && (
        <div className="flex items-center justify-between text-xs pt-1">
          <button
            type="button"
            onClick={() => onOpenTorEvidence(match)}
            className="text-maroon hover:underline flex items-center gap-1 font-medium"
          >
            <Eye className="w-3 h-3" />
            View Matching Evidence & Document Proof
          </button>
          {match.matching_reason && (
            <span className="text-gray-500 text-[11px] truncate max-w-[280px]">
              {match.matching_reason}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/* --- WORK MATCH CARD COMPONENT --- */
const WorkMatchCard = ({
  match,
  onApprove,
  onReject,
  getConfidenceColor,
  disabled,
  onBrowseModal,
  onRemoveMatch
}) => {
  const isApproved = match && match.status === 'approved';
  const isPending = match && match.status === 'pending';
  const isRejected = match && match.status === 'rejected';

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-2xs space-y-3">
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge className={getConfidenceColor(match.confidence)}>
            {match.confidence.toFixed(0)}%
          </Badge>
          <Badge variant="outline" className="text-xs border-purple-200 bg-purple-50 text-purple-700">
            <Briefcase className="w-3 h-3 mr-1 text-purple-600" /> Work
          </Badge>
          {isApproved && (
            <Badge className="bg-emerald-100 text-emerald-800 text-xs font-semibold">
              Approved
            </Badge>
          )}
          {isRejected && (
            <Badge className="bg-red-100 text-red-800 text-xs font-semibold">
              Rejected
            </Badge>
          )}
        </div>

        {!disabled && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {isPending && (
              <>
                <button
                  type="button"
                  onClick={() => onApprove(match.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onReject(match.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5 text-red-600" />
                  Reject
                </button>
              </>
            )}

            {isApproved && (
              <button
                type="button"
                onClick={() => onRemoveMatch(match.id)}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                title="Remove match"
              >
                <Trash2 className="w-3 h-3 text-red-600" />
                Remove
              </button>
            )}

            {/* Browse / Change Match Button */}
            <Button
              size="sm"
              variant="outline"
              className="border-purple-300 text-purple-700 hover:bg-purple-50 h-7 text-xs px-2.5 flex items-center gap-1 font-medium transition-colors"
              onClick={() => onBrowseModal && onBrowseModal({ match })}
              title="Browse BSIT curriculum courses to change match"
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-600 mr-0.5" />
              Browse / Change Match
            </Button>
          </div>
        )}
      </div>

      <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg">
        <div className="text-xs font-semibold text-blue-700 mb-1">BSIT Curriculum:</div>
        <div className="text-sm font-semibold text-gray-900">
          <span>{match.curriculum_subject?.code}</span>
          <span className="ml-2 font-normal text-gray-800">{match.curriculum_subject?.title}</span>
          <span className="ml-1.5 text-xs text-gray-600 font-normal">({match.curriculum_subject?.units}u)</span>
        </div>
      </div>

      <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-lg">
        <div className="text-xs font-semibold text-purple-800 mb-1">Applicant's Work Experience:</div>
        <div className="text-xs font-semibold text-purple-950">
          <span>{match.work_experience?.job_title}</span>
          {match.work_experience?.company_name && (
            <span className="ml-2 font-normal text-purple-800">at {match.work_experience.company_name}</span>
          )}
          <span className="ml-2 font-normal text-purple-700">({match.work_experience?.years} yrs)</span>
        </div>
      </div>

      <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-2">
        <span className="font-semibold">Why matched:</span>{' '}
        {match.matching_reason || `Matched based on relevant industry skills overlap (${match.confidence.toFixed(0)}% confidence).`}
      </div>
    </div>
  );
};

/* --- CURRICULUM BROWSER MODAL FOR MATCHING & EDITING --- */
const CurriculumMatchModal = ({
  open,
  onClose,
  subject,            // when matching an unmatched TOR subject
  match,              // when editing / changing an existing match
  workExperience,     // when crediting from work experience
  availableCurriculum = [],
  applicationId,
  onMatched,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState('all');
  const [submittingId, setSubmittingId] = useState(null);

  // Determine target evidence
  const torSubj = subject || match?.tor_subject;
  const workExp = workExperience || match?.work_experience;
  const isWork = !!workExp && !torSubj;
  const applicantUnits = torSubj ? Number(torSubj.units || 0) : 999;

  if (!open || (!torSubj && !workExp)) return null;

  // Filter curriculum subjects by search query and selected year
  const filteredCurriculum = availableCurriculum.filter((c) => {
    const query = (searchQuery || '').toLowerCase().trim();
    const matchesQuery =
      !query ||
      (c.code || '').toLowerCase().includes(query) ||
      (c.title || '').toLowerCase().includes(query);

    const matchesYear =
      selectedYear === 'all' || String(c.year) === String(selectedYear);

    return matchesQuery && matchesYear;
  });

  const groupedCurriculum = groupCurriculumByYearAndSem(filteredCurriculum);

  const handleMatchAndApprove = async (curriculumSubject) => {
    const reqUnits = Number(curriculumSubject.units || 0);

    // Rule 1: TOR subject units cannot be less than curriculum units
    if (!isWork && applicantUnits < reqUnits) {
      toast.error(
        `Cannot match: Applicant course "${torSubj.code}" has ${applicantUnits} unit(s), but BSIT course "${curriculumSubject.code}" requires ${reqUnits} unit(s).`
      );
      return;
    }

    setSubmittingId(curriculumSubject.id);
    try {
      if (match?.id) {
        // Overriding / reassigning an existing match
        await subjectMatchApi.override(match.id, {
          curriculum_subject_id: curriculumSubject.id,
          note: isWork
            ? 'Reassigned by evaluator to BSIT curriculum from work experience'
            : 'Reassigned by evaluator to BSIT curriculum from transcript subject',
          status: 'approved',
        });
        toast.success(
          `Match updated: "${curriculumSubject.code}" (${curriculumSubject.title}) is now credited.`
        );
      } else if (isWork && workExp?.id && applicationId) {
        // Creating a new match from work experience
        await subjectMatchApi.create({
          application_id: applicationId,
          curriculum_subject_id: curriculumSubject.id,
          work_experience_id: workExp.id,
          note: `Credited by evaluator from work experience (${workExp.job_title})`,
        });
        toast.success(
          `"${curriculumSubject.code}" (${curriculumSubject.title}) credited from "${workExp.job_title}"`
        );
      } else if (torSubj?.id && applicationId) {
        // Creating a new match for an unmatched TOR subject
        await subjectMatchApi.create({
          application_id: applicationId,
          curriculum_subject_id: curriculumSubject.id,
          tor_subject_id: torSubj.id,
          note: 'Manually matched and approved by evaluator',
        });
        toast.success(
          `"${torSubj.code}" matched and approved with "${curriculumSubject.code}" (${curriculumSubject.title})`
        );
      }
      onClose();
      if (onMatched) onMatched();
    } catch (e) {
      toast.error(
        'Failed to save match: ' + (e.response?.data?.error || e.message)
      );
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden" data-testid="curriculum-match-modal">
        {/* Header */}
        <div className="p-5 bg-gray-50 border-b border-gray-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900 text-lg font-serif">
              <BookOpen className="w-5 h-5 text-maroon" />
              {match ? 'Change / Reassign BSIT Curriculum Match' : isWork ? 'Credit BSIT Curriculum from Work Experience' : 'Match BSIT Curriculum Subject'}
            </DialogTitle>
          </DialogHeader>

          {/* Applicant Target Evidence Card */}
          {torSubj ? (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
              <div className="font-semibold text-amber-900 mb-1">Target Applicant Scanned Transcript Subject:</div>
              <div className="flex items-center justify-between gap-2 flex-wrap text-amber-950">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm text-amber-950">{torSubj.code}</span>
                  <span className="font-medium text-gray-900 text-sm">{torSubj.title}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900 font-semibold">
                    {applicantUnits} {applicantUnits === 1 ? 'Unit' : 'Units'}
                  </Badge>
                  {torSubj.grade && (
                    <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900 font-semibold">
                      Grade: {torSubj.grade}
                    </Badge>
                  )}
                  {torSubj.school_year && (
                    <span className="text-gray-500">AY: {torSubj.school_year}</span>
                  )}
                </div>
              </div>
            </div>
          ) : workExp ? (
            <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs">
              <div className="font-semibold text-purple-900 mb-1">Target Applicant Work Experience Evidence:</div>
              <div className="flex items-center justify-between gap-2 flex-wrap text-purple-950">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-purple-950">{workExp.job_title}</span>
                  <span className="font-medium text-purple-800 text-xs">at {workExp.company_name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="border-purple-300 bg-purple-100 text-purple-900 font-semibold">
                    {workExp.years || 0} Years Experience
                  </Badge>
                  <span className="text-purple-700 font-medium">Unlimited Crediting</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Search and Year Filter Bar */}
          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search BSIT course code or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-8 bg-white"
                autoFocus
              />
            </div>

            {/* Year Filter Tabs */}
            <div className="flex items-center gap-1 bg-gray-200/70 p-0.5 rounded-md flex-shrink-0">
              {[
                { id: 'all', label: 'All Years' },
                { id: '1', label: '1st Year' },
                { id: '2', label: '2nd Year' },
                { id: '3', label: '3rd Year' },
                { id: '4', label: '4th Year' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setSelectedYear(pill.id)}
                  className={`text-xs px-2.5 py-1 rounded transition-colors font-medium ${
                    selectedYear === pill.id
                      ? 'bg-maroon text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Curriculum List Grouped by Year and Semester */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 max-h-[55vh]">
          {groupedCurriculum.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              No matching BSIT curriculum subjects found for "{searchQuery}".
            </div>
          ) : (
            groupedCurriculum.map((group) => (
              <div key={group.key} className="space-y-2">
                {/* Year & Semester Section Header */}
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-maroon" />
                    <h4 className="font-serif font-bold text-sm text-gray-900">
                      {group.title}
                    </h4>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">
                    {group.subjects.length} {group.subjects.length === 1 ? 'Subject' : 'Subjects'}
                  </span>
                </div>

                {/* Subject Cards Grid / List */}
                <div className="grid gap-2">
                  {group.subjects.map((curSubj) => {
                    const reqUnits = Number(curSubj.units || 0);
                    const isEligible = isWork || applicantUnits >= reqUnits;
                    const isSubmitting = submittingId === curSubj.id;
                    const isCurrentMatch = match?.curriculum_subject?.id === curSubj.id;

                    return (
                      <div
                        key={curSubj.id}
                        className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap ${
                          isCurrentMatch
                            ? 'border-blue-400 bg-blue-50/70 shadow-xs ring-1 ring-blue-300'
                            : isEligible
                            ? 'border-gray-200 bg-white hover:border-maroon/40 hover:shadow-2xs'
                            : 'border-gray-200 bg-gray-50/60 opacity-80'
                        }`}
                      >
                        {/* Course Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-maroon text-sm">
                              {curSubj.code}
                            </span>
                            <span className="font-semibold text-gray-900 text-xs">
                              {curSubj.title}
                            </span>
                            <Badge variant="outline" className="text-[11px] bg-gray-50 text-gray-700 border-gray-200 font-medium">
                              {reqUnits} Units
                            </Badge>
                            {isCurrentMatch && (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px] font-semibold">
                                Currently Assigned
                              </Badge>
                            )}
                          </div>
                          {curSubj.description && (
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                              {curSubj.description}
                            </p>
                          )}
                        </div>

                        {/* Eligibility Status & Action Button */}
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          {isWork ? (
                            <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-xs font-medium">
                              Eligible (Work Experience)
                            </Badge>
                          ) : isEligible ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                              Eligible ({applicantUnits}u &ge; {reqUnits}u)
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium">
                              Needs {reqUnits}u (Applicant: {applicantUnits}u)
                            </Badge>
                          )}

                          <Button
                            size="sm"
                            disabled={!isEligible || !!submittingId || isCurrentMatch}
                            onClick={() => handleMatchAndApprove(curSubj)}
                            className={
                              isCurrentMatch
                                ? 'bg-blue-600 text-white text-xs h-7 px-3 cursor-default opacity-80'
                                : isEligible
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3 flex items-center gap-1 font-medium shadow-2xs'
                                : 'bg-gray-200 text-gray-500 text-xs h-7 px-3 cursor-not-allowed'
                            }
                          >
                            {isSubmitting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isCurrentMatch ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            {isCurrentMatch ? 'Current' : match ? 'Select & Approve' : 'Match & Approve'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium">
            {availableCurriculum.length} BSIT curriculum subjects available in total
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* --- UNMATCHED APPLICANT SUBJECTS TABLE --- */
const UnmatchedApplicantSubjectsTable = ({
  unmatchedSubjects = [],
  onBrowseSubject,
  onDisregard,
  isFinalized,
  onPreviewTor,
  documents = [],
}) => {
  const torDoc = (documents || []).find((d) => d.document_type === 'tor') || (documents || [])[0];
  const totalUnits = unmatchedSubjects.reduce((sum, s) => sum + Number(s.units || 0), 0);

  return (
    <Card className="p-5 border-amber-200 bg-amber-50/40 shadow-2xs">
      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
        <h3 className="font-serif font-semibold text-amber-950 text-base flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-700" />
          Unmatched Applicant Scanned Subjects ({unmatchedSubjects.length})
        </h3>
        <span className="text-xs text-amber-900 bg-amber-100/90 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold">
          {totalUnits} Units to Review
        </span>
      </div>
      <p className="text-xs text-amber-800 mb-4">
        These applicant transcript subjects have no BSIT curriculum match yet. Click <strong>Browse &amp; Match</strong> to browse courses by year and semester and credit them.
        {onDisregard && <span className="ml-1">Click <strong>Disregard</strong> to reject subjects that are not applicable to any BSIT subject.</span>}
      </p>

      <div className="overflow-x-auto border border-amber-200 rounded-lg bg-white shadow-2xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-amber-100/80 border-b border-amber-200 text-amber-950 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              <th className="py-2.5 px-3 min-w-[240px]">Applicant Scanned Subject</th>
              <th className="py-2.5 px-3 text-right pr-4">{onDisregard ? 'Actions' : 'Curriculum Action'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {unmatchedSubjects.map((subj, idx) => {
              const applicantUnits = Number(subj.units || 0);

              return (
                <tr key={subj.id} className="hover:bg-amber-50/40 transition-colors">
                  <td className="py-3 px-3 text-center text-xs text-amber-800/70 font-medium align-middle">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-3 align-middle">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-amber-950 text-xs">{subj.code}</span>
                      <span className="font-semibold text-gray-900">{subj.title}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="bg-amber-100/90 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                        {applicantUnits} Units
                      </span>
                      {subj.grade && (
                        <span className="text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-medium">
                          Grade: {subj.grade}
                        </span>
                      )}
                      {subj.term_label && (
                        <span className="text-gray-500 italic">
                          {subj.term_label}
                        </span>
                      )}
                      {torDoc && onPreviewTor && (
                        <button
                          type="button"
                          onClick={() =>
                            onPreviewTor(torDoc, {
                              code: subj.code,
                              title: subj.title,
                              grade: subj.grade,
                              units: subj.units,
                            })
                          }
                          className="text-maroon hover:underline inline-flex items-center gap-1 font-medium ml-1"
                        >
                          <Eye className="w-3 h-3" />
                          Proof
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 align-middle text-right pr-4">
                    {!isFinalized && (
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <Button
                          size="sm"
                          className="bg-maroon hover:bg-maroon-dark text-white h-7 text-xs px-3 font-medium inline-flex items-center gap-1.5 shadow-2xs transition-colors"
                          onClick={() => onBrowseSubject(subj)}
                          title="Browse BSIT curriculum courses to match and credit"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          Browse &amp; Match
                        </Button>
                        {onDisregard && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs px-3 font-medium inline-flex items-center gap-1.5 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400 transition-colors"
                            onClick={() => onDisregard(subj)}
                            title="Disregard this subject — not applicable to any BSIT curriculum"
                          >
                            <XCircle className="w-3 h-3" />
                            Disregard
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default EvaluatorReviewPage;

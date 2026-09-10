import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
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
  AlertCircle, BookOpen, User, Calendar, MapPin, Phone, Sparkles, Flag, Eye, Download, Home, Pencil, Trash2
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
  const [editingMatch, setEditingMatch] = useState(null);
  const [finalizationComplete, setFinalizationComplete] = useState(false);
  const [showFullReview, setShowFullReview] = useState(false);
  const approvedTableRef = useRef(null);

  const downloadApprovedAsPDF = () => {
    try {
      const approved = matches.filter(m => m.status === 'approved');
      const rejected = matches.filter(m => m.status === 'rejected');

      if (approved.length === 0 && rejected.length === 0) {
        toast.error('No accreditation records to export');
        return;
      }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
      const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
      const margin = 14;
      const contentWidth = pageWidth - (margin * 2); // 182mm

      let yPos = margin;

      const applicantName = application?.applicant?.full_name || 
        `${application?.applicant?.first_name || ''} ${application?.applicant?.last_name || ''}`.trim() || 'Applicant';
      const programName = application?.program?.name || 'Bachelor of Science in Information Technology';
      const programCode = application?.program?.code || 'BSIT';
      const totalApprovedUnits = approved.reduce((sum, m) => sum + Number(m.curriculum_subject?.units || 0), 0);
      const torApprovedCount = approved.filter(m => m.source === 'tor').length;
      const workApprovedCount = approved.filter(m => m.source === 'work_experience').length;

      // Function to render header banner on each page
      const renderHeader = (isFirstPage = true) => {
        // Top accent bar
        doc.setFillColor(122, 30, 43); // Maroon #7A1E2B
        doc.rect(0, 0, pageWidth, 6, 'F');
        doc.setFillColor(212, 175, 55); // Gold #D4AF37
        doc.rect(0, 6, pageWidth, 1.5, 'F');

        if (isFirstPage) {
          // Institution Header
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

          // Divider Line
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.5);
          doc.line(margin, 32, pageWidth - margin, 32);
        }
      };

      // Render first page header
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

      // Right column metadata
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

      doc.setTextColor(22, 101, 52); // Green
      doc.text(application?.status === 'finalized' ? 'FINALIZED / ACCREDITED' : 'UNDER REVIEW', col2X + 30, yPos + 18.5);

      yPos += 28;

      // Summary KPI Badges
      const kpiWidth = (contentWidth - 6) / 3;
      
      // Approved Box
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(margin, yPos, kpiWidth, 12, 1.5, 1.5, 'F');
      doc.setDrawColor(187, 247, 208);
      doc.roundedRect(margin, yPos, kpiWidth, 12, 1.5, 1.5, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(22, 101, 52);
      doc.text(`Approved: ${approved.length} Subjects`, margin + 4, yPos + 4.8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`${totalApprovedUnits} Units Total Credited`, margin + 4, yPos + 9.2);

      // Sources Box
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(margin + kpiWidth + 3, yPos, kpiWidth, 12, 1.5, 1.5, 'F');
      doc.setDrawColor(191, 219, 254);
      doc.roundedRect(margin + kpiWidth + 3, yPos, kpiWidth, 12, 1.5, 1.5, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 64, 175);
      doc.text(`Evidence Sources`, margin + kpiWidth + 7, yPos + 4.8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`${torApprovedCount} from TOR | ${workApprovedCount} from Work`, margin + kpiWidth + 7, yPos + 9.2);

      // Rejected Box
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(margin + (kpiWidth * 2) + 6, yPos, kpiWidth, 12, 1.5, 1.5, 'F');
      doc.setDrawColor(254, 202, 202);
      doc.roundedRect(margin + (kpiWidth * 2) + 6, yPos, kpiWidth, 12, 1.5, 1.5, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(153, 27, 27);
      doc.text(`Rejected: ${rejected.length} Subjects`, margin + (kpiWidth * 2) + 7, yPos + 4.8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`Not accredited for degree`, margin + (kpiWidth * 2) + 7, yPos + 9.2);

      yPos += 17;

      // Table Drawing Helper
      const drawTableSection = (title, items, isApprovedTable = true) => {
        if (items.length === 0) return;

        // Check space for section title
        if (yPos > pageHeight - 35) {
          doc.addPage();
          renderHeader(false);
          yPos = 16;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(isApprovedTable ? 30 : 153, isApprovedTable ? 64 : 27, isApprovedTable ? 175 : 27);
        doc.text(`${title} (${items.length})`, margin, yPos);
        yPos += 4;

        // Table Columns:
        // 1. BSIT Curriculum Subject -> 50mm
        // 2. Matched Applicant Subject / Evidence -> 76mm
        // 3. Units -> 14mm
        // 4. Source -> 22mm
        // 5. Conf / Reason -> 20mm
        const colW = [50, 76, 14, 22, 20];
        const headers = isApprovedTable 
          ? ['BSIT Curriculum Subject', 'Matched Applicant Subject / Evidence', 'Units', 'Source', 'Confidence']
          : ['BSIT Curriculum Subject', 'Attempted Applicant Subject', 'Units', 'Source', 'Rejection Note'];

        // Header row
        doc.setFillColor(isApprovedTable ? 37 : 185, isApprovedTable ? 99 : 28, isApprovedTable ? 235 : 28);
        doc.rect(margin, yPos, contentWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);

        let currX = margin;
        headers.forEach((h, idx) => {
          const align = (idx === 2 || idx === 3 || (isApprovedTable && idx === 4)) ? 'center' : 'left';
          const textX = align === 'center' ? currX + (colW[idx] / 2) : currX + 2;
          doc.text(h, textX, yPos + 4.8, { align });
          currX += colW[idx];
        });

        yPos += 7;

        items.forEach((match, rowIdx) => {
          const curCode = match.curriculum_subject?.code || 'N/A';
          const curTitle = match.curriculum_subject?.title || 'N/A';
          const curUnits = String(match.curriculum_subject?.units || 0);
          
          let evidenceText = '';
          if (match.tor_subject) {
            evidenceText = `${match.tor_subject.code} - ${match.tor_subject.title} (${match.tor_subject.units || 0}u, Grd: ${match.tor_subject.grade || 'N/A'})`;
          } else if (match.work_experience) {
            evidenceText = `[Work] ${match.work_experience.job_title} at ${match.work_experience.company_name} (${match.work_experience.years || 0}y)`;
          } else {
            evidenceText = 'None recorded';
          }

          const sourceText = match.source === 'tor' ? 'TOR' : 'Work Exp';
          const lastColText = isApprovedTable 
            ? `${match.confidence.toFixed(0)}%` 
            : (match.evaluator_note || (match.tor_subject && Number(match.tor_subject.units || 0) < Number(match.curriculum_subject?.units || 0) ? 'Insufficient Units' : 'Rejected'));

          // Calculate height
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          const curLines = doc.splitTextToSize(`${curCode}\n${curTitle}`, colW[0] - 4);
          const evLines = doc.splitTextToSize(evidenceText, colW[1] - 4);
          const lastLines = doc.splitTextToSize(lastColText, colW[4] - 4);
          const maxLines = Math.max(curLines.length, evLines.length, lastLines.length, 1);
          const rowHeight = Math.max(maxLines * 4 + 3, 7.5);

          // Check for page break
          if (yPos + rowHeight > pageHeight - 25) {
            doc.addPage();
            renderHeader(false);
            yPos = 16;

            // Re-draw table header on new page
            doc.setFillColor(isApprovedTable ? 37 : 185, isApprovedTable ? 99 : 28, isApprovedTable ? 235 : 28);
            doc.rect(margin, yPos, contentWidth, 7, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(255, 255, 255);
            let reX = margin;
            headers.forEach((h, idx) => {
              const align = (idx === 2 || idx === 3 || (isApprovedTable && idx === 4)) ? 'center' : 'left';
              const textX = align === 'center' ? reX + (colW[idx] / 2) : reX + 2;
              doc.text(h, textX, yPos + 4.8, { align });
              reX += colW[idx];
            });
            yPos += 7;
          }

          // Alternating background
          if (rowIdx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, yPos, contentWidth, rowHeight, 'F');
          }

          // Draw border
          doc.setDrawColor(226, 232, 240);
          doc.rect(margin, yPos, contentWidth, rowHeight, 'S');

          // Render columns
          let colX = margin;

          // Col 0: Curriculum Subject (Code in bold, title normal)
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(isApprovedTable ? 29 : 153, isApprovedTable ? 78 : 27, isApprovedTable ? 216 : 27);
          doc.text(curCode, colX + 2, yPos + 3.8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
          const remainingCurLines = doc.splitTextToSize(curTitle, colW[0] - 4);
          remainingCurLines.forEach((line, li) => {
            doc.text(line, colX + 2, yPos + 7.5 + (li * 3.5));
          });
          colX += colW[0];

          // Col 1: Matched Evidence
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(15, 23, 42);
          evLines.forEach((line, li) => {
            doc.text(line, colX + 2, yPos + 4 + (li * 3.5));
          });
          colX += colW[1];

          // Col 2: Units
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          doc.text(curUnits, colX + (colW[2] / 2), yPos + (rowHeight / 2) + 1.2, { align: 'center' });
          colX += colW[2];

          // Col 3: Source Badge
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(match.source === 'tor' ? 146 : 107, match.source === 'tor' ? 64 : 33, match.source === 'tor' ? 14 : 168);
          doc.text(sourceText, colX + (colW[3] / 2), yPos + (rowHeight / 2) + 1.2, { align: 'center' });
          colX += colW[3];

          // Col 4: Confidence or Rejection Note
          if (isApprovedTable) {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(22, 101, 52);
            doc.text(`${match.confidence.toFixed(0)}%`, colX + (colW[4] / 2), yPos + (rowHeight / 2) + 1.2, { align: 'center' });
          } else {
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(153, 27, 27);
            lastLines.forEach((line, li) => {
              doc.text(line, colX + 2, yPos + 4 + (li * 3.5));
            });
          }

          yPos += rowHeight;
        });

        yPos += 8;
      };

      // Draw Approved Table
      drawTableSection('Approved Curriculum Subjects', approved, true);

      // Draw Rejected Table
      drawTableSection('Rejected / Unaccredited Matches', rejected, false);

      // Signature & Official Sign-off Box
      if (yPos > pageHeight - 38) {
        doc.addPage();
        renderHeader(false);
        yPos = 16;
      }

      yPos += 4;
      const sigWidth = (contentWidth - 20) / 2;

      // Evaluator signature
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.4);
      doc.line(margin + 5, yPos + 18, margin + 5 + sigWidth, yPos + 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('DEPARTMENT CHAIR / EVALUATOR', margin + 5, yPos + 22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('ETEEAP Evaluation Committee', margin + 5, yPos + 26);

      // Dean signature
      const sig2X = margin + sigWidth + 15;
      doc.line(sig2X, yPos + 18, sig2X + sigWidth, yPos + 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('COLLEGE DEAN', sig2X, yPos + 22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('College of Computer Studies', sig2X, yPos + 26);

      // Footer with page numbering
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Cebu Institute of Technology - University · ETEEAP ACCREDIA System · Page ${i} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 6,
          { align: 'center' }
        );
      }

      // Save PDF
      const safeName = (applicantName || 'applicant')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      doc.save(`eteeap-accreditation-report-${safeName}-${application?.id?.slice(0, 8) || 'summary'}.pdf`);
      toast.success('Official Accreditation PDF downloaded successfully');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to generate PDF: ' + error.message);
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
      setTorSubjects(appResp.data.tor_subjects || []);
      setEvaluatorNote(appResp.data.evaluator_note || '');
      setFinalizationComplete(appResp.data.status === 'finalized' || appResp.data.status === 'rejected');
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

  const handleRemoveMatch = async () => {
    if (!removeMatchId) return;
    setActioning(true);
    try {
      await subjectMatchApi.delete(removeMatchId);
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

  const handleApproveAllWorkMatches = async () => {
    const pendingWorkMatches = matches.filter(m => m.source === 'work_experience' && m.status === 'pending' && m.curriculum_subject);
    
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
    setFinalizationComplete(false);
    try {
      await applicationApi.reopen(id);
      toast.success('Application moved to Under Review. Click Re-run AI Evaluation to refresh the subject matches.');
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

  const torMatches = matches.filter(m => m.source === 'tor' && m.curriculum_subject);
  const workMatches = matches.filter(m => m.source === 'work_experience' && m.curriculum_subject);
  const allMatchedItems = matches.filter(m => m.curriculum_subject);
  
  // Find approved IDs across this application (to enforce 1-to-1 matching)
  const approvedTorSubjectIds = new Set(
    matches
      .filter(m => m.tor_subject && m.status === 'approved')
      .map(m => m.tor_subject.id)
  );

  const approvedWorkExpIds = new Set(
    matches
      .filter(m => m.work_experience && m.status === 'approved')
      .map(m => m.work_experience.id)
  );

  const approvedCurriculumIds = new Set(
    matches
      .filter(m => m.curriculum_subject && m.status === 'approved')
      .map(m => m.curriculum_subject.id)
  );

  // Find unmatched curriculum subjects: subjects with no match or only rejected matches, and not approved
  const matchedCurriculumIds = new Set(
    matches
      .filter(m => m.curriculum_subject && m.status !== 'rejected')
      .map(m => m.curriculum_subject.id)
  );
  const unmatchedCurriculum = (curriculum || []).filter(c => !matchedCurriculumIds.has(c.id) && !approvedCurriculumIds.has(c.id));
  
  // Available TOR subjects not yet approved for any curriculum subject
  const availableTorSubjects = (application?.tor_subjects || []).filter(
    s => !approvedTorSubjectIds.has(s.id)
  );

  // Available Work Experiences not yet approved for any curriculum subject
  const availableWorkExperiences = (application?.work_experiences || []).filter(
    w => !approvedWorkExpIds.has(w.id)
  );

  const isFinalized = application?.status === 'finalized' || application?.status === 'rejected';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="evaluator-review-page">
        {/* Finalization Complete Summary */}
        {finalizationComplete && !showFullReview && (
          <div className="space-y-6">
            {/* Top Navigation */}
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

            {/* Hero Header Card */}
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
                    Candidate: <strong className="text-gray-800">{application?.applicant?.full_name || `${application?.applicant?.first_name || ''} ${application?.applicant?.last_name || ''}`.trim() || 'Applicant'}</strong>
                    {' '}· Program: <span className="font-medium text-maroon">{application?.program?.code || 'BSIT'}</span> - {application?.program?.name || 'Bachelor of Science in Information Technology'}
                    {' '}· Application <span className="font-mono text-gray-500">#{application?.id?.slice(0, 8)}</span>
                  </p>
                </div>

                {/* Primary Actions */}
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
                    {actioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4 text-amber-700" />}
                    Reopen for Revision
                  </Button>
                </div>
              </div>
            </Card>

            {/* Key Metric Stats Cards */}
            {(() => {
              const approved = matches.filter(m => m.status === 'approved');
              const rejected = matches.filter(m => m.status === 'rejected');
              const torApproved = approved.filter(m => m.source === 'tor');
              const workApproved = approved.filter(m => m.source === 'work_experience');
              const totalUnits = approved.reduce((sum, m) => sum + (m.curriculum_subject?.units || 0), 0);

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-gray-900">{approved.length}</div>
                        <div className="text-xs text-gray-500 font-medium">Subjects Credited & Approved</div>
                      </div>
                    </Card>

                    <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-maroon flex-shrink-0">
                        <BookOpen className="w-6 h-6 text-maroon" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-maroon">{totalUnits} Units</div>
                        <div className="text-xs text-gray-500 font-medium">Total Academic Units Credited</div>
                      </div>
                    </Card>

                    <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-900">{torApproved.length} TOR · {workApproved.length} Work</div>
                        <div className="text-xs text-gray-500 font-medium">Credited Evidence Distribution</div>
                      </div>
                    </Card>
                  </div>

                  {/* Clean Approved Subjects Table */}
                  <Card className="bg-white border border-gray-200 shadow-xs rounded-xl overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <h2 className="font-semibold text-gray-900">
                          Credited Curriculum Subjects ({approved.length})
                        </h2>
                      </div>
                      <span className="text-xs text-gray-500">
                        Showing all verified & approved curriculum equivalencies
                      </span>
                    </div>

                    {approved.length === 0 ? (
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
                            {approved.map((match, idx) => (
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
                                    {match.source === 'tor' ? '📄 TOR' : '💼 Work Exp'}
                                  </Badge>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <Badge className={getConfidenceColor(match.confidence)}>
                                    {match.confidence.toFixed(0)}% match
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>

                  {/* Evaluator Notes / Committee Sign-Off */}
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

                  {/* Bottom Navigation Actions */}
                  <div className="flex items-center justify-between flex-wrap gap-4 pt-4 border-t border-gray-200">
                    <Button
                      onClick={() => navigate('/evaluator')}
                      variant="outline"
                      className="px-6 border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Return to Evaluator Queue
                    </Button>

                    <div className="flex items-center gap-3">
                      <Button
                        onClick={downloadApprovedAsPDF}
                        className="bg-maroon hover:bg-maroon/90 text-white font-semibold px-6 shadow-xs flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download Official PDF Report
                      </Button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* If in Audit Review Mode while Finalized */}
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

        {(!finalizationComplete || showFullReview) && (
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

        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left: Applicant Info & Documents */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">
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
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
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
                {!isFinalized && (
                  <p className="text-xs text-gray-600 mt-2">
                    AI evaluation does not run automatically when reopening a finalized application. Click “Re-run AI Evaluation” to display the latest subject matches.
                  </p>
                )}
              </div>
              
              <Tabs defaultValue="all">
                <TabsList className="mb-4">
                  <TabsTrigger value="all">All ({allMatchedItems.length})</TabsTrigger>
                  <TabsTrigger value="tor">From TOR ({torMatches.length})</TabsTrigger>
                  <TabsTrigger value="work">From Work ({workMatches.length})</TabsTrigger>
                </TabsList>
                
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white">
                  <TabsContent value="all">
                    <MatchesList
                      matches={allMatchedItems}
                      onApprove={handleApproveMatch}
                      onReject={handleRejectMatch}
                      getConfidenceColor={getConfidenceColor}
                      disabled={isFinalized}
                      curriculum={curriculum}
                      documents={application?.documents || []}
                      onOpenTorEvidence={setTorEvidenceMatch}
                      torSubjects={availableTorSubjects}
                      workExperiences={availableWorkExperiences}
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
                      torSubjects={availableTorSubjects}
                      workExperiences={availableWorkExperiences}
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
                      torSubjects={availableTorSubjects}
                      workExperiences={availableWorkExperiences}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            </Card>

            {/* Unmatched Curriculum Section */}
            {unmatchedCurriculum.length > 0 && (
              <Card className="p-5 border-orange-200 bg-orange-50">
                <h3 className="font-serif font-semibold mb-3 text-orange-900">Unmatched BSIT Curriculum ({unmatchedCurriculum.length})</h3>
                <p className="text-xs text-orange-700 mb-4">These BSIT subjects have no match yet. Select an applicant's scanned subject or work experience to match or mark as not applicable.</p>
                
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {unmatchedCurriculum.map((curSubject) => (
                    <UnmatchedCurriculumItem
                      key={curSubject.id}
                      curriculum={curSubject}
                      torSubjects={availableTorSubjects}
                      workExperiences={availableWorkExperiences}
                      applicationId={application?.id}
                      matches={matches}
                      onMatched={loadData}
                      isFinalized={isFinalized}
                    />
                  ))}
                </div>
              </Card>
            )}

            {/* Action Panel */}
            {!isFinalized && (
              <Card className="p-6 border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="font-serif font-semibold text-xl text-gray-900">Department Chair Decision</h3>
                    <p className="text-xs text-gray-600">Review approved subject accreditations, edit match mappings, or remove credited subjects before finalization.</p>
                  </div>
                  {matches.filter(m => m.status === 'approved').length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={downloadApprovedAsPDF}
                      className="text-xs flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export PDF
                    </Button>
                  )}
                </div>
                
                {/* Summary Preview */}
                {(() => {
                  const approved = matches.filter(m => m.status === 'approved');
                  const rejected = matches.filter(m => m.status === 'rejected');
                  const pending = matches.filter(m => m.status === 'pending');
                  
                  if (approved.length > 0 || rejected.length > 0) {
                    return (
                      <div className="mb-6 space-y-4">
                        {approved.length > 0 && (
                          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5">
                            <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                              <h4 className="font-semibold text-blue-950 flex items-center gap-2 text-base">
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                                Approved Subjects ({approved.length})
                              </h4>
                              <span className="text-xs text-blue-800 bg-blue-100/80 px-2.5 py-1 rounded-full font-medium">
                                Total Credits: {approved.reduce((acc, m) => acc + Number(m.curriculum_subject?.units || 0), 0)} units
                              </span>
                            </div>

                            <div className="overflow-x-auto border border-blue-200 rounded-lg bg-white shadow-sm">
                              <table className="w-full text-sm">
                                <thead className="bg-blue-100/80 border-b border-blue-200 text-blue-900 text-xs font-semibold uppercase tracking-wider">
                                  <tr>
                                    <th className="text-left py-3 px-3 w-[22%]">BSIT Curriculum Subject</th>
                                    <th className="text-left py-3 px-3 w-[36%]">Applicant Subject / Evidence</th>
                                    <th className="text-center py-3 px-2 w-[8%]">Units</th>
                                    <th className="text-center py-3 px-2 w-[10%]">Source</th>
                                    <th className="text-center py-3 px-2 w-[10%]">Confidence</th>
                                    <th className="text-center py-3 px-3 w-[14%]">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-blue-100/70">
                                  {approved.map((match) => (
                                    <tr key={match.id} className="hover:bg-blue-50/40 transition-colors">
                                      <td className="py-3 px-3 align-top">
                                        <div className="font-mono font-bold text-blue-700 text-sm">{match.curriculum_subject?.code || 'N/A'}</div>
                                        <div className="text-xs text-gray-800 font-medium leading-relaxed">{match.curriculum_subject?.title || 'N/A'}</div>
                                      </td>
                                      <td className="py-3 px-3 align-top">
                                        {match.tor_subject ? (
                                          <div className="bg-amber-50/80 border border-amber-200 rounded-md p-2">
                                            <div className="font-semibold text-amber-900 text-xs">
                                              {match.tor_subject.code} - {match.tor_subject.title}
                                            </div>
                                            <div className="text-amber-800 text-[11px] mt-0.5 flex items-center gap-2">
                                              <span>Units: <strong>{match.tor_subject.units || 0}u</strong></span>
                                              <span>•</span>
                                              <span>Grade: <strong>{match.tor_subject.grade || 'N/A'}</strong></span>
                                            </div>
                                          </div>
                                        ) : match.work_experience ? (
                                          <div className="bg-purple-50/80 border border-purple-200 rounded-md p-2">
                                            <div className="font-semibold text-purple-900 text-xs">
                                              💼 {match.work_experience.job_title}
                                            </div>
                                            <div className="text-purple-800 text-[11px] mt-0.5">
                                              {match.work_experience.company_name || 'Industry Experience'} · {match.work_experience.years || 0} yrs
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="text-gray-400 italic text-xs">No evidence recorded</span>
                                        )}
                                        {match.evaluator_note && (
                                          <div className="text-[11px] text-gray-600 italic mt-1 bg-gray-50 p-1 rounded border border-gray-100">
                                            <strong>Remarks:</strong> {match.evaluator_note}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-3 px-2 align-middle text-center font-bold text-gray-800 text-sm">
                                        {match.curriculum_subject?.units || 0}
                                      </td>
                                      <td className="py-3 px-2 align-middle text-center">
                                        <Badge variant="outline" className={`text-[11px] font-medium ${match.source === 'tor' ? 'border-amber-300 text-amber-800 bg-amber-50' : 'border-purple-300 text-purple-800 bg-purple-50'}`}>
                                          {match.source === 'tor' ? '📜 TOR' : '💼 Work'}
                                        </Badge>
                                      </td>
                                      <td className="py-3 px-2 align-middle text-center">
                                        <Badge className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5">
                                          {match.confidence.toFixed(0)}%
                                        </Badge>
                                      </td>
                                      <td className="py-3 px-3 align-middle text-center">
                                        <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2.5 text-xs text-blue-700 bg-blue-50/70 hover:bg-blue-100 border-blue-200 font-medium"
                                            onClick={() => setEditingMatch(match)}
                                            title="Edit or reassign this subject match"
                                          >
                                            <Pencil className="w-3 h-3 mr-1 text-blue-600" />
                                            Edit
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 px-2.5 text-xs text-red-700 bg-red-50/70 hover:bg-red-100 border-red-200 font-medium"
                                            onClick={() => setRemoveMatchId(match.id)}
                                            title="Remove this subject match"
                                          >
                                            <Trash2 className="w-3 h-3 mr-1 text-red-600" />
                                            Remove
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {rejected.length > 0 && (
                          <div className="rounded-xl border border-red-200 bg-red-50/70 p-5">
                            <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                              <h4 className="font-semibold text-red-950 flex items-center gap-2 text-base">
                                <XCircle className="w-5 h-5 text-red-600" />
                                Rejected Subjects ({rejected.length})
                              </h4>
                              <span className="text-xs text-red-800 bg-red-100/80 px-2.5 py-1 rounded-full font-medium">
                                Not Credited
                              </span>
                            </div>

                            <div className="overflow-x-auto border border-red-200 rounded-lg bg-white shadow-sm">
                              <table className="w-full text-sm">
                                <thead className="bg-red-100/80 border-b border-red-200 text-red-900 text-xs font-semibold uppercase tracking-wider">
                                  <tr>
                                    <th className="text-left py-3 px-3 w-[22%]">BSIT Curriculum Subject</th>
                                    <th className="text-left py-3 px-3 w-[34%]">Attempted Applicant Subject / Evidence</th>
                                    <th className="text-center py-3 px-2 w-[8%]">Units</th>
                                    <th className="text-left py-3 px-3 w-[24%]">Reason for Rejection</th>
                                    <th className="text-center py-3 px-3 w-[12%]">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-red-100/70">
                                  {rejected.map((match) => {
                                    const isInsufficientUnits = match.tor_subject && match.curriculum_subject && Number(match.tor_subject.units || 0) < Number(match.curriculum_subject.units || 0);
                                    return (
                                      <tr key={match.id} className="hover:bg-red-50/40 transition-colors">
                                        <td className="py-3 px-3 align-top">
                                          <div className="font-mono font-bold text-red-700 text-sm">{match.curriculum_subject?.code || 'N/A'}</div>
                                          <div className="text-xs text-gray-800 font-medium leading-relaxed">{match.curriculum_subject?.title || 'N/A'}</div>
                                        </td>
                                        <td className="py-3 px-3 align-top">
                                          {match.tor_subject ? (
                                            <div className="bg-amber-50/80 border border-amber-200 rounded-md p-2">
                                              <div className="font-semibold text-amber-900 text-xs">
                                                {match.tor_subject.code} - {match.tor_subject.title}
                                              </div>
                                              <div className="text-amber-800 text-[11px] mt-0.5 flex items-center gap-2">
                                                <span>Units: <strong>{match.tor_subject.units || 0}u</strong></span>
                                                <span>•</span>
                                                <span>Grade: <strong>{match.tor_subject.grade || 'N/A'}</strong></span>
                                              </div>
                                            </div>
                                          ) : match.work_experience ? (
                                            <div className="bg-purple-50/80 border border-purple-200 rounded-md p-2">
                                              <div className="font-semibold text-purple-900 text-xs">
                                                💼 {match.work_experience.job_title}
                                              </div>
                                              <div className="text-purple-800 text-[11px] mt-0.5">
                                                {match.work_experience.company_name || 'Industry Experience'} · {match.work_experience.years || 0} yrs
                                              </div>
                                            </div>
                                          ) : (
                                            <span className="text-gray-400 italic text-xs">No specific applicant subject mapped</span>
                                          )}
                                        </td>
                                        <td className="py-3 px-2 align-middle text-center font-bold text-gray-800 text-sm">
                                          {match.curriculum_subject?.units || 0}
                                        </td>
                                        <td className="py-3 px-3 align-top">
                                          <div className="space-y-1">
                                            {isInsufficientUnits && (
                                              <div className="text-[11px] font-semibold text-red-800 bg-red-100/90 border border-red-200 rounded px-2 py-1 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3 flex-shrink-0 text-red-600" />
                                                <span>Insufficient Units ({match.tor_subject.units}u vs {match.curriculum_subject.units}u required)</span>
                                              </div>
                                            )}
                                            {match.evaluator_note && (
                                              <div className="text-xs text-red-900 italic bg-red-50/80 p-1.5 rounded border border-red-100">
                                                <strong>Note:</strong> {match.evaluator_note}
                                              </div>
                                            )}
                                            {!match.evaluator_note && !isInsufficientUnits && (
                                              <span className="text-xs italic text-gray-500">Rejected by evaluator</span>
                                            )}
                                            {match.matching_reason && (
                                              <div className="text-[10px] text-gray-500 italic mt-0.5">
                                                AI note: {match.matching_reason}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-3 px-3 align-middle text-center">
                                          <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 px-2.5 text-xs text-blue-700 bg-blue-50/70 hover:bg-blue-100 border-blue-200 font-medium"
                                              onClick={() => setEditingMatch(match)}
                                              title="Reassign or edit this match"
                                            >
                                              <Pencil className="w-3 h-3 mr-1 text-blue-600" />
                                              Edit
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-7 px-2.5 text-xs text-red-700 bg-red-50/70 hover:bg-red-100 border-red-200 font-medium"
                                              onClick={() => setRemoveMatchId(match.id)}
                                              title="Remove this rejected record"
                                            >
                                              <Trash2 className="w-3 h-3 mr-1 text-red-600" />
                                              Remove
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
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
                    onClick={() => navigate(`/applicant?app=${application?.id}&view=accreditation-summary`)}
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
                  Are you sure you want to remove this match from the Department Chair Decision summary? The BSIT curriculum subject will return to the Unmatched list, and the applicant's evidence will become available again.
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
                        📜 {matchToRemove.tor_subject.code} - {matchToRemove.tor_subject.title} ({matchToRemove.tor_subject.units}u, Grade: {matchToRemove.tor_subject.grade || 'N/A'})
                      </span>
                    ) : matchToRemove.work_experience ? (
                      <span className="text-purple-900 font-medium">
                        💼 {matchToRemove.work_experience.job_title} at {matchToRemove.work_experience.company_name} ({matchToRemove.work_experience.years} yrs)
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

      <EditMatchModal
        match={editingMatch}
        open={!!editingMatch}
        onClose={() => setEditingMatch(null)}
        torSubjects={(application?.tor_subjects || []).filter(
          s => !approvedTorSubjectIds.has(s.id) || (editingMatch?.tor_subject?.id === s.id)
        )}
        workExperiences={(application?.work_experiences || []).filter(
          w => !approvedWorkExpIds.has(w.id) || (editingMatch?.work_experience?.id === w.id)
        )}
        documents={application?.documents || []}
        onPreviewTor={openDocumentPreview}
        onSave={loadData}
      />

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

            {(() => {
              const matchToReject = matches.find(m => m.id === rejectMatchId);
              if (!matchToReject) return null;
              const isInsufficientUnits = matchToReject.tor_subject && matchToReject.curriculum_subject && Number(matchToReject.tor_subject.units || 0) < Number(matchToReject.curriculum_subject.units || 0);

              return (
                <div className="p-3 bg-red-50/70 border border-red-200 rounded-lg text-xs space-y-1.5">
                  <div>
                    <span className="font-semibold text-red-950">BSIT Subject:</span>{' '}
                    <span className="font-mono font-bold text-red-700">{matchToReject.curriculum_subject?.code}</span> - {matchToReject.curriculum_subject?.title} ({matchToReject.curriculum_subject?.units}u)
                  </div>
                  <div>
                    <span className="font-semibold text-red-950">Attempted Match:</span>{' '}
                    {matchToReject.tor_subject ? (
                      <span className="text-amber-900 font-medium">
                        📜 {matchToReject.tor_subject.code} - {matchToReject.tor_subject.title} ({matchToReject.tor_subject.units}u, Grade: {matchToReject.tor_subject.grade || 'N/A'})
                      </span>
                    ) : matchToReject.work_experience ? (
                      <span className="text-purple-900 font-medium">
                        💼 {matchToReject.work_experience.job_title} at {matchToReject.work_experience.company_name} ({matchToReject.work_experience.years}y)
                      </span>
                    ) : (
                      <span className="italic text-gray-500">None</span>
                    )}
                  </div>
                  {isInsufficientUnits && (
                    <div className="text-red-700 font-semibold flex items-center gap-1 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Note: Applicant subject has only {matchToReject.tor_subject.units} unit(s), but curriculum requires {matchToReject.curriculum_subject.units} unit(s).</span>
                    </div>
                  )}
                </div>
              );
            })()}

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

const EditMatchModal = ({ match, open, onClose, torSubjects, workExperiences, documents, onPreviewTor, onSave }) => {
  const [selectedSource, setSelectedSource] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (match) {
      if (match.source === 'work_experience' && match.work_experience) {
        setSelectedSource(`work:${match.work_experience.id}`);
      } else if (match.tor_subject) {
        setSelectedSource(`tor:${match.tor_subject.id}`);
      } else {
        setSelectedSource('');
      }
      setNote(match.evaluator_note || '');
    }
  }, [match]);

  if (!match) return null;

  const curSubj = match.curriculum_subject;
  const curUnits = Number(curSubj?.units || 0);
  const torDoc = (documents || []).find(d => d.document_type === 'tor') || (documents || [])[0];

  const handleSave = async () => {
    if (!selectedSource) {
      toast.error('Please select an applicant subject or work experience.');
      return;
    }

    const isWork = selectedSource.startsWith('work:');
    const sourceId = selectedSource.replace(/^(tor|work):/, '');

    // Check Rule 1: TOR subject units cannot be less than curriculum subject units
    if (!isWork && curSubj) {
      const chosenSubj = (torSubjects || []).find(s => String(s.id) === String(sourceId));
      if (chosenSubj && Number(chosenSubj.units || 0) < curUnits) {
        toast.error(`Cannot match: Applicant subject "${chosenSubj.code}" has ${chosenSubj.units} unit(s), but ${curSubj.code} requires ${curUnits} unit(s).`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        curriculum_subject_id: curSubj?.id,
        note: note.trim(),
        status: 'approved'
      };
      if (isWork) {
        payload.work_experience_id = sourceId;
        payload.tor_subject_id = null;
      } else {
        payload.tor_subject_id = sourceId;
        payload.work_experience_id = null;
      }

      await subjectMatchApi.override(match.id, payload);
      toast.success(`Match for "${curSubj?.code}" successfully updated!`);
      if (onSave) {
        await onSave();
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update match');
    } finally {
      setSaving(false);
    }
  };

  const hasTor = torSubjects && torSubjects.length > 0;
  const hasWork = workExperiences && workExperiences.length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-xl" data-testid="edit-match-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-900">
            <Pencil className="w-5 h-5 text-blue-600" />
            Edit Subject Match
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Target BSIT Subject */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-xs font-semibold uppercase text-blue-700 mb-1">Target BSIT Curriculum Subject</div>
            <div className="font-mono font-bold text-blue-950 text-base">{curSubj?.code}</div>
            <div className="text-sm text-gray-800 font-medium">{curSubj?.title}</div>
            <div className="text-xs text-blue-800 mt-1">Required Units: <strong>{curUnits}u</strong></div>
          </div>

          {/* Currently Assigned Evidence */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-semibold uppercase text-gray-600">Currently Assigned Evidence</div>
              {torDoc && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2.5 text-[11px] text-maroon hover:bg-maroon/10 border-maroon/40 flex items-center gap-1.5 font-medium bg-white shadow-xs"
                  onClick={() => {
                    if (onPreviewTor) {
                      onPreviewTor(torDoc, match.tor_subject ? {
                        code: match.tor_subject?.code,
                        title: match.tor_subject?.title,
                        grade: match.tor_subject?.grade,
                        units: match.tor_subject?.units,
                      } : null);
                    }
                  }}
                  title="View uploaded Transcript of Records (TOR) with OCR match highlighting"
                  data-testid="preview-applicant-tor-btn"
                >
                  <Eye className="w-3.5 h-3.5 text-maroon" />
                  Preview Applicant TOR
                </Button>
              )}
            </div>
            {match.tor_subject ? (
              <div className="text-xs text-gray-800">
                <span className="font-semibold text-amber-900">📜 {match.tor_subject.code} - {match.tor_subject.title}</span>
                <span className="ml-2">({match.tor_subject.units}u, Grade: {match.tor_subject.grade || 'N/A'})</span>
              </div>
            ) : match.work_experience ? (
              <div className="text-xs text-purple-900 font-medium">
                💼 {match.work_experience.job_title} at {match.work_experience.company_name} ({match.work_experience.years}y)
              </div>
            ) : (
              <div className="text-xs text-gray-400 italic">None</div>
            )}
          </div>

          {/* Reassign Evidence Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">
              Select Matched Applicant Subject or Work Experience:
            </label>
            <select
              className="w-full border border-gray-300 rounded-md p-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              disabled={saving}
            >
              <option value="">Select subject or work experience...</option>
              {hasTor && (
                <optgroup label="📜 Applicant Scanned TOR Subjects">
                  {torSubjects.map((s) => {
                    const isInsufficient = Number(s.units || 0) < curUnits;
                    return (
                      <option
                        key={s.id}
                        value={`tor:${s.id}`}
                        disabled={isInsufficient}
                      >
                        {isInsufficient ? '⚠️ ' : ''}{s.code} - {s.title} ({s.units}u) [Grade: {s.grade || 'N/A'}]{isInsufficient ? ` - [Insufficient: needs ${curUnits}u]` : ''}
                      </option>
                    );
                  })}
                </optgroup>
              )}
              {hasWork && (
                <optgroup label="💼 Applicant Work Experience (Work Crediting)" style={{ color: '#7e22ce', fontWeight: 'bold' }}>
                  {workExperiences.map((w) => (
                    <option key={w.id} value={`work:${w.id}`} style={{ color: '#7e22ce', backgroundColor: '#f3e8ff', fontWeight: '600' }}>
                      💼 [Work] {w.job_title} - {w.company_name} ({w.years} yrs)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Evaluator Remarks */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">Remarks / Evaluator Note (Optional):</label>
            <Textarea
              placeholder="e.g. Manually aligned based on course syllabus equivalent..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="text-xs"
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={saving || !selectedSource}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const UnmatchedCurriculumItem = ({ curriculum, torSubjects, workExperiences, applicationId, matches, onMatched, isFinalized }) => {
  const [selectedSource, setSelectedSource] = useState('');
  const [actioning, setActioning] = useState(false);

  const handleApprove = async () => {
    if (!selectedSource) {
      toast.info("Please select an applicant's subject or work experience first");
      return;
    }

    const isWork = selectedSource.startsWith('work:');
    const sourceId = selectedSource.replace(/^(tor|work):/, '');

    // Enforce Rule 1: TOR subject units cannot be less than curriculum subject units
    if (!isWork) {
      const selectedSubj = (torSubjects || []).find(s => String(s.id) === String(sourceId));
      if (selectedSubj && Number(selectedSubj.units || 0) < Number(curriculum?.units || 0)) {
        toast.error(`Cannot match: Applicant subject "${selectedSubj.code}" has ${selectedSubj.units} unit(s), but ${curriculum.code} requires ${curriculum.units} unit(s).`);
        return;
      }
    }

    setActioning(true);
    try {
      const existingMatch = (matches || []).find(m => 
        isWork ? m.work_experience?.id === sourceId : m.tor_subject?.id === sourceId
      );

      if (existingMatch) {
        await subjectMatchApi.override(existingMatch.id, {
          curriculum_subject_id: curriculum.id,
          note: isWork ? 'Manually assigned from work experience' : 'Manually assigned from unmatched curriculum'
        });
        await subjectMatchApi.approve(existingMatch.id, 'Approved');
      } else if (applicationId) {
        await subjectMatchApi.create({
          application_id: applicationId,
          curriculum_subject_id: curriculum.id,
          tor_subject_id: !isWork ? sourceId : undefined,
          work_experience_id: isWork ? sourceId : undefined,
          note: isWork ? 'Manually credited from work experience' : 'Manually credited from TOR'
        });
      }
      toast.success(`"${curriculum.code}" approved with selected ${isWork ? 'Work Experience' : 'TOR Subject'}`);
      setSelectedSource('');
      if (onMatched) {
        onMatched();
      }
    } catch (e) {
      toast.error('Failed to approve match: ' + (e.response?.data?.error || e.message));
    } finally {
      setActioning(false);
    }
  };

  const handleNotApplicable = () => {
    toast.info(`"${curriculum.code}" marked as not applicable for this applicant`);
    setSelectedSource('');
  };

  const hasTor = torSubjects && torSubjects.length > 0;
  const hasWork = workExperiences && workExperiences.length > 0;

  return (
    <div className="border border-orange-200 rounded-lg p-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
            <div className="text-xs font-semibold text-blue-700 mb-1">BSIT Curriculum:</div>
            <div className="text-sm">
              <span className="font-semibold">{curriculum.code}</span>
              <span className="ml-2">{curriculum.title}</span>
              <span className="ml-2 text-xs text-gray-600">({curriculum.units}u)</span>
            </div>
          </div>
          <div className="text-xs text-gray-600 italic">No subject match found yet</div>
        </div>

        {!isFinalized && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="ghost" 
                className="text-green-600 hover:bg-green-50 h-7 text-xs"
                onClick={handleApprove}
                disabled={actioning || !selectedSource}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Approve
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                className="text-red-600 hover:bg-red-50 h-7 text-xs"
                onClick={handleNotApplicable}
                disabled={actioning}
              >
                <XCircle className="w-3 h-3 mr-1" />
                Not Applicable
              </Button>
            </div>

            {/* Dropdown to select TOR subject or Work Experience */}
            {hasTor || hasWork ? (
              <select 
                className="border border-orange-200 px-2 py-1 text-xs bg-orange-50 rounded min-w-[290px]"
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                disabled={actioning}
              >
                <option value="">Select scanned subject or work experience...</option>
                {hasTor && (
                  <optgroup label="📜 Available TOR Subjects">
                    {torSubjects.map(subject => {
                      const isInsufficient = Number(subject.units || 0) < Number(curriculum?.units || 0);
                      return (
                        <option 
                          key={subject.id} 
                          value={`tor:${subject.id}`}
                          disabled={isInsufficient}
                        >
                          {isInsufficient ? '⚠️ ' : ''}{subject.code} - {subject.title} ({subject.units}u) [{subject.grade}]{isInsufficient ? ` - [Insufficient: needs ${curriculum.units}u]` : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {hasWork && (
                  <optgroup label="💼 Applicant Work Experience (Work Crediting)" style={{ color: '#7e22ce', fontWeight: 'bold' }}>
                    {workExperiences.map(work => (
                      <option 
                        key={work.id} 
                        value={`work:${work.id}`}
                        style={{ color: '#7e22ce', backgroundColor: '#f3e8ff', fontWeight: '600' }}
                      >
                        💼 [Work] {work.job_title} - {work.company_name} ({work.years} yrs)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            ) : (
              <div className="text-[11px] text-gray-500 italic bg-gray-50 px-2 py-1 rounded border border-gray-200">
                All scanned subjects & work experiences are matched
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const MatchesList = ({ matches, onApprove, onReject, getConfidenceColor, disabled, curriculum, torSubjects, workExperiences, documents, onOpenTorEvidence }) => {
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
                    <><Briefcase className="w-3 h-3 mr-1 text-purple-600" /> Work</>
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
                <div className="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
                  <div className="text-xs font-semibold text-blue-700 mb-1">BSIT Curriculum:</div>
                  <div className="text-sm">
                    <span className="font-semibold">{match.curriculum_subject.code}</span>
                    <span className="ml-2">{match.curriculum_subject.title}</span>
                    <span className="ml-2 text-xs text-gray-600">({match.curriculum_subject.units}u)</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  <Badge className="bg-red-50 text-red-700 text-xs">Not credited</Badge>
                </div>
              )}
              {match.tor_subject && (
                <div className="p-2 bg-amber-50 rounded border border-amber-200">
                  <div className="text-xs font-semibold text-amber-700 mb-1">Applicant's TOR Subject:</div>
                  <div className="text-xs text-gray-700">
                    <span className="font-semibold">{match.tor_subject.code}</span>
                    <span className="ml-2">{match.tor_subject.title}</span>
                    {match.tor_subject.units ? <span className="ml-2">({match.tor_subject.units}u)</span> : ''}
                    {match.tor_subject.grade ? <span className="ml-1">[Grade: {match.tor_subject.grade}]</span> : ''}
                  </div>
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
                <div className="p-2 bg-purple-50 rounded border border-purple-200 mt-2">
                  <div className="text-xs font-semibold text-purple-700 mb-1">Applicant's Work Experience:</div>
                  <div className="text-xs text-purple-900 font-medium">
                    <span className="font-semibold">{match.work_experience.job_title}</span>
                    {match.work_experience.company_name && <span className="ml-2 text-purple-700">at {match.work_experience.company_name}</span>}
                    <span className="ml-2 text-purple-600">({match.work_experience.years}y)</span>
                  </div>
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
            
            {!disabled && match.status === 'pending' && match.curriculum_subject && (
              <div className="flex flex-col gap-2">
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

                {/* Dropdown to reassign to different TOR subject or Work Experience */}
                {match.curriculum_subject && ((torSubjects && torSubjects.length > 0) || (workExperiences && workExperiences.length > 0)) && (
                  <ReassignTorSubject
                    match={match}
                    torSubjects={torSubjects || []}
                    workExperiences={workExperiences || []}
                    onReassign={onApprove}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const ReassignTorSubject = ({ match, torSubjects, workExperiences, onReassign, compact = false }) => {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const handleReassign = async () => {
    if (!selected) return;
    const isWork = selected.startsWith('work:');
    const sourceId = selected.replace(/^(tor|work):/, '');

    // Enforce Rule 1: TOR subject units cannot be less than curriculum subject units
    if (!isWork && match.curriculum_subject) {
      const selectedSubj = (torSubjects || []).find(s => String(s.id) === String(sourceId));
      if (selectedSubj && Number(selectedSubj.units || 0) < Number(match.curriculum_subject.units || 0)) {
        toast.error(`Cannot match: Applicant subject "${selectedSubj.code}" has ${selectedSubj.units} unit(s), but ${match.curriculum_subject.code} requires ${match.curriculum_subject.units} unit(s).`);
        return;
      }
    }

    setBusy(true);
    try {
      if (isWork) {
        await subjectMatchApi.override(match.id, { 
          work_experience_id: sourceId, 
          note: 'Reassigned to applicant work experience' 
        });
      } else {
        await subjectMatchApi.override(match.id, { 
          tor_subject_id: sourceId, 
          note: 'Reassigned to correct TOR subject' 
        });
      }
      await subjectMatchApi.approve(match.id, 'Approved');
      toast.success(`Match reassigned and approved.`);
      onReassign(match.id);
    } catch (e) {
      toast.error('Failed to reassign: ' + (e.response?.data?.error || e.message));
      onReassign(match.id);
    }
    setBusy(false);
  };

  // Show only TOR subjects different from the current match
  const otherSubjects = (torSubjects || []).filter(s => !match.tor_subject || s.id !== match.tor_subject.id);
  const otherWorkExperiences = (workExperiences || []).filter(w => !match.work_experience || w.id !== match.work_experience.id);

  return (
    <div className={compact ? 'flex items-center justify-center' : 'flex items-center gap-2 flex-wrap'}>
      <select 
        className={compact ? 'border border-blue-200 px-1 py-1 text-[10px] w-28 bg-blue-50 rounded' : 'border border-blue-200 px-2 py-1 text-xs min-w-[290px] bg-blue-50 rounded'} 
        value={selected} 
        onChange={(e) => setSelected(e.target.value)}
        title="Select a different applicant subject or work experience"
      >
        <option value="">Edit match...</option>
        
        {otherSubjects.length > 0 && (
          <optgroup label="📜 Applicant Scanned TOR Subjects">
            {otherSubjects.map(subject => {
              const isInsufficient = match.curriculum_subject && Number(subject.units || 0) < Number(match.curriculum_subject.units || 0);
              return (
                <option key={subject.id} value={`tor:${subject.id}`} disabled={isInsufficient}>
                  {isInsufficient ? '⚠️ ' : ''}{subject.code} - {subject.title} ({subject.units}u) [{subject.grade}]{isInsufficient ? ` - [Insufficient: needs ${match.curriculum_subject.units}u]` : ''}
                </option>
              );
            })}
          </optgroup>
        )}

        {otherWorkExperiences.length > 0 && (
          <optgroup label="💼 Applicant Work Experience (Work Crediting)" style={{ color: '#7e22ce', fontWeight: 'bold' }}>
            {otherWorkExperiences.map(work => (
              <option 
                key={work.id} 
                value={`work:${work.id}`}
                style={{ color: '#7e22ce', backgroundColor: '#f3e8ff', fontWeight: '600' }}
              >
                💼 [Work] {work.job_title} - {work.company_name} ({work.years} yrs)
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <Button size="sm" onClick={handleReassign} disabled={!selected || busy} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7">
        {busy ? (compact ? '...' : 'Reassigning...') : (compact ? 'Edit' : 'Reassign & Approve')}
      </Button>
    </div>
  );
};

const ApproveWithTor = ({ match, torSubjects, workExperiences, onApprove }) => {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    if (selected && !selected.startsWith('work:') && match.curriculum_subject) {
      const torId = selected.replace('tor:', '');
      const selectedSubj = (torSubjects || []).find(s => String(s.id) === String(torId));
      if (selectedSubj && Number(selectedSubj.units || 0) < Number(match.curriculum_subject.units || 0)) {
        toast.error(`Cannot match: Applicant subject "${selectedSubj.code}" has ${selectedSubj.units} unit(s), but ${match.curriculum_subject.code} requires ${match.curriculum_subject.units} unit(s).`);
        return;
      }
    }

    setBusy(true);
    try {
      if (selected) {
        if (selected.startsWith('work:')) {
          await subjectMatchApi.override(match.id, { work_experience_id: selected.replace('work:', ''), note: 'Approved with Work Experience' });
        } else {
          await subjectMatchApi.override(match.id, { tor_subject_id: selected.replace('tor:', ''), note: 'Approved with selected TOR subject' });
        }
      }
      await subjectMatchApi.approve(match.id, selected ? 'Approved' : '');
      onApprove(match.id);
    } catch (e) {
      onApprove(match.id);
    }
    setBusy(false);
  };

  const hasTor = torSubjects && torSubjects.length > 0;
  const hasWork = workExperiences && workExperiences.length > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select className="border border-green-200 px-2 py-1 text-xs min-w-[280px] bg-green-50 rounded" value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">Select TOR subject or Work to approve...</option>
        {hasTor && (
          <optgroup label="📜 TOR Subjects">
            {torSubjects.map(subject => {
              const isInsufficient = match.curriculum_subject && Number(subject.units || 0) < Number(match.curriculum_subject.units || 0);
              return (
                <option key={subject.id} value={`tor:${subject.id}`} disabled={isInsufficient}>
                  {isInsufficient ? '⚠️ ' : ''}{subject.code} - {subject.title} ({subject.units}u) [{subject.grade}]{isInsufficient ? ` - [Insufficient: needs ${match.curriculum_subject.units}u]` : ''}
                </option>
              );
            })}
          </optgroup>
        )}
        {hasWork && (
          <optgroup label="💼 Work Experience" style={{ color: '#7e22ce', fontWeight: 'bold' }}>
            {workExperiences.map(work => (
              <option key={work.id} value={`work:${work.id}`} style={{ color: '#7e22ce', backgroundColor: '#f3e8ff', fontWeight: '600' }}>
                💼 [Work] {work.job_title} - {work.company_name} ({work.years} yrs)
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <Button size="sm" onClick={handleApprove} disabled={busy} className="bg-green-600 hover:bg-green-700 text-white text-xs h-7">
        {busy ? 'Approving...' : 'Approve'}
      </Button>
    </div>
  );
};

const RejectWithTor = ({ match, torSubjects, onReject }) => {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const handleReject = async () => {
    setBusy(true);
    try {
      if (selected) {
        const torId = selected.replace(/^(tor|work):/, '');
        await subjectMatchApi.override(match.id, { tor_subject_id: torId, note: 'Rejected - subject does not match' });
      }
      await subjectMatchApi.reject(match.id, selected ? 'Rejected' : '');
      onReject(match.id);
    } catch (e) {
      onReject(match.id);
    }
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select className="border border-red-200 px-2 py-1 text-xs min-w-[280px] bg-red-50 rounded" value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">Select subject to reject...</option>
        {(torSubjects || []).map(subject => (
          <option key={subject.id} value={`tor:${subject.id}`}>{subject.code} - {subject.title} ({subject.units}u) [{subject.grade}]</option>
        ))}
      </select>
      <Button size="sm" onClick={handleReject} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white text-xs h-7">
        {busy ? 'Rejecting...' : 'Reject'}
      </Button>
    </div>
  );
};

const AssignAndApprove = ({ match, passedSubjects, workExperiences, onApprove, label = 'Select passed TOR subject or Work' }) => {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAssign = async () => {
    if (!selected) return;
    const isWork = selected.startsWith('work:');
    const sourceId = selected.replace(/^(tor|work):/, '');

    if (!isWork && match.curriculum_subject) {
      const selectedSubj = (passedSubjects || []).find(s => String(s.id) === String(sourceId));
      if (selectedSubj && Number(selectedSubj.units || 0) < Number(match.curriculum_subject.units || 0)) {
        toast.error(`Cannot match: Applicant subject "${selectedSubj.code}" has ${selectedSubj.units} unit(s), but ${match.curriculum_subject.code} requires ${match.curriculum_subject.units} unit(s).`);
        return;
      }
    }

    setBusy(true);
    try {
      if (isWork) {
        await subjectMatchApi.override(match.id, { work_experience_id: sourceId, note: 'Selected from applicant work experience' });
      } else {
        await subjectMatchApi.override(match.id, { tor_subject_id: sourceId, note: 'Selected from applicant TOR subject list' });
      }
      await subjectMatchApi.approve(match.id, 'Approved after manual selection');
      onApprove(match.id);
    } catch (e) {
      onApprove(match.id);
    }
    setBusy(false);
  };

  const hasTor = passedSubjects && passedSubjects.length > 0;
  const hasWork = workExperiences && workExperiences.length > 0;

  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <select className="border px-2 py-1 text-sm min-w-[240px] rounded" value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="">{label}</option>
        {hasTor && (
          <optgroup label="📜 TOR Subjects">
            {passedSubjects.map(subject => {
              const isInsufficient = match.curriculum_subject && Number(subject.units || 0) < Number(match.curriculum_subject.units || 0);
              return (
                <option key={subject.id} value={`tor:${subject.id}`} disabled={isInsufficient}>
                  {isInsufficient ? '⚠️ ' : ''}{subject.code} - {subject.title} ({subject.units}u) {subject.grade ? `[${subject.grade}]` : ''}{isInsufficient ? ` - [Insufficient: needs ${match.curriculum_subject.units}u]` : ''}
                </option>
              );
            })}
          </optgroup>
        )}
        {hasWork && (
          <optgroup label="💼 Work Experience" style={{ color: '#7e22ce', fontWeight: 'bold' }}>
            {workExperiences.map(work => (
              <option key={work.id} value={`work:${work.id}`} style={{ color: '#7e22ce', backgroundColor: '#f3e8ff', fontWeight: '600' }}>
                💼 [Work] {work.job_title} - {work.company_name} ({work.years} yrs)
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <Button size="sm" onClick={handleAssign} disabled={!selected || busy} className="text-xs">
        {busy ? 'Assigning...' : 'Assign & Approve'}
      </Button>
    </div>
  );
};

export default EvaluatorReviewPage;

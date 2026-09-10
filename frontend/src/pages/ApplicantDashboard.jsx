import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useAuth } from '../lib/auth-context';
import { applicationApi, dashboardApi, subjectMatchApi } from '../lib/api';
import {
  FileText, Upload, Clock, CheckCircle2, AlertCircle, ArrowRight,
  Sparkles, Briefcase, GraduationCap, Loader2, Plus, Award, Trash2, AlertTriangle, Home, ArrowLeft, XCircle, Eye, Download
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

export const ApplicantDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [deletingApplicationId, setDeletingApplicationId] = useState(null);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({ open: false, applicationId: null });
  const [accreditationData, setAccreditationData] = useState(null);

  const viewMode = searchParams.get('view');
  const displayAppId = searchParams.get('app');

  useEffect(() => {
    loadData();
  }, [viewMode, displayAppId]);

  const loadData = async () => {
    try {
      if (viewMode === 'accreditation-summary' && displayAppId) {
        // Fetch specific application accreditation data
        const appResp = await applicationApi.get(displayAppId);
        const application = appResp.data;
        
        // Fetch matches for this application
        const matchesResp = await subjectMatchApi.list(displayAppId);
        const matches = matchesResp.data || [];
        
        const approved = matches.filter(m => m.status === 'approved');
        const rejected = matches.filter(m => m.status === 'rejected');
        
        const torMatches = approved.filter(m => m.source === 'tor');
        const workMatches = approved.filter(m => m.source === 'work_experience');
        
        const totalUnits = approved.reduce((sum, m) => sum + (m.curriculum_subject?.units || 0), 0);
        
        setAccreditationData({
          application,
          approved,
          rejected,
          torMatches,
          workMatches,
          totalUnits
        });
      } else {
        const [appsResp, statsResp] = await Promise.all([
          applicationApi.list(),
          dashboardApi.getStats()
        ]);
        setApplications(appsResp.data);
        setStats(statsResp.data);
      }
    } catch (err) {
      toast.error('Failed to load data');
    }
    setLoading(false);
  };

  const downloadAccreditationSummary = () => {
    try {
      if (!accreditationData) {
        toast.error('No accreditation summary available');
        return;
      }

      const { application, approved, rejected } = accreditationData;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - (margin * 2);

      let yPos = margin;

      const applicantName = application?.applicant?.full_name ||
        `${application?.applicant?.first_name || ''} ${application?.applicant?.last_name || ''}`.trim() ||
        'Applicant';
      const programName = application?.program?.name || 'Bachelor of Science in Information Technology';
      const programCode = application?.program?.code || 'BSIT';
      const totalUnits = accreditationData.totalUnits || approved.reduce((sum, m) => sum + Number(m.curriculum_subject?.units || 0), 0);
      const torCount = approved.filter(m => m.source === 'tor').length;
      const workCount = approved.filter(m => m.source === 'work_experience').length;

      const renderHeader = (isFirstPage = true) => {
        doc.setFillColor(122, 30, 43); // Maroon
        doc.rect(0, 0, pageWidth, 6, 'F');
        doc.setFillColor(212, 175, 55); // Gold
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
          doc.text('Official Subject Accreditation & Equivalency Summary', margin, 29);

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
      doc.text(`${totalUnits} Units (${approved.length} Subjects)`, col2X + 30, yPos + 12);

      doc.setTextColor(22, 101, 52);
      doc.text(application?.status === 'finalized' ? 'FINALIZED / ACCREDITED' : 'UNDER REVIEW', col2X + 30, yPos + 18.5);

      yPos += 28;

      // KPI Badges
      const kpiWidth = (contentWidth - 6) / 3;
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
      doc.text(`${totalUnits} Units Total Credited`, margin + 4, yPos + 9.2);

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
      doc.text(`${torCount} from TOR | ${workCount} from Work`, margin + kpiWidth + 7, yPos + 9.2);

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

      const drawTableSection = (title, items, isApprovedTable = true) => {
        if (items.length === 0) return;

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

        const colW = [50, 76, 14, 22, 20];
        const headers = isApprovedTable 
          ? ['BSIT Curriculum Subject', 'Matched Applicant Subject / Evidence', 'Units', 'Source', 'Confidence']
          : ['BSIT Curriculum Subject', 'Attempted Applicant Subject', 'Units', 'Source', 'Rejection Note'];

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
            : (match.evaluator_note || 'Rejected');

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          const curLines = doc.splitTextToSize(`${curCode}\n${curTitle}`, colW[0] - 4);
          const evLines = doc.splitTextToSize(evidenceText, colW[1] - 4);
          const lastLines = doc.splitTextToSize(lastColText, colW[4] - 4);
          const maxLines = Math.max(curLines.length, evLines.length, lastLines.length, 1);
          const rowHeight = Math.max(maxLines * 4 + 3, 7.5);

          if (yPos + rowHeight > pageHeight - 25) {
            doc.addPage();
            renderHeader(false);
            yPos = 16;

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

          if (rowIdx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, yPos, contentWidth, rowHeight, 'F');
          }

          doc.setDrawColor(226, 232, 240);
          doc.rect(margin, yPos, contentWidth, rowHeight, 'S');

          let colX = margin;

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

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(15, 23, 42);
          evLines.forEach((line, li) => {
            doc.text(line, colX + 2, yPos + 4 + (li * 3.5));
          });
          colX += colW[1];

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          doc.text(curUnits, colX + (colW[2] / 2), yPos + (rowHeight / 2) + 1.2, { align: 'center' });
          colX += colW[2];

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(match.source === 'tor' ? 146 : 107, match.source === 'tor' ? 64 : 33, match.source === 'tor' ? 14 : 168);
          doc.text(sourceText, colX + (colW[3] / 2), yPos + (rowHeight / 2) + 1.2, { align: 'center' });
          colX += colW[3];

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

      drawTableSection('Approved Curriculum Subjects', approved, true);
      drawTableSection('Rejected / Unaccredited Matches', rejected, false);

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

      const safeName = (applicantName || 'applicant')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      doc.save(`accreditation-summary-${safeName || application?.id || 'report'}.pdf`);
      toast.success('Accreditation summary PDF downloaded');
    } catch (error) {
      console.error('Error downloading accreditation summary PDF:', error);
      toast.error('Failed to download accreditation summary: ' + error.message);
    }
  };

  const handleStartApplication = async () => {
    try {
      const response = await applicationApi.create({});
      navigate(`/applicant/apply/${response.data.id}`);
    } catch (err) {
      toast.error('Failed to start application');
    }
  };

  const handleDeleteApplication = async (event, applicationId) => {
    event.stopPropagation();
    setDeleteConfirmDialog({ open: true, applicationId });
  };

  const confirmDeleteApplication = async () => {
    const applicationId = deleteConfirmDialog.applicationId;
    setDeleteConfirmDialog({ open: false, applicationId: null });

    setDeletingApplicationId(applicationId);
    try {
      await applicationApi.delete(applicationId);
      setApplications((prev) => prev.filter((app) => app.id !== applicationId));
      toast.success('Application removed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete application');
    }
    setDeletingApplicationId(null);
  };

  const openApplication = (app) => {
    if (app.status === 'draft') {
      navigate(`/applicant/apply/${app.id}`);
      return;
    }

    if (app.status === 'finalized') {
      navigate(`/applicant/evaluation/${app.id}`);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-700',
      submitted: 'bg-blue-100 text-blue-700',
      processing: 'bg-yellow-100 text-yellow-700',
      under_review: 'bg-purple-100 text-purple-700',
      finalized: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="applicant-dashboard">
        
        {/* Accreditation Summary View */}
        {viewMode === 'accreditation-summary' && accreditationData && (
          <>
            <div className="mb-8">
              <Button 
                onClick={() => navigate(user.role === 'applicant' ? '/applicant' : '/evaluator')}
                variant="ghost"
                className="mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </div>

            <div className="space-y-6 mb-8">
              {/* Hero Header Card */}
              <Card className="p-6 bg-white border border-gray-200 shadow-xs rounded-xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Accreditation Certified & Recorded
                    </div>
                    <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
                      Official Accreditation Summary
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                      Program: <span className="font-medium text-maroon">{application?.program?.code || 'BSIT'}</span> - {application?.program?.name || 'Bachelor of Science in Information Technology'}
                    </p>
                  </div>

                  <div>
                    <Button 
                      onClick={downloadAccreditationSummary}
                      className="bg-maroon hover:bg-maroon/90 text-white font-semibold px-5 py-2.5 shadow-xs flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download Official PDF
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{accreditationData.approved.length}</div>
                    <div className="text-xs text-gray-500 font-medium">Subjects Credited & Approved</div>
                  </div>
                </Card>

                <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-maroon flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-maroon" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-maroon">{accreditationData.totalUnits} Units</div>
                    <div className="text-xs text-gray-500 font-medium">Total Academic Units Credited</div>
                  </div>
                </Card>

                <Card className="p-5 bg-white border border-gray-200 shadow-xs rounded-xl flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-900">
                      {accreditationData.torMatches.length} TOR · {accreditationData.workMatches.length} Work
                    </div>
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
                      Credited Curriculum Subjects ({accreditationData.approved.length})
                    </h2>
                  </div>
                  <span className="text-xs text-gray-500">
                    Officially accredited for graduation requirements
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                        <th className="py-3 px-4 w-12 text-center">#</th>
                        <th className="py-3 px-4">BSIT Curriculum Subject</th>
                        <th className="py-3 px-4">Credited Applicant Evidence</th>
                        <th className="py-3 px-4 text-center w-20">Units</th>
                        <th className="py-3 px-4 text-center w-28">Source</th>
                        <th className="py-3 px-4 text-center w-28">Match</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {accreditationData.approved.map((match, idx) => (
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
                            {match.tor_subject ? (
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
                            ) : match.work_experience ? (
                              <div className="space-y-0.5">
                                <div className="font-semibold text-purple-900 text-xs">
                                  {match.work_experience.job_title}
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  {match.work_experience.company_name} ({match.work_experience.years || 0} yrs)
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">No direct evidence</span>
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
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                              {match.confidence.toFixed(0)}% match
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>



              {/* Bottom Actions */}
              <div className="flex items-center justify-between flex-wrap gap-4 pt-4 border-t border-gray-200">
                <Button 
                  onClick={() => navigate(user.role === 'applicant' ? '/applicant' : '/evaluator')}
                  variant="outline"
                  className="px-6 border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Return to Dashboard
                </Button>

                <Button 
                  onClick={downloadAccreditationSummary}
                  className="bg-maroon hover:bg-maroon/90 text-white font-semibold px-6 shadow-xs flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Official PDF
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Normal Dashboard View */}
        {viewMode !== 'accreditation-summary' && (
          <>
        <div className="mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-2">
            Welcome back, <span className="text-maroon">{user?.full_name?.split(' ')[0]}</span>
          </h1>
          <p className="text-gray-600">Track your application and manage your credentials.</p>
        </div>

        {/* Stats grid removed per request */}

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Applications List */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-2xl font-semibold">Your Applications</h2>
              <Button 
                onClick={handleStartApplication}
                className="bg-maroon hover:bg-maroon-dark text-white"
                data-testid="start-application-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Application
              </Button>
            </div>

            {applications.length === 0 ? (
              <Card className="p-12 text-center border-gray-200 border-dashed">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="font-serif font-semibold text-lg mb-2">No applications yet</h3>
                <p className="text-gray-600 mb-4">Start your first ETEEAP application to get your credits evaluated.</p>
                <Button 
                  onClick={handleStartApplication}
                  className="bg-maroon hover:bg-maroon-dark text-white"
                  data-testid="empty-start-application-btn"
                >
                  Start First Application
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <Card 
                    key={app.id} 
                    className={`p-5 border-gray-200 hover:border-maroon/30 hover:shadow-md smooth-transition ${app.status === 'draft' || app.status === 'finalized' ? 'cursor-pointer' : 'cursor-default'}`}
                    onClick={() => openApplication(app)}
                    data-testid={`application-card-${app.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Badge className={getStatusColor(app.status)} data-testid={`app-status-${app.id}`}>
                            {app.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          <span className="text-sm text-gray-500">
                            {new Date(app.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="font-semibold mb-1">
                          {app.program?.name || 'BSIT Application'}
                        </h3>
                        <div className="text-sm text-gray-600">
                          Application #{app.id.slice(0, 8)}
                        </div>
                        {app.recommended_program && (
                          <div className="mt-2 inline-flex items-center gap-1 text-xs text-maroon">
                            <Sparkles className="w-3 h-3" />
                            AI suggests: {app.recommended_program}
                          </div>
                        )}
                        {app.status !== 'draft' && app.status !== 'finalized' && (
                          <div className="mt-2 text-xs text-gray-500 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Waiting for Department Chair review
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-3 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(event) => handleDeleteApplication(event, app.id)}
                          disabled={deletingApplicationId === app.id}
                          data-testid={`delete-application-${app.id}`}
                        >
                          {deletingApplicationId === app.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <><Trash2 className="w-4 h-4 mr-1" /> Remove</>
                          )}
                        </Button>
                        {app.status === 'draft' ? (
                          <ArrowRight className="w-5 h-5 text-gray-400" />
                        ) : app.status === 'finalized' ? (
                          <span className="text-xs font-medium text-maroon">View Evaluation</span>
                        ) : (
                          <span className="text-xs font-medium text-gray-400">Pending review</span>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <Card className="p-6 bg-maroon text-white border-maroon">
              <Sparkles className="w-8 h-8 text-gold mb-3" />
              <h3 className="font-serif font-bold text-xl mb-2">ETEEAP Guidance</h3>
              <p className="text-sm text-gray-200 mb-4">
                The Expanded Tertiary Education Equivalency and Accreditation Program recognizes your professional work experience and prior academic studies.
              </p>
              <p className="text-xs text-gray-300">
                Ensure all documents and TORs are clearly scanned before submission.
              </p>
            </Card>

            <Card className="p-6 border-gray-200">
              <Award className="w-8 h-8 text-gold mb-3" />
              <h3 className="font-serif font-bold text-lg mb-2">Get Credits For</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <GraduationCap className="w-4 h-4 mt-0.5 text-maroon flex-shrink-0" />
                  <span>Prior Education (TOR)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Briefcase className="w-4 h-4 mt-0.5 text-maroon flex-shrink-0" />
                  <span>Work Experience</span>
                </li>
                <li className="flex items-start gap-2">
                  <Award className="w-4 h-4 mt-0.5 text-maroon flex-shrink-0" />
                  <span>Professional Certifications</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmDialog.open} onOpenChange={(open) => !open && setDeleteConfirmDialog({ open: false, applicationId: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <DialogTitle className="text-xl font-bold">Delete Application?</DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              This action cannot be undone. The application will be permanently removed from your account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmDialog({ open: false, applicationId: null })}
              className="px-6"
            >
              No, Cancel
            </Button>
            <Button
              onClick={confirmDeleteApplication}
              className="px-6 bg-red-600 hover:bg-red-700 text-white"
              disabled={deletingApplicationId === deleteConfirmDialog.applicationId}
            >
              {deletingApplicationId === deleteConfirmDialog.applicationId ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Yes, Delete'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApplicantDashboard;

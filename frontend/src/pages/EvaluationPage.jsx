import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { applicationApi, subjectMatchApi, predictionApi } from '../lib/api';
import {
  ArrowLeft, Loader2, FileText, Briefcase, CheckCircle2,
  XCircle, AlertCircle, Calendar, BookOpen, TrendingUp, Sparkles, Download
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

export const EvaluationPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [matches, setMatches] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const appResp = await applicationApi.get(id);
      const app = appResp.data;
      setApplication(app);

      if (app?.status !== 'finalized') {
        setMatches([]);
        setPrediction(null);
        return;
      }

      const [matchesResp, predResp] = await Promise.all([
        subjectMatchApi.list(id),
        predictionApi.get(id).catch(() => ({ data: null }))
      ]);
      setMatches(matchesResp.data);
      setPrediction(predResp.data);
    } catch (err) {
      toast.error('Failed to load evaluation');
    }
    setLoading(false);
  };

  const downloadReport = () => {
    try {
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

      const approved = matches.filter(m => m.status === 'approved' || (m.status !== 'rejected' && m.confidence >= 75));
      const rejected = matches.filter(m => m.status === 'rejected');
      const totalApprovedUnits = approved.reduce((sum, m) => sum + Number(m.curriculum_subject?.units || 0), 0);
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
          doc.text('ETEEAP Evaluation & Subject Equivalency Report', margin, 29);

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
      doc.text(application?.status?.toUpperCase() || 'EVALUATED', col2X + 30, yPos + 18.5);

      yPos += 28;

      // Table Section
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

      drawTableSection('Credited Curriculum Subjects', approved, true);
      drawTableSection('Unaccredited / Rejected Subjects', rejected, false);

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
      doc.save(`eteeap-evaluation-report-${safeName}-${application?.id?.slice(0, 8) || 'report'}.pdf`);
      toast.success('Evaluation Report PDF downloaded');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to generate PDF: ' + error.message);
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

  const getConfidenceColor = (confidence) => {
    if (confidence >= 85) return 'bg-green-100 text-green-700 border-green-300';
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const torMatches = matches.filter(m => m.source === 'tor');
  const workMatches = matches.filter(m => m.source === 'work_experience');
  const isDecisionComplete = ['finalized', 'rejected'].includes(application?.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="evaluation-page">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" onClick={() => navigate('/applicant')} className="mb-4" data-testid="back-btn">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-2">Evaluation Results</h1>
              <p className="text-gray-600">
                Application # · <span className="ml-2 text-sm text-gray-700">{application?.id}</span>
                <Badge className="ml-4" variant="outline">
                  {application?.status?.replace('_', ' ').toUpperCase()}
                </Badge>
              </p>
            </div>
            <Button 
              onClick={downloadReport} 
              className="bg-maroon hover:bg-maroon-dark text-white"
              data-testid="download-report-btn"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Report
            </Button>
          </div>
        </div>

        {/* Summary Cards removed as requested */}

        {/* AI Recommendation */}
        {isDecisionComplete && application?.recommended_program && (
          <Card className="p-6 mb-6 bg-gradient-to-br from-maroon/5 to-gold/5 border-maroon/20">
            <div className="flex items-start gap-4">
              <Sparkles className="w-6 h-6 text-maroon flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-serif font-semibold text-lg mb-2">AI Course Recommendation</h3>
                <Badge className="bg-maroon text-white mb-2">{application.recommended_program}</Badge>
                <p className="text-sm text-gray-700">{application.recommendation_reasoning}</p>
              </div>
            </div>
          </Card>
        )}

        {isDecisionComplete && application?.evaluator_note && (
          <Card className="p-6 mb-6 border-red-200 bg-red-50/60">
            <div className="flex items-start gap-4">
              <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-serif font-semibold text-lg mb-2 text-red-800">
                  Department Decision Note
                </h3>
                <p className="text-sm text-red-900 leading-6">
                  {application.evaluator_note}
                </p>
              </div>
            </div>
          </Card>
        )}

        {!isDecisionComplete && (
          <Card className="p-8 mb-6 border-dashed border-gray-300 bg-white">
            <div className="text-center max-w-2xl mx-auto">
              <AlertCircle className="w-12 h-12 text-maroon mx-auto mb-4" />
              <h2 className="font-serif text-2xl font-bold mb-2">Evaluation in Progress</h2>
              <p className="text-gray-600 mb-3">
                Your TOR matches, approved and rejected subjects, and Department Chair comments will appear here after the Department Chair finalizes accreditation.
              </p>
              <p className="text-sm text-gray-500">
                Please wait for the Department Chair / Evaluator to run AI Evaluation and press Finalize Accreditation.
              </p>
            </div>
          </Card>
        )}

        {/* Tabs for Different Views */}
        {isDecisionComplete ? (
          <Tabs defaultValue="all" className="mb-8">
            <TabsList className="mb-6">
              <TabsTrigger value="all" data-testid="tab-all">All Matches ({matches.length})</TabsTrigger>
              <TabsTrigger value="tor" data-testid="tab-tor">From TOR ({torMatches.length})</TabsTrigger>
              <TabsTrigger value="work" data-testid="tab-work">From Work ({workMatches.length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all">
              <SubjectMatchTable matches={matches} getConfidenceColor={getConfidenceColor} />
            </TabsContent>
            
            <TabsContent value="tor">
              <SubjectMatchTable matches={torMatches} getConfidenceColor={getConfidenceColor} />
            </TabsContent>
            
            <TabsContent value="work">
              <SubjectMatchTable matches={workMatches} getConfidenceColor={getConfidenceColor} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </div>
  );
};

const SubjectMatchTable = ({ matches, getConfidenceColor }) => {
  if (matches.length === 0) {
    return (
      <Card className="p-12 text-center border-gray-200 border-dashed">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No matches in this category</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <Card
          key={match.id}
          className={`p-4 ${match.status === 'rejected' ? 'border-red-300 bg-red-50/40 shadow-sm' : 'border-gray-200'}`}
          data-testid={`match-card-${match.id}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge className={getConfidenceColor(match.confidence)} data-testid={`match-confidence-${match.id}`}>
                  {match.confidence.toFixed(0)}% match
                </Badge>
                <Badge variant="outline" className="border-gray-300">
                  {match.source === 'tor' ? (
                    <><FileText className="w-3 h-3 mr-1" /> Credited from TOR</>
                  ) : (
                    <><Briefcase className="w-3 h-3 mr-1" /> Credited from Work Experience</>
                  )}
                </Badge>
                {match.status === 'approved' && (
                  <Badge className="bg-green-100 text-green-700 border-green-300">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Approved
                  </Badge>
                )}
                {match.status === 'rejected' && (
                  <Badge className="bg-red-100 text-red-700 border-red-300">
                    <XCircle className="w-3 h-3 mr-1" />
                    Rejected
                  </Badge>
                )}
                {match.status === 'overridden' && (
                  <Badge className="bg-blue-100 text-blue-700 border-blue-300">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Overridden
                  </Badge>
                )}
                {match.status === 'pending' && (
                  <Badge className="bg-gray-100 text-gray-700 border-gray-300">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Pending Review
                  </Badge>
                )}
              </div>
              
              {match.curriculum_subject ? (
                <div>
                  <div className="font-semibold">
                    {match.curriculum_subject.code} - {match.curriculum_subject.title}
                  </div>
                  <div className="text-sm text-gray-600 mb-1">
                    {match.curriculum_subject.units} units · Year {match.curriculum_subject.year}, Sem {match.curriculum_subject.semester}
                  </div>
                  {match.tor_subject && (
                    <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2 mt-1.5">
                      <span className="font-semibold">Attempted TOR Subject:</span> {match.tor_subject.code} - {match.tor_subject.title} ({match.tor_subject.units || 0}u, Grade: {match.tor_subject.grade || 'N/A'})
                    </div>
                  )}
                  {match.work_experience && (
                    <div className="text-xs text-purple-900 bg-purple-50 border border-purple-200 rounded p-2 mt-1.5">
                      <span className="font-semibold">Attempted Work Experience:</span> {match.work_experience.job_title} at {match.work_experience.company_name} ({match.work_experience.years || 0}y)
                    </div>
                  )}
                  {match.tor_subject && match.curriculum_subject && Number(match.tor_subject.units || 0) < Number(match.curriculum_subject.units || 0) && (
                    <div className="text-xs text-red-800 bg-red-100/80 border border-red-200 rounded p-2 mt-1.5 flex items-center gap-1.5 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-600" />
                      <span>Insufficient units: Applicant subject has {match.tor_subject.units} unit(s), but BSIT curriculum requires {match.curriculum_subject.units} unit(s).</span>
                    </div>
                  )}
                  {match.matching_reason && (
                    <div className="text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded border border-gray-100">
                      <strong>AI Reasoning:</strong> {match.matching_reason}
                    </div>
                  )}
                  {match.status === 'rejected' && match.evaluator_note && (
                    <div className="text-xs text-red-800 mt-2 bg-white p-3 rounded border border-red-200">
                      <div className="font-semibold text-red-700 mb-1">Reason for Rejection</div>
                      <div>{match.evaluator_note}</div>
                    </div>
                  )}
                  {match.status === 'approved' && match.evaluator_note && (
                    <div className="text-xs text-green-700 mt-2 bg-green-50 p-2 rounded border border-green-100">
                      <strong>Department Chair Note:</strong> {match.evaluator_note}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No curriculum match found</div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

const ForecastView = ({ prediction }) => {
  const semesters = prediction.plan_json?.semesters || [];
  
  if (semesters.length === 0) {
    return (
      <Card className="p-12 text-center border-gray-200 border-dashed">
        <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No study plan available yet</p>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <Card className="p-6 bg-maroon text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm opacity-90">Estimated Completion</div>
            <div className="font-serif text-3xl font-bold">
              {prediction.semesters_min} - {prediction.semesters_max} Semesters
            </div>
            <div className="text-sm opacity-90 mt-1">
              {prediction.plan_json?.remaining_units || 0} units remaining
            </div>
          </div>
          <Calendar className="w-16 h-16 opacity-30" />
        </div>
      </Card>
      
      {semesters.map((sem) => (
        <Card key={sem.semester} className="p-5 border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif font-semibold text-lg">
              Semester {sem.semester}
            </h3>
            <Badge variant="outline">
              {sem.total_units} units
            </Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {sem.subjects.map((subj) => (
              <div key={subj.code} className="bg-gray-50 rounded p-2 text-sm">
                <span className="font-mono font-semibold text-maroon">{subj.code}</span>
                <span className="text-gray-600 ml-2">{subj.title}</span>
                <span className="text-xs text-gray-500 ml-2">({subj.units}u)</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
};

export default EvaluationPage;

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
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
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      let yPosition = 20;

      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('Accreditation Summary Report', margin, yPosition);
      yPosition += 10;

      const applicantName = application?.applicant?.full_name ||
        `${application?.applicant?.first_name || ''} ${application?.applicant?.last_name || ''}`.trim() ||
        'Applicant Name N/A';

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Applicant: ${applicantName}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Application ID: ${application?.id || 'N/A'}`, margin, yPosition);
      yPosition += 6;
      doc.text(`Date: ${new Date().toLocaleDateString()}`, margin, yPosition);
      yPosition += 12;

      const addTable = (title, rows, isRejected = false) => {
        if (rows.length === 0) {
          doc.setFont(undefined, 'bold');
          doc.setFontSize(12);
          doc.text(`${title} (0)`, margin, yPosition);
          yPosition += 8;
          doc.setFont(undefined, 'normal');
          doc.text('No subjects in this category.', margin, yPosition);
          yPosition += 10;
          return;
        }

        doc.setFont(undefined, 'bold');
        doc.setFontSize(12);
        doc.text(`${title} (${rows.length})`, margin, yPosition);
        yPosition += 8;

        const headers = ['Code', 'Title', 'Units', 'Source', 'Matched TOR', 'Status'];
        const colWidths = [22, 60, 18, 24, 44, 22];

        doc.setFillColor(isRejected ? 220 : 59, isRejected ? 38 : 130, isRejected ? 38 : 246);
        doc.setTextColor(255, 255, 255);
        doc.setFont(undefined, 'bold');
        doc.setFontSize(9);

        let xPosition = margin;
        headers.forEach((header, idx) => {
          doc.rect(xPosition, yPosition - 5, colWidths[idx], 8, 'F');
          doc.text(header, xPosition + 2, yPosition, { maxWidth: colWidths[idx] - 4 });
          xPosition += colWidths[idx];
        });

        yPosition += 8;
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');

        rows.forEach((match, idx) => {
          if (yPosition > 270) {
            doc.addPage();
            yPosition = 20;
          }

          if (idx % 2 === 0) {
            doc.setFillColor(245, 245, 245);
            doc.rect(margin, yPosition - 5, pageWidth - margin * 2, 8, 'F');
          }

          const matchedTorValue = match.tor_subject
            ? `${match.tor_subject.code || 'N/A'} - ${match.tor_subject.title || 'N/A'} (${match.tor_subject.units || 0}u)`
            : 'N/A';

          const values = [
            match.curriculum_subject?.code || 'N/A',
            match.curriculum_subject?.title || 'N/A',
            String(match.curriculum_subject?.units || 0),
            match.source === 'tor' ? 'TOR' : 'Work Exp',
            matchedTorValue,
            isRejected ? 'Rejected' : 'Approved'
          ];

          xPosition = margin;
          values.forEach((value, columnIndex) => {
            const text = String(value);
            doc.text(text, xPosition + 2, yPosition, {
              maxWidth: colWidths[columnIndex] - 4,
              align: columnIndex === 2 ? 'center' : 'left'
            });
            xPosition += colWidths[columnIndex];
          });

          yPosition += 8;
        });

        yPosition += 10;
      };

      addTable('Approved Subjects', approved, false);
      addTable('Rejected Subjects', rejected, true);

      if (approved.length > 0 || rejected.length > 0) {
        doc.setFont(undefined, 'bold');
        doc.setFontSize(11);
        doc.text(`Total Approved: ${approved.length}`, margin, yPosition);
        yPosition += 7;
        doc.text(`Total Rejected: ${rejected.length}`, margin, yPosition);
        yPosition += 7;
        doc.text(`Total Credited Units: ${accreditationData.totalUnits}`, margin, yPosition);
      }

      const safeName = (applicantName || 'applicant')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      doc.save(`accreditation-summary-${safeName || application?.id || 'report'}.pdf`);
      toast.success('Accreditation summary PDF downloaded');
    } catch (error) {
      console.error('Error downloading accreditation summary PDF:', error);
      toast.error('Failed to download accreditation summary');
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

            <Card className="p-8 border-green-200 bg-green-50 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="font-serif text-3xl font-bold text-green-900 flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-8 h-8" />
                    Accreditation Complete!
                  </h2>
                  <p className="text-green-800">All approvals have been recorded. Below is a summary of the credited subjects.</p>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid md:grid-cols-3 gap-4 mb-8">
                <Card className="p-4 bg-white border-blue-100">
                  <p className="text-sm text-gray-600 mb-1">Total Approved Subjects</p>
                  <p className="text-3xl font-bold text-blue-600">{accreditationData.approved.length}</p>
                </Card>
                <Card className="p-4 bg-white border-green-100">
                  <p className="text-sm text-gray-600 mb-1">Total Units Credited</p>
                  <p className="text-3xl font-bold text-green-600">{accreditationData.totalUnits}</p>
                </Card>
                <Card className="p-4 bg-white border-purple-100">
                  <p className="text-sm text-gray-600 mb-1">Sources (TOR + Work)</p>
                  <p className="text-3xl font-bold text-purple-600">
                    {(accreditationData.torMatches.length > 0 ? 1 : 0) + (accreditationData.workMatches.length > 0 ? 1 : 0)}
                  </p>
                </Card>
              </div>

              {/* Approved Subjects by Source */}
              <div className="space-y-4">
                {accreditationData.torMatches.length > 0 && (
                  <Card className="p-4 border-blue-200 bg-blue-50">
                    <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Approved from TOR ({accreditationData.torMatches.length})
                    </h3>
                    <div className="space-y-2">
                      {accreditationData.torMatches.map((match) => (
                        <div key={match.id} className="bg-white rounded p-2 text-sm border border-blue-100">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div>
                                <span className="font-mono font-semibold text-blue-700">{match.curriculum_subject?.code}</span>
                                <span className="text-gray-600"> - {match.curriculum_subject?.title}</span>
                                <span className="text-xs text-blue-600 ml-2">({match.curriculum_subject?.units}u)</span>
                              </div>
                              {match.tor_subject && (
                                <div className="mt-1 text-xs text-gray-700">
                                  Matched TOR: <span className="font-medium text-gray-800">{match.tor_subject.code}</span> - {match.tor_subject.title}
                                  <span className="text-purple-600 ml-1">({match.tor_subject.units || 0}u)</span>
                                  {match.tor_subject.grade ? ` [${match.tor_subject.grade}]` : ''}
                                </div>
                              )}
                            </div>
                            <Badge className="bg-blue-100 text-blue-700 ml-2">{match.confidence.toFixed(0)}%</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {accreditationData.workMatches.length > 0 && (
                  <Card className="p-4 border-purple-200 bg-purple-50">
                    <h3 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Approved from Work Experience ({accreditationData.workMatches.length})
                    </h3>
                    <div className="space-y-2">
                      {accreditationData.workMatches.map((match) => (
                        <div key={match.id} className="bg-white rounded p-2 text-sm border border-purple-100">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div>
                                <span className="font-mono font-semibold text-purple-700">{match.curriculum_subject?.code}</span>
                                <span className="text-gray-600"> - {match.curriculum_subject?.title}</span>
                                <span className="text-xs text-purple-600 ml-2">({match.curriculum_subject?.units}u)</span>
                              </div>
                              {match.tor_subject && (
                                <div className="mt-1 text-xs text-gray-700">
                                  Matched TOR: <span className="font-medium text-gray-800">{match.tor_subject.code}</span> - {match.tor_subject.title}
                                  <span className="text-purple-600 ml-1">({match.tor_subject.units || 0}u)</span>
                                  {match.tor_subject.grade ? ` [${match.tor_subject.grade}]` : ''}
                                </div>
                              )}
                            </div>
                            <Badge className="bg-purple-100 text-purple-700 ml-2">{match.confidence.toFixed(0)}%</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {accreditationData.rejected.length > 0 && (
                  <Card className="p-4 border-red-200 bg-red-50">
                    <h3 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                      <XCircle className="w-4 h-4" />
                      Not Approved ({accreditationData.rejected.length})
                    </h3>
                    <div className="space-y-2">
                      {accreditationData.rejected.map((match) => (
                        <div key={match.id} className="bg-white rounded p-2 text-sm border border-red-100">
                          <div>
                            <span className="font-mono font-semibold text-red-700">{match.curriculum_subject?.code}</span>
                            <span className="text-gray-600"> - {match.curriculum_subject?.title}</span>
                            <span className="text-xs text-red-600 ml-2">({match.curriculum_subject?.units}u)</span>
                            {match.tor_subject && (
                              <div className="mt-1 text-xs text-gray-700">
                                From TOR: <span className="font-medium text-gray-800">{match.tor_subject.code}</span> ({match.tor_subject.units || 0}u)
                              </div>
                            )}
                            {match.evaluator_note && (
                              <div className="text-xs text-red-700 mt-1 italic">Reason: {match.evaluator_note}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </Card>

            <div className="flex gap-3 justify-center flex-wrap mt-6">
              <Button 
                onClick={downloadAccreditationSummary}
                className="bg-green-600 hover:bg-green-700 text-white px-6 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Summary
              </Button>
              <Button 
                onClick={() => navigate(user.role === 'applicant' ? '/applicant' : '/evaluator')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 flex items-center gap-2"
              >
                <Home className="w-4 h-4" />
                Return to Dashboard
              </Button>
            </div>
            
            <ChatbotWidget />
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
              <h3 className="font-serif font-bold text-xl mb-2">Need Help?</h3>
              <p className="text-sm text-gray-200 mb-4">
                Chat with AcrediaBot for instant answers about ETEEAP, evaluation, and more.
              </p>
              <p className="text-xs text-gray-300">
                Click the chat icon in the bottom right corner →
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

      <ChatbotWidget />
    </div>
  );
};

export default ApplicantDashboard;

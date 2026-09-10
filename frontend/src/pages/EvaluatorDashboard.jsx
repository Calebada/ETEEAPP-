import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { applicationApi, dashboardApi } from '../lib/api';
import { Loader2, FileText, ArrowRight, Filter, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export const EvaluatorDashboard = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [deletingApplicationId, setDeletingApplicationId] = useState(null);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({ open: false, application: null });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const statsResp = await dashboardApi.getStats();
      const appsResp = await applicationApi.list();
      setApplications(appsResp.data);
      setStats(statsResp.data);
    } catch (err) {
      toast.error('Failed to load queue');
    }
    setLoading(false);
  };

  const filteredApplications = applications.filter(app => {
    if (filter === 'all') return true;
    if (filter === 'pending') return ['submitted', 'processing', 'under_review'].includes(app.status);
    if (filter === 'finalized') return app.status === 'finalized';
    if (filter === 'rejected') return app.status === 'rejected';
    return true;
  });

  const getStatusColor = (status) => {
    const colors = {
      submitted: 'bg-blue-100 text-blue-700',
      processing: 'bg-yellow-100 text-yellow-700',
      under_review: 'bg-purple-100 text-purple-700',
      finalized: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const removeApplicant = async (application) => {
    setDeleteConfirmDialog({ open: true, application });
  };

  const confirmRemoveApplicant = async () => {
    const application = deleteConfirmDialog.application;
    if (!application) return;
    setDeleteConfirmDialog({ open: false, application: null });
    setDeletingApplicationId(application.id);

    try {
      await applicationApi.delete(application.id);
      setApplications((current) => current.filter((item) => item.id !== application.id));
      toast.success('Applicant removed from the evaluator queue');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove applicant');
    }
    setDeletingApplicationId(null);
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
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="evaluator-dashboard">
        <div className="mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-2">Department Chair Dashboard</h1>
          <p className="text-gray-600">Review submitted applications, validate TOR + work experience matches, and finalize AI accreditation.</p>
        </div>

        {/* Summary stat cards removed per request */}

        {/* Filters */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Filter className="w-4 h-4 text-gray-500" />
          {['all', 'pending', 'finalized', 'rejected'].map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className={filter === f ? 'bg-maroon text-white hover:bg-maroon-dark' : ''}
              data-testid={`filter-${f}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>

        {/* Applications List */}
        {filteredApplications.length === 0 ? (
          <Card className="p-12 text-center border-gray-200 border-dashed">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No applications in this queue</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredApplications.map((app) => (
              <Card 
                key={app.id} 
                className="p-5 border-gray-200 hover:border-maroon/30 hover:shadow-md smooth-transition cursor-pointer"
                onClick={() => navigate(`/evaluator/review/${app.id}`)}
                data-testid={`queue-app-${app.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <Badge className={getStatusColor(app.status)}>
                        {(app.status || 'unknown').replace('_', ' ').toUpperCase()}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        Submitted {new Date(app.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="font-semibold mb-1">
                      {app.applicant?.full_name}
                    </h3>
                    <div className="text-sm text-gray-600">
                      {app.applicant?.email} · Application #{app.id.slice(0, 8)}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>Documents: {app.documents?.length || 0}</span>
                      <span>Work Experience: {app.work_experiences?.length || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Remove ${app.applicant?.full_name || 'applicant'}`}
                      title="Remove applicant"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeApplicant(app);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={deleteConfirmDialog.open}
        onOpenChange={(open) => !open && setDeleteConfirmDialog({ open: false, application: null })}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <DialogTitle className="text-xl font-bold">Delete Application?</DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              This action cannot be undone. The application for{' '}
              <span className="font-semibold text-gray-800">
                {deleteConfirmDialog.application?.applicant?.full_name || 'this applicant'}
              </span>{' '}
              will be permanently removed from the evaluator queue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmDialog({ open: false, application: null })}
              className="px-6"
            >
              No, Cancel
            </Button>
            <Button
              onClick={confirmRemoveApplicant}
              className="px-6 bg-red-600 hover:bg-red-700 text-white"
              disabled={deletingApplicationId === deleteConfirmDialog.application?.id}
            >
              {deletingApplicationId === deleteConfirmDialog.application?.id ? (
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

export default EvaluatorDashboard;

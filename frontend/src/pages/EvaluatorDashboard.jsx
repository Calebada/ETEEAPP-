import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { applicationApi, dashboardApi } from '../lib/api';
import { Loader2, FileText, Clock, CheckCircle2, XCircle, ArrowRight, Filter } from 'lucide-react';
import { toast } from 'sonner';

export const EvaluatorDashboard = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [appsResp, statsResp] = await Promise.all([
        applicationApi.list(),
        dashboardApi.getStats()
      ]);
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

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="p-5 border-gray-200">
            <FileText className="w-7 h-7 text-maroon mb-2" />
            <div className="text-2xl font-bold">{stats.total || 0}</div>
            <div className="text-xs text-gray-600">Total Applications</div>
          </Card>
          <Card className="p-5 border-gray-200">
            <Clock className="w-7 h-7 text-yellow-600 mb-2" />
            <div className="text-2xl font-bold">{stats.pending_review || 0}</div>
            <div className="text-xs text-gray-600">Pending Review</div>
          </Card>
          <Card className="p-5 border-gray-200">
            <CheckCircle2 className="w-7 h-7 text-green-600 mb-2" />
            <div className="text-2xl font-bold">{stats.finalized || 0}</div>
            <div className="text-xs text-gray-600">Finalized</div>
          </Card>
          <Card className="p-5 border-gray-200">
            <XCircle className="w-7 h-7 text-red-600 mb-2" />
            <div className="text-2xl font-bold">{stats.rejected || 0}</div>
            <div className="text-xs text-gray-600">Rejected</div>
          </Card>
        </div>

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
                        {app.status.replace('_', ' ').toUpperCase()}
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
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ChatbotWidget />
    </div>
  );
};

export default EvaluatorDashboard;

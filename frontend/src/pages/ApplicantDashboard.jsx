import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../lib/auth-context';
import { applicationApi, dashboardApi } from '../lib/api';
import {
  FileText, Upload, Clock, CheckCircle2, AlertCircle, ArrowRight,
  Sparkles, Briefcase, GraduationCap, Loader2, Plus, Award, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

export const ApplicantDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [deletingApplicationId, setDeletingApplicationId] = useState(null);

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
      toast.error('Failed to load dashboard');
    }
    setLoading(false);
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
    if (!window.confirm('Delete this application? This cannot be undone.')) {
      return;
    }

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
                    className="p-5 border-gray-200 hover:border-maroon/30 hover:shadow-md smooth-transition cursor-pointer"
                    onClick={() => navigate(app.status === 'draft' ? `/applicant/apply/${app.id}` : `/applicant/evaluation/${app.id}`)}
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
                        <ArrowRight className="w-5 h-5 text-gray-400" />
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
      </div>

      <ChatbotWidget />
    </div>
  );
};

export default ApplicantDashboard;

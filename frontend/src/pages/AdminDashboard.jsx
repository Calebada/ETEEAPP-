import React, { useState, useEffect } from 'react';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { applicationApi, dashboardApi, programApi } from '../lib/api';
import { Users, FileText, GraduationCap, BookOpen, Loader2, BarChart } from 'lucide-react';
import { toast } from 'sonner';

export const AdminDashboard = () => {
  const [stats, setStats] = useState({});
  const [applications, setApplications] = useState([]);
  const [curriculum, setCurriculum] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsResp, appsResp, programsResp] = await Promise.all([
        dashboardApi.getStats(),
        applicationApi.list(),
        programApi.list()
      ]);
      
      setStats(statsResp.data);
      setApplications(appsResp.data);
      
      if (programsResp.data.length > 0) {
        const curr = await programApi.curriculum(programsResp.data[0].id);
        setCurriculum(curr.data);
      }
    } catch (err) {
      toast.error('Failed to load admin data');
    }
    setLoading(false);
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
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="admin-dashboard">
        <div className="mb-8">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage users, applications, and curriculum.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="p-5 border-gray-200">
            <Users className="w-7 h-7 text-maroon mb-2" />
            <div className="text-2xl font-bold">{stats.total_users || 0}</div>
            <div className="text-xs text-gray-600">Total Users</div>
          </Card>
          <Card className="p-5 border-gray-200">
            <FileText className="w-7 h-7 text-blue-600 mb-2" />
            <div className="text-2xl font-bold">{stats.total_applications || 0}</div>
            <div className="text-xs text-gray-600">Applications</div>
          </Card>
          <Card className="p-5 border-gray-200">
            <BarChart className="w-7 h-7 text-yellow-600 mb-2" />
            <div className="text-2xl font-bold">{stats.pending_applications || 0}</div>
            <div className="text-xs text-gray-600">In Progress</div>
          </Card>
          <Card className="p-5 border-gray-200">
            <GraduationCap className="w-7 h-7 text-green-600 mb-2" />
            <div className="text-2xl font-bold">{stats.finalized_applications || 0}</div>
            <div className="text-xs text-gray-600">Completed</div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="applications">
          <TabsList className="mb-6">
            <TabsTrigger value="applications" data-testid="admin-tab-applications">Applications</TabsTrigger>
            <TabsTrigger value="curriculum" data-testid="admin-tab-curriculum">Curriculum</TabsTrigger>
            <TabsTrigger value="users" data-testid="admin-tab-users">Users</TabsTrigger>
          </TabsList>
          
          <TabsContent value="applications">
            <Card className="p-5 border-gray-200">
              <h2 className="font-serif font-semibold text-xl mb-4">All Applications ({applications.length})</h2>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {applications.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No applications yet</p>
                ) : (
                  applications.map(app => (
                    <div key={app.id} className="border border-gray-200 rounded-lg p-3" data-testid={`admin-app-${app.id}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{app.applicant?.full_name}</div>
                          <div className="text-xs text-gray-500">{app.applicant?.email}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Created {new Date(app.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant="outline">{app.status?.replace('_', ' ').toUpperCase()}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="curriculum">
            <Card className="p-5 border-gray-200">
              <h2 className="font-serif font-semibold text-xl mb-4">BSIT Curriculum ({curriculum.length} subjects)</h2>
              <div className="grid md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto">
                {curriculum.length === 0 ? (
                  <p className="text-gray-500 text-center py-8 col-span-2">No curriculum subjects</p>
                ) : (
                  curriculum.map(subj => (
                    <div key={subj.id} className="border border-gray-200 rounded-lg p-3" data-testid={`curriculum-${subj.code}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-semibold text-maroon">{subj.code}</span>
                        <Badge variant="outline" className="text-xs">{subj.units} units</Badge>
                      </div>
                      <div className="text-sm font-medium">{subj.title}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Year {subj.year}, Semester {subj.semester}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="users">
            <Card className="p-5 border-gray-200">
              <h2 className="font-serif font-semibold text-xl mb-4">User Statistics</h2>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-maroon">{stats.total_applicants || 0}</div>
                  <div className="text-sm text-gray-600 mt-1">Applicants</div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-maroon">{stats.total_evaluators || 0}</div>
                  <div className="text-sm text-gray-600 mt-1">Evaluators</div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-maroon">{stats.total_users || 0}</div>
                  <div className="text-sm text-gray-600 mt-1">Total Users</div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ChatbotWidget />
    </div>
  );
};

export default AdminDashboard;

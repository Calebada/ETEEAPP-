import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { applicationApi, dashboardApi, curriculumApi } from '../lib/api';
import { programApi } from '../lib/api';
import { Loader2, FileText, Clock, CheckCircle2, XCircle, ArrowRight, Filter } from 'lucide-react';
import { toast } from 'sonner';

export const EvaluatorDashboard = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState('all');
  const [showCurriculumUploader, setShowCurriculumUploader] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [previewSubjects, setPreviewSubjects] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgramId, setUploadProgramId] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [programsResp, statsResp] = await Promise.all([
        programApi.list(),
        dashboardApi.getStats()
      ]);
      setPrograms(programsResp.data || []);
      const appsResp = await applicationApi.list();
      setApplications(appsResp.data);
      setStats(statsResp.data);
    } catch (err) {
      toast.error('Failed to load queue');
    }
    setLoading(false);
  };

  const reloadApplications = async (programId) => {
    setLoading(true);
    try {
      const params = {};
      if (programId && programId !== 'all') params.program_id = programId;
      const appsResp = await applicationApi.list(params);
      setApplications(appsResp.data);
    } catch (err) {
      toast.error('Failed to load applications');
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
          {/* Program selector */}
          <select
            value={selectedProgram}
            onChange={(e) => { setSelectedProgram(e.target.value); reloadApplications(e.target.value); }}
            className="ml-4 border rounded px-2 py-1 text-sm"
            data-testid="program-filter"
          >
            <option value="all">All Programs</option>
            {programs.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Button
            className="ml-3"
            size="sm"
            onClick={() => { setShowCurriculumUploader(!showCurriculumUploader); setUploadProgramId(selectedProgram === 'all' ? 'all' : selectedProgram); setPreviewSubjects(null); setUploadFile(null); }}
          >
            Upload Curriculum
          </Button>
        </div>

        {showCurriculumUploader && (
          <Card className="p-4 mb-6">
            <h3 className="font-semibold mb-2">Upload / Preview Curriculum</h3>
            <div className="flex items-center gap-2 mb-3">
              <select
                value={uploadProgramId}
                onChange={(e) => setUploadProgramId(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="all">Select Program</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code || p.name})</option>
                ))}
              </select>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setUploadFile(e.target.files && e.target.files[0])}
              />
              <Button
                size="sm"
                onClick={async () => {
                  if (!uploadFile) { toast.error('Select a PDF file first'); return; }
                  if (!uploadProgramId || uploadProgramId === 'all') { toast.error('Select a target program'); return; }
                  const program = programs.find(p => p.id === uploadProgramId);
                  if (!program) { toast.error('Program not found'); return; }
                  setAnalyzing(true);
                  try {
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                      const base64 = ev.target.result;
                      const resp = await curriculumApi.parse({ program_code: program.code, file_name: uploadFile.name, file_data: base64, mime_type: uploadFile.type });
                      setPreviewSubjects(resp.data.subjects || []);
                    };
                    reader.readAsDataURL(uploadFile);
                  } catch (err) {
                    toast.error('Failed to analyze curriculum');
                  }
                  setAnalyzing(false);
                }}
              >
                {analyzing ? 'Analyzing...' : 'Analyze'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  // Save curriculum (upload)
                  if (!uploadFile) { toast.error('Select a PDF file first'); return; }
                  if (!uploadProgramId || uploadProgramId === 'all') { toast.error('Select a target program'); return; }
                  const program = programs.find(p => p.id === uploadProgramId);
                  if (!program) { toast.error('Program not found'); return; }
                  setSaving(true);
                  try {
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                      const base64 = ev.target.result;
                      const resp = await curriculumApi.upload({ program_code: program.code, file_name: uploadFile.name, file_data: base64, mime_type: uploadFile.type });
                      if (resp.data && resp.data.created_count >= 0) {
                        toast.success(`Saved ${resp.data.created_count} subjects for ${program.name}`);
                        setPreviewSubjects(resp.data.subjects || []);
                        // reload curriculum or apps if needed
                      } else {
                        toast.error('Failed to save curriculum');
                      }
                    };
                    reader.readAsDataURL(uploadFile);
                  } catch (err) {
                    toast.error('Failed to upload curriculum');
                  }
                  setSaving(false);
                }}
              >
                {saving ? 'Saving...' : 'Save Curriculum'}
              </Button>
            </div>

            {previewSubjects && (
              <div className="mt-3">
                <h4 className="font-medium mb-2">Parsed Subjects ({previewSubjects.length})</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="py-1">Code</th>
                        <th className="py-1">Title</th>
                        <th className="py-1">Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewSubjects.map((s, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="py-1">{s.code}</td>
                          <td className="py-1">{s.title}</td>
                          <td className="py-1">{s.units}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        )}

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

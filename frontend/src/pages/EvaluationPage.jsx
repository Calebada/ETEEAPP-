import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
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
    const pdf = new jsPDF();
    
    pdf.setFontSize(20);
    pdf.setTextColor(122, 30, 43);
    pdf.text('ACREDIA Evaluation Report', 20, 20);
    
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text(`Applicant: ${application.applicant.full_name}`, 20, 35);
    pdf.text(`Email: ${application.applicant.email}`, 20, 42);
    pdf.text(`Application ID: ${application.id}`, 20, 49);
    pdf.text(`Date: ${new Date().toLocaleDateString()}`, 20, 56);
    
    pdf.setFontSize(14);
    pdf.setTextColor(122, 30, 43);
    pdf.text('Credited Subjects', 20, 75);
    
    let y = 85;
    pdf.setFontSize(9);
    pdf.setTextColor(0);
    
    const credited = matches.filter(m => m.confidence >= 60);
    credited.forEach((m) => {
      if (y > 270) { pdf.addPage(); y = 20; }
      const subj = m.curriculum_subject;
      const source = m.source === 'tor' ? 'TOR' : 'Work Exp';
      if (subj) {
        pdf.text(`${subj.code} - ${subj.title} (${subj.units} units)`, 25, y);
        pdf.text(`${m.confidence.toFixed(0)}% [${source}]`, 160, y);
        y += 7;
      }
    });
    
    if (prediction) {
      y += 10;
      if (y > 250) { pdf.addPage(); y = 20; }
      pdf.setFontSize(14);
      pdf.setTextColor(122, 30, 43);
      pdf.text('Completion Forecast', 20, y);

    }
    
    pdf.save(`ACREDIA_Report_${application.id.slice(0, 8)}.pdf`);
    toast.success('Report downloaded');
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
              {prediction && <TabsTrigger value="forecast" data-testid="tab-forecast">Study Plan</TabsTrigger>}
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
            
            {prediction && (
              <TabsContent value="forecast">
                <ForecastView prediction={prediction} />
              </TabsContent>
            )}
          </Tabs>
        ) : null}
      </div>

      <ChatbotWidget />
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
                    <div className="text-xs text-gray-500 italic mt-1">
                      Mapped from TOR: {match.tor_subject.code} - {match.tor_subject.title}
                    </div>
                  )}
                  {match.work_experience && (
                    <div className="text-xs text-gray-500 italic mt-1">
                      Based on: {match.work_experience.job_title} at {match.work_experience.company_name}
                    </div>
                  )}
                  {match.matching_reason && (
                    <div className="text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded">
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

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { applicationApi, subjectMatchApi, predictionApi } from '../lib/api';
import {
  ArrowLeft, Loader2, FileText, Briefcase, CheckCircle2, XCircle,
  AlertCircle, BookOpen, User, Calendar, MapPin, Phone, Sparkles, Flag
} from 'lucide-react';
import { toast } from 'sonner';

export const EvaluatorReviewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [matches, setMatches] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [evaluatorNote, setEvaluatorNote] = useState('');
  const [actioning, setActioning] = useState(false);

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
      setEvaluatorNote(appResp.data.evaluator_note || '');
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

  const handleRejectMatch = async (matchId) => {
    try {
      await subjectMatchApi.reject(matchId, '');
      toast.success('Match rejected');
      loadData();
    } catch (err) {
      toast.error('Failed');
    }
  };

  const handleFinalize = async () => {
    setActioning(true);
    try {
      await applicationApi.finalize(id, { evaluator_note: evaluatorNote });
      toast.success('Application finalized!');
      navigate('/evaluator');
    } catch (err) {
      toast.error('Failed to finalize');
    }
    setActioning(false);
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

  const torMatches = matches.filter(m => m.source === 'tor');
  const workMatches = matches.filter(m => m.source === 'work_experience');
  const isFinalized = application?.status === 'finalized' || application?.status === 'rejected';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="evaluator-review-page">
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

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Applicant Info & Documents */}
          <div className="lg:col-span-1 space-y-4">
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

            {application?.recommended_program && (
              <Card className="p-5 bg-maroon/5 border-maroon/20">
                <h3 className="font-serif font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-maroon" />
                  AI Recommendation
                </h3>
                <Badge className="bg-maroon text-white mb-2">{application.recommended_program}</Badge>
                <p className="text-xs text-gray-700">{application.recommendation_reasoning}</p>
              </Card>
            )}

            <Card className="p-5 border-gray-200">
              <h3 className="font-serif font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-maroon" />
                Documents ({application?.documents?.length || 0})
              </h3>
              <div className="space-y-2">
                {application?.documents?.length > 0 ? (
                  application.documents.map((doc) => (
                    <div key={doc.id} className="text-xs bg-gray-50 rounded p-2" data-testid={`doc-${doc.id}`}>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs capitalize">{doc.document_type}</Badge>
                        {doc.ocr_status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                      </div>
                      <div className="mt-1 truncate">{doc.file_name}</div>
                    </div>
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
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5 border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif font-semibold text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-maroon" />
                  Subject Matches ({matches.length})
                </h3>
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
              
              <Tabs defaultValue="all">
                <TabsList className="mb-4">
                  <TabsTrigger value="all">All ({matches.length})</TabsTrigger>
                  <TabsTrigger value="tor">From TOR ({torMatches.length})</TabsTrigger>
                  <TabsTrigger value="work">From Work ({workMatches.length})</TabsTrigger>
                </TabsList>
                
                <TabsContent value="all">
                  <MatchesList matches={matches} onApprove={handleApproveMatch} onReject={handleRejectMatch} getConfidenceColor={getConfidenceColor} disabled={isFinalized} />
                </TabsContent>
                <TabsContent value="tor">
                  <MatchesList matches={torMatches} onApprove={handleApproveMatch} onReject={handleRejectMatch} getConfidenceColor={getConfidenceColor} disabled={isFinalized} />
                </TabsContent>
                <TabsContent value="work">
                  <MatchesList matches={workMatches} onApprove={handleApproveMatch} onReject={handleRejectMatch} getConfidenceColor={getConfidenceColor} disabled={isFinalized} />
                </TabsContent>
              </Tabs>
            </Card>

            {/* Action Panel */}
            {!isFinalized && (
              <Card className="p-5 border-gray-200">
                <h3 className="font-serif font-semibold mb-3">Department Chair Decision</h3>
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

            {isFinalized && application?.evaluator_note && (
              <Card className="p-5 border-gray-200 bg-gray-50">
                <h3 className="font-serif font-semibold mb-2">Department Chair Note</h3>
                <p className="text-sm text-gray-700">{application.evaluator_note}</p>
              </Card>
            )}
          </div>
        </div>
      </div>

      <ChatbotWidget />
    </div>
  );
};

const MatchesList = ({ matches, onApprove, onReject, getConfidenceColor, disabled }) => {
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
                    <><Briefcase className="w-3 h-3 mr-1" /> Work</>
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
              {match.curriculum_subject && (
                <div className="text-sm">
                  <span className="font-semibold">{match.curriculum_subject.code}</span>
                  <span className="ml-2">{match.curriculum_subject.title}</span>
                  <span className="ml-2 text-xs text-gray-500">({match.curriculum_subject.units}u)</span>
                </div>
              )}
              {match.tor_subject && (
                <div className="text-xs text-gray-500 mt-1">
                  ← TOR: {match.tor_subject.code} - {match.tor_subject.title}
                </div>
              )}
              {match.work_experience && (
                <div className="text-xs text-gray-500 mt-1">
                  ← {match.work_experience.job_title} ({match.work_experience.years}y)
                </div>
              )}
              {match.matching_reason && (
                <div className="text-xs text-gray-600 italic mt-1">{match.matching_reason}</div>
              )}
              {match.applicant_note && (
                <div className="text-xs bg-orange-50 rounded p-1.5 mt-2">
                  <strong>Applicant note:</strong> {match.applicant_note}
                </div>
              )}
            </div>
            
            {!disabled && match.status === 'pending' && (
              <div className="flex flex-col gap-1">
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
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default EvaluatorReviewPage;

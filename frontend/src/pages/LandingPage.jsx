import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Navbar } from '../components/Navbar';
import { ChatbotWidget } from '../components/ChatbotWidget';
import { GraduationCap, FileSearch, Sparkles, Award, ArrowRight, CheckCircle2, Brain, FileText, Clock, Users } from 'lucide-react';

export const LandingPage = () => {
  const features = [
    {
      icon: FileSearch,
      title: 'AI-Powered TOR Analysis',
      description: 'Upload your transcript and let our AI extract subjects with high accuracy using vision technology.'
    },
    {
      icon: Brain,
      title: 'Smart Subject Matching',
      description: 'Our AI matches your prior coursework and work experience to the BSIT curriculum with confidence scoring.'
    },
    {
      icon: Award,
      title: 'Work Experience Credits',
      description: 'Get academic credit for your professional experience through ETEEAP equivalency assessment.'
    },
    {
      icon: Clock,
      title: 'Completion Timeline',
      description: 'Receive a personalized semester-by-semester study plan based on your remaining requirements.'
    }
  ];

  const steps = [
    { num: '01', title: 'Apply Online', desc: 'Submit your application with personal details and target program.' },
    { num: '02', title: 'Upload Documents', desc: 'Upload your TOR, work experience, and supporting credentials.' },
    { num: '03', title: 'AI Evaluation', desc: 'Our AI analyzes your documents and matches them to curriculum subjects.' },
    { num: '04', title: 'Get Results', desc: 'Receive your evaluation with credited subjects and completion forecast.' }
  ];

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: 'url(https://static.prod-images.emergentagent.com/jobs/99efe192-1f37-4bf2-8dc2-0ee6bd12bd94/images/f2f49ed31fb2ec1383fa9c91592f1d86a75023707ad0c3f4634bc09e55ad9011.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.15
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8" data-testid="hero-content">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-maroon/10 border border-maroon/20 text-maroon text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                AI-Powered Credit Evaluation
              </div>
              
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
                Your prior learning,
                <span className="block text-maroon italic">officially recognized.</span>
              </h1>
              
              <p className="text-lg text-gray-600 leading-relaxed max-w-xl">
                ACREDIA is the official AI Credit Evaluation System of Cebu Institute of Technology - University. Get academic credit for your prior education and work experience through ETEEAP.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/register">
                  <Button 
                    size="lg" 
                    className="bg-maroon hover:bg-maroon-dark text-white text-base px-8"
                    data-testid="hero-get-started-btn"
                  >
                    Start Your Application
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <Link to="/login">
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="border-maroon text-maroon hover:bg-maroon hover:text-white text-base px-8"
                    data-testid="hero-login-btn"
                  >
                    Sign In
                  </Button>
                </Link>
              </div>
              
              <div className="flex items-center gap-6 pt-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span>Free to Apply</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span>AI-Assisted</span>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 transform rotate-1">
                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
                  <div className="w-10 h-10 rounded-lg bg-maroon flex items-center justify-center">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-serif font-semibold">Transcript Analysis</div>
                    <div className="text-xs text-gray-500">Powered by Gemini AI</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { code: 'IT111', title: 'Introduction to Computing', match: 95, color: 'green' },
                    { code: 'IT121', title: 'Computer Programming 2', match: 88, color: 'green' },
                    { code: 'IT212', title: 'Database Management', match: 72, color: 'yellow' },
                    { code: 'IT213', title: 'Web Development 2', match: 58, color: 'red' },
                  ].map((item) => (
                    <div key={item.code} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-mono text-sm font-semibold">{item.code}</div>
                        <div className="text-xs text-gray-600">{item.title}</div>
                      </div>
                      <div className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        item.color === 'green' ? 'bg-green-100 text-green-700' :
                        item.color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {item.match}% match
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-gold rounded-full opacity-20 -z-10" />
              <div className="absolute -top-4 -left-4 w-32 h-32 bg-maroon rounded-full opacity-10 -z-10" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 lg:py-32 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="text-sm uppercase tracking-widest text-maroon font-semibold mb-3">Features</div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              How ACREDIA evaluates your credentials
            </h2>
            <p className="text-gray-600 text-lg">
              Combining cutting-edge AI with academic expertise to provide accurate credit evaluation.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div key={i} className="bg-white p-6 rounded-lg border border-gray-200 hover:border-maroon/30 hover:shadow-md smooth-transition" data-testid={`feature-card-${i}`}>
                  <div className="w-12 h-12 rounded-lg bg-maroon/10 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-maroon" />
                  </div>
                  <h3 className="font-serif font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-20 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="text-sm uppercase tracking-widest text-maroon font-semibold mb-3">Process</div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              From application to accreditation
            </h2>
            <p className="text-gray-600 text-lg">
              Four simple steps to get your prior learning officially recognized.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="relative" data-testid={`step-${i}`}>
                <div className="text-6xl font-serif font-bold text-maroon/10 mb-2">{step.num}</div>
                <h3 className="font-serif font-bold text-xl mb-2">{step.title}</h3>
                <p className="text-gray-600 text-sm">{step.desc}</p>
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 right-0 w-full">
                    <ArrowRight className="w-6 h-6 text-gold absolute -right-3 top-2" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-32 bg-maroon text-white relative overflow-hidden">
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 25% 50%, rgba(212, 167, 71, 0.5) 0%, transparent 50%)'
          }}
        />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold mb-6">
            Ready to start your journey?
          </h2>
          <p className="text-lg text-gray-200 mb-8 max-w-2xl mx-auto">
            Join thousands of professionals getting their prior learning recognized at CIT-University.
          </p>
          <Link to="/register">
            <Button size="lg" className="bg-gold text-gray-900 hover:bg-gold/90 text-base px-8" data-testid="cta-apply-btn">
              Apply for ETEEAP
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-gold" />
              <div>
                <div className="font-serif font-bold text-white">ACREDIA</div>
                <div className="text-xs">CIT-U Credit Evaluation System</div>
              </div>
            </div>
            <div className="text-sm">
              © 2025 Cebu Institute of Technology - University. All rights reserved.
            </div>
          </div>
        </div>
      </footer>

      <ChatbotWidget />
    </div>
  );
};

export default LandingPage;

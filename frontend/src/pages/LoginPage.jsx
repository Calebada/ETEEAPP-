import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { useAuth } from '../lib/auth-context';
import { GraduationCap, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const user = await login(email, password);
      toast.success('Login successful!');
      navigate(`/${user.role}`);
    } catch (err) {
      const errorMsg = err.response?.data?.non_field_errors?.[0] || err.response?.data?.detail || 'Invalid credentials';
      setError(errorMsg);
      toast.error(errorMsg);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-maroon relative overflow-hidden">
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'url(https://static.prod-images.emergentagent.com/jobs/99efe192-1f37-4bf2-8dc2-0ee6bd12bd94/images/f2f49ed31fb2ec1383fa9c91592f1d86a75023707ad0c3f4634bc09e55ad9011.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-3" data-testid="login-logo-link">
            <div className="w-12 h-12 rounded-lg bg-gold flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-gray-900" />
            </div>
            <div>
              <div className="font-serif font-bold text-2xl">ACREDIA</div>
              <div className="text-xs uppercase tracking-wider opacity-80">CIT-University</div>
            </div>
          </Link>
          
          <div>
            <h1 className="font-serif text-5xl font-bold leading-tight mb-6">
              Welcome back to your<br />academic journey.
            </h1>
            <p className="text-lg opacity-90 max-w-md">
              Sign in to track your application, view your evaluation, and manage your credentials.
            </p>
          </div>
          
          <div className="text-sm opacity-70">
            © 2025 Cebu Institute of Technology - University
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-gray-50">
        <Card className="w-full max-w-md p-8 border-gray-200" data-testid="login-card">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-maroon flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-serif font-bold text-xl text-maroon">ACREDIA</div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">CIT-U</div>
            </div>
          </div>
          
          <h2 className="font-serif text-3xl font-bold mb-2">Sign In</h2>
          <p className="text-gray-600 mb-8">Enter your credentials to access your account</p>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700 text-sm" data-testid="login-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                data-testid="login-email-input"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                data-testid="login-password-input"
                className="mt-1"
              />
            </div>
            
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-maroon hover:bg-maroon-dark text-white"
              data-testid="login-submit-btn"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="text-maroon font-semibold hover:underline" data-testid="register-link">
              Sign up
            </Link>
          </div>
          
          <div className="mt-6 pt-6 border-t border-gray-200 text-xs text-gray-500">
            <div className="font-semibold mb-1">Demo Accounts:</div>
            <div>Applicant: applicant@test.com / applicant123</div>
            <div>Department Chair: chair@citu.edu / chair123</div>
            <div>Admin: admin@citu.edu / admin123</div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;

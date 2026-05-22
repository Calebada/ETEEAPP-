import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { useAuth } from '../lib/auth-context';
import { GraduationCap, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      return;
    }
    
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setLoading(true);
    
    try {
      const user = await register({
        full_name: formData.full_name,
        email: formData.email,
        password: formData.password,
        role: 'applicant'
      });
      toast.success('Account created successfully!');
      navigate(`/${user.role}`);
    } catch (err) {
      const errorMsg = err.response?.data?.email?.[0] || err.response?.data?.detail || 'Registration failed';
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
          <Link to="/" className="flex items-center gap-3">
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
              Begin your<br />ETEEAP journey<br />today.
            </h1>
            <p className="text-lg opacity-90 max-w-md">
              Create your account to start the application process and get your credits evaluated by AI.
            </p>
          </div>
          
          <div className="text-sm opacity-70">
            © 2025 Cebu Institute of Technology - University
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-gray-50">
        <Card className="w-full max-w-md p-8 border-gray-200" data-testid="register-card">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-maroon flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-serif font-bold text-xl text-maroon">ACREDIA</div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">CIT-U</div>
            </div>
          </div>
          
          <h2 className="font-serif text-3xl font-bold mb-2">Create Account</h2>
          <p className="text-gray-600 mb-8">Sign up as an applicant to get started</p>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700 text-sm" data-testid="register-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                placeholder="Juan Dela Cruz"
                required
                data-testid="register-name-input"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                required
                data-testid="register-email-input"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="At least 8 characters"
                required
                minLength={8}
                data-testid="register-password-input"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="confirm_password">Confirm Password</Label>
              <Input
                id="confirm_password"
                name="confirm_password"
                type="password"
                value={formData.confirm_password}
                onChange={handleChange}
                placeholder="Re-enter password"
                required
                data-testid="register-confirm-password-input"
                className="mt-1"
              />
            </div>
            
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-maroon hover:bg-maroon-dark text-white"
              data-testid="register-submit-btn"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-maroon font-semibold hover:underline" data-testid="login-link">
              Sign in
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default RegisterPage;

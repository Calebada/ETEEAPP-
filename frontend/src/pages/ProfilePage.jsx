import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { authApi } from '../lib/api';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { toast } from 'sonner';
import {
  User,
  Lock,
  Mail,
  Shield,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Calendar,
  Sparkles,
  Loader2
} from 'lucide-react';

const ProfilePage = () => {
  const { user, updateUserData } = useAuth();
  const navigate = useNavigate();

  // Profile update state
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password update state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U';

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      toast.error('Full name cannot be empty.');
      return;
    }

    if (trimmed === user?.full_name) {
      toast.info('No changes made to full name.');
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const response = await authApi.updateProfile({ full_name: trimmed });
      updateUserData(response.data);
      toast.success('Full name updated successfully!');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to update profile name.';
      toast.error(errorMsg);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();

    if (!newPassword) {
      toast.error('Please enter a new password.');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const response = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      if (response.data?.user) {
        updateUserData(response.data.user, {
          access: response.data.access,
          refresh: response.data.refresh,
        });
      }

      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to change password. Please verify current password.';
      toast.error(errorMsg);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const getDashboardPath = () => {
    if (user?.role === 'evaluator') return '/evaluator';
    if (user?.role === 'admin') return '/admin';
    return '/applicant';
  };

  const getRoleLabel = () => {
    if (user?.role === 'evaluator') return 'Department Chair / Evaluator';
    if (user?.role === 'admin') return 'System Administrator';
    return 'ETEEAP Applicant';
  };

  const formattedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Active Account';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-amber-50/20">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Breadcrumb & Back button */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(getDashboardPath())}
              className="gap-2 bg-white hover:bg-gray-50 border-gray-200 text-gray-700 shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 font-serif">Account Profile & Security</h1>
              <p className="text-sm text-gray-500">
                Manage your personal details, credentials, and account security
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-maroon/10 border border-maroon/20 text-maroon text-xs font-semibold">
            <Shield className="w-3.5 h-3.5" />
            CIT-U ETEEAP Certified Account
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: User Summary Card */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-gray-200 shadow-sm bg-white overflow-hidden">
              <div className="h-24 bg-gradient-to-r from-maroon via-maroon-dark to-amber-800 relative">
                <div className="absolute inset-0 bg-black/10" />
              </div>
              <CardContent className="pt-0 relative px-6 pb-6 text-center">
                <div className="flex justify-center -mt-12 mb-3">
                  <Avatar className="h-24 w-24 border-4 border-white shadow-md ring-2 ring-maroon/20">
                    <AvatarFallback className="bg-amber-100 text-maroon text-2xl font-bold font-serif">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>

                <h2 className="text-lg font-bold text-gray-900 font-serif">{user?.full_name || 'User'}</h2>
                <p className="text-xs text-gray-500 break-all mb-3 flex items-center justify-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  {user?.email}
                </p>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200/80 mb-6">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  {getRoleLabel()}
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-3 text-left text-xs text-gray-600">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <Shield className="w-3.5 h-3.5 text-maroon" />
                      Role
                    </span>
                    <span className="font-semibold text-gray-800 capitalize">{user?.role || 'Applicant'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <Calendar className="w-3.5 h-3.5 text-maroon" />
                      Member Since
                    </span>
                    <span className="font-medium text-gray-800">{formattedDate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-500">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Status
                    </span>
                    <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Verified & Active
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Info Box */}
            <Card className="border-gray-200 shadow-sm bg-gradient-to-br from-amber-50/50 to-orange-50/30">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-maroon" />
                  Security Best Practices
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Use a strong, unique password with at least 8 characters. Do not share your credentials with anyone.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Edit Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card 1: Edit Profile / Full Name */}
            <Card className="border-gray-200 shadow-sm bg-white">
              <CardHeader className="border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-maroon/10 text-maroon">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-gray-900 font-serif">
                      Personal Information
                    </CardTitle>
                    <CardDescription className="text-xs text-gray-500">
                      Update your display full name used across official ETEEAP transcripts and evaluation reports
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name" className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Full Name <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <Input
                        id="full_name"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Juan Dela Cruz"
                        className="pl-10 h-10 border-gray-200 focus:border-maroon focus:ring-maroon text-sm font-medium"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-gray-500">
                      This name will appear on official CIT-U certificates, accreditation matrices, and PDF exports.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <Input
                        id="email"
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="pl-10 h-10 bg-gray-50/80 border-gray-200 text-gray-600 text-sm cursor-not-allowed"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Email address is linked to your institutional account and cannot be changed directly.
                    </p>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      type="submit"
                      disabled={isUpdatingProfile || fullName.trim() === user?.full_name}
                      className="bg-maroon hover:bg-maroon-dark text-white px-5 h-10 text-xs font-bold uppercase tracking-wider shadow-sm transition-all disabled:opacity-50"
                    >
                      {isUpdatingProfile ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                          Saving Changes...
                        </>
                      ) : (
                        'Save Full Name'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Card 2: Change Password */}
            <Card className="border-gray-200 shadow-sm bg-white">
              <CardHeader className="border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-gray-900 font-serif">
                      Change Password
                    </CardTitle>
                    <CardDescription className="text-xs text-gray-500">
                      Ensure your account is protected by using a secure password of at least 8 characters
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  {/* Current Password */}
                  <div className="space-y-2">
                    <Label htmlFor="current_password" className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Current Password <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <Input
                        id="current_password"
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter your current password"
                        className="pl-10 pr-10 h-10 border-gray-200 focus:border-maroon focus:ring-maroon text-sm"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password & Confirm Password in Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="new_password" className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        New Password <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <Input
                          id="new_password"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="pl-10 pr-10 h-10 border-gray-200 focus:border-maroon focus:ring-maroon text-sm"
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm_password" className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Confirm New Password <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <Input
                          id="confirm_password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                          className={`pl-10 pr-10 h-10 border-gray-200 focus:border-maroon focus:ring-maroon text-sm ${
                            confirmPassword && newPassword !== confirmPassword ? 'border-red-300 focus:border-red-500' : ''
                          }`}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Password match indicator */}
                  {confirmPassword && (
                    <div className="flex items-center gap-1.5 text-xs">
                      {newPassword === confirmPassword ? (
                        <span className="text-emerald-700 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Passwords match
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-1 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" /> Passwords do not match
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pt-2 flex justify-end">
                    <Button
                      type="submit"
                      disabled={isUpdatingPassword || !newPassword || !currentPassword || newPassword !== confirmPassword}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-5 h-10 text-xs font-bold uppercase tracking-wider shadow-sm transition-all disabled:opacity-50"
                    >
                      {isUpdatingPassword ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                          Updating Password...
                        </>
                      ) : (
                        'Update Password'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProfilePage;

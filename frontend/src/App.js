import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './lib/auth-context';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ApplicantDashboard from './pages/ApplicantDashboard';
import ApplyPage from './pages/ApplyPage';
import EvaluationPage from './pages/EvaluationPage';
import EvaluatorDashboard from './pages/EvaluatorDashboard';
import EvaluatorReviewPage from './pages/EvaluatorReviewPage';
import AdminDashboard from './pages/AdminDashboard';
import { Loader2 } from 'lucide-react';
import './index.css';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-maroon" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.role}`} replace />;
  }
  
  return children;
};

const PublicOnlyRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-maroon" />
      </div>
    );
  }
  
  if (user) {
    return <Navigate to={`/${user.role}`} replace />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          } />
          <Route path="/register" element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          } />
          
          {/* Applicant Routes */}
          <Route path="/applicant" element={
            <ProtectedRoute allowedRoles={['applicant']}>
              <ApplicantDashboard />
            </ProtectedRoute>
          } />
          <Route path="/applicant/applications" element={
            <ProtectedRoute allowedRoles={['applicant']}>
              <ApplicantDashboard />
            </ProtectedRoute>
          } />
          <Route path="/applicant/apply/:id" element={
            <ProtectedRoute allowedRoles={['applicant']}>
              <ApplyPage />
            </ProtectedRoute>
          } />
          <Route path="/applicant/evaluation/:id" element={
            <ProtectedRoute allowedRoles={['applicant']}>
              <EvaluationPage />
            </ProtectedRoute>
          } />
          
          {/* Evaluator Routes */}
          <Route path="/evaluator" element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin']}>
              <EvaluatorDashboard />
            </ProtectedRoute>
          } />
          <Route path="/evaluator/review/:id" element={
            <ProtectedRoute allowedRoles={['evaluator', 'admin']}>
              <EvaluatorReviewPage />
            </ProtectedRoute>
          } />
          
          {/* Admin Routes */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/curriculum" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

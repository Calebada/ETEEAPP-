import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { Button } from './ui/button';
import { GraduationCap, LogOut, LayoutDashboard, FileText, Users, Settings } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback } from './ui/avatar';

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getNavItems = () => {
    if (!user) return [];
    
    if (user.role === 'applicant') {
      return [
        { label: 'Dashboard', path: '/applicant', icon: LayoutDashboard },
        { label: 'My Applications', path: '/applicant/applications', icon: FileText },
      ];
    }
    if (user.role === 'evaluator') {
      return [
        { label: 'Review Queue', path: '/evaluator', icon: LayoutDashboard },
      ];
    }
    if (user.role === 'admin') {
      return [
        { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
        { label: 'Users', path: '/admin/users', icon: Users },
        { label: 'Curriculum', path: '/admin/curriculum', icon: Settings },
      ];
    }
    return [];
  };

  const navItems = getNavItems();
  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40" data-testid="main-navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link to={user ? `/${user.role}` : '/'} className="flex items-center gap-2" data-testid="navbar-logo">
              <div className="w-10 h-10 rounded-lg bg-maroon flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-serif font-bold text-xl text-maroon leading-none">ACREDIA</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">CIT-U</div>
              </div>
            </Link>
            
            {user && (
              <div className="hidden md:flex items-center gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium smooth-transition ${
                        isActive
                          ? 'bg-maroon text-white'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2" data-testid="user-menu-trigger">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gold text-gray-900 text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden md:block text-left">
                      <div className="text-sm font-medium">{user.full_name}</div>
                      <div className="text-xs text-gray-500 capitalize">
                        {user.role === 'evaluator' ? 'Department Chair' : user.role}
                      </div>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600" onClick={logout} data-testid="logout-button">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => navigate('/login')} data-testid="navbar-login-btn">
                  Sign In
                </Button>
                <Button className="bg-maroon hover:bg-maroon-dark text-white" onClick={() => navigate('/register')} data-testid="navbar-register-btn">
                  Apply Now
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

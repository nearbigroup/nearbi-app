'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type Role = 'admin' | 'ops_manager' | 'staff_executive' | 'kiosk';

export interface User {
  email: string;
  role: Role;
}

export const VALID_USERS: Record<string, User & { password: string }> = {
  'adminnearbi@gmail.com': { email: 'adminnearbi@gmail.com', password: 'nearbi@123', role: 'admin' },
  'ops@nearbi.com': { email: 'ops@nearbi.com', password: 'ops@123', role: 'ops_manager' },
  'hr@nearbi.com': { email: 'hr@nearbi.com', password: 'hr@123', role: 'staff_executive' },
  'staffkiosk@gmail.com': { email: 'staffkiosk@gmail.com', password: 'staff@123', role: 'kiosk' },
};

interface AuthContextType {
  user: User | null;
  branch: string | null;
  login: (email: string, password: string, branchId: string) => boolean;
  logout: () => void;
  isLoading: boolean;
  canSeeSalaryBreakdown: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check localStorage on mount
    const storedUser = localStorage.getItem('nearbi_user');
    const storedBranch = localStorage.getItem('nearbi_branch');
    
    if (storedUser && storedBranch) {
      try {
        const parsedUser = JSON.parse(storedUser) as User;
        setUser(parsedUser);
        setBranch(storedBranch);
      } catch (e) {
        console.error('Failed to parse user from local storage');
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isLoading) return;

    // Routing rules
    if (!user && pathname !== '/') {
      router.replace('/');
      return;
    }

    if (user) {
      if (user.role === 'kiosk' && pathname !== '/kiosk') {
        router.replace('/kiosk');
        return;
      }
      
      if (user.role !== 'kiosk' && pathname === '/') {
        router.replace('/dashboard'); // or wherever they should go after login
        return;
      }
    }
  }, [user, pathname, isLoading, router]);

  const login = (email: string, pass: string, branchId: string) => {
    const validUser = VALID_USERS[email];
    if (validUser && validUser.password === pass) {
      const newUser = { email: validUser.email, role: validUser.role };
      setUser(newUser);
      setBranch(branchId);
      localStorage.setItem('nearbi_user', JSON.stringify(newUser));
      localStorage.setItem('nearbi_branch', branchId);
      
      if (newUser.role === 'kiosk') {
        router.push('/kiosk');
      } else {
        router.push('/dashboard');
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    setBranch(null);
    localStorage.removeItem('nearbi_user');
    localStorage.removeItem('nearbi_branch');
    router.push('/');
  };

  const canSeeSalaryBreakdown = user?.role === 'admin' || user?.role === 'ops_manager';

  return (
    <AuthContext.Provider value={{ user, branch, login, logout, isLoading, canSeeSalaryBreakdown }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

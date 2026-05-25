'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type Role = 'admin' | 'ops_manager' | 'staff_executive' | 'kiosk';

export interface AuthUser {
  email: string;
  role: Role;
  branch: string | null;
  name: string;
}

export const VALID_USERS: Record<string, AuthUser & { password: string }> = {
  'adminnearbi@gmail.com': {
    email: 'adminnearbi@gmail.com',
    password: 'nearbi@123',
    role: 'admin',
    branch: null,
    name: 'Owner'
  },
  'ops@nearbi.com': {
    email: 'ops@nearbi.com',
    password: 'ops@123',
    role: 'ops_manager',
    branch: null,
    name: 'Operations Manager'
  },
  'hr@nearbi.com': {
    email: 'hr@nearbi.com',
    password: 'hr@123',
    role: 'staff_executive',
    branch: null,
    name: 'Head HR'
  },
  'daily.hr@nearbi.com': {
    email: 'daily.hr@nearbi.com',
    password: 'daily@123',
    role: 'staff_executive',
    branch: 'daily',
    name: 'Daily Branch HR'
  },
  'hyper.hr@nearbi.com': {
    email: 'hyper.hr@nearbi.com',
    password: 'hyper@123',
    role: 'staff_executive',
    branch: 'hypermarket',
    name: 'Hypermarket HR'
  },
  'staffkiosk@gmail.com': {
    email: 'staffkiosk@gmail.com',
    password: 'staff@123',
    role: 'kiosk',
    branch: null,
    name: 'Kiosk'
  },
};

interface AuthContextType {
  user: AuthUser | null;
  userBranch: string | null;
  canSeeSalaryBreakdown: boolean;
  canSeeAllBranches: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => void;
  setBranch: (branchId: string | null) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userBranch, setUserBranchState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check localStorage on mount
    const storedUser = localStorage.getItem('nearbi_user');
    const storedBranch = localStorage.getItem('nearbi_branch');
    
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as AuthUser;
        setUser(parsedUser);
        if (storedBranch) {
          setUserBranchState(storedBranch);
        } else {
          setUserBranchState(parsedUser.branch);
        }
      } catch (e) {
        console.error('Failed to parse user from local storage', e);
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isLoading) return;

    // Routing rules
    if (!user) {
      if (pathname !== '/') {
        router.replace('/');
      }
      return;
    }

    if (user.role === 'kiosk') {
      if (pathname !== '/kiosk') {
        router.replace('/kiosk');
      }
    } else {
      // Other roles visiting /kiosk -> redirect to dashboard
      if (pathname === '/kiosk') {
        router.replace('/dashboard');
      }
      // Other roles visiting / -> redirect to dashboard
      else if (pathname === '/') {
        router.replace('/dashboard');
      }
    }
  }, [user, pathname, isLoading, router]);

  const login = async (email: string, pass: string): Promise<boolean> => {
    const validUser = VALID_USERS[email.toLowerCase().trim()];
    if (validUser && validUser.password === pass) {
      const { password, ...userWithoutPassword } = validUser;
      setUser(userWithoutPassword);
      
      // Default branch for branch-specific users
      const initialBranch = userWithoutPassword.branch;
      setUserBranchState(initialBranch);
      
      localStorage.setItem('nearbi_user', JSON.stringify(userWithoutPassword));
      if (initialBranch) {
        localStorage.setItem('nearbi_branch', initialBranch);
      } else {
        localStorage.removeItem('nearbi_branch');
      }

      if (userWithoutPassword.role === 'kiosk') {
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
    setUserBranchState(null);
    localStorage.removeItem('nearbi_user');
    localStorage.removeItem('nearbi_branch');
    router.push('/');
  };

  const setBranch = (branchId: string | null) => {
    // Only allow setting branch if user is allowed to see multiple branches
    const role = user?.role;
    const isHeadHr = role === 'staff_executive' && user?.branch === null;
    const isOwnerOrOps = role === 'admin' || role === 'ops_manager';
    const isKiosk = role === 'kiosk';
    
    if (isOwnerOrOps || isHeadHr || isKiosk) {
      setUserBranchState(branchId);
      if (branchId) {
        localStorage.setItem('nearbi_branch', branchId);
      } else {
        localStorage.removeItem('nearbi_branch');
      }
    }
  };

  const canSeeSalaryBreakdown = user?.role === 'admin' || user?.role === 'ops_manager';
  const canSeeAllBranches =
    user?.role === 'admin' ||
    user?.role === 'ops_manager' ||
    (user?.role === 'staff_executive' && user.branch === null);

  return (
    <AuthContext.Provider
      value={{
        user,
        userBranch,
        canSeeSalaryBreakdown,
        canSeeAllBranches,
        login,
        logout,
        setBranch,
        isLoading
      }}
    >
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

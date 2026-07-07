'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from './supabase';
import bcrypt from 'bcryptjs';

export type Role = 'admin' | 'ops_manager' | 'staff_executive' | 'kiosk' | 'staff' | 'nearbi_homes_supervisor' | 'partner_viewer';

export interface AuthUser {
  email: string;
  role: Role;
  branch: string | null;
  name: string;
  staffId?: string;
  mustChangePassword?: boolean;
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
  'nearbihomes@nearbi.com': {
    email: 'nearbihomes@nearbi.com',
    password: 'homes@123',
    role: 'nearbi_homes_supervisor',
    branch: 'hypermarket',
    name: 'Nearbi Homes Supervisor'
  },
  'partner@nearbi.com': {
    email: 'partner@nearbi.com',
    password: 'partner@123',
    role: 'partner_viewer',
    branch: null,
    name: 'Partner Viewer'
  },
  'staffkiosk@gmail.com': {
    email: 'staffkiosk@gmail.com',
    password: 'staff@123',
    role: 'kiosk',
    branch: null,
    name: 'Kiosk'
  },
};

export const getMergedUsers = (): Record<string, AuthUser & { password: string }> => {
  if (typeof window === 'undefined') return VALID_USERS;
  try {
    const customUsersJson = localStorage.getItem('nearbi_custom_users');
    if (customUsersJson) {
      const customUsers = JSON.parse(customUsersJson);
      return {
        ...VALID_USERS,
        ...customUsers
      };
    }
  } catch (err) {
    console.error('Error parsing custom users from localStorage:', err);
  }
  return VALID_USERS;
};

interface AuthContextType {
  user: AuthUser | null;
  userBranch: string | null;
  canSeeSalaryBreakdown: boolean;
  canSeeAllBranches: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  staffLogin: (mobile: string, pass: string) => Promise<boolean>;
  changePassword: (mobile: string, oldPass: string, newPass: string) => Promise<boolean>;
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

    if (user.role === 'staff') {
      if (user.mustChangePassword) {
        if (pathname !== '/my/change-password') {
          router.replace('/my/change-password');
        }
      } else {
        if (!pathname.startsWith('/my')) {
          router.replace('/my');
        } else if (pathname === '/my/change-password') {
          // Allow accessing change-password, but if they came from profile they can be here.
        }
      }
    } else {
      if (pathname.startsWith('/my')) {
        if (user.role === 'kiosk') {
          router.replace('/kiosk');
        } else {
          router.replace('/dashboard');
        }
      } else if (user.role === 'kiosk') {
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
    }
  }, [user, pathname, isLoading, router]);

  const login = async (email: string, pass: string): Promise<boolean> => {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if blocked (Fix 16)
    if (typeof window !== 'undefined') {
      try {
        const blockedUsersJson = localStorage.getItem('nearbi_blocked_users');
        if (blockedUsersJson) {
          const blockedUsers = JSON.parse(blockedUsersJson);
          if (Array.isArray(blockedUsers) && blockedUsers.includes(normalizedEmail)) {
            alert("This account is blocked. Please contact the administrator.");
            return false;
          }
        }
      } catch (err) {
        console.error('Error checking blocked status:', err);
      }
    }

    try {
      const { data: dbUser, error: dbErr } = await supabase
        .from('app_logins')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (dbErr) throw dbErr;

      if (dbUser) {
        const match = bcrypt.compareSync(pass, dbUser.password_hash);
        if (!match) return false;

        // Check if blocked in user_permissions
        try {
          const { data: perm } = await supabase
            .from('user_permissions')
            .select('is_blocked')
            .eq('user_email', normalizedEmail)
            .maybeSingle();

          if (perm?.is_blocked) {
            alert("Your access has been disabled. Contact admin.");
            return false;
          }
        } catch (err) {
          console.error('Error checking user_permissions:', err);
        }

        let mappedRole: Role = 'staff';
        let mappedBranch: string | null = null;

        if (dbUser.role_key === 'daily_hr') {
          mappedRole = 'staff_executive';
          mappedBranch = 'daily';
        } else if (dbUser.role_key === 'hyper_hr') {
          mappedRole = 'staff_executive';
          mappedBranch = 'hypermarket';
        } else if (dbUser.role_key === 'nearbi_homes_supervisor') {
          mappedRole = 'nearbi_homes_supervisor';
          mappedBranch = 'hypermarket';
        } else {
          mappedRole = dbUser.role_key as Role;
          mappedBranch = null;
        }

        const userWithoutPassword: AuthUser = {
          email: dbUser.email,
          role: mappedRole,
          branch: mappedBranch,
          name: dbUser.display_name
        };

        setUser(userWithoutPassword);
        setUserBranchState(mappedBranch);
        
        localStorage.setItem('nearbi_user', JSON.stringify(userWithoutPassword));
        if (mappedBranch) {
          localStorage.setItem('nearbi_branch', mappedBranch);
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
    } catch (err) {
      console.error('Error query app_logins:', err);
    }
    return false;
  };

  const staffLogin = async (mobile: string, pass: string): Promise<boolean> => {
    const { data: account, error } = await supabase
      .from('staff_accounts')
      .select('*, staff(*)')
      .eq('mobile_number', mobile.trim())
      .maybeSingle();

    if (error || !account) return false;
    if (account.password !== pass) return false;

    const u: AuthUser = {
      email: mobile,
      role: 'staff',
      staffId: account.staff_id,
      name: account.staff?.name,
      branch: account.staff?.branch_id,
      mustChangePassword: account.must_change_password,
    };
    setUser(u);
    localStorage.setItem('nearbi_user', JSON.stringify(u));

    // Update last login
    await supabase
      .from('staff_accounts')
      .update({ last_login: new Date().toISOString() })
      .eq('id', account.id);

    router.push('/my');
    return true;
  };

  const changePassword = async (
    mobile: string,
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from('staff_accounts')
      .select('id, password')
      .eq('mobile_number', mobile)
      .maybeSingle();
    if (error || !data || data.password !== oldPassword) return false;
    await supabase
      .from('staff_accounts')
      .update({ password: newPassword, must_change_password: false })
      .eq('id', data.id);
      
    // Also update local state
    if (user && user.role === 'staff') {
      const updatedUser = { ...user, mustChangePassword: false };
      setUser(updatedUser);
      localStorage.setItem('nearbi_user', JSON.stringify(updatedUser));
    }
    return true;
  };

  const logout = () => {
    setUser(null);
    setUserBranchState(null);
    localStorage.removeItem('nearbi_user');
    localStorage.removeItem('nearbi_branch');
    router.push('/');
  };

  const setBranch = (branchId: string | null) => {
    // Allow ALL roles to set branch
    // Remove any role restrictions on this function
    setUserBranchState(branchId);
    if (branchId) {
      localStorage.setItem('nearbi_branch', branchId);
    } else {
      localStorage.removeItem('nearbi_branch');
    }
  };

  const canSeeSalaryBreakdown = user?.role === 'admin' || user?.role === 'ops_manager' || user?.role === 'partner_viewer' || user?.role === 'nearbi_homes_supervisor';
  const canSeeAllBranches =
    user?.role === 'admin' ||
    user?.role === 'ops_manager' ||
    user?.role === 'partner_viewer' ||
    (user?.role === 'staff_executive' && user.branch === null);

  return (
    <AuthContext.Provider
      value={{
        user,
        userBranch,
        canSeeSalaryBreakdown,
        canSeeAllBranches,
        login,
        staffLogin,
        changePassword,
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

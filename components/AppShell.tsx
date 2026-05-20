'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard,
  Clock,
  Users,
  ClipboardList,
  Wallet,
  CheckSquare,
  Bell,
  LogOut,
  X
} from 'lucide-react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, userBranch, logout, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const toastTimeoutRef = useRef<any>(null);
  const [activeToast, setActiveToast] = useState<{ title: string; message: string } | null>(null);

  // Fetch unread notification count
  const fetchUnreadCount = async () => {
    if (!user) return;
    try {
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);

      // Branch isolation for branch HR
      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }

      // Role filtering
      if (user.role === 'staff_executive') {
        query = query.in('type', [
          'late_fine',
          'ot_pending',
          'early_in_pending',
          'leave_request',
          'absent_alert',
        ]);
      }

      const { count, error } = await query;
      if (error) throw error;
      setUnreadCount(count ?? 0);
    } catch (err) {
      console.error('Error fetching unread notifications count:', err);
    }
  };

  useEffect(() => {
    if (!user || pathname === '/' || pathname === '/kiosk') return;

    fetchUnreadCount();

    // Subscribe to notifications
    const subscription = supabase
      .channel('appshell-notifs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        (payload) => {
          fetchUnreadCount();

          if (payload.eventType === 'INSERT') {
            const newNotif = payload.new as any;
            
            // Check if notification matches current user scope
            const matchesBranch = !userBranch || newNotif.branch_id === userBranch;
            let matchesRole = true;

            if (user.role === 'staff_executive') {
              const allowedTypes = [
                'late_fine',
                'ot_pending',
                'early_in_pending',
                'leave_request',
                'absent_alert',
              ];
              matchesRole = allowedTypes.includes(newNotif.type);
            }

            if (matchesBranch && matchesRole) {
              // Trigger slide-down toast
              setActiveToast({
                title: newNotif.title,
                message: newNotif.message,
              });

              if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
              }
              toastTimeoutRef.current = setTimeout(() => {
                setActiveToast(null);
              }, 4000);
            }
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [user, userBranch, pathname]);

  if (pathname === '/' || pathname === '/kiosk' || isLoading || !user) {
    return <>{children}</>;
  }

  // Filter bottom nav tabs based on role
  const isStaffExec = user.role === 'staff_executive';
  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={22} strokeWidth={1.5} style={{ color: 'currentColor' }} /> },
    { label: 'Attend', path: '/attendance', icon: <Clock size={22} strokeWidth={1.5} style={{ color: 'currentColor' }} /> },
    { label: 'Staff', path: '/staff', icon: <Users size={22} strokeWidth={1.5} style={{ color: 'currentColor' }} /> },
    { label: 'Leave', path: '/leave', icon: <ClipboardList size={22} strokeWidth={1.5} style={{ color: 'currentColor' }} /> },
    ...(!isStaffExec ? [{ label: 'Salary', path: '/salary', icon: <Wallet size={22} strokeWidth={1.5} style={{ color: 'currentColor' }} /> }] : []),
    { label: 'Approvals', path: '/approvals', icon: <CheckSquare size={22} strokeWidth={1.5} style={{ color: 'currentColor' }} /> },
  ];

  const getBranchLabel = () => {
    if (userBranch === 'daily') return 'Nearbi Daily';
    if (userBranch === 'hypermarket') return 'Nearbi Hypermarket';
    return 'All Branches';
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col relative app-frame">
      {/* Toast Alert */}
      {activeToast && (
        <div className="fixed top-[70px] left-4 right-4 z-[99999] bg-[var(--bg-elevated)] text-white p-4 rounded-xl border border-[var(--border-strong)] border-l-[3px] border-l-white shadow-2xl transition-all duration-300">
          <div className="flex items-start space-x-3">
            <Bell size={20} strokeWidth={1.5} style={{ color: '#FBBF24' }} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-sm text-white">{activeToast.title}</h4>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{activeToast.message}</p>
            </div>
            <button
              onClick={() => setActiveToast(null)}
              className="text-[var(--text-muted)] hover:text-white text-sm font-bold flex items-center justify-center p-0.5"
            >
              <X size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
            </button>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <header className="bg-[var(--bg-surface)] text-white sticky top-0 z-[1000] px-4 py-3 flex items-center justify-between min-h-[56px] border-b border-[var(--border)] select-none pt-[calc(12px+env(safe-area-inset-top,0px))]">
        <div className="flex items-center space-x-2">
          <div className="font-[900] text-[20px] tracking-tight flex items-center">
            <span className="text-white">near</span>
            <span className="text-[#FBBF24]">bi</span>
          </div>
          <div className="border border-white/20 text-white text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ml-1.5">
            STAFF
          </div>
        </div>

        <div className="text-[var(--text-secondary)] font-medium text-xs text-center truncate max-w-[150px]">
          {getBranchLabel()}
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => router.push('/notifications')}
            className="relative p-1 focus:outline-none flex items-center justify-center text-[var(--text-secondary)] hover:text-white"
          >
            <Bell size={20} strokeWidth={1.5} style={{ color: 'currentColor' }} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#F87171] text-white text-[9px] font-bold">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={logout}
            className="border border-[var(--border-strong)] text-[var(--text-secondary)] bg-transparent px-2.5 py-1 text-xs rounded-md font-bold active:border-white active:text-white transition-all hover:text-white hover:border-white flex items-center space-x-1.5"
          >
            <LogOut size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-4 pb-[calc(80px+env(safe-area-inset-bottom,20px))]">
        {children}
      </main>

      {/* Bottom Nav Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-[9999] bg-[var(--bg-surface)] border-t border-[var(--border)] shadow-[0_-1px_0_var(--border)] pb-[env(safe-area-inset-bottom,16px)]">
        <div className="max-w-md mx-auto flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex-1 flex flex-col items-center justify-center min-h-[60px] cursor-pointer border-t-2 select-none transition-all ${
                  isActive
                    ? 'border-white text-white bg-white/5'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-white'
                }`}
              >
                <span className="mb-0.5">{item.icon}</span>
                <span className="text-[10px] font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

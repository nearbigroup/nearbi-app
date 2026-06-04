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
  const [isMobile, setIsMobile] = useState(false);
  const toastTimeoutRef = useRef<any>(null);
  const [activeToast, setActiveToast] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 480);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  if (pathname === '/' || pathname === '/kiosk' || pathname.startsWith('/my') || isLoading || !user) {
    return <>{children}</>;
  }

  // Filter bottom nav tabs based on role
  const isStaffExec = user.role === 'staff_executive';
  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={22} strokeWidth={1.5} /> },
    { label: 'Attend', path: '/attendance', icon: <Clock size={22} strokeWidth={1.5} /> },
    { label: 'Staff', path: '/staff', icon: <Users size={22} strokeWidth={1.5} /> },
    { label: 'Leave', path: '/leave', icon: <ClipboardList size={22} strokeWidth={1.5} /> },
    ...(!isStaffExec ? [{ label: 'Salary', path: '/salary', icon: <Wallet size={22} strokeWidth={1.5} /> }] : []),
    { label: 'Approvals', path: '/approvals', icon: <CheckSquare size={22} strokeWidth={1.5} /> },
  ];

  const getBranchLabel = () => {
    if (userBranch === 'daily') return 'Nearbi Daily';
    if (userBranch === 'hypermarket') return 'Nearbi Hypermarket';
    return 'All Branches';
  };

  const getBranchAbbreviation = () => {
    if (userBranch === 'daily') return 'Daily';
    if (userBranch === 'hypermarket') return 'HM';
    return 'All';
  };

  return (
    <div className="app-frame">
      <div className="min-h-screen bg-[#F8F8F8] flex flex-col relative font-sans">
        {/* Toast Alert */}
        {activeToast && (
          <div className="fixed top-[70px] left-4 right-4 z-[99999] bg-white text-[#1A1A1A] p-4 rounded-[14px] border border-[#E8E8E8] border-l-[4px] border-l-[#1A1A1A] shadow-[0_4px_12px_rgba(0,0,0,0.10)] transition-all duration-300">
            <div className="flex items-start space-x-3">
              <Bell size={20} strokeWidth={1.5} className="text-[#1A1A1A] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-bold text-sm text-[#1A1A1A]">{activeToast.title}</h4>
                <p className="text-xs text-[#555555] mt-0.5">{activeToast.message}</p>
              </div>
              <button
                onClick={() => setActiveToast(null)}
                className="text-[#999999] hover:text-[#1A1A1A] text-sm font-bold flex items-center justify-center p-0.5"
              >
                <X size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              </button>
            </div>
          </div>
        )}

        {/* Top Bar */}
        <header className="bg-white text-[#1A1A1A] sticky top-0 z-[1000] px-5 py-3 flex items-center justify-between min-h-[56px] border-b border-[#E8E8E8] shadow-[0_1px_3px_rgba(0,0,0,0.06)] select-none pt-[calc(12px+env(safe-area-inset-top,0px))]">
          <div className="flex items-center space-x-2">
            <div className="font-[900] text-[22px] tracking-tight flex items-center letter-spacing-[-1px]">
              <span className="text-[#1A1A1A]">near</span>
              <span className="text-[#1A1A1A]">bi</span>
            </div>
            <div className="bg-[#1A1A1A] text-white text-[10px] px-[7px] py-[2px] rounded-[4px] font-bold uppercase tracking-wider ml-1.5">
              STAFF
            </div>
          </div>

          <div className="text-[#555555] font-semibold text-xs text-center truncate max-w-[150px]">
            {isMobile ? getBranchAbbreviation() : getBranchLabel()}
          </div>

          <div className="flex items-center space-x-3.5">
            <button
              onClick={() => router.push('/notifications')}
              className="relative p-1 focus:outline-none flex items-center justify-center text-[#1A1A1A] hover:text-[#333333] transition-colors"
            >
              <Bell size={20} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-[#C0392B] text-white text-[9px] font-bold">
                  {unreadCount > 99 ? '99+' : unreadCount.toString()}
                </span>
              )}
            </button>
            <button
              onClick={logout}
              className="bg-[#F2F2F2] text-[#555555] hover:text-[#1A1A1A] hover:bg-[#EBEBEB] px-3 py-1.5 text-xs rounded-[8px] font-semibold transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <LogOut size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              {!isMobile && <span>Sign out</span>}
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingTop: '12px',
            paddingLeft: '16px',
            paddingRight: '16px',
            paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 20px))',
            maxWidth: '480px',
            margin: '0 auto',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {children}
        </main>

        {/* Bottom Nav Bar */}
        <nav
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: '#FFFFFF',
            borderTop: '1px solid #E8E8E8',
            boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
            paddingBottom: 'env(safe-area-inset-bottom, 16px)',
            display: 'flex',
          }}
        >
          <div className="max-w-[480px] w-full mx-auto flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingTop: '10px',
                    paddingBottom: '10px',
                    minHeight: '60px',
                    cursor: 'pointer',
                    border: 'none',
                    background: 'transparent',
                    textDecoration: 'none',
                  }}
                  className={`select-none transition-all ${
                    isActive
                      ? 'text-[#1A1A1A] bg-[#F8F8F8] border-t-2 border-[#1A1A1A]'
                      : 'text-[#BBBBBB] hover:text-[#1A1A1A]'
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
    </div>
  );
}

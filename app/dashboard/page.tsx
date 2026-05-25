'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';
import Link from 'next/link';
import {
  LayoutDashboard,
  Clock,
  Users,
  ClipboardList,
  Wallet,
  CheckSquare,
  Settings,
  Fingerprint,
  Building2,
  AlertTriangle,
  UserX,
  AlertCircle,
  CircleCheck,
  CircleX,
  ChevronRight,
  Activity,
  Cake,
  PartyPopper
} from 'lucide-react';

interface StaffMember {
  id: string;
  name: string;
  branch_id: string;
  department: string;
  shift_id: string;
  active: boolean;
  date_of_birth?: string | null;
  shift: {
    start_time: string;
    end_time: string;
    hours: number;
  };
}

interface AttendanceRecord {
  id: string;
  staff_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: 'present' | 'late' | 'absent';
  color_code: 'green' | 'yellow' | 'orange' | 'red';
  minutes_late: number;
}

interface LeaveRequest {
  id: string;
  staff_id: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface AdjustmentRecord {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
}

export default function DashboardPage() {
  const { user, userBranch, canSeeAllBranches, canSeeSalaryBreakdown } = useAuth();
  const [activeTab, setActiveTab] = useState<'daily' | 'hypermarket'>('daily');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Enforce branch HR to only see their branch
  useEffect(() => {
    if (userBranch) {
      setActiveTab(userBranch as 'daily' | 'hypermarket');
    }
  }, [userBranch]);

  const fetchDashboardData = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Fetch Staff
      let staffQuery = supabase
        .from('staff')
        .select('*, shift:shifts(*)')
        .eq('active', true);

      if (userBranch) {
        staffQuery = staffQuery.eq('branch_id', userBranch);
      }
      const { data: staffData, error: staffErr } = await staffQuery;
      if (staffErr) throw staffErr;
      const verifiedStaff = (staffData || []) as unknown as StaffMember[];
      setStaffList(verifiedStaff);

      // 2. Fetch today's attendance
      let attendanceQuery = supabase.from('attendance').select('*').eq('date', todayStr);
      const { data: attData, error: attErr } = await attendanceQuery;
      if (attErr) throw attErr;
      setAttendanceList(attData || []);

      // 3. Fetch pending leaves count
      let leavesQuery = supabase
        .from('leave_requests')
        .select('id, staff!inner(branch_id)', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (userBranch) {
        leavesQuery = leavesQuery.eq('staff.branch_id', userBranch);
      }
      const { count: lCount, error: lErr } = await leavesQuery;
      if (lErr) throw lErr;
      setPendingLeavesCount(lCount || 0);

      // 4. Fetch pending approvals (OT + Early In)
      let approvalsQuery = supabase
        .from('attendance_adjustments')
        .select('id, staff!inner(branch_id)', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (userBranch) {
        approvalsQuery = approvalsQuery.eq('staff.branch_id', userBranch);
      }
      const { count: aCount, error: aErr } = await approvalsQuery;
      if (aErr) throw aErr;
      setPendingApprovalsCount(aCount || 0);

      // 5. Run automatic absent alerts check
      checkAndCreateAbsentAlerts(verifiedStaff, attData || []);
      // 6. Run automatic birthday check
      checkAndCreateBirthdayNotifications(verifiedStaff);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Could not load data. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntilBirthday = (dobString: string): number => {
    const dob = new Date(dobString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Set birthday to this year
    const birthdayThisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    
    if (birthdayThisYear.getTime() < today.getTime()) {
      // Birthday has passed this year, check next year
      const birthdayNextYear = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
      return Math.round((birthdayNextYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    return Math.round((birthdayThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const checkAndCreateBirthdayNotifications = async (staff: StaffMember[]) => {
    try {
      const now = new Date();
      const todayMonth = now.getMonth();
      const todayDate = now.getDate();
      const todayYear = now.getFullYear();

      for (const s of staff) {
        if (!s.date_of_birth) continue;

        const dob = new Date(s.date_of_birth);
        if (dob.getMonth() === todayMonth && dob.getDate() === todayDate) {
          // It's their birthday today!
          const todayStart = new Date(todayYear, todayMonth, todayDate).toISOString();
          const { data: existingNotify } = await supabase
            .from('notifications')
            .select('id')
            .eq('staff_id', s.id)
            .eq('type', 'absent_alert')
            .eq('title', 'Birthday Today')
            .gte('created_at', todayStart)
            .maybeSingle();

          if (!existingNotify) {
            await createNotification({
              type: 'absent_alert',
              title: 'Birthday Today',
              message: `Today is ${s.name}'s birthday! Wish them a very happy birthday!`,
              branchId: s.branch_id,
              staffId: s.id,
              targetRole: 'ops_manager',
            });
          }
        }
      }
    } catch (e) {
      console.error('Error checking birthday notifications:', e);
    }
  };

  const checkAndCreateAbsentAlerts = async (
    staff: StaffMember[],
    attendance: AttendanceRecord[]
  ) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const now = new Date();

      // Check each staff member
      for (const s of staff) {
        if (!s.shift?.start_time) continue;

        // Parse shift start time today
        const [sh, sm] = s.shift.start_time.split(':').map(Number);
        const shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm);
        const minutesDiff = (now.getTime() - shiftStart.getTime()) / (60 * 1000);

        // If shift started 60+ mins ago
        if (minutesDiff >= 60) {
          // Check if checked in
          const checkedIn = attendance.some((a) => a.staff_id === s.id && a.check_in_time);
          if (!checkedIn) {
            // Check if leave request already approved for today
            const { data: approvedLeave } = await supabase
              .from('leave_requests')
              .select('id')
              .eq('staff_id', s.id)
              .eq('date', todayStr)
              .eq('status', 'approved')
              .maybeSingle();

            if (!approvedLeave) {
              // Check if we already inserted absent_alert notification today
              const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
              const { data: existingAlert } = await supabase
                .from('notifications')
                .select('id')
                .eq('staff_id', s.id)
                .eq('type', 'absent_alert')
                .gte('created_at', todayStart)
                .maybeSingle();

              if (!existingAlert) {
                // Insert auto absent notification
                await createNotification({
                  type: 'absent_alert',
                  title: 'Staff Absent Alert',
                  message: `${s.name} is absent today (no check-in after 60 mins of shift start).`,
                  branchId: s.branch_id,
                  staffId: s.id,
                  relatedId: todayStr,
                  targetRole: 'staff_executive',
                });

                try {
                  await supabase.from('wall_events').insert({
                    event_type: 'absent_alert',
                    staff_id: s.id,
                    staff_name: s.name,
                    branch_id: s.branch_id,
                    description: `${s.name} was marked absent today (no check-in after 60 mins of shift start).`
                  });
                } catch (e) {
                  console.error('Silent insert wall event failed:', e);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error in checkAndCreateAbsentAlerts:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchDashboardData();

    const interval = setInterval(() => {
      fetchDashboardData();
    }, 60000);

    // Real-time Postgres changes for attendance
    const attendanceChannel = supabase
      .channel('dashboard-attendance')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      attendanceChannel.unsubscribe();
    };
  }, [userBranch]);

  // Format current date: "Friday, 20 May 2026"
  const getFormattedDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Branch statistics computations
  const getBranchStats = (branchId: 'daily' | 'hypermarket') => {
    const branchStaff = staffList.filter((s) => s.branch_id === branchId);
    const branchStaffIds = new Set(branchStaff.map((s) => s.id));

    let present = 0;
    let late = 0;
    let absent = 0;
    let checkedOut = 0;

    // Filter attendance records belonging to active staff in this branch today
    const branchAttendance = attendanceList.filter((a) => branchStaffIds.has(a.staff_id));

    branchStaff.forEach((s) => {
      const att = branchAttendance.find((a) => a.staff_id === s.id);
      if (att) {
        if (att.check_in_time) {
          present++;
          if (att.status === 'late') {
            late++;
          }
          if (att.check_out_time) {
            checkedOut++;
          }
        } else {
          absent++;
        }
      } else {
        absent++;
      }
    });

    return {
      present,
      late,
      absent,
      checkedOut,
      total: branchStaff.length,
    };
  };

  // Current tab stats
  const activeStats = getBranchStats(activeTab);

  // Compute Alerts list for currently viewed branch
  const activeBranchStaff = staffList.filter((s) => s.branch_id === activeTab);
  const activeBranchStaffIds = new Set(activeBranchStaff.map((s) => s.id));

  const lateArrivalsAlerts = attendanceList
    .filter((a) => activeBranchStaffIds.has(a.staff_id) && a.status === 'late')
    .map((a) => {
      const staffMember = activeBranchStaff.find((s) => s.id === a.staff_id);
      return {
        name: staffMember?.name || 'Unknown',
        minutes: a.minutes_late,
        color: a.color_code,
      };
    });

  const absentStaffAlerts = activeBranchStaff.filter((s) => {
    const att = attendanceList.find((a) => a.staff_id === s.id);
    return !att || !att.check_in_time;
  });

  if (errorMsg) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-6 text-center max-w-sm mx-auto my-8 flex flex-col items-center justify-center">
        <AlertCircle size={48} strokeWidth={1.5} style={{ color: '#F87171' }} className="mb-3" />
        <h3 className="text-base font-bold text-white mb-1">
          {errorMsg}
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-5">
          Please verify your connection and try again.
        </p>
        <button
          onClick={() => {
            setLoading(true);
            setErrorMsg('');
            fetchDashboardData();
          }}
          className="bg-white text-[#1E2028] font-bold px-6 py-2 rounded-[10px] text-sm active:scale-95 transition-transform"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div>
        <p className="text-[var(--text-muted)] text-[12px] font-semibold mb-0.5">
          {getFormattedDate()}
        </p>
        <h1 className="text-white text-2xl font-bold">{getGreeting()}</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-[120px] w-full" />
          <div className="skeleton h-[80px] w-full" />
          <div className="skeleton h-[180px] w-full" />
        </div>
      ) : (
        <>
          {/* Branch tabs wrapper */}
          {canSeeAllBranches && (
            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setActiveTab('daily')}
                className={`flex-1 text-center py-2.5 text-sm font-bold transition-all border-b-2 ${
                  activeTab === 'daily'
                    ? 'border-white text-white'
                    : 'border-transparent text-[var(--text-secondary)]'
                }`}
              >
                Nearbi Daily
              </button>
              <button
                onClick={() => setActiveTab('hypermarket')}
                className={`flex-1 text-center py-2.5 text-sm font-bold transition-all border-b-2 ${
                  activeTab === 'hypermarket'
                    ? 'border-white text-white'
                    : 'border-transparent text-[var(--text-secondary)]'
                }`}
              >
                Nearbi Hypermarket
              </button>
            </div>
          )}

          {/* Branch summary card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] border-l-2 border-l-white/20 rounded-[14px] p-5 shadow-sm">
            <div className="flex items-center space-x-2 mb-3.5">
              <Building2 size={16} strokeWidth={1.5} style={{ color: 'white' }} />
              <h3 className="text-white font-bold text-base capitalize">
                {activeTab === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket'}
              </h3>
            </div>
            
            <div className="grid grid-cols-4 gap-2.5 text-center mb-4">
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[10px] p-2.5 flex flex-col justify-center">
                <div className="text-[#4ADE80] text-xl font-extrabold">{activeStats.present}</div>
                <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-0.5">Present</div>
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[10px] p-2.5 flex flex-col justify-center">
                <div className="text-[#FBBF24] text-xl font-extrabold">{activeStats.late}</div>
                <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-0.5">Late</div>
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[10px] p-2.5 flex flex-col justify-center">
                <div className="text-[#F87171] text-xl font-extrabold">{activeStats.absent}</div>
                <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-0.5">Absent</div>
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[10px] p-2.5 flex flex-col justify-center">
                <div className="text-[#60A5FA] text-xl font-extrabold">{activeStats.checkedOut}</div>
                <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-0.5">Out</div>
              </div>
            </div>

            <p className="text-[var(--text-muted)] text-xs font-bold">
              Total: {activeStats.total} staff
            </p>
          </div>

          {/* Alerts section */}
          {(absentStaffAlerts.length > 0 || lateArrivalsAlerts.length > 0 || pendingLeavesCount > 0 || pendingApprovalsCount > 0) && (
            <div className="space-y-3">
              <h4 className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest">
                Alerts
              </h4>

              {/* Absent staff alert */}
              {absentStaffAlerts.length > 0 && (
                <div className="bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)] rounded-[14px] p-4 text-left">
                  <div className="font-bold text-[#F87171] text-xs flex items-center mb-1">
                    <UserX size={16} strokeWidth={1.5} style={{ color: '#F87171' }} className="mr-1.5 flex-shrink-0" />
                    {absentStaffAlerts.length} staff absent today
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] opacity-90 pl-5 space-y-0.5 leading-relaxed font-semibold whitespace-pre-line">
                    {absentStaffAlerts.map((s) => s.name).join('\n')}
                  </div>
                </div>
              )}

              {/* Late arrivals alert */}
              {lateArrivalsAlerts.length > 0 && (
                <div className="bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.2)] rounded-[14px] p-4 text-left">
                  <div className="font-bold text-[#FBBF24] text-xs flex items-center mb-2">
                    <AlertTriangle size={16} strokeWidth={1.5} style={{ color: '#FBBF24' }} className="mr-1.5 flex-shrink-0" />
                    {lateArrivalsAlerts.length} staff arrived late
                  </div>
                  <div className="pl-5 space-y-1">
                    {lateArrivalsAlerts.map((s, i) => (
                      <div key={i} className="text-[11px] text-[var(--text-secondary)] font-semibold flex items-center">
                        {s.name} — {s.minutes} mins late
                        <span
                          className="inline-block w-2 h-2 rounded-full ml-1.5"
                          style={{
                            backgroundColor:
                              s.color === 'yellow'
                                ? '#FBBF24'
                                : s.color === 'orange'
                                ? '#FB923C'
                                : '#F87171',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending leaves alert */}
              {pendingLeavesCount > 0 && (
                <Link
                  href="/leave"
                  className="block bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 text-left active:bg-[var(--bg-elevated)] transition-colors"
                >
                  <div className="font-bold text-white text-xs flex items-center justify-between">
                    <span className="flex items-center">
                      <ClipboardList size={16} strokeWidth={1.5} style={{ color: 'white' }} className="mr-1.5 flex-shrink-0" />
                      {pendingLeavesCount} leave requests pending approval
                    </span>
                    <span className="text-[10px] uppercase font-bold text-white/80 tracking-wider flex items-center">
                      Tap to review <ChevronRight size={14} strokeWidth={1.5} className="ml-1" />
                    </span>
                  </div>
                </Link>
              )}

              {/* Pending approvals alert */}
              {pendingApprovalsCount > 0 && (
                <Link
                  href="/approvals"
                  className="block bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 text-left active:bg-[var(--bg-elevated)] transition-colors"
                >
                  <div className="font-bold text-white text-xs flex items-center justify-between">
                    <span className="flex items-center">
                      <CheckSquare size={16} strokeWidth={1.5} style={{ color: 'white' }} className="mr-1.5 flex-shrink-0" />
                      {pendingApprovalsCount} OT/early-in approvals pending
                    </span>
                    <span className="text-[10px] uppercase font-bold text-white/80 tracking-wider flex items-center">
                      Review <ChevronRight size={14} strokeWidth={1.5} className="ml-1" />
                    </span>
                  </div>
                </Link>
              )}
            </div>
          )}

          {/* Birthday Tracker Card (Hidden from Admin/Owner) */}
          {user?.role !== 'admin' && (() => {
            const activeBranchStaff = staffList.filter((s) => s.branch_id === activeTab);
            const activeBranchBirthdays = activeBranchStaff
              .filter((s) => s.date_of_birth)
              .map((s) => ({
                ...s,
                daysUntil: getDaysUntilBirthday(s.date_of_birth!),
              }))
              .filter((s) => s.daysUntil <= 7)
              .sort((a, b) => a.daysUntil - b.daysUntil);

            if (activeBranchBirthdays.length === 0) return null;

            return (
              <div className="space-y-3">
                <h4 className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest">
                  <span style={{display:'flex',
                    alignItems:'center', gap:'6px'}}>
                    <Cake size={16} strokeWidth={1.5} />
                    Upcoming Birthdays
                  </span>
                </h4>
                <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 space-y-3.5 shadow-sm">
                  {activeBranchBirthdays.map((s) => {
                    const dob = new Date(s.date_of_birth!);
                    const formattedDob = dob.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                    return (
                      <div key={s.id} className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center space-x-2.5">
                          <PartyPopper size={14} strokeWidth={1.5} />
                          <div>
                            <p className="font-bold text-white leading-none">{s.name}</p>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-none">{s.department}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                            s.daysUntil === 0 
                              ? 'bg-[rgba(74,222,128,0.12)] text-[#4ADE80] border border-[rgba(74,222,128,0.2)]'
                              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-strong)]'
                          }`}>
                            {s.daysUntil === 0 ? (
                              <span className="flex items-center gap-1">
                                Today <PartyPopper size={14} strokeWidth={1.5} />
                              </span>
                            ) : (
                              `In ${s.daysUntil} days (${formattedDob})`
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Quick Actions */}
          <div>
            <h4 className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest mb-3">
              Quick Actions
            </h4>
            
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/attendance"
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 min-height-[72px] flex flex-col items-center justify-center text-center hover:border-white/30 active:border-white/30 transition-all"
              >
                <Clock size={24} strokeWidth={1.5} style={{ color: '#FBBF24' }} className="mb-1.5" />
                <span className="text-xs font-bold text-[var(--text-primary)]">Attendance</span>
              </Link>

              <Link
                href="/staff"
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 min-height-[72px] flex flex-col items-center justify-center text-center hover:border-white/30 active:border-white/30 transition-all"
              >
                <Users size={24} strokeWidth={1.5} style={{ color: '#60A5FA' }} className="mb-1.5" />
                <span className="text-xs font-bold text-[var(--text-primary)]">Staff</span>
              </Link>

              <Link
                href="/leave"
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 min-height-[72px] flex flex-col items-center justify-center text-center hover:border-white/30 active:border-white/30 transition-all"
              >
                <ClipboardList size={24} strokeWidth={1.5} style={{ color: '#4ADE80' }} className="mb-1.5" />
                <span className="text-xs font-bold text-[var(--text-primary)]">Leave Requests</span>
              </Link>

              <Link
                href="/approvals"
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 min-height-[72px] flex flex-col items-center justify-center text-center hover:border-white/30 active:border-white/30 transition-all"
              >
                <CheckSquare size={24} strokeWidth={1.5} style={{ color: '#FB923C' }} className="mb-1.5" />
                <span className="text-xs font-bold text-[var(--text-primary)]">Approvals</span>
              </Link>

              {/* Owner/Ops only Settings + Salary links */}
              {canSeeSalaryBreakdown && (
                <>
                  <Link
                    href="/salary"
                    className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 min-height-[72px] flex flex-col items-center justify-center text-center hover:border-white/30 active:border-white/30 transition-all"
                  >
                    <Wallet size={24} strokeWidth={1.5} style={{ color: '#4ADE80' }} className="mb-1.5" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">Salary</span>
                  </Link>

                  <Link
                    href="/settings"
                    className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 min-height-[72px] flex flex-col items-center justify-center text-center hover:border-white/30 active:border-white/30 transition-all"
                  >
                    <Settings size={24} strokeWidth={1.5} style={{ color: '#9CA3AF' }} className="mb-1.5" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">Settings</span>
                  </Link>
                </>
              )}

              {/* The Wall Quick Action (Hidden from Admin) */}
              {user?.role !== 'admin' && (
                <Link
                  href="/wall"
                  className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 min-height-[72px] flex flex-col items-center justify-center text-center hover:border-white/30 active:border-white/30 transition-all col-span-2"
                >
                  <Activity size={24} strokeWidth={1.5} style={{ color: '#F87171' }} className="mb-1.5" />
                  <span className="text-xs font-bold text-[var(--text-primary)]">The Wall</span>
                </Link>
              )}

              {/* Open kiosk */}
              <Link
                href="/kiosk"
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 min-height-[72px] flex flex-col items-center justify-center text-center hover:border-white/30 active:border-white/30 transition-all col-span-2"
              >
                <Fingerprint size={24} strokeWidth={1.5} style={{ color: '#60A5FA' }} className="mb-1.5" />
                <span className="text-xs font-bold text-[var(--text-primary)]">Open Attendance Kiosk</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

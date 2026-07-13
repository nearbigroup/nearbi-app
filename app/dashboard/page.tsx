'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';
import { createAuditLog } from '@/lib/audit';
import { calculateMinutesWorked } from '@/lib/salary';
import Link from 'next/link';
import {
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
  ChevronRight,
  Activity,
  Cake,
  PartyPopper,
  X,
  Megaphone,
  UserMinus,
  FileText
} from 'lucide-react';

const getMinutes = (timeStr: string) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const autoCloseCheckouts = async (effectiveBranch: string | null) => {
  if (!effectiveBranch) return;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const nowH = today.getHours();
  const nowM = today.getMinutes();
  const nowMins = nowH * 60 + nowM;

  const { data: openCheckIns } = await supabase
    .from('attendance')
    .select(`
      id, check_in_time, staff_id, date,
      staff!inner(
        id, name, branch_id, pay_type, monthly_salary,
        shifts(start_time, end_time, hours)
      )
    `)
    .in('date', [yesterdayStr, todayStr])
    .not('check_in_time', 'is', null)
    .is('check_out_time', null)
    .eq('staff.branch_id', effectiveBranch);

  for (const record of openCheckIns || []) {
    const staffObj: any = Array.isArray(record.staff) ? record.staff[0] : record.staff;
    if (!staffObj) continue;

    const isHourly = staffObj.pay_type === 'hourly';

    if (isHourly) {
      const recordDate = record.date;
      const [yr, mo, dy] = recordDate.split('-').map(Number);
      const [inH, inM] = record.check_in_time.split(':').map(Number);
      const checkInDateObj = new Date(yr, mo - 1, dy, inH, inM, 0);
      const hoursSinceCheckIn = (today.getTime() - checkInDateObj.getTime()) / (1000 * 60 * 60);

      if (hoursSinceCheckIn > 14) {
        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('staff_id', record.staff_id)
          .eq('type', 'absent_alert')
          .eq('title', 'Hourly Checkout Missing')
          .like('message', `%${recordDate}%`)
          .maybeSingle();

        if (!existingNotif) {
          await supabase
            .from('notifications')
            .insert({
              type: 'absent_alert',
              title: 'Hourly Checkout Missing',
              message: `${staffObj.name} (Hourly) checked in on ${recordDate} at ${record.check_in_time} but has no checkout. Please review.`,
              branch_id: effectiveBranch,
              staff_id: record.staff_id,
              target_role: 'staff_executive',
              is_read: false
            });
        }
      }
      continue;
    }

    const shift = Array.isArray(staffObj.shifts)
      ? staffObj.shifts[0]
      : (staffObj.shifts || staffObj.shift || {});
    if (!shift) continue;

    const shiftEnd = shift.end_time || '18:00';
    const shiftStart = shift.start_time || '09:00';
    const shiftEndMins = getMinutes(shiftEnd);
    const shiftStartMins = getMinutes(shiftStart);

    let adjustedEnd = shiftEndMins;
    if (shiftEndMins < shiftStartMins) {
      adjustedEnd = shiftEndMins + 1440;
    }

    let adjustedNow = nowMins;
    if (record.date === yesterdayStr) {
      adjustedNow = nowMins + 1440;
    }

    if (adjustedNow > adjustedEnd + 60) {
      const hoursWorked = calculateMinutesWorked(record.check_in_time, shiftEnd) / 60;

      await supabase
        .from('attendance')
        .update({
          check_out_time: shiftEnd,
          actual_hours_worked: Math.round(hoursWorked * 100) / 100,
          ot_minutes: 0,
          early_leave_minutes: 0,
          auto_closed: true
        })
        .eq('id', record.id);

      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('staff_id', record.staff_id)
        .eq('type', 'absent_alert')
        .eq('title', 'Checkout Auto-Completed')
        .like('message', `%${record.date}%`)
        .maybeSingle();

      if (!existingNotif) {
        await supabase
          .from('notifications')
          .insert({
            type: 'absent_alert',
            title: 'Checkout Auto-Completed',
            message: `${staffObj.name} forgot to check out on ${record.date}. Auto-closed at ${shiftEnd}. Please review if actual checkout was different.`,
            branch_id: effectiveBranch,
            staff_id: record.staff_id,
            target_role: 'staff_executive',
            is_read: false
          });
      }
    }
  }
};

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
  pay_type?: string;
  standard_hours?: number;
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

export default function DashboardPage() {
  const { user, userBranch, canSeeAllBranches, canSeeSalaryBreakdown } = useAuth();
  const [activeTab, setActiveTab] = useState<'daily' | 'hypermarket'>('daily');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [latestAnn, setLatestAnn] = useState<any>(null);
  const [newCandidatesCount, setNewCandidatesCount] = useState(0);
  const [pendingVerificationCount, setPendingVerificationCount] = useState(0);

  // Month-end checklist counts
  const [checklistIssues, setChecklistIssues] = useState(0);
  const [checklistOT, setChecklistOT] = useState(0);
  const [checklistFines, setChecklistFines] = useState(0);
  const [checklistUnconfirmed, setChecklistUnconfirmed] = useState(0);
  const [checklistUnpaid, setChecklistUnpaid] = useState(0);

  // Announcement modal state
  const [isAnnModalOpen, setIsAnnModalOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annTarget, setAnnTarget] = useState<'all' | 'daily' | 'hypermarket'>('all');
  const [annSubmitting, setAnnSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Enforce branch HR to only see their branch
  useEffect(() => {
    if (userBranch) {
      setActiveTab(userBranch as 'daily' | 'hypermarket');
    }
  }, [userBranch]);

  const fetchDashboardData = async () => {
    try {
      // Auto-close checkouts for ops_manager
      if (user?.role === 'ops_manager') {
        try {
          await autoCloseCheckouts(userBranch || 'daily');
          if (!userBranch) {
            await autoCloseCheckouts('hypermarket');
          }
        } catch (e) {
          console.error('Auto-close checkouts error:', e);
        }
      }

      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Fetch Staff
      let staffQuery = supabase
        .from('staff')
        .select('*, shift:shifts(*)')
        .eq('active', true)
        .eq('is_resigned', false);

      if (user?.role === 'nearbi_homes_supervisor') {
        staffQuery = staffQuery.eq('branch_id', 'hypermarket').eq('department', 'Nearbi Homes');
      } else if (userBranch) {
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
        .select('id, staff!inner(branch_id, department)', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (user?.role === 'nearbi_homes_supervisor') {
        leavesQuery = leavesQuery.eq('staff.branch_id', 'hypermarket').eq('staff.department', 'Nearbi Homes');
      } else if (userBranch) {
        leavesQuery = leavesQuery.eq('staff.branch_id', userBranch);
      }
      const { count: lCount, error: lErr } = await leavesQuery;
      if (lErr) throw lErr;
      setPendingLeavesCount(lCount || 0);

      // 4. Fetch pending approvals (OT + Early In)
      let approvalsQuery = supabase
        .from('attendance_adjustments')
        .select('id, staff!inner(branch_id, department)', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (user?.role === 'nearbi_homes_supervisor') {
        approvalsQuery = approvalsQuery.eq('staff.branch_id', 'hypermarket').eq('staff.department', 'Nearbi Homes');
      } else if (userBranch) {
        approvalsQuery = approvalsQuery.eq('staff.branch_id', userBranch);
      }
      const { count: aCount, error: aErr } = await approvalsQuery;
      if (aErr) throw aErr;
      setPendingApprovalsCount(aCount || 0);

      // 5. Month-End Checklist calculations
      const now = new Date();
      const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      const startDate = `${currentMonthStr}-01`;
      const yr = now.getFullYear();
      const mo = now.getMonth() + 1;
      const lastDayNum = new Date(yr, mo, 0).getDate();
      const endDate = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

      // A. Attendance issues this month
      let monthAttQuery = supabase
        .from('attendance')
        .select('check_in_time, check_out_time, status, minutes_late, staff_id')
        .gte('date', startDate)
        .lte('date', endDate);
      const { data: monthAttData } = await monthAttQuery;

      const activeStaffIds = new Set(verifiedStaff.map((s) => s.id));
      const branchMonthAtt = (monthAttData || []).filter((r) => activeStaffIds.has(r.staff_id));
      const issuesCount = branchMonthAtt.filter(
        (r) => (r.check_in_time && !r.check_out_time) || r.status === 'late' || r.minutes_late > 0
      ).length;
      setChecklistIssues(issuesCount);

      // B. Pending OT adjustments count
      let otQuery = supabase
        .from('attendance_adjustments')
        .select('id, staff!inner(branch_id, department, active)', { count: 'exact' })
        .eq('status', 'pending')
        .eq('type', 'ot')
        .eq('staff.active', true);
      if (user?.role === 'nearbi_homes_supervisor') {
        otQuery = otQuery.eq('staff.branch_id', 'hypermarket').eq('staff.department', 'Nearbi Homes');
      } else if (userBranch) {
        otQuery = otQuery.eq('staff.branch_id', userBranch);
      }
      const { count: otCount } = await otQuery;
      setChecklistOT(otCount || 0);

      // C. Confirm fines count
      let finesQuery = supabase
        .from('late_fines')
        .select('id, staff!inner(branch_id, department, active)', { count: 'exact' })
        .eq('waived', false)
        .eq('confirmed', false)
        .eq('staff.active', true)
        .eq('month', currentMonthStr);
      if (user?.role === 'nearbi_homes_supervisor') {
        finesQuery = finesQuery.eq('staff.branch_id', 'hypermarket').eq('staff.department', 'Nearbi Homes');
      } else if (userBranch) {
        finesQuery = finesQuery.eq('staff.branch_id', userBranch);
      }
      const { count: fineCount } = await finesQuery;
      setChecklistFines(fineCount || 0);

      // D. Bulk confirm salaries count (active staff not confirmed this month)
      const { data: confirmationsData } = await supabase
        .from('salary_confirmations')
        .select('staff_id')
        .eq('month', currentMonthStr);
      const confirmedStaffIds = new Set((confirmationsData || []).map((c) => c.staff_id));
      const unconfirmedCount = verifiedStaff.filter((s) => !confirmedStaffIds.has(s.id)).length;
      setChecklistUnconfirmed(unconfirmedCount);

      // E. Mark salaries as paid count (confirmed salaries that are unpaid)
      const { data: paymentsData } = await supabase
        .from('salary_payments')
        .select('staff_id')
        .eq('month', currentMonthStr);
      const paidStaffIds = new Set((paymentsData || []).map((p) => p.staff_id));
      const unpaidCount = (confirmationsData || [])
        .filter((c) => activeStaffIds.has(c.staff_id))
        .filter((c) => !paidStaffIds.has(c.staff_id)).length;
      setChecklistUnpaid(unpaidCount);

      // F. Fetch latest announcement stats
      const { data: latestAnnData } = await supabase
        .from('staff_announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestAnnData) {
        const { count: readCount } = await supabase
          .from('announcement_reads')
          .select('*', { count: 'exact', head: true })
          .eq('announcement_id', latestAnnData.id);

        let targetCount = verifiedStaff.length;
        if (latestAnnData.target !== 'all') {
          targetCount = verifiedStaff.filter(s => s.branch_id === latestAnnData.target).length;
        }

        setLatestAnn({
          ...latestAnnData,
          readCount: readCount || 0,
          targetCount: targetCount || 1
        });
      } else {
        setLatestAnn(null);
      }

      // Fetch new candidates today (ops_manager only)
      if (user?.role === 'ops_manager') {
        const now = new Date();
        const yr = now.getFullYear();
        const mo = now.getMonth() + 1;
        const dy = now.getDate();
        const todayLocalStr = `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;

        const { count: cCount } = await supabase
          .from('job_candidates')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'new')
          .eq('walk_in_date', todayLocalStr);

        setNewCandidatesCount(cCount || 0);
      }

      // Fetch pending document verification count
      try {
        let profilesQuery = supabase
          .from('staff_profiles')
          .select('*, staff!inner(branch_id, active)')
          .eq('staff.active', true);

        if (userBranch) {
          profilesQuery = profilesQuery.eq('staff.branch_id', userBranch);
        }

        const { data: profs } = await profilesQuery;
        let pendingVerifs = 0;
        if (profs) {
          profs.forEach((p: any) => {
            if (p.aadhaar_photo_url && p.aadhaar_verification_status === 'pending') pendingVerifs++;
            if (p.pan_photo_url && p.pan_verification_status === 'pending') pendingVerifs++;
            if (p.bank_proof_url && p.bank_verification_status === 'pending') pendingVerifs++;
            if (p.passport_photo_url && p.passport_verification_status === 'pending') pendingVerifs++;
            if (p.driving_licence_photo_url && p.driving_licence_verification_status === 'pending') pendingVerifs++;
          });
        }

        let docsQuery = supabase
          .from('staff_documents')
          .select('id, staff!inner(branch_id, active)')
          .eq('verification_status', 'pending')
          .eq('staff.active', true);

        if (userBranch) {
          docsQuery = docsQuery.eq('staff.branch_id', userBranch);
        }

        const { count: docsCount } = await docsQuery;
        pendingVerifs += (docsCount || 0);

        setPendingVerificationCount(pendingVerifs);
      } catch (verifErr) {
        console.error('Error fetching verification stats:', verifErr);
      }

      // 6. Run automatic absent alerts check
      checkAndCreateAbsentAlerts(verifiedStaff, attData || []);
      // 7. Run automatic birthday check
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
            .eq('type', 'birthday')
            .eq('title', 'Birthday Today')
            .gte('created_at', todayStart)
            .maybeSingle();

          if (!existingNotify) {
            await createNotification({
              type: 'birthday',
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
        if (s.pay_type === 'hourly') continue;
        if (!s.shift?.start_time) continue;

        const nowMins = now.getHours() * 60 + now.getMinutes();
        const shiftStartMins = getMinutes(s.shift?.start_time || '09:00');

        if (nowMins < shiftStartMins + 30) {
          // Too early — skip absent check
          continue;
        }
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
                  message: `${s.name} is absent today (no check-in after 30 mins of shift start).`,
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
                    description: `${s.name} was marked absent today (no check-in after 30 mins of shift start).`
                  });
                } catch (e) {
                  console.error('Silent insert wall event failed:', e);
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
      const isHourly = s.pay_type === 'hourly';
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
          if (!isHourly) {
            const now = new Date();
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const shiftStartMins = getMinutes(s.shift?.start_time || '09:00');
            if (nowMins >= shiftStartMins + 30) {
              absent++;
            }
          }
        }
      } else {
        if (!isHourly) {
          const now = new Date();
          const nowMins = now.getHours() * 60 + now.getMinutes();
          const shiftStartMins = getMinutes(s.shift?.start_time || '09:00');
          if (nowMins >= shiftStartMins + 30) {
            absent++;
          }
        }
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
    const isHourly = s.pay_type === 'hourly';
    if (isHourly) return false;

    const att = attendanceList.find((a) => a.staff_id === s.id);
    if (att && att.check_in_time) return false;

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const shiftStartMins = getMinutes(s.shift?.start_time || '09:00');

    return nowMins >= shiftStartMins + 30;
  });

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !annTitle.trim() || !annMessage.trim()) return;

    setAnnSubmitting(true);
    try {
      const { data: newAnn, error } = await supabase
        .from('staff_announcements')
        .insert({
          title: annTitle.trim(),
          message: annMessage.trim(),
          target: annTarget,
          created_by: user.name || user.email || 'Operations Manager'
        })
        .select()
        .single();

      if (error) throw error;

      await createAuditLog({
        action: 'create',
        table_name: 'staff_announcements',
        record_id: newAnn.id,
        new_value: { title: annTitle.trim(), message: annMessage.trim(), target: annTarget },
        performed_by: user.email,
        performed_by_role: user.role,
        reason: `Created staff announcement: "${annTitle.trim()}" targeting ${annTarget}`
      });

      setToastMsg('Announcement sent successfully ✓');
      setTimeout(() => setToastMsg(''), 3000);

      setAnnTitle('');
      setAnnMessage('');
      setAnnTarget('all');
      setIsAnnModalOpen(false);
    } catch (err) {
      console.error('Error creating announcement:', err);
      alert('Failed to send announcement. Please try again.');
    } finally {
      setAnnSubmitting(false);
    }
  };

  if (errorMsg) {
    return (
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 text-center max-w-sm mx-auto my-8 flex flex-col items-center justify-center shadow-sm">
        <AlertCircle size={48} strokeWidth={1.5} style={{ color: '#C0392B' }} className="mb-3" />
        <h3 className="text-base font-bold text-[#1A1A1A] mb-1">
          {errorMsg}
        </h3>
        <p className="text-xs text-[#999999] mb-5">
          Please verify your connection and try again.
        </p>
        <button
          onClick={() => {
            setLoading(true);
            setErrorMsg('');
            fetchDashboardData();
          }}
          className="bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold px-6 py-2.5 rounded-[10px] text-xs active:scale-95 transition-all shadow"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-[#999999] text-xs font-semibold mb-0.5">
            {getFormattedDate()}
          </p>
          <h1 className="text-[#1A1A1A] text-2xl font-bold">{getGreeting()} 👋</h1>
        </div>
        {(user?.role === 'admin' || user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
          <Link
            href="/announcements"
            className="bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold px-4 py-2 rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer text-center flex items-center justify-center"
          >
            Announcements Center
          </Link>
        )}
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
            <div className="flex bg-[#F2F2F2] rounded-full p-1 w-full">
              <button
                onClick={() => setActiveTab('daily')}
                className={`flex-1 text-center py-2 text-xs font-bold rounded-full transition-all ${
                  activeTab === 'daily'
                    ? 'bg-[#1A1A1A] text-white shadow-sm'
                    : 'text-[#555555] hover:text-[#1A1A1A]'
                }`}
              >
                Nearbi Daily
              </button>
              <button
                onClick={() => setActiveTab('hypermarket')}
                className={`flex-1 text-center py-2 text-xs font-bold rounded-full transition-all ${
                  activeTab === 'hypermarket'
                    ? 'bg-[#1A1A1A] text-white shadow-sm'
                    : 'text-[#555555] hover:text-[#1A1A1A]'
                }`}
              >
                Nearbi Hypermarket
              </button>
            </div>
          )}

          {/* Branch summary card (BLACK FEATURED CARD STYLE) */}
          <div className="featured-card bg-[#1A1A1A] rounded-[20px] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.15)] text-white">
            <div className="flex items-center space-x-2 mb-4 relative z-10">
              <Building2 size={18} strokeWidth={1.5} className="text-white" />
              <h3 className="text-white font-bold text-[15px] uppercase tracking-wider">
                {activeTab === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket'}
              </h3>
            </div>
            
            <div className="grid grid-cols-4 gap-2.5 text-center mb-4 relative z-10">
              <div className="bg-white/10 border border-white/5 rounded-[12px] p-2.5 flex flex-col justify-center">
                <div className="text-[#4ADE80] text-xl font-extrabold">{activeStats.present}</div>
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mt-0.5">Present</div>
              </div>
              <div className="bg-white/10 border border-white/5 rounded-[12px] p-2.5 flex flex-col justify-center">
                <div className="text-[#FBBF24] text-xl font-extrabold">{activeStats.late}</div>
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mt-0.5">Late</div>
              </div>
              <div className="bg-white/10 border border-white/5 rounded-[12px] p-2.5 flex flex-col justify-center">
                <div className="text-[#F87171] text-xl font-extrabold">{activeStats.absent}</div>
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mt-0.5">Absent</div>
              </div>
              <div className="bg-white/10 border border-white/5 rounded-[12px] p-2.5 flex flex-col justify-center">
                <div className="text-[#60A5FA] text-xl font-extrabold">{activeStats.checkedOut}</div>
                <div className="text-[10px] text-white/60 font-bold uppercase tracking-wider mt-0.5">Out</div>
              </div>
            </div>

            <p className="text-white/60 text-xs font-semibold relative z-10">
              Total: <span className="text-white font-bold">{activeStats.total}</span> active staff
            </p>
          </div>

          {/* Month-End Checklist */}
          {new Date().getDate() >= 25 && (user?.role === 'admin' || user?.role === 'ops_manager') && (
            <div className="space-y-3">
              <h4 className="text-[#999999] text-[11px] font-black uppercase tracking-wider">
                Month-End Checklist
              </h4>
              <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 space-y-3 shadow-sm">
                
                {/* 1. Review Attendance Issues */}
                <Link
                  href="/attendance"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F8F8F8] transition-colors"
                >
                  <div className="flex items-center space-x-2.5">
                    {checklistIssues === 0 ? (
                      <CircleCheck size={18} className="text-[#2D7A3A]" />
                    ) : (
                      <AlertTriangle size={18} className="text-[#B8860B]" />
                    )}
                    <span className="text-xs font-bold text-[#1A1A1A]">Review attendance issues</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      checklistIssues === 0 ? 'bg-[#EDF7EF] text-[#2D7A3A]' : 'bg-[#FDF6E2] text-[#B8860B]'
                    }`}>
                      {checklistIssues} issues
                    </span>
                    <ChevronRight size={14} className="text-[#999999]" />
                  </div>
                </Link>

                {/* 2. Approve Pending OT */}
                <Link
                  href="/approvals"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F8F8F8] transition-colors"
                >
                  <div className="flex items-center space-x-2.5">
                    {checklistOT === 0 ? (
                      <CircleCheck size={18} className="text-[#2D7A3A]" />
                    ) : (
                      <AlertTriangle size={18} className="text-[#B8860B]" />
                    )}
                    <span className="text-xs font-bold text-[#1A1A1A]">Approve pending OT</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      checklistOT === 0 ? 'bg-[#EDF7EF] text-[#2D7A3A]' : 'bg-[#FDF6E2] text-[#B8860B]'
                    }`}>
                      {checklistOT} pending
                    </span>
                    <ChevronRight size={14} className="text-[#999999]" />
                  </div>
                </Link>

                {/* 3. Confirm Fines */}
                <Link
                  href="/approvals"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F8F8F8] transition-colors"
                >
                  <div className="flex items-center space-x-2.5">
                    {checklistFines === 0 ? (
                      <CircleCheck size={18} className="text-[#2D7A3A]" />
                    ) : (
                      <AlertTriangle size={18} className="text-[#B8860B]" />
                    )}
                    <span className="text-xs font-bold text-[#1A1A1A]">Confirm late fines</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      checklistFines === 0 ? 'bg-[#EDF7EF] text-[#2D7A3A]' : 'bg-[#FDF6E2] text-[#B8860B]'
                    }`}>
                      {checklistFines} pending
                    </span>
                    <ChevronRight size={14} className="text-[#999999]" />
                  </div>
                </Link>

                {/* 4. Process Leave Deductions */}
                <Link
                  href="/leave"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F8F8F8] transition-colors"
                >
                  <div className="flex items-center space-x-2.5">
                    {pendingLeavesCount === 0 ? (
                      <CircleCheck size={18} className="text-[#2D7A3A]" />
                    ) : (
                      <AlertTriangle size={18} className="text-[#B8860B]" />
                    )}
                    <span className="text-xs font-bold text-[#1A1A1A]">Process leave requests</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      pendingLeavesCount === 0 ? 'bg-[#EDF7EF] text-[#2D7A3A]' : 'bg-[#FDF6E2] text-[#B8860B]'
                    }`}>
                      {pendingLeavesCount} pending
                    </span>
                    <ChevronRight size={14} className="text-[#999999]" />
                  </div>
                </Link>

                {/* 5. Bulk Confirm Salaries */}
                <Link
                  href="/salary"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F8F8F8] transition-colors"
                >
                  <div className="flex items-center space-x-2.5">
                    {checklistUnconfirmed === 0 ? (
                      <CircleCheck size={18} className="text-[#2D7A3A]" />
                    ) : (
                      <AlertTriangle size={18} className="text-[#B8860B]" />
                    )}
                    <span className="text-xs font-bold text-[#1A1A1A]">Bulk confirm salaries</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      checklistUnconfirmed === 0 ? 'bg-[#EDF7EF] text-[#2D7A3A]' : 'bg-[#FDF6E2] text-[#B8860B]'
                    }`}>
                      {checklistUnconfirmed} staff left
                    </span>
                    <ChevronRight size={14} className="text-[#999999]" />
                  </div>
                </Link>

                {/* 6. Mark Salaries as Paid */}
                <Link
                  href="/salary"
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F8F8F8] transition-colors"
                >
                  <div className="flex items-center space-x-2.5">
                    {checklistUnpaid === 0 ? (
                      <CircleCheck size={18} className="text-[#2D7A3A]" />
                    ) : (
                      <AlertTriangle size={18} className="text-[#B8860B]" />
                    )}
                    <span className="text-xs font-bold text-[#1A1A1A]">Mark salaries as paid</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      checklistUnpaid === 0 ? 'bg-[#EDF7EF] text-[#2D7A3A]' : 'bg-[#FDF6E2] text-[#B8860B]'
                    }`}>
                      {checklistUnpaid} unpaid
                    </span>
                    <ChevronRight size={14} className="text-[#999999]" />
                  </div>
                </Link>

              </div>
            </div>
          )}

          {/* Alerts section */}
          {(absentStaffAlerts.length > 0 || lateArrivalsAlerts.length > 0 || pendingLeavesCount > 0 || pendingApprovalsCount > 0 || (latestAnn && user?.role !== 'nearbi_homes_supervisor')) && (
            <div className="space-y-3">
              <h4 className="text-[#999999] text-[11px] font-black uppercase tracking-wider">
                Alerts
              </h4>

              {/* Latest Announcement read receipt card */}
              {latestAnn && user?.role !== 'nearbi_homes_supervisor' && (
                <Link
                  href="/announcements"
                  className="block bg-white border border-[#E8E8E8] border-l-[4px] border-l-amber-500 rounded-[14px] p-4 text-left active:bg-[#F8F8F8] transition-colors shadow-sm"
                >
                  <div className="font-bold text-amber-600 text-xs flex items-center justify-between mb-1">
                    <span className="flex items-center">
                      <Megaphone size={16} strokeWidth={1.5} className="mr-1.5 flex-shrink-0 text-amber-500" />
                      Latest Announcement Status
                    </span>
                    <span className="text-[10px] uppercase font-bold text-[#999999] tracking-wider flex items-center">
                      Manage <ChevronRight size={14} strokeWidth={1.5} className="ml-0.5" />
                    </span>
                  </div>
                  <div className="text-xs text-[#1A1A1A] font-bold mt-1.5 truncate">
                    "{latestAnn.title}"
                  </div>
                  <div className="text-[10px] text-[#555555] font-semibold mt-1">
                    Read coverage: <span className="font-bold text-[#1A1A1A]">{latestAnn.readCount}</span> / <span className="font-bold text-[#1A1A1A]">{latestAnn.targetCount}</span> staff ({Math.round((latestAnn.readCount / latestAnn.targetCount) * 100)}%)
                  </div>
                </Link>
              )}

              {/* Absent staff alert */}
              {absentStaffAlerts.length > 0 && (
                <div className="bg-white border border-[#E8E8E8] border-l-[4px] border-l-[#C0392B] rounded-[14px] p-4 text-left shadow-sm">
                  <div className="font-bold text-[#C0392B] text-xs flex items-center mb-1">
                    <UserX size={16} strokeWidth={1.5} className="mr-1.5 flex-shrink-0 text-[#C0392B]" />
                    {absentStaffAlerts.length} staff absent today
                  </div>
                  <div className="text-[11px] text-[#555555] pl-5 space-y-0.5 leading-relaxed font-semibold whitespace-pre-line">
                    {absentStaffAlerts.map((s) => s.name).join(', ')}
                  </div>
                </div>
              )}

              {/* Late arrivals alert */}
              {lateArrivalsAlerts.length > 0 && (
                <div className="bg-white border border-[#E8E8E8] border-l-[4px] border-l-[#B8860B] rounded-[14px] p-4 text-left shadow-sm">
                  <div className="font-bold text-[#B8860B] text-xs flex items-center mb-2">
                    <AlertTriangle size={16} strokeWidth={1.5} className="mr-1.5 flex-shrink-0 text-[#B8860B]" />
                    {lateArrivalsAlerts.length} staff arrived late
                  </div>
                  <div className="pl-5 space-y-1">
                    {lateArrivalsAlerts.map((s, i) => (
                      <div key={i} className="text-[11px] text-[#555555] font-semibold flex items-center">
                        {s.name} — {s.minutes} mins late
                        <span className="inline-block w-1.5 h-1.5 rounded-full ml-1.5 bg-[#B8860B]" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending leaves alert */}
              {pendingLeavesCount > 0 && (
                <Link
                  href="/leave"
                  className="block bg-white border border-[#E8E8E8] border-l-[4px] border-l-[#1A1A1A] rounded-[14px] p-4 text-left active:bg-[#F8F8F8] transition-colors shadow-sm"
                >
                  <div className="font-bold text-[#1A1A1A] text-xs flex items-center justify-between">
                    <span className="flex items-center text-[#1A1A1A]">
                      <ClipboardList size={16} strokeWidth={1.5} className="mr-1.5 flex-shrink-0 text-[#1A1A1A]" />
                      {pendingLeavesCount} leave requests pending approval
                    </span>
                    <span className="text-[10px] uppercase font-bold text-[#999999] tracking-wider flex items-center">
                      Review <ChevronRight size={14} strokeWidth={1.5} className="ml-0.5" />
                    </span>
                  </div>
                </Link>
              )}

              {/* Pending approvals alert */}
              {pendingApprovalsCount > 0 && (
                <Link
                  href="/approvals"
                  className="block bg-white border border-[#E8E8E8] border-l-[4px] border-l-[#1A1A1A] rounded-[14px] p-4 text-left active:bg-[#F8F8F8] transition-colors shadow-sm"
                >
                  <div className="font-bold text-[#1A1A1A] text-xs flex items-center justify-between">
                    <span className="flex items-center text-[#1A1A1A]">
                      <CheckSquare size={16} strokeWidth={1.5} className="mr-1.5 flex-shrink-0 text-[#1A1A1A]" />
                      {pendingApprovalsCount} OT/early-in approvals pending
                    </span>
                    <span className="text-[10px] uppercase font-bold text-[#999999] tracking-wider flex items-center">
                      Review <ChevronRight size={14} strokeWidth={1.5} className="ml-0.5" />
                    </span>
                  </div>
                </Link>
              )}
            </div>
          )}

          {/* Birthday Tracker Card */}
          {user?.role !== 'admin' && user?.role !== 'nearbi_homes_supervisor' && (() => {
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
                <h4 className="text-[#999999] text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
                  <Cake size={14} strokeWidth={1.5} />
                  <span>Upcoming Birthdays</span>
                </h4>
                <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 space-y-3 shadow-sm">
                  {activeBranchBirthdays.map((s) => {
                    const dob = new Date(s.date_of_birth!);
                    const formattedDob = dob.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                    return (
                      <div key={s.id} className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center font-bold text-xs">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-[#1A1A1A] leading-tight">{s.name}</p>
                            <p className="text-[10px] text-[#999999] mt-0.5 leading-tight">{s.department}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider ${
                            s.daysUntil === 0 
                              ? 'bg-[#EDF7EF] text-[#2D7A3A] border border-[#C3E6CB]'
                              : 'bg-[#F2F2F2] text-[#555555] border border-[#E8E8E8]'
                          }`}>
                            {s.daysUntil === 0 ? (
                              <span className="flex items-center gap-1 font-extrabold">
                                Today <PartyPopper size={11} strokeWidth={2} />
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
            <h4 className="text-[#999999] text-[11px] font-black uppercase tracking-wider mb-3">
              Quick Actions
            </h4>
            
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/attendance"
                className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group"
              >
                <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2">
                  <Clock size={16} strokeWidth={1.5} className="text-white" />
                </div>
                <span className="text-[13px] font-bold text-[#1A1A1A]">Attendance</span>
              </Link>

              <Link
                href="/staff"
                className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group"
              >
                <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2">
                  <Users size={16} strokeWidth={1.5} className="text-white" />
                </div>
                <span className="text-[13px] font-bold text-[#1A1A1A]">Staff</span>
              </Link>

              <Link
                href="/leave"
                className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group"
              >
                <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2">
                  <ClipboardList size={16} strokeWidth={1.5} className="text-white" />
                </div>
                <span className="text-[13px] font-bold text-[#1A1A1A]">Leave Requests</span>
              </Link>

              <Link
                href="/approvals"
                className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group"
              >
                <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2">
                  <CheckSquare size={16} strokeWidth={1.5} className="text-white" />
                </div>
                <span className="text-[13px] font-bold text-[#1A1A1A]">Approvals</span>
              </Link>

              {/* Owner/Ops only Settings + Salary links */}
              {canSeeSalaryBreakdown && (
                <Link
                  href="/salary"
                  className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group"
                >
                  <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2">
                    <Wallet size={16} strokeWidth={1.5} className="text-white" />
                  </div>
                  <span className="text-[13px] font-bold text-[#1A1A1A]">Salary</span>
                </Link>
              )}

              {user?.role !== 'partner_viewer' && user?.role !== 'nearbi_homes_supervisor' && canSeeSalaryBreakdown && (
                <Link
                  href="/settings"
                  className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group"
                >
                  <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2">
                    <Settings size={16} strokeWidth={1.5} className="text-white" />
                  </div>
                  <span className="text-[13px] font-bold text-[#1A1A1A]">Settings</span>
                </Link>
              )}

              {/* Candidates Quick Action (Ops Manager only) */}
              {user?.role === 'ops_manager' && (
                <Link
                  href="/candidates"
                  className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group col-span-2 relative"
                >
                  <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2 mx-auto relative">
                    <Users size={16} strokeWidth={1.5} className="text-white" />
                    {newCandidatesCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full w-5 h-5 text-[10px] font-black flex items-center justify-center border border-white">
                        {newCandidatesCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-bold text-[#1A1A1A]">Candidates</span>
                </Link>
              )}

              {/* The Wall Quick Action (Hidden from Admin and Supervisor) */}
              {user?.role !== 'admin' && user?.role !== 'nearbi_homes_supervisor' && (
                <Link
                  href="/wall"
                  className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group col-span-2"
                >
                  <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2 mx-auto">
                    <Activity size={16} strokeWidth={1.5} className="text-white" />
                  </div>
                  <span className="text-[13px] font-bold text-[#1A1A1A]">The Wall</span>
                </Link>
              )}

              {/* Resignations Quick Action */}
              {(user?.role === 'admin' || user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
                <Link
                  href="/resignations"
                  className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group col-span-2"
                >
                  <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2 mx-auto">
                    <UserMinus size={16} strokeWidth={1.5} className="text-white" />
                  </div>
                  <span className="text-[13px] font-bold text-[#1A1A1A]">Resignations</span>
                </Link>
              )}

              {/* Document Verification Quick Action */}
              {(user?.role === 'admin' || user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
                <Link
                  href="/verification"
                  className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group col-span-2 relative"
                >
                  <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2 mx-auto relative">
                    <FileText size={16} strokeWidth={1.5} className="text-white" />
                    {pendingVerificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full w-5 h-5 text-[10px] font-black flex items-center justify-center border border-white">
                        {pendingVerificationCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-bold text-[#1A1A1A]">Doc Verification</span>
                </Link>
              )}

              {/* Open kiosk */}
              <Link
                href="/kiosk"
                className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col items-center justify-center text-center hover:bg-[#F8F8F8] active:scale-[0.98] transition-all shadow-sm group col-span-2"
              >
                <div className="w-9 h-9 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mb-2 mx-auto">
                  <Fingerprint size={16} strokeWidth={1.5} className="text-white" />
                </div>
                <span className="text-[13px] font-bold text-[#1A1A1A]">Open Attendance Kiosk</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

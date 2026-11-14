'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { fetchAllAttendance, getDaysInMonth } from '@/lib/salary';
import { getFineSettings } from '@/lib/fineSettings';
import {
  buildInTimeGridModel,
  InTimeGridModel,
  StaffRawRecord,
  AttendanceRawRecord,
  LateFineRawRecord,
  LeaveRequestRawRecord,
} from '@/lib/inTimeGrid';
import InTimeGrid from '@/components/attendance/InTimeGrid';
import {
  ArrowLeft,
  Clock,
  ShieldAlert,
} from 'lucide-react';

async function fetchAllLateFines(supabaseClient: any, startDate: string, endDate: string) {
  let allRows: LateFineRawRecord[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('late_fines')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  return allRows;
}

async function fetchAllLeaveRequests(supabaseClient: any, startDate: string, endDate: string) {
  let allRows: LeaveRequestRawRecord[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseClient
      .from('leave_requests')
      .select('*')
      .eq('status', 'approved')
      .gte('date', startDate)
      .lte('date', endDate)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  return allRows;
}

export default function InTimeGridPage() {
  const { user, userBranch, isLoading: authLoading } = useAuth();

  // Current month in YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [model, setModel] = useState<InTimeGridModel | null>(null);

  // Determine branch and department restrictions based on role
  const allowedBranch = user?.role === 'nearbi_homes_supervisor'
    ? 'hypermarket'
    : userBranch;

  const allowedDepartment = user?.role === 'nearbi_homes_supervisor'
    ? 'Nearbi Homes'
    : null;

  // Authorization check
  const isAuthorized =
    user?.role === 'admin' ||
    user?.role === 'ops_manager' ||
    user?.role === 'staff_executive' ||
    user?.role === 'nearbi_homes_supervisor' ||
    user?.role === 'partner_viewer';

  const loadGridData = useCallback(async (monthStr: string) => {
    setLoadingData(true);
    try {
      const [yearStr, monthNumStr] = monthStr.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthNumStr, 10);
      const daysCount = getDaysInMonth(year, month);
      const startDate = `${monthStr}-01`;
      const endDate = `${monthStr}-${String(daysCount).padStart(2, '0')}`;

      // 1. Fetch staff with shift join
      let staffQuery = supabase
        .from('staff')
        .select('id, name, branch_id, department, pay_type, shift_id, off_days_per_month, join_date, active, is_resigned, shift:shifts(id, label, start_time, end_time, hours)');

      if (user?.role === 'nearbi_homes_supervisor') {
        staffQuery = staffQuery.eq('branch_id', 'hypermarket').eq('department', 'Nearbi Homes');
      } else if (userBranch) {
        staffQuery = staffQuery.eq('branch_id', userBranch);
      }

      const { data: staffData, error: staffErr } = await staffQuery.order('name');
      if (staffErr) throw staffErr;

      // 2. Fetch all attendance with pagination
      const rawAttendance: AttendanceRawRecord[] = await fetchAllAttendance(
        supabase,
        startDate,
        endDate
      );

      // Filter staff list:
      // Active staff are kept as normal.
      // Left/resigned staff (is_resigned === true or active === false) are included ONLY IF they have attendance rows in this month, marked "(left)".
      // New staff (joined during this month) are marked with is_new.
      const attStaffIds = new Set((rawAttendance || []).map((a) => a.staff_id));
      const processedStaffList = (staffData || [])
        .filter((st: any) => {
          const isLeft = st.is_resigned || st.active === false;
          if (isLeft) {
            return attStaffIds.has(st.id);
          }
          return true;
        })
        .map((st: any) => {
          const isLeft = st.is_resigned || st.active === false;
          const isNew = !isLeft && !!(st.join_date && st.join_date.startsWith(monthStr));
          return {
            ...st,
            is_left: isLeft,
            is_new: isNew,
          };
        });

      // 3. Fetch late_fines with pagination
      const rawFines: LateFineRawRecord[] = await fetchAllLateFines(
        supabase,
        startDate,
        endDate
      );

      // 4. Fetch approved leave requests
      const rawLeaves: LeaveRequestRawRecord[] = await fetchAllLeaveRequests(
        supabase,
        startDate,
        endDate
      );

      // 5. Fetch fine settings
      const fineSettingsData = await getFineSettings(supabase);

      // 6. Fetch staff fine exemptions
      const { data: exemptionsData } = await supabase
        .from('staff_fine_exemptions')
        .select('staff_id');
      const exemptStaffIds = new Set<string>(
        (exemptionsData || []).map((e: any) => e.staff_id)
      );

      // 7. Build model
      const builtModel = buildInTimeGridModel(
        (processedStaffList || []) as StaffRawRecord[],
        rawAttendance || [],
        rawFines || [],
        rawLeaves || [],
        fineSettingsData || {
          yellow_fine: 20,
          orange_fine: 30,
          red_fine: 50,
          yellow_free_passes: 4,
        },
        exemptStaffIds,
        year,
        month
      );

      setModel(builtModel);
    } catch (err: any) {
      console.error('Failed to load in-time grid data:', err);
    } finally {
      setLoadingData(false);
    }
  }, [userBranch, user?.role]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (isAuthorized) {
      loadGridData(selectedMonth);
    }
  }, [authLoading, user, isAuthorized, selectedMonth, loadGridData]);

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center select-none">
        <Clock className="w-8 h-8 text-amber-400 animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
          Checking access permissions...
        </p>
      </div>
    );
  }

  // Access restriction
  if (!isAuthorized) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="bg-[#1A1D28] border border-white/10 rounded-2xl p-8 max-w-sm w-full flex flex-col items-center shadow-xl">
          <ShieldAlert size={44} className="mb-4 text-rose-400" />
          <h2 className="text-base font-bold text-white mb-2 uppercase tracking-wide">
            Access Restricted
          </h2>
          <p className="text-slate-400 text-xs font-semibold leading-relaxed mb-4">
            Only management and HR executives have access to the monthly in-time register.
          </p>
          <Link
            href="/attendance"
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
          >
            Back to Attendance
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1700px] mx-auto px-2 sm:px-4 md:px-6 py-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/10">
        <div>
          <Link
            href="/attendance"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors mb-2 group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Daily Attendance</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">In-Time Grid</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Monthly Overview
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Complete monthly check-in times, lateness bands, targets, and ranking for all staff.
          </p>
        </div>
      </div>

      {/* Grid Content */}
      {model && (
        <InTimeGrid
          model={model}
          selectedMonth={selectedMonth}
          onMonthChange={(newMonth) => setSelectedMonth(newMonth)}
          allowedBranch={allowedBranch}
          allowedDepartment={allowedDepartment}
          isLoading={loadingData}
        />
      )}
    </div>
  );
}

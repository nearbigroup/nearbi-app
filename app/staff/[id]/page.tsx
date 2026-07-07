'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, 
  Calendar as CalendarIcon, 
  AlertCircle, 
  Briefcase, 
  MapPin, 
  Clock, 
  Plus, 
  Lock, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  DollarSign, 
  X, 
  Coffee, 
  AlertTriangle,
  User,
  PlusCircle,
  HelpCircle,
  FileMinus,
  CheckCircle2,
  Trash2,
  Download,
  Flag
} from 'lucide-react';
import SpecialFineBottomSheet from '@/components/SpecialFineBottomSheet';
import { formatTime12hr } from '@/lib/utils';
import { calculateEarlyLeaveDeduction, calculateLateSalaryDeduction, calculateActualHours, calculateOTMinutes, calculateEarlyLeaveMinutes, calculateLateMinutes, calculateMinutesWorked, calculateHourlySalary } from '@/lib/salary';
import { createAuditLog } from '@/lib/audit';

interface StaffMember {
  id: string;
  name: string;
  pin: string;
  branch_id: string;
  department: string;
  off_days_per_month: number;
  monthly_salary: number;
  join_date: string;
  active: boolean;
  pay_type?: string;
  standard_hours?: number;
  ot_threshold_minutes?: number;
  is_trial?: boolean;
  candidate_id?: string | null;
  shift?: {
    id: string;
    label: string;
    start_time: string;
    end_time: string;
    hours: number;
  };
}

interface AttendanceRecord {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: 'present' | 'late' | 'absent';
  color_code: 'green' | 'yellow' | 'orange' | 'red';
  minutes_late: number;
  ot_minutes: number;
  ot_approved: boolean;
  early_in_minutes: number;
  early_in_approved: boolean;
  total_hours_logged?: number;
  early_leave_minutes?: number;
  actual_hours_worked: number;
  check_in_photo: string | null;
  check_out_photo: string | null;
  marked_by: string;
  day_type?: string;
  late_salary_deduction_minutes?: number;
  auto_closed?: boolean;
  photo_flagged?: boolean;
  photo_flag_reason?: string | null;
  photo_flagged_by?: string | null;
  override_shift_start?: string | null;
  override_shift_end?: string | null;
  override_reason?: string | null;
  override_approved_by?: string | null;
}

interface LateFine {
  id: string;
  date: string;
  late_minutes: number;
  color_code: 'yellow' | 'orange' | 'red';
  fine_amount: number;
  waived: boolean;
  waived_by: string | null;
  confirmed: boolean;
  waived_amount?: number;
}

interface SpecialFine {
  id: string;
  amount: number;
  reason: string;
  date: string;
  confirmed: boolean;
  waived: boolean;
  waived_by: string | null;
  created_by: string | null;
  waived_amount?: number;
}

interface LeaveRequest {
  id: string;
  staff_id?: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  is_quota_leave: boolean;
  approved_by: string | null;
  is_weekly_off?: boolean;
  requires_ops_approval?: boolean;
  day_of_week?: string;
}

interface BreakLog {
  id: string;
  date: string;
  break_type: 'morning_tea' | 'food_break' | 'evening_tea' | 'unscheduled';
  break_start: string;
  break_end: string | null;
  duration_minutes: number | null;
  over_minutes: number;
  allowed_minutes: number;
  auto_closed: boolean;
}

interface StaffNote {
  id: string;
  note: string;
  added_by: string;
  created_at: string;
}

interface SalaryConfirmation {
  id: string;
  month: string;
  net_salary: number;
  base_salary: number;
  paid_days: number;
  leave_deduction: number;
  ot_pay: number;
  confirmed_fines: number;
  confirmed_special_fines: number;
  late_salary_deduction: number;
  is_hourly?: boolean;
  total_hours_logged?: number;
  standard_hours?: number;
  hourly_rate?: number;
}

type TabName = 'attendance' | 'fines' | 'leaves' | 'salary' | 'breaks' | 'notes';

export default function StaffProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user, userBranch } = useAuth();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Date States
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonthVal, setSelectedMonthVal] = useState<number>(() => new Date().getMonth() + 1);
  const selectedMonth = `${selectedYear}-${String(selectedMonthVal).padStart(2, '0')}`;
  const setSelectedMonth = (monthStr: string) => {
    const [y, m] = monthStr.split('-').map(Number);
    setSelectedYear(y);
    setSelectedMonthVal(m);
  };

  // DB States
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [lateFines, setLateFines] = useState<LateFine[]>([]);
  const [specialFines, setSpecialFines] = useState<SpecialFine[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [breaks, setBreaks] = useState<BreakLog[]>([]);
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [salaryConfirmations, setSalaryConfirmations] = useState<SalaryConfirmation[]>([]);
  const [perfScore, setPerfScore] = useState<any | null>(null);

  // UI States
  const [activeTab, setActiveTab] = useState<TabName>('attendance');
  const [fineModalOpen, setFineModalOpen] = useState(false);
  const [addNoteModalOpen, setAddNoteModalOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    day: number;
    dateStr: string;
    record: AttendanceRecord | null;
    dayBreaks: BreakLog[];
    dayFines: (LateFine | SpecialFine)[];
  } | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    title: string;
    name?: string;
    date?: string;
    label?: string;
    attendanceId?: string;
    photo_flagged?: boolean;
    photo_flag_reason?: string;
    photo_flagged_by?: string;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  // Editing past attendance states
  const [isEditingAttendance, setIsEditingAttendance] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editStatus, setEditStatus] = useState<'present' | 'late' | 'absent'>('present');
  const [editDayType, setEditDayType] = useState('present');
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [overrideShift, setOverrideShift] = useState(false);
  const [overrideStart, setOverrideStart] = useState('');
  const [overrideEnd, setOverrideEnd] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  // Pending Actions states
  const [pendingOT, setPendingOT] = useState<AttendanceRecord[]>([]);
  const [pendingLateFines, setPendingLateFines] = useState<LateFine[]>([]);
  const [pendingSpecialFines, setPendingSpecialFines] = useState<SpecialFine[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Toast Helper
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Fine Waive States
  const [waiveModalOpen, setWaiveModalOpen] = useState(false);
  const [selectedFineForWaive, setSelectedFineForWaive] = useState<{
    id: string;
    type: 'late' | 'special';
    date: string;
    originalAmount: number;
    waivedAmount: number;
    reason?: string;
  } | null>(null);
  const [waivedAmountInput, setWaivedAmountInput] = useState('');
  const [isSavingWaive, setIsSavingWaive] = useState(false);

  const handleSaveWaive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFineForWaive || !staff) return;
    
    const inputVal = Number(waivedAmountInput);
    if (isNaN(inputVal) || inputVal < 0 || inputVal > selectedFineForWaive.originalAmount) {
      alert(`Please enter a valid waived amount between 0 and ${selectedFineForWaive.originalAmount}`);
      return;
    }

    setIsSavingWaive(true);
    try {
      const isFullyWaived = inputVal === selectedFineForWaive.originalAmount;
      const waivedBy = user?.name || user?.email || 'Management';

      if (selectedFineForWaive.type === 'late') {
        const { error } = await supabase
          .from('late_fines')
          .update({
            waived: isFullyWaived,
            waived_amount: inputVal,
            waived_by: waivedBy
          })
          .eq('id', selectedFineForWaive.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('special_fines')
          .update({
            waived: isFullyWaived,
            waived_amount: inputVal,
            waived_by: waivedBy
          })
          .eq('id', selectedFineForWaive.id);

        if (error) throw error;
      }

      showToast('Fine waiver updated ✓');
      setWaiveModalOpen(false);
      setSelectedFineForWaive(null);
      fetchMonthData(); // Reload fines list
    } catch (err: any) {
      console.error(err);
      alert('Failed to save waiver: ' + err.message);
    } finally {
      setIsSavingWaive(false);
    }
  };

  const fetchPendingActions = async () => {
    try {
      const { data: otData } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', id)
        .gt('ot_minutes', 0)
        .eq('ot_approved', false);
      setPendingOT(otData || []);

      const { data: lfData } = await supabase
        .from('late_fines')
        .select('*')
        .eq('staff_id', id)
        .eq('confirmed', false)
        .eq('waived', false);
      setPendingLateFines(lfData || []);

      const { data: sfData } = await supabase
        .from('special_fines')
        .select('*')
        .eq('staff_id', id)
        .eq('confirmed', false)
        .eq('waived', false);
      setPendingSpecialFines(sfData || []);

      const { data: lvData } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('staff_id', id)
        .eq('status', 'pending');
      setPendingLeaves(lvData || []);

      const { data: logsData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      const filteredLogs = logsData ? logsData.filter((log: any) => {
        if (log.record_id === id) return true;
        if (log.reason && log.reason.includes(id)) return true;
        if (log.reason && staff?.name && log.reason.includes(staff.name)) return true;
        
        let oldValObj: any = null;
        let newValObj: any = null;
        try {
          oldValObj = typeof log.old_value === 'string' ? JSON.parse(log.old_value) : log.old_value;
        } catch (_) {}
        try {
          newValObj = typeof log.new_value === 'string' ? JSON.parse(log.new_value) : log.new_value;
        } catch (_) {}
        
        if (oldValObj?.staff_id === id || newValObj?.staff_id === id) return true;
        return false;
      }) : [];
      setAuditLogs(filteredLogs.slice(0, 5));
    } catch (err) {
      console.error('Error fetching pending actions:', err);
    }
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDayDetail || !staff) return;

    const d = new Date(selectedDayDetail.dateStr + 'T00:00:00');
    const today = new Date();
    const isFuture = d > today;

    if (isFuture) {
      alert('Cannot mark attendance for future dates.');
      return;
    }

    const isWithinLast4Months = (dateStr: string) => {
      const targetDate = new Date(dateStr + 'T00:00:00');
      const now = new Date();
      const diffMonths = (now.getFullYear() - targetDate.getFullYear()) * 12 + (now.getMonth() - targetDate.getMonth());
      return diffMonths >= 0 && diffMonths <= 3;
    };

    const isAdminOps = user?.role === 'admin' || user?.role === 'ops_manager';
    const isHR = user?.role === 'staff_executive';

    const canEdit = !isFuture && isWithinLast4Months(selectedDayDetail.dateStr) && (isAdminOps || isHR);

    if (!canEdit) {
      alert('You do not have permission to edit attendance for this date.');
      return;
    }

    setIsSavingAttendance(true);
    try {
      const dateStr = selectedDayDetail.dateStr;
      
      let finalCheckIn = editCheckIn ? editCheckIn : null;
      let finalCheckOut = editCheckOut ? editCheckOut : null;
      let finalStatus: 'present' | 'late' | 'absent' = editStatus;
      let finalDayType = editDayType;

      if (isHR) {
        // Enforce HR limits: Mark Weekly Off, Mark Approved Leave, or Keep Absent
        if (finalDayType !== 'weekly_off' && finalDayType !== 'leave') {
          // Keep Absent
          finalDayType = 'present';
          finalStatus = 'absent';
          finalCheckIn = null;
          finalCheckOut = null;
        } else {
          finalCheckIn = null;
          finalCheckOut = null;
          finalStatus = 'present';
        }
      }

      let minutesLate = 0;
      let otMinutes = 0;
      let earlyLeaveMinutes = 0;
      let colorCode: 'green' | 'yellow' | 'orange' | 'red' = 'green';
      let actualHours = 0;
      let shortAttendance = false;

      if (finalDayType === 'weekly_off') {
        const monthKey = dateStr.substring(0, 7);
        const firstDay = `${monthKey}-01`;
        const [yr, mo] = monthKey.split('-').map(Number);
        const lastDayNum = new Date(yr, mo, 0).getDate();
        const lastDay = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

        const { data: attRecords } = await supabase
          .from('attendance')
          .select('date, check_in_time, day_type')
          .eq('staff_id', staff.id)
          .gte('date', firstDay)
          .lte('date', lastDay);

        const daysWorked = attRecords?.filter(
          r => r.check_in_time !== null && r.day_type !== 'weekly_off' && r.day_type !== 'holiday'
        ).length || 0;

        const usedWeeklyOffs = attRecords?.filter(
          r => r.day_type === 'weekly_off' && r.date !== dateStr
        ).length || 0;

        const offDaysPerMonth = staff.off_days_per_month !== undefined ? staff.off_days_per_month : 4;
        const earned = offDaysPerMonth === 0 ? 0 : Math.min(Math.floor(daysWorked / 6), offDaysPerMonth);

        if (usedWeeklyOffs >= earned && !staff.is_trial) {
          alert(`${staff.name} has no weekly off balance remaining this month. Earned: ${earned} | Used: ${usedWeeklyOffs}`);
          setIsSavingAttendance(false);
          return;
        }
      }

      if (finalDayType === 'weekly_off' || finalDayType === 'holiday' || finalDayType === 'leave') {
        finalCheckIn = null;
        finalCheckOut = null;
        finalStatus = 'present';
        colorCode = 'green';
      } else {
        if (!finalCheckIn) {
          finalStatus = 'absent';
          colorCode = 'red';
        } else {
          const effectiveStart = overrideShift ? overrideStart : (staff.shift?.start_time || '09:00');
          const effectiveEnd = overrideShift ? overrideEnd : (staff.shift?.end_time || '18:00');

          if (overrideShift && overrideStart === finalCheckIn) {
            minutesLate = 0;
          } else {
            minutesLate = calculateLateMinutes(finalCheckIn, effectiveStart);
          }

          if (minutesLate > 0) {
            finalStatus = 'late';
            if (minutesLate <= 15) colorCode = 'yellow';
            else if (minutesLate <= 30) colorCode = 'orange';
            else colorCode = 'red';
          } else {
            finalStatus = 'present';
            colorCode = 'green';
          }

          if (finalCheckOut) {
            if (finalCheckOut === finalCheckIn) {
              alert('Check-out time cannot be equal to check-in time.');
              setIsSavingAttendance(false);
              return;
            }
            
            actualHours = calculateActualHours(finalCheckIn, finalCheckOut);
            const diffMins = calculateMinutesWorked(finalCheckIn, finalCheckOut);
            if (diffMins > 0 && diffMins < 30) {
              shortAttendance = true;
            }

            otMinutes = calculateOTMinutes(effectiveEnd, finalCheckOut, effectiveStart, staff.ot_threshold_minutes);
            earlyLeaveMinutes = calculateEarlyLeaveMinutes(effectiveEnd, finalCheckOut, effectiveStart);
          }
        }
      }

      const { data: oldRecord } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('date', dateStr)
        .maybeSingle();

      const attendanceId = oldRecord?.id || undefined;
      const { data: newRecord, error: attError } = await supabase
        .from('attendance')
        .upsert({
          id: attendanceId,
          staff_id: staff.id,
          date: dateStr,
          check_in_time: finalCheckIn,
          check_out_time: finalCheckOut,
          status: finalStatus,
          day_type: finalDayType,
          color_code: colorCode,
          minutes_late: minutesLate,
          late_salary_deduction_minutes: finalCheckIn ? (overrideShift && overrideStart === finalCheckIn ? 0 : calculateLateMinutes(finalCheckIn, overrideShift ? overrideStart : (staff.shift?.start_time || '09:00'))) : 0,
          ot_minutes: otMinutes,
          ot_approved: false,
          early_leave_minutes: earlyLeaveMinutes,
          actual_hours_worked: actualHours,
          short_attendance: shortAttendance,
          marked_by: user?.name || user?.email || 'admin',
          override_shift_start: overrideShift ? overrideStart : null,
          override_shift_end: overrideShift ? overrideEnd : null,
          override_reason: overrideShift ? overrideReason : null,
          override_approved_by: overrideShift ? (user?.email || 'admin') : null
        }, { onConflict: 'staff_id,date' })
        .select()
        .single();

      if (attError) throw attError;

      let fineAmount = 0;
      if (finalStatus === 'late') {
        const { data: exemption } = await supabase
          .from('staff_fine_exemptions')
          .select('id')
          .eq('staff_id', staff.id)
          .maybeSingle();

        if (!exemption) {
          const { data: fineSettings } = await supabase.from('fine_settings').select('*').limit(1).maybeSingle();
          const settings = fineSettings || {
            yellow_fine: 50,
            orange_fine: 100,
            red_fine: 200,
            yellow_free_passes: 4
          };

          if (colorCode === 'yellow') {
            const [y, m] = dateStr.split('-');
            const firstDayOfMonth = `${y}-${m}-01`;
            const { count, error: countErr } = await supabase
              .from('attendance')
              .select('*', { count: 'exact', head: true })
              .eq('staff_id', staff.id)
              .eq('color_code', 'yellow')
              .gte('date', firstDayOfMonth)
              .lte('date', dateStr);

            if (!countErr && count !== null && count >= settings.yellow_free_passes) {
              fineAmount = Number(settings.yellow_fine);
            }
          } else if (colorCode === 'orange') {
            fineAmount = Number(settings.orange_fine);
          } else if (colorCode === 'red') {
            fineAmount = Number(settings.red_fine);
          }
        }
      }

      if (fineAmount > 0) {
        const [y, m] = dateStr.split('-');
        const monthStr = `${y}-${m}`;
        const { error: fineErr } = await supabase.from('late_fines').upsert({
          staff_id: staff.id,
          date: dateStr,
          late_minutes: minutesLate,
          color_code: colorCode,
          fine_amount: fineAmount,
          waived: false,
          month: monthStr
        }, { onConflict: 'staff_id,date' });
        if (fineErr) throw fineErr;
      } else {
        await supabase
          .from('late_fines')
          .delete()
          .eq('staff_id', staff.id)
          .eq('date', dateStr)
          .eq('confirmed', false);
      }

      await createAuditLog({
        action: oldRecord ? 'UPDATE_ATTENDANCE' : 'CREATE_ATTENDANCE',
        table_name: 'attendance',
        record_id: newRecord.id,
        old_value: oldRecord || null,
        new_value: newRecord,
        performed_by: user?.name || user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Manual attendance edit via staff profile calendar'
      });

      showToast('Attendance saved ✓');
      setIsEditingAttendance(false);
      setSelectedDayDetail(null);
      fetchMonthData();
      fetchPendingActions();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save attendance: ' + err.message);
    } finally {
      setIsSavingAttendance(false);
    }
  };

  const startEditing = () => {
    if (!selectedDayDetail) return;
    const r = selectedDayDetail.record;
    setEditCheckIn(r?.check_in_time || '');
    setEditCheckOut(r?.check_out_time || '');
    setEditStatus(r?.status || 'present');
    setEditDayType(r?.day_type || 'present');
    
    const hasOverride = !!(r?.override_shift_start || r?.override_shift_end);
    setOverrideShift(hasOverride);
    setOverrideStart(r?.override_shift_start || staff?.shift?.start_time || '09:00');
    setOverrideEnd(r?.override_shift_end || staff?.shift?.end_time || '18:00');
    setOverrideReason(r?.override_reason || '');
    
    setIsEditingAttendance(true);
  };

  const handleDeleteAttendance = async () => {
    if (!selectedDayDetail || !staff) return;
    if (!window.confirm('Are you sure you want to delete this attendance record? This will also delete any related late fines.')) return;

    try {
      const dateStr = selectedDayDetail.dateStr;

      const { data: oldRecord } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('date', dateStr)
        .maybeSingle();

      if (!oldRecord) return;

      await supabase
        .from('late_fines')
        .delete()
        .eq('staff_id', staff.id)
        .eq('date', dateStr);

      const { error: deleteErr } = await supabase
        .from('attendance')
        .delete()
        .eq('id', oldRecord.id);

      if (deleteErr) throw deleteErr;

      await createAuditLog({
        action: 'DELETE_ATTENDANCE',
        table_name: 'attendance',
        record_id: oldRecord.id,
        old_value: oldRecord,
        new_value: null,
        performed_by: user?.name || user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Manual attendance delete via staff profile calendar'
      });

      showToast('Attendance record deleted ✓');
      setIsEditingAttendance(false);
      setSelectedDayDetail(null);
      fetchMonthData();
      fetchPendingActions();
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete attendance: ' + err.message);
    }
  };

  const handleApproveAllOT = async () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    if (pendingOT.length === 0) return;
    try {
      const ids = pendingOT.map(ot => ot.id);
      const { error } = await supabase
        .from('attendance')
        .update({ ot_approved: true })
        .in('id', ids);
      if (error) throw error;
      
      for (const ot of pendingOT) {
        await createAuditLog({
          action: 'APPROVE_OT',
          table_name: 'attendance',
          record_id: ot.id,
          old_value: { ot_approved: false },
          new_value: { ot_approved: true },
          performed_by: user?.name || user?.email || 'Admin',
          performed_by_role: user?.role || 'admin',
          reason: `Bulk Approved OT of ${ot.ot_minutes} mins for date ${ot.date}`
        });
      }

      showToast('All OT Approved ✓');
      fetchPendingActions();
      fetchMonthData();
    } catch (err: any) {
      alert('Failed to approve all OT: ' + err.message);
    }
  };

  const handleConfirmAllFines = async () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    if (pendingLateFines.length === 0 && pendingSpecialFines.length === 0) return;
    try {
      if (pendingLateFines.length > 0) {
        const lfIds = pendingLateFines.map(lf => lf.id);
        const { error } = await supabase
          .from('late_fines')
          .update({ confirmed: true })
          .in('id', lfIds);
        if (error) throw error;

        for (const lf of pendingLateFines) {
          await createAuditLog({
            action: 'CONFIRM_FINE',
            table_name: 'late_fines',
            record_id: lf.id,
            old_value: { confirmed: false },
            new_value: { confirmed: true },
            performed_by: user?.name || user?.email || 'Admin',
            performed_by_role: user?.role || 'admin',
            reason: `Bulk Confirmed late fine of ₹${lf.fine_amount} for date ${lf.date}`
          });
        }
      }

      if (pendingSpecialFines.length > 0) {
        const sfIds = pendingSpecialFines.map(sf => sf.id);
        const { error } = await supabase
          .from('special_fines')
          .update({ confirmed: true })
          .in('id', sfIds);
        if (error) throw error;

        for (const sf of pendingSpecialFines) {
          await createAuditLog({
            action: 'CONFIRM_SPECIAL_FINE',
            table_name: 'special_fines',
            record_id: sf.id,
            old_value: { confirmed: false },
            new_value: { confirmed: true },
            performed_by: user?.name || user?.email || 'Admin',
            performed_by_role: user?.role || 'admin',
            reason: `Bulk Confirmed special fine of ₹${sf.amount} for date ${sf.date}`
          });
        }
      }

      showToast('All Fines Confirmed ✓');
      fetchPendingActions();
      fetchMonthData();
    } catch (err: any) {
      alert('Failed to confirm all fines: ' + err.message);
    }
  };

  const handleApproveOT = async (record: AttendanceRecord) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    try {
      const { error } = await supabase
        .from('attendance')
        .update({ ot_approved: true })
        .eq('id', record.id);
      if (error) throw error;
      
      await createAuditLog({
        action: 'APPROVE_OT',
        table_name: 'attendance',
        record_id: record.id,
        old_value: { ot_approved: false },
        new_value: { ot_approved: true },
        performed_by: user?.name || user?.email || 'Admin',
        performed_by_role: user?.role || 'admin',
        reason: `Approved OT of ${record.ot_minutes} mins for date ${record.date}`
      });

      showToast('OT Approved ✓');
      fetchPendingActions();
      fetchMonthData();
    } catch (err: any) {
      alert('Failed to approve OT: ' + err.message);
    }
  };

  const handleRejectOT = async (record: AttendanceRecord) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    try {
      const { error } = await supabase
        .from('attendance')
        .update({ ot_minutes: 0, ot_approved: false })
        .eq('id', record.id);
      if (error) throw error;

      await createAuditLog({
        action: 'REJECT_OT',
        table_name: 'attendance',
        record_id: record.id,
        old_value: { ot_minutes: record.ot_minutes, ot_approved: false },
        new_value: { ot_minutes: 0, ot_approved: false },
        performed_by: user?.name || user?.email || 'Admin',
        performed_by_role: user?.role || 'admin',
        reason: `Rejected OT for date ${record.date}`
      });

      showToast('OT Rejected');
      fetchPendingActions();
      fetchMonthData();
    } catch (err: any) {
      alert('Failed to reject OT: ' + err.message);
    }
  };

  const handleConfirmLateFine = async (fine: LateFine) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    try {
      const { error } = await supabase
        .from('late_fines')
        .update({ confirmed: true })
        .eq('id', fine.id);
      if (error) throw error;

      await createAuditLog({
        action: 'CONFIRM_FINE',
        table_name: 'late_fines',
        record_id: fine.id,
        old_value: { confirmed: false },
        new_value: { confirmed: true },
        performed_by: user?.name || user?.email || 'Admin',
        performed_by_role: user?.role || 'admin',
        reason: `Confirmed late fine of ₹${fine.fine_amount} for date ${fine.date}`
      });

      showToast('Fine Confirmed ✓');
      fetchPendingActions();
      fetchMonthData();
    } catch (err: any) {
      alert('Failed to confirm fine: ' + err.message);
    }
  };

  const handleConfirmSpecialFine = async (fine: SpecialFine) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    try {
      const { error } = await supabase
        .from('special_fines')
        .update({ confirmed: true })
        .eq('id', fine.id);
      if (error) throw error;

      await createAuditLog({
        action: 'CONFIRM_SPECIAL_FINE',
        table_name: 'special_fines',
        record_id: fine.id,
        old_value: { confirmed: false },
        new_value: { confirmed: true },
        performed_by: user?.name || user?.email || 'Admin',
        performed_by_role: user?.role || 'admin',
        reason: `Confirmed special fine of ₹${fine.amount} for date ${fine.date}`
      });

      showToast('Special Fine Confirmed ✓');
      fetchPendingActions();
      fetchMonthData();
    } catch (err: any) {
      alert('Failed to confirm special fine: ' + err.message);
    }
  };

  const handleApproveLeave = async (req: LeaveRequest) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'approved', approved_by: user?.name || user?.email || 'HR' })
        .eq('id', req.id);
      if (error) throw error;

      const { error: attError } = await supabase
        .from('attendance')
        .upsert({
          staff_id: req.staff_id || id,
          date: req.date,
          status: 'absent',
          day_type: 'leave',
          marked_by: 'admin_leave_approval'
        }, { onConflict: 'staff_id,date' });

      if (attError) throw attError;

      await createAuditLog({
        action: 'APPROVE_LEAVE',
        table_name: 'leave_requests',
        record_id: req.id,
        old_value: { status: 'pending' },
        new_value: { status: 'approved' },
        performed_by: user?.name || user?.email || 'HR',
        performed_by_role: user?.role || 'staff_executive',
        reason: `Approved leave request for date ${req.date}`
      });

      showToast('Leave Approved ✓');
      fetchPendingActions();
      fetchLogs();
      fetchMonthData();
    } catch (err: any) {
      alert('Failed to approve leave: ' + err.message);
    }
  };

  const handleRejectLeave = async (req: LeaveRequest) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'rejected' })
        .eq('id', req.id);
      if (error) throw error;

      await createAuditLog({
        action: 'REJECT_LEAVE',
        table_name: 'leave_requests',
        record_id: req.id,
        old_value: { status: 'pending' },
        new_value: { status: 'rejected' },
        performed_by: user?.name || user?.email || 'HR',
        performed_by_role: user?.role || 'staff_executive',
        reason: `Rejected leave request for date ${req.date}`
      });

      showToast('Leave Rejected');
      fetchPendingActions();
      fetchLogs();
    } catch (err: any) {
      alert('Failed to reject leave: ' + err.message);
    }
  };

  // Branch access authorization on mount / load
  useEffect(() => {
    if (staff) {
      if (user?.role === 'staff_executive' && user.branch && staff.branch_id !== user.branch) {
        showToast('Access denied to other branch profiles');
        router.replace('/staff');
      } else if (user?.role === 'nearbi_homes_supervisor' && (staff.branch_id !== 'hypermarket' || staff.department !== 'Nearbi Homes')) {
        showToast('Access denied to profiles outside Nearbi Homes');
        router.replace('/staff');
      }
    }
  }, [staff, user, router]);

  // Fetch Core Staff Data (Only once)
  useEffect(() => {
    const fetchStaffData = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('staff')
          .select('*, shift:shifts(*)')
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setErrorMsg('Staff member not found.');
          return;
        }

        setStaff(data as unknown as StaffMember);
      } catch (err: any) {
        console.error(err);
        setErrorMsg('Failed to load profile details.');
      } finally {
        setLoading(false);
      }
    };

    fetchStaffData();
  }, [id]);

  // Fetch Month-dependent Data
  const fetchMonthData = async () => {
    if (!staff) return;
    try {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      
      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

      // 1. Fetch Attendance
      const { data: monthAtt } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', id)
        .gte('date', firstDay)
        .lte('date', lastDay)
        .order('date', { ascending: true });
      setAttendance(monthAtt || []);

      // 2. Fetch Late Fines
      const { data: lfData } = await supabase
        .from('late_fines')
        .select('*')
        .eq('staff_id', id)
        .eq('month', selectedMonth);
      setLateFines(lfData || []);

      // 3. Fetch Special Fines
      const { data: sfData } = await supabase
        .from('special_fines')
        .select('*')
        .eq('staff_id', id)
        .eq('month', selectedMonth);
      setSpecialFines(sfData || []);

      // 4. Fetch Break Logs
      const { data: breakData } = await supabase
        .from('break_logs')
        .select('*')
        .eq('staff_id', id)
        .gte('date', firstDay)
        .lte('date', lastDay);
      setBreaks(breakData || []);

      // 5. Fetch Performance Score
      const { data: psData } = await supabase
        .from('performance_scores')
        .select('*')
        .eq('staff_id', id)
        .eq('month', selectedMonth)
        .maybeSingle();
      setPerfScore(psData || null);
    } catch (err) {
      console.error('Error fetching month data:', err);
    }
  };

  // Fetch Non-month dependent logs
  const fetchLogs = async () => {
    if (!staff) return;
    try {
      // 1. Leave Requests
      const { data: leaveData } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('staff_id', id)
        .order('date', { ascending: false });
      setLeaves(leaveData || []);

      // 2. Salary Summary (Last 3 months)
      if (user?.role === 'admin' || user?.role === 'ops_manager') {
        const { data: salData } = await supabase
          .from('salary_confirmations')
          .select('*')
          .eq('staff_id', id)
          .order('month', { ascending: false })
          .limit(3);
        setSalaryConfirmations(salData || []);
      }

      // 3. Private Notes (Ops Manager only)
      if (user?.role === 'ops_manager') {
        const { data: notesData } = await supabase
          .from('staff_notes')
          .select('*')
          .eq('staff_id', id)
          .order('created_at', { ascending: false });
        setNotes(notesData || []);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  useEffect(() => {
    if (staff) {
      fetchMonthData();
      fetchLogs();
      fetchPendingActions();
    }
  }, [staff, selectedMonth]);

  // Swipe Gestures for Month Navigation
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(null);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      handleNextMonth();
    } else if (isRightSwipe) {
      handlePrevMonth();
    }
  };

  // Navigate Calendar Months
  const handlePrevMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr);
    let month = parseInt(monthStr);
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr);
    let month = parseInt(monthStr);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  // Save Private Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    setIsSubmittingNote(true);
    try {
      const { error } = await supabase
        .from('staff_notes')
        .insert({
          staff_id: id,
          note: noteText.trim(),
          added_by: user?.name || user?.email || 'Operations Manager'
        });

      if (error) throw error;
      showToast('Note added successfully');
      setNoteText('');
      setAddNoteModalOpen(false);
      
      // Refresh Notes List
      const { data: notesData } = await supabase
        .from('staff_notes')
        .select('*')
        .eq('staff_id', id)
        .order('created_at', { ascending: false });
      setNotes(notesData || []);
    } catch (err: any) {
      alert('Failed to save note: ' + err.message);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  // Delete Private Note
  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    try {
      const { error } = await supabase
        .from('staff_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      showToast('Note deleted');
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err: any) {
      alert('Failed to delete note');
    }
  };

  // Calculated Month Stats (For current selectedMonth)
  const monthStats = useMemo(() => {
    const present = attendance.filter(a => a.status === 'present' || a.status === 'late').length;
    const late = attendance.filter(a => a.status === 'late').length;
    const absent = attendance.filter(a => a.status === 'absent').length;
    
    // Sum OT minutes (approved adjustments or marked directly)
    const otMins = attendance.reduce((sum, a) => sum + (a.ot_approved ? a.ot_minutes : 0), 0);
    const otHours = Math.round((otMins / 60) * 10) / 10;

    return { present, late, absent, otHours };
  }, [attendance]);

  // Weekly off balance calculations
  const weeklyOffStats = useMemo(() => {
    if (!staff) return { earnedQuota: 0, weeklyOffsUsed: 0, weeklyOffsRemaining: 0 };
    const daysActuallyWorked = attendance.filter(a => a.check_in_time !== null && a.check_in_time !== undefined && a.check_in_time !== '').length;
    const offDaysPerMonth = staff.off_days_per_month ?? 4;
    
    const earnedQuota = offDaysPerMonth === 0 ? 0 : Math.min(Math.floor(daysActuallyWorked / 6), offDaysPerMonth);
    const weeklyOffsUsed = attendance.filter(a => a.day_type === 'weekly_off').length;
    const weeklyOffsRemaining = Math.max(0, earnedQuota - weeklyOffsUsed);

    return { earnedQuota, weeklyOffsUsed, weeklyOffsRemaining };
  }, [attendance, staff, selectedMonth]);

  // Performance Score Grade Calculator
  const getPerfGrade = (score: number) => {
    if (score >= 90) return { label: 'Excellent', color: 'text-[#4ADE80]', bg: 'bg-[#4ADE80]/10', bar: 'bg-[#4ADE80]' };
    if (score >= 75) return { label: 'Good', color: 'text-[#4ADE80]', bg: 'bg-[#4ADE80]/10', bar: 'bg-[#4ADE80]' };
    if (score >= 60) return { label: 'Average', color: 'text-[#FBBF24]', bg: 'bg-[#FBBF24]/10', bar: 'bg-[#FBBF24]' };
    return { label: 'Needs Improvement', color: 'text-[#F87171]', bg: 'bg-[#F87171]/10', bar: 'bg-[#F87171]' };
  };

  // Calendar rendering helper
  const calendarDays = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 is Sunday
    
    // Convert Sunday 0 to index 6, Monday 1 to index 0, etc.
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    
    const days = [];
    // Padding days for previous month
    for (let i = 0; i < startOffset; i++) {
      days.push(null);
    }
    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    return days;
  }, [selectedMonth]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-12 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  if (errorMsg || !staff) {
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-6 text-center max-w-sm mx-auto my-8 flex flex-col items-center justify-center">
        <AlertCircle size={40} className="text-[#F87171] mb-2" />
        <h3 className="text-base font-bold text-white mb-1">Error</h3>
        <p className="text-xs text-[var(--text-muted)]">{errorMsg || 'Failed to load staff.'}</p>
        <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-white text-xs font-bold rounded-lg">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8 relative">
      
      {/* Header back bar */}
      <div className="flex items-center space-x-3">
        <button 
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full border border-[var(--border-strong)] flex items-center justify-center text-[var(--text-secondary)] hover:text-white active:scale-90 transition-transform cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Staff Profile</span>
          <h1 className="text-xl font-extrabold text-[#1A1A1A] staff-name-header leading-tight">{staff.name}</h1>
        </div>
      </div>

      {/* Pending Actions & Audit Log Panel */}
      {(pendingOT.length > 0 || pendingLateFines.length > 0 || pendingSpecialFines.length > 0 || pendingLeaves.length > 0 || auditLogs.length > 0) && (() => {
        const totalPending = pendingOT.length + pendingLateFines.length + pendingSpecialFines.length + pendingLeaves.length;
        return (
          <div className="bg-[rgba(251,191,36,0.06)] border border-[rgba(251,191,36,0.18)] rounded-[18px] p-4 space-y-3.5 card-entry">
            <div className="flex items-center justify-between border-b border-[rgba(251,191,36,0.15)] pb-2 flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <AlertTriangle size={18} className="text-[#FBBF24] animate-pulse" />
                <h2 className="text-sm font-extrabold text-[#FBBF24] uppercase tracking-wider">
                  PENDING ACTIONS ({totalPending})
                </h2>
              </div>
              <div className="flex items-center space-x-1.5">
                {pendingOT.length > 0 && (
                  <button
                    onClick={handleApproveAllOT}
                    className="h-7 min-h-0 px-2.5 bg-[#4ADE80] text-black font-extrabold rounded-lg text-[9px] active:scale-95 transition-all cursor-pointer uppercase tracking-wider whitespace-nowrap"
                  >
                    Approve All OT
                  </button>
                )}
                {(pendingLateFines.length > 0 || pendingSpecialFines.length > 0) && (
                  <button
                    onClick={handleConfirmAllFines}
                    className="h-7 min-h-0 px-2.5 bg-[#FBBF24] text-black font-extrabold rounded-lg text-[9px] active:scale-95 transition-all cursor-pointer uppercase tracking-wider whitespace-nowrap"
                  >
                    Confirm All Fines
                  </button>
                )}
              </div>
            </div>

            {totalPending > 0 ? (
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {/* Pending OT */}
                {pendingOT.map(ot => (
                  <div key={ot.id} className="bg-black/25 border border-white/5 rounded-xl p-3 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-white">Overtime Request ({ot.ot_minutes} mins)</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(ot.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <div className="flex space-x-1.5">
                      <button 
                        onClick={() => handleApproveOT(ot)}
                        className="h-8 min-h-0 px-3 bg-[#4ADE80] text-black font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleRejectOT(ot)}
                        className="h-8 min-h-0 px-3 bg-[#F87171]/10 border border-[#F87171]/20 text-[#F87171] font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}

                {/* Pending Late Fines */}
                {pendingLateFines.map(lf => (
                  <div key={lf.id} className="bg-black/25 border border-white/5 rounded-xl p-3 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-white">Late Fine Confirmation (₹{lf.fine_amount})</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(lf.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • {lf.late_minutes} mins late</p>
                    </div>
                    <div className="flex space-x-1.5">
                      <button 
                        onClick={() => handleConfirmLateFine(lf)}
                        className="h-8 min-h-0 px-3 bg-[#4ADE80] text-black font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedFineForWaive({
                            id: lf.id,
                            type: 'late',
                            date: lf.date,
                            originalAmount: lf.fine_amount,
                            waivedAmount: lf.waived_amount || 0
                          });
                          setWaivedAmountInput(String(lf.waived_amount || 0));
                          setWaiveModalOpen(true);
                        }}
                        className="h-8 min-h-0 px-3 bg-[#FBBF24]/10 border border-[#FBBF24]/20 text-[#FBBF24] font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer"
                      >
                        Waive
                      </button>
                    </div>
                  </div>
                ))}

                {/* Pending Special Fines */}
                {pendingSpecialFines.map(sf => (
                  <div key={sf.id} className="bg-black/25 border border-white/5 rounded-xl p-3 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-white">Special Fine Confirmation (₹{sf.amount})</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(sf.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • "{sf.reason}"</p>
                    </div>
                    <div className="flex space-x-1.5">
                      <button 
                        onClick={() => handleConfirmSpecialFine(sf)}
                        className="h-8 min-h-0 px-3 bg-[#4ADE80] text-black font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedFineForWaive({
                            id: sf.id,
                            type: 'special',
                            date: sf.date,
                            originalAmount: sf.amount,
                            waivedAmount: sf.waived_amount || 0,
                            reason: sf.reason
                          });
                          setWaivedAmountInput(String(sf.waived_amount || 0));
                          setWaiveModalOpen(true);
                        }}
                        className="h-8 min-h-0 px-3 bg-[#FBBF24]/10 border border-[#FBBF24]/20 text-[#FBBF24] font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer"
                      >
                        Waive
                      </button>
                    </div>
                  </div>
                ))}

                {/* Pending Leaves */}
                {pendingLeaves.map(lv => (
                  <div key={lv.id} className="bg-black/25 border border-white/5 rounded-xl p-3 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-white">Leave Request ({new Date(lv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })})</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Reason: "{lv.reason || 'No reason provided'}"</p>
                    </div>
                    <div className="flex space-x-1.5">
                      <button 
                        onClick={() => handleApproveLeave(lv)}
                        className="h-8 min-h-0 px-3 bg-[#4ADE80] text-black font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleRejectLeave(lv)}
                        className="h-8 min-h-0 px-3 bg-[#F87171]/10 border border-[#F87171]/20 text-[#F87171] font-bold rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-semibold text-[#555555]">No pending actions required.</p>
            )}

            {/* Audit Logs section inside Pending Actions Panel */}
            {auditLogs.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[rgba(251,191,36,0.15)] space-y-2">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-[#555555] section-label">Recent Profile Activity Logs</h3>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="bg-black/10 border border-white/5 rounded-lg p-2.5 flex flex-col space-y-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                      <div className="flex justify-between">
                        <span className="text-white font-bold">{log.action.replace(/_/g, ' ')}</span>
                        <span className="text-[9px] text-[var(--text-muted)]">{new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-[9px] text-[var(--text-muted)]">By: {log.performed_by} ({log.performed_by_role})</p>
                      {log.reason && <p className="text-white/80 italic font-medium mt-0.5">"{log.reason}"</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Profile summary block */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-5 shadow-sm space-y-4">
        <div className="flex items-center space-x-4">
          {/* Avatar (80px) */}
          <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 text-white text-3xl font-bold flex items-center justify-center flex-shrink-0">
            {staff.name.charAt(0).toUpperCase()}
          </div>
          
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <span className="bg-[rgba(96,165,250,0.12)] border border-[rgba(96,165,250,0.2)] text-[#60A5FA] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 uppercase">
                <Briefcase size={10} />
                {staff.department}
              </span>
              <span className="bg-[rgba(74,222,128,0.12)] border border-[rgba(74,222,128,0.2)] text-[#4ADE80] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 uppercase">
                <MapPin size={10} />
                {staff.branch_id === 'daily' ? 'Daily' : 'Hypermarket'}
              </span>
              <span className="bg-white/10 border border-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 uppercase">
                OT: {staff.ot_threshold_minutes || 30}m
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] font-semibold flex items-center gap-1">
              <Clock size={12} className="text-[var(--text-muted)]" />
              <span>
                Shift:{' '}
                {staff.shift
                  ? (staff.shift.label.includes('AM') || staff.shift.label.includes('PM') || staff.shift.label.includes('–'))
                    ? staff.shift.label
                    : `${staff.shift.label} (${formatTime12hr(staff.shift.start_time)} - ${formatTime12hr(staff.shift.end_time)})`
                  : 'No Shift'}
              </span>
            </p>
            <p className="text-[11px] text-[var(--text-muted)] font-bold">
              Joined: {new Date(staff.join_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Quick Month Selector */}
        <div className="flex items-center justify-between border-t border-[var(--border-strong)] pt-3.5">
          <span className="text-xs font-bold text-[#555555] uppercase tracking-wider section-label">Select Month</span>
          <div className="flex items-center space-x-1.5 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-2 py-1">
            <button onClick={handlePrevMonth} className="p-1 text-[var(--text-secondary)] hover:text-white active:scale-90">
              <ChevronLeft size={16} />
            </button>
            <span className="text-[11px] font-extrabold text-[#1A1A1A] font-mono uppercase px-1">
              {new Date(selectedMonth + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
            <button onClick={handleNextMonth} className="p-1 text-[var(--text-secondary)] hover:text-white active:scale-90">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-4 gap-2.5">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-2.5 text-center flex flex-col items-center">
            <span className="text-xs font-bold text-[#2D7A3A] font-mono leading-none">{monthStats.present}</span>
            <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1.5 leading-none">Present</span>
          </div>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-2.5 text-center flex flex-col items-center">
            <span className="text-xs font-bold text-[#B8860B] font-mono leading-none">{monthStats.late}</span>
            <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1.5 leading-none">Late</span>
          </div>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-2.5 text-center flex flex-col items-center">
            <span className="text-xs font-bold text-[#C0392B] font-mono leading-none">{monthStats.absent}</span>
            <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1.5 leading-none">Absent</span>
          </div>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-2.5 text-center flex flex-col items-center">
            <span className="text-xs font-bold text-[#1A5FA8] font-mono leading-none">{monthStats.otHours}h</span>
            <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1.5 leading-none">OT Hours</span>
          </div>
        </div>

        {/* Weekly Off Balance Banner */}
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3 flex justify-between items-center text-xs font-bold text-[var(--text-secondary)]">
          <span className="uppercase text-[9px] tracking-wider text-[var(--text-muted)]">Weekly Off Balance</span>
          <span className="text-[#1A1A1A] font-extrabold font-mono">
            {staff?.pay_type === 'hourly' ? 'N/A — Hourly' : staff?.is_trial ? 'N/A — Trial' : `${weeklyOffStats.earnedQuota} Earned | ${weeklyOffStats.weeklyOffsUsed} Used | ${weeklyOffStats.weeklyOffsRemaining} Remaining`}
          </span>
        </div>

        {/* Performance Score Bar (ops_manager and Head HR staff_executive only, hidden for admin) */}
        {user?.role !== 'admin' && (user?.role === 'ops_manager' || (user?.role === 'staff_executive' && user.branch === null)) && (
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Performance Score</span>
                <div className="flex items-baseline space-x-1.5 mt-0.5">
                  <span className="text-lg font-black text-white font-mono leading-none">
                    {staff?.pay_type === 'hourly' || staff?.is_trial ? 'N/A' : (perfScore?.total_score ?? '—')}
                  </span>
                  {staff?.pay_type !== 'hourly' && !staff?.is_trial && <span className="text-[10px] text-[var(--text-secondary)] font-bold">/ 100</span>}
                </div>
              </div>
              {staff?.pay_type === 'hourly' || staff?.is_trial ? (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wide text-blue-400 bg-blue-500/10">
                  {staff?.is_trial ? 'Trial Staff' : 'Hourly Staff'}
                </span>
              ) : perfScore ? (
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wide ${getPerfGrade(perfScore.total_score).color} ${getPerfGrade(perfScore.total_score).bg}`}>
                  {getPerfGrade(perfScore.total_score).label}
                </span>
              ) : null}
            </div>
            {staff?.pay_type === 'hourly' || staff?.is_trial ? (
              <p className="text-[9px] text-[var(--text-muted)] italic mt-2.5">{staff?.is_trial ? 'N/A — Trial' : 'N/A — Hourly'}</p>
            ) : perfScore ? (
              <div className="w-full bg-black/35 h-1.5 rounded-full overflow-hidden mt-2.5 border border-white/5">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${getPerfGrade(perfScore.total_score).bar}`}
                  style={{ width: `${perfScore.total_score}%` }}
                />
              </div>
            ) : (
              <p className="text-[9px] text-[var(--text-muted)] italic mt-2.5">No performance score calculated for this month.</p>
            )}
          </div>
        )}
      </div>

      {/* Tabs list (horizontal scrollable) */}
      <div className="flex bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-1 overflow-x-auto scrollbar-none select-none">
        {[
          { id: 'attendance', label: 'Attend' },
          { id: 'fines', label: 'Fines' },
          { id: 'leaves', label: 'Leaves' },
          { id: 'salary', label: 'Salary' },
          { id: 'breaks', label: 'Breaks' },
          ...(user?.role === 'ops_manager' ? [{ id: 'notes', label: 'Notes' }] : [])
        ].map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabName)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-[9px] text-xs transition-all uppercase tracking-wide cursor-pointer ${
                isSelected
                  ? 'bg-white text-[#1A1A1A] font-extrabold shadow-xs'
                  : 'text-[#555555] font-semibold hover:text-[#1A1A1A] hover:bg-white/5 active:scale-95'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div className="min-h-[200px]">

        {/* Tab 1: Attendance Grid */}
        {activeTab === 'attendance' && (
          <div className="space-y-4">
            <div 
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-4"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <div className="grid grid-cols-7 gap-1.5 text-center mb-3">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((h, i) => (
                  <span key={i} className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                    {h}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {calendarDays.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} className="aspect-square" />;
                  }

                  const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
                  const record = attendance.find(a => a.date === dateStr);
                  const isFuture = new Date(dateStr + 'T00:00:00') > new Date();

                  // Determine styling classes
                  let cellClass = "aspect-square rounded-xl flex items-center justify-center text-xs font-extrabold transition-all border ";
                  let dotColor = null;

                  if (isFuture) {
                    cellClass += "bg-transparent border-[var(--border)] text-[var(--text-muted)] opacity-35 cursor-not-allowed";
                  } else if (staff?.pay_type === 'hourly') {
                    if (record && record.check_in_time) {
                      cellClass += "bg-[rgba(96,165,250,0.12)] border-[rgba(96,165,250,0.25)] text-[#3B82F6] hover:bg-[rgba(96,165,250,0.2)]";
                      dotColor = "bg-[#3B82F6]";
                    } else {
                      cellClass += "bg-[rgba(107,114,128,0.06)] border-[rgba(107,114,128,0.12)] text-[var(--text-muted)] hover:bg-[rgba(107,114,128,0.12)]";
                      dotColor = "bg-[#6B7280]";
                    }
                  } else if (record) {
                    if (record.day_type === 'weekly_off') {
                      cellClass += "bg-[rgba(96,165,250,0.12)] border-[rgba(96,165,250,0.25)] text-[#60A5FA] hover:bg-[rgba(96,165,250,0.2)]";
                      dotColor = "bg-[#60A5FA]";
                    } else if (record.day_type === 'holiday') {
                      cellClass += "bg-[rgba(167,139,250,0.12)] border-[rgba(167,139,250,0.25)] text-[#A78BFA] hover:bg-[rgba(167,139,250,0.2)]";
                      dotColor = "bg-[#A78BFA]";
                    } else if (record.day_type === 'leave') {
                      cellClass += "bg-[rgba(251,146,60,0.12)] border-[rgba(251,146,60,0.25)] text-[#FB923C] hover:bg-[rgba(251,146,60,0.2)]";
                      dotColor = "bg-[#FB923C]";
                    } else if (record.status === 'present' || record.status === 'late') {
                      if (record.color_code === 'green') {
                        cellClass += "bg-[rgba(74,222,128,0.12)] border-[rgba(74,222,128,0.25)] text-[#4ADE80] hover:bg-[rgba(74,222,128,0.2)]";
                        dotColor = "bg-[#4ADE80]";
                      } else if (record.color_code === 'yellow') {
                        cellClass += "bg-[rgba(251,191,36,0.12)] border-[rgba(251,191,36,0.25)] text-[#FBBF24] hover:bg-[rgba(251,191,36,0.2)]";
                        dotColor = "bg-[#FBBF24]";
                      } else if (record.color_code === 'orange') {
                        cellClass += "bg-[rgba(251,146,60,0.12)] border-[rgba(251,146,60,0.25)] text-[#FB923C] hover:bg-[rgba(251,146,60,0.2)]";
                        dotColor = "bg-[#FB923C]";
                      } else if (record.color_code === 'red') {
                        cellClass += "bg-[rgba(248,113,113,0.12)] border-[rgba(248,113,113,0.25)] text-[#F87171] hover:bg-[rgba(248,113,113,0.2)]";
                        dotColor = "bg-[#F87171]";
                      }
                    } else {
                      // Absent record exists
                      cellClass += "bg-[rgba(107,114,128,0.12)] border-[rgba(107,114,128,0.25)] text-[#6B7280] hover:bg-[rgba(107,114,128,0.2)]";
                      dotColor = "bg-[#6B7280]";
                    }
                  } else {
                    // No attendance record. Check leave
                    const isLeaveApproved = leaves.some(l => l.date === dateStr && l.status === 'approved');

                    if (isLeaveApproved) {
                      cellClass += "bg-[rgba(96,165,250,0.1)] border-[rgba(96,165,250,0.2)] text-[#60A5FA] hover:bg-[rgba(96,165,250,0.15)]";
                    } else {
                      // Past day with no check-in -> Absent
                      cellClass += "bg-[rgba(248,113,113,0.06)] border-[rgba(248,113,113,0.12)] text-[var(--text-muted)] hover:bg-[rgba(248,113,113,0.12)]";
                      dotColor = "bg-[#F87171]";
                    }
                  }

                  const handleDayClick = () => {
                    if (isFuture) return;
                    
                    const dayBreaks = breaks.filter(b => b.date === dateStr);
                    const dayFines = [
                      ...lateFines.filter(f => f.date === dateStr),
                      ...specialFines.filter(f => f.date === dateStr)
                    ];

                    setSelectedDayDetail({
                      day,
                      dateStr,
                      record: record || null,
                      dayBreaks,
                      dayFines
                    });
                  };

                  return (
                    <button
                      key={day}
                      onClick={handleDayClick}
                      disabled={isFuture}
                      className={cellClass}
                    >
                      <div className="flex flex-col items-center justify-between py-1 h-full w-full relative">
                        {record && (record.override_shift_start || record.override_shift_end) && (
                          <span className="absolute top-0.5 right-0.5 bg-blue-500 text-white rounded-full w-2.5 h-2.5 flex items-center justify-center text-[7px] font-black leading-none" title="Shift Override Active">
                            O
                          </span>
                        )}
                        <span>{day}</span>
                        {staff?.pay_type === 'hourly' ? (
                          record?.check_in_time ? (
                            <span className="text-[7.5px] font-black leading-none font-mono">
                              {Number(record.total_hours_logged || 0).toFixed(1)}h
                            </span>
                          ) : (
                            <span className="text-[7.5px] text-[var(--text-muted)] font-mono leading-none">0h</span>
                          )
                        ) : (
                          dotColor && <span className={`w-1 h-1 rounded-full ${dotColor}`} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Calendar legend */}
            {staff?.pay_type === 'hourly' ? (
              <div className="flex flex-wrap gap-3 items-center justify-center text-[10px] font-bold text-[var(--text-secondary)]">
                <div className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#3B82F6]/15 border border-[#3B82F6]/30 inline-block" />
                  <span>Hours Logged</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#6B7280]/15 border border-[#6B7280]/30 inline-block" />
                  <span>No Work Logged</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3 items-center justify-center text-[10px] font-bold text-[var(--text-secondary)]">
                <div className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#4ADE80]/15 border border-[#4ADE80]/30 inline-block" />
                  <span>Present</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#FBBF24]/15 border border-[#FBBF24]/30 inline-block" />
                  <span>Late</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#F87171]/15 border border-[#F87171]/30 inline-block" />
                  <span>Absent</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded border border-dashed border-[var(--border-strong)] inline-block" />
                  <span>OFF Day</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="w-2.5 h-2.5 rounded bg-[#60A5FA]/15 border border-[#60A5FA]/30 inline-block" />
                  <span>Approved Leave</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Fines */}
        {activeTab === 'fines' && (
          <div className="space-y-4">
            
            {/* Fine metrics */}
            <div className="grid grid-cols-2 gap-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-4">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Late Fines Total</span>
                <p className="text-base font-extrabold text-white font-mono mt-0.5">
                  ₹{lateFines.filter(f => f.confirmed).reduce((sum, f) => sum + (f.waived ? 0 : (Number(f.fine_amount) - Number(f.waived_amount || 0))), 0).toLocaleString('en-IN')}
                </p>
              </div>
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Special Fines Total</span>
                <p className="text-base font-extrabold text-white font-mono mt-0.5">
                  ₹{specialFines.filter(f => f.confirmed).reduce((sum, f) => sum + (f.waived ? 0 : (Number(f.amount) - Number(f.waived_amount || 0))), 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Actions Bar */}
            {user?.role !== 'admin' && (user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
              <button 
                onClick={() => setFineModalOpen(true)}
                className="w-full min-h-[44px] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-strong)] hover:border-white/20 active:scale-98 transition-all rounded-xl text-xs font-bold text-white flex items-center justify-center space-x-2"
              >
                <Plus size={16} />
                <span>Issue Special Fine</span>
              </button>
            )}

            {/* Daily Late Fines */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Late Fines list</h3>
              {lateFines.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] text-center">No late fines this month.</p>
              ) : (
                lateFines.map(fine => (
                  <div 
                    key={fine.id} 
                    onClick={() => {
                      if (user?.role === 'staff_executive') return; // disabled for HR role
                      setSelectedFineForWaive({
                        id: fine.id,
                        type: 'late',
                        date: fine.date,
                        originalAmount: fine.fine_amount,
                        waivedAmount: fine.waived_amount || 0
                      });
                      setWaivedAmountInput(String(fine.waived_amount || 0));
                      setWaiveModalOpen(true);
                    }}
                    className={`bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 flex justify-between items-center ${user?.role !== 'staff_executive' ? 'cursor-pointer hover:border-white/20 hover:bg-white/5 active:scale-99' : ''} transition-all`}
                  >
                    <div>
                      <p className="text-xs font-bold text-white">{new Date(fine.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                      <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">{fine.late_minutes} mins late • Code {fine.color_code.toUpperCase()}</p>
                    </div>
                    <div className="text-right">
                      {fine.waived_amount && fine.waived_amount > 0 ? (
                        <div className="text-[10px] font-medium text-[var(--text-muted)] space-y-0.5">
                          <p className="line-through">Original: ₹{fine.fine_amount}</p>
                          <p className="text-[#A93226]">Waived: -₹{fine.waived_amount}</p>
                          <p className="text-white font-black font-mono">Deducted: ₹{Math.max(0, fine.fine_amount - fine.waived_amount)}</p>
                        </div>
                      ) : (
                        <p className="text-xs font-black text-white font-mono">₹{fine.fine_amount}</p>
                      )}
                      <span className={`inline-block text-[8px] font-black uppercase mt-1 px-1.5 py-0.25 rounded-sm ${
                        fine.waived 
                          ? 'bg-[#9CA3AF]/10 text-[#9CA3AF]' 
                          : fine.waived_amount && fine.waived_amount > 0
                            ? 'bg-[#FB923C]/10 text-[#FB923C]'
                            : fine.confirmed 
                              ? 'bg-[#4ADE80]/10 text-[#4ADE80]' 
                              : 'bg-[#FBBF24]/10 text-[#FBBF24]'
                      }`}>
                        {fine.waived ? `Waived (${fine.waived_by || 'Management'})` : fine.waived_amount && fine.waived_amount > 0 ? `Partially Waived` : fine.confirmed ? 'Confirmed' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Special Fines */}
            <div className="space-y-2 mt-4">
              <h3 className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Special Fines list</h3>
              {specialFines.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] text-center">No special fines this month.</p>
              ) : (
                specialFines.map(fine => (
                  <div 
                    key={fine.id} 
                    onClick={() => {
                      if (user?.role === 'staff_executive') return; // disabled for HR role
                      setSelectedFineForWaive({
                        id: fine.id,
                        type: 'special',
                        date: fine.date,
                        originalAmount: fine.amount,
                        waivedAmount: fine.waived_amount || 0,
                        reason: fine.reason
                      });
                      setWaivedAmountInput(String(fine.waived_amount || 0));
                      setWaiveModalOpen(true);
                    }}
                    className={`bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 flex justify-between items-start ${user?.role !== 'staff_executive' ? 'cursor-pointer hover:border-white/20 hover:bg-white/5 active:scale-99' : ''} transition-all`}
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-xs font-bold text-white">{new Date(fine.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                      <p className="text-[10px] text-[var(--text-secondary)] font-semibold mt-1 bg-[var(--bg-elevated)] p-2 rounded-lg border border-[var(--border-strong)] leading-relaxed italic">
                        "{fine.reason}"
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {fine.waived_amount && fine.waived_amount > 0 ? (
                        <div className="text-[10px] font-medium text-[var(--text-muted)] space-y-0.5">
                          <p className="line-through">Original: ₹{fine.amount}</p>
                          <p className="text-[#A93226]">Waived: -₹{fine.waived_amount}</p>
                          <p className="text-white font-black font-mono">Deducted: ₹{Math.max(0, fine.amount - fine.waived_amount)}</p>
                        </div>
                      ) : (
                        <p className="text-xs font-black text-white font-mono">₹{fine.amount}</p>
                      )}
                      <span className={`inline-block text-[8px] font-black uppercase mt-1 px-1.5 py-0.25 rounded-sm ${
                        fine.waived 
                          ? 'bg-[#9CA3AF]/10 text-[#9CA3AF]' 
                          : fine.waived_amount && fine.waived_amount > 0
                            ? 'bg-[#FB923C]/10 text-[#FB923C]'
                            : fine.confirmed 
                              ? 'bg-[#4ADE80]/10 text-[#4ADE80]' 
                              : 'bg-[#FBBF24]/10 text-[#FBBF24]'
                      }`}>
                        {fine.waived ? `Waived (${fine.waived_by || 'Management'})` : fine.waived_amount && fine.waived_amount > 0 ? `Partially Waived` : fine.confirmed ? 'Confirmed' : 'Pending'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Leave Logs */}
        {activeTab === 'leaves' && (
          <div className="space-y-4">
            
            {/* Leave metrics */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-[var(--text-secondary)] uppercase">Leaves Quota Limits</span>
                <span className="text-xs font-black text-white font-mono">{staff.off_days_per_month} days / Month</span>
              </div>

              {/* Check if quota exceeded */}
              {leaves.filter(l => l.status === 'approved' && l.date.substring(0, 7) === selectedMonth).length > staff.off_days_per_month && (
                <div className="bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.15)] text-[#F87171] text-[10px] font-bold p-3 rounded-xl flex items-start gap-2.5 leading-relaxed">
                  <AlertTriangle size={16} className="text-[#F87171] flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold uppercase">Quota Limit Exceeded!</span>
                    <p className="mt-0.5 text-[var(--text-secondary)]">Staff has taken {leaves.filter(l => l.status === 'approved' && l.date.substring(0, 7) === selectedMonth).length} approved leaves, exceeding their allocated {staff.off_days_per_month} off-days quota this month.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Leaves List */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Leave Requests History</h3>
              {leaves.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] text-center">No leave requests logged.</p>
              ) : (
                leaves.map(req => (
                  <div key={req.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 flex justify-between items-start">
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-xs font-bold text-white">{new Date(req.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-1">{req.reason || 'No reason provided'}</p>
                      {req.status === 'approved' && (
                        <p className="text-[8px] text-[var(--text-muted)] font-bold mt-1">Approved by: {req.approved_by || 'HR'}</p>
                      )}
                    </div>
                    <span className={`inline-block text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                      req.status === 'approved' 
                        ? 'bg-[#4ADE80]/10 text-[#4ADE80]' 
                        : req.status === 'rejected' 
                          ? 'bg-[#F87171]/10 text-[#F87171]' 
                          : 'bg-[#FBBF24]/10 text-[#FBBF24]'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Salary History */}
        {activeTab === 'salary' && (
          <div className="space-y-4">
            {!(user?.role === 'admin' || user?.role === 'ops_manager') ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-6 text-center flex flex-col items-center justify-center">
                <Lock size={32} className="text-[var(--text-muted)] mb-2" />
                <h4 className="text-sm font-bold text-white mb-1">Salary Details Locked</h4>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-xs">
                  Salary history is private and visible only to owners and operations managers.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* Indian Rupees format helper */}
                <h3 className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Confirmed Salary Records</h3>
                {salaryConfirmations.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] text-center">No confirmed salary records found in database.</p>
                    
                    {/* Mock breakdown showing dynamic estimate */}
                    {staff.pay_type === 'hourly' ? (
                      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-4 space-y-3.5">
                        <div className="flex justify-between items-center border-b border-[var(--border-strong)] pb-2.5">
                          <div>
                            <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Estimated Month Breakdown (Hourly)</span>
                            <h4 className="text-sm font-extrabold text-white">{new Date(selectedMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h4>
                          </div>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[var(--text-secondary)]">UNCONFIRMED</span>
                        </div>
                        
                        <div className="space-y-2 text-xs font-semibold text-[var(--text-secondary)]">
                          {(() => {
                            const totalHours = attendance.reduce((sum, r) => sum + Number(r.total_hours_logged || 0), 0);
                            const result = calculateHourlySalary(
                              staff.monthly_salary,
                              staff.standard_hours || 234,
                              totalHours
                            );
                            return (
                              <>
                                <div className="flex justify-between">
                                  <span>Total hours logged:</span>
                                  <span className="text-white font-mono">{result.totalHours.toFixed(2)} hrs</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Hourly rate:</span>
                                  <span className="text-white font-mono">₹{result.hourlyRate.toFixed(2)} / hr</span>
                                </div>
                                <div className="flex justify-between border-t border-[var(--border-strong)] pt-2.5 font-bold text-white">
                                  <span>Estimated Net Payout:</span>
                                  <span className="text-white font-mono text-sm font-black">
                                    ₹{result.netSalary.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-4 space-y-3.5">
                        <div className="flex justify-between items-center border-b border-[var(--border-strong)] pb-2.5">
                          <div>
                            <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider">Estimated Month Breakdown</span>
                            <h4 className="text-sm font-extrabold text-white">{new Date(selectedMonth + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h4>
                          </div>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[var(--text-secondary)]">UNCONFIRMED</span>
                        </div>
                        
                        <div className="space-y-2 text-xs font-semibold text-[var(--text-secondary)]">
                          <div className="flex justify-between">
                            <span>Base Salary:</span>
                            <span className="text-white font-mono">₹{Number(staff.monthly_salary).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>OT Payout (Estimated):</span>
                            <span className="text-[#4ADE80] font-mono">+₹{Math.round(monthStats.otHours * (staff.monthly_salary / 240) * 1.5).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Late Fines Confirmed:</span>
                            <span className="text-[#F87171] font-mono">-₹{lateFines.filter(f => f.confirmed).reduce((sum, f) => sum + (f.waived ? 0 : (Number(f.fine_amount) - Number(f.waived_amount || 0))), 0).toLocaleString('en-IN')}</span>
                          </div>
                          {(() => {
                            const totalLateMins = attendance.reduce((sum, a) => sum + (a.late_salary_deduction_minutes || 0), 0);
                            const [yearStr, monthStr] = selectedMonth.split('-');
                            const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
                            const dailyRate = Number(staff.monthly_salary) / daysInMonth;
                            const hourlyRate = dailyRate / (staff.shift?.hours || 9);
                            const lateDedu = calculateLateSalaryDeduction(totalLateMins, hourlyRate);
                            if (lateDedu <= 0) return null;
                            return (
                              <div className="flex justify-between text-[#F87171]">
                                <span>Late Arrival Deductions (permanent):</span>
                                <span className="font-mono">-₹{lateDedu.toLocaleString('en-IN')}</span>
                              </div>
                            );
                          })()}
                          <div className="flex justify-between">
                            <span>Special Fines Confirmed:</span>
                            <span className="text-[#F87171] font-mono">-₹{specialFines.filter(f => f.confirmed).reduce((sum, f) => sum + (f.waived ? 0 : (Number(f.amount) - Number(f.waived_amount || 0))), 0).toLocaleString('en-IN')}</span>
                          </div>
                          {(() => {
                            const [yearStr, monthStr] = selectedMonth.split('-');
                            const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
                            const dailyRate = Number(staff.monthly_salary) / daysInMonth;
                            const totalEarlyMins = attendance.reduce((sum, a) => sum + (a.early_leave_minutes || 0), 0);
                            const earlyLeaveDeduction = calculateEarlyLeaveDeduction(totalEarlyMins, dailyRate, staff.shift?.hours || 9);
                            if (earlyLeaveDeduction <= 0) return null;
                            return (
                              <div className="flex justify-between text-[#F87171]">
                                <span>Early Leave Deductions:</span>
                                <span className="font-mono">-₹{earlyLeaveDeduction.toLocaleString('en-IN')}</span>
                              </div>
                            );
                          })()}
                          <div className="flex justify-between border-t border-[var(--border-strong)] pt-2.5 font-bold text-white">
                            <span>Estimated Net Payout:</span>
                            <span className="text-white font-mono text-sm font-black">
                              ₹{(() => {
                                const [yearStr, monthStr] = selectedMonth.split('-');
                                const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
                                const dailyRate = Number(staff.monthly_salary) / daysInMonth;
                                const totalEarlyMins = attendance.reduce((sum, a) => sum + (a.early_leave_minutes || 0), 0);
                                const earlyLeaveDeduction = calculateEarlyLeaveDeduction(totalEarlyMins, dailyRate, staff.shift?.hours || 9);
                                
                                const totalLateMins = attendance.reduce((sum, a) => sum + (a.late_salary_deduction_minutes || 0), 0);
                                const lateDeduction = calculateLateSalaryDeduction(totalLateMins, dailyRate / (staff.shift?.hours || 9));

                                const lateFinesTotal = lateFines.filter(f => f.confirmed).reduce((sum, f) => sum + (f.waived ? 0 : (Number(f.fine_amount) - Number(f.waived_amount || 0))), 0);
                                const specialFinesTotal = specialFines.filter(f => f.confirmed).reduce((sum, f) => sum + (f.waived ? 0 : (Number(f.amount) - Number(f.waived_amount || 0))), 0);
                                
                                return Math.max(0, 
                                  Number(staff.monthly_salary) + 
                                  Math.round(monthStats.otHours * (staff.monthly_salary / 240) * 1.5) - 
                                  earlyLeaveDeduction -
                                  lateDeduction -
                                  lateFinesTotal -
                                  specialFinesTotal
                                );
                              })().toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  salaryConfirmations.map(sc => (
                    <div key={sc.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-4 space-y-3 shadow-sm">
                      <div className="flex justify-between items-center border-b border-[var(--border-strong)] pb-2.5">
                        <h4 className="text-sm font-extrabold text-white">
                          {new Date(sc.month + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </h4>
                        <span className="text-[10px] font-black text-[#4ADE80] font-mono uppercase bg-[#4ADE80]/10 border border-[#4ADE80]/20 px-2 py-0.5 rounded">CONFIRMED</span>
                      </div>
                      {sc.is_hourly || staff.pay_type === 'hourly' ? (
                        <div className="space-y-2 text-xs font-semibold text-[var(--text-secondary)]">
                          <div className="flex justify-between">
                            <span>Base Salary (monthly):</span>
                            <span className="text-white font-mono">₹{Number(sc.base_salary).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Standard hours:</span>
                            <span className="text-white font-mono">{sc.standard_hours ?? 234} hrs</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total hours logged:</span>
                            <span className="text-white font-mono">{(sc.total_hours_logged ?? 0).toFixed(2)} hrs</span>
                          </div>
                          <div className="flex justify-between border-t border-[var(--border-strong)] pt-2.5 font-bold text-white">
                            <span>Net Paid Out:</span>
                            <span className="text-white font-mono text-sm font-black">₹{Number(sc.net_salary).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 text-xs font-semibold text-[var(--text-secondary)]">
                          <div className="flex justify-between">
                            <span>Base Salary:</span>
                            <span className="text-white font-mono">₹{Number(sc.base_salary).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>OT Paid:</span>
                            <span className="text-[#4ADE80] font-mono">+₹{Number(sc.ot_pay).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Late Fines Deducted:</span>
                            <span className="text-[#F87171] font-mono">-₹{Number(sc.confirmed_fines).toLocaleString('en-IN')}</span>
                          </div>
                          {sc.late_salary_deduction > 0 && (
                            <div className="flex justify-between">
                              <span>Late Arrival Deductions:</span>
                              <span className="text-[#F87171] font-mono">-₹{Number(sc.late_salary_deduction).toLocaleString('en-IN')}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Special Fines Deducted:</span>
                            <span className="text-[#F87171] font-mono">-₹{Number(sc.confirmed_special_fines).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Leave Deductions:</span>
                            <span className="text-[#F87171] font-mono">-₹{Number(sc.leave_deduction).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between border-t border-[var(--border-strong)] pt-2.5 font-bold text-white">
                            <span>Net Paid Out:</span>
                            <span className="text-white font-mono text-sm font-black">₹{Number(sc.net_salary).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Breaks Log */}
        {activeTab === 'breaks' && (
          <div className="space-y-4">
            
            {/* Break metrics */}
            <div className="grid grid-cols-2 gap-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-4">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Breaks Logged</span>
                <p className="text-base font-extrabold text-white font-mono mt-0.5">{breaks.length}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Overstay Duration</span>
                <p className="text-base font-extrabold text-[#FB923C] font-mono mt-0.5">
                  {breaks.reduce((sum, b) => sum + (b.over_minutes || 0), 0)} mins
                </p>
              </div>
            </div>

            {/* Breaks List */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Break Logs History</h3>
              {breaks.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] text-center">No breaks taken this month.</p>
              ) : (
                breaks.map(b => {
                  const hasOverstay = b.over_minutes > 0;
                  const formatTime = (ts: string) => {
                    const d = new Date(ts);
                    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
                  };

                  return (
                    <div key={b.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 flex justify-between items-center shadow-sm">
                      <div>
                        <p className="text-xs font-bold text-white uppercase tracking-wide">
                          {b.break_type.replace('_', ' ')}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] font-bold mt-0.5">
                          {new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} • {formatTime(b.break_start)} – {b.break_end ? formatTime(b.break_end) : 'Open'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-white font-mono">
                          {b.duration_minutes ?? '—'} mins
                        </p>
                        {hasOverstay && (
                          <span className="inline-block text-[8px] font-extrabold uppercase mt-1 px-1 rounded bg-[#FB923C]/10 text-[#FB923C] border border-[#FB923C]/20">
                            +{b.over_minutes}m Overstay
                          </span>
                        )}
                        {b.auto_closed && (
                          <span className="inline-block text-[8px] font-extrabold uppercase mt-1 ml-1 px-1 rounded bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/20">
                            Auto Closed
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 6: Private Notes (ops_manager only) */}
        {activeTab === 'notes' && user?.role === 'ops_manager' && (
          <div className="space-y-4">
            
            {/* Add note CTA */}
            <button 
              onClick={() => setAddNoteModalOpen(true)}
              className="w-full min-h-[44px] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-strong)] hover:border-white/20 active:scale-98 transition-all rounded-xl text-xs font-bold text-white flex items-center justify-center space-x-2"
            >
              <PlusCircle size={16} />
              <span>Add Private Note</span>
            </button>

            {/* Notes List */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Private Notes Logs</h3>
              {notes.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] text-center">No notes added yet.</p>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3.5 space-y-2 relative shadow-sm">
                    <div className="flex justify-between items-start">
                      <span className="text-[9px] font-black uppercase text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded">
                        {note.added_by}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className="text-[9px] font-bold text-[var(--text-muted)] font-mono">
                          {new Date(note.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button 
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-[var(--text-muted)] hover:text-[#F87171] p-0.5 active:scale-90"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-white leading-relaxed whitespace-pre-wrap font-medium">
                      {note.note}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* Note Addition Sheet (Modal) */}
      {addNoteModalOpen && (
        <div className="fixed inset-0 z-[12000] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddNoteModalOpen(false)} />
          <div className="bg-[var(--bg-surface)] rounded-t-3xl shadow-2xl relative z-10 p-5 w-full max-w-md border-t border-[var(--border-strong)] animate-slide-up flex flex-col space-y-4">
            <div className="w-12 h-1 bg-[var(--border-strong)] rounded-full mx-auto flex-shrink-0" />
            <div className="flex justify-between items-center pb-1">
              <h3 className="text-white text-base font-bold">Add Private Note</h3>
              <button onClick={() => setAddNoteModalOpen(false)} className="text-[var(--text-secondary)] hover:text-white p-1">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddNote} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1.5">Note details</label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Type anything from behavior, performance issues, special instructions, background reviews..."
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl p-3.5 text-xs text-white focus:outline-none focus:border-white/30 min-h-[120px] leading-relaxed"
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={isSubmittingNote}
                className="w-full min-h-[44px] bg-white text-[#1E2028] hover:bg-white/95 font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center"
              >
                {isSubmittingNote ? 'Saving...' : 'Save Private Note'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Special Fine Bottom Sheet */}
      <SpecialFineBottomSheet
        isOpen={fineModalOpen}
        onClose={() => setFineModalOpen(false)}
        staffId={staff.id}
        staffName={staff.name}
        branchId={staff.branch_id}
        onSuccess={(msg) => {
          showToast(msg);
          fetchMonthData(); // Reload fines list
        }}
      />

      {selectedDayDetail && (() => {
        const d = new Date(selectedDayDetail.dateStr + 'T00:00:00');
        const today = new Date();
        const isFuture = d > today;

        const isWithinLast4Months = (dateStr: string) => {
          const targetDate = new Date(dateStr + 'T00:00:00');
          const now = new Date();
          const diffMonths = (now.getFullYear() - targetDate.getFullYear()) * 12 + (now.getMonth() - targetDate.getMonth());
          return diffMonths >= 0 && diffMonths <= 3;
        };

        const isAdminOps = user?.role === 'admin' || user?.role === 'ops_manager';
        const isHR = user?.role === 'staff_executive';

        const canEdit = !isFuture && isWithinLast4Months(selectedDayDetail.dateStr) && (isAdminOps || isHR);

        return (
          <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-xs" onClick={() => { setSelectedDayDetail(null); setIsEditingAttendance(false); }} />
            <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl p-5 shadow-2xl relative z-10 w-full max-w-sm space-y-4 max-h-[85vh] overflow-y-auto">
              
              <div className="flex justify-between items-start border-b border-[var(--border-strong)] pb-3">
                <div>
                  <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    {isEditingAttendance ? 'Edit Attendance' : 'Check-in detail'}
                  </span>
                  <h4 className="text-sm font-extrabold text-white">
                    {new Date(selectedDayDetail.dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h4>
                </div>
                <button onClick={() => { setSelectedDayDetail(null); setIsEditingAttendance(false); }} className="text-[var(--text-secondary)] hover:text-white p-1">
                  <X size={18} />
                </button>
              </div>

              {isEditingAttendance ? (
                <form onSubmit={handleSaveAttendance} className="space-y-4 text-xs font-semibold text-white">
                  <div className="space-y-3">
                    {isHR ? (
                      <>
                        <div className="bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.18)] text-[#FBBF24] p-2.5 rounded-lg text-[10px] leading-relaxed">
                          Note: Branch HR can only mark Weekly Offs, Leaves, or keep Absent.
                        </div>

                        <div>
                          <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Mark As</label>
                          <select
                            value={editDayType === 'weekly_off' ? 'weekly_off' : (editDayType === 'leave' ? 'leave' : 'absent')}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'weekly_off') {
                                setEditDayType('weekly_off');
                                setEditStatus('present');
                                setEditCheckIn('');
                                setEditCheckOut('');
                              } else if (val === 'leave') {
                                const confirmed = window.confirm('Are you sure you want to mark this day as Leave? 1 day salary will be deducted.');
                                if (confirmed) {
                                  setEditDayType('leave');
                                  setEditStatus('present');
                                  setEditCheckIn('');
                                  setEditCheckOut('');
                                } else {
                                  e.target.value = editDayType === 'weekly_off' ? 'weekly_off' : 'absent';
                                }
                              } else {
                                setEditDayType('present');
                                setEditStatus('absent');
                                setEditCheckIn('');
                                setEditCheckOut('');
                              }
                            }}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl p-2.5 text-xs focus:outline-none focus:border-white/30 text-white"
                          >
                            <option value="weekly_off">Mark Weekly Off</option>
                            <option value="leave">Mark Approved Leave (salary deducted)</option>
                            <option value="absent">Keep Absent</option>
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Day Type</label>
                          <select
                            value={editDayType}
                            onChange={(e) => {
                              setEditDayType(e.target.value);
                              if (e.target.value !== 'present') {
                                setEditCheckIn('');
                                setEditCheckOut('');
                                setEditStatus('present');
                              }
                            }}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl p-2.5 text-xs focus:outline-none focus:border-white/30 text-white"
                          >
                            <option value="present">Present / Shift Day</option>
                            <option value="weekly_off">Weekly Off</option>
                            <option value="holiday">Public Holiday</option>
                            <option value="leave">Approved Leave</option>
                          </select>
                        </div>

                        {editDayType === 'present' && (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Check In Time</label>
                                <input
                                  type="time"
                                  value={editCheckIn}
                                  onChange={(e) => setEditCheckIn(e.target.value)}
                                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Check Out Time</label>
                                <input
                                  type="time"
                                  value={editCheckOut}
                                  onChange={(e) => setEditCheckOut(e.target.value)}
                                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-white/30"
                                />
                              </div>
                            </div>

                             <div>
                              <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Status Override</label>
                              <select
                                value={editStatus}
                                onChange={(e: any) => setEditStatus(e.target.value)}
                                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl p-2.5 text-xs focus:outline-none focus:border-white/30 text-white"
                              >
                                <option value="present">Present</option>
                                <option value="late">Late</option>
                                <option value="absent">Absent</option>
                              </select>
                            </div>

                            <div className="space-y-3 border-t border-[var(--border-strong)] pt-3">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider">Override shift for this day only</label>
                                <input
                                  type="checkbox"
                                  checked={overrideShift}
                                  onChange={(e) => setOverrideShift(e.target.checked)}
                                  className="w-4 h-4 accent-white rounded bg-[var(--bg-input)] border border-[var(--border)]"
                                />
                              </div>
                              
                              {overrideShift && (
                                <div className="space-y-3 bg-[var(--bg-input)] p-3 rounded-xl border border-[var(--border-strong)]">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[9px] font-bold text-[var(--text-secondary)] mb-1">Shift Start</label>
                                      <input
                                        type="time"
                                        value={overrideStart}
                                        onChange={(e) => setOverrideStart(e.target.value)}
                                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg p-2 text-xs text-white focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9px] font-bold text-[var(--text-secondary)] mb-1">Shift End</label>
                                      <input
                                        type="time"
                                        value={overrideEnd}
                                        onChange={(e) => setOverrideEnd(e.target.value)}
                                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg p-2 text-xs text-white focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-[var(--text-secondary)] mb-1">Reason</label>
                                    <input
                                      type="text"
                                      value={overrideReason}
                                      onChange={(e) => setOverrideReason(e.target.value)}
                                      placeholder="Reason for shift override"
                                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg p-2 text-xs text-white focus:outline-none"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex space-x-2 pt-2 border-t border-[var(--border-strong)]">
                    <button
                      type="submit"
                      disabled={isSavingAttendance}
                      className="flex-1 min-h-[38px] bg-white text-[#1E2028] hover:bg-white/95 font-bold text-[11px] rounded-lg active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                    >
                      {isSavingAttendance ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingAttendance(false)}
                      className="flex-1 min-h-[38px] bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-white hover:bg-white/5 font-bold text-[11px] rounded-lg active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {selectedDayDetail.record ? (
                    <div className="space-y-4">
                      {/* Times & Photos */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* IN Info */}
                        <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3 flex flex-col items-center">
                          <span className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-wider">CHECK IN</span>
                          <span className="text-base font-extrabold text-[#4ADE80] font-mono mt-1">
                            {formatTime12hr(selectedDayDetail.record.check_in_time) || '—'}
                          </span>
                          {selectedDayDetail.record.check_in_photo ? (
                            user?.role === 'nearbi_homes_supervisor' ? (
                              <div className="w-10 h-10 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mt-2 border border-white/15">
                                <User size={18} />
                              </div>
                            ) : (
                              <div className="relative">
                                <button 
                                  onClick={() => setSelectedPhoto({ 
                                    url: selectedDayDetail.record!.check_in_photo!, 
                                    title: 'Check In Selfie',
                                    name: staff?.name,
                                    date: selectedDayDetail.record!.date,
                                    label: 'Check In Photo',
                                    attendanceId: selectedDayDetail.record!.id,
                                    photo_flagged: selectedDayDetail.record!.photo_flagged,
                                    photo_flag_reason: selectedDayDetail.record!.photo_flag_reason || undefined,
                                    photo_flagged_by: selectedDayDetail.record!.photo_flagged_by || undefined
                                  })}
                                  className={`w-10 h-10 rounded-full overflow-hidden mt-2 border cursor-pointer hover:border-white transition-all active:scale-95 ${
                                    selectedDayDetail.record.photo_flagged ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-[#4ADE80]/30'
                                  }`}
                                >
                                  <img src={selectedDayDetail.record.check_in_photo} alt="IN" className="w-full h-full object-cover" />
                                </button>
                                {selectedDayDetail.record.photo_flagged && (
                                  <span className="absolute top-1.5 -right-0.5 bg-amber-500 text-white rounded-full w-4.5 h-4.5 flex items-center justify-center border border-white shadow">
                                    <Flag size={9} fill="currentColor" />
                                  </span>
                                )}
                              </div>
                            )
                          ) : (
                            <span className="text-[9px] text-[var(--text-muted)] italic mt-2.5">No photo</span>
                          )}
                        </div>
                        {/* OUT Info */}
                        <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3 flex flex-col items-center">
                          <span className="text-[8px] text-[var(--text-muted)] font-black uppercase tracking-wider">CHECK OUT</span>
                          <span className="text-base font-extrabold text-[#60A5FA] font-mono mt-1">
                            {formatTime12hr(selectedDayDetail.record.check_out_time) || '—'}
                          </span>
                          {selectedDayDetail.record.check_out_photo ? (
                            user?.role === 'nearbi_homes_supervisor' ? (
                              <div className="w-10 h-10 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center mt-2 border border-white/15">
                                <User size={18} />
                              </div>
                            ) : (
                              <div className="relative">
                                <button 
                                  onClick={() => setSelectedPhoto({ 
                                    url: selectedDayDetail.record!.check_out_photo!, 
                                    title: 'Check Out Selfie',
                                    name: staff?.name,
                                    date: selectedDayDetail.record!.date,
                                    label: 'Check Out Photo',
                                    attendanceId: selectedDayDetail.record!.id,
                                    photo_flagged: selectedDayDetail.record!.photo_flagged,
                                    photo_flag_reason: selectedDayDetail.record!.photo_flag_reason || undefined,
                                    photo_flagged_by: selectedDayDetail.record!.photo_flagged_by || undefined
                                  })}
                                  className={`w-10 h-10 rounded-full overflow-hidden mt-2 border cursor-pointer hover:border-white transition-all active:scale-95 ${
                                    selectedDayDetail.record.photo_flagged ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-[#60A5FA]/30'
                                  }`}
                                >
                                  <img src={selectedDayDetail.record.check_out_photo} alt="OUT" className="w-full h-full object-cover" />
                                </button>
                                {selectedDayDetail.record.photo_flagged && (
                                  <span className="absolute top-1.5 -right-0.5 bg-amber-500 text-white rounded-full w-4.5 h-4.5 flex items-center justify-center border border-white shadow">
                                    <Flag size={9} fill="currentColor" />
                                  </span>
                                )}
                              </div>
                            )
                          ) : (
                            <span className="text-[9px] text-[var(--text-muted)] italic mt-2.5">No photo</span>
                          )}
                        </div>
                      </div>

                      {/* Performance stats */}
                      <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3.5 space-y-2 text-xs font-semibold text-[var(--text-secondary)]">
                        <div className="flex justify-between">
                          <span>Status Badge:</span>
                          <span className={`capitalize font-bold ${
                            selectedDayDetail.record.status === 'present' 
                              ? 'text-[#4ADE80]' 
                              : selectedDayDetail.record.status === 'late' 
                                ? 'text-[#FBBF24]' 
                                : 'text-[#F87171]'
                          }`}>
                            {selectedDayDetail.record.status}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Day Type:</span>
                          <span className="text-white capitalize">{selectedDayDetail.record.day_type || 'present'}</span>
                        </div>
                        {staff?.pay_type === 'hourly' ? (
                          <div className="flex justify-between border-t border-[var(--border-strong)] pt-2 mt-1">
                            <span>Hours Logged Today:</span>
                            <span className="text-[#60A5FA] font-mono font-bold">
                              {Number(selectedDayDetail.record.total_hours_logged || 0).toFixed(2)} hours
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between">
                              <span>Late Minutes:</span>
                              <span className="text-white font-mono">{selectedDayDetail.record.minutes_late} mins</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Actual Hours Worked:</span>
                              <span className="text-white font-mono">{selectedDayDetail.record.actual_hours_worked} hours</span>
                            </div>
                            <div className="flex justify-between border-t border-[var(--border-strong)] pt-2 mt-1">
                              <span>OT Minutes:</span>
                              <span className="text-white font-mono">{selectedDayDetail.record.ot_minutes} mins ({selectedDayDetail.record.ot_approved ? 'Approved' : 'Pending'})</span>
                            </div>
                            {(selectedDayDetail.record.early_leave_minutes ?? 0) > 0 && (
                              <>
                                <div className="flex justify-between border-t border-[var(--border-strong)] pt-2 mt-1 text-[#F87171]">
                                  <span>Early Leave Duration:</span>
                                  <span className="font-mono">{selectedDayDetail.record.early_leave_minutes} mins</span>
                                </div>
                                <div className="flex justify-between text-[#F87171]">
                                  <span>Early Leave Deduction:</span>
                                  <span className="font-mono">
                                    -₹{(() => {
                                      const salary = staff?.monthly_salary || 0;
                                      const shiftHours = staff?.shift?.hours || 9;
                                      const [yr, mo] = selectedDayDetail.dateStr.split('-').map(Number);
                                      const calendarDays = new Date(yr, mo, 0).getDate();
                                      const dailyRate = salary / calendarDays;
                                      return calculateEarlyLeaveDeduction(selectedDayDetail.record.early_leave_minutes ?? 0, dailyRate, shiftHours);
                                    })()}
                                  </span>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>

                      {selectedDayDetail.record.override_shift_start && (
                        <div className="bg-[rgba(59,130,246,0.08)] border border-[rgba(59,130,246,0.2)] rounded-xl p-3.5 space-y-2 text-xs font-semibold text-[var(--text-secondary)]">
                          <div className="text-white font-extrabold uppercase text-[9px] tracking-wider border-b border-[var(--border-strong)] pb-1.5 mb-1.5 flex items-center justify-between">
                            <span>Shift Override Active</span>
                            <span className="bg-sky-500 text-white rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase">O</span>
                          </div>
                          <div className="flex justify-between text-white font-bold">
                            <span>Override Shift:</span>
                            <span className="font-mono">{selectedDayDetail.record.override_shift_start} – {selectedDayDetail.record.override_shift_end}</span>
                          </div>
                          {selectedDayDetail.record.override_reason && (
                            <div className="flex justify-between">
                              <span>Reason:</span>
                              <span className="italic">"{selectedDayDetail.record.override_reason}"</span>
                            </div>
                          )}
                          {selectedDayDetail.record.override_approved_by && (
                            <div className="flex justify-between">
                              <span>Approved By:</span>
                              <span>{selectedDayDetail.record.override_approved_by}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-[var(--border-strong)] pt-2 mt-1 text-[var(--text-muted)] text-[10px]">
                            <span>Normal Shift:</span>
                            <span className="font-mono">{staff?.shift?.start_time || '09:00'} – {staff?.shift?.end_time || '18:00'}</span>
                          </div>
                        </div>
                      )}

                      {/* Day Breaks */}
                      {selectedDayDetail.dayBreaks.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">Breaks taken</span>
                          <div className="space-y-1.5">
                            {selectedDayDetail.dayBreaks.map(db => (
                              <div key={db.id} className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-2 flex justify-between items-center text-[10px] font-bold text-[var(--text-secondary)]">
                                <span className="capitalize">{db.break_type.replace('_', ' ')}</span>
                                <span className="font-mono text-white">{db.duration_minutes ?? '—'} mins {db.over_minutes > 0 && `(⚠️ +${db.over_minutes}m)`}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Day Fines */}
                      {selectedDayDetail.dayFines.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider font-mono text-[#F87171]">Fines Issued</span>
                          <div className="space-y-1.5">
                            {selectedDayDetail.dayFines.map((df: any) => (
                              <div key={df.id} className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-2.5 flex justify-between items-center text-[10px] font-bold">
                                <span className="text-white flex-1 truncate pr-2">{df.reason ? `Special Fine: ${df.reason}` : `Late fine (${df.late_minutes}m)`}</span>
                                <span className="font-mono text-[#F87171] font-extrabold flex-shrink-0">₹{df.fine_amount ?? df.amount} {df.waived && '(Waived)'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <FileMinus size={32} className="text-[var(--text-muted)] mx-auto mb-2" />
                      <p className="text-xs font-bold text-[var(--text-secondary)]">No attendance check-ins logged for this date.</p>
                      {leaves.some(l => l.date === selectedDayDetail.dateStr && l.status === 'approved') ? (
                        <p className="text-[10px] text-[#60A5FA] font-bold mt-1 uppercase tracking-wide">Approved Leave day</p>
                      ) : (
                        <p className="text-[10px] text-[#F87171] font-bold mt-1 uppercase tracking-wide">Marked Absent</p>
                      )}
                    </div>
                  )}

                  {/* Actions bottom bar */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-[var(--border-strong)]">
                    {canEdit && (
                      <button
                        onClick={startEditing}
                        className="w-full min-h-[38px] bg-white text-[#1E2028] hover:bg-white/90 font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                      >
                        {selectedDayDetail.record ? 'Edit Attendance' : 'Add Attendance'}
                      </button>
                    )}
                    {isAdminOps && selectedDayDetail.record && (
                      <button
                        onClick={handleDeleteAttendance}
                        className="w-full min-h-[38px] bg-[#F87171]/10 border border-[#F87171]/20 text-[#F87171] hover:bg-[#F87171]/20 font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                      >
                        Delete Record
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* Selfie Zoom Modal */}
      {selectedPhoto && user?.role !== 'nearbi_homes_supervisor' && (
        <div className="fixed inset-0 z-[13000] bg-black/90 flex flex-col justify-between p-6" onClick={() => setSelectedPhoto(null)}>
          {/* Top Bar with metadata and close button */}
          <div className="flex justify-between items-start w-full text-white relative z-10">
            <div>
              <h3 className="text-base font-extrabold tracking-tight">
                {selectedPhoto.name || 'Selfie Zoom'}
              </h3>
              <p className="text-xs text-white/70 font-semibold mt-1">
                {selectedPhoto.label || selectedPhoto.title}
                {selectedPhoto.date ? ` • ${selectedPhoto.date}` : ''}
              </p>
            </div>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
            >
              <X size={24} strokeWidth={2} />
            </button>
          </div>

          {/* Centered Full-size Photo */}
          <div className="flex-1 flex items-center justify-center my-4">
            <img
              src={selectedPhoto.url}
              alt="Verification selfie zoom"
              className="max-w-full max-h-[75vh] object-contain rounded-[16px] shadow-2xl border border-white/10"
            />
          </div>

          {/* Bottom actions bar */}
          <div className="flex flex-col items-center space-y-4 pb-4 z-10 w-full max-w-md mx-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center gap-3 w-full">
              {user?.role === 'ops_manager' && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const response = await fetch(selectedPhoto.url);
                      const blob = await response.blob();
                      const blobUrl = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = blobUrl;
                      const inOut = selectedPhoto.label === 'Check In Photo' ? 'In' : 'Out';
                      a.download = `${selectedPhoto.name || 'Staff'}_${selectedPhoto.date || 'Date'}_${inOut}.jpg`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(blobUrl);
                    } catch (err) {
                      console.error('Failed to download photo:', err);
                      window.open(selectedPhoto.url, '_blank');
                    }
                  }}
                  className="bg-white hover:bg-gray-200 text-black font-extrabold text-xs px-5 py-2.5 rounded-[12px] flex items-center space-x-1.5 transition-all shadow-lg cursor-pointer"
                >
                  <Download size={18} />
                  <span>Download HD</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Waive Fine Bottom Sheet */}
      {waiveModalOpen && selectedFineForWaive && (
        <div className="fixed inset-0 z-[12000] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setWaiveModalOpen(false); setSelectedFineForWaive(null); }} />
          <div className="bg-[var(--bg-surface)] rounded-t-3xl shadow-2xl relative z-10 p-5 w-full max-w-md border-t border-[var(--border-strong)] animate-slide-up flex flex-col space-y-4 text-white">
            <div className="w-12 h-1 bg-[var(--border-strong)] rounded-full mx-auto flex-shrink-0" />
            <div className="flex justify-between items-center pb-1">
              <h3 className="text-white text-base font-bold">Waive Fine</h3>
              <button onClick={() => { setWaiveModalOpen(false); setSelectedFineForWaive(null); }} className="text-[var(--text-secondary)] hover:text-white p-1">
                <X size={18} />
              </button>
            </div>
            
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3.5 space-y-2 text-xs font-semibold text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="text-white font-mono">{new Date(selectedFineForWaive.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between">
                <span>Fine Type:</span>
                <span className="text-white capitalize">{selectedFineForWaive.type} Fine</span>
              </div>
              {selectedFineForWaive.reason && (
                <div className="flex justify-between">
                  <span>Reason:</span>
                  <span className="text-white italic pr-1">"{selectedFineForWaive.reason}"</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveWaive} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1.5">Waived Amount (₹)</label>
                <input
                  type="number"
                  value={waivedAmountInput}
                  onChange={(e) => setWaivedAmountInput(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl p-3.5 text-xs text-white focus:outline-none focus:border-white/30 font-bold"
                  required
                />
              </div>

              {/* Deduction Summary display */}
              {(() => {
                const amt = Number(waivedAmountInput) || 0;
                const deducted = Math.max(0, selectedFineForWaive.originalAmount - amt);
                return (
                  <div className="bg-black/35 rounded-xl p-3.5 space-y-2 text-xs font-bold text-[var(--text-secondary)] border border-white/5">
                    <div className="flex justify-between">
                      <span>Original Amount:</span>
                      <span className="text-white font-mono">₹{selectedFineForWaive.originalAmount}</span>
                    </div>
                    <div className="flex justify-between text-[#A93226]">
                      <span>Waived Amount:</span>
                      <span className="font-mono">-₹{amt}</span>
                    </div>
                    <div className="flex justify-between border-t border-[var(--border-strong)] pt-2.5 text-[#4ADE80]">
                      <span>Net Deducted Amount:</span>
                      <span className="font-mono text-sm">₹{deducted}</span>
                    </div>
                  </div>
                );
              })()}

              <button 
                type="submit" 
                disabled={isSavingWaive}
                className="w-full min-h-[44px] bg-white text-[#1E2028] hover:bg-white/95 font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              >
                {isSavingWaive ? 'Saving...' : 'Save Waiver'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Simple Toast Alerts */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)] text-[#4ADE80] font-black text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-1">
          <CheckCircle2 size={14} />
          <span>{toastMsg}</span>
        </div>
      )}

    </div>
  );
}

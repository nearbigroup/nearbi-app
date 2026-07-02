'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createAuditLog } from '@/lib/audit';
import { Clock, RefreshCw, CircleCheck, CircleX, AlertTriangle, X, AlertCircle, Download, Upload, Check, List, LayoutGrid, MoreVertical, Plus, Camera, Flag } from 'lucide-react';
import SpecialFineBottomSheet from '@/components/SpecialFineBottomSheet';
import * as XLSX from 'xlsx';
import { DEPARTMENTS } from '@/lib/data';
import { calculateOTMinutes, calculateActualHours, calculateEarlyLeaveDeduction, calculateEarlyLeaveMinutes, calculateLateMinutes, autoCloseCheckouts } from '@/lib/salary';
import { formatTime12hr } from '@/lib/utils';



type StatusFilter = 'All' | 'Present' | 'Late' | 'Absent' | 'Checked Out';
type BranchFilter = 'All' | 'daily' | 'hypermarket';

interface StaffMember {
  id: string;
  name: string;
  branch_id: string;
  department: string;
  active: boolean;
  shift: {
    id: string;
    label: string;
    start_time: string;
    end_time: string;
  };
  off_days_per_month?: number;
  pay_type?: string;
  standard_hours?: number;
}

interface AttendanceRecord {
  id: string;
  staff_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
  color_code: 'green' | 'yellow' | 'orange' | 'red';
  minutes_late: number;
  ot_minutes: number;
  ot_approved: boolean;
  early_in_minutes: number;
  early_in_approved: boolean;
  check_in_photo: string | null;
  check_out_photo: string | null;
  marked_by: string;
  day_type?: string;
  photo_flagged?: boolean;
  photo_flag_reason?: string | null;
  photo_flagged_by?: string | null;
  auto_closed?: boolean;
  total_hours_logged?: number;
  override_shift_start?: string | null;
  override_shift_end?: string | null;
  override_reason?: string | null;
  override_approved_by?: string | null;
}

interface LateFine {
  id: string;
  staff_id: string;
  date: string;
  fine_amount: number;
  waived: boolean;
}

interface Adjustment {
  id: string;
  staff_id: string;
  date: string;
  type: 'ot' | 'early_in';
  minutes: number;
  status: 'pending' | 'approved' | 'rejected';
}

export default function AttendancePage() {
  const router = useRouter();
  const { user, userBranch, canSeeAllBranches } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'ops_manager' || (user?.role === 'staff_executive' && user?.branch !== null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fines, setFines] = useState<LateFine[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);

  const [viewMode, setViewMode] = useState<'list' | 'floor'>('list');
  const [breakLogs, setBreakLogs] = useState<any[]>([]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const todayStr = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, []);

  const getMinDateStr = () => {
    const d = new Date();
    const prevMonth = new Date(d.getFullYear(), d.getMonth() - 4, 1);
    return `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
  };

  const handleDateChange = (newDateStr: string) => {
    const minDateStr = getMinDateStr();
    
    if (newDateStr > todayStr) return;
    if (newDateStr < minDateStr) {
      alert("Attendance editing only available for the last 4 months");
      return;
    }
    setSelectedDate(newDateStr);
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    handleDateChange(dateStr);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    handleDateChange(dateStr);
  };

  const handlePrevMonth = () => {
    const minDate = new Date(getMinDateStr() + 'T00:00:00');
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    if (newMonth < new Date(minDate.getFullYear(), minDate.getMonth(), 1)) {
      alert("Only last 4 months allowed");
      return;
    }
    setCurrentMonth(newMonth);
    const mStr = String(newMonth.getMonth() + 1).padStart(2, '0');
    setSelectedDate(`${newMonth.getFullYear()}-${mStr}-01`);
  };

  const handleNextMonth = () => {
    const d = new Date();
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    if (newMonth > new Date(d.getFullYear(), d.getMonth(), 1)) {
      return;
    }
    setCurrentMonth(newMonth);
    const mStr = String(newMonth.getMonth() + 1).padStart(2, '0');
    if (newMonth.getFullYear() === d.getFullYear() && newMonth.getMonth() === d.getMonth()) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(`${newMonth.getFullYear()}-${mStr}-01`);
    }
  };

  useEffect(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [selectedDate]);

  useEffect(() => {
    const saved = localStorage.getItem('nearbi_attendance_view');
    if (saved === 'list' || saved === 'floor') {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'floor') {
      document.body.style.backgroundColor = '#F8F8F8';
    } else {
      document.body.style.backgroundColor = '';
    }
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, [viewMode]);

  useEffect(() => {
    if (userBranch) {
      autoCloseCheckouts(userBranch);
    } else {
      autoCloseCheckouts('daily');
      autoCloseCheckouts('hypermarket');
    }
  }, [userBranch]);

  // Edit & Detail Attendance States
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);
  const [weeklyOffBalances, setWeeklyOffBalances] = useState<Record<string, { earned: number; used: number; remaining: number }>>({});

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);

  const [editCheckInTime, setEditCheckInTime] = useState('');
  const [editCheckOutTime, setEditCheckOutTime] = useState('');
  const [editStatus, setEditStatus] = useState<'present' | 'late' | 'absent'>('present');
  const [editReason, setEditReason] = useState('');
  const [editFineAmount, setEditFineAmount] = useState(0);
  const [editFineWaived, setEditFineWaived] = useState(false);
  const [otApproved, setOtApproved] = useState(false);
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [overrideShift, setOverrideShift] = useState(false);
  const [overrideStart, setOverrideStart] = useState('');
  const [overrideEnd, setOverrideEnd] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openedLockStatus, setOpenedLockStatus] = useState<{ locked: boolean; confirmedAt?: string } | null>(null);

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addStaffId, setAddStaffId] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addCheckIn, setAddCheckIn] = useState('');
  const [addCheckOut, setAddCheckOut] = useState('');
  const [addStatus, setAddStatus] = useState<'present' | 'late' | 'absent'>('present');
  const [addReason, setAddReason] = useState('');

  const [fineSettings, setFineSettings] = useState<any>({
    yellow_fine: 25,
    orange_fine: 50,
    red_fine: 100,
    yellow_free_passes: 4
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [branchFilter, setBranchFilter] = useState<BranchFilter>('All');
  const [isMobile, setIsMobile] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    label: string;
    name?: string;
    date?: string;
    time?: string;
    attendanceId?: string;
    photo_flagged?: boolean;
    photo_flag_reason?: string;
    photo_flagged_by?: string;
  } | null>(null);

  const [toastMsg, setToastMsg] = useState('');
  const [fineStaff, setFineStaff] = useState<any>(null);
  const [fineModalOpen, setFineModalOpen] = useState(false);

  // Attendance Import/Export States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importSummary, setImportSummary] = useState({ ready: 0, errors: 0, overwrites: 0 });
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const parseMins = (timeStr: string) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const liveMinutesLate = useMemo(() => {
    if (editStatus !== 'late' || !editCheckInTime) return 0;
    const shiftStart = overrideShift ? overrideStart : (detailRecord?.shift?.start_time || '09:00');
    if (overrideShift && overrideStart === editCheckInTime) return 0;
    return calculateLateMinutes(editCheckInTime, shiftStart);
  }, [editStatus, editCheckInTime, detailRecord, overrideShift, overrideStart]);

  const liveColorCode = useMemo(() => {
    if (editStatus === 'absent') return 'red';
    if (editStatus === 'present') return 'green';
    // 'late'
    if (liveMinutesLate <= 15) return 'yellow';
    if (liveMinutesLate <= 30) return 'orange';
    return 'red';
  }, [editStatus, liveMinutesLate]);

  const liveHoursWorked = useMemo(() => {
    if (!editCheckInTime || !editCheckOutTime) return 0;
    return calculateActualHours(editCheckInTime, editCheckOutTime);
  }, [editCheckInTime, editCheckOutTime]);

  const liveOTMinutes = useMemo(() => {
    if (!editCheckOutTime) return 0;
    const shiftStart = overrideShift ? overrideStart : (detailRecord?.shift?.start_time || '09:00');
    const shiftEnd = overrideShift ? overrideEnd : (detailRecord?.shift?.end_time || '18:00');
    return calculateOTMinutes(shiftEnd, editCheckOutTime, shiftStart);
  }, [editCheckOutTime, detailRecord, overrideShift, overrideStart, overrideEnd]);

  const liveEarlyLeaveMinutes = useMemo(() => {
    if (!editCheckInTime || !editCheckOutTime) return 0;
    const shiftStart = overrideShift ? overrideStart : (detailRecord?.shift?.start_time || '09:00');
    const shiftEnd = overrideShift ? overrideEnd : (detailRecord?.shift?.end_time || '18:00');
    return calculateEarlyLeaveMinutes(shiftEnd, editCheckOutTime, shiftStart);
  }, [editCheckInTime, editCheckOutTime, detailRecord, overrideShift, overrideStart, overrideEnd]);

  useEffect(() => {
    if (editStatus !== 'late') {
      setEditFineAmount(0);
      return;
    }
    let amt = 0;
    if (liveColorCode === 'yellow') amt = Number(fineSettings?.yellow_fine || 25);
    else if (liveColorCode === 'orange') amt = Number(fineSettings?.orange_fine || 50);
    else if (liveColorCode === 'red') amt = Number(fineSettings?.red_fine || 100);

    if (detailRecord?.fine && detailRecord.fine.color_code === liveColorCode) {
      setEditFineAmount(Number(detailRecord.fine.fine_amount));
    } else {
      setEditFineAmount(amt);
    }
  }, [liveColorCode, editStatus, detailRecord, fineSettings]);

  const calculateOTFromImport = (checkOut: string | null, shiftEnd: string | null, shiftStart?: string | null): number => {
    if (!checkOut || !shiftEnd) return 0;
    return calculateOTMinutes(shiftEnd, checkOut, shiftStart || '09:00');
  };

  const calculateDerivedFields = (
    checkIn: string | null,
    checkOut: string | null,
    status: string,
    shift: any
  ) => {
    let minutes_late = 0;
    let actual_hours_worked = 0;
    let ot_minutes = 0;
    let early_leave_minutes = 0;

    const shift_start = shift?.start_time || '09:00';
    const shift_end = shift?.end_time || '18:00';

    if (status === 'late' && checkIn) {
      minutes_late = calculateLateMinutes(checkIn, shift_start);
    }

    if (checkIn && checkOut) {
      actual_hours_worked = calculateActualHours(checkIn, checkOut);
      early_leave_minutes = calculateEarlyLeaveMinutes(shift_end, checkOut, shift_start);
    }

    if (checkOut) {
      ot_minutes = calculateOTMinutes(shift_end, checkOut, shift_start);
    }

    const late_salary_deduction_minutes = checkIn ? calculateLateMinutes(checkIn, shift_start) : 0;

    return {
      minutes_late,
      actual_hours_worked,
      ot_minutes,
      early_leave_minutes,
      late_salary_deduction_minutes,
    };
  };

  const handleOpenDetailSheet = (item: any) => {
    setDetailRecord(item);
    
    const staffId = item.id;
    const recordDate = item.record?.date || addDate || new Date().toISOString().split('T')[0];
    const month = recordDate.substring(0, 7);
    
    setOpenedLockStatus(null);
    supabase
      .from('salary_confirmations')
      .select('is_locked, created_at')
      .eq('staff_id', staffId)
      .eq('month', month)
      .eq('is_locked', true)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.is_locked) {
          setOpenedLockStatus({ locked: true, confirmedAt: data.created_at });
        } else {
          setOpenedLockStatus({ locked: false });
        }
      });

    if (item.record && item.record.check_in_time) {
      setEditCheckInTime(item.record.check_in_time || '');
      setEditCheckOutTime(item.record.check_out_time || '');
      setEditStatus(item.record.status || 'present');
      setEditReason('');
      setEditFineAmount(item.fine?.fine_amount ? Number(item.fine.fine_amount) : 0);
      setEditFineWaived(item.fine?.waived || false);
      setOtApproved(item.record.ot_approved || false);
      setIsAddingRecord(false);
      
      setOverrideShift(!!(item.record.override_shift_start || item.record.override_shift_end));
      setOverrideStart(item.record.override_shift_start || item.shift?.start_time || '09:00');
      setOverrideEnd(item.record.override_shift_end || item.shift?.end_time || '18:00');
      setOverrideReason(item.record.override_reason || '');
    } else {
      setEditCheckInTime('');
      setEditCheckOutTime('');
      setEditStatus('present');
      setEditReason('');
      setEditFineAmount(0);
      setEditFineWaived(false);
      setOtApproved(false);
      setIsAddingRecord(false); // Default to false to show the day type selector first

      setOverrideShift(false);
      setOverrideStart(item.shift?.start_time || '09:00');
      setOverrideEnd(item.shift?.end_time || '18:00');
      setOverrideReason('');
    }
    setDetailModalOpen(true);
  };

  const handleMarkDayType = async (type: 'absent' | 'weekly_off' | 'holiday') => {
    if (!detailRecord) return;
    const staffId = detailRecord.id;
    const date = detailRecord.record?.date || addDate || new Date().toISOString().split('T')[0];
    const monthKey = date.substring(0, 7);
    
    // Check if salary is locked for this month
    const { data: lockRecord } = await supabase
      .from('salary_confirmations')
      .select('is_locked, created_at')
      .eq('staff_id', staffId)
      .eq('month', monthKey)
      .eq('is_locked', true)
      .maybeSingle();

    if (lockRecord) {
      if (user?.role !== 'admin') {
        alert(`Attendance for ${monthKey} is locked. Salary was confirmed on ${new Date(lockRecord.created_at).toLocaleDateString()}. Contact admin to unlock.`);
        return;
      }
      const reason = window.prompt(`Attendance for ${monthKey} is locked. To unlock and edit this record, please enter a reason:`);
      if (!reason || !reason.trim()) return;
      
      const { error: unlockErr } = await supabase
        .from('salary_confirmations')
        .update({ is_locked: false })
        .eq('staff_id', staffId)
        .eq('month', monthKey);
        
      if (unlockErr) {
        alert("Failed to unlock: " + unlockErr.message);
        return;
      }
      
      await createAuditLog({
        action: 'unlock_month',
        table_name: 'salary_confirmations',
        record_id: staffId + '_' + monthKey,
        new_value: { is_locked: false },
        performed_by: user.email,
        performed_by_role: user.role,
        reason: reason.trim()
      });
    }

    if (type === 'weekly_off') {
      // 1. Quota Check
      const firstDay = `${monthKey}-01`;
      const [yr, mo] = monthKey.split('-').map(Number);
      const lastDayNum = new Date(yr, mo, 0).getDate();
      const lastDay = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

      const { data: attRecords } = await supabase
        .from('attendance')
        .select('date, check_in_time, day_type')
        .eq('staff_id', staffId)
        .gte('date', firstDay)
        .lte('date', lastDay);

      // Present/late days count (actual worked days)
      const daysWorked = attRecords?.filter(
        r => r.check_in_time !== null && r.day_type !== 'weekly_off' && r.day_type !== 'holiday'
      ).length || 0;

      // Count used weekly offs already this month (excluding this date to avoid self-counting)
      const usedWeeklyOffs = attRecords?.filter(
        r => r.day_type === 'weekly_off' && r.date !== date
      ).length || 0;

      const offDaysPerMonth = detailRecord.off_days_per_month !== undefined ? detailRecord.off_days_per_month : 4;
      const earned = offDaysPerMonth === 0 ? 0 : Math.min(Math.floor(daysWorked / 6), offDaysPerMonth);

      if (usedWeeklyOffs >= earned) {
        alert(`${detailRecord.name} has no weekly off balance remaining this month. Earned: ${earned} | Used: ${usedWeeklyOffs}`);
        return;
      }
    }

    try {
      const attendanceData = {
        staff_id: staffId,
        date: date,
        day_type: type,
        status: type === 'weekly_off' ? 'weekly_off' : type === 'holiday' ? 'holiday' : 'absent',
        check_in_time: null,
        check_out_time: null,
        marked_by: user?.email || 'admin',
        color_code: 'green' as any, // default
        minutes_late: 0,
        actual_hours_worked: 0,
        ot_minutes: 0,
        early_leave_minutes: 0,
        ot_approved: false
      };

      const { error: attErr } = await supabase
        .from('attendance')
        .upsert(attendanceData, { onConflict: 'staff_id,date' });

      if (attErr) throw attErr;

      // Insert wall event for Weekly Off
      if (type === 'weekly_off') {
        await supabase.from('wall_events').insert({
          event_type: 'attendance_edited',
          staff_id: staffId,
          staff_name: detailRecord.name,
          branch_id: detailRecord.branch_id,
          description: `${detailRecord.name} marked Weekly Off on ${date}`
        });
      }

      // Audit Log
      await createAuditLog({
        action: 'attendance_edited',
        table_name: 'attendance',
        record_id: staffId + '_' + date,
        old_value: detailRecord.record || null,
        new_value: attendanceData,
        performed_by: user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        reason: `Marked as ${type}`
      });

      showToast(`Marked as ${type === 'weekly_off' ? 'Weekly Off' : type === 'holiday' ? 'Holiday' : 'Absent'} ✓`);
      setDetailModalOpen(false);
      setDetailRecord(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save day type: ' + err.message);
    }
  };

  const handleOpenEdit = (item: any) => {
    handleOpenDetailSheet(item);
  };

  const handleOpenDelete = (item: any) => {
    setDeleteRecord(item);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteRecord) return;
    try {
      const { record, name, branch_id } = deleteRecord;
      const staffId = deleteRecord.id;
      const date = record?.date;

      if (!date) return;

      const month = date.substring(0, 7);
      const { data: lockRecord } = await supabase
        .from('salary_confirmations')
        .select('is_locked, created_at')
        .eq('staff_id', staffId)
        .eq('month', month)
        .eq('is_locked', true)
        .maybeSingle();

      if (lockRecord) {
        if (user?.role !== 'admin') {
          alert(`Attendance for ${month} is locked. Salary was confirmed on ${new Date(lockRecord.created_at).toLocaleDateString()}. Contact admin to unlock.`);
          return;
        }
        
        const reason = window.prompt(`Attendance for ${month} is locked. To unlock and delete this record, please enter a reason:`);
        if (!reason || !reason.trim()) {
          alert("Unlocking cancelled. Changes not deleted.");
          return;
        }
        
        const { error: unlockErr } = await supabase
          .from('salary_confirmations')
          .update({ is_locked: false })
          .eq('staff_id', staffId)
          .eq('month', month);
          
        if (unlockErr) {
          alert("Failed to unlock: " + unlockErr.message);
          return;
        }
        
        await createAuditLog({
          action: 'unlock_month',
          table_name: 'salary_confirmations',
          record_id: staffId + '_' + month,
          new_value: { is_locked: false },
          performed_by: user.email,
          performed_by_role: user.role,
          reason: reason.trim()
        });
      }

      const { error: deleteErr } = await supabase
        .from('attendance')
        .delete()
        .eq('id', record.id);

      if (deleteErr) throw deleteErr;

      await supabase
        .from('late_fines')
        .delete()
        .eq('staff_id', staffId)
        .eq('date', date);

      await supabase
        .from('break_logs')
        .delete()
        .eq('staff_id', staffId)
        .eq('date', date);

      await supabase
        .from('attendance_adjustments')
        .delete()
        .eq('staff_id', staffId)
        .eq('date', date);

      await supabase.from('wall_events').insert({
        event_type: 'attendance_deleted',
        staff_id: staffId,
        staff_name: name,
        branch_id,
        description: `${name} attendance record deleted for ${date} by ${user?.email}`
      });

      // Audit Log for deletion
      await createAuditLog({
        action: 'delete',
        table_name: 'attendance',
        record_id: staffId + '_' + date,
        old_value: record,
        performed_by: user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Deleted attendance record'
      });

      showToast("Record deleted");
      setDeleteConfirmOpen(false);
      setDeleteRecord(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete record: ' + err.message);
    }
  };

  const handleSaveAdd = async () => {
    if (!addStaffId) {
      alert('Please select a staff member.');
      return;
    }
    try {
      const month = addDate.substring(0, 7);
      const { data: lockRecord } = await supabase
        .from('salary_confirmations')
        .select('is_locked, created_at')
        .eq('staff_id', addStaffId)
        .eq('month', month)
        .eq('is_locked', true)
        .maybeSingle();

      if (lockRecord) {
        if (user?.role !== 'admin') {
          alert(`Attendance for ${month} is locked. Salary was confirmed on ${new Date(lockRecord.created_at).toLocaleDateString()}. Contact admin to unlock.`);
          return;
        }
        
        const reason = window.prompt(`Attendance for ${month} is locked. To unlock and add this record, please enter a reason:`);
        if (!reason || !reason.trim()) {
          alert("Unlocking cancelled. Record not added.");
          return;
        }
        
        const { error: unlockErr } = await supabase
          .from('salary_confirmations')
          .update({ is_locked: false })
          .eq('staff_id', addStaffId)
          .eq('month', month);
          
        if (unlockErr) {
          alert("Failed to unlock: " + unlockErr.message);
          return;
        }
        
        await createAuditLog({
          action: 'unlock_month',
          table_name: 'salary_confirmations',
          record_id: addStaffId + '_' + month,
          new_value: { is_locked: false },
          performed_by: user.email,
          performed_by_role: user.role,
          reason: reason.trim()
        });
      }

      const { data: existing } = await supabase
        .from('attendance')
        .select('id')
        .eq('staff_id', addStaffId)
        .eq('date', addDate)
        .maybeSingle();

      if (existing) {
        alert("Record already exists for this staff on this date. Use edit instead.");
        return;
      }

      const selectedStaff = staff.find((s) => s.id === addStaffId);
      if (!selectedStaff) throw new Error("Staff member not found");

      const { minutes_late, actual_hours_worked, ot_minutes, early_leave_minutes, late_salary_deduction_minutes } = calculateDerivedFields(
        addCheckIn || null,
        addCheckOut || null,
        addStatus,
        selectedStaff.shift
      );

      let color_code = 'green';
      if (addStatus === 'late') {
        if (minutes_late <= 15) {
          color_code = 'yellow';
        } else if (minutes_late <= 30) {
          color_code = 'orange';
        } else {
          color_code = 'red';
        }
      }

      const insertData = {
        staff_id: addStaffId,
        date: addDate,
        check_in_time: addCheckIn || null,
        check_out_time: addCheckOut || null,
        status: addStatus,
        minutes_late,
        late_salary_deduction_minutes,
        actual_hours_worked,
        ot_minutes,
        early_leave_minutes,
        color_code,
        marked_by: 'manual'
      };

      const { error: insertErr } = await supabase
        .from('attendance')
        .insert(insertData);

      if (insertErr) throw insertErr;

      if (addStatus === 'late') {
        let fineAmount = 0;
        if (color_code === 'yellow') fineAmount = Number(fineSettings.yellow_fine);
        else if (color_code === 'orange') fineAmount = Number(fineSettings.orange_fine);
        else if (color_code === 'red') fineAmount = Number(fineSettings.red_fine);

        if (fineAmount > 0) {
          const [year, monthStr] = addDate.split('-');
          await supabase.from('late_fines').insert({
            staff_id: addStaffId,
            date: addDate,
            late_minutes: minutes_late,
            color_code,
            fine_amount: fineAmount,
            waived: false,
            month: `${year}-${monthStr}`,
            confirmed: true
          });
        }
      }

      if (ot_minutes > 0) {
        await supabase.from('attendance_adjustments').insert({
          staff_id: addStaffId,
          date: addDate,
          type: 'ot',
          minutes: ot_minutes,
          status: 'pending'
        });
      }

      await supabase.from('wall_events').insert({
        event_type: 'attendance_added',
        staff_id: addStaffId,
        staff_name: selectedStaff.name,
        branch_id: selectedStaff.branch_id,
        description: `${selectedStaff.name} attendance record added for ${addDate} by ${user?.email}`
      });

      // Audit Log for creation
      await createAuditLog({
        action: 'create',
        table_name: 'attendance',
        record_id: addStaffId + '_' + addDate,
        new_value: insertData,
        performed_by: user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Manually added attendance record'
      });

      showToast("Record added ✓");
      setAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert('Failed to add record: ' + err.message);
    }
  };

  const handleSaveDetail = async () => {
    if (!detailRecord) return;
    try {
      const staffId = detailRecord.id;
      const date = detailRecord.record?.date || addDate || new Date().toISOString().split('T')[0];
      const branchId = detailRecord.branch_id;
      const name = detailRecord.name;

      const month = date.substring(0, 7);
      const { data: lockRecord } = await supabase
        .from('salary_confirmations')
        .select('is_locked, created_at')
        .eq('staff_id', staffId)
        .eq('month', month)
        .eq('is_locked', true)
        .maybeSingle();

      if (lockRecord) {
        if (user?.role !== 'admin') {
          alert(`Attendance for ${month} is locked. Salary was confirmed on ${new Date(lockRecord.created_at).toLocaleDateString()}. Contact admin to unlock.`);
          return;
        }
        
        const reason = window.prompt(`Attendance for ${month} is locked. To unlock and update this record, please enter a reason:`);
        if (!reason || !reason.trim()) {
          alert("Unlocking cancelled. Changes not saved.");
          return;
        }
        
        const { error: unlockErr } = await supabase
          .from('salary_confirmations')
          .update({ is_locked: false })
          .eq('staff_id', staffId)
          .eq('month', month);
          
        if (unlockErr) {
          alert("Failed to unlock: " + unlockErr.message);
          return;
        }
        
        await createAuditLog({
          action: 'unlock_month',
          table_name: 'salary_confirmations',
          record_id: staffId + '_' + month,
          new_value: { is_locked: false },
          performed_by: user.email,
          performed_by_role: user.role,
          reason: reason.trim()
        });
      }

      if (editStatus !== 'absent') {
        if (!editCheckInTime) {
          alert('Check-in time is required for Present/Late status.');
          return;
        }
      }

      const isHourly = detailRecord?.pay_type === 'hourly';
      const minutes_late = isHourly ? 0 : liveMinutesLate;
      const actual_hours_worked = liveHoursWorked;
      const ot_minutes = isHourly ? 0 : liveOTMinutes;
      const color_code = isHourly ? 'green' : liveColorCode;
      const early_leave_minutes = isHourly ? 0 : liveEarlyLeaveMinutes;

      const effectiveStart = overrideShift ? overrideStart : (detailRecord?.shift?.start_time || '09:00');
      const late_salary_deduction_minutes = isHourly || editStatus === 'absent' ? 0 : (overrideShift && overrideStart === editCheckInTime ? 0 : calculateLateMinutes(editCheckInTime, effectiveStart));

      const attendanceData: any = {
        staff_id: staffId,
        date: date,
        status: editStatus,
        check_in_time: editStatus === 'absent' ? null : (editCheckInTime || null),
        check_out_time: editStatus === 'absent' ? null : (editCheckOutTime || null),
        minutes_late,
        late_salary_deduction_minutes,
        actual_hours_worked,
        ot_minutes,
        early_leave_minutes: editStatus === 'absent' ? 0 : early_leave_minutes,
        ot_approved: isHourly ? false : otApproved,
        color_code,
        marked_by: 'manual_edit',
        total_hours_logged: isHourly ? (editStatus === 'absent' ? 0 : actual_hours_worked) : 0,
        override_shift_start: overrideShift ? overrideStart : null,
        override_shift_end: overrideShift ? overrideEnd : null,
        override_reason: overrideShift ? overrideReason : null,
        override_approved_by: overrideShift ? (user?.email || 'admin') : null
      };

      const { error: attErr } = await supabase
        .from('attendance')
        .upsert(attendanceData, { onConflict: 'staff_id,date' });

      if (attErr) throw attErr;

      if (!isHourly && editStatus === 'late' && editFineAmount > 0) {
        const [year, monthStr] = date.split('-');
        const monthKey = `${year}-${monthStr}`;

        const fineData = {
          staff_id: staffId,
          date: date,
          late_minutes: minutes_late,
          color_code,
          fine_amount: editFineAmount,
          waived: editFineWaived,
          month: monthKey,
          confirmed: true,
          confirmed_by: user?.email || 'admin'
        };

        const { error: fineErr } = await supabase
          .from('late_fines')
          .upsert(fineData, { onConflict: 'staff_id,date' });

        if (fineErr) throw fineErr;
      } else {
        await supabase
          .from('late_fines')
          .delete()
          .eq('staff_id', staffId)
          .eq('date', date);
      }

      if (!isHourly && ot_minutes > 0) {
        const { data: existingAdj } = await supabase
          .from('attendance_adjustments')
          .select('id')
          .eq('staff_id', staffId)
          .eq('date', date)
          .eq('type', 'ot')
          .maybeSingle();

        const adjData: any = {
          staff_id: staffId,
          date: date,
          type: 'ot',
          minutes: ot_minutes,
          status: otApproved ? 'approved' : 'pending',
          approved_by: otApproved ? (user?.email || 'admin') : null,
          approved_at: otApproved ? new Date().toISOString() : null
        };

        if (existingAdj) {
          await supabase
            .from('attendance_adjustments')
            .update(adjData)
            .eq('id', existingAdj.id);
        } else {
          await supabase
            .from('attendance_adjustments')
            .insert(adjData);
        }
      } else {
        await supabase
          .from('attendance_adjustments')
          .delete()
          .eq('staff_id', staffId)
          .eq('date', date)
          .eq('type', 'ot');
      }

      await supabase.from('wall_events').insert({
        event_type: isAddingRecord ? 'attendance_added' : 'attendance_edited',
        staff_id: staffId,
        staff_name: name,
        branch_id: branchId,
        description: `${name} attendance ${isAddingRecord ? 'added' : 'edited'} on ${date} by ${user?.email}`
      });

      // Audit Log for update
      await createAuditLog({
        action: isAddingRecord ? 'create' : 'update',
        table_name: 'attendance',
        record_id: staffId + '_' + date,
        old_value: detailRecord.record || null,
        new_value: attendanceData,
        performed_by: user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        reason: editReason || (isAddingRecord ? 'Manual attendance addition' : 'Manual attendance update')
      });

      showToast(`Attendance record ${isAddingRecord ? 'added' : 'updated'} successfully.`);
      setDetailModalOpen(false);
      setDetailRecord(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save attendance: ' + err.message);
    }
  };

  const handleDeleteDetail = async () => {
    if (!detailRecord) return;
    const staffId = detailRecord.id;
    const date = detailRecord.record?.date || addDate;
    if (!date) return;

    if (!confirm(`Are you sure you want to delete the attendance record for ${detailRecord.name} on ${date}? This will also delete any associated fines, break logs, and overtime adjustments.`)) {
      return;
    }

    try {
      const { error: delErr } = await supabase
        .from('attendance')
        .delete()
        .eq('staff_id', staffId)
        .eq('date', date);

      if (delErr) throw delErr;

      await supabase
        .from('late_fines')
        .delete()
        .eq('staff_id', staffId)
        .eq('date', date);

      await supabase
        .from('break_logs')
        .delete()
        .eq('staff_id', staffId)
        .eq('date', date);

      await supabase
        .from('attendance_adjustments')
        .delete()
        .eq('staff_id', staffId)
        .eq('date', date);

      await supabase.from('wall_events').insert({
        event_type: 'attendance_deleted',
        staff_id: staffId,
        staff_name: detailRecord.name,
        branch_id: detailRecord.branch_id,
        description: `${detailRecord.name} attendance record deleted for ${date} by ${user?.email}`
      });

      showToast("Attendance record deleted successfully.");
      setDetailModalOpen(false);
      setDetailRecord(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete attendance: ' + err.message);
    }
  };


  const parseTime = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
      const totalMins = Math.round(val * 24 * 60);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    const str = String(val).trim();
    if (/^\d{1,2}:\d{2}$/.test(str)) {
      const [h, m] = str.split(':');
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    return str;
  };

  const parseDate = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      const d = String(date.getUTCDate()).padStart(2, '0');
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const y = date.getUTCFullYear();
      return `${y}-${m}-${d}`;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts;
          return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }
      return trimmed;
    }
    return '';
  };

  const handleDownloadGridTemplate = async (targetMonth: string) => {
    try {
      const [yearStr, monthStr] = targetMonth.split('-');
      const year = parseInt(yearStr);
      const monthNum = parseInt(monthStr);
      
      const calendarDays = new Date(year, monthNum, 0).getDate();
      
      let query = supabase.from('staff').select('*, branch:branches(name)').eq('active', true);
      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }
      const { data: staffData, error } = await query.order('name');
      if (error) throw error;
      
      const headers = ['Name', 'PIN', 'Department', 'Branch'];
      for (let day = 1; day <= calendarDays; day++) {
        headers.push(`${day}-IN`);
        headers.push(`${day}-OUT`);
      }
      
      const rows = (staffData || []).map((s: any) => {
        const row: Record<string, any> = {
          'Name': s.name,
          'PIN': s.pin,
          'Department': s.department,
          'Branch': s.branch_id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket'
        };
        for (let day = 1; day <= calendarDays; day++) {
          row[`${day}-IN`] = '';
          row[`${day}-OUT`] = '';
        }
        return row;
      });
      
      const wb = XLSX.utils.book_new();
      const wsTemplate = XLSX.utils.json_to_sheet(rows, { header: headers });
      XLSX.utils.book_append_sheet(wb, wsTemplate, 'Attendance Grid');
      
      const instructions = [
        ['HOW TO FILL ATTENDANCE'],
        ['Fill IN time as HH:MM (e.g. 09:05)'],
        ['Fill OUT time as HH:MM (e.g. 18:30)'],
        ['Leave BOTH empty if staff was absent'],
        ['Leave OUT empty if no checkout recorded'],
        ['Do NOT change Name, PIN, Department, Branch'],
        ['Save as .xlsx and upload back to app']
      ];
      const wsIns = XLSX.utils.aoa_to_sheet(instructions);
      XLSX.utils.book_append_sheet(wb, wsIns, 'Instructions');
      
      const filename = `Nearbi_Attendance_Grid_${monthStr}_${yearStr}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err: any) {
      console.error(err);
      alert('Failed to generate attendance template.');
    }
  };

  const handleExportExistingAttendance = async (targetMonth: string) => {
    try {
      const [yearStr, monthStr] = targetMonth.split('-');
      const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
      const startDate = `${targetMonth}-01`;
      const endDate = `${targetMonth}-${String(daysInMonth).padStart(2, '0')}`;
      
      let staffQuery = supabase.from('staff').select('*').eq('active', true);
      if (userBranch) {
        staffQuery = staffQuery.eq('branch_id', userBranch);
      }
      const { data: staffData, error: staffErr } = await staffQuery;
      if (staffErr) throw staffErr;
      const staffIds = staffData?.map(s => s.id) || [];
      
      if (staffIds.length === 0) {
        alert('No staff found for export');
        return;
      }
      
      const { data: attData, error: attErr } = await supabase
        .from('attendance')
        .select('*, staff:staff(*)')
        .in('staff_id', staffIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date');
      
      if (attErr) throw attErr;
      
      const rows = (attData || []).map((a: any) => {
        const branchVal = a.staff?.branch_id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
        return {
          'Name': a.staff?.name || '',
          'PIN': a.staff?.pin || '',
          'Branch': branchVal,
          'Department': a.staff?.department || '',
          'Date': a.date,
          'Check In Time': a.check_in_time || '',
          'Check Out Time': a.check_out_time || '',
          'Status': a.status,
          'Color Code': a.color_code,
          'Minutes Late': a.minutes_late || 0,
          'Early In Minutes': a.early_in_minutes || 0,
          'Hours Worked': a.actual_hours_worked || 0,
          'OT Minutes': a.ot_minutes || 0,
          'Marked By': a.marked_by || ''
        };
      });
      
      const wb = XLSX.utils.book_new();
      const wsData = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, wsData, 'Attendance Report');
      
      const filename = `Nearbi_Attendance_${monthStr}_${yearStr}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err: any) {
      console.error(err);
      alert('Failed to export existing attendance.');
    }
  };

  const handleImportButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const parseTimeValue = (val: any): string | null => {
    if (val === null || val === undefined || val === '') {
      return null;
    }
    
    // Already a string like "17:20" or "09:05"
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') return null;
      // Validate HH:MM format
      if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
        const [h, m] = trimmed.split(':').map(Number);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          return String(h).padStart(2,'0') + ':' +
                 String(m).padStart(2,'0');
        }
      }
      return null;
    }
    
    // Excel serial time (decimal between 0 and 1)
    if (typeof val === 'number') {
      if (val >= 0 && val < 1) {
        const totalMins = Math.round(val * 24 * 60);
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return String(h).padStart(2,'0') + ':' +
               String(m).padStart(2,'0');
      }
      // Sometimes stored as full datetime serial
      if (val > 1) {
        const fractional = val - Math.floor(val);
        const totalMins = Math.round(fractional * 24 * 60);
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return String(h).padStart(2,'0') + ':' +
               String(m).padStart(2,'0');
      }
    }
    
    return null;
  };

  const parseRow = (row: any) => {
    const name = row['Name'] || row['name'];
    const pin = String(row['PIN'] || row['pin'] || '').trim();
    
    if (!name || !pin) return null;
    
    const records = [];
    
    const [importYear, importMonth] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(importYear, importMonth, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const inKey = `${day}-IN`;
      const outKey = `${day}-OUT`;
      
      const inVal = row[inKey];
      const outVal = row[outKey];
      
      const checkIn = parseTimeValue(inVal);
      const checkOut = parseTimeValue(outVal);
      
      // Only create record if at least check-in exists
      if (checkIn) {
        const dateStr = `${importYear}-${String(importMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        
        const testDate = new Date(dateStr);
        if (isNaN(testDate.getTime())) {
          // Skip invalid dates silently
          continue;
        }

        // Also verify the date matches expected month
        if (testDate.getMonth() + 1 !== importMonth) {
          // Skip overflow dates
          continue;
        }

        records.push({
          pin,
          name,
          day,
          checkIn,
          checkOut,
        });
      }
    }
    
    return records;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        if (!arrayBuffer) return;
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, {
          type: 'array',
          cellDates: false,  // Keep as raw values
          cellNF: false,
          cellText: false,
        });
        
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to JSON with raw values
        const rows = XLSX.utils.sheet_to_json(sheet, {
          raw: true,        // Keep raw values
          defval: null,     // Empty cells = null;
        });
        
        // Filter out empty rows
        const validRows = rows.filter((row: any) =>
          row['Name'] || row['name']
        );
        
        // Parse rows to day-by-day records
        const parsedRecords: any[] = [];
        validRows.forEach((row: any) => {
          const records = parseRow(row);
          if (records) {
            parsedRecords.push(...records);
          }
        });
        
        if (parsedRecords.length === 0) {
          alert('No valid check-in records found in sheet');
          return;
        }
        
        // Fetch staff and match by PIN
        const allPins = [...new Set(
          parsedRecords.map(r => r.pin)
        )];

        const { data: staffList, error: staffErr } = await supabase
          .from('staff')
          .select('id, name, pin, branch_id, shift_id, pay_type, standard_hours, shift:shifts(start_time, end_time, hours)')
          .in('pin', allPins);

        if (staffErr) throw staffErr;

        const normalizedStaffList = staffList?.map(s => {
          let normalizedShift = null;
          const shiftData = (s as any).shift ?? (s as any).shifts ?? null;
          if (shiftData) {
            normalizedShift = Array.isArray(shiftData) ? shiftData[0] : shiftData;
          }
          return {
            ...s,
            shift: normalizedShift
          };
        }) || [];

        const pinToStaff = new Map(
          normalizedStaffList.map(s => [s.pin, s])
        );

        // Fetch existing attendance records
        const [yearStr, monthStr] = selectedMonth.split('-');
        const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
        const startDate = `${selectedMonth}-01`;
        const endDate = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
        const { data: existingAttendance, error: attErr } = await supabase
          .from('attendance')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate);
        if (attErr) throw attErr;
        
        const attMap = new Map<string, any>();
        existingAttendance?.forEach(a => {
          attMap.set(`${a.staff_id}_${a.date}`, a);
        });

        // Validate each record
        const validatedRows: any[] = [];
        let readyCount = 0;
        let errorCount = 0;
        let overwriteCount = 0;
        
        const [year, month] = selectedMonth.split('-').map(Number);

        parsedRecords.forEach((record, index) => {
          const staff = pinToStaff.get(record.pin);
          const errors: string[] = [];
          
          if (!staff) {
            errors.push(`PIN ${record.pin} not found`);
          }
          
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(record.day).padStart(2,'0')}`;
          
          const inTime = record.checkIn;
          const outTime = record.checkOut || '';
          
          // Basic validations
          if (inTime && !/^\d{2}:\d{2}$/.test(inTime)) {
            errors.push(`Invalid IN time format: ${inTime}`);
          }
          if (outTime && !/^\d{2}:\d{2}$/.test(outTime)) {
            errors.push(`Invalid OUT time format: ${outTime}`);
          }
          
          const hasOverlap = staff ? attMap.has(`${staff.id}_${dateStr}`) : false;
          
          const rowObj = {
            rowIdx: index + 1,
            staffId: staff?.id || '',
            name: staff?.name || record.name,
            pin: record.pin,
            date: dateStr,
            inTime,
            outTime,
            shift: staff?.shift || null,
            branchId: staff?.branch_id || '',
            pay_type: staff?.pay_type || 'fixed_shift',
            status: errors.length > 0 ? 'error' : (hasOverlap ? 'overwrite' : 'ready'),
            errors,
            overwrite: hasOverlap
          };
          
          validatedRows.push(rowObj);
          
          if (errors.length > 0) {
            errorCount++;
          } else if (hasOverlap) {
            overwriteCount++;
          } else {
            readyCount++;
          }
        });

        setImportRows(validatedRows);
        setImportSummary({ ready: readyCount, errors: errorCount, overwrites: overwriteCount });
        setImportPreviewOpen(true);
        setBottomSheetOpen(false);

      } catch (err) {
        console.error('Excel parse error:', err);
        alert('Failed to parse Excel file: ' + (err as Error).message);
      }
    };
    reader.onerror = () => {
      alert('Failed to read file. Please try again.');
    };
    reader.readAsArrayBuffer(file);
  };

  const executeImportAttendance = async (importType: 'all' | 'new') => {
    const rowsToImport = importRows.filter(r => {
      if (r.status === 'error') return false;
      if (importType === 'new' && r.status === 'overwrite') return false;
      return true;
    });

    if (rowsToImport.length === 0) {
      alert('No records to import');
      return;
    }

    setIsImporting(true);
    try {
      const { data: exemptions } = await supabase.from('staff_fine_exemptions').select('staff_id');
      const exemptStaffIds = new Set(exemptions?.map(e => e.staff_id) || []);

      const { data: fineSettings } = await supabase.from('fine_settings').select('*').limit(1).maybeSingle();
      const settings = fineSettings || {
        yellow_fine: 25,
        orange_fine: 50,
        red_fine: 100,
        yellow_free_passes: 4
      };

      const [yearStr, monthStr] = selectedMonth.split('-');
      const daysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
      const firstDayOfMonth = `${selectedMonth}-01`;
      const lastDayOfMonth = `${selectedMonth}-${String(daysInMonth).padStart(2, '0')}`;
      
      const { data: yellowRecords } = await supabase
        .from('attendance')
        .select('staff_id, date')
        .eq('color_code', 'yellow')
        .gte('date', firstDayOfMonth)
        .lte('date', lastDayOfMonth);

      const yellowCountsMap = new Map<string, number>();
      yellowRecords?.forEach(y => {
        yellowCountsMap.set(y.staff_id, (yellowCountsMap.get(y.staff_id) || 0) + 1);
      });

      const { data: existingFines } = await supabase
        .from('late_fines')
        .select('staff_id, date')
        .gte('date', firstDayOfMonth)
        .lte('date', lastDayOfMonth);
      
      const existingFinesSet = new Set(existingFines?.map(f => `${f.staff_id}_${f.date}`) || []);

      const total = rowsToImport.length;
      let checkIns = 0;
      let checkOuts = 0;
      let finesLogged = 0;
      let otEntries = 0;

      for (let i = 0; i < total; i++) {
        const row = rowsToImport[i];
        setImportProgress(`Importing ${i + 1} / ${total}...`);

        if (!row.shift) {
          row.shift = { start_time: '09:00', end_time: '18:00', hours: 9 };
        }

        const shiftStart = row.shift.start_time || '09:00';
        const shiftEnd = row.shift.end_time || '18:00';

        const isHourly = row.pay_type === 'hourly';

        let minutesLate = isHourly ? 0 : calculateLateMinutes(row.inTime, shiftStart);
        let status: 'present' | 'late' = (!isHourly && minutesLate > 0) ? 'late' : 'present';
        let colorCode: 'green' | 'yellow' | 'orange' | 'red' = 'green';

        if (!isHourly && status === 'late') {
          if (minutesLate <= 15) {
            colorCode = 'yellow';
          } else if (minutesLate <= 30) {
            colorCode = 'orange';
          } else {
            colorCode = 'red';
          }
        }

        let actualHoursWorked = null;
        let otMinutes = 0;
        let earlyLeaveMinutes = 0;

        if (row.outTime) {
          otMinutes = isHourly ? 0 : calculateOTFromImport(row.outTime, shiftEnd, shiftStart);
          actualHoursWorked = calculateActualHours(row.inTime, row.outTime);
          earlyLeaveMinutes = isHourly ? 0 : calculateEarlyLeaveMinutes(shiftEnd, row.outTime, shiftStart);
        }

        // FIX 4: Build the record object dynamically.
        // If schema cache errors occur, go to
        // Supabase Dashboard → Settings → API
        // and click "Reload schema cache"
        const lateSalaryDeductionMins = isHourly ? 0 : calculateLateMinutes(row.inTime, shiftStart);

        const record: any = {
          staff_id: row.staffId,
          date: row.date,
          check_in_time: row.inTime,
          check_out_time: row.outTime || null,
          status,
          minutes_late: minutesLate,
          late_salary_deduction_minutes: lateSalaryDeductionMins,
          color_code: colorCode,
          marked_by: 'import',
          early_leave_minutes: earlyLeaveMinutes,
          total_hours_logged: isHourly ? (actualHoursWorked || 0) : 0
        };

        if (actualHoursWorked && actualHoursWorked > 0) record.actual_hours_worked = actualHoursWorked;
        if (otMinutes > 0) record.ot_minutes = otMinutes;

        // FIX 1: Try the full upsert first with all columns.
        let { error: attErr } = await supabase
          .from('attendance')
          .upsert(record, { onConflict: 'staff_id,date' });

        if (attErr) {
          const errMsg = String(attErr.message || '').toLowerCase();
          const errHint = String(attErr.hint || '').toLowerCase();
          const isSchemaError = errMsg.includes('schema cache') || errMsg.includes('column') || 
                                errHint.includes('schema cache') || errHint.includes('column');
          
          if (isSchemaError) {
            console.warn('Upsert failed with schema cache error, retrying with minimal columns:', attErr);
            // Fall back to minimal upsert with only safe columns
            const minimalRecord = {
              staff_id: row.staffId,
              date: row.date,
              check_in_time: row.inTime,
              check_out_time: row.outTime || null,
              status,
              minutes_late: minutesLate,
              late_salary_deduction_minutes: lateSalaryDeductionMins,
              color_code: colorCode,
              marked_by: 'import',
              early_leave_minutes: earlyLeaveMinutes
            };
            const { error: retryErr } = await supabase
              .from('attendance')
              .upsert(minimalRecord, { onConflict: 'staff_id,date' });
            
            if (retryErr) throw retryErr;
          } else {
            throw attErr;
          }
        }
        checkIns++;
        if (row.outTime) checkOuts++;

        let fineAmount = 0;
        if (!isHourly && status === 'late' && !exemptStaffIds.has(row.staffId)) {
          if (colorCode === 'yellow') {
            const currentYellows = yellowCountsMap.get(row.staffId) || 0;
            yellowCountsMap.set(row.staffId, currentYellows + 1);
            if (currentYellows >= settings.yellow_free_passes) {
              fineAmount = Number(settings.yellow_fine);
            }
          } else if (colorCode === 'orange') {
            fineAmount = Number(settings.orange_fine);
          } else if (colorCode === 'red') {
            fineAmount = Number(settings.red_fine);
          }
        }

        if (fineAmount > 0) {
          const currentMonthStr = `${yearStr}-${monthStr}`;
          const { error: fineErr } = await supabase.from('late_fines').upsert({
            staff_id: row.staffId,
            date: row.date,
            late_minutes: minutesLate,
            color_code: colorCode,
            fine_amount: fineAmount,
            waived: false,
            month: currentMonthStr
          }, { onConflict: 'staff_id,date' });
          if (fineErr) throw fineErr;
          finesLogged++;
        } else if (!isHourly) {
          // Delete any existing unconfirmed fine for this date
          await supabase
            .from('late_fines')
            .delete()
            .eq('staff_id', row.staffId)
            .eq('date', row.date)
            .eq('confirmed', false);
        }

        if (!isHourly && otMinutes > 0) {
          const { data: existingAdj } = await supabase
            .from('attendance_adjustments')
            .select('id')
            .eq('staff_id', row.staffId)
            .eq('date', row.date)
            .eq('type', 'ot')
            .maybeSingle();

          if (!existingAdj) {
            const { error: adjErr } = await supabase.from('attendance_adjustments').insert({
              staff_id: row.staffId,
              date: row.date,
              type: 'ot',
              minutes: otMinutes,
              status: 'pending'
            });
            if (adjErr) throw adjErr;
            otEntries++;
          }
        }
      }

      const dates = rowsToImport.map(r => new Date(r.date));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      const formatDayMonth = (d: Date) => {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
      
      const dateRangeStr = dates.length > 0 
        ? `${formatDayMonth(minDate)}–${formatDayMonth(maxDate)}` 
        : '';

      showToast(`${dateRangeStr ? dateRangeStr + ' imported: ' : ''}${checkIns} check-ins recorded, ${checkOuts} check-outs recorded, ${finesLogged} late fines logged, ${otEntries} OT entries pending approval.`);
      setImportPreviewOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('Import failed with error:', err);
      const errMsg = String(err.message || '').toLowerCase();
      const errDetails = String(err.details || '').toLowerCase();
      const errHint = String(err.hint || '').toLowerCase();
      
      // If schema cache errors occur, go to
      // Supabase Dashboard → Settings → API
      // and click "Reload schema cache"
      if (errMsg.includes('schema cache') || errMsg.includes('column') || 
          errDetails.includes('schema cache') || errDetails.includes('column') ||
          errHint.includes('schema cache') || errHint.includes('column')) {
        alert("Import failed: Database needs a schema refresh. Go to Supabase Settings → API → Reload schema cache, then try again.");
      } else {
        alert(`Import failed: Schema cache error — see console`);
      }
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg('');
    }, 3000);
  };

  const handleOpenFineModal = (staffMember: any) => {
    setFineStaff(staffMember);
    setFineModalOpen(true);
  };

  // Set initial branch filter for branch HR
  useEffect(() => {
    if (userBranch) {
      setBranchFilter(userBranch as BranchFilter);
    }
  }, [userBranch]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 480);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchData = async () => {
    try {
      const todayStr = selectedDate;

      // 1. Fetch staff
      try {
        let staffQuery = supabase.from('staff').select('*, shift:shifts(*)').eq('active', true).order('name');
        if (userBranch) {
          staffQuery = staffQuery.eq('branch_id', userBranch);
        }
        const { data: sData, error: sErr } = await staffQuery;
        if (sErr) {
          console.error('Error fetching staff:', sErr);
          setErrorMsg('Could not load staff list.');
          setStaff([]);
        } else {
          console.log('Staff count:', sData?.length);
          const normalizedStaff = (sData || []).map((s: any) => {
            let normalizedShift = null;
            if (s.shift) {
              normalizedShift = Array.isArray(s.shift) ? s.shift[0] : s.shift;
            } else if (s.shifts) {
              normalizedShift = Array.isArray(s.shifts) ? s.shifts[0] : s.shifts;
            }
            return {
              ...s,
              shift: normalizedShift
            };
          });
          setStaff(normalizedStaff as unknown as StaffMember[]);
          setErrorMsg('');
        }
      } catch (err: any) {
        console.error('Exception fetching staff:', err);
        setErrorMsg('Could not load staff list.');
        setStaff([]);
      }

      // 2. Fetch today's attendance
      try {
        const { data: attRecords, error: aErr } = await supabase
          .from('attendance')
          .select('*')
          .eq('date', todayStr);
        if (aErr) {
          console.error('Attendance load error:', aErr);
          throw aErr;
        }
        console.log('Attendance records:', attRecords?.length);
        console.log('Sample att record:', attRecords?.[0]);
        setAttendance(attRecords || []);
      } catch (err: any) {
        console.error('Attendance fetch error:', err);
        setErrorMsg('Could not load data. Check connection.');
      }

      // 3. Fetch today's late fines
      try {
        let finesQuery = supabase.from('late_fines').select('*').eq('date', todayStr);
        const { data: fData, error: fErr } = await finesQuery;
        if (fErr) {
          console.error('Error fetching late fines:', fErr);
          setFines([]);
        } else {
          setFines(fData || []);
        }
      } catch (err: any) {
        console.error('Exception fetching late fines:', err);
        setFines([]);
      }

      // 4. Fetch today's adjustments
      try {
        let adjustmentsQuery = supabase.from('attendance_adjustments').select('*').eq('date', todayStr);
        const { data: adjData, error: adjErr } = await adjustmentsQuery;
        if (adjErr) {
          console.error('Error fetching adjustments:', adjErr);
          setAdjustments([]);
        } else {
          setAdjustments(adjData || []);
        }
      } catch (err: any) {
        console.error('Exception fetching adjustments:', err);
        setAdjustments([]);
      }

      // 5. Fetch today's break logs
      try {
        const { data: breakData, error: breakErr } = await supabase
          .from('break_logs')
          .select('*')
          .eq('date', todayStr);
        if (breakErr) {
          console.error('Error fetching break logs:', breakErr);
          setBreakLogs([]);
        } else {
          setBreakLogs(breakData || []);
        }
      } catch (err: any) {
        console.error('Exception fetching break logs:', err);
        setBreakLogs([]);
      }

      // 6. Fetch fine settings
      try {
        const { data: fsData } = await supabase.from('fine_settings').select('*').limit(1).maybeSingle();
        if (fsData) {
          setFineSettings(fsData);
        }
      } catch (err) {
        console.error('Exception fetching fine settings:', err);
      }

      // 7. Fetch selected month's attendance for weekly off balance calculations
      try {
        const monthKey = selectedDate.substring(0, 7);
        const firstDay = `${monthKey}-01`;
        const [yr, mo] = monthKey.split('-').map(Number);
        const lastDayNum = new Date(yr, mo, 0).getDate();
        const lastDay = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

        const { data: monthAtt } = await supabase
          .from('attendance')
          .select('staff_id, date, check_in_time, day_type')
          .gte('date', firstDay)
          .lte('date', lastDay);

        const balances: Record<string, { earned: number; used: number; remaining: number }> = {};
        
        staff.forEach((s) => {
          const staffAtt = monthAtt?.filter(a => a.staff_id === s.id) || [];
          const daysWorked = staffAtt.filter(
            a => a.check_in_time !== null && a.day_type !== 'weekly_off' && a.day_type !== 'holiday'
          ).length;

          const used = staffAtt.filter(a => a.day_type === 'weekly_off').length;
          const offDaysPerMonth = s.off_days_per_month !== undefined ? s.off_days_per_month : 4;
          const earned = offDaysPerMonth === 0 ? 0 : Math.min(Math.floor(daysWorked / 6), offDaysPerMonth);
          const remaining = Math.max(0, earned - used);

          balances[s.id] = { earned, used, remaining };
        });

        setWeeklyOffBalances(balances);
      } catch (err) {
        console.error('Error computing weekly off balances:', err);
      }


    } catch (err: any) {
      console.error('Attendance fetch error:', err);
      setErrorMsg('Could not load data. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleFlagPhoto = async (reason: string) => {
    if (!selectedPhoto?.attendanceId) return;
    try {
      const { error } = await supabase
        .from('attendance')
        .update({
          photo_flagged: true,
          photo_flag_reason: reason || 'Blurry / Bad Quality',
          photo_flagged_by: user?.email || 'ops'
        })
        .eq('id', selectedPhoto.attendanceId);

      if (error) throw error;

      setSelectedPhoto(prev => prev ? {
        ...prev,
        photo_flagged: true,
        photo_flag_reason: reason || 'Blurry / Bad Quality',
        photo_flagged_by: user?.email || 'ops'
      } : null);

      setToastMsg('Photo flagged ✓');
      setTimeout(() => setToastMsg(''), 3000);
      fetchData();
    } catch (err) {
      console.error('Error flagging photo:', err);
      alert('Failed to flag photo.');
    }
  };

  const handleUnflagPhoto = async () => {
    if (!selectedPhoto?.attendanceId) return;
    try {
      const { error } = await supabase
        .from('attendance')
        .update({
          photo_flagged: false,
          photo_flag_reason: null,
          photo_flagged_by: null
        })
        .eq('id', selectedPhoto.attendanceId);

      if (error) throw error;

      setSelectedPhoto(prev => prev ? {
        ...prev,
        photo_flagged: false,
        photo_flag_reason: undefined,
        photo_flagged_by: undefined
      } : null);

      setToastMsg('Photo unflagged ✓');
      setTimeout(() => setToastMsg(''), 3000);
      fetchData();
    } catch (err) {
      console.error('Error unflagging photo:', err);
      alert('Failed to unflag photo.');
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData();

    // Realtime attendance channel (FIX 2 - Step 4)
    const channel = supabase
      .channel('attendance-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'break_logs' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userBranch, selectedDate]);

  // Combine staff with today's metrics (FIX 2 - Step 3)
  const combinedData = staff.map((s) => {
    const record = attendance.find(
      (a) => String(a.staff_id).trim().toLowerCase() === String(s.id).trim().toLowerCase()
    );
    const lateFine = fines.find(
      (f) => String(f.staff_id).trim().toLowerCase() === String(s.id).trim().toLowerCase()
    );
    const staffAdjustments = adjustments.filter(
      (adj) => String(adj.staff_id).trim().toLowerCase() === String(s.id).trim().toLowerCase()
    );

    console.log(`Staff ${s.name}: att found = ${!!record}`);

    return {
      ...s,
      record: record || null,
      attendance: record || null,
      fine: lateFine || null,
      adjustments: staffAdjustments,
      status: record?.check_in_time 
        ? (record.status || 'present')
        : 'absent',
      checkInTime: record?.check_in_time || null,
      checkOutTime: record?.check_out_time || null,
    };
  });

  // Filters application
  const filteredData = combinedData.filter((item) => {
    // 1. Branch isolation filter
    if (userBranch) {
      if (item.branch_id !== userBranch) return false;
    } else {
      if (branchFilter !== 'All' && item.branch_id !== branchFilter) return false;
    }

    // 2. Status filter
    let statusMatch = true;
    if (statusFilter === 'Present') statusMatch = !!item.record && !!item.record.check_in_time;
    else if (statusFilter === 'Late') statusMatch = !!item.record && item.record.status === 'late';
    else if (statusFilter === 'Absent') statusMatch = !item.record || !item.record.check_in_time;
    else if (statusFilter === 'Checked Out') statusMatch = !!item.record && !!item.record.check_out_time;

    if (!statusMatch) return false;

    // 3. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      if (!item.name.toLowerCase().includes(q)) return false;
    }

    return true;
  });

  const DEPT_ORDER = [
    'Accounts',
    'Purchase Entry',
    'Sales',
    'Billing',
    'Helper',
    'Cleaning',
    'Counter Staff',
    'Packing Staff',
    'Customer Care',
    'Nearbi Homes',
    'Security',
    'Part Time',
    'Vegetables'
  ];

  const getStaffCardDetails = (item: any) => {
    // Check break
    const activeBreak = breakLogs.find(
      (b) => b.staff_id === item.id && b.break_end === null
    );
    if (activeBreak) {
      return {
        type: 'break',
        cardClass: 'bg-[#FDF8E7] border-[1.5px] border-[#E6B800] text-[#1A1A1A]',
        avatarClass: 'bg-[#E6B800] text-white',
        nameClass: 'text-[#1A1A1A]',
        statusClass: 'text-[#B8860B] flex items-center gap-1',
        statusContent: (
          <span className="flex items-center gap-0.5">
            ☕ On break
          </span>
        )
      };
    }

    const record = item.record;
    if (record) {
      if (record.day_type === 'weekly_off') {
        return {
          type: 'weekly_off',
          cardClass: 'bg-[#EFF6FF] border-2 border-[#60A5FA] text-[#1D4ED8]',
          avatarClass: 'bg-[#60A5FA] text-white',
          nameClass: 'text-[#1D4ED8]',
          statusClass: 'text-[#3B82F6] flex items-center gap-1 font-bold',
          statusContent: (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA]" />
              Weekly Off
            </span>
          )
        };
      }
      if (record.day_type === 'holiday') {
        return {
          type: 'holiday',
          cardClass: 'bg-[#F5F3FF] border-2 border-[#A78BFA] text-[#6D28D9]',
          avatarClass: 'bg-[#A78BFA] text-white',
          nameClass: 'text-[#6D28D9]',
          statusClass: 'text-[#8B5CF6] flex items-center gap-1 font-bold',
          statusContent: (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
              Holiday
            </span>
          )
        };
      }
      if (record.day_type === 'leave') {
        return {
          type: 'leave',
          cardClass: 'bg-[#FFF7ED] border-2 border-[#FB923C] text-[#C2410C]',
          avatarClass: 'bg-[#FB923C] text-white',
          nameClass: 'text-[#C2410C]',
          statusClass: 'text-[#EA580C] flex items-center gap-1 font-bold',
          statusContent: (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FB923C]" />
              Leave
            </span>
          )
        };
      }
      if (record.status === 'late') {
        if (record.color_code === 'yellow') {
          return {
            type: 'late-yellow',
            cardClass: 'bg-[#FFFBF0] border-2 border-[#E6B800] text-[#1A1A1A]',
            avatarClass: 'bg-[#E6B800] text-white',
            nameClass: 'text-[#1A1A1A]',
            statusClass: 'text-[#B8860B] flex items-center gap-1',
            statusContent: (
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" />
                {formatTime12hr(record.check_in_time)} ({record.minutes_late}m)
              </span>
            )
          };
        } else if (record.color_code === 'orange') {
          return {
            type: 'late-orange',
            cardClass: 'bg-[#FFF5F0] border-2 border-[#E07000] text-[#1A1A1A]',
            avatarClass: 'bg-[#E07000] text-white',
            nameClass: 'text-[#1A1A1A]',
            statusClass: 'text-[#E07000] flex items-center gap-1',
            statusContent: (
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E07000]" />
                {formatTime12hr(record.check_in_time)} ({record.minutes_late}m)
              </span>
            )
          };
        } else {
          // Red
          return {
            type: 'late-red',
            cardClass: 'bg-[#FFF0F0] border-2 border-[#C0392B] text-[#1A1A1A]',
            avatarClass: 'bg-[#C0392B] text-white',
            nameClass: 'text-[#1A1A1A]',
            statusClass: 'text-[#C0392B] flex items-center gap-1',
            statusContent: (
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C0392B]" />
                {formatTime12hr(record.check_in_time)} ({record.minutes_late}m)
              </span>
            )
          };
        }
      } else if (record.status === 'weekly_off') {
        return {
          type: 'weekly_off',
          cardClass: 'bg-[#EFF6FF] border-2 border-[#60A5FA] text-[#1D4ED8]',
          avatarClass: 'bg-[#60A5FA] text-white',
          nameClass: 'text-[#1D4ED8]',
          statusClass: 'text-[#3B82F6] flex items-center gap-1 font-bold',
          statusContent: (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA]" />
              Weekly Off
            </span>
          )
        };
      } else if (record.status === 'holiday') {
        return {
          type: 'holiday',
          cardClass: 'bg-[#F5F3FF] border-2 border-[#A78BFA] text-[#6D28D9]',
          avatarClass: 'bg-[#A78BFA] text-white',
          nameClass: 'text-[#6D28D9]',
          statusClass: 'text-[#8B5CF6] flex items-center gap-1 font-bold',
          statusContent: (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
              Holiday
            </span>
          )
        };
      } else if (record.status === 'absent') {
        return {
          type: 'absent',
          cardClass: 'bg-[#F5F5F5] border-[1.5px] border-dashed border-[#6B7280]/30 opacity-75 text-[#6B7280]',
          avatarClass: 'bg-[#E0E0E0] text-[#6B7280] opacity-50',
          nameClass: 'text-[#6B7280]',
          statusClass: 'text-[#6B7280] flex items-center gap-1 font-bold',
          statusContent: (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6B7280]" />
              Absent
            </span>
          )
        };
      } else {
        // Present on time
        return {
          type: 'present',
          cardClass: 'bg-[#1A1A1A] text-white border-transparent',
          avatarClass: 'bg-white/15 text-white',
          nameClass: 'text-white',
          statusClass: 'text-white/60 flex items-center gap-1',
          statusContent: (
            <span className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" />
              {formatTime12hr(record.check_in_time)}
            </span>
          )
        };
      }
    }

    // No record: check if Pending/Shift not started or Absent
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMins = now.getHours() * 60 + now.getMinutes();
    let isPending = false;
    let shiftTimeStr = '';
    if (selectedDate >= todayStr && item.shift?.start_time) {
      const [sh, sm] = item.shift.start_time.split(':').map(Number);
      const shiftMins = sh * 60 + sm;
      shiftTimeStr = formatTime12hr(item.shift.start_time);
      if (currentMins < shiftMins + 30 || selectedDate > todayStr) {
        isPending = true;
      }
    }

    if (isPending) {
      return {
        type: 'pending',
        cardClass: 'bg-[#FAFAFA] border border-[#E8E8E8] text-[#999999]',
        avatarClass: 'bg-[#E8E8E8] text-[#999999]',
        nameClass: 'text-[#999999]',
        statusClass: 'text-[#999999]',
        statusContent: shiftTimeStr ? `Shift starts at ${shiftTimeStr}` : 'Pending'
      };
    }

    // Absent
    return {
      type: 'absent',
      cardClass: 'bg-[#F5F5F5] border-[1.5px] border-dashed border-[#6B7280]/30 opacity-75 text-[#6B7280]',
      avatarClass: 'bg-[#E0E0E0] text-[#6B7280] opacity-50',
      nameClass: 'text-[#6B7280]',
      statusClass: 'text-[#6B7280] flex items-center gap-1 font-bold',
      statusContent: (
        <span className="flex items-center gap-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#6B7280]" />
          Absent
        </span>
      )
    };
  };

  const summaryStats = useMemo(() => {
    const activeBranchStaff = combinedData.filter((item) => {
      if (userBranch) {
        return item.branch_id === userBranch;
      }
      return branchFilter === 'All' || item.branch_id === branchFilter;
    });

    const present = activeBranchStaff.filter(
      (item) => item.record && item.record.check_in_time && item.record.status !== 'late'
    ).length;

    const late = activeBranchStaff.filter(
      (item) => item.record && item.record.check_in_time && item.record.status === 'late'
    ).length;

    const absent = activeBranchStaff.filter((item) => {
      if (item.record && item.record.check_in_time) return false;
      
      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();
      if (item.shift?.start_time) {
        const [sh, sm] = item.shift.start_time.split(':').map(Number);
        const shiftMins = sh * 60 + sm;
        if (currentMins < shiftMins) {
          return false;
        }
      }
      return true;
    }).length;

    return { present, late, absent };
  }, [combinedData, branchFilter, userBranch]);

  const floorSections = useMemo(() => {
    return DEPT_ORDER.map((dept) => {
      const deptStaffAll = combinedData.filter((item) => {
        if (item.department !== dept) return false;
        if (userBranch) {
          if (item.branch_id !== userBranch) return false;
        } else {
          if (branchFilter !== 'All' && item.branch_id !== branchFilter) return false;
        }
        return true;
      });

      if (deptStaffAll.length === 0) return null;

      const totalCount = deptStaffAll.length;
      const presentCount = deptStaffAll.filter(
        (item) => item.record && item.record.check_in_time
      ).length;

      const allAbsent = presentCount === 0;

      const deptStaffFiltered = filteredData.filter((item) => item.department === dept);

      if (deptStaffFiltered.length === 0) return null;

      return {
        name: dept,
        staff: deptStaffFiltered,
        presentCount,
        totalCount,
        allAbsent
      };
    }).filter(Boolean);
  }, [combinedData, filteredData, branchFilter, userBranch]);

  const getStatusBadge = (record: AttendanceRecord | null, payType?: string) => {
    if (payType === 'hourly') {
      const hours = record?.total_hours_logged ? Number(record.total_hours_logged) : 0;
      return (
        <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold px-2.5 py-1.5 rounded-[20px] uppercase tracking-wider flex items-center space-x-1.5">
          <Clock size={14} strokeWidth={2} style={{ color: 'currentColor' }} />
          <span>{hours.toFixed(2)} hrs logged</span>
        </span>
      );
    }

    if (record) {
      if (record.day_type === 'weekly_off') {
        return (
          <span className="bg-blue-50 text-[#3B82F6] border border-[#60A5FA]/20 text-[10px] font-bold px-2.5 py-1.5 rounded-[20px] uppercase tracking-wider flex items-center space-x-1.5">
            <CircleCheck size={14} strokeWidth={2} style={{ color: 'currentColor' }} />
            <span>Weekly Off</span>
          </span>
        );
      }
      if (record.day_type === 'holiday') {
        return (
          <span className="bg-purple-50 text-[#8B5CF6] border border-[#A78BFA]/20 text-[10px] font-bold px-2.5 py-1.5 rounded-[20px] uppercase tracking-wider flex items-center space-x-1.5">
            <CircleCheck size={14} strokeWidth={2} style={{ color: 'currentColor' }} />
            <span>Holiday</span>
          </span>
        );
      }
      if (record.day_type === 'leave') {
        return (
          <span className="bg-orange-50 text-[#EA580C] border border-[#FB923C]/20 text-[10px] font-bold px-2.5 py-1.5 rounded-[20px] uppercase tracking-wider flex items-center space-x-1.5">
            <CircleCheck size={14} strokeWidth={2} style={{ color: 'currentColor' }} />
            <span>Leave</span>
          </span>
        );
      }
    }
    
    if (!record || !record.check_in_time) {
      return (
        <span className="bg-gray-100 text-[#6B7280] border border-gray-300 text-[10px] font-bold px-2.5 py-1.5 rounded-[20px] uppercase tracking-wider flex items-center space-x-1.5">
          <CircleX size={14} strokeWidth={2} style={{ color: 'currentColor' }} />
          <span>Absent</span>
        </span>
      );
    }
    if (record.status === 'late') {
      return (
        <span className="bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/20 text-[10px] font-bold px-2.5 py-1.5 rounded-[20px] uppercase tracking-wider flex items-center space-x-1.5">
          <AlertTriangle size={14} strokeWidth={2} style={{ color: 'currentColor' }} />
          <span>Late</span>
        </span>
      );
    }
    return (
      <span className="bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/20 text-[10px] font-bold px-2.5 py-1.5 rounded-[20px] uppercase tracking-wider flex items-center space-x-1.5">
        <CircleCheck size={14} strokeWidth={2} style={{ color: 'currentColor' }} />
        <span>Present</span>
      </span>
    );
  };

  const getDotColor = (record: AttendanceRecord | null, payType?: string) => {
    if (payType === 'hourly') {
      if (!record || !record.check_in_time) return 'bg-[#6B7280]';
      return 'bg-[#3B82F6]'; // Neutral blue color
    }
    if (!record) return 'bg-[#6B7280]';
    if (record.day_type === 'weekly_off') return 'bg-[#60A5FA]';
    if (record.day_type === 'holiday') return 'bg-[#A78BFA]';
    if (record.day_type === 'leave') return 'bg-[#FB923C]';
    if (!record.check_in_time) return 'bg-[#6B7280]';
    if (record.color_code === 'green') return 'bg-[#2D7A3A]';
    if (record.color_code === 'yellow') return 'bg-[#B8860B]';
    if (record.color_code === 'orange') return 'bg-[#FB923C]';
    if (record.color_code === 'red') return 'bg-[#C0392B]';
    return 'bg-[#2D7A3A]';
  };

  const getBranchName = (id: string) => {
    return id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  return (
    <div className="space-y-5">
      {/* Date Navigation Picker */}
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between select-none">
        <div className="flex flex-wrap items-center gap-2">
          {/* Month Selector */}
          <div className="flex items-center space-x-1 bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl px-2.5 py-1.5">
            <button
              onClick={handlePrevMonth}
              className="p-1 rounded hover:bg-[#EBEBEB] active:scale-95 transition-all text-[#1A1A1A] font-bold cursor-pointer"
            >
              ←
            </button>
            <span className="text-xs font-bold text-[#1A1A1A] min-w-[100px] text-center select-none uppercase tracking-wide">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={handleNextMonth}
              disabled={currentMonth.getFullYear() === new Date().getFullYear() && currentMonth.getMonth() === new Date().getMonth()}
              className="p-1 rounded hover:bg-[#EBEBEB] active:scale-95 transition-all text-[#1A1A1A] font-bold cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
            >
              →
            </button>
          </div>

          {/* Day Selector */}
          <div className="flex items-center space-x-1 bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl px-2.5 py-1.5">
            <button
              onClick={handlePrevDay}
              className="p-1 rounded hover:bg-[#EBEBEB] active:scale-95 transition-all text-[#1A1A1A] font-bold cursor-pointer"
            >
              ←
            </button>
            <select
              value={Number(selectedDate.split('-')[2])}
              onChange={(e) => {
                const dayVal = String(e.target.value).padStart(2, '0');
                const mStr = String(currentMonth.getMonth() + 1).padStart(2, '0');
                handleDateChange(`${currentMonth.getFullYear()}-${mStr}-${dayVal}`);
              }}
              className="bg-transparent border-none p-0 focus:ring-0 text-xs font-bold text-[#1A1A1A] cursor-pointer text-center w-14 focus:outline-none"
              style={{ boxShadow: 'none', border: 'none', padding: 0 }}
            >
              {Array.from({ length: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate() }, (_, i) => i + 1).map((day) => {
                const dayStr = String(day).padStart(2, '0');
                const mStr = String(currentMonth.getMonth() + 1).padStart(2, '0');
                const targetDateStr = `${currentMonth.getFullYear()}-${mStr}-${dayStr}`;
                const isFuture = targetDateStr > todayStr;
                return (
                  <option key={day} value={day} disabled={isFuture} className="bg-white">
                    {day}
                  </option>
                );
              })}
            </select>
            <button
              onClick={handleNextDay}
              disabled={selectedDate >= todayStr}
              className="p-1 rounded hover:bg-[#EBEBEB] active:scale-95 transition-all text-[#1A1A1A] font-bold cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
            >
              →
            </button>
          </div>
        </div>
        
        <span className="text-xs font-extrabold text-white font-mono bg-[#1A1A1A] border border-white/10 px-3 py-1.5 rounded-xl uppercase tracking-wider">
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1A1A1A] text-2xl font-bold">Attendance</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">Daily register</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="bg-[#F2F2F2] rounded-[10px] p-[3px] inline-flex items-center">
            <button
              onClick={() => {
                setViewMode('list');
                localStorage.setItem('nearbi_attendance_view', 'list');
              }}
              className={`px-[14px] py-[6px] text-[13px] flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] text-[#1A1A1A] font-semibold'
                  : 'bg-transparent text-[#999999]'
              }`}
            >
              <List size={16} />
              <span>List</span>
            </button>
            <button
              onClick={() => {
                setViewMode('floor');
                localStorage.setItem('nearbi_attendance_view', 'floor');
              }}
              className={`px-[14px] py-[6px] text-[13px] flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                viewMode === 'floor'
                  ? 'bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] text-[#1A1A1A] font-semibold'
                  : 'bg-transparent text-[#999999]'
              }`}
            >
              <LayoutGrid size={16} />
              <span>Floor</span>
            </button>
          </div>
          {/* Add Record & Import/Export */}
          <div className="attendance-actions flex items-center space-x-2">
            {canEdit && (
              <button
                onClick={() => {
                  setAddStaffId('');
                  setAddDate(new Date().toISOString().split('T')[0]);
                  setAddCheckIn('');
                  setAddCheckOut('');
                  setAddStatus('present');
                  setAddReason('');
                  setAddModalOpen(true);
                }}
                className="min-h-[40px] bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-[0.98] text-[#1A1A1A] px-3.5 rounded-[12px] text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Plus size={16} />
                <span>Add Record</span>
              </button>
            )}
            <button
              onClick={() => setBottomSheetOpen(true)}
              className="min-h-[40px] bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-[0.98] text-[#1A1A1A] px-3.5 rounded-[12px] text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Download size={16} strokeWidth={1.5} />
              <span>Import/Export</span>
            </button>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="min-h-[40px] bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-[0.98] text-[#1A1A1A] px-3.5 rounded-[12px] text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer"
          >
            <RefreshCw size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} className={loading ? 'animate-spin' : ''} />
            {!isMobile && <span>Refresh</span>}
          </button>

          {/* More menu button (mobile only) */}
          <div className="attendance-more-btn relative">
            <button
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              className="min-h-[40px] w-10 bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-[0.98] text-[#1A1A1A] rounded-[12px] flex items-center justify-center transition-all shadow-sm cursor-pointer"
            >
              <MoreVertical size={16} />
            </button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-[46px] bg-white border border-[#E8E8E8] rounded-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.12)] p-1.5 z-[1000] min-w-[150px] flex flex-col space-y-1">
                {canEdit && (
                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      setAddStaffId('');
                      setAddDate(new Date().toISOString().split('T')[0]);
                      setAddCheckIn('');
                      setAddCheckOut('');
                      setAddStatus('present');
                      setAddReason('');
                      setAddModalOpen(true);
                    }}
                    className="w-full text-left p-2.5 text-xs font-bold text-[#1A1A1A] hover:bg-[#F8F8F8] rounded-[8px] flex items-center space-x-2 min-h-0 h-auto cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Add Record</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setBottomSheetOpen(true);
                  }}
                  className="w-full text-left p-2.5 text-xs font-bold text-[#1A1A1A] hover:bg-[#F8F8F8] rounded-[8px] flex items-center space-x-2 min-h-0 h-auto cursor-pointer"
                >
                  <Download size={14} strokeWidth={1.5} />
                  <span>Import/Export</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button
            onClick={() => {
              setLoading(true);
              setErrorMsg('');
              fetchData();
            }}
            className="text-xs underline font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Branch selector (Admin/Ops/Head HR only) */}
      {canSeeAllBranches && !userBranch && (
        <div className="flex border-b border-[#E8E8E8]">
          {[
            { id: 'All', label: 'All Branches' },
            { id: 'daily', label: 'Nearbi Daily' },
            { id: 'hypermarket', label: 'Nearbi Hypermarket' },
          ].map((b) => (
            <button
              key={b.id}
              onClick={() => setBranchFilter(b.id as BranchFilter)}
              className={`flex-1 text-center py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                branchFilter === b.id
                  ? 'border-[#1A1A1A] text-[#1A1A1A]'
                  : 'border-transparent text-[#555555]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* Search Input Box */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search staff by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-[#E8E8E8] rounded-xl p-3 pl-10 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-medium shadow-sm"
        />
        <svg
          className="absolute left-3.5 top-3.5 h-4 w-4 text-[#999999]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Status pills selector */}
      <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none">
        {(['All', 'Present', 'Late', 'Absent', 'Checked Out'] as StatusFilter[]).map((pill) => {
          const isSelected = statusFilter === pill;
          return (
            <button
              key={pill}
              onClick={() => setStatusFilter(pill)}
              className={`px-4 py-2 text-xs font-bold rounded-full transition-all border whitespace-nowrap ${
                isSelected
                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                  : 'bg-white text-[#555555] border-[#E8E8E8] hover:border-[#D0D0D0] hover:bg-[#F8F8F8] active:scale-95'
              }`}
            >
              {pill}
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
        </div>
      ) : viewMode === 'floor' ? (
        <div className="space-y-5">
          {/* Summary Bar */}
          <div className="bg-white border border-[#E8E8E8] rounded-[12px] p-[10px_16px] flex gap-[20px] mb-[16px] shadow-sm">
            <div className="flex items-center gap-[6px]">
              <span className="text-[12px]">🟢</span>
              <span className="font-bold text-[13px] text-[#1A1A1A]">{summaryStats.present}</span>
              <span className="text-[11px] text-[#999999]">Present</span>
            </div>
            <div className="flex items-center gap-[6px]">
              <span className="text-[12px]">🟡</span>
              <span className="font-bold text-[13px] text-[#1A1A1A]">{summaryStats.late}</span>
              <span className="text-[11px] text-[#999999]">Late</span>
            </div>
            <div className="flex items-center gap-[6px]">
              <span className="text-[12px]">🔴</span>
              <span className="font-bold text-[13px] text-[#1A1A1A]">{summaryStats.absent}</span>
              <span className="text-[11px] text-[#999999]">Absent</span>
            </div>
          </div>

          {/* Department Sections */}
          {floorSections.length === 0 ? (
            <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6 shadow-sm">
              <Clock size={48} strokeWidth={1} className="text-[#999999] mb-2" />
              <h3 className="text-sm font-bold text-[#1A1A1A]">No staff matches the filters</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Try selecting a different branch or status filter.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {floorSections.map((dept) => {
                if (!dept) return null;
                return (
                  <div key={dept.name} className="mb-6">
                    {/* Department Header */}
                    <div className="flex justify-between items-center mb-2.5 border-b border-[#E8E8E8]/40 pb-1.5">
                      <span
                        className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                        style={{ color: dept.allAbsent ? '#C0392B' : '#999999' }}
                      >
                        {dept.name}
                      </span>
                      <span className="text-[11px] text-[#999999] font-medium">
                        {dept.presentCount}/{dept.totalCount} present
                      </span>
                    </div>

                    {/* Staff Cards Row/Grid */}
                    <div
                      className={
                        dept.staff.length > 4
                          ? "flex flex-wrap gap-2"
                          : "flex flex-nowrap overflow-x-auto gap-2 scrollbar-none pb-1"
                      }
                    >
                      {dept.staff.map((item) => {
                        const cardDetails = getStaffCardDetails(item);
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleOpenDetailSheet(item)}
                            className={`w-[80px] h-[90px] sm:w-[90px] sm:h-[100px] rounded-[14px] flex flex-col items-center justify-center gap-1 p-[8px_6px] cursor-pointer shrink-0 transition-all ${cardDetails.cardClass}`}
                          >
                            {/* Avatar circle */}
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${cardDetails.avatarClass}`}
                            >
                              {item.name.charAt(0).toUpperCase()}
                            </div>

                            {/* Name */}
                            <span
                              className={`text-[10px] font-semibold text-center max-w-[68px] overflow-hidden text-ellipsis whitespace-nowrap ${cardDetails.nameClass}`}
                            >
                              {item.name.split(' ')[0]}
                            </span>

                            {/* Status line */}
                            <span className={`text-[9px] font-medium ${cardDetails.statusClass}`}>
                              {cardDetails.statusContent}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6 shadow-sm">
          <Clock size={48} strokeWidth={1} className="text-[#999999] mb-2" />
          <h3 className="text-sm font-bold text-[#1A1A1A]">No attendance records yet today</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Tap refresh or check back once kiosks report registrations.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredData.map((item) => {
            const hasCheckIn = !!item.record && !!item.record.check_in_time;
            const hasCheckOut = !!item.record && !!item.record.check_out_time;

            // Find OT and Early In approvals status
            const otAdjustment = item.adjustments.find((adj) => adj.type === 'ot');
            const earlyAdjustment = item.adjustments.find((adj) => adj.type === 'early_in');

            return (
              <div
                key={item.id}
                onClick={() => handleOpenDetailSheet(item)}
                className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex items-start space-x-3.5 relative shadow-sm cursor-pointer hover:border-[#D0D0D0] transition-all"
              >
                {/* Left Dot Indicator */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-2 ${getDotColor(item.record, item.pay_type)}`} />

                {/* Avatar */}
                <div
                  className={`w-11 h-11 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0 border ${
                    hasCheckIn
                      ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                      : 'bg-[#F2F2F2] text-[#999999] border-[#E8E8E8]'
                  }`}
                >
                  {item.name.charAt(0).toUpperCase()}
                </div>

                {/* Info block */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-[#1A1A1A] leading-tight truncate">
                        {item.name}
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)] font-semibold mt-0.5 leading-none">
                        {item.department} • {item.pay_type === 'hourly' ? 'Hourly' : (item.shift?.label || 'No Shift')}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {!userBranch && (
                          <span className="inline-block text-[9px] font-bold uppercase text-[#555555] bg-[#F2F2F2] border border-[#E8E8E8] px-1.5 py-0.5 rounded">
                            {getBranchName(item.branch_id)}
                          </span>
                        )}
                        {weeklyOffBalances[item.id] && weeklyOffBalances[item.id].remaining > 0 && (
                          <span className="inline-block text-[9px] font-extrabold uppercase text-[#2563EB] bg-[#EFF6FF] border border-[#BFDBFE] px-1.5 py-0.5 rounded">
                            {weeklyOffBalances[item.id].remaining} offs remaining
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status Badge & Check-in Photo */}
                    <div
                      className="flex items-center space-x-2 flex-shrink-0"
                      style={{
                        marginRight: (item.record && (user?.role === 'admin' || user?.role === 'ops_manager')) ? '20px' : '0px'
                      }}
                    >
                      {item.record?.check_in_photo && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPhoto({
                                url: item.record!.check_in_photo!,
                                name: item.name,
                                label: 'Check In Photo',
                                time: item.record!.check_in_time || '',
                                date: item.record!.date,
                                attendanceId: item.record!.id,
                                photo_flagged: item.record!.photo_flagged,
                                photo_flag_reason: item.record!.photo_flag_reason || undefined,
                                photo_flagged_by: item.record!.photo_flagged_by || undefined
                              });
                            }}
                            className={`w-9 h-9 rounded-full overflow-hidden border shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer flex-shrink-0 ${
                              item.record!.photo_flagged ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-[#E8E8E8]'
                            }`}
                          >
                            <img
                              src={item.record.check_in_photo}
                              alt="Selfie"
                              className="w-full h-full object-cover"
                            />
                          </button>
                          {item.record!.photo_flagged && (
                            <span className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center border border-white shadow">
                              <Flag size={8} fill="currentColor" />
                            </span>
                          )}
                        </div>
                      )}
                      <div>
                        {getStatusBadge(item.record, item.pay_type)}
                      </div>
                    </div>
                  </div>

                  {/* Three dots menu */}
                  {item.record && (user?.role === 'admin' || user?.role === 'ops_manager') && (
                    <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === item.id ? null : item.id);
                        }}
                        className="text-[#999999] hover:text-[#1A1A1A] p-1 rounded-full hover:bg-[#F2F2F2] transition-colors"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {activeMenuId === item.id && (
                        <div className="absolute right-0 top-[28px] bg-white border border-[#E8E8E8] rounded-[10px] shadow-[0_4px_12px_rgba(0,0,0,0.10)] p-1 z-[100] min-w-[140px] w-[140px]">
                          <div
                            onClick={() => {
                              setActiveMenuId(null);
                              handleOpenEdit(item);
                            }}
                            className="p-[10px_14px] text-[13px] font-medium rounded-[8px] cursor-pointer flex items-center gap-2 text-[#1A1A1A] hover:bg-[#F8F8F8] transition-colors"
                          >
                            ✏️ <span>Edit record</span>
                          </div>
                          <div
                            onClick={() => {
                              setActiveMenuId(null);
                              handleOpenDelete(item);
                            }}
                            className="p-[10px_14px] text-[13px] font-medium rounded-[8px] cursor-pointer flex items-center gap-2 text-[#C0392B] hover:bg-[#FDECEA] transition-colors"
                          >
                            🗑️ <span>Delete record</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Metrics details */}
                  {hasCheckIn && item.record && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {/* Check In Time & Photo */}
                      <div className="bg-[#EDF7EF] border border-[#2D7A3A]/20 text-[#2D7A3A] text-[10px] font-bold px-2.5 py-1 rounded-[20px] flex items-center space-x-1.5">
                        <span>IN: {formatTime12hr(item.record.check_in_time)}</span>
                        {item.record.check_in_photo && (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhoto({
                                  url: item.record!.check_in_photo!,
                                  name: item.name,
                                  label: 'Check In Photo',
                                  time: formatTime12hr(item.record!.check_in_time) || '',
                                  date: item.record!.date,
                                  attendanceId: item.record!.id,
                                  photo_flagged: item.record!.photo_flagged,
                                  photo_flag_reason: item.record!.photo_flag_reason || undefined,
                                  photo_flagged_by: item.record!.photo_flagged_by || undefined
                                });
                              }}
                              className={`w-4.5 h-4.5 rounded-full overflow-hidden border active:scale-90 ${
                                item.record.photo_flagged ? 'border-amber-500 ring-1 ring-amber-500/35' : 'border-[#2D7A3A]/25'
                              }`}
                            >
                              <img
                                src={item.record.check_in_photo}
                                alt="Selfie"
                                className="w-full h-full object-cover"
                              />
                            </button>
                            {item.record.photo_flagged && (
                              <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white rounded-full w-2 h-2 flex items-center justify-center border border-white shadow">
                                <Flag size={5} fill="currentColor" />
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Minutes Late */}
                      {item.record.status === 'late' && item.record.minutes_late > 0 && (
                        <div className="bg-[#FDF8E7] border border-[#B8860B]/20 text-[#B8860B] text-[10px] font-bold px-2.5 py-1 rounded-[20px]">
                          {item.record.minutes_late} mins late
                        </div>
                      )}

                      {/* Check Out Time & Photo */}
                      {hasCheckOut && (
                        <div className="bg-[#EBF3FB] border border-[#1A5FA8]/20 text-[#1A5FA8] text-[10px] font-bold px-2.5 py-1 rounded-[20px] flex items-center space-x-1.5">
                          <span>OUT: {formatTime12hr(item.record.check_out_time)}</span>
                          {item.record.check_out_photo && (
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPhoto({
                                    url: item.record!.check_out_photo!,
                                    name: item.name,
                                    label: 'Check Out Photo',
                                    time: formatTime12hr(item.record!.check_out_time) || '',
                                    date: item.record!.date,
                                    attendanceId: item.record!.id,
                                    photo_flagged: item.record!.photo_flagged,
                                    photo_flag_reason: item.record!.photo_flag_reason || undefined,
                                    photo_flagged_by: item.record!.photo_flagged_by || undefined
                                  });
                                }}
                                className={`w-4.5 h-4.5 rounded-full overflow-hidden border active:scale-90 ${
                                  item.record.photo_flagged ? 'border-amber-500 ring-1 ring-amber-500/35' : 'border-[#1A5FA8]/25'
                                }`}
                              >
                                <img
                                  src={item.record.check_out_photo}
                                  alt="Selfie"
                                  className="w-full h-full object-cover"
                                />
                              </button>
                              {item.record.photo_flagged && (
                                <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white rounded-full w-2 h-2 flex items-center justify-center border border-white shadow">
                                  <Flag size={5} fill="currentColor" />
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {item.record && item.record.auto_closed && (
                        <div 
                          className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-[20px] cursor-help"
                          title="Checkout was automatically set to shift end time. Edit if needed."
                        >
                          Auto-closed
                        </div>
                      )}

                      {/* Overtime Approval status */}
                      {otAdjustment && (
                        <div
                          className={`text-[9px] font-bold px-2.5 py-1 rounded-[20px] border flex items-center gap-1 ${
                            otAdjustment.status === 'pending'
                              ? 'bg-[#FDF8E7] border-[#B8860B]/20 text-[#B8860B]'
                              : otAdjustment.status === 'approved'
                              ? 'bg-[#EDF7EF] border-[#2D7A3A]/20 text-[#2D7A3A]'
                              : 'bg-[#F2F2F2] border-[#E8E8E8] text-[#999999]'
                          }`}
                        >
                          <span>OT</span>
                          {otAdjustment.status === 'pending' ? (
                            <span>Pending</span>
                          ) : otAdjustment.status === 'approved' ? (
                            <span style={{display:'flex',
                              alignItems:'center', gap:'4px'}}>
                              <Check size={12} strokeWidth={2.5} />
                              Approved
                            </span>
                          ) : (
                            <span style={{display:'flex',
                              alignItems:'center', gap:'4px'}}>
                              <X size={12} strokeWidth={2.5} />
                              Rejected
                            </span>
                          )}
                        </div>
                      )}

                      {/* Early Check-in Approval status */}
                      {earlyAdjustment && (
                        <div
                          className={`text-[9px] font-bold px-2.5 py-1 rounded-[20px] border flex items-center gap-1 ${
                            earlyAdjustment.status === 'pending'
                              ? 'bg-[#FDF8E7] border-[#B8860B]/20 text-[#B8860B]'
                              : earlyAdjustment.status === 'approved'
                              ? 'bg-[#EDF7EF] border-[#2D7A3A]/20 text-[#2D7A3A]'
                              : 'bg-[#F2F2F2] border-[#E8E8E8] text-[#999999]'
                          }`}
                        >
                          <span>Early In</span>
                          {earlyAdjustment.status === 'pending' ? (
                            <span>Pending</span>
                          ) : earlyAdjustment.status === 'approved' ? (
                            <span style={{display:'flex',
                              alignItems:'center', gap:'4px'}}>
                              <Check size={12} strokeWidth={2.5} />
                              Approved
                            </span>
                          ) : (
                            <span style={{display:'flex',
                              alignItems:'center', gap:'4px'}}>
                              <X size={12} strokeWidth={2.5} />
                              Rejected
                            </span>
                          )}
                        </div>
                      )}

                      {/* Late fine amount */}
                      {item.fine && (
                        <div className="bg-[#FDECEA] border border-[#C0392B]/20 text-[#C0392B] text-[10px] font-bold px-2.5 py-1 rounded-[20px]">
                          Fine: ₹{item.fine.fine_amount} {item.fine.waived && '(Waived)'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fine button */}
                  {user?.role !== 'admin' && (user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
                    <div className="mt-2.5 flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFineModal(item);
                        }}
                        className="bg-white border border-[#E8E8E8] hover:bg-[#FDECEA] hover:text-[#C0392B] hover:border-[#C0392B]/20 text-[#555555] font-bold text-[10px] px-2.5 py-1 rounded-[12px] flex items-center space-x-1 active:scale-95 transition-all shadow-sm"
                      >
                        <AlertCircle size={13} />
                        <span>Fine</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[14000] bg-black/95 backdrop-blur-md flex flex-col justify-between p-6"
          onClick={() => setSelectedPhoto(null)}
        >
          {/* Top Bar with metadata and close button */}
          <div className="flex justify-between items-start w-full text-white relative z-10">
            <div>
              <h3 className="text-base font-extrabold tracking-tight">
                {selectedPhoto.name || selectedPhoto.label}
              </h3>
              <p className="text-xs text-white/70 font-semibold mt-1">
                {selectedPhoto.label !== 'Check In Photo' && selectedPhoto.label !== 'Check Out Photo' ? selectedPhoto.label : ''}
                {selectedPhoto.date ? ` • ${selectedPhoto.date}` : ''}
                {selectedPhoto.time ? ` • ${selectedPhoto.time}` : ''}
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
              alt="Verification selfie"
              className="max-w-full max-h-[75vh] object-contain rounded-[16px] shadow-2xl border border-white/10"
            />
          </div>

          {/* Bottom actions bar */}
          <div className="flex flex-col items-center space-y-4 pb-4 z-10 w-full max-w-md mx-auto" onClick={(e) => e.stopPropagation()}>
            {selectedPhoto.attendanceId && user?.role === 'ops_manager' && (
              <div className="w-full bg-white/10 backdrop-blur border border-white/20 rounded-[14px] p-4 text-white text-xs space-y-3">
                {selectedPhoto.photo_flagged ? (
                  <div className="space-y-2 text-left">
                    <p className="font-extrabold text-red-400 flex items-center gap-1 text-[11px]">
                      ⚠️ FLAGGED QUALITY ISSUE
                    </p>
                    <p className="text-[10px] text-white/80 font-bold leading-normal">
                      Reason: <span className="font-mono text-white bg-white/10 px-1 py-0.5 rounded">{selectedPhoto.photo_flag_reason}</span>
                    </p>
                    <p className="text-[9px] text-white/60">
                      Flagged by: {selectedPhoto.photo_flagged_by}
                    </p>
                    <button
                      type="button"
                      onClick={handleUnflagPhoto}
                      className="w-full min-h-[36px] bg-red-600 hover:bg-red-700 text-white font-extrabold text-[11px] rounded-[10px] active:scale-95 transition-all cursor-pointer mt-1"
                    >
                      Remove Quality Flag
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 text-left">
                    <p className="font-extrabold text-white/90 text-[11px] flex items-center gap-1">
                      <Flag size={14} /> Flag Photo Quality Issues
                    </p>
                    <div className="flex gap-2">
                      <select
                        id="flag-reason-select"
                        className="flex-1 bg-black text-white border border-white/20 rounded-[10px] px-3 py-2 text-white text-xs focus:outline-none focus:border-white font-semibold [color-scheme:dark]"
                      >
                        <option value="Face covered">Face covered</option>
                        <option value="Photo unclear">Photo unclear</option>
                        <option value="Wrong person suspected">Wrong person suspected</option>
                        <option value="Other">Other</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const select = document.getElementById('flag-reason-select') as HTMLSelectElement;
                          handleFlagPhoto(select?.value || 'Face covered');
                        }}
                        className="bg-white hover:bg-gray-200 text-black font-extrabold text-[11px] px-4 rounded-[10px] active:scale-95 transition-all cursor-pointer"
                      >
                        Flag Photo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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

      {/* Simple Toast Alerts */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)] text-[#4ADE80] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-1">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Special Fine Bottom Sheet */}
      {fineStaff && (
        <SpecialFineBottomSheet
          isOpen={fineModalOpen}
          onClose={() => {
            setFineModalOpen(false);
            setFineStaff(null);
          }}
          staffId={fineStaff.id}
          staffName={fineStaff.name}
          branchId={fineStaff.branch_id}
          onSuccess={(msg) => {
            showToast(msg);
          }}
        />
      )}

      {/* Import/Export Bottom Sheet */}
      {bottomSheetOpen && (
        <div className="fixed inset-0 z-[12000] flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setBottomSheetOpen(false)}
          />
          <div className="bg-white rounded-t-[20px] shadow-lg relative z-10 w-full max-w-md border-t border-[#E8E8E8] flex flex-col max-h-[90vh] animate-slide-up animate-duration-200">
            {/* Header */}
            <div className="p-6 pb-3 border-b border-[#E8E8E8] flex justify-between items-center">
              <h3 className="text-[#1A1A1A] text-base font-bold">Import / Export Attendance</h3>
              <button
                type="button"
                onClick={() => setBottomSheetOpen(false)}
                className="text-[#999999] hover:text-[#1A1A1A] p-1 rounded-full hover:bg-[#F2F2F2]"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 pt-3 overflow-y-auto flex-1 space-y-4">
              {/* Tabs */}
              <div className="flex bg-[#F2F2F2] rounded-[14px] p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('export')}
                  className={`flex-1 text-center py-2 text-xs font-bold rounded-md transition-all ${
                    activeTab === 'export'
                      ? 'bg-white text-[#1A1A1A] shadow-sm'
                      : 'text-[#555555] hover:text-[#1A1A1A]'
                  }`}
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const role = user?.role;
                    const canImport = role === 'admin' || role === 'ops_manager' || (role === 'staff_executive' && user?.branch !== null);
                    if (canImport) {
                      setActiveTab('import');
                    } else {
                      alert('Import is restricted to admins, operations managers, and branch HR only.');
                    }
                  }}
                  className={`flex-1 text-center py-2 text-xs font-bold rounded-md transition-all ${
                    !(user?.role === 'admin' || user?.role === 'ops_manager' || (user?.role === 'staff_executive' && user?.branch !== null)) ? 'opacity-40 cursor-not-allowed' : ''
                  } ${
                    activeTab === 'import'
                      ? 'bg-white text-[#1A1A1A] shadow-sm'
                      : 'text-[#555555] hover:text-[#1A1A1A]'
                  }`}
                >
                  Import
                </button>
              </div>

              {/* Export Content */}
              {activeTab === 'export' && (
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
                      Select Month
                    </label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                    />
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleDownloadGridTemplate(selectedMonth);
                        setBottomSheetOpen(false);
                      }}
                      className="w-full min-h-[46px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-bold text-xs rounded-[12px] flex items-center justify-center space-x-1.5 active:scale-95 transition-all cursor-pointer shadow-sm"
                    >
                      <Download size={16} />
                      <span>Download Grid Template</span>
                    </button>
                    <p className="text-[10px] text-[var(--text-muted)] text-center mt-1">
                      Add staff first to pre-fill the template. You can also fill manually using PIN numbers.
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        handleExportExistingAttendance(selectedMonth);
                        setBottomSheetOpen(false);
                      }}
                      className="w-full min-h-[46px] bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs rounded-[12px] flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow hover:opacity-90 cursor-pointer"
                    >
                      <Download size={16} />
                      <span>Export Existing Attendance</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Import Content */}
              {activeTab === 'import' && (
                <div className="space-y-4 pt-2 flex flex-col items-center">
                  <div className="w-full">
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
                      Select target month context for calculations:
                    </label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold mb-4"
                    />
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx,.csv"
                    className="hidden"
                  />

                  <div className="w-full py-8 border-2 border-dashed border-[#D0D0D0] rounded-[14px] flex flex-col items-center justify-center space-y-3 bg-[#F8F8F8]">
                    <Upload size={32} className="text-[#999999]" />
                    <p className="text-xs text-[#555555] font-semibold text-center px-4">
                      Upload an Excel (.xlsx) template or a CSV file
                    </p>
                    <button
                      type="button"
                      onClick={handleImportButtonClick}
                      className="bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs px-4 py-2 rounded-[12px] active:scale-95 transition-all cursor-pointer"
                    >
                      Choose File
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 pt-3 border-t border-[#E8E8E8] bg-white sticky bottom-0 z-10">
              <button
                type="button"
                onClick={() => setBottomSheetOpen(false)}
                className="w-full min-h-[44px] bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#555555] font-bold text-xs py-2.5 rounded-[12px] active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Import Preview Modal */}
      {importPreviewOpen && (
        <div className="fixed inset-0 z-[13000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { if (!isImporting) setImportPreviewOpen(false); }}
          />
          <div className="bg-white rounded-[14px] shadow-lg relative z-10 p-6 w-full max-w-4xl text-left border border-[#E8E8E8] flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-[#1A1A1A]">Import Preview</h3>
              <button
                type="button"
                onClick={() => setImportPreviewOpen(false)}
                disabled={isImporting}
                className="text-[#999999] hover:text-[#1A1A1A]"
              >
                <X size={20} />
              </button>
            </div>

            {/* Summary Bar */}
            <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 mb-4 flex items-center justify-between text-xs font-semibold text-[#555555]">
              <div>
                <span className="text-[#2D7A3A] font-bold">{importSummary.ready}</span> records ready |{' '}
                <span className="text-[#C0392B] font-bold">{importSummary.errors}</span> errors |{' '}
                <span className="text-[#B8860B] font-bold">{importSummary.overwrites}</span> overwrites
              </div>
              {importProgress && <div className="text-[#1A1A1A] font-bold animate-pulse">{importProgress}</div>}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto border border-[#E8E8E8] rounded-[12px]">
              <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                <thead>
                  <tr className="text-[#999999] uppercase font-bold text-[9px] bg-[#F2F2F2] border-b border-[#E8E8E8] sticky top-0">
                    <th className="p-2.5">Row</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">PIN</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">IN</th>
                    <th className="p-2.5">OUT</th>
                    <th className="p-2.5">Errors / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E8E8]">
                  {importRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-[#F8F8F8] transition-colors ${
                        row.status === 'error'
                          ? 'border-l-4 border-l-[#C0392B]'
                          : row.status === 'overwrite'
                          ? 'border-l-4 border-l-[#B8860B]'
                          : 'border-l-4 border-l-[#2D7A3A]'
                      }`}
                    >
                      <td className="p-2.5 text-[#555555] font-bold">{row.rowIdx}</td>
                      <td className="p-2.5">
                        {row.status === 'error' ? (
                          <span className="text-[#C0392B] font-bold uppercase text-[9px] bg-[#FDECEA] border border-[#C0392B]/20 px-2 py-0.5 rounded-[20px]">
                            Error
                          </span>
                        ) : row.status === 'overwrite' ? (
                          <span className="text-[#B8860B] font-bold uppercase text-[9px] bg-[#FDF8E7] border border-[#B8860B]/20 px-2 py-0.5 rounded-[20px]">
                            Overwrite
                          </span>
                        ) : (
                          <span className="text-[#2D7A3A] font-bold uppercase text-[9px] bg-[#EDF7EF] border border-[#2D7A3A]/20 px-2 py-0.5 rounded-[20px]">
                            Ready
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-[#1A1A1A] font-bold">{row.name || '—'}</td>
                      <td className="p-2.5 font-mono text-[#555555]">{row.pin || '—'}</td>
                      <td className="p-2.5 text-[#555555]">{row.date || '—'}</td>
                      <td className="p-2.5 text-[#555555] font-semibold">{row.inTime || '—'}</td>
                      <td className="p-2.5 text-[#555555] font-semibold">{row.outTime || '—'}</td>
                      <td className="p-2.5 text-xs whitespace-normal">
                        {row.status === 'error' ? (
                          <span className="text-[#C0392B] font-semibold">{row.errors.join(', ')}</span>
                        ) : row.status === 'overwrite' ? (
                          <span className="text-[#B8860B] font-semibold">Record exists for {row.name} on {row.date} — will be updated</span>
                        ) : (
                          <span className="text-[#999999]">Ready to import</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Note at the bottom */}
            <div className="mt-3 text-[10px] text-[var(--text-muted)] font-semibold">
              * Days left empty will not be imported. Kiosk will handle remaining days automatically.
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setImportPreviewOpen(false)}
                disabled={isImporting}
                className="bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#555555] font-bold text-xs px-4 py-2.5 rounded-[12px] active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeImportAttendance('new')}
                disabled={isImporting || importSummary.ready === 0}
                className="bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] text-[#1A1A1A] font-bold text-xs px-4 py-2.5 rounded-[12px] active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                Import new only
              </button>
              <button
                type="button"
                onClick={() => executeImportAttendance('all')}
                disabled={isImporting || (importSummary.ready + importSummary.overwrites) === 0}
                className="bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs px-4 py-2.5 rounded-[12px] active:scale-95 transition-all cursor-pointer shadow-md"
              >
                {isImporting ? 'Importing...' : 'Import all valid'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Attendance Detail Bottom Sheet */}
      {detailModalOpen && detailRecord && (
        <div className="fixed inset-0 z-[12000] flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setDetailModalOpen(false);
              setDetailRecord(null);
            }}
          />
          <div className="bg-white rounded-t-[20px] shadow-lg relative z-10 w-full max-w-md border-t border-[#E8E8E8] flex flex-col max-h-[90vh] animate-slide-up">
            {/* Header */}
            <div className="p-5 pb-3 border-b border-[#E8E8E8] flex justify-between items-center">
              <div>
                <h3 className="text-[#1A1A1A] text-base font-bold">Attendance Details</h3>
                <p className="text-[var(--text-muted)] text-[11px] font-semibold mt-0.5">
                  {detailRecord.name} • {detailRecord.department}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailModalOpen(false);
                  setDetailRecord(null);
                }}
                className="text-[#999999] hover:text-[#1A1A1A] p-1 rounded-full hover:bg-[#F2F2F2]"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 pt-3 overflow-y-auto flex-1 space-y-4">
              {openedLockStatus?.locked && (
                <div className="bg-[#FDECEA] border border-[#C0392B]/20 text-[#C0392B] rounded-[12px] p-3 text-xs flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle size={14} />
                    <span>Attendance for {openedLockStatus.confirmedAt ? openedLockStatus.confirmedAt.substring(0, 7) : 'this month'} is locked.</span>
                  </div>
                  <p className="text-[11px] font-medium leading-normal text-[#C0392B]/80">
                    Salary was confirmed on {openedLockStatus.confirmedAt ? new Date(openedLockStatus.confirmedAt).toLocaleDateString() : 'date'}. Contact admin to unlock.
                  </p>
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const reason = window.prompt("Enter reason to unlock attendance editing for this month:");
                        if (!reason || !reason.trim()) return;
                        const staffId = detailRecord.id;
                        const date = detailRecord.record?.date || addDate || new Date().toISOString().split('T')[0];
                        const month = date.substring(0, 7);
                        
                        const { error: unlockErr } = await supabase
                          .from('salary_confirmations')
                          .update({ is_locked: false })
                          .eq('staff_id', staffId)
                          .eq('month', month);
                          
                        if (unlockErr) {
                          alert("Failed to unlock: " + unlockErr.message);
                          return;
                        }
                        
                        await createAuditLog({
                          action: 'unlock_month',
                          table_name: 'salary_confirmations',
                          record_id: staffId + '_' + month,
                          new_value: { is_locked: false },
                          performed_by: user.email,
                          performed_by_role: user.role,
                          reason: reason.trim()
                        });
                        
                        setOpenedLockStatus({ locked: false });
                        showToast("Month unlocked successfully ✓");
                      }}
                      className="bg-[#C0392B] hover:bg-[#A93226] text-white font-bold text-[10px] uppercase py-1 px-3 rounded-lg self-start mt-1 cursor-pointer active:scale-95 transition-all"
                    >
                      Unlock Month
                    </button>
                  )}
                </div>
              )}

              {(!detailRecord.record || !detailRecord.record.check_in_time) && !isAddingRecord ? (
                <div className="space-y-4">
                  <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-[#1A1A1A]">Mark this day as:</p>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => handleMarkDayType('absent')}
                        className="w-full text-left p-3 rounded-lg border border-[#E8E8E8] hover:border-[#1A1A1A] bg-white text-xs font-bold text-[#1A1A1A] flex items-center justify-between active:scale-[0.99] transition-all"
                      >
                        <span>Absent (salary deducted)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkDayType('weekly_off')}
                        className="w-full text-left p-3 rounded-lg border border-[#E8E8E8] hover:border-[#1A1A1A] bg-white text-xs font-bold text-[#1A1A1A] flex items-center justify-between active:scale-[0.99] transition-all"
                      >
                        <span>Weekly Off (no deduction — uses quota)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkDayType('holiday')}
                        className="w-full text-left p-3 rounded-lg border border-[#E8E8E8] hover:border-[#1A1A1A] bg-white text-xs font-bold text-[#1A1A1A] flex items-center justify-between active:scale-[0.99] transition-all"
                      >
                        <span>Holiday (no deduction)</span>
                      </button>
                    </div>
                  </div>
                  
                  {(user?.role === 'admin' || user?.role === 'ops_manager') && (
                    <button
                      type="button"
                      onClick={() => setIsAddingRecord(true)}
                      className="w-full bg-[#1A1A1A] hover:bg-[#333333] text-white text-xs font-bold py-3 rounded-xl transition-all shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
                    >
                      <span>Add Manual Check-In/Out Record</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Shift details */}
                  <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs flex justify-between">
                    <div>
                      <span className="font-bold text-[#555555]">Shift:</span>{' '}
                      <span className="text-[#1A1A1A] font-semibold">{detailRecord.shift?.label || 'No Shift'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-[#555555]">Hours:</span>{' '}
                      <span className="text-[#1A1A1A] font-semibold">
                        {detailRecord.shift?.start_time} - {detailRecord.shift?.end_time}
                      </span>
                    </div>
                  </div>

                  {/* Read-Only or Form Fields */}
                  {!canEdit ? (
                    <>
                      <div className="space-y-3.5 bg-white border border-[#E8E8E8] rounded-[14px] p-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider">Check-in Time</p>
                            <p className="text-sm font-bold text-[#1A1A1A] mt-0.5">{editCheckInTime || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider">Check-out Time</p>
                            <p className="text-sm font-bold text-[#1A1A1A] mt-0.5">{editCheckOutTime || '—'}</p>
                          </div>
                        </div>
                        <hr className="border-[#E8E8E8]" />
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider">Status</p>
                            <p className="text-sm font-bold text-[#1A1A1A] mt-0.5 capitalize">{editStatus}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider">Reason</p>
                            <p className="text-sm font-bold text-[#1A1A1A] mt-0.5">{editReason || '—'}</p>
                          </div>
                        </div>
                      </div>
                      {detailRecord.record?.override_shift_start && (
                        <div className="bg-sky-50 border border-sky-100 rounded-[12px] p-3 text-xs flex flex-col gap-2 mt-3 text-sky-850">
                          <div className="font-extrabold uppercase text-[9px] tracking-wider border-b border-sky-200/50 pb-1 flex items-center justify-between">
                            <span>Shift Override Active</span>
                            <span className="bg-sky-500 text-white rounded-full px-1.5 py-0.5 text-[8.5px] font-black uppercase">O</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span>Override Shift:</span>
                            <span className="font-mono">{detailRecord.record.override_shift_start} – {detailRecord.record.override_shift_end}</span>
                          </div>
                          {detailRecord.record.override_reason && (
                            <div className="flex justify-between">
                              <span>Reason:</span>
                              <span className="italic">"{detailRecord.record.override_reason}"</span>
                            </div>
                          )}
                          {detailRecord.record.override_approved_by && (
                            <div className="flex justify-between">
                              <span>Approved By:</span>
                              <span>{detailRecord.record.override_approved_by}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-sky-200/50 pt-1 text-sky-700/80 text-[10px]">
                            <span>Normal Shift:</span>
                            <span className="font-mono">{detailRecord.shift?.start_time || '09:00'} – {detailRecord.shift?.end_time || '18:00'}</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-4">
                      {/* Check-In */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Check-in Time</label>
                        <input
                          type="time"
                          value={editCheckInTime}
                          onChange={(e) => {
                            setEditCheckInTime(e.target.value);
                            if (editStatus === 'absent') setEditStatus('present');
                          }}
                          className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                        />
                      </div>

                      {/* Check-Out */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Check-out Time</label>
                        <input
                          type="time"
                          value={editCheckOutTime}
                          onChange={(e) => setEditCheckOutTime(e.target.value)}
                          className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                        />
                      </div>

                      {/* Status */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Status</label>
                        <select
                          value={editStatus}
                          onChange={(e) => {
                            const newStatus = e.target.value as any;
                            setEditStatus(newStatus);
                            if (newStatus === 'absent') {
                              setEditCheckInTime('');
                              setEditCheckOutTime('');
                            }
                          }}
                          className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                        >
                          <option value="present">Present</option>
                          <option value="late">Late</option>
                          <option value="absent">Absent</option>
                        </select>
                      </div>

                      {/* Reason */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Reason (optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. Correcting wrong entry"
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                        />
                      </div>

                      <div className="space-y-3 border-t border-[#E8E8E8] pt-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-[#1A1A1A]">Override shift for this day only</label>
                          <input
                            type="checkbox"
                            checked={overrideShift}
                            onChange={(e) => setOverrideShift(e.target.checked)}
                            className="w-4 h-4 accent-[#1A1A1A] rounded bg-[#F8F8F8] border border-[#E8E8E8]"
                          />
                        </div>
                        
                        {overrideShift && (
                          <div className="space-y-3 bg-[#F8F8F8] p-3 rounded-xl border border-[#E8E8E8]">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-[#555555] mb-1">Shift Start</label>
                                <input
                                  type="time"
                                  value={overrideStart}
                                  onChange={(e) => setOverrideStart(e.target.value)}
                                  className="w-full bg-white border border-[#E8E8E8] rounded-lg p-2 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-[#555555] mb-1">Shift End</label>
                                <input
                                  type="time"
                                  value={overrideEnd}
                                  onChange={(e) => setOverrideEnd(e.target.value)}
                                  className="w-full bg-white border border-[#E8E8E8] rounded-lg p-2 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-[#555555] mb-1">Reason</label>
                              <input
                                type="text"
                                value={overrideReason}
                                onChange={(e) => setOverrideReason(e.target.value)}
                                placeholder="Reason for shift override"
                                className="w-full bg-white border border-[#E8E8E8] rounded-lg p-2 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Calculations Live Preview */}
                  {editStatus !== 'absent' && (
                    <div className="bg-[#1A1A1A] text-white rounded-[14px] p-4 space-y-2.5 shadow">
                      <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Live Metrics Preview</p>
                      <div className="grid grid-cols-3 gap-2 text-center pt-1">
                        <div className="bg-white/5 rounded-lg p-2">
                          <p className="text-[9px] text-white/40 font-bold">Hours Worked</p>
                          <p className="text-sm font-bold text-white mt-0.5">{liveHoursWorked}h</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-2">
                          <p className="text-[9px] text-white/40 font-bold">Status</p>
                          <p className="text-sm font-bold capitalize mt-0.5" style={{
                            color: liveColorCode === 'green' ? '#4ADE80' : liveColorCode === 'yellow' ? '#FBBF24' : liveColorCode === 'orange' ? '#FB923C' : '#F87171'
                          }}>{editStatus}</p>
                        </div>
                        <div className="bg-white/5 rounded-lg p-2">
                          <p className="text-[9px] text-white/40 font-bold">Overtime</p>
                          <p className="text-sm font-bold text-white mt-0.5">{liveOTMinutes}m</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Photo Verification Section */}
                  {detailRecord.record && (
                    <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 shadow-sm space-y-3">
                      <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider">Photo Verification</p>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Check In Column */}
                        <div className="flex flex-col items-center">
                          <span className="text-[11px] font-bold text-[#555555] mb-1.5">Check In</span>
                          {detailRecord.record.check_in_photo ? (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setSelectedPhoto({
                                  url: detailRecord.record.check_in_photo,
                                  name: detailRecord.name,
                                  label: 'Check In Photo',
                                  time: formatTime12hr(detailRecord.record.check_in_time) || '',
                                  date: detailRecord.record.date,
                                  attendanceId: detailRecord.record.id,
                                  photo_flagged: detailRecord.record.photo_flagged,
                                  photo_flag_reason: detailRecord.record.photo_flag_reason || undefined,
                                  photo_flagged_by: detailRecord.record.photo_flagged_by || undefined
                                })}
                                className={`w-full aspect-square max-w-[120px] rounded-[12px] overflow-hidden border shadow-sm relative group hover:opacity-90 active:scale-95 transition-all cursor-pointer ${
                                  detailRecord.record.photo_flagged ? 'border-red-500 ring-2 ring-red-500/20' : 'border-[#E8E8E8]'
                                }`}
                              >
                                <img
                                  src={detailRecord.record.check_in_photo}
                                  alt="Check In Selfie"
                                  className="w-full h-full object-cover"
                                />
                              </button>
                              {detailRecord.record.photo_flagged && (
                                <span className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black border border-white shadow">
                                  ⚠️
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="w-full aspect-square max-w-[120px] rounded-[12px] bg-[#F2F2F2] border border-[#E8E8E8] flex flex-col items-center justify-center text-[#999999]">
                              <Camera size={24} className="mb-1" strokeWidth={1.5} />
                              <span className="text-[9px] font-bold">No Photo</span>
                            </div>
                          )}
                        </div>

                        {/* Check Out Column */}
                        <div className="flex flex-col items-center">
                          <span className="text-[11px] font-bold text-[#555555] mb-1.5">Check Out</span>
                          {detailRecord.record.check_out_photo ? (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setSelectedPhoto({
                                  url: detailRecord.record.check_out_photo,
                                  name: detailRecord.name,
                                  label: 'Check Out Photo',
                                  time: formatTime12hr(detailRecord.record.check_out_time) || '',
                                  date: detailRecord.record.date,
                                  attendanceId: detailRecord.record.id,
                                  photo_flagged: detailRecord.record.photo_flagged,
                                  photo_flag_reason: detailRecord.record.photo_flag_reason || undefined,
                                  photo_flagged_by: detailRecord.record.photo_flagged_by || undefined
                                })}
                                className={`w-full aspect-square max-w-[120px] rounded-[12px] overflow-hidden border shadow-sm relative group hover:opacity-90 active:scale-95 transition-all cursor-pointer ${
                                  detailRecord.record.photo_flagged ? 'border-red-500 ring-2 ring-red-500/20' : 'border-[#E8E8E8]'
                                }`}
                              >
                                <img
                                  src={detailRecord.record.check_out_photo}
                                  alt="Check Out Selfie"
                                  className="w-full h-full object-cover"
                                />
                              </button>
                              {detailRecord.record.photo_flagged && (
                                <span className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black border border-white shadow">
                                  ⚠️
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="w-full aspect-square max-w-[120px] rounded-[12px] bg-[#F2F2F2] border border-[#E8E8E8] flex flex-col items-center justify-center text-[#999999]">
                              <Camera size={24} className="mb-1" strokeWidth={1.5} />
                              <span className="text-[9px] font-bold">No Photo</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Overtime Approval Panel */}
                  {liveOTMinutes > 0 && (
                    <div className="border border-[#E8E8E8] rounded-[14px] p-4 flex items-center justify-between bg-white shadow-sm">
                      <div>
                        <p className="text-xs font-bold text-[#1A1A1A]">Overtime ({liveOTMinutes} minutes)</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">
                          Requires manager approval for payroll payout.
                        </p>
                      </div>
                      <div>
                        {otApproved ? (
                          <span className="bg-[#EDF7EF] border border-[#2D7A3A]/20 text-[#2D7A3A] text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                            <Check size={14} strokeWidth={2.5} />
                            Approved
                          </span>
                        ) : (
                          canEdit ? (
                            <button
                              type="button"
                              onClick={() => setOtApproved(true)}
                              className="bg-[#2D7A3A] hover:bg-[#256330] text-white text-xs font-bold px-3 py-1.5 rounded-[10px] transition-all cursor-pointer active:scale-95 shadow-sm"
                            >
                              Approve OT
                            </button>
                          ) : (
                            <span className="bg-[#F2F2F2] text-[#999999] text-xs font-bold px-3 py-1.5 rounded-full">
                              Pending Approval
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Early Leave Deduction Panel */}
                  {liveEarlyLeaveMinutes > 0 && (
                    <div className="border border-[#E8E8E8] rounded-[14px] p-4 flex items-center justify-between bg-white shadow-sm">
                      <div>
                        <p className="text-xs font-bold text-[#1A1A1A]">Early Leave ({liveEarlyLeaveMinutes} mins)</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">
                          Left before shift end ({formatTime12hr(detailRecord?.shift?.end_time)}).
                        </p>
                      </div>
                      <div>
                        <span className="bg-[#FFF0F0] border border-[#C0392B]/20 text-[#C0392B] text-xs font-bold px-3 py-1.5 rounded-full">
                          -₹{(() => {
                            const salary = detailRecord?.monthly_salary || 0;
                            const shiftHours = detailRecord?.shift?.hours || 9;
                            const recordDate = detailRecord?.record?.date || addDate || new Date().toISOString().split('T')[0];
                            const [yr, mo] = recordDate.split('-').map(Number);
                            const calendarDays = new Date(yr, mo, 0).getDate();
                            const dailyRate = salary / calendarDays;
                            return calculateEarlyLeaveDeduction(liveEarlyLeaveMinutes, dailyRate, shiftHours);
                          })()}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Fine Section */}
                  {editStatus === 'late' && (
                    <div className="border border-[#E8E8E8] rounded-[14px] p-4 bg-white shadow-sm space-y-3.5">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold text-[#1A1A1A]">Late Penalty Fine</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">
                            Color code: <span className="capitalize font-bold text-[#1A1A1A]">{liveColorCode}</span>
                          </p>
                        </div>
                        {editFineWaived ? (
                          <span className="bg-[#F2F2F2] border border-[#E8E8E8] text-[#555555] text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                            Waived
                          </span>
                        ) : (
                          <span className="bg-[#FDECEA] border border-[#C0392B]/20 text-[#C0392B] text-xs font-bold px-2.5 py-1 rounded-full">
                            ₹{editFineAmount}
                          </span>
                        )}
                      </div>

                      {canEdit && (
                        <div className="pt-1.5 space-y-3 border-t border-[#E8E8E8]/60">
                          {/* Edit Amount */}
                          <div className="flex items-center gap-3">
                            <label className="text-xs font-bold text-[#555555] whitespace-nowrap">Fine Amount (₹)</label>
                            <input
                              type="number"
                              disabled={editFineWaived}
                              value={editFineAmount}
                              onChange={(e) => setEditFineAmount(Number(e.target.value))}
                              className="w-24 bg-[#F8F8F8] border border-[#E8E8E8] rounded-[8px] p-1.5 text-xs text-center focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold disabled:opacity-50"
                            />
                          </div>

                          {/* Waive Checkbox */}
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={editFineWaived}
                              onChange={(e) => setEditFineWaived(e.target.checked)}
                              className="rounded border-[#D0D0D0] text-[#1A1A1A] focus:ring-[#1A1A1A] w-4 h-4"
                            />
                            <span className="text-xs font-bold text-[#555555]">Waive late penalty fine</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Break logs list */}
                  {breakLogs.filter(b => b.staff_id === detailRecord.id).length > 0 && (
                    <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-[14px] p-4 space-y-2">
                      <p className="text-[10px] text-[#999999] font-bold uppercase tracking-wider">Break History (Today)</p>
                      <div className="space-y-1.5">
                        {breakLogs.filter(b => b.staff_id === detailRecord.id).map((b, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs text-[#555555]">
                            <span>Break {idx + 1}: {b.break_start} - {b.break_end || 'ongoing'}</span>
                            <span className="font-semibold">{b.duration_minutes ? `${b.duration_minutes}m` : '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Sticky Action Footer */}
            {canEdit && (detailRecord.record || isAddingRecord) && (
              <div className="p-5 border-t border-[#E8E8E8] bg-white sticky bottom-0 z-10 flex gap-3">
                {detailRecord.record && (
                  <button
                    type="button"
                    onClick={handleDeleteDetail}
                    className="flex-1 min-h-[44px] bg-white border border-[#C0392B]/20 text-[#C0392B] hover:bg-[#FDECEA] font-bold text-xs rounded-[12px] active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                  >
                    Delete Record
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveDetail}
                  className="flex-1 min-h-[44px] bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs rounded-[12px] active:scale-95 transition-all flex items-center justify-center shadow-md cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Record Confirmation Dialog */}
      {deleteConfirmOpen && deleteRecord && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setDeleteConfirmOpen(false);
              setDeleteRecord(null);
            }}
          />
          <div className="bg-white rounded-[14px] border border-[#E8E8E8] p-5 relative z-10 max-w-sm w-full shadow-lg">
            <h3 className="text-[#1A1A1A] text-base font-bold mb-2">Delete Record?</h3>
            <p className="text-xs text-[#555555] font-semibold leading-relaxed mb-5">
              Delete attendance for <span className="font-bold text-[#1A1A1A]">{deleteRecord.name}</span> on <span className="font-bold text-[#1A1A1A]">{deleteRecord.record.date}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteRecord(null);
                }}
                className="bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#555555] font-bold text-xs px-4 py-2.5 rounded-[12px] active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="bg-[#C0392B] hover:bg-[#B03020] text-white font-bold text-xs px-4 py-2.5 rounded-[12px] active:scale-95 transition-all cursor-pointer shadow-md"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Attendance Record Bottom Sheet */}
      {addModalOpen && (
        <div className="fixed inset-0 z-[12000] flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setAddModalOpen(false)}
          />
          <div
            className="bg-white rounded-t-[20px] shadow-lg relative z-10 w-full max-w-md border-t border-[#E8E8E8] flex flex-col max-h-[90vh] animate-slide-up"
          >
            {/* Header */}
            <div className="p-5 pb-3 border-b border-[#E8E8E8] flex-shrink-0 flex justify-between items-center">
              <div>
                <h3 className="text-[#1A1A1A] text-base font-bold">Add Attendance Record</h3>
              </div>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="text-[#999999] hover:text-[#1A1A1A] p-1 rounded-full hover:bg-[#F2F2F2]"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 pt-3 overflow-y-auto flex-1 space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Select Staff</label>
                  <select
                    value={addStaffId}
                    onChange={(e) => setAddStaffId(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                  >
                    <option value="">-- Choose Staff member --</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.department}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Date</label>
                  <input
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Check-in Time</label>
                  <input
                    type="time"
                    value={addCheckIn}
                    onChange={(e) => setAddCheckIn(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Check-out Time</label>
                  <input
                    type="time"
                    value={addCheckOut}
                    onChange={(e) => setAddCheckOut(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Status</label>
                  <select
                    value={addStatus}
                    onChange={(e) => setAddStatus(e.target.value as any)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                  >
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">Reason (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Manual entry"
                    value={addReason}
                    onChange={(e) => setAddReason(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                  />
                </div>
              </div>
            </div>

            {/* Sticky Action Footer */}
            <div className="p-5 border-t border-[#E8E8E8] bg-white sticky bottom-0 z-10 flex gap-3">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="flex-1 min-h-[44px] bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] text-[#555555] font-bold text-xs rounded-[12px] active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAdd}
                className="flex-1 min-h-[44px] bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs rounded-[12px] active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-md"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating Action Button */}
      {(user?.role === 'admin' || user?.role === 'ops_manager') && (
        <button
          onClick={() => {
            setAddStaffId('');
            setAddDate(selectedDate);
            setAddCheckIn('');
            setAddCheckOut('');
            setAddStatus('present');
            setAddReason('');
            setAddModalOpen(true);
          }}
          className="fixed bottom-[90px] right-4 w-14 h-14 bg-black hover:bg-[#333] active:scale-95 text-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.2)] z-[10000] transition-all cursor-pointer"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

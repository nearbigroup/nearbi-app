'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createAuditLog } from '@/lib/audit';
import { Search, Plus, Trash2, Edit2, Eye, EyeOff, Lock, X, AlertTriangle, Users, AlertCircle, RefreshCw, Cake, Download, Upload, Check, Phone } from 'lucide-react';
import SpecialFineBottomSheet from '@/components/SpecialFineBottomSheet';
import * as XLSX from 'xlsx';
import { DEPARTMENTS } from '@/lib/data';


interface Shift {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
  hours: number;
}

interface StaffMember {
  id: string;
  name: string;
  pin: string;
  branch_id: string;
  department: string;
  shift_id: string;
  pay_type?: string;
  standard_hours?: number;
  off_days_per_month: number;
  monthly_salary: number;
  join_date: string;
  date_of_birth?: string | null;
  mobile_number?: string | null;
  profile_pending?: boolean;
  active: boolean;
  shift?: Shift;
  staff_accounts?: {
    id: string;
    mobile_number: string;
    last_login?: string | null;
  }[];
}

export default function StaffPage() {
  const router = useRouter();
  const { user, userBranch, canSeeSalaryBreakdown } = useAuth();
  
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [profileFilter, setProfileFilter] = useState<'all' | 'incomplete'>('all');
  
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Add staff form state
  const [formData, setFormData] = useState({
    name: '',
    pin: '',
    branch_id: '',
    department: '',
    shift_id: '',
    pay_type: 'fixed_shift',
    standard_hours: 234,
    off_days_per_month: 4,
    monthly_salary: '',
    join_date: '',
    date_of_birth: '',
    mobile_number: '',
  });
  
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Custom Shift state
  const [isCustomShift, setIsCustomShift] = useState(false);
  const [customShift, setCustomShift] = useState({
    label: '',
    start_time: '',
    end_time: '',
  });
  const [customShiftError, setCustomShiftError] = useState('');
  const [customShiftLoading, setCustomShiftLoading] = useState(false);

  // Show PIN visibility mappings
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});

  // Delete staff state
  const [deleteModeId, setDeleteModeId] = useState<string | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState('');
  const [singleDeleteConfirmText, setSingleDeleteConfirmText] = useState('');

  // Special Fine Modal State
  const [fineModalOpen, setFineModalOpen] = useState(false);
  const [fineStaff, setFineStaff] = useState<any>(null);

  // Performance Scores State
  const [calculatingScores, setCalculatingScores] = useState(false);
  const [scoresMap, setScoresMap] = useState<Record<string, any>>({});

  // DOB Edit State
  const [editingDobStaffId, setEditingDobStaffId] = useState<string | null>(null);
  const [editingDobValue, setEditingDobValue] = useState('');

  const handleSaveDob = async (staffId: string) => {
    try {
      const { error } = await supabase
        .from('staff')
        .update({ date_of_birth: editingDobValue || null })
        .eq('id', staffId);

      if (error) throw error;
      showToast('DOB updated');
      setEditingDobStaffId(null);
      fetchStaff();
    } catch (e: any) {
      console.error(e);
      showToast('Failed to update DOB');
    }
  };

  // Edit Staff Modal State
  const [editStaffModalOpen, setEditStaffModalOpen] = useState(false);
  const [editStaffForm, setEditStaffForm] = useState({
    id: '',
    name: '',
    pin: '',
    branch_id: '',
    department: '',
    shift_id: '',
    pay_type: 'fixed_shift',
    standard_hours: 234,
    off_days_per_month: 4,
    monthly_salary: '',
    join_date: '',
    date_of_birth: '',
    mobile_number: '',
  });
  const [originalShiftId, setOriginalShiftId] = useState('');
  const [originalPin, setOriginalPin] = useState('');
  const [showShiftConfirm, setShowShiftConfirm] = useState(false);
  const [editIsCustomShift, setEditIsCustomShift] = useState(false);
  const [editCustomShift, setEditCustomShift] = useState({
    label: '',
    start_time: '',
    end_time: '',
  });
  const [editCustomShiftError, setEditCustomShiftError] = useState('');
  const [editCustomShiftLoading, setEditCustomShiftLoading] = useState(false);

  const recalculateMonthFines = async (staffId: string, newShiftId: string): Promise<number> => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const currentMonthStr = `${year}-${String(month).padStart(2, '0')}`;
    const firstDay = `${currentMonthStr}-01`;
    const lastDayNum = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

    // Fetch new shift details
    const { data: newShift, error: shiftErr } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', newShiftId)
      .single();

    if (shiftErr || !newShift) throw shiftErr || new Error('New shift not found');

    // Fetch all attendance for this month
    const { data: attRecords, error: attErr } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', staffId)
      .gte('date', firstDay)
      .lte('date', lastDay);

    if (attErr) throw attErr;

    // Fetch fine settings
    const { data: fineSettings } = await supabase
      .from('fine_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    const settings = fineSettings || {
      yellow_fine: 50,
      orange_fine: 100,
      red_fine: 200,
      yellow_free_passes: 4
    };

    // Keep track of yellow passes
    let yellowPassCount = 0;
    let affectedCount = 0;

    // Sort attendance records by date to process chronologically for free passes
    const sortedRecords = [...(attRecords || [])].sort((a, b) => a.date.localeCompare(b.date));

    for (const r of sortedRecords) {
      if (!r.check_in_time) continue;

      const [sh, sm] = newShift.start_time.split(':').map(Number);
      const [ch, cm] = r.check_in_time.split(':').map(Number);
      const shiftStartMins = sh * 60 + sm;
      const checkInMins = ch * 60 + cm;

      const minutesLate = Math.max(0, checkInMins - shiftStartMins);
      let status: 'present' | 'late' = 'present';
      let colorCode: 'green' | 'yellow' | 'orange' | 'red' = 'green';

      if (minutesLate > 0) {
        if (minutesLate > 5) {
          status = 'late';
        }
        if (minutesLate <= 15) {
          colorCode = 'yellow';
        } else if (minutesLate <= 30) {
          colorCode = 'orange';
        } else {
          colorCode = 'red';
        }
      }

      // Recalculate OT minutes if not approved
      let otMinutes = r.ot_minutes || 0;
      if (!r.ot_approved && r.check_out_time) {
        const [eh, em] = newShift.end_time.split(':').map(Number);
        const [coh, com] = r.check_out_time.split(':').map(Number);
        const shiftEndMins = eh * 60 + em;
        const checkOutMins = coh * 60 + com;
        const otDiff = checkOutMins - shiftEndMins;
        otMinutes = otDiff >= 30 ? otDiff : 0;
      }

      // Recalculate early leave minutes
      let earlyLeaveMinutes = r.early_leave_minutes || 0;
      if (r.check_out_time) {
        const [eh, em] = newShift.end_time.split(':').map(Number);
        const [coh, com] = r.check_out_time.split(':').map(Number);
        const shiftEndMins = eh * 60 + em;
        const checkOutMins = coh * 60 + com;
        earlyLeaveMinutes = Math.max(0, shiftEndMins - checkOutMins);
      }

      // Recalculate early check-in minutes (Fix 8)
      const earlyInMinutes = Math.max(0, shiftStartMins - checkInMins);

      // Fetch existing fine
      const { data: existingFine } = await supabase
        .from('late_fines')
        .select('*')
        .eq('staff_id', staffId)
        .eq('date', r.date)
        .maybeSingle();

      const isFineLocked = existingFine?.confirmed === true || existingFine?.waived === true;

      // Update attendance record
      const { error: attUpdateErr } = await supabase
        .from('attendance')
        .update({
          minutes_late: minutesLate,
          color_code: colorCode,
          status: status,
          ot_minutes: otMinutes,
          early_leave_minutes: earlyLeaveMinutes,
          early_in_minutes: earlyInMinutes
        })
        .eq('id', r.id);

      if (attUpdateErr) throw attUpdateErr;
      affectedCount++;

      // Check fine exemptions
      const { data: exemption } = await supabase
        .from('staff_fine_exemptions')
        .select('id')
        .eq('staff_id', staffId)
        .maybeSingle();

      if (exemption) {
        if (!isFineLocked) {
          // Exempt staff: delete any existing fine for this date
          await supabase
            .from('late_fines')
            .delete()
            .eq('staff_id', staffId)
            .eq('date', r.date);
        }
        continue;
      }

      if (colorCode === 'green') {
        if (!isFineLocked) {
          // Delete fine
          await supabase
            .from('late_fines')
            .delete()
            .eq('staff_id', staffId)
            .eq('date', r.date);
        }
      } else {
        let fineAmount = 0;
        if (colorCode === 'yellow') {
          if (yellowPassCount >= settings.yellow_free_passes) {
            fineAmount = Number(settings.yellow_fine);
          }
          yellowPassCount++;
        } else if (colorCode === 'orange') {
          fineAmount = Number(settings.orange_fine);
        } else if (colorCode === 'red') {
          fineAmount = Number(settings.red_fine);
        }

        if (!isFineLocked) {
          if (fineAmount > 0) {
            const { error: fineUpsertErr } = await supabase
              .from('late_fines')
              .upsert({
                staff_id: staffId,
                date: r.date,
                late_minutes: minutesLate,
                color_code: colorCode,
                fine_amount: fineAmount,
                waived: false,
                month: currentMonthStr
              }, { onConflict: 'staff_id,date' });

            if (fineUpsertErr) throw fineUpsertErr;
          } else {
            await supabase
              .from('late_fines')
              .delete()
              .eq('staff_id', staffId)
              .eq('date', r.date);
          }
        }
      }
    }

    return affectedCount;
  };

  const handleOpenEditStaff = (s: StaffMember) => {
    setEditStaffForm({
      id: s.id,
      name: s.name,
      pin: s.pin,
      branch_id: s.branch_id || '',
      department: s.department,
      shift_id: s.shift_id || '',
      pay_type: s.pay_type || 'fixed_shift',
      standard_hours: s.standard_hours !== undefined ? Number(s.standard_hours) : 234,
      off_days_per_month: s.off_days_per_month as any,
      monthly_salary: s.monthly_salary ? String(s.monthly_salary) : '',
      join_date: s.join_date ? s.join_date.substring(0, 10) : '',
      date_of_birth: s.date_of_birth ? s.date_of_birth.substring(0, 10) : '',
      mobile_number: s.mobile_number || '',
    });
    setOriginalShiftId(s.shift_id || '');
    setOriginalPin(s.pin);
    setEditIsCustomShift(false);
    setEditStaffModalOpen(true);
  };

  const handleEditAddCustomShift = async () => {
    setEditCustomShiftError('');
    if (!editCustomShift.label || !editCustomShift.start_time || !editCustomShift.end_time) {
      setEditCustomShiftError('All custom shift fields are required');
      return;
    }

    const [sh, sm] = editCustomShift.start_time.split(':').map(Number);
    const [eh, em] = editCustomShift.end_time.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    if (endMins <= startMins) {
      setEditCustomShiftError('End time must be after start time');
      return;
    }

    const durationHours = parseFloat(((endMins - startMins) / 60).toFixed(2));
    setEditCustomShiftLoading(true);

    try {
      const shiftId = 'shift_' + Date.now();
      const payload = {
        id: shiftId,
        label: editCustomShift.label,
        start_time: editCustomShift.start_time,
        end_time: editCustomShift.end_time,
        hours: durationHours,
      };

      const { error } = await supabase.from('shifts').insert(payload);
      if (error) throw error;

      await fetchShifts();
      setEditStaffForm((prev) => ({ ...prev, shift_id: shiftId }));
      setEditIsCustomShift(false);
      setEditCustomShift({ label: '', start_time: '', end_time: '' });
    } catch (err: any) {
      console.error(err);
      setEditCustomShiftError(err.message || 'Failed to create shift');
    } finally {
      setEditCustomShiftLoading(false);
    }
  };

  const handleSaveEditStaff = async (recalculateFines = false) => {
    setFormLoading(true);
    setFormError('');
    try {
      const {
        id,
        name,
        pin,
        branch_id,
        department,
        shift_id,
        pay_type,
        standard_hours,
        off_days_per_month,
        monthly_salary,
        join_date,
        date_of_birth,
        mobile_number,
      } = editStaffForm;

      if (!name || !pin || !branch_id || !department || !join_date) {
        setFormError('Name, PIN, Branch, Department, and Join Date are required');
        setFormLoading(false);
        return;
      }

      if (!/^\d{4}$/.test(pin)) {
        setFormError('PIN must be exactly 4 digits');
        setFormLoading(false);
        return;
      }

      if (pin !== originalPin) {
        const { data: existingPin } = await supabase
          .from('staff')
          .select('id')
          .eq('pin', pin)
          .eq('active', true)
          .maybeSingle();
        if (existingPin) {
          setFormError('This PIN is already in use by another active staff member');
          setFormLoading(false);
          return;
        }
      }

      const oldStaff = staff.find(s => s.id === id);

      const updatePayload: any = {
        name,
        pin,
        branch_id,
        department,
        shift_id: pay_type === 'hourly' ? null : (shift_id || null),
        pay_type,
        standard_hours: pay_type === 'hourly' ? Number(standard_hours) : 234,
        off_days_per_month,
        monthly_salary: Number(monthly_salary),
        join_date,
        date_of_birth: date_of_birth || null,
        mobile_number: mobile_number || null,
      };

      const { error: updateErr } = await supabase
        .from('staff')
        .update(updatePayload)
        .eq('id', id);

      if (updateErr) throw updateErr;

      if (oldStaff) {
        if (oldStaff.shift_id !== shift_id) {
          await createAuditLog({
            action: 'shift_change',
            table_name: 'staff',
            record_id: id,
            old_value: { shift_id: oldStaff.shift_id },
            new_value: { shift_id: shift_id },
            performed_by: user?.email || 'admin',
            performed_by_role: user?.role || 'admin',
            reason: 'Staff shift updated'
          });
        }
        if (Number(oldStaff.monthly_salary) !== Number(monthly_salary)) {
          await createAuditLog({
            action: 'salary_change',
            table_name: 'staff',
            record_id: id,
            old_value: { monthly_salary: oldStaff.monthly_salary },
            new_value: { monthly_salary: Number(monthly_salary) },
            performed_by: user?.email || 'admin',
            performed_by_role: user?.role || 'admin',
            reason: 'Staff salary updated'
          });
        }
        await createAuditLog({
          action: 'update_staff',
          table_name: 'staff',
          record_id: id,
          old_value: {
            name: oldStaff.name,
            pin: oldStaff.pin,
            branch_id: oldStaff.branch_id,
            department: oldStaff.department,
            shift_id: oldStaff.shift_id,
            off_days_per_month: oldStaff.off_days_per_month,
            monthly_salary: oldStaff.monthly_salary,
            join_date: oldStaff.join_date,
            date_of_birth: oldStaff.date_of_birth,
            mobile_number: oldStaff.mobile_number,
            pay_type: oldStaff.pay_type,
            standard_hours: oldStaff.standard_hours,
          },
          new_value: updatePayload,
          performed_by: user?.email || 'admin',
          performed_by_role: user?.role || 'admin',
          reason: 'Staff details updated'
        });
      }

      if (pin !== originalPin) {
        const { data: account } = await supabase
          .from('staff_accounts')
          .select('id')
          .eq('staff_id', id)
          .maybeSingle();

        if (account) {
          await supabase
            .from('staff_accounts')
            .update({ password: pin, must_change_password: true })
            .eq('id', account.id);
        }
      }

      if (recalculateFines) {
        if (pay_type !== 'hourly' && shift_id) {
          const count = await recalculateMonthFines(id, shift_id);
          await createAuditLog({
            action: 'recalculate_month_attendance',
            table_name: 'attendance',
            record_id: id,
            new_value: { staff_id: id, new_shift_id: shift_id, affected_count: count },
            performed_by: user?.email || 'admin',
            performed_by_role: user?.role || 'admin',
            reason: `Recalculated ${count} attendance records for shift change`
          });
          showToast('Fines recalculated ✓');
        }
      }

      showToast('Staff updated ✓');
      setEditStaffModalOpen(false);
      setShowShiftConfirm(false);
      fetchStaff();
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'Failed to update staff');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isShiftChanged = editStaffForm.shift_id !== originalShiftId;
    const isHourly = editStaffForm.pay_type === 'hourly';

    if (isShiftChanged && !isHourly && editStaffForm.shift_id) {
      setShowShiftConfirm(true);
    } else {
      await handleSaveEditStaff(false);
    }
  };

  // Staff Import/Export States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const calculateHours = (start: string, end: string): number => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let startMins = sh * 60 + sm;
    let endMins = eh * 60 + em;
    if (endMins < startMins) {
      endMins += 24 * 60;
    }
    return parseFloat(((endMins - startMins) / 60).toFixed(2));
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

  const handleImportStaffClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuf = evt.target?.result as ArrayBuffer;
        if (!arrayBuf) return;
        const data = new Uint8Array(arrayBuf);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws) as any[];

        if (rows.length === 0) {
          alert('No rows found in sheet');
          return;
        }

        // Fetch all existing active pins and mobile numbers from Supabase first
        const { data: existingStaff, error: pinError } = await supabase
          .from('staff')
          .select('pin, name, mobile_number')
          .eq('active', true);
        if (pinError) throw pinError;
        
        const existingPins = new Set(existingStaff?.map(s => s.pin) || []);
        const existingMobiles = new Set(
          (existingStaff || [])
            .map(s => s.mobile_number)
            .filter(Boolean) as string[]
        );

        const { data: existingAccs, error: accError } = await supabase
          .from('staff_accounts')
          .select('mobile_number');
        if (!accError && existingAccs) {
          existingAccs.forEach(acc => {
            if (acc.mobile_number) {
              existingMobiles.add(acc.mobile_number);
            }
          });
        }

        const validatedRows = rows.map((row: any, idx: number) => {
          const errors: string[] = [];
          const name = row.name ? String(row.name).trim() : '';
          const pin = row.pin ? String(row.pin).trim() : '';
          const branchRaw = row.branch ? String(row.branch).trim() : '';
          const deptRaw = row.department ? String(row.department).trim() : '';
          const shift_start = row.shift_start ? String(row.shift_start).trim() : '';
          const shift_end = row.shift_end ? String(row.shift_end).trim() : '';
          const off_days = row.off_days_per_month !== undefined ? Number(row.off_days_per_month) : NaN;
          const salary = row.monthly_salary !== undefined ? Number(row.monthly_salary) : NaN;
          const join_date_raw = row.join_date;
          const dob_raw = row.date_of_birth;
          const mobile_number = row.mobile_number ? String(row.mobile_number).trim() : '';

          // Check if it's the example row
          const isExample = pin === '0000' || name.toLowerCase() === 'example staff';

          if (isExample) {
            return {
              rowIdx: idx + 1,
              name,
              pin,
              branchRaw,
              branchId: '',
              department: deptRaw,
              shift_start,
              shift_end,
              off_days_per_month: off_days,
              monthly_salary: salary,
              join_date: '',
              date_of_birth: null,
              mobile_number: '',
              errors: [],
              isExample: true,
              isValid: false
            };
          }

          // 1. name validation
          if (!name) {
            errors.push('Name is required');
          }

          // 2. PIN validation
          if (!pin) {
            errors.push('PIN is required');
          } else if (!/^\d{4}$/.test(pin)) {
            errors.push('PIN must be exactly 4 digits');
          } else if (existingPins.has(pin)) {
            errors.push(`PIN ${pin} already exists in system`);
          }

          // 3. branch validation
          let branchId = '';
          const branchLower = branchRaw.toLowerCase();
          if (branchLower === 'nearbi daily') {
            branchId = 'daily';
          } else if (branchLower === 'nearbi hypermarket') {
            branchId = 'hypermarket';
          } else {
            errors.push('Invalid branch — must be Nearbi Daily or Nearbi Hypermarket');
          }

          // 4. department validation
          const validDepts = DEPARTMENTS.map(d => d.toLowerCase());
          const deptMatch = DEPARTMENTS.find(d => d.toLowerCase() === deptRaw.toLowerCase());
          let department = deptMatch || '';
          if (!deptRaw) {
            errors.push('Department is required');
          } else if (!validDepts.includes(deptRaw.toLowerCase())) {
            errors.push('Invalid department: ' + deptRaw);
          }


          // 5. shift_start/end validation
          if (!shift_start || !/^\d{2}:\d{2}$/.test(shift_start)) {
            errors.push('Shift start must be in HH:MM format');
          }
          if (!shift_end || !/^\d{2}:\d{2}$/.test(shift_end)) {
            errors.push('Shift end must be in HH:MM format');
          }

          // 6. off_days_per_month validation
          if (isNaN(off_days) || (off_days !== 0 && off_days !== 2 && off_days !== 4)) {
            errors.push('off_days must be 0, 2 or 4');
          }

          // 7. monthly_salary validation
          if (isNaN(salary) || salary <= 0) {
            errors.push('Monthly salary must be a positive number');
          }

          // 8. join_date validation
          const parsedJoinDate = parseDate(join_date_raw);
          if (!parsedJoinDate || isNaN(Date.parse(parsedJoinDate))) {
            errors.push('Join date must be a valid date');
          }

          // 9. date_of_birth validation (optional)
          let parsedDob = '';
          if (dob_raw) {
            parsedDob = parseDate(dob_raw);
            if (!parsedDob || isNaN(Date.parse(parsedDob))) {
              errors.push('Date of birth must be a valid date');
            }
          }

          // 10. mobile_number validation (optional)
          if (mobile_number) {
            if (!/^\d{10}$/.test(mobile_number)) {
              errors.push('Mobile number must be exactly 10 digits');
            } else if (existingMobiles.has(mobile_number)) {
              errors.push(`Mobile number ${mobile_number} already in use`);
            }
          }

          return {
            rowIdx: idx + 1,
            name,
            pin,
            branchRaw,
            branchId,
            department,
            shift_start,
            shift_end,
            off_days_per_month: off_days,
            monthly_salary: salary,
            join_date: parsedJoinDate,
            date_of_birth: parsedDob || null,
            mobile_number,
            errors,
            isExample: false,
            isValid: errors.length === 0
          };
        });

        // Add pins & mobiles from the spreadsheet itself to avoid importing duplicate pins/mobiles within the file
        const filePins = new Map<string, number>();
        const fileMobiles = new Map<string, number>();
        validatedRows.forEach((vr) => {
          if (vr.isExample) return;
          if (vr.pin && /^\d{4}$/.test(vr.pin)) {
            if (filePins.has(vr.pin)) {
              vr.errors.push(`Duplicate PIN ${vr.pin} inside the file`);
              vr.isValid = false;
            } else {
              filePins.set(vr.pin, vr.rowIdx);
            }
          }
          if (vr.mobile_number && /^\d{10}$/.test(vr.mobile_number)) {
            if (fileMobiles.has(vr.mobile_number)) {
              vr.errors.push(`Duplicate Mobile ${vr.mobile_number} inside the file`);
              vr.isValid = false;
            } else {
              fileMobiles.set(vr.mobile_number, vr.rowIdx);
            }
          }
        });

        setImportRows(validatedRows);
        setImportPreviewOpen(true);
      } catch (err: any) {
        console.error(err);
        alert('Failed to parse Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const executeImportStaff = async () => {
    const validRows = importRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('No valid rows to import');
      return;
    }

    setIsImporting(true);
    try {
      // Fetch current shifts to avoid redundant inserts
      const { data: currentShifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('*');
      if (shiftsError) throw shiftsError;

      const shiftMap = new Map<string, string>(); // "start-end" -> id
      currentShifts?.forEach(s => {
        shiftMap.set(`${s.start_time}-${s.end_time}`, s.id);
      });

      const total = validRows.length;
      for (let i = 0; i < total; i++) {
        const row = validRows[i];
        setImportProgress(`Importing ${i + 1} / ${total}...`);

        // Find or create shift
        const shiftKey = `${row.shift_start}-${row.shift_end}`;
        let shiftId = shiftMap.get(shiftKey);

        if (!shiftId) {
          const hours = calculateHours(row.shift_start, row.shift_end);
          const newShiftId = 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
          const newShift = {
            id: newShiftId,
            label: `${row.shift_start} – ${row.shift_end}`,
            start_time: row.shift_start,
            end_time: row.shift_end,
            hours
          };

          const { error: insShiftErr } = await supabase.from('shifts').insert(newShift);
          if (insShiftErr) throw insShiftErr;

          shiftId = newShiftId;
          shiftMap.set(shiftKey, shiftId);
        }

        // Insert staff
        const { data: newStaffData, error: staffErr } = await supabase.from('staff').insert({
          name: row.name,
          pin: row.pin,
          branch_id: row.branchId,
          department: row.department,
          shift_id: shiftId,
          off_days_per_month: row.off_days_per_month,
          monthly_salary: row.monthly_salary,
          join_date: row.join_date,
          date_of_birth: row.date_of_birth,
          mobile_number: row.mobile_number || null,
          active: true
        }).select('id');

        if (staffErr) throw staffErr;
        const insertedStaffId = newStaffData?.[0]?.id;

        // Auto-create staff account if mobile_number is provided
        if (row.mobile_number && insertedStaffId) {
          const { error: accErr } = await supabase.from('staff_accounts').insert({
            staff_id: insertedStaffId,
            mobile_number: row.mobile_number,
            password: row.pin, // PIN is default password
            must_change_password: true
          });
          if (accErr) throw accErr;
        }

        await createAuditLog({
          action: 'create_staff',
          table_name: 'staff',
          record_id: insertedStaffId,
          new_value: {
            name: row.name,
            pin: row.pin,
            branch_id: row.branchId,
            department: row.department,
            shift_id: shiftId,
            off_days_per_month: row.off_days_per_month,
            monthly_salary: row.monthly_salary,
            join_date: row.join_date,
            date_of_birth: row.date_of_birth,
            mobile_number: row.mobile_number,
          },
          performed_by: user?.email || 'admin',
          performed_by_role: user?.role || 'admin',
          reason: 'Bulk staff import'
        });
        
        // Log to wall
        try {
          await supabase.from('wall_events').insert({
            event_type: 'staff_added',
            staff_id: null,
            staff_name: row.name,
            branch_id: row.branchId,
            description: `${row.name} imported via Bulk Staff Import`
          });
        } catch (we) {
          console.error(we);
        }
      }

      showToast(`${total} staff imported`);
      setImportPreviewOpen(false);
      fetchStaff();
    } catch (err: any) {
      console.error(err);
      alert(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleDownloadStaffTemplate = () => {
    try {
      const headers = [
        'name',
        'pin',
        'branch',
        'department',
        'shift_start',
        'shift_end',
        'off_days_per_month',
        'monthly_salary',
        'join_date',
        'date_of_birth',
        'mobile_number'
      ];

      const rows = [
        {
          name: 'Example Staff',
          pin: '0000',
          branch: 'Nearbi Daily',
          department: 'Fulfillment',
          shift_start: '09:00',
          shift_end: '18:00',
          off_days_per_month: 4,
          monthly_salary: 15000,
          join_date: '01/01/2026',
          date_of_birth: '01/01/2000',
          mobile_number: '9876543210'
        }
      ];

      const wb = XLSX.utils.book_new();
      const wsStaff = XLSX.utils.json_to_sheet(rows, { header: headers });
      XLSX.utils.book_append_sheet(wb, wsStaff, 'Staff Register');

      const instructions = [
        ['HOW TO FILL THIS TEMPLATE'],
        ['name - Full staff name (required)'],
        ['pin - Exactly 4 digits, must be unique (required)'],
        ['branch - Must be: Nearbi Daily OR Nearbi Hypermarket'],
        [`department - Must be: ${DEPARTMENTS.join(' / ')}`],
        ['shift_start - Time in HH:MM format e.g. 09:00'],
        ['shift_end - Time in HH:MM format e.g. 18:00'],
        ['off_days_per_month - Must be: 0 or 2 or 4'],
        ['monthly_salary - Numbers only, no symbols'],
        ['join_date - Format: DD/MM/YYYY'],
        ['date_of_birth - Format: DD/MM/YYYY (optional)'],
        ['mobile_number - 10-digit mobile number for portal login (optional)'],
        ['DO NOT change column headers'],
        ['The first row is an example row (Example Staff, PIN 0000) and will be skipped by the importer. Leave it as is or delete it.']
      ];
      const wsIns = XLSX.utils.aoa_to_sheet(instructions);
      XLSX.utils.book_append_sheet(wb, wsIns, 'Instructions');

      const filename = `Nearbi_Staff_Template.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err: any) {
      console.error(err);
      alert('Failed to download staff template.');
    }
  };

  const handleExportStaff = async () => {
    try {
      let query = supabase
        .from('staff')
        .select('*, shift:shifts(*)')
        .eq('active', true);
      
      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }
      
      const { data: staffData, error } = await query.order('name');
      if (error) throw error;
      
      const headers = [
        'name',
        'pin',
        'branch',
        'department',
        'shift_start',
        'shift_end',
        'off_days_per_month',
        'monthly_salary',
        'join_date',
        'date_of_birth',
        'mobile_number'
      ];

      const rows = (staffData || []).map((s: any) => {
        const branchVal = s.branch_id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
        
        let joinDateVal = '';
        if (s.join_date) {
          const d = new Date(s.join_date);
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          joinDateVal = `${dd}/${mm}/${yyyy}`;
        }
        
        let dobVal = '';
        if (s.date_of_birth) {
          const d = new Date(s.date_of_birth);
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          dobVal = `${dd}/${mm}/${yyyy}`;
        }
        
        return {
          name: s.name,
          pin: s.pin,
          branch: branchVal,
          department: s.department,
          shift_start: s.shift?.start_time || '',
          shift_end: s.shift?.end_time || '',
          off_days_per_month: s.off_days_per_month,
          monthly_salary: s.monthly_salary,
          join_date: joinDateVal,
          date_of_birth: dobVal,
          mobile_number: s.mobile_number || '',
        };
      });
      
      const wb = XLSX.utils.book_new();
      const wsStaff = XLSX.utils.json_to_sheet(rows, { header: headers });
      XLSX.utils.book_append_sheet(wb, wsStaff, 'Staff Register');
      
      const instructions = [
        ['HOW TO FILL THIS TEMPLATE'],
        ['name - Full staff name (required)'],
        ['pin - Exactly 4 digits, must be unique (required)'],
        ['branch - Must be: Nearbi Daily OR Nearbi Hypermarket'],
        [`department - Must be: ${DEPARTMENTS.join(' / ')}`],
        ['shift_start - Time in HH:MM format e.g. 09:00'],
        ['shift_end - Time in HH:MM format e.g. 18:00'],
        ['off_days_per_month - Must be: 0 or 2 or 4'],
        ['monthly_salary - Numbers only, no symbols'],
        ['join_date - Format: DD/MM/YYYY'],
        ['date_of_birth - Format: DD/MM/YYYY (optional)'],
        ['mobile_number - 10-digit mobile number for portal login (optional)'],
        ['DO NOT change column headers'],
        ['DO NOT delete existing staff rows'],
        ['ADD new staff below existing rows']
      ];
      const wsIns = XLSX.utils.aoa_to_sheet(instructions);
      XLSX.utils.book_append_sheet(wb, wsIns, 'Instructions');
      
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const filename = `Nearbi_Staff_Register_[${dd}-${mm}-${yyyy}].xlsx`;
      
      XLSX.writeFile(wb, filename);
    } catch (err: any) {
      console.error(err);
      alert('Failed to export staff register.');
    }
  };

  const handleResetPassword = async (staffId: string, pin: string) => {
    try {
      const { data: account, error: fetchErr } = await supabase
        .from('staff_accounts')
        .select('id')
        .eq('staff_id', staffId)
        .maybeSingle();

      if (fetchErr || !account) {
        alert('This staff member does not have a login account.');
        return;
      }

      const { error: resetErr } = await supabase
        .from('staff_accounts')
        .update({ password: pin, must_change_password: true })
        .eq('id', account.id);

      if (resetErr) throw resetErr;

      await createAuditLog({
        action: 'reset_password',
        table_name: 'staff_accounts',
        record_id: account.id,
        new_value: { must_change_password: true },
        performed_by: user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Reset password to PIN'
      });

      showToast('Password reset to PIN successfully!');
    } catch (e: any) {
      console.error(e);
      alert('Failed to reset password: ' + e.message);
    }
  };

  // Fetch staff list
  const fetchStaff = async () => {
    try {
      let query = supabase.from('staff').select('*, shift:shifts(*), staff_accounts(*)').eq('active', true);
      
      // Branch isolation
      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }
      
      const { data, error } = await query.order('name');
      if (error) throw error;
      setStaff((data || []) as unknown as StaffMember[]);
    } catch (err) {
      console.error(err);
      setErrorMsg('Could not load staff list.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch shifts list
  const fetchShifts = async () => {
    try {
      const { data, error } = await supabase.from('shifts').select('*').order('label');
      if (error) throw error;
      setShifts(data || []);
      
      // Pre-select first shift as default if none selected
      if (data && data.length > 0 && !formData.shift_id) {
        setFormData((prev) => ({ ...prev, shift_id: data[0].id }));
      }
    } catch (err) {
      console.error('Error fetching shifts:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchStaff();
    fetchShifts();

    // Set default join date to today
    const todayStr = new Date().toISOString().split('T')[0];
    setFormData((prev) => {
      const updated = {
        ...prev,
        join_date: todayStr,
        branch_id: userBranch || prev.branch_id,
      };

      // Prefill from URL query params (Hired Candidates)
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const prefillName = urlParams.get('prefill_name');
        const prefillDept = urlParams.get('prefill_dept');
        const prefillPhone = urlParams.get('prefill_phone');
        const prefillBranch = urlParams.get('prefill_branch');

        if (prefillName) {
          updated.name = prefillName;
          updated.department = prefillDept || '';
          updated.mobile_number = prefillPhone || '';
          updated.branch_id = prefillBranch || updated.branch_id;
          
          // Open panel automatically
          setShowAddPanel(true);
          
          // Clean URL params to avoid opening again on refresh
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }
      return updated;
    });

    // Realtime channel
    const channel = supabase
      .channel('staff-realtime-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff' },
        () => {
          fetchStaff();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userBranch]);

  useEffect(() => {
    if (staff.length > 0) {
      fetchScores();
      checkAndRunInitialCalculation();
    }
  }, [staff]);

  const fetchScores = async () => {
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('performance_scores')
        .select('*')
        .eq('month', currentMonth);

      if (error) throw error;
      const map: Record<string, any> = {};
      if (data) {
        data.forEach((s) => {
          map[s.staff_id] = s;
        });
      }
      setScoresMap(map);
    } catch (e) {
      console.error('Error fetching scores:', e);
    }
  };

  const calculateScores = async () => {
    setCalculatingScores(true);
    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const firstDay = `${monthStr}-01`;
      const lastDayNum = new Date(year, month, 0).getDate();
      const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

      let successCount = 0;
      let errorCount = 0;

      for (const s of staff) {
        try {
          // Fetch attendance for this month
          const { data: attRecords } = await supabase
            .from('attendance')
            .select('check_in_time, status, color_code, ot_minutes, ot_approved')
            .eq('staff_id', s.id)
            .gte('date', firstDay)
            .lte('date', lastDay);

          // Fetch confirmed fines
          const { data: lateFines } = await supabase
            .from('late_fines')
            .select('color_code, confirmed')
            .eq('staff_id', s.id)
            .eq('month', monthStr);

          const { data: specialFines } = await supabase
            .from('special_fines')
            .select('confirmed')
            .eq('staff_id', s.id)
            .eq('month', monthStr);

          // Calculate scores
          const monthStart = new Date(year, month - 1, 1);
          const joinDate = s.join_date ? new Date(s.join_date) : monthStart;
          const effectiveStart = joinDate > monthStart ? joinDate : monthStart;
          const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const effectiveStartZero = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), effectiveStart.getDate());
          const daysAvailable = Math.max(1, Math.floor(
            (todayZero.getTime() - effectiveStartZero.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1);
          
          const daysWorked = attRecords?.filter(r => r.check_in_time).length || 0;

          // Attendance score (40 pts)
          const attScore = Math.round((daysWorked / daysAvailable) * 40);
          const attendanceScore = Math.min(40, Math.max(0, attScore));

          // Punctuality score (30 pts)
          let punctScore = 30;
          const yellowCount = lateFines?.filter(f => f.color_code === 'yellow').length || 0;
          const orangeCount = lateFines?.filter(f => f.color_code === 'orange').length || 0;
          const redCount = lateFines?.filter(f => f.color_code === 'red').length || 0;
          punctScore -= (yellowCount * 3);
          punctScore -= (orangeCount * 5);
          punctScore -= (redCount * 8);
          const punctualityScore = Math.max(0, punctScore);

          // Fine score (20 pts)
          let fineScore = 20;
          const confirmedLate = lateFines?.filter(f => f.confirmed).length || 0;
          const confirmedSpecial = specialFines?.filter(f => f.confirmed).length || 0;
          fineScore -= (confirmedLate * 2);
          fineScore -= (confirmedSpecial * 5);
          const finalFineScore = Math.max(0, fineScore);

          // OT score (10 pts)
          const hasOT = attRecords?.some(r => r.ot_approved && r.ot_minutes > 0);
          const otScore = hasOT ? 10 : 5;

          const totalScore = attendanceScore + punctualityScore + finalFineScore + otScore;

          // Upsert to performance_scores
          const { error: upsertError } = await supabase
            .from('performance_scores')
            .upsert({
              staff_id: s.id,
              month: monthStr,
              attendance_score: attendanceScore,
              punctuality_score: punctualityScore,
              fine_score: finalFineScore,
              ot_score: otScore,
              total_score: totalScore,
              calculated_at: new Date().toISOString(),
              visible_to_staff: scoresMap[s.id]?.visible_to_staff || false
            }, {
              onConflict: 'staff_id,month'
            });

          if (upsertError) {
            console.error('Score upsert error for', s.name, upsertError);
            errorCount++;
          } else {
            successCount++;
          }

        } catch (staffErr) {
          console.error('Error calculating score for', s.name, staffErr);
          errorCount++;
          // Continue with next staff even if one fails
          continue;
        }
      }

      // Refresh scores display
      await fetchScores();

      if (errorCount === 0) {
        showToast(`Scores updated for ${successCount} staff ✓`);
      } else {
        showToast(`Updated ${successCount} staff. ${errorCount} failed — check console.`);
      }

    } catch (err) {
      console.error('Recalculate scores error:', err);
      showToast('Recalculation failed. Check console.');
    } finally {
      setCalculatingScores(false);
    }
  };

  const checkAndRunInitialCalculation = async () => {
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { data } = await supabase
        .from('performance_scores')
        .select('id')
        .eq('month', currentMonth)
        .limit(1);
      if (!data || data.length === 0) {
        calculateScores();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleVisibility = async (staffId: string) => {
    try {
      const score = scoresMap[staffId];
      if (!score) return;

      const newVisible = !score.visible_to_staff;
      const { error } = await supabase
        .from('performance_scores')
        .update({ visible_to_staff: newVisible })
        .eq('id', score.id);

      if (error) throw error;
      setScoresMap(prev => ({
        ...prev,
        [staffId]: { ...score, visible_to_staff: newVisible }
      }));
      showToast('Visibility updated');
    } catch (e) {
      console.error(e);
      showToast('Update failed.');
    }
  };

  const handleOpenFineModal = (staffMember: any) => {
    setFineStaff(staffMember);
    setFineModalOpen(true);
  };

  const getScoreDisplay = (staffId: string) => {
    if (user?.role === 'admin') return null;
    const score = scoresMap[staffId];
    if (!score) return null;

    if (user?.role === 'staff_executive' && !score.visible_to_staff) {
      return null;
    }

    const num = score.total_score;
    let grade = 'Needs Improvement';
    let fillColor = '#F87171';

    if (num >= 90) {
      grade = 'Excellent';
      fillColor = '#4ADE80';
    } else if (num >= 75) {
      grade = 'Good';
      fillColor = '#4ADE80';
    } else if (num >= 60) {
      grade = 'Average';
      fillColor = '#FBBF24';
    }

    const filledBlocks = Math.round(num / 10);
    const emptyBlocks = 10 - filledBlocks;
    const blockStr = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

    return (
      <div className="mt-2 text-xs flex flex-col space-y-1">
        <div className="flex items-center space-x-1.5 font-bold">
          <span style={{ color: fillColor }} className="font-mono text-[9px]">{blockStr}</span>
          <span className="text-white text-[10px]">{num} · {grade}</span>
        </div>
      </div>
    );
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleOpenAddPanel = () => {
    setFormError('');
    setFormData({
      name: '',
      pin: '',
      branch_id: userBranch || '',
      department: '',
      shift_id: shifts.length > 0 ? shifts[0].id : '',
      pay_type: 'fixed_shift',
      standard_hours: 234,
      off_days_per_month: 4,
      monthly_salary: '',
      join_date: new Date().toISOString().split('T')[0],
      date_of_birth: '',
      mobile_number: '',
    });
    setIsCustomShift(false);
    setShowAddPanel(true);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const isHourly = formData.pay_type === 'hourly';
    if (!formData.name || !formData.pin || !formData.branch_id || !formData.department || (!isHourly && !formData.shift_id) || !formData.join_date) {
      setFormError('All fields are required');
      return;
    }

    if (!/^\d{4}$/.test(formData.pin)) {
      setFormError('PIN must be exactly 4 digits');
      return;
    }

    if (formData.mobile_number.trim() && !/^\d{10}$/.test(formData.mobile_number.trim())) {
      setFormError('Mobile number must be exactly 10 digits');
      return;
    }

    setFormLoading(true);

    try {
      // Validate unique PIN across ALL staff members
      const { data: existingPin } = await supabase
        .from('staff')
        .select('id, name')
        .eq('pin', formData.pin)
        .maybeSingle();

      if (existingPin) {
        setFormError(`PIN is already in use by ${existingPin.name}`);
        setFormLoading(false);
        return;
      }

      // Validate unique mobile number across ALL staff accounts if provided
      if (formData.mobile_number.trim()) {
        const { data: existingMob } = await supabase
          .from('staff_accounts')
          .select('id')
          .eq('mobile_number', formData.mobile_number.trim())
          .maybeSingle();

        if (existingMob) {
          setFormError(`Mobile number ${formData.mobile_number} is already in use`);
          setFormLoading(false);
          return;
        }
      }

      // Generate text unique primary key for staff id
      const staffId = 'staff_' + Math.random().toString(36).substr(2, 9);

      const payload = {
        name: formData.name,
        pin: formData.pin,
        branch_id: formData.branch_id,
        department: formData.department,
        shift_id: isHourly ? null : formData.shift_id,
        pay_type: formData.pay_type,
        standard_hours: isHourly ? Number(formData.standard_hours) : 234,
        off_days_per_month: isHourly ? 0 : Number(formData.off_days_per_month),
        monthly_salary: canSeeSalaryBreakdown ? Number(formData.monthly_salary) : 0,
        join_date: formData.join_date,
        date_of_birth: formData.date_of_birth || null,
        mobile_number: formData.mobile_number.trim() || null,
        active: true,
      };

      const { data, error } = await supabase.from('staff').insert(payload).select('id');
      if (error) throw error;

      const newId = data?.[0]?.id;

      if (formData.mobile_number.trim() && newId) {
        const { error: accError } = await supabase.from('staff_accounts').insert({
          staff_id: newId,
          mobile_number: formData.mobile_number.trim(),
          password: formData.pin,
          must_change_password: true
        });
        if (accError) throw accError;
      }

      await createAuditLog({
        action: 'create_staff',
        table_name: 'staff',
        record_id: newId,
        new_value: payload,
        performed_by: user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Manual staff addition'
      });

      try {
        await supabase.from('wall_events').insert({
          event_type: 'staff_added',
          staff_id: newId,
          staff_name: formData.name,
          branch_id: formData.branch_id,
          description: `New staff member ${formData.name} was added to department ${formData.department}`
        });
      } catch (e) {
        console.error('Silent insert wall event failed:', e);
      }

      setShowAddPanel(false);
      showToast('Staff added successfully!');
      fetchStaff();
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'An error occurred while saving.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddCustomShift = async () => {
    setCustomShiftError('');
    if (!customShift.label || !customShift.start_time || !customShift.end_time) {
      setCustomShiftError('All custom shift fields are required');
      return;
    }

    const [sh, sm] = customShift.start_time.split(':').map(Number);
    const [eh, em] = customShift.end_time.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    if (endMins <= startMins) {
      setCustomShiftError('End time must be after start time');
      return;
    }

    const durationHours = parseFloat(((endMins - startMins) / 60).toFixed(2));
    setCustomShiftLoading(true);

    try {
      const shiftId = 'shift_' + Date.now();
      const payload = {
        id: shiftId,
        label: customShift.label,
        start_time: customShift.start_time,
        end_time: customShift.end_time,
        hours: durationHours,
      };

      const { error } = await supabase.from('shifts').insert(payload);
      if (error) throw error;

      await fetchShifts();
      setFormData((prev) => ({ ...prev, shift_id: shiftId }));
      setIsCustomShift(false);
      setCustomShift({ label: '', start_time: '', end_time: '' });
      showToast('Custom shift created!');
    } catch (err: any) {
      console.error(err);
      setCustomShiftError(err.message || 'Could not add custom shift.');
    } finally {
      setCustomShiftLoading(false);
    }
  };

  const handleDeleteStaff = async () => {
    if (!staffToDelete) return;
    const staffId = staffToDelete.id;
    try {
      // Step 1 — delete all related records first
      // in correct order to avoid FK constraint errors

      try {
        const { error } = await supabase.from('attendance').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting attendance:', error);
      } catch (e) {
        console.error('Failed to delete attendance:', e);
      }

      try {
        const { error } = await supabase.from('late_fines').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting late_fines:', error);
      } catch (e) {
        console.error('Failed to delete late_fines:', e);
      }

      try {
        const { error } = await supabase.from('leave_requests').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting leave_requests:', error);
      } catch (e) {
        console.error('Failed to delete leave_requests:', e);
      }

      try {
        const { error } = await supabase.from('break_logs').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting break_logs:', error);
      } catch (e) {
        console.error('Failed to delete break_logs:', e);
      }

      try {
        const { error } = await supabase.from('special_fines').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting special_fines:', error);
      } catch (e) {
        console.error('Failed to delete special_fines:', e);
      }

      try {
        const { error } = await supabase.from('performance_scores').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting performance_scores:', error);
      } catch (e) {
        console.error('Failed to delete performance_scores:', e);
      }

      try {
        const { error } = await supabase.from('salary_confirmations').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting salary_confirmations:', error);
      } catch (e) {
        console.error('Failed to delete salary_confirmations:', e);
      }

      try {
        const { error } = await supabase.from('salary_payments').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting salary_payments:', error);
      } catch (e) {
        console.error('Failed to delete salary_payments:', e);
      }

      try {
        const { error } = await supabase.from('attendance_adjustments').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting attendance_adjustments:', error);
      } catch (e) {
        console.error('Failed to delete attendance_adjustments:', e);
      }

      try {
        const { error } = await supabase.from('wall_events').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting wall_events:', error);
      } catch (e) {
        console.error('Failed to delete wall_events:', e);
      }

      try {
        const { error } = await supabase.from('notifications').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting notifications:', error);
      } catch (e) {
        console.error('Failed to delete notifications:', e);
      }

      try {
        const { error } = await supabase.from('staff_fine_exemptions').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting staff_fine_exemptions:', error);
      } catch (e) {
        console.error('Failed to delete staff_fine_exemptions:', e);
      }

      try {
        const { error } = await supabase.from('staff_announcements').delete().eq('target_staff_id', staffId);
        if (error) console.error('Error deleting staff_announcements:', error);
      } catch (e) {
        console.error('Failed to delete staff_announcements:', e);
      }

      try {
        const { error } = await supabase.from('announcement_reads').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting announcement_reads:', error);
      } catch (e) {
        console.error('Failed to delete announcement_reads:', e);
      }

      try {
        const { error } = await supabase.from('staff_accounts').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting staff_accounts:', error);
      } catch (e) {
        console.error('Failed to delete staff_accounts:', e);
      }

      // staff_birthday table not implemented
      // DOB stored in staff.date_of_birth column directly

      // Step 2 — now delete the staff record itself
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staffId);

      if (error) throw error;

      await createAuditLog({
        action: 'delete_staff',
        table_name: 'staff',
        record_id: staffId,
        old_value: staffToDelete,
        performed_by: user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Staff deleted along with all historical data'
      });

      // Step 3 — remove from local state
      setStaff(prev => 
        prev.filter(s => s.id !== staffId)
      );
      setStaffToDelete(null);
      setDeleteModeId(null);
      
      // Show success toast
      showToast('Staff member removed successfully');

    } catch (err: any) {
      console.error('Delete staff error:', err);
      showToast('Error removing staff member.');
    }
  };

  const [swipeStaffId, setSwipeStaffId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    if (touchStartX === null) return;
    const currentX = e.targetTouches[0].clientX;
    const diffX = touchStartX - currentX;
    
    // Swipe left (diffX > 60) to reveal delete
    if (diffX > 60) {
      setSwipeStaffId(id);
    }
    // Swipe right (diffX < -60) to hide delete
    else if (diffX < -60) {
      if (swipeStaffId === id) {
        setSwipeStaffId(null);
      }
    }
  };

  const toggleSelectStaff = (id: string) => {
    setSelectedStaffIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const allIds = filteredStaff.map(s => s.id);
    if (selectedStaffIds.length === allIds.length) {
      setSelectedStaffIds([]);
    } else {
      setSelectedStaffIds(allIds);
    }
  };

  const handleBulkDeleteStaff = async () => {
    if (bulkDeleteConfirmText !== 'DELETE') {
      alert('Please type DELETE to confirm.');
      return;
    }
    setFormLoading(true);
    try {
      const idsToDelete = [...selectedStaffIds];
      for (const staffId of idsToDelete) {
        const staffMem = staff.find(s => s.id === staffId);
        if (!staffMem) continue;

        // Delete all related records first
        await supabase.from('attendance').delete().eq('staff_id', staffId);
        await supabase.from('late_fines').delete().eq('staff_id', staffId);
        await supabase.from('leave_requests').delete().eq('staff_id', staffId);
        await supabase.from('break_logs').delete().eq('staff_id', staffId);
        await supabase.from('special_fines').delete().eq('staff_id', staffId);
        await supabase.from('performance_scores').delete().eq('staff_id', staffId);
        await supabase.from('salary_confirmations').delete().eq('staff_id', staffId);
        await supabase.from('salary_payments').delete().eq('staff_id', staffId);
        await supabase.from('attendance_adjustments').delete().eq('staff_id', staffId);
        await supabase.from('wall_events').delete().eq('staff_id', staffId);
        await supabase.from('notifications').delete().eq('staff_id', staffId);
        await supabase.from('staff_fine_exemptions').delete().eq('staff_id', staffId);
        await supabase.from('staff_announcements').delete().eq('target_staff_id', staffId);
        await supabase.from('announcement_reads').delete().eq('staff_id', staffId);
        await supabase.from('staff_accounts').delete().eq('staff_id', staffId);
        await supabase.from('staff').delete().eq('id', staffId);

        await createAuditLog({
          action: 'delete_staff',
          table_name: 'staff',
          record_id: staffId,
          old_value: staffMem,
          performed_by: user?.email || 'admin',
          performed_by_role: user?.role || 'admin',
          reason: 'Staff deleted in bulk along with all historical data'
        });
      }

      setStaff(prev => prev.filter(s => !idsToDelete.includes(s.id)));
      setSelectedStaffIds([]);
      setSelectionMode(false);
      setBulkDeleteModalOpen(false);
      setBulkDeleteConfirmText('');
      showToast('Selected staff members removed successfully');
    } catch (e: any) {
      console.error(e);
      showToast('Error removing selected staff.');
    } finally {
      setFormLoading(false);
    }
  };

  const togglePinVisibility = (id: string) => {
    setVisiblePins((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Search filtering
  const filteredStaff = staff.filter((s) => {
    const terms = search.toLowerCase();
    const matchesSearch = (
      s.name.toLowerCase().includes(terms) ||
      s.department.toLowerCase().includes(terms) ||
      (s.pin || '').toLowerCase().includes(terms) ||
      (s.shift?.label || '').toLowerCase().includes(terms)
    );
    if (!matchesSearch) return false;
    if (profileFilter === 'incomplete') {
      return s.profile_pending === true;
    }
    return true;
  });

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1A1A1A] text-2xl font-bold">Staff</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">
            {staff.length} active staff members
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {user?.role === 'ops_manager' && (
            <button
              onClick={calculateScores}
              disabled={calculatingScores}
              className="bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] px-3.5 py-2 rounded-[12px] text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm active:scale-[0.97]"
            >
              <RefreshCw size={14} className={calculatingScores ? 'animate-spin' : ''} />
              <span>{calculatingScores ? 'Calculating...' : 'Recalculate Scores'}</span>
            </button>
          )}
          <button
            onClick={handleDownloadStaffTemplate}
            className="bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] px-3.5 py-2 rounded-[12px] text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Download Staff Import Template"
          >
            <Download size={16} strokeWidth={1.5} />
            <span>Download Template</span>
          </button>
          {(user?.role === 'admin' || user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
            <button
              onClick={handleExportStaff}
              className="bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] px-3.5 py-2 rounded-[12px] text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Export Staff to Excel"
            >
              <Download size={16} strokeWidth={1.5} />
              <span>Export</span>
            </button>
          )}
          {user?.role === 'admin' && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.csv"
                className="hidden"
              />
              <button
                onClick={handleImportStaffClick}
                className="bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] px-3.5 py-2 rounded-[12px] text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Import Staff from Excel/CSV"
              >
                <Upload size={16} strokeWidth={1.5} />
                <span>Import</span>
              </button>
            </>
          )}
          <button
            onClick={handleOpenAddPanel}
            className="bg-[#1A1A1A] text-white hover:bg-[#333333] font-bold px-4 py-2 rounded-[12px] text-sm flex items-center space-x-1.5 active:scale-95 transition-all shadow-md"
          >
            <Plus size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
            <span>Add Staff</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-[#FDECEA] border border-[#C0392B]/30 text-[#C0392B] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button onClick={fetchStaff} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search size={18} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999] pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-[#E8E8E8] rounded-[12px] pl-11 pr-4 py-3 text-[#1A1A1A] placeholder-[#999999] focus:outline-none focus:border-[#1A1A1A] text-sm shadow-sm transition-all"
        />
      </div>

      {/* Profile Complete / Incomplete Filter Pills */}
      <div className="flex gap-2">
        <button
          onClick={() => setProfileFilter('all')}
          className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all shadow-sm ${
            profileFilter === 'all'
              ? 'bg-[#1A1A1A] text-white border border-transparent'
              : 'bg-white border border-[#E8E8E8] text-[#555555] hover:bg-[#F8F8F8]'
          }`}
        >
          All Staff
        </button>
        <button
          onClick={() => setProfileFilter('incomplete')}
          className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
            profileFilter === 'incomplete'
              ? 'bg-[#C0392B] text-white border border-transparent'
              : 'bg-white border border-[#E8E8E8] text-[#C0392B] hover:bg-[#FFF0F0]'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${profileFilter === 'incomplete' ? 'bg-white' : 'bg-[#C0392B]'}`} />
          Profile Incomplete (DOB Missing)
        </button>
      </div>

      {/* Bulk Delete / Selection Bar */}
      {user?.role === 'admin' && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 shadow-sm select-none">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setSelectionMode(!selectionMode);
                setSelectedStaffIds([]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectionMode
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#ECECEC]'
              }`}
            >
              {selectionMode ? 'Exit Selection' : 'Select Staff'}
            </button>
            
            {selectionMode && (
              <button
                onClick={toggleSelectAll}
                className="bg-white border border-[#E8E8E8] hover:bg-[#F2F2F2] px-3 py-1.5 rounded-lg text-xs font-bold text-[#1A1A1A] transition-all"
              >
                {selectedStaffIds.length === filteredStaff.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>
          
          {selectionMode && selectedStaffIds.length > 0 && (
            <button
              onClick={() => {
                setBulkDeleteConfirmText('');
                setBulkDeleteModalOpen(true);
              }}
              className="bg-[rgba(248,113,113,0.15)] border border-[rgba(248,113,113,0.3)] text-[#C0392B] hover:bg-[rgba(248,113,113,0.25)] px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center space-x-1 transition-all"
            >
              <Trash2 size={13} />
              <span>Delete ({selectedStaffIds.length})</span>
            </button>
          )}
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6 shadow-sm">
          <Users size={48} strokeWidth={1} className="text-[#999999] mb-2" />
          <h3 className="text-sm font-bold text-[#1A1A1A]">No staff found</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {search ? 'Try adjusting your search terms.' : 'Get started by adding your first staff member.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredStaff.map((s) => {
            const isDeleteMode = deleteModeId === s.id;
            const isPinVisible = !!visiblePins[s.id];
            const isSelected = selectedStaffIds.includes(s.id);
            const isSwiped = swipeStaffId === s.id;

            return (
              <div
                key={s.id}
                onTouchStart={(e) => handleTouchStart(e, s.id)}
                onTouchMove={(e) => handleTouchMove(e, s.id)}
                className="relative overflow-hidden rounded-[14px] w-full"
              >
                {/* Swipe Action behind the card */}
                {user?.role === 'admin' && !selectionMode && (
                  <div className="absolute inset-y-0 right-0 w-20 bg-[#C0392B] flex items-center justify-center text-white z-0 rounded-[14px]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSingleDeleteConfirmText('');
                        setStaffToDelete(s);
                        setSwipeStaffId(null);
                      }}
                      className="w-full h-full flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                )}

                {/* Card Container */}
                <div
                  onClick={(e) => {
                    if (selectionMode) {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSelectStaff(s.id);
                    } else {
                      router.push('/staff/' + s.id);
                    }
                  }}
                  className={`bg-white border rounded-[14px] p-4 flex flex-col transition-all relative cursor-pointer hover:border-[#D0D0D0] z-10 ${
                    isSelected ? 'border-[#1A1A1A] ring-1 ring-[#1A1A1A]/30 bg-[#F9F9F9]' : isDeleteMode ? 'border-[#C0392B] ring-1 ring-[#C0392B]/30' : 'border-[#E8E8E8] shadow-sm'
                  } ${isSwiped ? 'translate-x-[-80px]' : ''}`}
                >
                  {/* Top Right Action Icons */}
                  {!selectionMode && (
                    <div className="absolute top-3 right-3 flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                      {(user?.role === 'admin' || user?.role === 'ops_manager') && (
                        <button
                          onClick={() => handleOpenEditStaff(s)}
                          className="p-1.5 text-[#555555] hover:text-[#1A1A1A] hover:bg-[#F2F2F2] rounded-lg transition-all cursor-pointer"
                          title="Edit Staff"
                        >
                          <Edit2 size={14} strokeWidth={1.5} />
                        </button>
                      )}
                      {user?.role === 'admin' && (
                        <button
                          onClick={() => {
                            setSingleDeleteConfirmText('');
                            setStaffToDelete(s);
                          }}
                          className="p-1.5 text-[#C0392B] hover:bg-[#FDECEA] rounded-lg transition-all cursor-pointer"
                          title="Delete Staff"
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-start space-x-3.5">
                    {/* Selection Checkbox or Avatar */}
                    {selectionMode ? (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectStaff(s.id);
                        }}
                        className="w-12 h-12 flex items-center justify-center flex-shrink-0 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by outer container click
                          className="w-5 h-5 rounded border-[#E8E8E8] text-[#1a1a1a] focus:ring-[#1a1a1a]"
                        />
                      </div>
                    ) : (
                      <>
                        {/* Avatar or Delete Mode Trigger */}
                        {user?.role === 'admin' || user?.role === 'ops_manager' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteModeId(isDeleteMode ? null : s.id);
                            }}
                            className={`w-12 h-12 rounded-full font-bold text-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                              isDeleteMode
                                ? 'bg-[#FDECEA] text-[#C0392B] border border-[#C0392B]/20'
                                : 'bg-[#1A1A1A] text-white border border-[#1A1A1A]'
                            }`}
                          >
                            {isDeleteMode ? <Trash2 size={20} strokeWidth={1.5} className="text-[#C0392B]" /> : s.name.charAt(0).toUpperCase()}
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#1A1A1A] text-white border border-[#1A1A1A] font-bold text-lg flex items-center justify-center flex-shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </>
                    )}

                  {/* Profile info details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-[#1A1A1A] leading-tight truncate">
                        {s.name}
                      </h3>
                      {s.profile_pending && (
                        <span className="bg-[#FFF0F0] border border-[#C0392B]/25 text-[#C0392B] text-[9.5px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center">
                          DOB Missing
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] font-semibold mt-0.5 leading-none">
                      {s.department} • <span className="capitalize">{getBranchLabel(s.branch_id)}</span>
                    </p>
                    {editingDobStaffId === s.id ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 flex items-center space-x-2 bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-2.5"
                      >
                        <div className="flex-1">
                          <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-0.5">Date of Birth</label>
                          <input
                            type="date"
                            value={editingDobValue}
                            onChange={(e) => setEditingDobValue(e.target.value)}
                            className="w-full bg-white border border-[#E8E8E8] rounded-[6px] px-2 py-1 text-[11px] text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
                          />
                        </div>
                        <div className="flex items-end space-x-1.5 self-end mb-0.5">
                          <button
                            type="button"
                            onClick={() => handleSaveDob(s.id)}
                            className="px-2.5 py-1.5 bg-[#EDF7EF] hover:bg-[#EDF7EF]/80 text-[#2D7A3A] border border-[#2D7A3A]/20 rounded-[12px] text-[10px] font-bold active:scale-95 transition-all"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDobStaffId(null)}
                            className="px-2.5 py-1.5 bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#555555] border border-[#E8E8E8] rounded-[12px] text-[10px] font-bold active:scale-95 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-1 min-h-[16px]">
                        {s.date_of_birth ? (
                          <div className="flex items-center space-x-1 text-[10px] text-[#B8860B] font-semibold">
                            <Cake size={11} />
                            <span>DOB: {new Date(s.date_of_birth).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-[var(--text-muted)] italic font-semibold font-sans">No DOB recorded</div>
                        )}
                        {(user?.role === 'admin' || user?.role === 'ops_manager') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDobStaffId(s.id);
                              setEditingDobValue(s.date_of_birth ? s.date_of_birth.substring(0, 10) : '');
                            }}
                            className="text-[9px] text-[#555555] hover:text-[#1A1A1A] font-bold underline cursor-pointer"
                          >
                            Edit DOB
                          </button>
                        )}
                      </div>
                    )}
                    {getScoreDisplay(s.id)}

                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className="bg-[#F2F2F2] text-[#555555] border border-[#E8E8E8] text-[10px] font-bold px-2.5 py-0.5 rounded-[20px]">
                        Shift: {s.shift?.label || 'None'}
                      </span>
                      <span className="bg-[#F2F2F2] text-[#555555] border border-[#E8E8E8] text-[10px] font-bold px-2.5 py-0.5 rounded-[20px]">
                        {s.off_days_per_month} off days
                      </span>
                    </div>

                    {/* PIN & Salary Display */}
                    <div className="mt-3 bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-2.5 flex items-center justify-between shadow-sm">
                      <div className="flex items-center space-x-2 text-xs font-bold text-[#555555]">
                        <span>PIN:</span>
                        <span className="font-mono text-sm tracking-widest text-[#1A1A1A]">
                          {isPinVisible ? s.pin : '••••'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinVisibility(s.id);
                          }}
                          className="text-[#999999] hover:text-[#1A1A1A] px-1 active:scale-90 flex items-center justify-center"
                        >
                          {isPinVisible ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                        </button>
                      </div>

                      <div className="text-xs font-bold text-[#1A1A1A] flex items-center">
                        {canSeeSalaryBreakdown ? `₹${s.monthly_salary.toLocaleString()}/mo` : <Lock size={14} strokeWidth={1.5} className="text-[#999999]" />}
                      </div>
                    </div>

                    {/* Login Account Details */}
                    {(() => {
                      const account = s.staff_accounts?.[0];
                      return (
                        <div className="mt-2.5 bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-2.5 flex flex-col space-y-1.5 shadow-sm" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5 text-[11px] font-bold">
                              {account ? (
                                <>
                                  <Phone size={13} className="text-[#2D7A3A]" />
                                  <span className="text-[#2D7A3A] font-mono">{account.mobile_number}</span>
                                </>
                              ) : (
                                <>
                                  <Phone size={13} className="text-[#999999]" />
                                  <span className="text-[#999999] italic">No Login Account</span>
                                </>
                              )}
                            </div>
                            {account && (user?.role === 'admin' || user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
                              <button
                                type="button"
                                onClick={() => handleResetPassword(s.id, s.pin)}
                                className="bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-bold text-[9px] px-2.5 py-1 rounded-[12px] active:scale-95 transition-all cursor-pointer shadow-sm"
                              >
                                Reset to PIN
                              </button>
                            )}
                          </div>
                          {account && account.last_login && (
                            <p className="text-[9px] text-[#999999] font-semibold leading-none">
                              Last login: {new Date(account.last_login).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Fine button */}
                    {user?.role !== 'admin' && (user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
                      <div className="mt-2.5 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenFineModal(s);
                          }}
                          className="bg-white border border-[#E8E8E8] hover:bg-[#FDECEA] hover:text-[#C0392B] hover:border-[#C0392B]/20 font-bold text-[10px] px-2.5 py-1 rounded-[12px] flex items-center space-x-1 active:scale-95 transition-all shadow-sm"
                        >
                          <AlertCircle size={13} />
                          <span>Fine</span>
                        </button>
                      </div>
                    )}

                    {/* Visibility Toggle (Ops / head HR only) */}
                    {user?.role !== 'admin' && (user?.role === 'ops_manager' || (user?.role === 'staff_executive' && user.branch === null)) && scoresMap[s.id] && (
                      <div className="mt-3 flex items-center justify-between border-t border-[#E8E8E8] pt-2.5">
                        <span className="text-[10px] font-bold text-[#555555]">Score visible to staff</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleVisibility(s.id);
                          }}
                          className={`w-8 h-4 rounded-full relative transition-colors ${
                            scoresMap[s.id]?.visible_to_staff ? 'bg-[#2D7A3A]' : 'bg-[#EBEBEB]'
                          }`}
                        >
                          <span
                            className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                              scoresMap[s.id]?.visible_to_staff ? 'right-0.5' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete staff button under delete mode */}
                {isDeleteMode && (
                  <div className="mt-4 pt-3.5 border-t border-[#E8E8E8] flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSingleDeleteConfirmText('');
                        setStaffToDelete(s);
                      }}
                      className="bg-white border border-[#C0392B] text-[#C0392B] hover:bg-[#FDECEA] hover:border-[#C0392B]/20 font-bold text-xs px-4 py-2 rounded-[12px] active:scale-95 transition-all shadow-sm"
                    >
                      Delete Staff Member
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Add Staff Slide-Up Panel */}
      {showAddPanel && (
        <div className="fixed inset-0 z-[11000] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAddPanel(false)}
          />
          <div
            className="bg-white relative z-10 w-full max-w-md mx-auto"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: '24px 24px 0 0',
            }}
          >
            {/* Header */}
            <div className="p-5 border-b border-[#E8E8E8] flex-shrink-0">
              <div className="w-12 h-1 bg-[#E8E8E8] rounded-full mx-auto mb-4" />
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-[#1A1A1A]">New Staff Member</h2>
                <button
                  onClick={() => setShowAddPanel(false)}
                  className="text-[#999999] hover:text-[#1A1A1A] p-1"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {formError && (
                <div className="bg-[#FDECEA] border border-[#C0392B]/30 text-[#C0392B] text-xs font-bold px-3 py-2 rounded-[12px]">
                  {formError}
                </div>
              )}

              <form id="add-staff-form" onSubmit={handleAddStaff} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      4-Digit PIN
                    </label>
                    <input
                      type="text"
                      pattern="\d*"
                      maxLength={4}
                      value={formData.pin}
                      onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').substring(0, 4) })}
                      placeholder="e.g. 1234"
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-mono text-center"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Join Date
                    </label>
                    <input
                      type="date"
                      value={formData.join_date}
                      onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Date of Birth (optional)
                  </label>
                  <input
                    type="date"
                    value={formData.date_of_birth || ''}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Mobile Number (for staff login)
                  </label>
                  <input
                    type="tel"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={formData.mobile_number}
                    onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value.replace(/\D/g, '').substring(0, 10) })}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Branch
                    </label>
                    <select
                      value={formData.branch_id}
                      onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      disabled={!!userBranch}
                      required
                    >
                      <option value="">Select branch...</option>
                      <option value="daily">Nearbi Daily</option>
                      <option value="hypermarket">Nearbi Hypermarket</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Department
                    </label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      required
                    >
                      <option value="">Select...</option>
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pay Type Choice */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
                    Pay Type
                  </label>
                  <div className="flex gap-2">
                    {[
                      { key: 'fixed_shift', label: 'Fixed Shift' },
                      { key: 'hourly', label: 'Hourly' }
                    ].map((pt) => {
                      const isSelected = formData.pay_type === pt.key;
                      return (
                        <button
                          key={pt.key}
                          type="button"
                          onClick={() => setFormData({ ...formData, pay_type: pt.key })}
                          className={`flex-1 py-2.5 rounded-[12px] border text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                              : 'bg-white text-[#555555] border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95'
                          }`}
                        >
                          {pt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {formData.pay_type === 'hourly' ? (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Standard monthly hours
                    </label>
                    <input
                      type="number"
                      value={formData.standard_hours}
                      onChange={(e) => setFormData({ ...formData, standard_hours: Number(e.target.value) })}
                      placeholder="e.g. 234"
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      required
                    />
                    <div className="flex justify-between items-center text-[11px] font-semibold text-[var(--text-muted)] px-1">
                      <span>e.g. 234 = 26 days × 9 hrs</span>
                      <span>
                        Hourly rate: ₹{((Number(formData.monthly_salary) || 0) / (Number(formData.standard_hours) || 234)).toFixed(2)} / hr
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Shift Profile */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                        Shift Profile
                      </label>
                      <select
                        value={isCustomShift ? 'custom' : formData.shift_id}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setIsCustomShift(true);
                          } else {
                            setIsCustomShift(false);
                            setFormData({ ...formData, shift_id: e.target.value });
                          }
                        }}
                        className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] mb-2"
                        required={!isCustomShift}
                      >
                        {shifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label} ({s.start_time} - {s.end_time})
                          </option>
                        ))}
                        <option value="custom">+ Create custom shift...</option>
                      </select>

                      {isCustomShift && (
                        <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-4 space-y-3 mt-2">
                          <h4 className="text-xs font-bold text-[#1A1A1A]">New Custom Shift</h4>
                          {customShiftError && (
                            <div className="bg-[#FDECEA] border border-[#C0392B]/20 text-[#C0392B] text-[10px] font-bold p-2 rounded-[12px]">
                              {customShiftError}
                            </div>
                          )}
                          <div>
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                              Shift Label
                            </label>
                            <input
                              type="text"
                              value={customShift.label}
                              onChange={(e) => setCustomShift({ ...customShift, label: e.target.value })}
                              placeholder="e.g. General Shift"
                              className="w-full bg-white border border-[#E8E8E8] rounded-[12px] p-2 text-xs focus:outline-none text-[#1A1A1A] focus:border-[#1A1A1A]"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                                Start Time
                              </label>
                              <input
                                type="time"
                                value={customShift.start_time}
                                onChange={(e) => setCustomShift({ ...customShift, start_time: e.target.value })}
                                className="w-full bg-white border border-[#E8E8E8] rounded-[12px] p-2 text-xs focus:outline-none text-[#1A1A1A] focus:border-[#1A1A1A]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                                End Time
                              </label>
                              <input
                                type="time"
                                value={customShift.end_time}
                                onChange={(e) => setCustomShift({ ...customShift, end_time: e.target.value })}
                                className="w-full bg-white border border-[#E8E8E8] rounded-[12px] p-2 text-xs focus:outline-none text-[#1A1A1A] focus:border-[#1A1A1A]"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setIsCustomShift(false);
                                if (shifts.length > 0) {
                                  setFormData((prev) => ({ ...prev, shift_id: shifts[0].id }));
                                }
                              }}
                              className="text-xs text-[#555555] font-bold hover:underline"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleAddCustomShift}
                              disabled={customShiftLoading}
                              className="bg-[#1A1A1A] text-white hover:bg-[#333333] font-bold text-xs px-3.5 py-1.5 rounded-[12px] active:scale-95 transition-all shadow-md"
                            >
                              {customShiftLoading ? 'Creating...' : 'Create Shift'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Off Days Choice */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
                        Monthly Off Days
                      </label>
                      <div className="flex gap-2">
                        {[0, 2, 4].map((num) => {
                          const isSelected = formData.off_days_per_month === num;
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setFormData({ ...formData, off_days_per_month: num as any })}
                              className={`flex-1 py-2.5 rounded-[12px] border text-xs font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                                  : 'bg-white text-[#555555] border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95'
                              }`}
                            >
                              {num} Days
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Monthly Salary Input (Admin/Ops only) */}
                {canSeeSalaryBreakdown && (
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Monthly Salary (₹)
                    </label>
                    <input
                      type="number"
                      value={formData.monthly_salary}
                      onChange={(e) => setFormData({ ...formData, monthly_salary: e.target.value })}
                      placeholder="e.g. 15000"
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      required
                    />
                  </div>
                )}
              </form>
            </div>

            {/* Sticky footer with actions */}
            <div
              style={{
                position: 'sticky' as const,
                bottom: 0,
                background: '#FFFFFF',
                padding: '12px 16px',
                paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                borderTop: '1px solid #E8E8E8',
                zIndex: 100,
                marginTop: 'auto',
                flexShrink: 0,
              }}
            >
              <button
                type="submit"
                form="add-staff-form"
                disabled={formLoading}
                className="w-full min-h-[44px] bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-sm rounded-[12px] active:scale-95 transition-all shadow-md cursor-pointer flex items-center justify-center"
              >
                {formLoading ? 'Saving...' : 'Save Staff Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff Slide-Up Panel */}
      {editStaffModalOpen && (
        <div className="fixed inset-0 z-[11000] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setEditStaffModalOpen(false)}
          />
          <div
            className="bg-white relative z-10 w-full max-w-md mx-auto"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRadius: '24px 24px 0 0',
            }}
          >
            {/* Header section (fixed at top of sheet) */}
            <div className="p-5 border-b border-[#E8E8E8] flex-shrink-0">
              <div className="w-12 h-1 bg-[#E8E8E8] rounded-full mx-auto mb-4" />
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-[#1A1A1A]">Edit Staff — {editStaffForm.name}</h2>
                <button
                  onClick={() => setEditStaffModalOpen(false)}
                  className="text-[#999999] hover:text-[#1A1A1A] p-1"
                >
                  <X size={18} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {formError && (
                <div className="bg-[#FDECEA] border border-[#C0392B]/30 text-[#C0392B] text-xs font-bold px-3 py-2 rounded-[12px]">
                  {formError}
                </div>
              )}

              <form id="edit-staff-form" onSubmit={handleEditStaffSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={editStaffForm.name}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, name: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      4-Digit PIN
                    </label>
                    <input
                      type="text"
                      pattern="\d*"
                      maxLength={4}
                      value={editStaffForm.pin}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, pin: e.target.value.replace(/\D/g, '').substring(0, 4) })}
                      placeholder="e.g. 1234"
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-mono text-center"
                      required
                    />
                    {editStaffForm.pin !== originalPin && (
                      <p className="text-[10px] text-[#E07000] font-bold mt-1">
                        ⚠️ Changing PIN will update kiosk access
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Join Date
                    </label>
                    <input
                      type="date"
                      value={editStaffForm.join_date}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, join_date: e.target.value })}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={editStaffForm.date_of_birth || ''}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, date_of_birth: e.target.value })}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Mobile Number (for staff login)
                  </label>
                  <input
                    type="tel"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={editStaffForm.mobile_number || ''}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, mobile_number: e.target.value.replace(/\D/g, '').substring(0, 10) })}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Branch
                    </label>
                    <select
                      value={editStaffForm.branch_id}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, branch_id: e.target.value })}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      disabled={!!userBranch}
                      required
                    >
                      <option value="">Select branch...</option>
                      <option value="daily">Nearbi Daily</option>
                      <option value="hypermarket">Nearbi Hypermarket</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Department
                    </label>
                    <select
                      value={editStaffForm.department}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, department: e.target.value })}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      required
                    >
                      <option value="">Select...</option>
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pay Type Choice */}
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
                    Pay Type
                  </label>
                  <div className="flex gap-2">
                    {[
                      { key: 'fixed_shift', label: 'Fixed Shift' },
                      { key: 'hourly', label: 'Hourly' }
                    ].map((pt) => {
                      const isSelected = editStaffForm.pay_type === pt.key;
                      return (
                        <button
                          key={pt.key}
                          type="button"
                          onClick={() => setEditStaffForm({ ...editStaffForm, pay_type: pt.key })}
                          className={`flex-1 py-2.5 rounded-[12px] border text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                              : 'bg-white text-[#555555] border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95'
                          }`}
                        >
                          {pt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {editStaffForm.pay_type === 'hourly' ? (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Standard monthly hours
                    </label>
                    <input
                      type="number"
                      value={editStaffForm.standard_hours}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, standard_hours: Number(e.target.value) })}
                      placeholder="e.g. 234"
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      required
                    />
                    <div className="flex justify-between items-center text-[11px] font-semibold text-[var(--text-muted)] px-1">
                      <span>e.g. 234 = 26 days × 9 hrs</span>
                      <span>
                        Hourly rate: ₹{((Number(editStaffForm.monthly_salary) || 0) / (Number(editStaffForm.standard_hours) || 234)).toFixed(2)} / hr
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Shift Profile */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                        Shift Profile
                      </label>
                      <select
                        value={editIsCustomShift ? 'custom' : editStaffForm.shift_id}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setEditIsCustomShift(true);
                          } else {
                            setEditIsCustomShift(false);
                            setEditStaffForm({ ...editStaffForm, shift_id: e.target.value });
                          }
                        }}
                        className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] mb-2 font-bold"
                        required={!editIsCustomShift}
                      >
                        {shifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label} ({s.start_time} - {s.end_time})
                          </option>
                        ))}
                        <option value="custom">+ Create custom shift...</option>
                      </select>

                      {editIsCustomShift && (
                        <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-4 space-y-3 mt-2">
                          <h4 className="text-xs font-bold text-[#1A1A1A]">New Custom Shift</h4>
                          {editCustomShiftError && (
                            <div className="bg-[#FDECEA] border border-[#C0392B]/20 text-[#C0392B] text-[10px] font-bold p-2 rounded-[12px]">
                              {editCustomShiftError}
                            </div>
                          )}
                          <div>
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                              Shift Label
                            </label>
                            <input
                              type="text"
                              value={editCustomShift.label}
                              onChange={(e) => setEditCustomShift({ ...editCustomShift, label: e.target.value })}
                              placeholder="e.g. General Shift"
                              className="w-full bg-white border border-[#E8E8E8] rounded-[12px] p-2 text-xs focus:outline-none text-[#1A1A1A] focus:border-[#1A1A1A]"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                                Start Time
                              </label>
                              <input
                                type="time"
                                value={editCustomShift.start_time}
                                onChange={(e) => setEditCustomShift({ ...editCustomShift, start_time: e.target.value })}
                                className="w-full bg-white border border-[#E8E8E8] rounded-[12px] p-2 text-xs focus:outline-none text-[#1A1A1A] focus:border-[#1A1A1A]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                                End Time
                              </label>
                              <input
                                type="time"
                                value={editCustomShift.end_time}
                                onChange={(e) => setEditCustomShift({ ...editCustomShift, end_time: e.target.value })}
                                className="w-full bg-white border border-[#E8E8E8] rounded-[12px] p-2 text-xs focus:outline-none text-[#1A1A1A] focus:border-[#1A1A1A]"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditIsCustomShift(false);
                                if (shifts.length > 0) {
                                  setEditStaffForm((prev) => ({ ...prev, shift_id: shifts[0].id }));
                                }
                              }}
                              className="text-xs text-[#555555] font-bold hover:underline"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleEditAddCustomShift}
                              disabled={editCustomShiftLoading}
                              className="bg-[#1A1A1A] text-white hover:bg-[#333333] font-bold text-xs px-3.5 py-1.5 rounded-[12px] active:scale-95 transition-all shadow-md"
                            >
                              {editCustomShiftLoading ? 'Creating...' : 'Create Shift'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Off Days Choice */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
                        Monthly Off Days
                      </label>
                      <div className="flex gap-2">
                        {[0, 2, 4].map((num) => {
                          const isSelected = editStaffForm.off_days_per_month === num;
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setEditStaffForm({ ...editStaffForm, off_days_per_month: num as any })}
                              className={`flex-1 py-2.5 rounded-[12px] border text-xs font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                                  : 'bg-white text-[#555555] border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95'
                              }`}
                            >
                              {num} Days
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Monthly Salary Input (Admin/Ops only) */}
                {canSeeSalaryBreakdown && (
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                      Monthly Salary (₹)
                    </label>
                    <input
                      type="number"
                      value={editStaffForm.monthly_salary}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, monthly_salary: e.target.value })}
                      placeholder="e.g. 15000"
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                      required
                    />
                  </div>
                )}
              </form>
            </div>

            {/* Sticky footer with actions */}
            <div
              style={{
                position: 'sticky' as const,
                bottom: 0,
                background: '#FFFFFF',
                padding: '12px 16px',
                paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                borderTop: '1px solid #E8E8E8',
                zIndex: 100,
                marginTop: 'auto',
                flexShrink: 0,
              }}
            >
              <button
                type="submit"
                form="edit-staff-form"
                disabled={formLoading}
                className="w-full min-h-[44px] bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-sm rounded-[12px] active:scale-95 transition-all shadow-md cursor-pointer flex items-center justify-center"
              >
                {formLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Change Recalculation Confirmation modal */}
      {showShiftConfirm && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowShiftConfirm(false)}
          />
          <div className="bg-white rounded-[16px] shadow-2xl relative z-10 p-6 w-full max-w-xs text-center border border-[#E8E8E8] flex flex-col items-center">
            <AlertCircle size={36} strokeWidth={1.5} style={{ color: '#FBBF24' }} className="mb-3" />
            <h3 className="text-base font-bold text-[#1A1A1A] mb-1">
              Recalculate Attendance?
            </h3>
            <p className="text-xs text-[#555555] leading-relaxed mb-6">
              Shift changed to {shifts.find(s => s.id === editStaffForm.shift_id)?.label || 'new shift'}.
              Would you like to recalculate all of this month's attendance, late minutes, OT, and early leaves under the new shift schedule?
            </p>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => handleSaveEditStaff(false)}
                className="flex-1 bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#555555] font-bold text-xs py-2.5 rounded-[10px] active:scale-95 cursor-pointer"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditStaff(true)}
                className="flex-1 bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs py-2.5 rounded-[10px] active:scale-95 transition-all shadow cursor-pointer"
              >
                Recalculate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {staffToDelete && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setStaffToDelete(null)}
          />
          <div className="bg-white rounded-[16px] shadow-2xl relative z-10 p-6 w-full max-w-xs text-center border border-[#E8E8E8] flex flex-col items-center select-none">
            <AlertTriangle size={36} strokeWidth={1.5} style={{ color: '#FBBF24' }} className="mb-3" />
            <h3 className="text-base font-bold text-[#1A1A1A] mb-1">
              Remove {staffToDelete.name}?
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-4">
              This will permanently delete this staff member and all associated registers, leave claims, and fine sheets.
            </p>
            <div className="w-full mb-5 text-left">
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1.5">
                Type DELETE to confirm
              </label>
              <input
                type="text"
                value={singleDeleteConfirmText}
                onChange={(e) => setSingleDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-lg p-2 text-center text-xs font-black text-[#1A1A1A] focus:outline-none focus:border-[#C0392B]"
              />
            </div>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setStaffToDelete(null)}
                className="flex-1 bg-transparent border border-[#E8E8E8] text-[#555555] font-bold text-xs py-2.5 rounded-[10px] active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStaff}
                disabled={singleDeleteConfirmText !== 'DELETE'}
                className="flex-1 bg-[#FDECEA] border border-[#FDECEA] text-[#C0392B] hover:bg-[#FCDAD7] font-bold text-xs py-2.5 rounded-[10px] active:scale-95 transition-all shadow disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete confirmation modal */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setBulkDeleteModalOpen(false)}
          />
          <div className="bg-white rounded-[16px] shadow-2xl relative z-10 p-6 w-full max-w-xs text-center border border-[#E8E8E8] flex flex-col items-center select-none">
            <AlertTriangle size={36} strokeWidth={1.5} style={{ color: '#C0392B' }} className="mb-3" />
            <h3 className="text-base font-bold text-[#1A1A1A] mb-1">
              Delete {selectedStaffIds.length} Staff?
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-4">
              This will permanently delete the <strong>{selectedStaffIds.length}</strong> selected staff members and all associated registers, leave claims, and fine sheets.
            </p>
            <div className="w-full mb-5 text-left">
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1.5">
                Type DELETE to confirm
              </label>
              <input
                type="text"
                value={bulkDeleteConfirmText}
                onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-lg p-2 text-center text-xs font-black text-[#1A1A1A] focus:outline-none focus:border-[#C0392B]"
              />
            </div>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(false)}
                className="flex-1 bg-transparent border border-[#E8E8E8] text-[#555555] font-bold text-xs py-2.5 rounded-[10px] active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteStaff}
                disabled={bulkDeleteConfirmText !== 'DELETE'}
                className="flex-1 bg-[#FDECEA] border border-[#FDECEA] text-[#C0392B] hover:bg-[#FCDAD7] font-bold text-xs py-2.5 rounded-[10px] active:scale-95 transition-all shadow disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                Yes, delete all
              </button>
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

      {/* Import Preview Modal */}
      {importPreviewOpen && (
        <div className="fixed inset-0 z-[13000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { if (!isImporting) setImportPreviewOpen(false); }}
          />
          <div className="bg-[var(--bg-surface)] rounded-[16px] shadow-2xl relative z-10 p-6 w-full max-w-4xl text-left border border-[var(--border-strong)] flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-white">Import Preview</h3>
              <button
                type="button"
                onClick={() => setImportPreviewOpen(false)}
                disabled={isImporting}
                className="text-[var(--text-secondary)] hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Summary Bar */}
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-3 mb-4 flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
              <div>
                <span className="text-[#4ADE80] font-bold">
                  {importRows.filter(r => r.isValid).length}
                </span>{' '}
                rows ready |{' '}
                <span className="text-[#F87171] font-bold">
                  {importRows.filter(r => !r.isValid && !r.isExample).length}
                </span>{' '}
                rows have errors |{' '}
                <span className="text-gray-400 font-bold">
                  {importRows.filter(r => r.isExample).length}
                </span>{' '}
                example rows skipped
              </div>
              {importProgress && <div className="text-white font-bold animate-pulse">{importProgress}</div>}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto border border-[var(--border-strong)] rounded-lg">
              <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                <thead>
                  <tr className="text-[var(--text-muted)] uppercase font-bold text-[9px] bg-[var(--bg-elevated)] border-b border-[var(--border-strong)] sticky top-0">
                    <th className="p-2.5">Row</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">PIN</th>
                    <th className="p-2.5">Mobile</th>
                    <th className="p-2.5">Branch</th>
                    <th className="p-2.5">Department</th>
                    <th className="p-2.5">Errors / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {importRows.map((row) => (
                    <tr
                      key={row.rowIdx}
                      className={`hover:bg-[var(--bg-elevated)]/40 transition-colors ${
                        row.isExample
                          ? 'border-l-4 border-l-gray-500 opacity-60'
                          : row.isValid
                          ? 'border-l-4 border-l-[#4ADE80]'
                          : 'border-l-4 border-l-[#F87171]'
                      }`}
                    >
                      <td className="p-2.5 text-[var(--text-secondary)] font-bold">{row.rowIdx}</td>
                      <td className="p-2.5">
                        {row.isExample ? (
                          <span className="text-gray-400 font-bold uppercase text-[9px] bg-gray-500/10 border border-gray-500/20 px-1.5 py-0.5 rounded">
                            Example (Skipped)
                          </span>
                        ) : row.isValid ? (
                          <span className="text-[#4ADE80] font-bold uppercase text-[9px] bg-[#4ADE80]/10 border border-[#4ADE80]/20 px-1.5 py-0.5 rounded">
                            Valid
                          </span>
                        ) : (
                          <span className="text-[#F87171] font-bold uppercase text-[9px] bg-[#F87171]/10 border border-[#F87171]/20 px-1.5 py-0.5 rounded">
                            Error
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-white font-bold">{row.name || '—'}</td>
                      <td className="p-2.5 font-mono text-[var(--text-secondary)]">{row.pin || '—'}</td>
                      <td className="p-2.5 font-mono text-[var(--text-secondary)]">{row.mobile_number || '—'}</td>
                      <td className="p-2.5 text-[var(--text-secondary)]">{row.branchRaw || '—'}</td>
                      <td className="p-2.5 text-[var(--text-secondary)]">{row.department || '—'}</td>
                      <td className="p-2.5 text-xs whitespace-normal">
                        {row.isExample ? (
                          <span className="text-[var(--text-muted)] italic">Example row — will not be imported</span>
                        ) : row.isValid ? (
                          <span className="text-[var(--text-muted)]">Ready to import</span>
                        ) : (
                          <span className="text-[#F87171] font-semibold">{row.errors.join(', ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setImportPreviewOpen(false)}
                disabled={isImporting}
                className="bg-transparent border border-[var(--border-strong)] text-[var(--text-secondary)] font-bold text-xs px-4 py-2.5 rounded-[10px] active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeImportStaff}
                disabled={isImporting || importRows.filter(r => r.isValid).length === 0}
                className="bg-[#F5A800] text-white hover:bg-[#d99400] font-bold text-xs px-4 py-2.5 rounded-[10px] active:scale-95 transition-all flex items-center space-x-1.5"
              >
                {isImporting ? 'Importing...' : 'Import valid rows only'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

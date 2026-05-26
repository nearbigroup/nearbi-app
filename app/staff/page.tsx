'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Search, Plus, Trash2, Eye, EyeOff, Lock, X, AlertTriangle, Users, AlertCircle, RefreshCw, Cake, Download, Upload, Check } from 'lucide-react';
import SpecialFineBottomSheet from '@/components/SpecialFineBottomSheet';
import * as XLSX from 'xlsx';

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
  off_days_per_month: number;
  monthly_salary: number;
  join_date: string;
  date_of_birth?: string | null;
  active: boolean;
  shift?: Shift;
}

export default function StaffPage() {
  const router = useRouter();
  const { user, userBranch, canSeeSalaryBreakdown } = useAuth();
  
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
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
    off_days_per_month: 4,
    monthly_salary: '',
    join_date: '',
    date_of_birth: '',
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

        // Fetch all existing active pins from Supabase first
        const { data: existingStaff, error: pinError } = await supabase
          .from('staff')
          .select('pin, name')
          .eq('active', true);
        if (pinError) throw pinError;
        
        const existingPins = new Set(existingStaff?.map(s => s.pin) || []);

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
          const validDepts = ['Grocery', 'Fresh & Produce', 'Bakery', 'Cashier', 'Housekeeping', 'Receiving'];
          const deptMatch = validDepts.find(d => d.toLowerCase() === deptRaw.toLowerCase());
          let department = deptMatch || '';
          if (!deptRaw) {
            errors.push('Department is required');
          } else if (!deptMatch) {
            errors.push(`Invalid department — must be one of: ${validDepts.join(', ')}`);
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
            errors,
            isValid: errors.length === 0
          };
        });

        // Add pins from the spreadsheet itself to avoid importing duplicate pins within the file
        const filePins = new Map<string, number>();
        validatedRows.forEach((vr) => {
          if (vr.pin && /^\d{4}$/.test(vr.pin)) {
            if (filePins.has(vr.pin)) {
              vr.errors.push(`Duplicate PIN ${vr.pin} inside the file`);
              vr.isValid = false;
            } else {
              filePins.set(vr.pin, vr.rowIdx);
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
        const { error: staffErr } = await supabase.from('staff').insert({
          name: row.name,
          pin: row.pin,
          branch_id: row.branchId,
          department: row.department,
          shift_id: shiftId,
          off_days_per_month: row.off_days_per_month,
          monthly_salary: row.monthly_salary,
          join_date: row.join_date,
          date_of_birth: row.date_of_birth,
          active: true
        });

        if (staffErr) throw staffErr;
        
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
      
      if (!staffData || staffData.length === 0) {
        alert('No staff found to export');
        return;
      }
      
      const rows = staffData.map((s: any) => {
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
        };
      });
      
      const wb = XLSX.utils.book_new();
      const wsStaff = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, wsStaff, 'Staff Register');
      
      const instructions = [
        ['HOW TO FILL THIS TEMPLATE'],
        ['name - Full staff name (required)'],
        ['pin - Exactly 4 digits, must be unique (required)'],
        ['branch - Must be: Nearbi Daily OR Nearbi Hypermarket'],
        ['department - Must be: Grocery / Fresh & Produce / Bakery / Cashier / Housekeeping / Receiving'],
        ['shift_start - Time in HH:MM format e.g. 09:00'],
        ['shift_end - Time in HH:MM format e.g. 18:00'],
        ['off_days_per_month - Must be: 0 or 2 or 4'],
        ['monthly_salary - Numbers only, no symbols'],
        ['join_date - Format: DD/MM/YYYY'],
        ['date_of_birth - Format: DD/MM/YYYY (optional)'],
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

  // Fetch staff list
  const fetchStaff = async () => {
    try {
      let query = supabase.from('staff').select('*, shift:shifts(*)').eq('active', true);
      
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
    setFormData((prev) => ({
      ...prev,
      join_date: todayStr,
      branch_id: userBranch || '', // pre-select branch if isolated
    }));

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
      const currentMonth = new Date().toISOString().slice(0, 7);
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
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const year = now.getFullYear();
      const monthNum = now.getMonth() + 1;
      const calendarDays = new Date(year, monthNum, 0).getDate();
      const startDate = `${currentMonth}-01`;
      const endDate = `${currentMonth}-31`;

      const { data: attendance, error: attErr } = await supabase
        .from('attendance')
        .select('staff_id, check_in_time, status, color_code')
        .gte('date', startDate)
        .lte('date', endDate);
      if (attErr) throw attErr;

      const { data: lateFines, error: lfErr } = await supabase
        .from('late_fines')
        .select('staff_id, color_code')
        .eq('confirmed', true)
        .eq('waived', false)
        .eq('month', currentMonth);
      if (lfErr) throw lfErr;

      const { data: specialFines, error: sfErr } = await supabase
        .from('special_fines')
        .select('staff_id')
        .eq('confirmed', true)
        .eq('waived', false)
        .eq('month', currentMonth);
      if (sfErr) throw sfErr;

      const { data: adjustments, error: adjErr } = await supabase
        .from('attendance_adjustments')
        .select('staff_id, minutes')
        .eq('type', 'ot')
        .eq('status', 'approved')
        .gte('date', startDate)
        .lte('date', endDate);
      if (adjErr) throw adjErr;

      const upsertRows = [];
      for (const s of staff) {
        const offDays = s.off_days_per_month || 4;
        const required = calendarDays - offDays;
        
        const staffAtt = attendance?.filter(a => a.staff_id === s.id && a.check_in_time) || [];
        const daysWorked = staffAtt.length;
        const attendance_pct = required > 0 ? daysWorked / required : 0;
        const attendance_score = Math.max(0, Math.min(40, Math.round(attendance_pct * 40)));

        const staffLateFinesAll = lateFines?.filter(f => f.staff_id === s.id) || [];
        const yellow = staffLateFinesAll.filter(f => f.color_code === 'yellow').length;
        const orange = staffLateFinesAll.filter(f => f.color_code === 'orange').length;
        const red = staffLateFinesAll.filter(f => f.color_code === 'red').length;
        const punctualityDeduct = (yellow * 3) + (orange * 5) + (red * 8);
        const punctuality_score = Math.max(0, 30 - punctualityDeduct);

        const staffLateFinesConfirmed = staffLateFinesAll.length;
        const staffSpecialFinesConfirmed = specialFines?.filter(f => f.staff_id === s.id).length || 0;
        const fineDeduct = (staffLateFinesConfirmed * 2) + (staffSpecialFinesConfirmed * 5);
        const fine_score = Math.max(0, 20 - fineDeduct);

        const staffOTAdjustments = adjustments?.filter(adj => adj.staff_id === s.id) || [];
        const totalOTMinutes = staffOTAdjustments.reduce((sum, adj) => sum + (adj.minutes || 0), 0);
        const ot_score = totalOTMinutes > 0 ? 10 : 5;

        const total_score = attendance_score + punctuality_score + fine_score + ot_score;

        upsertRows.push({
          staff_id: s.id,
          month: currentMonth,
          attendance_score,
          punctuality_score,
          fine_score,
          ot_score,
          total_score,
          visible_to_staff: scoresMap[s.id]?.visible_to_staff || false
        });
      }

      if (upsertRows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('performance_scores')
          .upsert(upsertRows, { onConflict: 'staff_id,month' });
        if (upsertErr) throw upsertErr;
      }

      await fetchScores();
      showToast('Scores updated');
    } catch (e: any) {
      console.error('Error recalculating scores:', e);
      showToast('Recalculation failed.');
    } finally {
      setCalculatingScores(false);
    }
  };

  const checkAndRunInitialCalculation = async () => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
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
      off_days_per_month: 4,
      monthly_salary: '',
      join_date: new Date().toISOString().split('T')[0],
      date_of_birth: '',
    });
    setIsCustomShift(false);
    setShowAddPanel(true);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name || !formData.pin || !formData.branch_id || !formData.department || !formData.shift_id || !formData.join_date) {
      setFormError('All fields are required');
      return;
    }

    if (!/^\d{4}$/.test(formData.pin)) {
      setFormError('PIN must be exactly 4 digits');
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

      // Generate text unique primary key for staff id
      const staffId = 'staff_' + Math.random().toString(36).substr(2, 9);

      const payload = {
        name: formData.name,
        pin: formData.pin,
        branch_id: formData.branch_id,
        department: formData.department,
        shift_id: formData.shift_id,
        off_days_per_month: Number(formData.off_days_per_month),
        monthly_salary: canSeeSalaryBreakdown ? Number(formData.monthly_salary) : 0,
        join_date: formData.join_date,
        date_of_birth: formData.date_of_birth || null,
        active: true,
      };

      const { data, error } = await supabase.from('staff').insert(payload).select('id');
      if (error) throw error;

      const newId = data?.[0]?.id;

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
        const { error } = await supabase.from('staff_birthday').delete().eq('staff_id', staffId);
        if (error) console.error('Error deleting staff_birthday:', error);
      } catch (e) {
        console.error('Failed to delete staff_birthday:', e);
      }

      // Step 2 — now delete the staff record itself
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staffId);

      if (error) throw error;

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

  const togglePinVisibility = (id: string) => {
    setVisiblePins((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Search filtering
  const filteredStaff = staff.filter((s) => {
    const terms = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(terms) ||
      s.department.toLowerCase().includes(terms) ||
      (s.shift?.label || '').toLowerCase().includes(terms)
    );
  });

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Staff</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">
            {staff.length} active staff members
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {user?.role === 'ops_manager' && (
            <button
              onClick={calculateScores}
              disabled={calculatingScores}
              className="bg-transparent border border-[var(--border-strong)] active:border-white text-[var(--text-secondary)] hover:text-white px-3.5 py-2 rounded-[10px] text-xs font-bold flex items-center space-x-1.5 transition-all active:scale-[0.97]"
            >
              <RefreshCw size={14} className={calculatingScores ? 'animate-spin' : ''} />
              <span>{calculatingScores ? 'Calculating...' : 'Recalculate Scores'}</span>
            </button>
          )}
          {(user?.role === 'admin' || user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
            <button
              onClick={handleExportStaff}
              className="bg-transparent border border-[var(--border-strong)] active:border-white text-[var(--text-secondary)] hover:text-white px-3.5 py-2 rounded-[10px] text-xs font-bold flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
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
                className="bg-transparent border border-[var(--border-strong)] active:border-white text-[var(--text-secondary)] hover:text-white px-3.5 py-2 rounded-[10px] text-xs font-bold flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
                title="Import Staff from Excel/CSV"
              >
                <Upload size={16} strokeWidth={1.5} />
                <span>Import</span>
              </button>
            </>
          )}
          <button
            onClick={handleOpenAddPanel}
            className="bg-white text-[#1E2028] font-bold px-4 py-2 rounded-[10px] text-sm flex items-center space-x-1.5 active:scale-95 transition-transform"
          >
            <Plus size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
            <span>Add Staff</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchStaff} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search size={18} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] pl-11 pr-4 py-3 text-white focus:outline-none focus:border-white/40 focus:ring-0 text-sm"
        />
      </div>

      {/* Staff list */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6">
          <Users size={48} strokeWidth={1} style={{ color: '#2A2D38' }} className="mb-2" />
          <h3 className="text-sm font-bold text-white">No staff found</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {search ? 'Try adjusting your search terms.' : 'Get started by adding your first staff member.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredStaff.map((s) => {
            const isDeleteMode = deleteModeId === s.id;
            const isPinVisible = !!visiblePins[s.id];

            return (
              <div
                key={s.id}
                onClick={() => router.push('/staff/' + s.id)}
                className={`bg-[var(--bg-surface)] border rounded-[14px] p-4 flex flex-col transition-all relative cursor-pointer hover:border-white/20 ${
                  isDeleteMode ? 'border-[#F87171] ring-1 ring-[#F87171]' : 'border-[var(--border)] shadow-sm'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  {/* Avatar or Delete Mode Trigger */}
                  {user?.role === 'admin' || user?.role === 'ops_manager' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteModeId(isDeleteMode ? null : s.id);
                      }}
                      className={`w-12 h-12 rounded-full font-bold text-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                        isDeleteMode
                          ? 'bg-[rgba(248,113,113,0.15)] text-[#F87171] border border-[rgba(248,113,113,0.3)]'
                          : 'bg-white/10 text-white border border-white/20'
                      }`}
                    >
                      {isDeleteMode ? <Trash2 size={20} strokeWidth={1.5} style={{ color: '#F87171' }} /> : s.name.charAt(0).toUpperCase()}
                    </button>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white/10 text-white border border-white/20 font-bold text-lg flex items-center justify-center flex-shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Profile info details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-white leading-tight truncate">
                      {s.name}
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)] font-semibold mt-0.5 leading-none">
                      {s.department} • <span className="capitalize">{getBranchLabel(s.branch_id)}</span>
                    </p>
                    {editingDobStaffId === s.id ? (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 flex items-center space-x-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-2"
                      >
                        <div className="flex-1">
                          <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-0.5">Date of Birth</label>
                          <input
                            type="date"
                            value={editingDobValue}
                            onChange={(e) => setEditingDobValue(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[6px] px-2 py-1 text-[11px] text-white focus:outline-none"
                          />
                        </div>
                        <div className="flex items-end space-x-1.5 self-end mb-0.5">
                          <button
                            type="button"
                            onClick={() => handleSaveDob(s.id)}
                            className="px-2 py-1 bg-[#4ADE80]/15 hover:bg-[#4ADE80]/25 text-[#4ADE80] border border-[#4ADE80]/30 rounded text-[10px] font-bold active:scale-95 transition-all"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDobStaffId(null)}
                            className="px-2 py-1 bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] border border-[var(--border-strong)] rounded text-[10px] font-bold active:scale-95 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-1 min-h-[16px]">
                        {s.date_of_birth ? (
                          <div className="flex items-center space-x-1 text-[10px] text-[#FBBF24] font-semibold">
                            <Cake size={11} />
                            <span>DOB: {new Date(s.date_of_birth).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-[var(--text-muted)] italic font-semibold">No DOB recorded</div>
                        )}
                        {(user?.role === 'admin' || user?.role === 'ops_manager') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDobStaffId(s.id);
                              setEditingDobValue(s.date_of_birth ? s.date_of_birth.substring(0, 10) : '');
                            }}
                            className="text-[9px] text-[var(--text-secondary)] hover:text-white font-bold underline cursor-pointer"
                          >
                            Edit DOB
                          </button>
                        )}
                      </div>
                    )}
                    {getScoreDisplay(s.id)}

                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-strong)] text-[10px] font-bold px-2 py-0.5 rounded">
                        Shift: {s.shift?.label || 'None'}
                      </span>
                      <span className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-strong)] text-[10px] font-bold px-2 py-0.5 rounded">
                        {s.off_days_per_month} off days
                      </span>
                    </div>

                    {/* PIN & Salary Display */}
                    <div className="mt-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-2.5 flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs font-bold text-[var(--text-secondary)]">
                        <span>PIN:</span>
                        <span className="font-mono text-sm tracking-widest text-white">
                          {isPinVisible ? s.pin : '••••'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinVisibility(s.id);
                          }}
                          className="text-[var(--text-secondary)] hover:text-white px-1 active:scale-90 flex items-center justify-center"
                        >
                          {isPinVisible ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                        </button>
                      </div>

                      <div className="text-xs font-bold text-white flex items-center">
                        {canSeeSalaryBreakdown ? `₹${s.monthly_salary.toLocaleString()}/mo` : <Lock size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />}
                      </div>
                    </div>

                    {/* Fine button */}
                    {user?.role !== 'admin' && (user?.role === 'ops_manager' || user?.role === 'staff_executive') && (
                      <div className="mt-2.5 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenFineModal(s);
                          }}
                          className="bg-[rgba(248,113,113,0.12)] border border-[rgba(248,113,113,0.2)] text-[#F87171] hover:bg-[rgba(248,113,113,0.2)] font-bold text-[10px] px-2.5 py-1 rounded-[6px] flex items-center space-x-1 active:scale-95 transition-transform"
                        >
                          <AlertCircle size={13} />
                          <span>Fine</span>
                        </button>
                      </div>
                    )}

                    {/* Visibility Toggle (Ops / head HR only) */}
                    {user?.role !== 'admin' && (user?.role === 'ops_manager' || (user?.role === 'staff_executive' && user.branch === null)) && scoresMap[s.id] && (
                      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-strong)] pt-2.5">
                        <span className="text-[10px] font-bold text-[var(--text-secondary)]">Score visible to staff</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleVisibility(s.id);
                          }}
                          className={`w-8 h-4 rounded-full relative transition-colors ${
                            scoresMap[s.id]?.visible_to_staff ? 'bg-[#4ADE80]' : 'bg-[#363A48]'
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.25 transition-transform ${
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
                  <div className="mt-4 pt-3.5 border-t border-[var(--border)] flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setStaffToDelete(s);
                      }}
                      className="bg-[rgba(248,113,113,0.15)] border border-[rgba(248,113,113,0.3)] text-[#F87171] hover:bg-[rgba(248,113,113,0.25)] font-bold text-xs px-4 py-2 rounded-[10px] active:scale-95 transition-all"
                    >
                      Delete Staff Member
                    </button>
                  </div>
                )}
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
            className="bg-[var(--bg-surface)] rounded-t-3xl shadow-2xl relative z-10 p-5 flex flex-col max-h-[85vh] overflow-y-auto w-full max-w-md mx-auto border-t border-[var(--border-strong)]"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 16px))' }}
          >
            {/* Grabber bar */}
            <div className="w-12 h-1 bg-[var(--border-strong)] rounded-full mx-auto mb-4 flex-shrink-0" />

            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">New Staff Member</h2>
              <button
                onClick={() => setShowAddPanel(false)}
                className="text-[var(--text-muted)] hover:text-white flex items-center justify-center p-1"
              >
                <X size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              </button>
            </div>

            {formError && (
              <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-3 py-2 rounded-md mb-4 flex-shrink-0">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddStaff} className="space-y-4 flex-1">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white font-mono text-center"
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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
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
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
                    required
                  >
                    <option value="">Select...</option>
                    <option value="Grocery">Grocery</option>
                    <option value="Fresh & Produce">Fresh & Produce</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Cashier">Cashier</option>
                    <option value="Housekeeping">Housekeeping</option>
                    <option value="Receiving">Receiving</option>
                  </select>
                </div>
              </div>

              {/* Shift selector & custom creator inline */}
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
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white mb-2"
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
                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3.5 space-y-3 mt-2">
                    <h4 className="text-xs font-bold text-white">New Custom Shift</h4>
                    {customShiftError && (
                      <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-[10px] font-bold p-2 rounded">
                        {customShiftError}
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                        Shift Label (e.g. Evening shift)
                      </label>
                      <input
                        type="text"
                        value={customShift.label}
                        onChange={(e) => setCustomShift({ ...customShift, label: e.target.value })}
                        placeholder="e.g. General Shift"
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2 text-xs focus:outline-none text-white focus:border-white/40"
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
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2 text-xs focus:outline-none text-white focus:border-white/40"
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
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2 text-xs focus:outline-none text-white focus:border-white/40"
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
                        className="text-xs text-[var(--text-secondary)] font-bold hover:underline"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCustomShift}
                        disabled={customShiftLoading}
                        className="bg-white text-[#1E2028] font-bold text-xs px-3.5 py-1.5 rounded-[10px] active:scale-95 transition-transform"
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
                        onClick={() => setFormData({ ...formData, off_days_per_month: num })}
                        className={`flex-1 py-2.5 rounded-[10px] border text-xs font-bold transition-all ${
                          isSelected
                            ? 'bg-white text-[#1E2028] border-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border)] active:scale-95'
                        }`}
                      >
                        {num} Days
                      </button>
                    );
                  })}
                </div>
              </div>

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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={formLoading}
                className="w-full min-h-[40px] bg-white text-[#1E2028] font-bold text-sm rounded-[10px] active:scale-95 transition-all mt-4"
              >
                {formLoading ? 'Saving...' : 'Save Staff Member'}
              </button>
            </form>
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
          <div className="bg-[var(--bg-surface)] rounded-[16px] shadow-2xl relative z-10 p-6 w-full max-w-xs text-center border border-[var(--border-strong)] flex flex-col items-center">
            <AlertTriangle size={36} strokeWidth={1.5} style={{ color: '#FBBF24' }} className="mb-3" />
            <h3 className="text-base font-bold text-white mb-1">
              Remove {staffToDelete.name}?
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-6">
              This will permanently delete this staff member and all associated registers, leave claims, and fine sheets.
            </p>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setStaffToDelete(null)}
                className="flex-1 bg-transparent border border-[var(--border-strong)] text-[var(--text-secondary)] font-bold text-xs py-2.5 rounded-[10px] active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStaff}
                className="flex-1 bg-[rgba(248,113,113,0.15)] border border-[rgba(248,113,113,0.3)] text-[#F87171] hover:bg-[rgba(248,113,113,0.25)] font-bold text-xs py-2.5 rounded-[10px] active:scale-95 transition-all shadow"
              >
                Yes, delete
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
                  {importRows.filter(r => !r.isValid).length}
                </span>{' '}
                rows have errors
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
                        row.isValid ? 'border-l-4 border-l-[#4ADE80]' : 'border-l-4 border-l-[#F87171]'
                      }`}
                    >
                      <td className="p-2.5 text-[var(--text-secondary)] font-bold">{row.rowIdx}</td>
                      <td className="p-2.5">
                        {row.isValid ? (
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
                      <td className="p-2.5 text-[var(--text-secondary)]">{row.branchRaw || '—'}</td>
                      <td className="p-2.5 text-[var(--text-secondary)]">{row.department || '—'}</td>
                      <td className="p-2.5 text-xs whitespace-normal">
                        {row.isValid ? (
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

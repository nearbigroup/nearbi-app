'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Clock, RefreshCw, CircleCheck, CircleX, AlertTriangle, X, AlertCircle, Download, Upload, Check } from 'lucide-react';
import SpecialFineBottomSheet from '@/components/SpecialFineBottomSheet';
import * as XLSX from 'xlsx';
import { DEPARTMENTS } from '@/lib/data';
import { calculateOTMinutes, calculateActualHours } from '@/lib/salary';



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
  ot_minutes: number;
  ot_approved: boolean;
  early_in_minutes: number;
  early_in_approved: boolean;
  check_in_photo: string | null;
  check_out_photo: string | null;
  marked_by: string;
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
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fines, setFines] = useState<LateFine[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [branchFilter, setBranchFilter] = useState<BranchFilter>('All');
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; label: string; time?: string } | null>(null);

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
      const startDate = `${targetMonth}-01`;
      const endDate = `${targetMonth}-31`;
      
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        
        const headers = Object.keys(rows[0]);
        const isMonthlyGrid = headers.some(h => h.includes('-IN') || h.includes('-OUT'));
        
        let staffQuery = supabase.from('staff').select('*, shift:shifts(*)').eq('active', true);
        if (userBranch) {
          staffQuery = staffQuery.eq('branch_id', userBranch);
        }
        const { data: staffList, error: staffErr } = await staffQuery;
        if (staffErr) throw staffErr;
        
        const staffMap = new Map<string, any>();
        staffList?.forEach(s => {
          staffMap.set(String(s.pin).trim(), s);
        });
        
        const [yearStr, monthStr] = selectedMonth.split('-');
        const startDate = `${selectedMonth}-01`;
        const endDate = `${selectedMonth}-31`;
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
        
        const validatedRows: any[] = [];
        let readyCount = 0;
        let errorCount = 0;
        let overwriteCount = 0;
        
        if (isMonthlyGrid) {
          const year = parseInt(yearStr);
          const monthNum = parseInt(monthStr);
          const calendarDays = new Date(year, monthNum, 0).getDate();
          
          rows.forEach((row: any, rowIdx: number) => {
            const pinRaw = row.PIN ? String(row.PIN).trim() : '';
            const staffMem = staffMap.get(pinRaw);
            const deptVal = row.Department || row.department ? String(row.Department || row.department).trim() : '';
            
            if (!pinRaw) {
              validatedRows.push({
                rowIdx: rowIdx + 1,
                name: row.Name || '—',
                pin: '—',
                date: '—',
                inTime: '—',
                outTime: '—',
                status: 'error',
                errors: ['Missing PIN'],
                overwrite: false
              });
              errorCount++;
              return;
            }
            
            if (!staffMem) {
              validatedRows.push({
                rowIdx: rowIdx + 1,
                name: row.Name || '—',
                pin: pinRaw,
                date: '—',
                inTime: '—',
                outTime: '—',
                status: 'error',
                errors: [`PIN ${pinRaw} not found`],
                overwrite: false
              });
              errorCount++;
              return;
            }
            
            for (let day = 1; day <= calendarDays; day++) {
              const inCol = `${day}-IN`;
              const outCol = `${day}-OUT`;
              const inVal = row[inCol];
              const outVal = row[outCol];
              
              if (inVal !== undefined && String(inVal).trim() !== '') {
                const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const inTime = parseTime(inVal);
                const outTime = outVal ? parseTime(outVal) : '';
                
                const errors: string[] = [];
                if (!/^\d{2}:\d{2}$/.test(inTime)) {
                  errors.push(`Invalid IN time format for Day ${day}: ${inTime}`);
                }
                if (outTime && !/^\d{2}:\d{2}$/.test(outTime)) {
                  errors.push(`Invalid OUT time format for Day ${day}: ${outTime}`);
                }
                const validDepts = DEPARTMENTS.map(d => d.toLowerCase());
                if (deptVal && !validDepts.includes(deptVal.toLowerCase())) {
                  errors.push('Invalid department: ' + deptVal);
                }
                
                const hasOverlap = attMap.has(`${staffMem.id}_${dateStr}`);
                
                const rowObj = {
                  rowIdx: rowIdx + 1,
                  staffId: staffMem.id,
                  name: staffMem.name,
                  pin: pinRaw,
                  date: dateStr,
                  inTime,
                  outTime,
                  shift: staffMem.shift,
                  branchId: staffMem.branch_id,
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
              }
            }
          });
        } else {
          rows.forEach((row: any, rowIdx: number) => {
            const pinRaw = row.PIN || row.pin ? String(row.PIN || row.pin).trim() : '';
            const staffMem = staffMap.get(pinRaw);
            const dateVal = row.Date || row.date ? String(row.Date || row.date).trim() : '';
            const inVal = row['Check In Time'] || row.check_in_time ? String(row['Check In Time'] || row.check_in_time).trim() : '';
            const outVal = row['Check Out Time'] || row.check_out_time ? String(row['Check Out Time'] || row.check_out_time).trim() : '';
            
            const errors: string[] = [];
            if (!pinRaw) {
              errors.push('Missing PIN');
            } else if (!staffMem) {
              errors.push(`PIN ${pinRaw} not found`);
            }
            
            const validDepts = DEPARTMENTS.map(d => d.toLowerCase());
            const rowDept = row.Department || row.department;
            if (rowDept && !validDepts.includes(String(rowDept).trim().toLowerCase())) {
              errors.push('Invalid department: ' + rowDept);
            }

            
            let parsedDateStr = '';
            if (!dateVal) {
              errors.push('Missing Date');
            } else {
              parsedDateStr = parseDate(dateVal);
              if (!parsedDateStr || isNaN(Date.parse(parsedDateStr))) {
                errors.push(`Date format invalid: ${dateVal}`);
              }
            }
            
            const inTime = parseTime(inVal);
            const outTime = outVal ? parseTime(outVal) : '';
            if (inVal && !/^\d{2}:\d{2}$/.test(inTime)) {
              errors.push(`Invalid Check In Time: ${inTime}`);
            }
            if (outVal && !/^\d{2}:\d{2}$/.test(outTime)) {
              errors.push(`Invalid Check Out Time: ${outTime}`);
            }
            
            const staffId = staffMem?.id || '';
            const hasOverlap = staffId && parsedDateStr ? attMap.has(`${staffId}_${parsedDateStr}`) : false;
            
            const rowObj = {
              rowIdx: rowIdx + 1,
              staffId,
              name: staffMem?.name || row.Name || row.name || '—',
              pin: pinRaw,
              date: parsedDateStr || dateVal,
              inTime,
              outTime,
              shift: staffMem?.shift || null,
              branchId: staffMem?.branch_id || '',
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
        }
        
        setImportRows(validatedRows);
        setImportSummary({ ready: readyCount, errors: errorCount, overwrites: overwriteCount });
        setImportPreviewOpen(true);
        setBottomSheetOpen(false);
      } catch (err: any) {
        console.error(err);
        alert('Failed to parse Excel file');
      }
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
      const firstDayOfMonth = `${selectedMonth}-01`;
      const lastDayOfMonth = `${selectedMonth}-31`;
      
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

        const [sh, sm] = row.shift.start_time.split(':').map(Number);
        const shiftStartMins = sh * 60 + sm;

        const [ih, im] = row.inTime.split(':').map(Number);
        const inMins = ih * 60 + im;

        let minutesLate = 0;
        let status: 'present' | 'late' = 'present';
        let colorCode: 'green' | 'yellow' | 'orange' | 'red' = 'green';

        if (inMins > shiftStartMins) {
          minutesLate = inMins - shiftStartMins;
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

        let actualHoursWorked = null;
        let otMinutes = 0;

        if (row.outTime) {
          const shiftEnd = row.shift?.end_time || '18:00';
          otMinutes = calculateOTMinutes(shiftEnd, row.outTime);
          actualHoursWorked = calculateActualHours(row.inTime, row.outTime);
        }

        // FIX 4: Build the record object dynamically.
        // If schema cache errors occur, go to
        // Supabase Dashboard → Settings → API
        // and click "Reload schema cache"
        const record: any = {
          staff_id: row.staffId,
          date: row.date,
          check_in_time: row.inTime,
          check_out_time: row.outTime || null,
          status,
          marked_by: 'import'
        };

        if (minutesLate > 0) record.minutes_late = minutesLate;
        if (colorCode) record.color_code = colorCode;
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
              marked_by: 'import'
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

        if (status === 'late' && !exemptStaffIds.has(row.staffId)) {
          let fineAmount = 0;
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

          const fineKey = `${row.staffId}_${row.date}`;
          if (fineAmount > 0 && !existingFinesSet.has(fineKey)) {
            const currentMonthStr = `${yearStr}-${monthStr}`;
            const { error: fineErr } = await supabase.from('late_fines').insert({
              staff_id: row.staffId,
              date: row.date,
              late_minutes: minutesLate,
              color_code: colorCode,
              fine_amount: fineAmount,
              waived: false,
              month: currentMonthStr
            });
            if (fineErr) throw fineErr;
            finesLogged++;
          }
        }

        if (otMinutes > 0) {
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

  const fetchData = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Fetch staff
      try {
        let staffQuery = supabase.from('staff').select('*, shift:shifts(*)').eq('active', true);
        if (userBranch) {
          staffQuery = staffQuery.eq('branch_id', userBranch);
        }
        const { data: sData, error: sErr } = await staffQuery;
        if (sErr) {
          console.error('Error fetching staff:', sErr);
          setErrorMsg('Could not load staff list.');
          setStaff([]);
        } else {
          setStaff((sData || []) as unknown as StaffMember[]);
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

    } catch (err: any) {
      console.error('Attendance fetch error:', err);
      setErrorMsg('Could not load data. Check connection.');
    } finally {
      setLoading(false);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userBranch]);

  // Combine staff with today's metrics (FIX 2 - Step 3)
  const combinedData = staff.map((s) => {
    const record = attendance.find((a) => a.staff_id === s.id);
    const lateFine = fines.find((f) => f.staff_id === s.id);
    const staffAdjustments = adjustments.filter((adj) => adj.staff_id === s.id);

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
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Present') return !!item.record && item.record.check_in_time;
    if (statusFilter === 'Late') return !!item.record && item.record.status === 'late';
    if (statusFilter === 'Absent') return !item.record || !item.record.check_in_time;
    if (statusFilter === 'Checked Out') return !!item.record && !!item.record.check_out_time;

    return true;
  });

  const getStatusBadge = (record: AttendanceRecord | null) => {
    if (!record || !record.check_in_time) {
      return (
        <span className="bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger)]/20 text-[10px] font-bold px-2.5 py-1.5 rounded-[20px] uppercase tracking-wider flex items-center space-x-1.5">
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

  const getDotColor = (record: AttendanceRecord | null) => {
    if (!record || !record.check_in_time) return 'bg-[#999999]';
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1A1A1A] text-2xl font-bold">Attendance</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">Today's register</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setBottomSheetOpen(true)}
            className="min-h-[40px] bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-[0.98] text-[#1A1A1A] px-3.5 rounded-[12px] text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Download size={16} strokeWidth={1.5} />
            <span>Import/Export</span>
          </button>
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="min-h-[40px] bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-[0.98] text-[#1A1A1A] px-3.5 rounded-[12px] text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer"
          >
            <RefreshCw size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
            <span>Refresh</span>
          </button>
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

      {/* Main List */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
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
                onClick={() => router.push('/staff/' + item.id)}
                className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex items-start space-x-3.5 relative shadow-sm cursor-pointer hover:border-[#D0D0D0] transition-all"
              >
                {/* Left Dot Indicator */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-2 ${getDotColor(item.record)}`} />

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
                        {item.department} • {item.shift?.label || 'No Shift'}
                      </p>
                      {/* Admin/Ops see branch indicator */}
                      {!userBranch && (
                        <span className="inline-block text-[9px] font-bold uppercase text-[#555555] mt-1 bg-[#F2F2F2] border border-[#E8E8E8] px-1.5 py-0.5 rounded">
                          {getBranchName(item.branch_id)}
                        </span>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="flex-shrink-0">{getStatusBadge(item.record)}</div>
                  </div>

                  {/* Metrics details */}
                  {hasCheckIn && item.record && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {/* Check In Time & Photo */}
                      <div className="bg-[#EDF7EF] border border-[#2D7A3A]/20 text-[#2D7A3A] text-[10px] font-bold px-2.5 py-1 rounded-[20px] flex items-center space-x-1.5">
                        <span>IN: {item.record.check_in_time}</span>
                        {item.record.check_in_photo && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPhoto({
                                url: item.record!.check_in_photo!,
                                label: `${item.name} - Check In`,
                                time: item.record!.check_in_time || '',
                              });
                            }}
                            className="w-4.5 h-4.5 rounded-full overflow-hidden border border-[#2D7A3A]/25 active:scale-90"
                          >
                            <img
                              src={item.record.check_in_photo}
                              alt="Selfie"
                              className="w-full h-full object-cover"
                            />
                          </button>
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
                          <span>OUT: {item.record.check_out_time}</span>
                          {item.record.check_out_photo && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhoto({
                                  url: item.record!.check_out_photo!,
                                  label: `${item.name} - Check Out`,
                                  time: item.record!.check_out_time || '',
                                });
                              }}
                              className="w-4.5 h-4.5 rounded-full overflow-hidden border border-[#1A5FA8]/25 active:scale-90"
                            >
                              <img
                                src={item.record.check_out_photo}
                                alt="Selfie"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          )}
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
          className="fixed inset-0 z-[11000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-sm w-full bg-white rounded-[14px] border border-[#E8E8E8] p-5 flex flex-col items-center shadow-lg">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 text-[#999999] hover:text-[#1A1A1A] flex items-center justify-center p-1"
            >
              <X size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
            </button>
            <h4 className="text-[#1A1A1A] text-sm font-bold mb-1">{selectedPhoto.label}</h4>
            {selectedPhoto.time && (
              <p className="text-[10px] text-[#999999] font-bold mb-3">Time: {selectedPhoto.time}</p>
            )}
            <img
              src={selectedPhoto.url}
              alt="Verification selfie"
              className="w-full max-h-[60vh] object-contain rounded-lg border border-[#E8E8E8]"
            />
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
          <div className="bg-white rounded-t-[20px] shadow-lg relative z-10 w-full max-w-md border-t border-[#E8E8E8] p-6 animate-slide-up flex flex-col space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#E8E8E8] pb-3">
              <h3 className="text-[#1A1A1A] text-base font-bold">Import / Export Attendance</h3>
              <button
                type="button"
                onClick={() => setBottomSheetOpen(false)}
                className="text-[#999999] hover:text-[#1A1A1A]"
              >
                <X size={20} />
              </button>
            </div>

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

            <button
              type="button"
              onClick={() => setBottomSheetOpen(false)}
              className="w-full min-h-[44px] bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#555555] font-bold text-xs py-2.5 rounded-[12px] active:scale-95 transition-all cursor-pointer"
            >
              Cancel
            </button>
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
    </div>
  );
}

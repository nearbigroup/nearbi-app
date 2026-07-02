'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { calculateSalary, calculateHourlySalary, calculateMinutesWorked } from '@/lib/salary';
import { Staff, SalaryConfirmation } from './types';
import { formatCurrency, getCurrentMonthStr, formatMonthDisplay } from './utils';
import { Check, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { createAuditLog } from '@/lib/audit';
import SpecialFinesSection from './SpecialFinesSection';

export default function BulkConfirmTab({ 
  selectedMonth,
  onConfirmationsUpdated
}: { 
  selectedMonth?: string;
  onConfirmationsUpdated?: () => void;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [confirmations, setConfirmations] = useState<SalaryConfirmation[]>([]);
  const [lateFines, setLateFines] = useState<any[]>([]);
  const [specialFines, setSpecialFines] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  
  const [salaryData, setSalaryData] = useState<Record<string, any>>({});
  const [extraLeaves, setExtraLeaves] = useState<Record<string, number>>({});
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [filterBranch, setFilterBranch] = useState<'all' | 'daily' | 'hypermarket'>('all');
  const [confirmingFines, setConfirmingFines] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const month = selectedMonth || getCurrentMonthStr();

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      
      // 1. Fetch active staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*, branch:branches(name), shift:shifts(*)')
        .eq('active', true)
        .order('name');
         
      if (staffError) throw staffError;
      if (!staffData) return;

      // 2. Fetch OT minutes and other details from attendance for this month
      const year = parseInt(month.split('-')[0]);
      const monthNum = parseInt(month.split('-')[1]);
      const startDate = `${month}-01`;
      const lastDayNum = new Date(year, monthNum, 0).getDate();
      const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .select(`
          staff_id,
          date,
          check_in_time,
          status,
          ot_minutes,
          ot_approved,
          early_in_minutes,
          early_in_approved,
          early_leave_minutes,
          day_type,
          late_salary_deduction_minutes
        `)
        .gte('date', startDate)
        .lte('date', endDate);

      if (attError) throw attError;
      setAttendanceRecords(attData || []);

      // Fetch approved leaves
      const { data: leaveData, error: leaveError } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('status', 'approved')
        .gte('date', startDate)
        .lte('date', endDate);

      if (leaveError) throw leaveError;
      setLeaveRequests(leaveData || []);

      // Aggregate OT minutes
      const otMap: Record<string, number> = {};
      if (attData) {
        attData.forEach((r) => {
          if (r.ot_approved === true) {
            otMap[r.staff_id] = (otMap[r.staff_id] || 0) + (r.ot_minutes || 0);
          }
        });
      }

      const staffWithOT = staffData.map((s) => ({
        ...s,
        total_ot_minutes: otMap[s.id] || 0,
      }));

      setStaffList(staffWithOT as unknown as Staff[]);

      // 3. Fetch existing confirmations
      const { data: confData, error: confError } = await supabase
        .from('salary_confirmations')
        .select('*')
        .eq('month', month);

      if (confError) throw confError;
      if (confData) setConfirmations(confData);

      // 4. Fetch late fines
      const { data: lfData, error: lfError } = await supabase
        .from('late_fines')
        .select('*')
        .eq('month', month);
      if (lfError) throw lfError;
      setLateFines(lfData || []);

      // 5. Fetch special fines
      const { data: sfData, error: sfError } = await supabase
        .from('special_fines')
        .select('*')
        .eq('month', month);
      if (sfError) throw sfError;
      setSpecialFines(sfData || []);

    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load salary data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month]);

  useEffect(() => {
    // Recalculate salaries when staff list, attendance records, extra leaves, late fines, or special fines change
    const newSalaryData: Record<string, any> = {};
    
    staffList.forEach((s) => {
      const isHourly = s.pay_type === 'hourly';
      if (!s.shift && !isHourly) return;
      
      const year = parseInt(month.split('-')[0]);
      const monthNum = parseInt(month.split('-')[1]);
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      
      // Filter attendance records for current staff
      const staffAtt = attendanceRecords.filter((r) => r.staff_id === s.id);
      
      if (isHourly) {
        const standardHours = Number(s.standard_hours || 234);
        const totalHoursWorked = staffAtt.reduce((sum, r) => {
          if (r.total_hours_logged !== null && r.total_hours_logged !== undefined && Number(r.total_hours_logged) > 0) {
            return sum + Number(r.total_hours_logged);
          }
          if (r.check_in_time && r.check_out_time) {
            return sum + (calculateMinutesWorked(r.check_in_time, r.check_out_time) / 60);
          }
          return sum;
        }, 0);

        const hourlyResult = calculateHourlySalary(s.monthly_salary, standardHours, totalHoursWorked);
        newSalaryData[s.id] = {
          is_hourly: true,
          net_salary: hourlyResult.netSalary,
          hourly_rate: hourlyResult.hourlyRate,
          total_hours: hourlyResult.totalHours,
          standard_hours: standardHours,
          ot_pay: 0,
          early_in_pay: 0,
          leave_deduction: 0,
          extra_days_pay: 0,
          confirmed_fines: 0,
          confirmed_special_fines: 0,
          paid_days: 0,
          early_leave_deduction: 0,
          late_salary_deduction: 0,
          ot_minutes: 0,
        };
      } else {
        // Real days worked (any day with check-in time)
        const daysActuallyWorked = staffAtt.filter(
          (r) => r.check_in_time !== null &&
          r.check_in_time !== undefined &&
          r.check_in_time !== ''
        ).length;

        // Count genuine absent days and approved leave days
        const staffLeaves = leaveRequests.filter(l => l.staff_id === s.id && l.status === 'approved');
        let genuineAbsentDays = 0;

        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${month}-${String(d).padStart(2, '0')}`;
          const att = staffAtt.find(r => r.date === dateStr);
          const hasLeave = staffLeaves.some(l => l.date === dateStr);

          if (att) {
            // If record exists, is it status absent, and not weekly off, not holiday, and no approved leave?
            if (att.status === 'absent' && att.day_type !== 'weekly_off' && att.day_type !== 'holiday' && !hasLeave) {
              genuineAbsentDays++;
            }
          } else {
            // If no record exists, and no approved leave exists, it is absent
            if (!hasLeave) {
              genuineAbsentDays++;
            }
          }
        }

        // Quota logic
        const offDaysPerMonth = s.off_days_per_month as 0 | 2 | 4;
        let earnedQuota = 0;
        if (offDaysPerMonth === 4) {
          earnedQuota = Math.min(Math.floor(daysActuallyWorked / 6), 4);
        } else if (offDaysPerMonth === 2) {
          earnedQuota = Math.min(Math.floor(daysActuallyWorked / 12), 2);
        }

        // Weekly offs taken (unique dates marked as weekly off in attendance, or as a weekly off leave request)
        const weeklyOffDates = new Set([
          ...staffAtt.filter(r => r.day_type === 'weekly_off').map(r => r.date),
          ...staffLeaves.filter(l => l.is_weekly_off === true).map(l => l.date)
        ]);
        const weeklyOffsTaken = weeklyOffDates.size;
        const weeklyOffsUsed = Math.min(weeklyOffsTaken, earnedQuota);

        // absences = calendarDays - daysActuallyWorked
        const absences = daysInMonth - daysActuallyWorked;

        // deductedDays = absences - weeklyOffsUsed + manualExtraLeaves
        const manualExtraLeaves = extraLeaves[s.id] || 0;
        const deductedDays = Math.max(0, absences - weeklyOffsUsed) + manualExtraLeaves;

        const missingDays = deductedDays;

        // Approved OT minutes only
        const approvedOTMinutes = staffAtt
          .filter((r) => r.ot_approved === true)
          .reduce((sum, r) => sum + (r.ot_minutes || 0), 0) || 0;

        // Approved early check-in minutes only
        const approvedEarlyInMinutes = staffAtt
          .filter((r) => r.early_in_approved === true)
          .reduce((sum, r) => sum + (r.early_in_minutes || 0), 0) || 0;

        // Early leave minutes total
        const earlyLeaveMinutes = staffAtt.reduce(
          (sum, r) => sum + (r.early_leave_minutes || 0), 0
        ) || 0;

        // Calculate confirmed late fines (with partial waive support)
        const staffLateFines = lateFines.filter(
          (lf) => lf.staff_id === s.id && lf.confirmed
        );
        const totalLateFinesAmt = staffLateFines.reduce((sum, lf) => {
          const amt = Number(lf.fine_amount);
          const waivedAmt = Number(lf.waived_amount || 0);
          return sum + (lf.waived ? 0 : Math.max(0, amt - waivedAmt));
        }, 0);

        // Calculate confirmed special fines (with partial waive support)
        const staffSpecialFines = specialFines.filter(
          (sf) => sf.staff_id === s.id && sf.confirmed
        );
        const totalSpecialFinesAmt = staffSpecialFines.reduce((sum, sf) => {
          const amt = Number(sf.edited_amount ?? sf.amount);
          const waivedAmt = Number(sf.waived_amount || 0);
          return sum + (sf.waived ? 0 : Math.max(0, amt - waivedAmt));
        }, 0);

        const shiftHours = s.shift?.hours || 9;

        const breakdown = calculateSalary(
          {
            monthlySalary: s.monthly_salary,
            offDaysPerMonth,
            shiftHours,
            year,
            month: monthNum,
          },
          {
            daysActuallyWorked,
            confirmedLateFines: totalLateFinesAmt,
            confirmedSpecialFines: totalSpecialFinesAmt,
            approvedOTMinutes,
            approvedEarlyInMinutes,
            earlyLeaveMinutes,
            missingDays,
            late_salary_deduction_minutes: staffAtt.reduce((sum, r) => sum + (r.late_salary_deduction_minutes || 0), 0),
            leaves_taken: staffLeaves.filter(l => !l.is_weekly_off).length,
          }
        );

        const netSalary = Math.max(0, breakdown.netSalary);

        newSalaryData[s.id] = {
          net_salary: netSalary,
          ot_pay: breakdown.otPay,
          early_in_pay: breakdown.earlyInPay,
          leave_deduction: breakdown.missingDays * breakdown.dailyRate,
          extra_days_pay: breakdown.extraDaysWorked * breakdown.dailyRate,
          confirmed_fines: totalLateFinesAmt,
          confirmed_special_fines: totalSpecialFinesAmt,
          paid_days: breakdown.paidDays,
          early_leave_deduction: breakdown.earlyLeaveDeduction,
          late_salary_deduction: breakdown.lateSalaryDeduction,
          ot_minutes: approvedOTMinutes,
        };
      }
    });
    
    setSalaryData(newSalaryData);
  }, [staffList, attendanceRecords, extraLeaves, lateFines, specialFines, leaveRequests]);

  const handleUpdateLeave = (staffId: string, delta: number) => {
    setExtraLeaves((prev) => {
      const current = prev[staffId] || 0;
      return { ...prev, [staffId]: Math.max(0, current + delta) };
    });
  };

  const handleConfirmSelected = async (targetStaffIds?: string[]) => {
    if (!user) return;
    
    const idsToConfirm = targetStaffIds || selectedStaffIds;
    if (idsToConfirm.length === 0) {
      alert('Please select at least one staff member to confirm.');
      return;
    }

    const staffToConfirm = filteredStaff.filter((s) => idsToConfirm.includes(s.id) && !confirmations.find((c) => c.staff_id === s.id));
    if (staffToConfirm.length === 0) {
      alert('All selected staff members are already confirmed.');
      return;
    }

    setBulkConfirm({
      message: `Confirm salary for ${staffToConfirm.length} selected staff member(s)?`,
      onConfirm: async () => {
        setConfirming(true);
        try {
          const payload = staffToConfirm.map((s) => {
            const bd = salaryData[s.id];
            const isHourly = s.pay_type === 'hourly';
            return {
              staff_id: s.id,
              month: month,
              net_salary: bd.net_salary,
              base_salary: s.monthly_salary,
              paid_days: isHourly ? 0 : (bd.paid_days || 30),
              leave_deduction: isHourly ? 0 : bd.leave_deduction,
              ot_pay: isHourly ? 0 : bd.ot_pay,
              early_in_pay: isHourly ? 0 : (bd.early_in_pay || 0),
              early_leave_deduction: isHourly ? 0 : (bd.early_leave_deduction || 0),
              extra_leave_days: isHourly ? 0 : (extraLeaves[s.id] || 0),
              ot_minutes: isHourly ? 0 : (bd.ot_minutes || 0),
              confirmed_fines: isHourly ? 0 : (bd.confirmed_fines || 0),
              confirmed_special_fines: isHourly ? 0 : (bd.confirmed_special_fines || 0),
              confirmed_by: user.email || 'Admin',
              is_locked: true,
              late_salary_deduction: isHourly ? 0 : (bd.late_salary_deduction || 0),
              is_hourly: isHourly,
              total_hours_logged: isHourly ? (bd.total_hours_logged || 0) : 0,
              standard_hours: isHourly ? (bd.standard_hours || 0) : 0,
              hourly_rate: isHourly ? (bd.hourly_rate || 0) : 0,
            };
          });

          if (payload.length > 0) {
            setBulkProgress({ current: 0, total: payload.length });
            let currentCount = 0;

            for (const item of payload) {
              const { error } = await supabase.from('salary_confirmations').insert(item);
              if (error) throw error;
              
              currentCount++;
              setBulkProgress({ current: currentCount, total: payload.length });
            }

            await createAuditLog({
              action: 'bulk_confirm_salaries',
              table_name: 'salary_confirmations',
              new_value: { affected_count: payload.length },
              performed_by: user.email,
              performed_by_role: user.role || 'admin',
              reason: `Bulk confirmed salary for ${payload.length} staff members`
            });

            // Silent wall event logging
            try {
              const events = staffToConfirm.map(s => {
                const bd = salaryData[s.id];
                return {
                  event_type: 'salary_confirmed',
                  staff_id: s.id,
                  staff_name: s.name,
                  branch_id: s.branch_id,
                  description: `Salary confirmed for ${s.name} for ${formatMonthDisplay(month)}: Net ₹${bd.net_salary.toLocaleString()}`
                };
              });
              await supabase.from('wall_events').insert(events);
            } catch (e) {
              console.error('Silent insert wall event failed:', e);
            }

            await fetchData();
            setSelectedStaffIds([]); // Clear selection
            
            setToastMsg(`${payload.length} salaries confirmed ✓`);
            setTimeout(() => setToastMsg(''), 3000);

            if (onConfirmationsUpdated) {
              onConfirmationsUpdated();
            }
          }
        } catch (err) {
          console.error(err);
          alert('Failed to confirm salaries.');
        } finally {
          setBulkProgress(null);
          setConfirming(false);
        }
      }
    });
  };

  const handleConfirmAll = async () => {
    const unconfirmed = filteredStaff.filter((s) => !confirmations.find((c) => c.staff_id === s.id));
    if (unconfirmed.length === 0) {
      alert('No unconfirmed salaries for this month.');
      return;
    }
    const unconfirmedIds = unconfirmed.map(s => s.id);
    await handleConfirmSelected(unconfirmedIds);
  };

  const handleConfirmAllFines = async () => {
    if (!user) return;
    const pendingFines = lateFines.filter(lf => !lf.confirmed && !lf.waived);
    if (pendingFines.length === 0) {
      alert("No pending late fines to confirm for this month.");
      return;
    }
    
    setConfirmingFines(true);
    try {
      const count = pendingFines.length;
      const total = pendingFines.reduce((sum, lf) => sum + Number(lf.fine_amount), 0);
      
      const { error } = await supabase
        .from('late_fines')
        .update({ confirmed: true })
        .eq('month', month)
        .eq('confirmed', false)
        .eq('waived', false);
        
      if (error) throw error;
      
      await createAuditLog({
        action: 'bulk_confirm_fines',
        table_name: 'late_fines',
        new_value: { confirmed: true, month },
        performed_by: user.email,
        performed_by_role: user.role || 'admin',
        reason: `Bulk confirmed ${count} late fines totaling ₹${total}`
      });
      
      alert(`${count} fines confirmed — ₹${total.toLocaleString()} total`);
      await fetchData();
    } catch (e: any) {
      console.error(e);
      alert("Failed to confirm fines: " + e.message);
    } finally {
      setConfirmingFines(false);
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const branchMatch = filterBranch === 'all' || s.branch_id === filterBranch;
    if (!branchMatch) return false;
    
    if (searchQuery.trim()) {
      return s.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    }
    return true;
  });

  const unconfirmedCount = filteredStaff.filter(
    (s) => !confirmations.find((c) => c.staff_id === s.id)
  ).length;

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-[110px] w-full" />
        <div className="skeleton h-[110px] w-full" />
        <div className="skeleton h-[110px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 select-none">
      {/* Title block */}
      <div className="print:hidden">
        <h2 className="text-[#1A1A1A] text-base font-bold">
          Salary Confirmation — {formatMonthDisplay(month)}
        </h2>
        <p className="text-[var(--text-muted)] text-xs font-semibold">
          Verify and lock monthly payroll rates.
        </p>
      </div>

      {/* Search Input Box */}
      <div className="relative print:hidden">
        <input
          type="text"
          placeholder="Search staff by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-[#E8E8E8] rounded-xl p-3 pl-10 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-medium shadow-sm"
        />
        <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-[#999999]" />
      </div>

      {(() => {
        const pendingFinesList = lateFines.filter(lf => !lf.confirmed && !lf.waived);
        const count = pendingFinesList.length;
        const total = pendingFinesList.reduce((sum, lf) => sum + Number(lf.fine_amount), 0);
        
        if (count === 0) return null;
        
        return (
          <div className="bg-[#FFF8E7] border border-[#FFEBAA] rounded-xl p-3 flex items-center justify-between text-xs print:hidden shadow-sm">
            <div className="flex items-center space-x-2 text-[#B8860B] font-semibold">
              <AlertCircle size={16} />
              <span>There are {count} pending late fines totaling {formatCurrency(total)}.</span>
            </div>
            <button
              onClick={handleConfirmAllFines}
              disabled={confirmingFines}
              className="bg-[#B8860B] hover:bg-[#9E720A] text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
            >
              {confirmingFines ? 'Confirming...' : 'Confirm All Fines'}
            </button>
          </div>
        );
      })()}

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button onClick={fetchData} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Branch selector */}
      <div className="flex gap-2 print:hidden">
        {(['all', 'daily', 'hypermarket'] as const).map((b) => {
          const isActive = filterBranch === b;
          return (
            <button
              key={b}
              onClick={() => setFilterBranch(b)}
              className={`flex-1 text-center py-2.5 rounded-[12px] border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                  : 'bg-white text-[#555555] border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95'
              }`}
            >
              {b === 'all' ? 'All' : b === 'daily' ? 'Daily' : 'Hypermarket'}
            </button>
          );
        })}
      </div>

      {/* Select All / Checkbox controls */}
      <div className="flex justify-between items-center bg-white border border-[#E8E8E8] rounded-xl p-3 print:hidden shadow-sm">
        <label className="flex items-center space-x-2.5 text-xs font-bold text-[#1A1A1A] cursor-pointer">
          <input
            type="checkbox"
            checked={filteredStaff.length > 0 && selectedStaffIds.length === filteredStaff.filter(s => !confirmations.find(c => c.staff_id === s.id)).length}
            onChange={(e) => {
              const unconfirmedFiltered = filteredStaff.filter(s => !confirmations.find(c => c.staff_id === s.id));
              if (e.target.checked) {
                setSelectedStaffIds(unconfirmedFiltered.map(s => s.id));
              } else {
                setSelectedStaffIds([]);
              }
            }}
            className="w-4 h-4 rounded border-gray-300 text-[#1A1A1A] focus:ring-[#1A1A1A]"
          />
          <span>Select All Unconfirmed ({filteredStaff.filter(s => !confirmations.find(c => c.staff_id === s.id)).length})</span>
        </label>
      </div>

      {/* Cards list */}
      <div className="space-y-3">
        {filteredStaff.map((s) => {
          const bd = salaryData[s.id];
          if (!bd) return null;
          const isConfirmed = confirmations.find((c) => c.staff_id === s.id);

          return (
            <div
              key={s.id}
              className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col space-y-4 shadow-sm"
            >
              {/* Profile Card Header */}
              <div className="flex items-center space-x-3">
                {!isConfirmed && (
                  <input
                    type="checkbox"
                    checked={selectedStaffIds.includes(s.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStaffIds(prev => [...prev, s.id]);
                      } else {
                        setSelectedStaffIds(prev => prev.filter(id => id !== s.id));
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-[#1A1A1A] focus:ring-[#1A1A1A] mr-1.5"
                  />
                )}
                <div className="w-10 h-10 rounded-full bg-[#1A1A1A] text-white font-bold text-base flex items-center justify-center flex-shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1A1A1A] leading-none">
                    {s.name}
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                    {s.department} • <span className="capitalize">{s.branch?.name || s.branch_id}</span>
                    {s.pay_type === 'hourly' && <span className="ml-1.5 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">Hourly</span>}
                  </p>
                </div>
              </div>

              {/* Salary items grid breakdown */}
              {bd.is_hourly ? (
                <div className="grid grid-cols-2 gap-2 text-xs bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3">
                  <div className="flex flex-col">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Total Hours Logged</span>
                    <span className="text-[#1A1A1A] font-bold mt-0.5">
                      {bd.total_hours} hrs
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Hourly Rate</span>
                    <span className="text-[#1A1A1A] font-bold mt-0.5">
                      {formatCurrency(bd.hourly_rate)}/hr
                    </span>
                  </div>
                  <div className="flex flex-row justify-between items-center col-span-2 border-t border-[#E8E8E8] pt-2 mt-1">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Net Salary</span>
                    <span className="text-[#1A1A1A] font-bold text-sm">
                      {formatCurrency(bd.net_salary)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3">
                  <div className="flex flex-col">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Base</span>
                    <span className="text-[#1A1A1A] font-bold mt-0.5">
                      {formatCurrency(s.monthly_salary)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">OT Pay</span>
                    <span className={`font-bold mt-0.5 ${bd.ot_pay > 0 ? 'text-[var(--success)]' : 'text-[#555555]'}`}>
                      +{formatCurrency(bd.ot_pay)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    {bd.extra_days_pay > 0 ? (
                      <>
                        <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Extra Days Worked</span>
                        <span className="text-[var(--success)] font-bold mt-0.5">
                          +{formatCurrency(bd.extra_days_pay)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Leaves Deducted</span>
                        <span className={`font-bold mt-0.5 ${bd.leave_deduction > 0 ? 'text-[var(--danger)]' : 'text-[#555555]'}`}>
                          -{formatCurrency(bd.leave_deduction)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Early-In Pay</span>
                    <span className={`font-bold mt-0.5 ${bd.early_in_pay > 0 ? 'text-[var(--success)]' : 'text-[#555555]'}`}>
                      +{formatCurrency(bd.early_in_pay || 0)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Late Deduct</span>
                    <span className={`font-bold mt-0.5 ${bd.late_salary_deduction > 0 ? 'text-[var(--danger)]' : 'text-[#555555]'}`}>
                      -{formatCurrency(bd.late_salary_deduction || 0)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Late Fines</span>
                    <span className={`font-bold mt-0.5 ${bd.confirmed_fines > 0 ? 'text-[var(--danger)]' : 'text-[#555555]'}`}>
                      -{formatCurrency(bd.confirmed_fines)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Special Fines</span>
                    <span className={`font-bold mt-0.5 ${bd.confirmed_special_fines > 0 ? 'text-[var(--danger)]' : 'text-[#555555]'}`}>
                      -{formatCurrency(bd.confirmed_special_fines)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Early Leave Deduct</span>
                    <span className={`font-bold mt-0.5 ${bd.early_leave_deduction > 0 ? 'text-[var(--danger)]' : 'text-[#555555]'}`}>
                      -{formatCurrency(bd.early_leave_deduction || 0)}
                    </span>
                  </div>
                  <div className="flex flex-row justify-between items-center col-span-2 border-t border-[#E8E8E8] pt-2 mt-1">
                    <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Net Salary</span>
                    <span className="text-[#1A1A1A] font-bold text-sm">
                      {formatCurrency(bd.net_salary)}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions row */}
              <div className="flex items-center justify-between pt-3 border-t border-[#E8E8E8] print:hidden">
                {!isConfirmed ? (
                  <>
                    <div className="flex items-center space-x-2 bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-1.5">
                      <span className="text-[10px] font-bold text-[#555555] mr-1">Extra Leave:</span>
                      <button
                        onClick={() => handleUpdateLeave(s.id, -1)}
                        className="w-6 h-6 rounded bg-[#EBEBEB] hover:bg-[#D0D0D0] active:scale-95 text-[#1A1A1A] font-bold text-xs flex items-center justify-center cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-5 text-center text-xs font-bold text-[#1A1A1A]">
                        {extraLeaves[s.id] || 0}
                      </span>
                      <button
                        onClick={() => handleUpdateLeave(s.id, 1)}
                        className="w-6 h-6 rounded bg-[#EBEBEB] hover:bg-[#D0D0D0] active:scale-95 text-[#1A1A1A] font-bold text-xs flex items-center justify-center cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-[10px] font-bold text-[var(--warning)] bg-[var(--warning-bg)] border border-[var(--warning)]/20 px-2.5 py-0.5 rounded-[20px] uppercase">
                      Pending
                    </span>
                  </>
                ) : (
                  <div className="w-full flex justify-between items-center bg-[var(--success-bg)] border border-[var(--success)]/20 px-3 py-2 rounded-xl text-xs">
                    <span className="text-[#555555] font-semibold">
                      Confirmed by {isConfirmed.confirmed_by.split('@')[0]}
                    </span>
                    <span className="text-[var(--success)] font-bold flex items-center">
                      <Check size={14} strokeWidth={1.5} className="mr-1" />
                      <span>Confirmed</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Special Fines Section */}
              <SpecialFinesSection
                staffId={s.id}
                month={month}
                onFinesChanged={fetchData}
              />
            </div>
          );
        })}

        {filteredStaff.length === 0 && (
          <div className="text-center py-8 text-[var(--text-muted)] text-xs font-semibold italic">
            No active staff found for this branch.
          </div>
        )}
      </div>

      {/* Action triggers */}
      {unconfirmedCount > 0 ? (
        <button
          onClick={handleConfirmAll}
          disabled={confirming}
          className="w-full min-h-[46px] bg-[#1A1A1A] text-white font-bold text-sm rounded-xl transition-all print:hidden hover:bg-[#333333] active:scale-95 cursor-pointer"
        >
          {confirming ? 'Saving Confirmations...' : `CONFIRM ALL SALARIES (${unconfirmedCount})`}
        </button>
      ) : (
        <div className="w-full bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-bold text-center py-3.5 rounded-xl print:hidden text-xs flex items-center justify-center space-x-1.5">
          <Check size={14} strokeWidth={1.5} />
          <span>All branch salaries confirmed for this month.</span>
        </div>
      )}
      {/* Bulk Action Bottom Bar */}
      {selectedStaffIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] bg-[#1A1A1A] text-white border border-white/10 rounded-full px-6 py-3.5 shadow-2xl flex items-center justify-between space-x-6 animate-in slide-in-from-bottom duration-300">
          <span className="text-xs font-extrabold tracking-wide whitespace-nowrap">
            {selectedStaffIds.length} staff selected
          </span>
          <button
            onClick={() => handleConfirmSelected()}
            disabled={confirming}
            className="bg-white text-black hover:bg-white/90 font-extrabold text-[10px] px-3.5 py-2 rounded-full active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            Confirm Selected
          </button>
        </div>
      )}

      {/* Bulk Confirm Modal */}
      {bulkConfirm && (
        <div className="fixed inset-0 z-[20000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-[#1A1A1A] mb-2">Confirm Action</h3>
            <p className="text-xs text-[var(--text-muted)] font-semibold leading-relaxed mb-6">
              {bulkConfirm.message}
            </p>
            <div className="flex w-full gap-3">
              <button
                onClick={() => setBulkConfirm(null)}
                className="flex-1 min-h-[40px] bg-[#F2F2F2] hover:bg-[#E8E8E8] active:scale-95 text-[#1A1A1A] text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  bulkConfirm.onConfirm();
                  setBulkConfirm(null);
                }}
                className="flex-1 min-h-[40px] bg-[#1A1A1A] hover:bg-[#333333] active:scale-95 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Progress Modal */}
      {bulkProgress && (
        <div className="fixed inset-0 z-[20000] bg-black/65 backdrop-blur-md flex items-center justify-center p-4 select-none">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <RefreshCw size={36} className="animate-spin text-[#1A1A1A] mb-4" />
            <h3 className="text-sm font-black text-[#1A1A1A] mb-1">Please Wait</h3>
            <p className="text-xs text-[var(--text-muted)] font-bold">
              Processing {bulkProgress.current} of {bulkProgress.total}...
            </p>
          </div>
        </div>
      )}

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

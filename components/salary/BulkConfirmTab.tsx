'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { calculateSalary } from '@/lib/salary';
import { Staff, SalaryConfirmation } from './types';
import { formatCurrency, getCurrentMonthStr, formatMonthDisplay } from './utils';
import { Check, Search, AlertCircle } from 'lucide-react';
import { createAuditLog } from '@/lib/audit';
import SpecialFinesSection from './SpecialFinesSection';

export default function BulkConfirmTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [confirmations, setConfirmations] = useState<SalaryConfirmation[]>([]);
  const [lateFines, setLateFines] = useState<any[]>([]);
  const [specialFines, setSpecialFines] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  
  const [salaryData, setSalaryData] = useState<Record<string, any>>({});
  const [extraLeaves, setExtraLeaves] = useState<Record<string, number>>({});
  const [filterBranch, setFilterBranch] = useState<'all' | 'daily' | 'hypermarket'>('all');
  const [confirmingFines, setConfirmingFines] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const month = getCurrentMonthStr();

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
      const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];
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
          early_leave_minutes
        `)
        .gte('date', startDate)
        .lte('date', endDate);

      if (attError) throw attError;
      setAttendanceRecords(attData || []);

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
  }, []);

  useEffect(() => {
    // Recalculate salaries when staff list, attendance records, extra leaves, late fines, or special fines change
    const newSalaryData: Record<string, any> = {};
    
    staffList.forEach((s) => {
      if (!s.shift) return;
      
      const year = parseInt(month.split('-')[0]);
      const monthNum = parseInt(month.split('-')[1]);
      
      // Filter attendance records for current staff
      const staffAtt = attendanceRecords.filter((r) => r.staff_id === s.id);
      
      const extraLeaveDays = extraLeaves[s.id] || 0;
      
      // Real days worked
      const daysActuallyWorked = Math.max(
        0,
        (staffAtt.filter((r) => r.check_in_time !== null).length || 0) - extraLeaveDays
      );

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
          offDaysPerMonth: s.off_days_per_month as 0 | 2 | 4,
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
        ot_minutes: approvedOTMinutes,
      };
    });
    
    setSalaryData(newSalaryData);
  }, [staffList, attendanceRecords, extraLeaves, lateFines, specialFines]);

  const handleUpdateLeave = (staffId: string, delta: number) => {
    setExtraLeaves((prev) => {
      const current = prev[staffId] || 0;
      return { ...prev, [staffId]: Math.max(0, current + delta) };
    });
  };

  const handleConfirmAll = async () => {
    if (!user) return;
    setConfirming(true);
    try {
      const unconfirmed = filteredStaff.filter((s) => !confirmations.find((c) => c.staff_id === s.id));
      
      const payload = unconfirmed.map((s) => {
        const bd = salaryData[s.id];
        return {
          staff_id: s.id,
          month: month,
          net_salary: bd.net_salary,
          base_salary: s.monthly_salary,
          paid_days: bd.paid_days || 30,
          leave_deduction: bd.leave_deduction,
          ot_pay: bd.ot_pay,
          early_in_pay: bd.early_in_pay || 0,
          early_leave_deduction: bd.early_leave_deduction || 0,
          extra_leave_days: extraLeaves[s.id] || 0,
          ot_minutes: bd.ot_minutes || 0,
          confirmed_fines: bd.confirmed_fines || 0,
          confirmed_special_fines: bd.confirmed_special_fines || 0,
          confirmed_by: user.email || 'Admin',
          is_locked: true
        };
      });

      if (payload.length > 0) {
        const { error } = await supabase.from('salary_confirmations').insert(payload);
        if (error) throw error;
        
        await createAuditLog({
          action: 'bulk_confirm_salaries',
          table_name: 'salary_confirmations',
          new_value: payload,
          performed_by: user.email,
          performed_by_role: user.role || 'admin',
          reason: `Bulk confirmed salary for ${payload.length} staff members`
        });

        // Silent wall event logging
        try {
          const events = unconfirmed.map(s => {
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
        alert('All salaries confirmed successfully!');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to confirm salaries.');
    } finally {
      setConfirming(false);
    }
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
                <div className="w-10 h-10 rounded-full bg-[#1A1A1A] text-white font-bold text-base flex items-center justify-center flex-shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1A1A1A] leading-none">
                    {s.name}
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                    {s.department} • <span className="capitalize">{s.branch?.name || s.branch_id}</span>
                  </p>
                </div>
              </div>

              {/* Salary items grid breakdown */}
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
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Early Leave Deduct</span>
                  <span className={`font-bold mt-0.5 ${bd.early_leave_deduction > 0 ? 'text-[var(--danger)]' : 'text-[#555555]'}`}>
                    -{formatCurrency(bd.early_leave_deduction || 0)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Late Fines</span>
                  <span className={`font-bold mt-0.5 ${bd.confirmed_fines > 0 ? 'text-[var(--danger)]' : 'text-[#555555]'}`}>
                    -{formatCurrency(bd.confirmed_fines)}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Special Fines</span>
                  <span className={`font-bold mt-0.5 ${bd.confirmed_special_fines > 0 ? 'text-[var(--danger)]' : 'text-[#555555]'}`}>
                    -{formatCurrency(bd.confirmed_special_fines)}
                  </span>
                </div>
                <div className="flex flex-row justify-between items-center col-span-2 border-t border-[#E8E8E8] pt-2 mt-1">
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Net Salary</span>
                  <span className="text-[#1A1A1A] font-bold text-sm">
                    {formatCurrency(bd.net_salary)}
                  </span>
                </div>
              </div>

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
    </div>
  );
}

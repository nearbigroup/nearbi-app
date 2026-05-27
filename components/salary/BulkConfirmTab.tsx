'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { calculateSalary } from '@/lib/salary';
import { Staff, SalaryConfirmation } from './types';
import { formatCurrency, getCurrentMonthStr, formatMonthDisplay } from './utils';
import { Check } from 'lucide-react';
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
  
  const [salaryData, setSalaryData] = useState<Record<string, any>>({});
  const [extraLeaves, setExtraLeaves] = useState<Record<string, number>>({});
  const [filterBranch, setFilterBranch] = useState<'all' | 'daily' | 'hypermarket'>('all');
  
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

      // 2. Fetch OT minutes from attendance for this month
      const startDate = `${month}-01`;
      const endDate = `${month}-31`;
      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .select('staff_id, ot_minutes, ot_approved')
        .gte('date', startDate)
        .lte('date', endDate);

      if (attError) throw attError;

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
    // Recalculate salaries when staff list, extra leaves, late fines, or special fines change
    const newSalaryData: Record<string, any> = {};
    
    staffList.forEach((s) => {
      if (!s.shift) return;
      
      const year = parseInt(month.split('-')[0]);
      const monthNum = parseInt(month.split('-')[1]);
      
      const config = {
        monthlySalary: s.monthly_salary,
        offDaysPerMonth: s.off_days_per_month,
        shiftHours: s.shift.hours,
        year,
        month: monthNum,
      };
      
      const calendarDays = new Date(year, monthNum, 0).getDate();
      const requiredWorkingDays = calendarDays - s.off_days_per_month;
      const extraLeaveDays = extraLeaves[s.id] || 0;
      const daysActuallyWorked = Math.max(0, requiredWorkingDays - extraLeaveDays);

      // Calculate confirmed late fines (not waived)
      const staffLateFines = lateFines.filter(
        (lf) => lf.staff_id === s.id && lf.confirmed && !lf.waived
      );
      const totalLateFinesAmt = staffLateFines.reduce((sum, lf) => sum + Number(lf.fine_amount), 0);

      // Calculate confirmed special fines (not waived)
      const staffSpecialFines = specialFines.filter(
        (sf) => sf.staff_id === s.id && sf.confirmed && !sf.waived
      );
      const totalSpecialFinesAmt = staffSpecialFines.reduce(
        (sum, sf) => sum + Number(sf.edited_amount ?? sf.amount), 0
      );

      const attendance = {
        daysActuallyWorked,
        confirmedFines: totalLateFinesAmt,
        approvedOTMinutes: s.total_ot_minutes || 0,
        approvedEarlyInMinutes: 0,
        earlyLeaveDeductionAmount: 0,
      };
      
      const breakdown = calculateSalary(config, attendance);
      const netSalary = Math.max(0, breakdown.netSalary - totalSpecialFinesAmt);

      newSalaryData[s.id] = {
        net_salary: netSalary,
        ot_pay: breakdown.otPay,
        leave_deduction: breakdown.dailyRate * extraLeaveDays,
        confirmed_fines: totalLateFinesAmt,
        confirmed_special_fines: totalSpecialFinesAmt,
        paid_days: breakdown.paidDays,
      };
    });
    
    setSalaryData(newSalaryData);
  }, [staffList, extraLeaves, lateFines, specialFines]);

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
          extra_leave_days: extraLeaves[s.id] || 0,
          ot_minutes: s.total_ot_minutes || 0,
          confirmed_fines: bd.confirmed_fines || 0,
          confirmed_special_fines: bd.confirmed_special_fines || 0,
          confirmed_by: user.email || 'Admin',
        };
      });

      if (payload.length > 0) {
        const { error } = await supabase.from('salary_confirmations').insert(payload);
        if (error) throw error;
        
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

  const filteredStaff = staffList.filter(
    (s) => filterBranch === 'all' || s.branch_id === filterBranch
  );

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
        <h2 className="text-white text-base font-bold">
          Salary Confirmation — {formatMonthDisplay(month)}
        </h2>
        <p className="text-[var(--text-muted)] text-xs font-semibold">
          Verify and lock monthly payroll rates.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
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
              className={`flex-1 text-center py-2.5 rounded-[10px] border text-xs font-bold uppercase tracking-wider transition-all ${
                isActive
                  ? 'bg-white text-[#1E2028] border-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-white/20 active:scale-95'
              }`}
            >
              {b === 'all' ? 'All Branches' : b === 'daily' ? 'Daily' : 'Hypermarket'}
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
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 flex flex-col space-y-4 shadow-sm"
            >
              {/* Profile Card Header */}
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-white/10 text-white border border-white/20 font-bold text-base flex items-center justify-center flex-shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white leading-none">
                    {s.name}
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                    {s.department} • <span className="capitalize">{s.branch?.name || s.branch_id}</span>
                  </p>
                </div>
              </div>

              {/* Salary items grid breakdown */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3">
                <div className="flex flex-col">
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Base</span>
                  <span className="text-white font-bold mt-0.5">
                    {formatCurrency(s.monthly_salary)}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">OT Pay</span>
                  <span className={`font-bold mt-0.5 ${bd.ot_pay > 0 ? 'text-[#4ADE80]' : 'text-[var(--text-secondary)]'}`}>
                    +{formatCurrency(bd.ot_pay)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Leaves Deducted</span>
                  <span className={`font-bold mt-0.5 ${bd.leave_deduction > 0 ? 'text-[#F87171]' : 'text-[var(--text-secondary)]'}`}>
                    -{formatCurrency(bd.leave_deduction)}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Late Fines</span>
                  <span className={`font-bold mt-0.5 ${bd.confirmed_fines > 0 ? 'text-[#F87171]' : 'text-[var(--text-secondary)]'}`}>
                    -{formatCurrency(bd.confirmed_fines)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Special Fines</span>
                  <span className={`font-bold mt-0.5 ${bd.confirmed_special_fines > 0 ? 'text-[#F87171]' : 'text-[var(--text-secondary)]'}`}>
                    -{formatCurrency(bd.confirmed_special_fines)}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[var(--text-muted)] text-[10px] font-bold uppercase">Net Salary</span>
                  <span className="text-white font-bold text-sm mt-0.5">
                    {formatCurrency(bd.net_salary)}
                  </span>
                </div>
              </div>

              {/* Actions row */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] print:hidden">
                {!isConfirmed ? (
                  <>
                    <div className="flex items-center space-x-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-lg p-1.5">
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] mr-1">Extra Leave:</span>
                      <button
                        onClick={() => handleUpdateLeave(s.id, -1)}
                        className="w-6 h-6 rounded bg-[var(--bg-elevated)] hover:bg-[var(--border-strong)] active:scale-95 text-white font-bold text-xs flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="w-5 text-center text-xs font-bold text-white">
                        {extraLeaves[s.id] || 0}
                      </span>
                      <button
                        onClick={() => handleUpdateLeave(s.id, 1)}
                        className="w-6 h-6 rounded bg-[var(--bg-elevated)] hover:bg-[var(--border-strong)] active:scale-95 text-white font-bold text-xs flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-[10px] font-bold text-[#FBBF24] bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.2)] px-2 py-0.5 rounded uppercase">
                      Pending
                    </span>
                  </>
                ) : (
                  <div className="w-full flex justify-between items-center bg-[rgba(74,222,128,0.12)] border border-[rgba(74,222,128,0.2)] px-3 py-2 rounded-lg text-xs">
                    <span className="text-[var(--text-secondary)] font-semibold">
                      Confirmed by {isConfirmed.confirmed_by.split('@')[0]}
                    </span>
                    <span className="text-[#4ADE80] font-bold flex items-center">
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
          <div className="text-center py-8 text-[var(--text-muted)] text-xs font-bold italic">
            No active staff found for this branch.
          </div>
        )}
      </div>

      {/* Action triggers */}
      {unconfirmedCount > 0 ? (
        <button
          onClick={handleConfirmAll}
          disabled={confirming}
          className="w-full min-h-[46px] bg-white text-[#1E2028] font-bold text-sm rounded-xl transition-all print:hidden active:scale-95"
        >
          {confirming ? 'Saving Confirmations...' : `CONFIRM ALL SALARIES (${unconfirmedCount})`}
        </button>
      ) : (
        <div className="w-full bg-[rgba(74,222,128,0.12)] border border-[rgba(74,222,128,0.2)] text-[#4ADE80] font-bold text-center py-3.5 rounded-xl print:hidden text-xs flex items-center justify-center space-x-1.5">
          <Check size={14} strokeWidth={1.5} />
          <span>All branch salaries confirmed for this month.</span>
        </div>
      )}
    </div>
  );
}

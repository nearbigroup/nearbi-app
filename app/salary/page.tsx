'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import BulkConfirmTab from '@/components/salary/BulkConfirmTab';
import PayslipTab from '@/components/salary/PayslipTab';
import PaymentTrackerTab from '@/components/salary/PaymentTrackerTab';
import MonthlyReportTab from '@/components/salary/MonthlyReportTab';
import { Lock, Calculator, User, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { calculateSalary } from '@/lib/salary';
import { formatCurrency, getPastMonths, formatMonthDisplay } from '@/components/salary/utils';

type Tab = 'bulk_confirm' | 'payslip' | 'payments' | 'report' | 'calculator';

export default function SalaryPage() {
  const { canSeeSalaryBreakdown, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('bulk_confirm');

  // Calculator states
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(getPastMonths(3)[0]);
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  useEffect(() => {
    async function loadStaff() {
      const { data } = await supabase
        .from('staff')
        .select('*, branch:branches(name), shift:shifts(*)')
        .eq('active', true)
        .order('name');
      if (data) setStaffList(data);
    }
    loadStaff();
  }, []);

  useEffect(() => {
    if (!selectedStaffId) {
      setCalcResult(null);
      return;
    }
    
    async function performCalculation() {
      setCalcLoading(true);
      try {
        const staff = staffList.find((s) => s.id === selectedStaffId);
        if (!staff) return;

        const [yearStr, monthStr] = selectedMonth.split('-');
        const year = parseInt(yearStr);
        const monthNum = parseInt(monthStr);
        
        const firstDay = `${selectedMonth}-01`;
        const lastDay = new Date(year, monthNum, 0).toISOString().split('T')[0];

        // Fetch real attendance
        const { data: attRecords } = await supabase
          .from('attendance')
          .select(`
            date,
            check_in_time,
            status,
            ot_minutes,
            ot_approved,
            early_in_minutes,
            early_in_approved,
            early_leave_minutes
          `)
          .eq('staff_id', selectedStaffId)
          .gte('date', firstDay)
          .lte('date', lastDay);

        const daysActuallyWorked = attRecords?.filter(
          (r) => r.check_in_time !== null
        ).length || 0;

        const approvedOTMinutes = attRecords?.filter(
          (r) => r.ot_approved === true
        ).reduce((sum, r) => sum + (r.ot_minutes || 0), 0) || 0;

        const approvedEarlyInMinutes = attRecords?.filter(
          (r) => r.early_in_approved === true
        ).reduce((sum, r) => sum + (r.early_in_minutes || 0), 0) || 0;

        const earlyLeaveMinutes = attRecords?.reduce(
          (sum, r) => sum + (r.early_leave_minutes || 0), 0
        ) || 0;

        // Fetch confirmed late fines
        const { data: lateFines } = await supabase
          .from('late_fines')
          .select('fine_amount, confirmed, waived')
          .eq('staff_id', selectedStaffId)
          .eq('month', selectedMonth);

        const confirmedLateFines = lateFines?.filter(
          (f) => f.confirmed && !f.waived
        ).reduce((sum, f) => sum + Number(f.fine_amount), 0) || 0;

        // Fetch confirmed special fines
        const { data: specialFines } = await supabase
          .from('special_fines')
          .select('amount, edited_amount, confirmed, waived')
          .eq('staff_id', selectedStaffId)
          .eq('month', selectedMonth);

        const confirmedSpecialFines = specialFines?.filter(
          (f) => f.confirmed && !f.waived
        ).reduce((sum, f) => sum + Number(f.edited_amount ?? f.amount), 0) || 0;

        const shiftHours = staff.shift?.hours || staff.shifts?.hours || 9;

        const result = calculateSalary(
          {
            monthlySalary: staff.monthly_salary,
            offDaysPerMonth: staff.off_days_per_month as 0 | 2 | 4,
            shiftHours,
            year,
            month: monthNum,
          },
          {
            daysActuallyWorked,
            confirmedLateFines,
            confirmedSpecialFines,
            approvedOTMinutes,
            approvedEarlyInMinutes,
            earlyLeaveMinutes,
          }
        );

        setCalcResult({
          ...result,
          shiftHours,
          staffName: staff.name,
          staffDept: staff.department,
          staffBranch: staff.branch?.name || staff.branch_id,
          monthlySalary: staff.monthly_salary,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setCalcLoading(false);
      }
    }
    
    performCalculation();
  }, [selectedStaffId, selectedMonth, staffList]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-[200px] w-full" />
      </div>
    );
  }

  // Security gate: non-Admin/Ops sees lock screen
  if (!canSeeSalaryBreakdown) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-8 max-w-sm w-full flex flex-col items-center shadow-sm">
          <Lock size={48} strokeWidth={1.5} className="mb-4 text-[var(--text-muted)]" />
          <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">Salary Data Locked</h2>
          <p className="text-[var(--text-muted)] text-xs font-semibold leading-relaxed mb-6">
            Only the Owner and Operations Manager can view or modify salary details.
          </p>
          <div className="font-[900] text-lg tracking-tight flex items-center leading-none opacity-40">
            <span className="text-[#1A1A1A]">near</span>
            <span className="text-[#1A1A1A]/60">bi</span>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'bulk_confirm', label: 'Bulk Confirm' },
    { id: 'payslip', label: 'Payslip' },
    { id: 'payments', label: 'Payments' },
    { id: 'report', label: 'Monthly Report' },
    { id: 'calculator', label: 'Calculator' },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* Tab Navigation - Hidden during printing */}
      <div className="print:hidden overflow-x-auto scrollbar-none -mx-4 px-4 pb-1 select-none">
        <div className="flex space-x-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                  isActive
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-white text-[#555555] border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Content */}
      <div className="animate-in fade-in duration-200">
        {activeTab === 'bulk_confirm' && <BulkConfirmTab />}
        {activeTab === 'payslip' && <PayslipTab />}
        {activeTab === 'payments' && <PaymentTrackerTab />}
        {activeTab === 'report' && <MonthlyReportTab />}
        {activeTab === 'calculator' && (
          <SalaryCalculatorTab
            staffList={staffList}
            selectedStaffId={selectedStaffId}
            setSelectedStaffId={setSelectedStaffId}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            calcResult={calcResult}
            calcLoading={calcLoading}
          />
        )}
      </div>
    </div>
  );
}

function SalaryCalculatorTab({
  staffList,
  selectedStaffId,
  setSelectedStaffId,
  selectedMonth,
  setSelectedMonth,
  calcResult,
  calcLoading,
}: any) {
  const months = getPastMonths(3);

  return (
    <div className="space-y-5 select-none">
      {/* Selector box */}
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5 flex items-center">
            <User size={14} className="mr-1 text-[var(--text-secondary)]" />
            Select Staff Member
          </label>
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
          >
            <option value="" className="bg-white text-[#1A1A1A]">Choose staff...</option>
            {staffList.map((s: any) => (
              <option key={s.id} value={s.id} className="bg-white text-[#1A1A1A]">
                {s.name} ({s.branch?.name || s.branch_id})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5 flex items-center">
            <Calendar size={14} className="mr-1 text-[var(--text-secondary)]" />
            Select Calculation Month
          </label>
          <div className="flex gap-2">
            {months.map((m) => {
              const isActive = selectedMonth === m;
              return (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`flex-1 py-2.5 rounded-[12px] border text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                      : 'bg-white text-[#555555] border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95'
                  }`}
                >
                  {formatMonthDisplay(m)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {calcLoading && (
        <div className="space-y-3">
          <div className="skeleton h-[200px] w-full" />
        </div>
      )}

      {!calcLoading && !calcResult && (
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-8 text-center flex flex-col items-center shadow-sm">
          <Calculator size={36} strokeWidth={1.5} className="mb-2 text-[var(--text-muted)] animate-pulse" />
          <h3 className="text-sm font-bold text-[#1A1A1A]">No Staff Selected</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Choose a staff member above to view the dynamic salary calculation breakdown.
          </p>
        </div>
      )}

      {!calcLoading && calcResult && (
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 shadow-md space-y-6">
          {/* Header */}
          <div className="border-b border-[#E8E8E8] pb-4 flex justify-between items-center">
            <div>
              <h3 className="font-extrabold text-base text-[#1A1A1A]">{calcResult.staffName}</h3>
              <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider mt-0.5">
                {calcResult.staffDept} • {calcResult.staffBranch}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Base Salary</span>
              <span className="text-[#1A1A1A] font-extrabold text-sm">{formatCurrency(calcResult.monthlySalary)}</span>
            </div>
          </div>

          {/* ATTENDANCE SUMMARY */}
          <div>
            <h4 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Attendance Summary</span>
              <span className="text-[var(--text-muted)] normal-case font-semibold">Required: {calcResult.requiredWorkingDays} days</span>
            </h4>
            <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-4 space-y-2 text-xs font-semibold text-[#555555]">
              <div className="flex justify-between">
                <span>Calendar days this month:</span>
                <span className="text-[#1A1A1A] font-bold">{calcResult.calendarDays} days</span>
              </div>
              <div className="flex justify-between">
                <span>Daily rate:</span>
                <span className="text-[#1A1A1A] font-bold">{formatCurrency(calcResult.dailyRate)}</span>
              </div>
              <div className="flex justify-between">
                <span>Days actually worked:</span>
                <span className="text-[#1A1A1A] font-bold">{calcResult.daysActuallyWorked} days</span>
              </div>
              {calcResult.extraDaysWorked > 0 && (
                <div className="flex justify-between">
                  <span>Extra days worked:</span>
                  <span className="text-[var(--success)] font-bold">+{calcResult.extraDaysWorked} days</span>
                </div>
              )}
              {calcResult.missingDays > 0 && (
                <div className="flex justify-between">
                  <span>Missing days:</span>
                  <span className="text-[var(--danger)] font-bold">-{calcResult.missingDays} days</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-[#E8E8E8] mt-2">
                <span>Maximum paid days (cap):</span>
                <span className="text-[#555555]/80 font-bold">{calcResult.maxPaidDays} days</span>
              </div>
              <div className="flex justify-between font-bold text-[#1A1A1A]">
                <span>Paid days:</span>
                <span>{calcResult.paidDays} days</span>
              </div>
            </div>
          </div>

          {/* EARNINGS */}
          <div>
            <h4 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2">Earnings</h4>
            <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-4 space-y-2 text-xs font-semibold text-[#555555]">
              <div className="flex justify-between">
                <span>Gross pay ({calcResult.paidDays} × {formatCurrency(calcResult.dailyRate)}):</span>
                <span className="text-[#1A1A1A] font-bold">{formatCurrency(calcResult.grossPay)}</span>
              </div>
              <div className="flex justify-between">
                <span>OT pay ({(calcResult.approvedOTMinutes / 60).toFixed(1)}h approved):</span>
                <span className="text-[var(--success)] font-bold">+{formatCurrency(calcResult.otPay)}</span>
              </div>
              {calcResult.earlyInPay > 0 && (
                <div className="flex justify-between">
                  <span>Early check-in pay:</span>
                  <span className="text-[var(--success)] font-bold">+{formatCurrency(calcResult.earlyInPay)}</span>
                </div>
              )}
            </div>
          </div>

          {/* DEDUCTIONS */}
          <div>
            <h4 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2">Deductions</h4>
            <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-4 space-y-2 text-xs font-semibold text-[#555555]">
              <div className="flex justify-between">
                <span>Early leave:</span>
                <span className={`${calcResult.earlyLeaveDeduction > 0 ? 'text-[var(--danger)]' : ''} font-bold`}>
                  -{formatCurrency(calcResult.earlyLeaveDeduction)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Late fines confirmed:</span>
                <span className={`${calcResult.confirmedLateFines > 0 ? 'text-[var(--danger)]' : ''} font-bold`}>
                  -{formatCurrency(calcResult.confirmedLateFines)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Special fines confirmed:</span>
                <span className={`${calcResult.confirmedSpecialFines > 0 ? 'text-[var(--danger)]' : ''} font-bold`}>
                  -{formatCurrency(calcResult.confirmedSpecialFines)}
                </span>
              </div>
            </div>
          </div>

          {/* NET SALARY & HOURLY RATE */}
          <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block leading-none">Net Salary</span>
              <span className="text-2xl font-extrabold text-[#1A1A1A] block mt-1 leading-none">{formatCurrency(calcResult.netSalary)}</span>
            </div>
            <div className="text-right sm:text-right w-full sm:w-auto border-t sm:border-t-0 sm:border-l border-[#E8E8E8] pt-3 sm:pt-0 sm:pl-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block leading-none">Hourly rate</span>
              <span className="text-sm font-extrabold text-[#1A1A1A] block mt-1 leading-none">{formatCurrency(calcResult.hourlyRate)}/hr</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

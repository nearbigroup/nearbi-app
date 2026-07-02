'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import BulkConfirmTab from '@/components/salary/BulkConfirmTab';
import PayslipTab from '@/components/salary/PayslipTab';
import PaymentTrackerTab from '@/components/salary/PaymentTrackerTab';
import MonthlyReportTab from '@/components/salary/MonthlyReportTab';
import { Lock, Calculator, User, Calendar, RefreshCw, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { calculateSalary, getDaysInMonth, calculateEarlyLeaveDeduction, calculatePaidDays, calculateBonusDays, calculateHourlySalary, calculateEarlyInPay, calculateMinutesWorked, autoCloseCheckouts } from '@/lib/salary';
import { formatCurrency, getPastMonths, formatMonthDisplay, getCurrentMonthStr } from '@/components/salary/utils';

type Tab = 'bulk_confirm' | 'payslip' | 'payments' | 'report' | 'calculator';

function CountUp({
  value,
  duration = 600,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const endValue = value;
    const startValue = 0;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const currentVal = easeProgress * (endValue - startValue) + startValue;
      setCurrent(currentVal);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setCurrent(endValue);
      }
    };

    const animFrame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animFrame);
  }, [value, duration]);

  const displayVal = current.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span>
      {prefix}
      {displayVal}
      {suffix}
    </span>
  );
}

export default function SalaryPage() {
  const { canSeeSalaryBreakdown, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('bulk_confirm');

  // Calculator states
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr());
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const [liveSalary, setLiveSalary] = useState<any>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedYear, selectedMonthNum] = selectedMonth.split('-').map(Number);
  const isCurrentMonth = selectedMonth === currentMonthKey;
  const isPastMonth = 
    selectedYear < now.getFullYear() ||
    (selectedYear === now.getFullYear() && selectedMonthNum < now.getMonth() + 1);

  const [earliestMonth, setEarliestMonth] = useState('');
  const [hasConfirmations, setHasConfirmations] = useState<boolean>(true);
  const [confirmationsLoading, setConfirmationsLoading] = useState<boolean>(true);

  const { userBranch } = useAuth();

  useEffect(() => {
    if (userBranch) {
      autoCloseCheckouts(userBranch);
    } else {
      autoCloseCheckouts('daily');
      autoCloseCheckouts('hypermarket');
    }
  }, [userBranch]);

  const checkConfirmations = async () => {
    try {
      setConfirmationsLoading(true);
      const { data, error } = await supabase
        .from('salary_confirmations')
        .select('id')
        .eq('month', selectedMonth)
        .limit(1);
      
      if (error) throw error;
      setHasConfirmations(data && data.length > 0);
    } catch (err) {
      console.error('Error checking confirmations:', err);
    } finally {
      setConfirmationsLoading(false);
    }
  };

  useEffect(() => {
    checkConfirmations();
  }, [selectedMonth]);

  useEffect(() => {
    async function fetchEarliest() {
      const d = new Date();
      const sixMonthsAgo = new Date(d.getFullYear(), d.getMonth() - 6, 1);
      let minMonth = sixMonthsAgo.toISOString().slice(0, 7); // YYYY-MM

      try {
        const { data: earliestAtt } = await supabase
          .from('attendance')
          .select('date')
          .order('date', { ascending: true })
          .limit(1);

        if (earliestAtt && earliestAtt.length > 0 && earliestAtt[0].date) {
          const attMonth = earliestAtt[0].date.slice(0, 7);
          if (attMonth < minMonth) {
            minMonth = attMonth;
          }
        }
      } catch (err) {
        console.error("Error fetching earliest attendance date:", err);
      }

      try {
        const { data: earliestConf } = await supabase
          .from('salary_confirmations')
          .select('month')
          .order('month', { ascending: true })
          .limit(1);

        if (earliestConf && earliestConf.length > 0 && earliestConf[0].month) {
          const confMonth = earliestConf[0].month;
          if (confMonth < minMonth) {
            minMonth = confMonth;
          }
        }
      } catch (err) {
        console.error("Error fetching earliest confirmation month:", err);
      }

      setEarliestMonth(minMonth);
    }
    fetchEarliest();
  }, []);

  const fetchLiveSalary = async (staffId: string) => {
    if (!staffId) {
      setLiveSalary(null);
      return;
    }
    setLiveLoading(true);
    try {
      const staff = staffList.find((s) => s.id === staffId);
      if (!staff) return;

      const d = new Date();
      const currentYear = d.getFullYear();
      const currentMonth = d.getMonth() + 1;
      const monthStr = String(currentMonth).padStart(2, '0');
      const currentMonthKey = `${currentYear}-${monthStr}`;

      const calendarDays = getDaysInMonth(currentYear, currentMonth);
      const firstDay = `${currentMonthKey}-01`;
      const lastDay = `${currentMonthKey}-${String(calendarDays).padStart(2, '0')}`;

      const { data: attRecords } = await supabase
        .from('attendance')
        .select('check_in_time, check_out_time, total_hours_logged, ot_minutes, ot_approved, early_in_minutes, early_in_approved, early_leave_minutes, day_type, late_salary_deduction_minutes')
        .eq('staff_id', staffId)
        .gte('date', firstDay)
        .lte('date', lastDay);

      const isHourly = staff.pay_type === 'hourly';
      
      if (isHourly) {
        const standardHours = Number(staff.standard_hours || 234);
        const totalHoursWorked = attRecords?.reduce((sum, r) => {
          if (r.total_hours_logged !== null && r.total_hours_logged !== undefined && Number(r.total_hours_logged) > 0) {
            return sum + Number(r.total_hours_logged);
          }
          if (r.check_in_time && r.check_out_time) {
            return sum + (calculateMinutesWorked(r.check_in_time, r.check_out_time) / 60);
          }
          return sum;
        }, 0) || 0;

        const hourlyResult = calculateHourlySalary(staff.monthly_salary, standardHours, totalHoursWorked);
        setLiveSalary({
          is_hourly: true,
          totalHours: hourlyResult.totalHours,
          hourlyRate: hourlyResult.hourlyRate,
          netSalary: hourlyResult.netSalary,
          standardHours
        });
      } else {
        const daysWorked = attRecords?.filter(r => r.check_in_time !== null && r.check_in_time !== undefined && r.check_in_time !== '').length || 0;
        const approvedOT = attRecords?.filter(r => r.ot_approved).reduce((sum, r) => sum + (r.ot_minutes || 0), 0) || 0;
        const approvedEarlyIn = attRecords?.filter(r => r.early_in_approved).reduce((sum, r) => sum + (r.early_in_minutes || 0), 0) || 0;
        const earlyLeave = attRecords?.reduce((sum, r) => sum + (r.early_leave_minutes || 0), 0) || 0;
        const totalLateDeductionMins = attRecords?.reduce((sum, r) => sum + (r.late_salary_deduction_minutes || 0), 0) || 0;

        const { data: lateFines } = await supabase
          .from('late_fines')
          .select('fine_amount, waived_amount, waived')
          .eq('staff_id', staffId)
          .eq('month', currentMonthKey)
          .eq('confirmed', true);

        const lateFinesSum = lateFines?.reduce((sum, f) => {
          return sum + (f.waived ? 0 : Math.max(0, Number(f.fine_amount) - Number(f.waived_amount || 0)));
        }, 0) || 0;

        const { data: specialFines } = await supabase
          .from('special_fines')
          .select('amount, edited_amount, waived_amount, waived')
          .eq('staff_id', staffId)
          .eq('month', currentMonthKey)
          .eq('confirmed', true);

        const specialFinesSum = specialFines?.reduce((sum, f) => {
          const amt = Number(f.edited_amount ?? f.amount);
          const waivedAmt = Number(f.waived_amount || 0);
          return sum + (f.waived ? 0 : Math.max(0, amt - waivedAmt));
        }, 0) || 0;

        const finesSoFar = lateFinesSum + specialFinesSum;

        const offDaysPerMonth = staff.off_days_per_month as 0 | 2 | 4;
        
        const paidDaysSoFar = calculatePaidDays(daysWorked, offDaysPerMonth, calendarDays);
        const missingDays = Math.max(0, calendarDays - paidDaysSoFar);

        const dailyRate = staff.monthly_salary / calendarDays;
        const shiftHours = staff.shift?.hours || staff.shifts?.hours || 9;
        const hourlyRate = dailyRate / shiftHours;

        const grossSoFar = paidDaysSoFar * dailyRate;
        const otPay = (approvedOT / 60) * hourlyRate;
        const earlyInPay = calculateEarlyInPay(approvedEarlyIn, hourlyRate);
        const earlyLeaveDeduction = (earlyLeave / 60) * hourlyRate;
        const lateSalaryDeduction = (totalLateDeductionMins / 60) * hourlyRate;
        const leaveDeduction = missingDays * dailyRate;

        const netSoFar = grossSoFar + otPay + earlyInPay - earlyLeaveDeduction - lateSalaryDeduction - finesSoFar;

        let nextMilestone = '';
        if (offDaysPerMonth === 4) {
          const daysToNext = 6 - (daysWorked % 6);
          if (daysToNext < 6) {
            nextMilestone = `Work ${daysToNext} more days to earn +1 day bonus (₹${dailyRate.toFixed(0)})`;
          }
        } else if (offDaysPerMonth === 2) {
          const daysToNext = 12 - (daysWorked % 12);
          if (daysToNext < 12) {
            nextMilestone = `Work ${daysToNext} more days to earn +1 day bonus (₹${dailyRate.toFixed(0)})`;
          }
        }

        setLiveSalary({
          daysWorked,
          offBonusEarned: calculateBonusDays(daysWorked, offDaysPerMonth),
          paidDays: paidDaysSoFar,
          calendarDays,
          dailyRate,
          hourlyRate,
          grossPay: Math.round(grossSoFar),
          otEarned: Math.round(otPay),
          earlyInEarned: Math.round(earlyInPay),
          earlyLeaveDeduction: Math.round(earlyLeaveDeduction),
          lateSalaryDeduction: Math.round(lateSalaryDeduction),
          leaveDeduction: Math.round(leaveDeduction),
          finesSoFar: Math.round(finesSoFar),
          netSalary: Math.round(netSoFar),
          nextMilestone
        });
      }
    } catch (err) {
      console.error('Error fetching live salary:', err);
    } finally {
      setLiveLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId && isCurrentMonth) {
      fetchLiveSalary(selectedStaffId);
    }
  }, [selectedStaffId, staffList, selectedMonth, isCurrentMonth]);

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
            check_out_time,
            total_hours_logged,
            status,
            ot_minutes,
            ot_approved,
            early_in_minutes,
            early_in_approved,
            early_leave_minutes,
            day_type
          `)
          .eq('staff_id', selectedStaffId)
          .gte('date', firstDay)
          .lte('date', lastDay);

        const isHourly = staff.pay_type === 'hourly';

        if (isHourly) {
          const standardHours = Number(staff.standard_hours || 234);
          const totalHoursWorked = attRecords?.reduce((sum, r) => {
            if (r.total_hours_logged !== null && r.total_hours_logged !== undefined && Number(r.total_hours_logged) > 0) {
              return sum + Number(r.total_hours_logged);
            }
            if (r.check_in_time && r.check_out_time) {
              return sum + (calculateMinutesWorked(r.check_in_time, r.check_out_time) / 60);
            }
            return sum;
          }, 0) || 0;

          const hourlyResult = calculateHourlySalary(staff.monthly_salary, standardHours, totalHoursWorked);
          setCalcResult({
            is_hourly: true,
            totalHours: hourlyResult.totalHours,
            standardHours,
            hourlyRate: hourlyResult.hourlyRate,
            netSalary: hourlyResult.netSalary,
            staffName: staff.name,
            staffDept: staff.department,
            staffBranch: staff.branch?.name || staff.branch_id,
            monthlySalary: staff.monthly_salary,
            calendarDays: getDaysInMonth(year, monthNum)
          });
        } else {
          const daysActuallyWorked = attRecords?.filter(
            (r) => r.check_in_time !== null && r.check_in_time !== undefined && r.check_in_time !== ''
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
            .select('fine_amount, waived_amount, confirmed, waived')
            .eq('staff_id', selectedStaffId)
            .eq('month', selectedMonth);

          const confirmedLateFines = lateFines?.filter(
            (f) => f.confirmed
          ).reduce((sum, f) => {
            const amt = Number(f.fine_amount);
            const waivedAmt = Number(f.waived_amount || 0);
            return sum + (f.waived ? 0 : Math.max(0, amt - waivedAmt));
          }, 0) || 0;

          // Fetch confirmed special fines
          const { data: specialFines } = await supabase
            .from('special_fines')
            .select('amount, edited_amount, waived_amount, confirmed, waived')
            .eq('staff_id', selectedStaffId)
            .eq('month', selectedMonth);

          const confirmedSpecialFines = specialFines?.filter(
            (f) => f.confirmed
          ).reduce((sum, f) => {
            const amt = Number(f.edited_amount ?? f.amount);
            const waivedAmt = Number(f.waived_amount || 0);
            return sum + (f.waived ? 0 : Math.max(0, amt - waivedAmt));
          }, 0) || 0;

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
        }
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

  const ALL_MONTHS = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear--;
    }
    const target = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    if (!earliestMonth || target >= earliestMonth) {
      setSelectedMonth(target);
    }
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    const target = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    if (target <= currentMonthKey) {
      setSelectedMonth(target);
    }
  };

  const handleMonthDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = e.target.value;
    const [year] = selectedMonth.split('-');
    const target = `${year}-${newMonth}`;
    updateSelectedMonthClamped(target);
  };

  const handleYearDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = e.target.value;
    const [, month] = selectedMonth.split('-');
    const target = `${newYear}-${month}`;
    updateSelectedMonthClamped(target);
  };

  const updateSelectedMonthClamped = (target: string) => {
    let clamped = target;
    if (clamped > currentMonthKey) {
      clamped = currentMonthKey;
    } else if (earliestMonth && clamped < earliestMonth) {
      clamped = earliestMonth;
    }
    setSelectedMonth(clamped);
  };

  const isFirstMonth = earliestMonth ? selectedMonth <= earliestMonth : false;
  const isLastMonth = selectedMonth >= currentMonthKey;

  const startYear = earliestMonth ? parseInt(earliestMonth.split('-')[0]) : 2024;
  const yearsOptions: number[] = [];
  for (let y = Math.min(2024, startYear); y <= now.getFullYear(); y++) {
    yearsOptions.push(y);
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

      {/* Global Month Selector */}
      <div className="print:hidden bg-white border border-[#E8E8E8] rounded-[14px] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
        <div className="flex items-center space-x-3">
          <button
            onClick={handlePrevMonth}
            disabled={isFirstMonth}
            className="p-2 rounded-lg border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95 transition-all text-[#1A1A1A] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-extrabold text-[#1A1A1A]">
            {formatMonthDisplay(selectedMonth)}
          </span>
          <button
            onClick={handleNextMonth}
            disabled={isLastMonth}
            className="p-2 rounded-lg border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95 transition-all text-[#1A1A1A] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={selectedMonth.split('-')[1]}
            onChange={handleMonthDropdownChange}
            className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-2.5 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
          >
            {ALL_MONTHS.map((m) => (
              <option key={m.value} value={m.value} className="bg-white text-[#1A1A1A]">
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={selectedMonth.split('-')[0]}
            onChange={handleYearDropdownChange}
            className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-2.5 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
          >
            {yearsOptions.map((y) => (
              <option key={y} value={y} className="bg-white text-[#1A1A1A]">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Unconfirmed Banner */}
      {!confirmationsLoading && !hasConfirmations && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm select-none">
          <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
            <AlertCircle className="text-amber-600 flex-shrink-0" size={18} />
            <span>Salaries for {formatMonthDisplay(selectedMonth)} are not yet confirmed. Unconfirmed salaries are marked as PENDING.</span>
          </div>
          {activeTab !== 'bulk_confirm' && (
            <button
              onClick={() => setActiveTab('bulk_confirm')}
              className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase px-4 py-2 rounded-lg active:scale-95 transition-all w-fit cursor-pointer"
            >
              Go to Bulk Confirm
            </button>
          )}
        </div>
      )}

      {/* Active Tab Content */}
      <div className="animate-in fade-in duration-200">
        {activeTab === 'bulk_confirm' && (
          <BulkConfirmTab 
            selectedMonth={selectedMonth} 
            onConfirmationsUpdated={checkConfirmations} 
          />
        )}
        {activeTab === 'payslip' && <PayslipTab selectedMonth={selectedMonth} />}
        {activeTab === 'payments' && <PaymentTrackerTab selectedMonth={selectedMonth} />}
        {activeTab === 'report' && (
          <MonthlyReportTab
            selectedMonth={selectedMonth}
            onGoToBulkConfirm={() => setActiveTab('bulk_confirm')}
          />
        )}
        {activeTab === 'calculator' && (
          <SalaryCalculatorTab
            staffList={staffList}
            selectedStaffId={selectedStaffId}
            setSelectedStaffId={setSelectedStaffId}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            calcResult={calcResult}
            calcLoading={calcLoading}
            liveSalary={liveSalary}
            liveLoading={liveLoading}
            fetchLiveSalary={fetchLiveSalary}
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
  liveSalary,
  liveLoading,
  fetchLiveSalary,
}: any) {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = selectedMonth === currentMonthKey;
  const [selectedYear, selectedMonthNum] = selectedMonth.split('-').map(Number);
  const isPastMonth = 
    selectedYear < now.getFullYear() ||
    (selectedYear === now.getFullYear() && selectedMonthNum < now.getMonth() + 1);

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
      </div>

      {/* Featured Metrics / Salary Card */}
      {selectedStaffId && (
        (() => {
          const displayData = isPastMonth ? calcResult : liveSalary;
          const displayLoading = isPastMonth ? calcLoading : liveLoading;

          if (displayLoading && !displayData) {
            return (
              <div className="bg-[#1A1A1A] border border-transparent text-white rounded-[14px] p-5 shadow-lg relative overflow-hidden flex justify-center items-center py-8">
                <RefreshCw size={24} className="animate-spin text-white/60" />
              </div>
            );
          }

          if (!displayData) {
            return null;
          }

          if (isCurrentMonth) {
            return (
              <div className="bg-[#1A1A1A] border border-transparent text-white rounded-[14px] p-5 shadow-lg relative overflow-hidden flex flex-col space-y-4 font-sans select-none">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <div>
                    <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Salary So Far</p>
                    <h3 className="text-sm font-extrabold text-white mt-0.5">
                      SALARY SO FAR — {formatMonthDisplay(selectedMonth)}
                    </h3>
                  </div>
                  <button
                    onClick={() => fetchLiveSalary(selectedStaffId)}
                    disabled={liveLoading}
                    className="text-white/60 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <RefreshCw size={16} className={`${liveLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {displayData.is_hourly ? (
                  <div className="space-y-2.5 text-xs text-white/90">
                    <div className="flex justify-between">
                      <span className="text-white/50">Total hours logged:</span>
                      <span className="font-extrabold">{displayData.totalHours} hrs</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Standard hours:</span>
                      <span className="font-extrabold">{displayData.standardHours} hrs</span>
                    </div>
                    <div className="flex justify-between border-b border-dashed border-white/10 pb-2.5">
                      <span className="text-white/50">Hourly rate:</span>
                      <span className="font-extrabold">{formatCurrency(displayData.hourlyRate)}/hr</span>
                    </div>
                    <div className="flex justify-between items-end pt-1">
                      <span className="text-[10px] font-black uppercase text-white/50 tracking-wider">SALARY SO FAR:</span>
                      <span className="text-xl font-black text-white"><CountUp value={displayData.netSalary} prefix="₹" /></span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs text-white/90">
                    <div className="flex justify-between">
                      <span className="text-white/50">Days worked:</span>
                      <span className="font-extrabold"><CountUp value={displayData.daysWorked} suffix=" days" /></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Off bonus earned:</span>
                      <span className="font-extrabold text-[var(--success)]">+<CountUp value={displayData.offBonusEarned} suffix=" days" /></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Paid days so far:</span>
                      <span className="font-extrabold"><CountUp value={displayData.paidDays} suffix=" days" /></span>
                    </div>
                    <div className="flex justify-between border-b border-dashed border-white/10 pb-2.5">
                      <span className="text-white/50">Daily rate:</span>
                      <span className="font-extrabold">{formatCurrency(displayData.dailyRate)}</span>
                    </div>

                    <div className="flex justify-between pt-1">
                      <span className="text-white/50">Gross so far:</span>
                      <span className="font-extrabold"><CountUp value={displayData.grossPay} prefix="₹" /></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">OT earned:</span>
                      <span className="font-extrabold text-[var(--success)]">+<CountUp value={displayData.otEarned} prefix="₹" /></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Early-In earned:</span>
                      <span className="font-extrabold text-[var(--success)]">+<CountUp value={displayData.earlyInEarned || 0} prefix="₹" /></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Early leave:</span>
                      <span className="font-extrabold text-[var(--danger)]">-<CountUp value={displayData.earlyLeaveDeduction} prefix="₹" /></span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Late arrival deduction:</span>
                      <span className="font-extrabold text-[var(--danger)]">-<CountUp value={displayData.lateSalaryDeduction} prefix="₹" /></span>
                    </div>
                    <div className="flex justify-between border-b border-white/15 pb-2.5">
                      <span className="text-white/50">Late fines:</span>
                      <span className="font-extrabold text-[var(--danger)]">-<CountUp value={displayData.finesSoFar} prefix="₹" /></span>
                    </div>

                    <div className="flex justify-between items-end pt-1">
                      <span className="text-[10px] font-black uppercase text-white/50 tracking-wider">SALARY SO FAR:</span>
                      <span className="text-xl font-black text-white"><CountUp value={displayData.netSalary} prefix="₹" /></span>
                    </div>
                  </div>
                )}

                {displayData.nextMilestone && (
                  <div className="mt-1 bg-white/10 border border-white/5 rounded-lg px-3 py-2 text-[10px] font-bold text-white/80 flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-ping flex-shrink-0" />
                    <span>{displayData.nextMilestone}</span>
                  </div>
                )}

                <div className="text-[9px] text-white/40 italic leading-snug border-t border-white/5 pt-2.5 mt-1">
                  Note: Based on {displayData.daysWorked} days recorded. No deductions for future days. Final salary calculated at month end.
                </div>
              </div>
            );
          }

          // If isPastMonth:
          return (
            <div className="bg-[#1A1A1A] border border-transparent text-white rounded-[14px] p-5 shadow-lg relative overflow-hidden flex flex-col space-y-4 select-none">
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <div>
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Featured Metrics</p>
                  <h3 className="text-sm font-extrabold text-white mt-0.5 animate-in fade-in">
                    FULL MONTH — {formatMonthDisplay(selectedMonth)}
                  </h3>
                </div>
              </div>

              {displayData.is_hourly ? (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">Net Salary</span>
                      <span className="text-2xl font-black text-white block mt-1 leading-none">
                        {formatCurrency(displayData.netSalary)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">Total Hours Logged</span>
                      <span className="text-base font-extrabold text-white block mt-1 leading-none">
                        {displayData.totalHours.toFixed(2)} hrs
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 border-t border-white/10 pt-3.5 text-xs text-white/70">
                    <div>
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Hourly Rate</span>
                      <span className="font-extrabold text-white block mt-0.5">
                        {formatCurrency(displayData.hourlyRate)}/hr
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Standard Hours</span>
                      <span className="font-extrabold text-white block mt-0.5">
                        {displayData.standardHours} hrs
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">Net Salary</span>
                      <span className="text-2xl font-black text-white block mt-1 leading-none">
                        {formatCurrency(displayData.netSalary)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">Days Worked</span>
                      <span className="text-base font-extrabold text-white block mt-1 leading-none">
                        {displayData.daysActuallyWorked ?? displayData.daysWorked ?? 0} / {displayData.calendarDays}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-y-3 gap-x-2 border-t border-white/10 pt-3.5 text-xs text-white/70">
                    <div>
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Remaining Days</span>
                      <span className="font-extrabold text-white block mt-0.5">0 days</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Gross Pay</span>
                      <span className="font-extrabold text-white block mt-0.5">
                        {formatCurrency(displayData.grossPay)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">OT Earned</span>
                      <span className="font-extrabold text-white block mt-0.5">
                        {formatCurrency(displayData.otPay ?? displayData.otEarned ?? 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Early Leave Deduct</span>
                      <span className="font-extrabold text-white block mt-0.5">
                        -{formatCurrency(displayData.earlyLeaveDeduction || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Late Deductions</span>
                      <span className="font-extrabold text-white block mt-0.5">
                        -{formatCurrency(displayData.lateSalaryDeduction || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Fines So Far</span>
                      <span className="font-extrabold text-white block mt-0.5">
                        -{formatCurrency(displayData.finesSoFar ?? ((displayData.confirmedLateFines || 0) + (displayData.confirmedSpecialFines || 0)))}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Paid Days</span>
                      <span className="font-extrabold text-white block mt-0.5">
                        {displayData.paidDays} days
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()
      )}


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

          {calcResult.is_hourly ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2">Hourly Calculation Summary</h4>
                <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-4 space-y-2 text-xs font-semibold text-[#555555]">
                  <div className="flex justify-between">
                    <span>Total hours logged:</span>
                    <span className="text-[#1A1A1A] font-bold">{calcResult.totalHours} hrs</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Standard hours:</span>
                    <span className="text-[#1A1A1A] font-bold">{calcResult.standardHours} hrs</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hourly rate:</span>
                    <span className="text-[#1A1A1A] font-bold">{formatCurrency(calcResult.hourlyRate)}/hr</span>
                  </div>
                </div>
              </div>
              <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block leading-none">Net Salary</span>
                  <span className="text-2xl font-extrabold text-[#1A1A1A] block mt-1 leading-none">{formatCurrency(calcResult.netSalary)}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
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
                    <span>Late arrival deduction (permanent):</span>
                    <span className={`${calcResult.lateSalaryDeduction > 0 ? 'text-[var(--danger)]' : ''} font-bold`}>
                      -{formatCurrency(calcResult.lateSalaryDeduction)}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}

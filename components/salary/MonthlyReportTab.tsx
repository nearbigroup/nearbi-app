'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Staff, SalaryConfirmation, SalaryPayment } from './types';
import { formatCurrency, getPastMonths, formatMonthDisplay } from './utils';
import { Download } from 'lucide-react';
import { calculateSalary } from '@/lib/salary';

export default function MonthlyReportTab() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const months = getPastMonths(6);
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [confirmations, setConfirmations] = useState<SalaryConfirmation[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [lateFines, setLateFines] = useState<any[]>([]);
  const [specialFines, setSpecialFines] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*, branch:branches(name), shift:shifts(*)')
        .order('name');
      if (staffError) throw staffError;

      const { data: confData, error: confError } = await supabase
        .from('salary_confirmations')
        .select('*')
        .eq('month', selectedMonth);
      if (confError) throw confError;

      const { data: payData, error: payError } = await supabase
        .from('salary_payments')
        .select('*')
        .eq('month', selectedMonth);
      if (payError) throw payError;

      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr);
      const monthNum = parseInt(monthStr);
      const firstDay = `${selectedMonth}-01`;
      const lastDay = new Date(year, monthNum, 0).toISOString().split('T')[0];

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
        .gte('date', firstDay)
        .lte('date', lastDay);
      if (attError) throw attError;

      const { data: lfData, error: lfError } = await supabase
        .from('late_fines')
        .select('*')
        .eq('month', selectedMonth);
      if (lfError) throw lfError;

      const { data: sfData, error: sfError } = await supabase
        .from('special_fines')
        .select('*')
        .eq('month', selectedMonth);
      if (sfError) throw sfError;

      if (staffData) setStaffList(staffData as unknown as Staff[]);
      if (confData) setConfirmations(confData);
      if (payData) setPayments(payData);
      setAttendanceRecords(attData || []);
      setLateFines(lfData || []);
      setSpecialFines(sfData || []);

    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const recalculatedConfs = React.useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);

    return confirmations.map((c) => {
      const s = staffList.find((x) => x.id === c.staff_id);
      if (!s) return null;

      const staffAtt = attendanceRecords.filter((r) => r.staff_id === s.id);
      const extraLeaveDays = c.extra_leave_days || 0;
      
      const daysActuallyWorked = Math.max(
        0,
        (staffAtt.filter((r) => r.check_in_time !== null).length || 0) - extraLeaveDays
      );

      const approvedOTMinutes = staffAtt
        .filter((r) => r.ot_approved === true)
        .reduce((sum, r) => sum + (r.ot_minutes || 0), 0) || 0;

      const approvedEarlyInMinutes = staffAtt
        .filter((r) => r.early_in_approved === true)
        .reduce((sum, r) => sum + (r.early_in_minutes || 0), 0) || 0;

      const earlyLeaveMinutes = staffAtt.reduce(
        (sum, r) => sum + (r.early_leave_minutes || 0), 0
      ) || 0;

      const staffLateFines = lateFines.filter(
        (lf) => lf.staff_id === s.id && lf.confirmed && !lf.waived
      );
      const totalLateFinesAmt = staffLateFines.reduce((sum, lf) => sum + Number(lf.fine_amount), 0);

      const staffSpecialFines = specialFines.filter(
        (sf) => sf.staff_id === s.id && sf.confirmed && !sf.waived
      );
      const totalSpecialFinesAmt = staffSpecialFines.reduce(
        (sum, sf) => sum + Number(sf.edited_amount ?? sf.amount), 0
      );

      const shiftHours = s.shift?.hours || 9;

      const breakdown = calculateSalary(
        {
          monthlySalary: c.base_salary,
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

      const totalDed = (breakdown.calendarDays - breakdown.paidDays) * breakdown.dailyRate
        + breakdown.earlyLeaveDeduction
        + totalLateFinesAmt
        + totalSpecialFinesAmt;

      const totalAdd = breakdown.otPay + breakdown.earlyInPay;

      return {
        ...c,
        base_salary: c.base_salary,
        ot_pay: totalAdd,
        leave_deduction: totalDed,
        net_salary: Math.max(0, breakdown.netSalary),
      };
    }).filter(Boolean) as SalaryConfirmation[];
  }, [confirmations, staffList, attendanceRecords, lateFines, specialFines, selectedMonth]);

  const getBranchStats = (branchId: string) => {
    const branchStaff = staffList.filter((s) => s.branch_id === branchId);
    const branchStaffIds = branchStaff.map((s) => s.id);
    
    const branchConfs = recalculatedConfs.filter((c) => branchStaffIds.includes(c.staff_id));
    const branchPays = payments.filter((p) => branchStaffIds.includes(p.staff_id));

    const totalPayroll = branchConfs.reduce((sum, c) => sum + c.net_salary, 0);
    const totalOT = branchConfs.reduce((sum, c) => sum + c.ot_pay, 0);
    const totalDed = branchConfs.reduce((sum, c) => sum + c.leave_deduction, 0);
    
    return {
      totalPayroll,
      totalOT,
      totalDed,
      staffPaid: branchPays.length,
      staffTotal: branchConfs.length,
    };
  };

  const dailyStats = getBranchStats('daily');
  const hyperStats = getBranchStats('hypermarket');

  const totalBase = recalculatedConfs.reduce((sum, c) => sum + c.base_salary, 0);
  const totalOT = recalculatedConfs.reduce((sum, c) => sum + c.ot_pay, 0);
  const totalDed = recalculatedConfs.reduce((sum, c) => sum + c.leave_deduction, 0);
  const netPayroll = recalculatedConfs.reduce((sum, c) => sum + c.net_salary, 0);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-[42px] w-full" />
        <div className="skeleton h-[200px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 select-none pb-6">
      {/* Selection row (Hidden on print) */}
      <div className="print:hidden space-y-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
            Select Report Month
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
          >
            {months.map((m) => (
              <option key={m} value={m} className="bg-white text-[#1A1A1A]">
                {formatMonthDisplay(m)}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => window.print()}
          className="w-full min-h-[44px] bg-[#1A1A1A] text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow hover:bg-[#333333] cursor-pointer"
        >
          <Download size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Download / Print Report</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchData} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Main printable report page wrapper */}
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 shadow-sm overflow-hidden print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
        
        {/* Document Header */}
        <div className="border-b-2 border-[#1A1A1A] print:border-black pb-4 mb-5 flex justify-between items-end">
          <div>
            <div className="font-[900] text-xl tracking-tight flex mb-1 leading-none">
              <span className="text-[#1A1A1A] print:text-black">near</span>
              <span className="text-[#1A1A1A]/60 print:text-[#F5A800]">bi</span>
            </div>
            <h1 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] print:text-gray-500">
              Monthly Salary Ledger
            </h1>
          </div>
          <div className="text-right leading-tight">
            <div className="text-sm font-bold text-[#1A1A1A] print:text-black">
              {formatMonthDisplay(selectedMonth)}
            </div>
            <div className="text-[9px] text-[var(--text-muted)] print:text-gray-500 font-semibold uppercase mt-0.5">
              Issued {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Overview Grid */}
          <section>
            <h2 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2.5">
              1. Ledger Overview
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 print:bg-gray-50 print:border-gray-150">
                <div className="text-lg font-bold text-[#1A1A1A] print:text-black">{staffList.length}</div>
                <div className="text-[9px] text-[var(--text-muted)] print:text-gray-500 font-bold uppercase mt-0.5">Active Staff</div>
              </div>
              <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 print:bg-gray-50 print:border-gray-150">
                <div className="text-lg font-bold text-[#1A1A1A] print:text-black">{confirmations.length}</div>
                <div className="text-[9px] text-[var(--text-muted)] print:text-gray-500 font-bold uppercase mt-0.5">Confirmed</div>
              </div>
              <div className="bg-[var(--success-bg)] border border-[var(--success)]/20 rounded-xl p-3 text-[var(--success)] print:bg-green-50 print:border-green-100 print:text-green-800">
                <div className="text-lg font-bold">{payments.length}</div>
                <div className="text-[9px] font-bold uppercase mt-0.5">Paid Payouts</div>
              </div>
            </div>
          </section>

          {/* Branch summaries */}
          <section>
            <h2 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2.5">
              2. Branch Payroll Breaks
            </h2>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="border border-[#E8E8E8] print:border-gray-200 rounded-lg p-3.5 space-y-2">
                <h3 className="font-bold text-xs text-[#1A1A1A] print:text-black border-b border-[#E8E8E8] print:border-gray-100 pb-1.5">
                  Nearbi Daily
                </h3>
                <div className="space-y-1.5 text-xs text-[#555555] print:text-gray-500 font-semibold">
                  <div className="flex justify-between">
                    <span>Gross Salary:</span>
                    <span className="text-[#1A1A1A] print:text-black font-bold">{formatCurrency(dailyStats.totalPayroll)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overtime Paid:</span>
                    <span className="text-[var(--success)] print:text-green-700">+{formatCurrency(dailyStats.totalOT)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Deductions:</span>
                    <span className="text-[var(--danger)] print:text-red-700">-{formatCurrency(dailyStats.totalDed)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-[#E8E8E8] print:border-gray-100 mt-1.5 text-[10px]">
                    <span>Payout ratio:</span>
                    <span className="text-[#1A1A1A] print:text-black font-bold">{dailyStats.staffPaid} / {dailyStats.staffTotal} staff</span>
                  </div>
                </div>
              </div>

              <div className="border border-[#E8E8E8] print:border-gray-200 rounded-lg p-3.5 space-y-2">
                <h3 className="font-bold text-xs text-[#1A1A1A] print:text-black border-b border-[#E8E8E8] print:border-gray-100 pb-1.5">
                  Nearbi Hypermarket
                </h3>
                <div className="space-y-1.5 text-xs text-[#555555] print:text-gray-500 font-semibold">
                  <div className="flex justify-between">
                    <span>Gross Salary:</span>
                    <span className="text-[#1A1A1A] print:text-black font-bold">{formatCurrency(hyperStats.totalPayroll)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overtime Paid:</span>
                    <span className="text-[var(--success)] print:text-green-700">+{formatCurrency(hyperStats.totalOT)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Deductions:</span>
                    <span className="text-[var(--danger)] print:text-red-700">-{formatCurrency(hyperStats.totalDed)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-[#E8E8E8] print:border-gray-100 mt-1.5 text-[10px]">
                    <span>Payout ratio:</span>
                    <span className="text-[#1A1A1A] print:text-black font-bold">{hyperStats.staffPaid} / {hyperStats.staffTotal} staff</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Combined totals bar */}
          <section>
            <h2 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2.5">
              3. Aggregate Financial Metrics
            </h2>
            <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-lg p-4 space-y-2.5 text-xs font-semibold text-[#555555] print:bg-gray-50 print:border-gray-150 print:text-gray-700 font-sans">
              <div className="flex justify-between items-center">
                <span>Combined Base Salaries:</span>
                <span className="text-[#1A1A1A] print:text-black font-bold">{formatCurrency(totalBase)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Combined OT Earnings:</span>
                <span className="text-[var(--success)] print:text-green-700 font-bold">+{formatCurrency(totalOT)}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-[#E8E8E8] print:border-gray-200">
                <span>Combined Leave Deductions:</span>
                <span className="text-[var(--danger)] print:text-red-700 font-bold">-{formatCurrency(totalDed)}</span>
              </div>
              <div className="flex justify-between items-end pt-1">
                <span className="text-[10px] font-bold uppercase text-[#1A1A1A] print:text-black tracking-widest">
                  Total Net Payroll
                </span>
                <span className="text-xl font-bold text-[#1A1A1A] print:text-black">
                  {formatCurrency(netPayroll)}
                </span>
              </div>
            </div>
          </section>

          {/* Staff table registry */}
          <section className="overflow-x-auto">
            <h2 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2.5">
              4. Complete Staff Registry list
            </h2>
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead>
                <tr className="text-[var(--text-muted)] print:text-gray-500 uppercase font-bold text-[9px] bg-[#F8F8F8] border-b border-[#E8E8E8] print:bg-gray-50 print:border-gray-200">
                  <th className="p-2">Name</th>
                  <th className="p-2">Branch</th>
                  <th className="p-2 text-right">Base</th>
                  <th className="p-2 text-right">OT</th>
                  <th className="p-2 text-right">Ded.</th>
                  <th className="p-2 text-right font-bold text-[#1A1A1A] print:text-black">Net</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E8E8] print:divide-gray-100">
                {recalculatedConfs.map((conf) => {
                  const s = staffList.find((x) => x.id === conf.staff_id);
                  if (!s) return null;
                  const isPaid = payments.find((p) => p.staff_id === conf.staff_id);
                  
                  return (
                    <tr key={conf.id} className="hover:bg-[#F8F8F8] print:hover:bg-gray-50 transition-colors">
                      <td className="p-2 font-bold text-[#1A1A1A] print:text-black">{s.name}</td>
                      <td className="p-2 text-[#555555] print:text-gray-500 capitalize">{s.branch_id}</td>
                      <td className="p-2 text-right font-semibold text-[#1A1A1A] print:text-black">{formatCurrency(conf.base_salary)}</td>
                      <td className="p-2 text-right text-[var(--success)] print:text-green-700 font-semibold">+{formatCurrency(conf.ot_pay)}</td>
                      <td className="p-2 text-right text-[var(--danger)] print:text-red-700 font-semibold">-{formatCurrency(conf.leave_deduction)}</td>
                      <td className="p-2 text-right font-bold text-[#1A1A1A] print:text-black">{formatCurrency(conf.net_salary)}</td>
                      <td className="p-2 text-center font-bold">
                        {isPaid ? (
                          <span className="bg-[var(--success-bg)] text-[var(--success)] text-[8px] font-bold px-2 py-0.5 rounded uppercase border border-[var(--success)]/20 print:bg-green-50 print:text-green-700 print:border-green-150">
                            Paid
                          </span>
                        ) : (
                          <span className="bg-[var(--warning-bg)] text-[var(--warning)] text-[8px] font-bold px-2 py-0.5 rounded uppercase border border-[var(--warning)]/20 print:bg-amber-50 print:text-[#E65100] print:border-amber-150">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {recalculatedConfs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[var(--text-muted)] print:text-gray-400 italic font-semibold">
                      No records generated for this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

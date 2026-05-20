'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Staff, SalaryConfirmation, SalaryPayment } from './types';
import { formatCurrency, getPastMonths, formatMonthDisplay } from './utils';
import { Download } from 'lucide-react';

export default function MonthlyReportTab() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const months = getPastMonths(6);
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [confirmations, setConfirmations] = useState<SalaryConfirmation[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*, branch:branches(name)')
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

      if (staffData) setStaffList(staffData as unknown as Staff[]);
      if (confData) setConfirmations(confData);
      if (payData) setPayments(payData);

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

  const getBranchStats = (branchId: string) => {
    const branchStaff = staffList.filter((s) => s.branch_id === branchId);
    const branchStaffIds = branchStaff.map((s) => s.id);
    
    const branchConfs = confirmations.filter((c) => branchStaffIds.includes(c.staff_id));
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

  const totalBase = confirmations.reduce((sum, c) => sum + c.base_salary, 0);
  const totalOT = confirmations.reduce((sum, c) => sum + c.ot_pay, 0);
  const totalDed = confirmations.reduce((sum, c) => sum + c.leave_deduction, 0);
  const netPayroll = confirmations.reduce((sum, c) => sum + c.net_salary, 0);

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
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
          >
            {months.map((m) => (
              <option key={m} value={m} className="bg-[var(--bg-surface)]">
                {formatMonthDisplay(m)}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => window.print()}
          className="w-full min-h-[44px] bg-white text-[#1E2028] font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow hover:bg-gray-200"
        >
          <Download size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Download / Print Report</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchData} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Main printable report page wrapper */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-6 shadow-sm overflow-hidden print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
        
        {/* Document Header */}
        <div className="border-b-2 border-white print:border-black pb-4 mb-5 flex justify-between items-end">
          <div>
            <div className="font-[900] text-xl tracking-tight flex mb-1 leading-none">
              <span className="text-white print:text-black">near</span>
              <span className="text-white/60 print:text-[#F5A800]">bi</span>
            </div>
            <h1 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] print:text-gray-500">
              Monthly Salary Ledger
            </h1>
          </div>
          <div className="text-right leading-tight">
            <div className="text-sm font-bold text-[#FBBF24] print:text-black">
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
            <h2 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              1. Ledger Overview
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3 print:bg-gray-50 print:border-gray-150">
                <div className="text-lg font-bold text-white print:text-black">{staffList.length}</div>
                <div className="text-[9px] text-[var(--text-muted)] print:text-gray-500 font-bold uppercase mt-0.5">Active Staff</div>
              </div>
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3 print:bg-gray-50 print:border-gray-150">
                <div className="text-lg font-bold text-[#FBBF24] print:text-black">{confirmations.length}</div>
                <div className="text-[9px] text-[var(--text-muted)] print:text-gray-500 font-bold uppercase mt-0.5">Confirmed</div>
              </div>
              <div className="bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.2)] rounded-xl p-3 text-[#4ADE80] print:bg-green-50 print:border-green-100 print:text-green-800">
                <div className="text-lg font-bold">{payments.length}</div>
                <div className="text-[9px] font-bold uppercase mt-0.5">Paid Payouts</div>
              </div>
            </div>
          </section>

          {/* Branch summaries */}
          <section>
            <h2 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              2. Branch Payroll Breaks
            </h2>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="border border-[var(--border)] print:border-gray-200 rounded-lg p-3.5 space-y-2">
                <h3 className="font-bold text-xs text-white print:text-black border-b border-[var(--border-strong)] print:border-gray-100 pb-1.5">
                  Nearbi Daily
                </h3>
                <div className="space-y-1.5 text-xs text-[var(--text-secondary)] print:text-gray-500 font-semibold">
                  <div className="flex justify-between">
                    <span>Gross Salary:</span>
                    <span className="text-white print:text-black font-bold">{formatCurrency(dailyStats.totalPayroll)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overtime Paid:</span>
                    <span className="text-[#4ADE80] print:text-green-700">+{formatCurrency(dailyStats.totalOT)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Deductions:</span>
                    <span className="text-[#F87171] print:text-red-700">-{formatCurrency(dailyStats.totalDed)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-[var(--border-strong)] print:border-gray-100 mt-1.5 text-[10px]">
                    <span>Payout ratio:</span>
                    <span className="text-white print:text-black font-bold">{dailyStats.staffPaid} / {dailyStats.staffTotal} staff</span>
                  </div>
                </div>
              </div>

              <div className="border border-[var(--border)] print:border-gray-200 rounded-lg p-3.5 space-y-2">
                <h3 className="font-bold text-xs text-white print:text-black border-b border-[var(--border-strong)] print:border-gray-100 pb-1.5">
                  Nearbi Hypermarket
                </h3>
                <div className="space-y-1.5 text-xs text-[var(--text-secondary)] print:text-gray-500 font-semibold">
                  <div className="flex justify-between">
                    <span>Gross Salary:</span>
                    <span className="text-white print:text-black font-bold">{formatCurrency(hyperStats.totalPayroll)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overtime Paid:</span>
                    <span className="text-[#4ADE80] print:text-green-700">+{formatCurrency(hyperStats.totalOT)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Deductions:</span>
                    <span className="text-[#F87171] print:text-red-700">-{formatCurrency(hyperStats.totalDed)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-[var(--border-strong)] print:border-gray-100 mt-1.5 text-[10px]">
                    <span>Payout ratio:</span>
                    <span className="text-white print:text-black font-bold">{hyperStats.staffPaid} / {hyperStats.staffTotal} staff</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Combined totals bar */}
          <section>
            <h2 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              3. Aggregate Financial Metrics
            </h2>
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-4 space-y-2.5 text-xs font-semibold text-[var(--text-secondary)] print:bg-gray-50 print:border-gray-150 print:text-gray-700">
              <div className="flex justify-between items-center">
                <span>Combined Base Salaries:</span>
                <span className="text-white print:text-black font-bold">{formatCurrency(totalBase)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Combined OT Earnings:</span>
                <span className="text-[#4ADE80] print:text-green-700 font-bold">+{formatCurrency(totalOT)}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-[var(--border-strong)] print:border-gray-200">
                <span>Combined Leave Deductions:</span>
                <span className="text-[#F87171] print:text-red-700 font-bold">-{formatCurrency(totalDed)}</span>
              </div>
              <div className="flex justify-between items-end pt-1">
                <span className="text-[10px] font-bold uppercase text-white print:text-black tracking-widest">
                  Total Net Payroll
                </span>
                <span className="text-xl font-bold text-[#FBBF24] print:text-black">
                  {formatCurrency(netPayroll)}
                </span>
              </div>
            </div>
          </section>

          {/* Staff table registry */}
          <section className="overflow-x-auto">
            <h2 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2.5">
              4. Complete Staff Registry list
            </h2>
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead>
                <tr className="text-[var(--text-muted)] print:text-gray-500 uppercase font-bold text-[9px] bg-[var(--bg-elevated)] border-b border-[var(--border-strong)] print:bg-gray-50 print:border-gray-200">
                  <th className="p-2">Name</th>
                  <th className="p-2">Branch</th>
                  <th className="p-2 text-right">Base</th>
                  <th className="p-2 text-right">OT</th>
                  <th className="p-2 text-right">Ded.</th>
                  <th className="p-2 text-right font-bold text-white print:text-black">Net</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] print:divide-gray-100">
                {confirmations.map((conf) => {
                  const s = staffList.find((x) => x.id === conf.staff_id);
                  if (!s) return null;
                  const isPaid = payments.find((p) => p.staff_id === conf.staff_id);
                  
                  return (
                    <tr key={conf.id} className="hover:bg-[var(--bg-elevated)]/50 print:hover:bg-gray-50 transition-colors">
                      <td className="p-2 font-bold text-white print:text-black">{s.name}</td>
                      <td className="p-2 text-[var(--text-secondary)] print:text-gray-500 capitalize">{s.branch_id}</td>
                      <td className="p-2 text-right font-semibold text-white print:text-black">{formatCurrency(conf.base_salary)}</td>
                      <td className="p-2 text-right text-[#4ADE80] print:text-green-700 font-semibold">+{formatCurrency(conf.ot_pay)}</td>
                      <td className="p-2 text-right text-[#F87171] print:text-red-700 font-semibold">-{formatCurrency(conf.leave_deduction)}</td>
                      <td className="p-2 text-right font-bold text-white print:text-black">{formatCurrency(conf.net_salary)}</td>
                      <td className="p-2 text-center">
                        {isPaid ? (
                          <span className="bg-[rgba(74,222,128,0.12)] text-[#4ADE80] text-[8px] font-bold px-2 py-0.5 rounded uppercase border border-[rgba(74,222,128,0.2)] print:bg-green-50 print:text-green-700 print:border-green-150">
                            Paid
                          </span>
                        ) : (
                          <span className="bg-[rgba(251,191,36,0.1)] text-[#FBBF24] text-[8px] font-bold px-2 py-0.5 rounded uppercase border border-[rgba(251,191,36,0.2)] print:bg-amber-50 print:text-[#E65100] print:border-amber-150">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {confirmations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[var(--text-muted)] print:text-gray-400 italic font-medium">
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

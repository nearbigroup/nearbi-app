'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Staff, SalaryConfirmation, SalaryPayment } from './types';
import { formatCurrency, getPastMonths, formatMonthDisplay } from './utils';

export default function MonthlyReportTab() {
  const [loading, setLoading] = useState(true);
  
  const months = getPastMonths(6);
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [confirmations, setConfirmations] = useState<SalaryConfirmation[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const { data: staffData } = await supabase.from('staff').select('*, branch:branches(name)').order('name');
      const { data: confData } = await supabase.from('salary_confirmations').select('*').eq('month', selectedMonth);
      const { data: payData } = await supabase.from('salary_payments').select('*').eq('month', selectedMonth);

      if (staffData) setStaffList(staffData);
      if (confData) setConfirmations(confData);
      if (payData) setPayments(payData);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getBranchStats = (branchId: string) => {
    const branchStaff = staffList.filter(s => s.branch_id === branchId);
    const branchStaffIds = branchStaff.map(s => s.id);
    
    const branchConfs = confirmations.filter(c => branchStaffIds.includes(c.staff_id));
    const branchPays = payments.filter(p => branchStaffIds.includes(p.staff_id));

    const totalPayroll = branchConfs.reduce((sum, c) => sum + c.net_salary, 0);
    const totalOT = branchConfs.reduce((sum, c) => sum + c.ot_pay, 0);
    const totalDed = branchConfs.reduce((sum, c) => sum + c.leave_deduction, 0);
    
    return {
      totalPayroll,
      totalOT,
      totalDed,
      staffPaid: branchPays.length,
      staffTotal: branchConfs.length
    };
  };

  const dailyStats = getBranchStats('daily');
  const hyperStats = getBranchStats('hypermarket');

  const totalBase = confirmations.reduce((sum, c) => sum + c.base_salary, 0);
  const totalOT = confirmations.reduce((sum, c) => sum + c.ot_pay, 0);
  const totalDed = confirmations.reduce((sum, c) => sum + c.leave_deduction, 0);
  const netPayroll = confirmations.reduce((sum, c) => sum + c.net_salary, 0);

  return (
    <div className="space-y-6">
      <div className="print:hidden space-y-4">
        <div>
          <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">Select Month</label>
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-[#333] text-white p-3 rounded-xl focus:outline-none focus:border-brand-accent"
          >
            {months.map(m => (
              <option key={m} value={m}>{formatMonthDisplay(m)}</option>
            ))}
          </select>
        </div>
        <button 
          onClick={() => window.print()}
          className="w-full bg-brand-accent text-[#111] font-bold py-3 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
        >
          <span className="mr-2">🖨️</span> Download / Print Report
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading report...</div>
      ) : (
        <div className="bg-white text-black p-6 rounded-none sm:rounded-2xl print:m-0 w-full overflow-hidden shadow-2xl">
          <div className="border-b-4 border-[#111] pb-4 mb-6 flex justify-between items-end">
            <div>
              <div className="font-bold text-3xl tracking-tight flex mb-1">
                <span className="text-[#111]">near</span>
                <span className="text-brand-accent">bi</span>
              </div>
              <h1 className="text-xl font-bold uppercase tracking-wider text-gray-800">Monthly Salary Report</h1>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-brand-accent">{formatMonthDisplay(selectedMonth)}</div>
              <div className="text-xs text-gray-500 font-bold uppercase">Generated {new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div className="space-y-8">
            {/* Overview */}
            <section>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-4">Overview</h2>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <div className="text-3xl font-bold text-[#111]">{staffList.length}</div>
                  <div className="text-xs text-gray-500 font-bold uppercase">Total Staff</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <div className="text-3xl font-bold text-brand-accent">{confirmations.length}</div>
                  <div className="text-xs text-gray-500 font-bold uppercase">Confirmed Salaries</div>
                </div>
                <div className="bg-[#2E7D32]/10 rounded-xl p-3 border border-[#2E7D32]/30">
                  <div className="text-3xl font-bold text-[#2E7D32]">{payments.length} <span className="text-sm">/ {confirmations.length}</span></div>
                  <div className="text-xs text-[#2E7D32] font-bold uppercase">Payments Done</div>
                </div>
              </div>
            </section>

            {/* Branch Summary */}
            <section>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-4">Branch Summary</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-bold text-lg mb-3">Nearbi Daily</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Payroll:</span>
                      <span className="font-bold">{formatCurrency(dailyStats.totalPayroll)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total OT Paid:</span>
                      <span className="text-green-600 font-bold">+{formatCurrency(dailyStats.totalOT)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Deductions:</span>
                      <span className="text-red-600 font-bold">-{formatCurrency(dailyStats.totalDed)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-100 mt-2">
                      <span className="text-gray-500">Staff Paid:</span>
                      <span className="font-bold">{dailyStats.staffPaid} / {dailyStats.staffTotal}</span>
                    </div>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="font-bold text-lg mb-3">Hypermarket</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Payroll:</span>
                      <span className="font-bold">{formatCurrency(hyperStats.totalPayroll)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total OT Paid:</span>
                      <span className="text-green-600 font-bold">+{formatCurrency(hyperStats.totalOT)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Deductions:</span>
                      <span className="text-red-600 font-bold">-{formatCurrency(hyperStats.totalDed)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-100 mt-2">
                      <span className="text-gray-500">Staff Paid:</span>
                      <span className="font-bold">{hyperStats.staffPaid} / {hyperStats.staffTotal}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Combined Totals */}
            <section>
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-4">Combined Totals</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 font-bold uppercase tracking-wider">Total Base Salary</span>
                  <span className="font-bold text-lg">{formatCurrency(totalBase)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 font-bold uppercase tracking-wider">Total OT Paid</span>
                  <span className="font-bold text-lg text-green-600">+{formatCurrency(totalOT)}</span>
                </div>
                <div className="flex justify-between items-center text-sm pb-3 border-b border-gray-300">
                  <span className="text-gray-600 font-bold uppercase tracking-wider">Total Leave Deductions</span>
                  <span className="font-bold text-lg text-red-600">-{formatCurrency(totalDed)}</span>
                </div>
                <div className="flex justify-between items-end pt-2">
                  <span className="font-black text-[#111] uppercase tracking-widest">Net Payroll</span>
                  <span className="font-black text-3xl text-brand-accent">{formatCurrency(netPayroll)}</span>
                </div>
              </div>
            </section>

            {/* Staff Breakdown Table */}
            <section className="overflow-x-auto">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 mb-4">Staff Breakdown</h2>
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-gray-500 uppercase tracking-wider text-[10px] bg-gray-50">
                    <th className="p-3 rounded-l-lg">Name</th>
                    <th className="p-3">Branch</th>
                    <th className="p-3 text-right">Base</th>
                    <th className="p-3 text-right">OT</th>
                    <th className="p-3 text-right">Ded.</th>
                    <th className="p-3 text-right font-bold text-black">Net</th>
                    <th className="p-3 text-center rounded-r-lg">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {confirmations.map(conf => {
                    const s = staffList.find(x => x.id === conf.staff_id);
                    if (!s) return null;
                    const isPaid = payments.find(p => p.staff_id === conf.staff_id);
                    
                    return (
                      <tr key={conf.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-bold">{s.name}</td>
                        <td className="p-3 text-xs text-gray-500">{s.branch?.name}</td>
                        <td className="p-3 text-right">{formatCurrency(conf.base_salary)}</td>
                        <td className="p-3 text-right text-green-600">{formatCurrency(conf.ot_pay)}</td>
                        <td className="p-3 text-right text-red-600">{formatCurrency(conf.leave_deduction)}</td>
                        <td className="p-3 text-right font-bold text-black">{formatCurrency(conf.net_salary)}</td>
                        <td className="p-3 text-center">
                          {isPaid ? (
                            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded uppercase">Paid</span>
                          ) : (
                            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded uppercase">Pending</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {confirmations.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-gray-400 italic">No salary data for this month.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Staff, SalaryConfirmation } from './types';
import { formatCurrency, getCurrentMonthStr, getPastMonths, formatMonthDisplay } from './utils';

export default function PayslipTab() {
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  
  const months = getPastMonths(3);
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  
  const [confirmation, setConfirmation] = useState<SalaryConfirmation | null>(null);

  useEffect(() => {
    fetchStaff();
  }, []);

  useEffect(() => {
    if (selectedStaffId && selectedMonth) {
      fetchConfirmation();
    } else {
      setConfirmation(null);
    }
  }, [selectedStaffId, selectedMonth]);

  const fetchStaff = async () => {
    try {
      const { data } = await supabase
        .from('staff')
        .select('*, branch:branches(name), shift:shifts(*)')
        .eq('active', true)
        .order('name');
      if (data) setStaffList(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfirmation = async () => {
    try {
      const { data } = await supabase
        .from('salary_confirmations')
        .select('*')
        .eq('staff_id', selectedStaffId)
        .eq('month', selectedMonth)
        .maybeSingle();
      
      setConfirmation(data || null);
    } catch (e) {
      console.error(e);
    }
  };

  const staff = staffList.find(s => s.id === selectedStaffId);

  const handleWhatsApp = () => {
    if (!staff || !confirmation) return;
    const msg = `Salary slip for ${staff.name} - ${formatMonthDisplay(selectedMonth)}: \nNet salary ${formatCurrency(confirmation.net_salary)}.\nFor details contact management.`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  if (loading) return <div className="text-center py-10 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Controls - Hidden on print */}
      <div className="print:hidden space-y-4">
        <div>
          <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">Select Staff</label>
          <select 
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-[#333] text-white p-3 rounded-xl focus:outline-none focus:border-brand-accent"
          >
            <option value="">-- Choose Staff --</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.branch?.name})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">Select Month</label>
          <div className="grid grid-cols-3 gap-2">
            {months.map(m => (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`py-2 text-sm font-bold rounded-lg border transition-colors ${
                  selectedMonth === m 
                    ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' 
                    : 'bg-[#1A1A1A] border-[#333] text-gray-400'
                }`}
              >
                {formatMonthDisplay(m)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      {selectedStaffId && !confirmation && (
        <div className="bg-[#FFF8E7] border border-amber-300 rounded-xl p-6 text-center print:hidden">
          <div className="text-4xl mb-2">⚠️</div>
          <h3 className="text-amber-900 font-bold text-lg mb-1">Salary not confirmed</h3>
          <p className="text-amber-700 text-sm mb-4">Salary for {formatMonthDisplay(selectedMonth)} has not been confirmed yet.</p>
        </div>
      )}

      {selectedStaffId && confirmation && staff && (
        <div className="space-y-6">
          {/* Action Buttons - Hidden on Print */}
          <div className="grid grid-cols-2 gap-3 print:hidden">
            <button 
              onClick={() => window.print()}
              className="bg-brand-accent text-[#111] font-bold py-3 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
            >
              <span className="mr-2">📄</span> Download PDF
            </button>
            <button 
              onClick={handleWhatsApp}
              className="bg-[#25D366] text-white font-bold py-3 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
            >
              <span className="mr-2">💬</span> Share on WA
            </button>
          </div>

          {/* Payslip Preview - Visible on Print */}
          <div className="bg-white text-black p-6 rounded-none sm:rounded-xl border-t-8 border-brand-accent shadow-2xl print:shadow-none print:border-t-4 print:m-0 w-full max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="font-bold text-3xl tracking-tight flex justify-center mb-1">
                <span className="text-[#111]">near</span>
                <span className="text-brand-accent">bi</span>
              </div>
              <div className="text-xs text-gray-500 font-bold uppercase tracking-widest border-b border-gray-200 pb-4">
                Salary Slip — {formatMonthDisplay(selectedMonth)}
              </div>
            </div>

            {/* Staff Info */}
            <div className="space-y-2 mb-6 text-sm border-b border-gray-200 pb-6">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-bold">{staff.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Department</span>
                <span className="font-bold text-gray-700">{staff.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Branch</span>
                <span className="font-bold text-gray-700">{staff.branch?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Shift</span>
                <span className="font-bold text-gray-700">{staff.shift?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Join Date</span>
                <span className="font-bold text-gray-700">{new Date(staff.join_date).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Salary Calculation */}
            <div className="space-y-3 mb-6 text-sm border-b border-gray-200 pb-6">
              <div className="flex justify-between items-center bg-gray-50 p-2 rounded">
                <span className="text-gray-600 font-medium">Base Salary (30 days)</span>
                <span className="font-bold">{formatCurrency(confirmation.base_salary)}</span>
              </div>
              <div className="flex justify-between px-2">
                <span className="text-gray-500">Working days entitled</span>
                <span className="font-bold text-gray-700">{30 - staff.off_days_per_month} days</span>
              </div>
              <div className="flex justify-between px-2 text-xs text-gray-400">
                <span>Daily Rate</span>
                <span>{formatCurrency(confirmation.base_salary / 30)}/day</span>
              </div>
            </div>

            {/* Deductions & Additions */}
            <div className="space-y-3 mb-6 text-sm border-b border-dashed border-gray-300 pb-6">
              <div className="flex justify-between px-2">
                <span className="text-gray-500">Leave Deduction ({confirmation.extra_leave_days} days)</span>
                <span className="font-bold text-red-600">- {formatCurrency(confirmation.leave_deduction)}</span>
              </div>
              <div className="flex justify-between px-2">
                <span className="text-gray-500">OT Pay ({(confirmation.ot_minutes / 60).toFixed(1)} hrs)</span>
                <span className="font-bold text-green-600">+ {formatCurrency(confirmation.ot_pay)}</span>
              </div>
            </div>

            {/* Net Total */}
            <div className="flex justify-between items-end px-2 mb-8">
              <span className="font-bold text-gray-400 uppercase tracking-widest text-xs mb-1">Net Salary</span>
              <span className="text-3xl font-black text-brand-accent">{formatCurrency(confirmation.net_salary)}</span>
            </div>

            <div className="text-center text-[10px] text-gray-400 uppercase tracking-widest pt-4 border-t border-gray-100">
              <div>Generated by Nearbi Staff</div>
              <div>{new Date().toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

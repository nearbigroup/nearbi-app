'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Staff, SalaryConfirmation } from './types';
import { formatCurrency, getPastMonths, formatMonthDisplay } from './utils';
import { AlertTriangle, FileText, Share2 } from 'lucide-react';

export default function PayslipTab({ selectedMonth: propMonth }: { selectedMonth?: string }) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  
  const months = getPastMonths(3);
  const [selectedMonthState, setSelectedMonthState] = useState(propMonth || months[0]);
  const selectedMonth = propMonth || selectedMonthState;

  useEffect(() => {
    if (propMonth) {
      setSelectedMonthState(propMonth);
    }
  }, [propMonth]);

  const setSelectedMonth = (m: string) => {
    setSelectedMonthState(m);
  };
  
  const [confirmation, setConfirmation] = useState<any | null>(null);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const { data, error } = await supabase
        .from('staff')
        .select('*, branch:branches(name), shift:shifts(*)')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      setStaffList((data || []) as unknown as Staff[]);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load staff list.');
    } finally {
      setLoading(false);
    }
  };

  const fetchConfirmation = async () => {
    try {
      const { data, error } = await supabase
        .from('salary_confirmations')
        .select('*')
        .eq('staff_id', selectedStaffId)
        .eq('month', selectedMonth)
        .maybeSingle();
      
      if (error) throw error;
      setConfirmation(data || null);
    } catch (err) {
      console.error(err);
    }
  };

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

  const staff = staffList.find((s) => s.id === selectedStaffId);

  let calendarDays = 30;
  let dailyRate = 0;
  let maxPaidDays = 34;

  if (staff && confirmation) {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);
    calendarDays = new Date(year, monthNum, 0).getDate();
    dailyRate = confirmation.base_salary / calendarDays;
    const offDays = staff.off_days_per_month || 4;
    maxPaidDays = calendarDays + offDays;
  }

  const handleWhatsApp = () => {
    if (!staff || !confirmation) return;
    const msg = `*SALARY SLIP - ${formatMonthDisplay(selectedMonth).toUpperCase()}*\n\n` +
      `*Name:* ${staff.name}\n` +
      `*Department:* ${staff.department}\n` +
      `*Branch:* ${staff.branch?.name || staff.branch_id}\n\n` +
      `*Calendar Days:* ${calendarDays} days\n` +
      `*Daily Rate:* ${formatCurrency(dailyRate)}/day\n` +
      `*Paid Days:* ${confirmation.paid_days} / ${maxPaidDays} max\n\n` +
      `*Base Salary:* ${formatCurrency(confirmation.base_salary)}\n` +
      `*OT Pay:* +${formatCurrency(confirmation.ot_pay)}\n` +
      `*Leave Deduction:* -${formatCurrency(confirmation.leave_deduction)}\n` +
      (confirmation.early_leave_deduction ? `*Early Leave Deduction:* -${formatCurrency(confirmation.early_leave_deduction)}\n` : '') +
      `*Late Fines:* -${formatCurrency(confirmation.confirmed_fines || 0)}\n` +
      `*Special Fines:* -${formatCurrency(confirmation.confirmed_special_fines || 0)}\n` +
      `----------------------------------------\n` +
      `*NET PAYABLE:* ${formatCurrency(confirmation.net_salary)}\n\n` +
      `Generated via Nearbi Staff Portal.`;
    
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-[48px] w-full" />
        <div className="skeleton h-[90px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 select-none">
      {/* Selection controls (Hidden when printing) */}
      <div className="print:hidden space-y-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
            Select Staff Member
          </label>
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
          >
            <option value="" className="bg-white text-[#1A1A1A]">Choose staff...</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id} className="bg-white text-[#1A1A1A]">
                {s.name} ({s.branch?.name || s.branch_id})
              </option>
            ))}
          </select>
        </div>

        {!propMonth && (
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Select Month
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
        )}
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchStaff} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Alert when Salary is Not Confirmed */}
      {selectedStaffId && !confirmation && (
        <div className="bg-[var(--warning-bg)] border border-[var(--warning)]/20 rounded-[14px] p-6 text-center print:hidden flex flex-col items-center shadow-sm">
          <AlertTriangle size={32} strokeWidth={1.5} className="mb-2 text-[var(--warning)]" />
          <h3 className="text-sm font-bold text-[var(--warning)]">Salary Not Confirmed</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            The salary slip for {formatMonthDisplay(selectedMonth)} hasn't been confirmed yet.
          </p>
        </div>
      )}

      {/* Payslip preview box */}
      {selectedStaffId && confirmation && staff && (
        <div className="space-y-4">
          {/* Actions Bar (Hidden on Print) */}
          <div className="grid grid-cols-2 gap-3 print:hidden">
            <button
              onClick={() => window.print()}
              className="min-h-[42px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 active:scale-[0.97] transition-all shadow cursor-pointer"
            >
              <FileText size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              <span>Print Slip</span>
            </button>
            <button
              onClick={handleWhatsApp}
              className="min-h-[42px] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] hover:bg-[var(--success-bg)]/80 font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 active:scale-[0.97] transition-all shadow cursor-pointer"
            >
              <Share2 size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              <span>WhatsApp</span>
            </button>
          </div>

          {/* Actual Payslip Card layout */}
          <div className="bg-white border border-[#E8E8E8] p-6 rounded-[14px] shadow-sm max-w-sm mx-auto print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
            {/* Header branding */}
            <div className="text-center border-b border-[#E8E8E8] print:border-gray-200 pb-4 mb-4">
              <div className="font-[900] text-2xl tracking-tight flex justify-center items-center mb-0.5 leading-none">
                <span className="text-[#1A1A1A] print:text-black">near</span>
                <span className="text-[#1A1A1A]/60 print:text-[#F5A800]">bi</span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] print:text-gray-500 font-bold uppercase tracking-widest mt-1">
                Payslip — {formatMonthDisplay(selectedMonth)}
              </p>
            </div>

            {/* Employee Metadata */}
            <div className="space-y-2 text-xs font-semibold text-[#555555] print:text-gray-500 border-b border-[#E8E8E8] print:border-gray-200 pb-4 mb-4">
              <div className="flex justify-between">
                <span>Name:</span>
                <span className="text-[#1A1A1A] print:text-black font-bold">{staff.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Department:</span>
                <span className="text-[#1A1A1A] print:text-black">{staff.department}</span>
              </div>
              <div className="flex justify-between">
                <span>Branch:</span>
                <span className="text-[#1A1A1A] print:text-black capitalize">{staff.branch?.name || staff.branch_id}</span>
              </div>
              {staff.shift && (
                <div className="flex justify-between">
                  <span>Shift Hour profile:</span>
                  <span className="text-[#1A1A1A] print:text-black">{staff.shift.label} ({staff.shift.hours}h)</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Joining Date:</span>
                <span className="text-[#1A1A1A] print:text-black">{new Date(staff.join_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-2 text-xs text-[#555555] print:text-gray-700 border-b border-dashed border-[#E8E8E8] print:border-gray-200 pb-4 mb-4">
              <div className="flex justify-between items-center bg-[#F8F8F8] print:bg-gray-50 p-2 rounded-xl mb-1">
                <span className="font-bold text-[#1A1A1A] print:text-black">Base Salary:</span>
                <span className="font-bold text-[#1A1A1A] print:text-black">{formatCurrency(confirmation.base_salary)}</span>
              </div>
              <div className="flex justify-between px-1">
                <span>Calendar days in month:</span>
                <span className="text-[#1A1A1A] print:text-black font-bold">{calendarDays} days</span>
              </div>
              <div className="flex justify-between px-1">
                <span>Daily rate:</span>
                <span className="text-[#1A1A1A] print:text-black font-bold">{formatCurrency(dailyRate)}/day</span>
              </div>
              <div className="flex justify-between px-1">
                <span>Paid days:</span>
                <span className="text-[#1A1A1A] print:text-black font-bold">{confirmation.paid_days} / {maxPaidDays} max</span>
              </div>

              {/* Additions heading */}
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] print:text-gray-400 mt-2.5 px-1 border-t border-[#E8E8E8] pt-2">
                Additions
              </div>
              <div className="flex justify-between px-1">
                <span>OT Earnings ({(confirmation.ot_minutes / 60).toFixed(1)}h):</span>
                <span className="text-[var(--success)] print:text-green-700 font-bold">+{formatCurrency(confirmation.ot_pay)}</span>
              </div>
              {(confirmation.early_in_pay || 0) > 0 && (
                <div className="flex justify-between px-1">
                  <span>Early Check-in Pay:</span>
                  <span className="text-[var(--success)] print:text-green-700 font-bold">+{formatCurrency(confirmation.early_in_pay)}</span>
                </div>
              )}

              {/* Deductions heading */}
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] print:text-gray-400 mt-2.5 px-1 border-t border-[#E8E8E8] pt-2">
                Deductions
              </div>
              <div className="flex justify-between px-1">
                <span>Missing Days ({calendarDays - confirmation.paid_days > 0 ? calendarDays - confirmation.paid_days : 0}d):</span>
                <span className="text-[var(--danger)] print:text-red-700 font-bold">-{formatCurrency(confirmation.leave_deduction)}</span>
              </div>
              {(confirmation.early_leave_deduction || 0) > 0 && (
                <div className="flex justify-between px-1">
                  <span>Early Leave:</span>
                  <span className="text-[var(--danger)] print:text-red-700 font-bold">-{formatCurrency(confirmation.early_leave_deduction)}</span>
                </div>
              )}
              <div className="flex justify-between px-1">
                <span>Late Fines:</span>
                <span className="text-[var(--danger)] print:text-red-700 font-bold">-{formatCurrency(confirmation.confirmed_fines || 0)}</span>
              </div>
              <div className="flex justify-between px-1">
                <span>Special Fines:</span>
                <span className="text-[var(--danger)] print:text-red-700 font-bold">-{formatCurrency(confirmation.confirmed_special_fines || 0)}</span>
              </div>
            </div>

            {/* Grand net totals */}
            <div className="flex justify-between items-end mb-6 px-1">
              <div>
                <div className="text-[10px] text-[var(--text-muted)] print:text-gray-500 font-bold uppercase tracking-wider leading-none">
                  Net Salary Payable
                </div>
                <div className="text-[9px] text-[var(--text-muted)] print:text-gray-400 font-semibold mt-0.5">
                  Calculated based on actual calendar days
                </div>
              </div>
              <span className="text-3xl font-extrabold text-[#1A1A1A] print:text-black leading-none">
                {formatCurrency(confirmation.net_salary)}
              </span>
            </div>

            {/* Bottom stamp */}
            <div className="text-center text-[9px] text-[var(--text-muted)] print:text-gray-400 font-bold uppercase tracking-wider pt-2">
              <div>Generated via Nearbi Crew System</div>
              <div className="mt-0.5">{new Date().toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Staff, SalaryConfirmation, SalaryPayment } from './types';
import { formatCurrency, getCurrentMonthStr, formatMonthDisplay } from './utils';
import { Check, X } from 'lucide-react';

export default function PaymentTrackerTab({ selectedMonth }: { selectedMonth?: string }) {
  const { user, userBranch } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const month = selectedMonth || getCurrentMonthStr();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [confirmations, setConfirmations] = useState<SalaryConfirmation[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);

  // Payment Bottom Sheet State
  const [selectedConf, setSelectedConf] = useState<SalaryConfirmation | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<'cash' | 'upi'>('upi');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      
      let query = supabase
        .from('staff')
        .select('*, branch:branches(name)')
        .eq('active', true)
        .eq('is_resigned', false)
        .eq('is_trial', false);

      if (user?.role === 'nearbi_homes_supervisor') {
        query = query.eq('branch_id', 'hypermarket').eq('department', 'Nearbi Homes');
      } else if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }

      const { data: staffData, error: staffError } = await query;
      
      if (staffError) throw staffError;

      const { data: confData, error: confError } = await supabase
        .from('salary_confirmations')
        .select('*')
        .eq('month', month);
      
      if (confError) throw confError;

      const { data: payData, error: payError } = await supabase
        .from('salary_payments')
        .select('*')
        .eq('month', month);
      
      if (payError) throw payError;

      setStaffList((staffData || []) as unknown as Staff[]);
      setConfirmations(confData || []);
      setPayments(payData || []);

    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load payments data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month, user, userBranch]);

  const handleOpenPayment = (s: Staff, conf: SalaryConfirmation | null) => {
    if (user?.role === 'partner_viewer' || user?.role === 'nearbi_homes_supervisor') return;
    setSelectedStaff(s);
    setSelectedConf(conf);
    setPayAmount(conf ? String(conf.net_salary) : String(s.monthly_salary || 0));
    setPayMode('upi');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNotes('');
  };

  const handleConfirmPayment = async () => {
    if (user?.role === 'partner_viewer' || user?.role === 'nearbi_homes_supervisor') return;
    if (!user || !selectedStaff) return;
    setSubmitting(true);
    try {
      const pKey = 'pay_' + Math.random().toString(36).substr(2, 9);
      
      const paymentRecord: any = {
        id: pKey,
        staff_id: selectedStaff.id,
        month: month,
        amount_paid: Number(payAmount),
        payment_mode: payMode,
        paid_at: new Date(payDate).toISOString(),
        paid_by: user.email || 'Admin',
      };

      // Only add branch_id if it exists
      if (selectedStaff.branch_id) {
        paymentRecord.branch_id = selectedStaff.branch_id;
      }

      // Add notes if provided
      if (payNotes?.trim()) {
        paymentRecord.notes = payNotes.trim();
      }

      const { error } = await supabase.from('salary_payments').insert(paymentRecord);

      if (error) {
        console.error('Payment insert error:', error);
        throw error;
      }

      // Insert wall event
      try {
        await supabase.from('wall_events').insert({
          event_type: 'salary_paid',
          staff_id: selectedStaff.id,
          staff_name: selectedStaff.name,
          branch_id: selectedStaff.branch_id,
          description: `Salary ₹${Number(payAmount).toLocaleString('en-IN')} paid to ${selectedStaff.name} via ${payMode.toUpperCase()}`,
        });
      } catch (wallErr) {
        console.error('Wall event error:', wallErr);
        // Don't block payment for wall error
      }
      
      showToast('Payment recorded successfully ✓');
      setSelectedStaff(null);
      setSelectedConf(null);
      setPayAmount('');
      setPayNotes('');
      await fetchData();
    } catch (err: any) {
      console.error('Record payment error:', err);
      if (err?.message?.includes('violates')) {
        showToast('Database error. Check Supabase logs.');
      } else if (err?.message?.includes('null')) {
        showToast('Missing required field. Check amount and mode.');
      } else {
        showToast('Failed to record payment. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-[90px] w-full" />
        <div className="skeleton h-[110px] w-full" />
      </div>
    );
  }

  const totalConfirmed = confirmations.reduce((sum, c) => sum + c.net_salary, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount_paid, 0);
  const pendingAmount = Math.max(0, totalConfirmed - totalPaid);

  const pendingList = staffList.filter((s) => !payments.find((p) => p.staff_id === s.id));
  const paidList = payments;

  return (
    <div className="space-y-5 select-none pb-6">
      {/* Title */}
      <div className="print:hidden">
        <h2 className="text-[#1A1A1A] text-base font-bold">
          Salary Payments — {formatMonthDisplay(month)}
        </h2>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button onClick={fetchData} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 shadow-sm">
          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">
            Total Confirmed
          </div>
          <div className="text-lg font-bold text-[#1A1A1A]">
            {formatCurrency(totalConfirmed)}
          </div>
        </div>

        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 shadow-sm">
          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">
            Paid ({paidList.length}/{confirmations.length})
          </div>
          <div className="text-lg font-bold text-[var(--success)]">
            {formatCurrency(totalPaid)}
          </div>
        </div>

        <div className="col-span-2 bg-[var(--warning-bg)] border border-[var(--warning)]/20 rounded-[14px] p-4 flex justify-between items-center shadow-sm">
          <span className="text-xs font-bold text-[var(--warning)] uppercase tracking-wider">
            Outstanding Amount
          </span>
          <span className="text-xl font-bold text-[var(--warning)]">
            {formatCurrency(pendingAmount)}
          </span>
        </div>
      </div>

      {/* Pending payments list */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-widest border-b border-[#E8E8E8] pb-2">
          Pending Payment ({pendingList.length})
        </h3>
        
        {pendingList.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] font-semibold italic text-center py-4">
            No pending payouts found.
          </p>
        ) : (
          pendingList.map((s) => {
            const conf = confirmations.find((c) => c.staff_id === s.id);
            const displayAmount = conf ? conf.net_salary : s.monthly_salary;
            return (
              <div
                key={s.id}
                className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex justify-between items-center shadow-sm"
              >
                <div>
                  <h4 className="font-bold text-sm text-[#1A1A1A]">{s.name}</h4>
                  <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                    {s.branch?.name || s.branch_id} • {s.department}
                    {!conf && (
                      <span className="ml-2 text-[8px] bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger)]/20 px-1.5 py-0.5 rounded-[20px] font-bold uppercase">
                        Unconfirmed
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="text-sm font-bold text-[var(--warning)] mb-2">
                    {formatCurrency(displayAmount)}
                  </div>
                  {user?.role === 'partner_viewer' || user?.role === 'nearbi_homes_supervisor' ? (
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider bg-gray-100 border border-gray-200 px-2 py-1 rounded">
                      Unpaid
                    </span>
                  ) : (
                    <button
                      onClick={() => handleOpenPayment(s, conf || null)}
                      className="bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/20 px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-[var(--warning-bg)]/80 cursor-pointer"
                    >
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Paid section history */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-widest border-b border-[#E8E8E8] pb-2 pt-2">
          Payments Completed ({paidList.length})
        </h3>

        {paidList.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] font-semibold italic text-center py-4">
            No payments completed yet.
          </p>
        ) : (
          paidList.map((pay) => {
            const s = staffList.find((x) => x.id === pay.staff_id);
            if (!s) return null;
            return (
              <div
                key={pay.id}
                className="bg-white border border-[var(--success)]/20 rounded-[14px] p-4 flex justify-between items-center shadow-sm opacity-90"
              >
                <div>
                  <h4 className="font-bold text-sm text-[#1A1A1A] flex items-center">
                    {s.name}
                    <span className="ml-2 bg-[#F2F2F2] text-[#555555] border border-[#E8E8E8] text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                      {pay.payment_mode}
                    </span>
                  </h4>
                  <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                    {s.branch?.name || s.branch_id} • Paid {new Date(pay.paid_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="text-sm font-bold text-[var(--success)]">
                    {formatCurrency(pay.amount_paid)}
                  </div>
                  <span className="text-[8px] font-bold text-[var(--success)] uppercase tracking-wider mt-1.5 flex items-center justify-end space-x-0.5">
                    <Check size={10} strokeWidth={1.5} />
                    <span>Paid</span>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Payment Slide-up Drawer Form */}
      {selectedStaff && (
        <div className="fixed inset-0 z-[11000] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setSelectedStaff(null);
              setSelectedConf(null);
            }}
          />
          <div
            className="bg-white rounded-t-3xl shadow-2xl relative z-10 p-5 flex flex-col max-h-[85vh] overflow-y-auto w-full max-w-md mx-auto border-t border-[#E8E8E8]"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 16px))' }}
          >
            {/* Grabber */}
            <div className="w-12 h-1 bg-[#D0D0D0] rounded-full mx-auto mb-4 flex-shrink-0" />

            <div className="flex justify-between items-center mb-5 flex-shrink-0">
              <h3 className="text-sm font-bold text-[#1A1A1A]">Record Payment</h3>
              <button
                onClick={() => {
                  setSelectedStaff(null);
                  setSelectedConf(null);
                }}
                className="text-[var(--text-muted)] hover:text-[#1A1A1A] flex items-center justify-center p-1"
              >
                <X size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              </button>
            </div>

            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Staff Name
                </label>
                <div className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A]">
                  {selectedStaff.name}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Amount to Pay (₹)
                </label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Payment Mode
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPayMode('upi')}
                    className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      payMode === 'upi'
                        ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                        : 'bg-[#F8F8F8] text-[#555555] border border-[#E8E8E8]'
                    }`}
                  >
                    UPI / Transfer
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMode('cash')}
                    className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      payMode === 'cash'
                        ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                        : 'bg-[#F8F8F8] text-[#555555] border border-[#E8E8E8]'
                    }`}
                  >
                    Cash Payment
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Date of Payment
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Paid via HR account"
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={submitting || !payAmount}
                className="w-full min-h-[44px] bg-[#1A1A1A] text-white font-bold text-xs rounded-xl active:scale-95 transition-all mt-4 hover:bg-[#333333] cursor-pointer"
              >
                {submitting ? 'Recording Payout...' : 'Record Payment Confirmation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Alert */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

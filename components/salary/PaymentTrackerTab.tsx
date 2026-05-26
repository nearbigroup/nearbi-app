'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Staff, SalaryConfirmation, SalaryPayment } from './types';
import { formatCurrency, getCurrentMonthStr, formatMonthDisplay } from './utils';
import { Check, X } from 'lucide-react';

export default function PaymentTrackerTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const month = getCurrentMonthStr();

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
      
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*, branch:branches(name)')
        .eq('active', true);
      
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
  }, []);

  const handleOpenPayment = (s: Staff, conf: SalaryConfirmation | null) => {
    setSelectedStaff(s);
    setSelectedConf(conf);
    setPayAmount(conf ? conf.net_salary.toString() : s.monthly_salary.toString());
    setPayMode('upi');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNotes('');
  };

  const handleConfirmPayment = async () => {
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
        <h2 className="text-white text-base font-bold">
          Salary Payments — {formatMonthDisplay(month)}
        </h2>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchData} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 shadow-sm">
          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">
            Total Confirmed
          </div>
          <div className="text-lg font-bold text-white">
            {formatCurrency(totalConfirmed)}
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 shadow-sm">
          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider mb-1">
            Paid ({paidList.length}/{confirmations.length})
          </div>
          <div className="text-lg font-bold text-[#4ADE80]">
            {formatCurrency(totalPaid)}
          </div>
        </div>

        <div className="col-span-2 bg-[var(--warning-bg)] border border-[var(--warning)]/20 rounded-[14px] p-4 flex justify-between items-center animate-pulse">
          <span className="text-xs font-bold text-[#FBBF24] uppercase tracking-wider">
            Outstanding Amount
          </span>
          <span className="text-xl font-bold text-[#FBBF24]">
            {formatCurrency(pendingAmount)}
          </span>
        </div>
      </div>

      {/* Pending payments list */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest border-b border-[var(--border)] pb-2">
          Pending Payment ({pendingList.length})
        </h3>
        
        {pendingList.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] font-bold italic text-center py-4">
            No pending payouts found.
          </p>
        ) : (
          pendingList.map((s) => {
            const conf = confirmations.find((c) => c.staff_id === s.id);
            const displayAmount = conf ? conf.net_salary : s.monthly_salary;
            return (
              <div
                key={s.id}
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 flex justify-between items-center shadow-sm"
              >
                <div>
                  <h4 className="font-bold text-sm text-white">{s.name}</h4>
                  <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                    {s.branch?.name || s.branch_id} • {s.department}
                    {!conf && (
                      <span className="ml-2 text-[8px] bg-red-500/20 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                        Unconfirmed
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="text-sm font-bold text-[#FBBF24] mb-2">
                    {formatCurrency(displayAmount)}
                  </div>
                  <button
                    onClick={() => handleOpenPayment(s, conf || null)}
                    className="bg-[var(--warning-bg)] text-[#FBBF24] border border-[var(--warning)]/20 px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-transform"
                  >
                    Mark Paid
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Paid section history */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest border-b border-[var(--border)] pb-2 pt-2">
          Payments Completed ({paidList.length})
        </h3>

        {paidList.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] font-bold italic text-center py-4">
            No payments completed yet.
          </p>
        ) : (
          paidList.map((pay) => {
            const s = staffList.find((x) => x.id === pay.staff_id);
            if (!s) return null;
            return (
              <div
                key={pay.id}
                className="bg-[var(--bg-surface)] border border-[rgba(74,222,128,0.2)] rounded-[14px] p-4 flex justify-between items-center shadow-sm opacity-90"
              >
                <div>
                  <h4 className="font-bold text-sm text-white flex items-center">
                    {s.name}
                    <span className="ml-2 bg-[rgba(74,222,128,0.12)] text-[#4ADE80] border border-[rgba(74,222,128,0.2)] text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                      {pay.payment_mode}
                    </span>
                  </h4>
                  <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                    {s.branch?.name || s.branch_id} • Paid {new Date(pay.paid_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <div className="text-sm font-bold text-[#4ADE80]">
                    {formatCurrency(pay.amount_paid)}
                  </div>
                  <span className="text-[8px] font-bold text-[#4ADE80] uppercase tracking-wider mt-1.5 flex items-center justify-end space-x-0.5">
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setSelectedStaff(null);
              setSelectedConf(null);
            }}
          />
          <div
            className="bg-[var(--bg-surface)] rounded-t-3xl shadow-2xl relative z-10 p-5 flex flex-col max-h-[85vh] overflow-y-auto w-full max-w-md mx-auto border-t border-[var(--border-strong)]"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 16px))' }}
          >
            {/* Grabber */}
            <div className="w-12 h-1 bg-[var(--border-strong)] rounded-full mx-auto mb-4 flex-shrink-0" />

            <div className="flex justify-between items-center mb-5 flex-shrink-0">
              <h3 className="text-sm font-bold text-white">Record Payment</h3>
              <button
                onClick={() => {
                  setSelectedStaff(null);
                  setSelectedConf(null);
                }}
                className="text-[var(--text-muted)] hover:text-white flex items-center justify-center p-1"
              >
                <X size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              </button>
            </div>

            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Staff Name
                </label>
                <div className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-[10px] p-3 text-xs font-bold text-white">
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
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm font-bold focus:outline-none focus:border-white/40 text-white"
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
                    className={`flex-1 py-2.5 rounded-[10px] border text-xs font-bold transition-all ${
                      payMode === 'upi'
                        ? 'bg-white text-[#1E2028] border-white'
                        : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border)]'
                    }`}
                  >
                    UPI / Transfer
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMode('cash')}
                    className={`flex-1 py-2.5 rounded-[10px] border text-xs font-bold transition-all ${
                      payMode === 'cash'
                        ? 'bg-white text-[#1E2028] border-white'
                        : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border)]'
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
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
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
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-xs focus:outline-none focus:border-white/40 text-white"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={submitting || !payAmount}
                className="w-full min-h-[44px] bg-white text-[#1E2028] font-bold text-xs rounded-[10px] active:scale-95 transition-all mt-4"
              >
                {submitting ? 'Recording Payout...' : 'Record Payment Confirmation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Alert */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)] text-[#4ADE80] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

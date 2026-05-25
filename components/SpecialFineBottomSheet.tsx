'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';
import { X } from 'lucide-react';

interface SpecialFineBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
  branchId: string;
  onSuccess: (msg: string) => void;
}

export default function SpecialFineBottomSheet({
  isOpen,
  onClose,
  staffId,
  staffName,
  branchId,
  onSuccess
}: SpecialFineBottomSheetProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setAmount('');
      setDate(new Date().toISOString().split('T')[0]);
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!reason.trim()) {
      setErrorMsg('Reason is required');
      return;
    }
    if (!amount || Number(amount) < 1) {
      setErrorMsg('Amount must be at least ₹1');
      return;
    }
    if (!date) {
      setErrorMsg('Date is required');
      return;
    }

    setLoading(true);
    try {
      const month = date.substring(0, 7); // YYYY-MM
      
      const { error } = await supabase.from('special_fines').insert({
        staff_id: staffId,
        branch_id: branchId,
        added_by: user?.email || 'System',
        added_by_role: user?.role || 'staff_executive',
        reason: reason.trim(),
        amount: Number(amount),
        date: date,
        month: month,
        waived: false,
        confirmed: false
      });

      if (error) throw error;

      // If added by staff_executive, notify ops_manager
      if (user?.role === 'staff_executive') {
        await createNotification({
          type: 'absent_alert', // Using valid type from CHECK constraint
          title: 'Special Fine Added',
          message: `Special fine ₹${amount} added for ${staffName}.\nReason: ${reason.trim()}`,
          branchId: branchId,
          staffId: staffId,
          targetRole: 'ops_manager'
        });
      }

      // Silent wall event logging
      try {
        await supabase.from('wall_events').insert({
          event_type: 'special_fine_added',
          staff_id: staffId,
          staff_name: staffName,
          branch_id: branchId,
          description: `Special fine ₹${amount} added for ${staffName} — ${reason.trim()}`
        });
      } catch (e) {
        console.error('Silent insert wall event failed:', e);
      }

      onSuccess('Fine added successfully');
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to submit fine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[11000] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="bg-[var(--bg-surface)] rounded-t-3xl shadow-2xl relative z-10 p-5 flex flex-col max-h-[85vh] overflow-y-auto w-full max-w-md mx-auto border-t border-[var(--border-strong)]"
        style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 16px))' }}
      >
        {/* Grabber bar */}
        <div className="w-12 h-1 bg-[var(--border-strong)] rounded-full mx-auto mb-4 flex-shrink-0" />

        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Add Special Fine</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white flex items-center justify-center p-1"
          >
            <X size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          </button>
        </div>

        {errorMsg && (
          <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-3 py-2 rounded-md mb-4 flex-shrink-0">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
              Staff Member
            </label>
            <div className="w-full bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-[10px] p-3 text-sm font-bold text-white">
              {staffName}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
              Reason
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason... e.g. uniform violation, misconduct, negligence, damage to property"
              className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white min-h-[80px]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-secondary)] font-bold">₹</span>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] pl-7 pr-3 py-3 text-sm focus:outline-none focus:border-white/40 text-white font-bold"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white font-bold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] bg-[#FBBF24] hover:bg-[#F59E0B] text-[#1E2028] font-bold text-sm rounded-[10px] active:scale-95 transition-all mt-4"
          >
            {loading ? 'Submitting...' : 'Submit Fine'}
          </button>
        </form>
      </div>
    </div>
  );
}

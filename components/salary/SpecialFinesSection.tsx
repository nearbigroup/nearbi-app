'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Edit2, Check, X, ShieldAlert, Trash2 } from 'lucide-react';
import { formatCurrency } from './utils';

interface SpecialFine {
  id: string;
  staff_id: string;
  branch_id: string;
  added_by: string;
  added_by_role: string;
  reason: string;
  amount: number;
  edited_amount: number | null;
  date: string;
  month: string;
  waived: boolean;
  waived_by: string | null;
  confirmed: boolean;
  confirmed_by: string | null;
}

interface SpecialFinesSectionProps {
  staffId: string;
  month: string;
  onFinesChanged: () => void;
}

export default function SpecialFinesSection({
  staffId,
  month,
  onFinesChanged
}: SpecialFinesSectionProps) {
  const { user } = useAuth();
  const [fines, setFines] = useState<SpecialFine[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchFines = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('special_fines')
        .select('*')
        .eq('staff_id', staffId)
        .eq('month', month);

      if (error) throw error;
      setFines(data || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error loading fines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFines();
  }, [staffId, month]);

  const handleEditStart = (fine: SpecialFine) => {
    setEditingId(fine.id);
    setEditVal(String(fine.edited_amount ?? fine.amount));
  };

  const handleEditSave = async (id: string) => {
    const num = Number(editVal);
    if (isNaN(num) || num < 0) {
      alert('Invalid amount');
      return;
    }

    try {
      const { error } = await supabase
        .from('special_fines')
        .update({
          edited_amount: num,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      setEditingId(null);
      await fetchFines();
      onFinesChanged();
    } catch (e) {
      console.error(e);
      alert('Failed to update amount');
    }
  };

  const handleWaive = async (id: string) => {
    try {
      const { error } = await supabase
        .from('special_fines')
        .update({
          waived: true,
          waived_by: user?.email || 'System',
          confirmed: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      await fetchFines();
      onFinesChanged();
    } catch (e) {
      console.error(e);
      alert('Failed to waive fine');
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      const { error } = await supabase
        .from('special_fines')
        .update({
          confirmed: true,
          confirmed_by: user?.email || 'System',
          waived: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      await fetchFines();
      onFinesChanged();
    } catch (e) {
      console.error(e);
      alert('Failed to confirm fine');
    }
  };

  const handleConfirmAll = async () => {
    const pendingIds = fines.filter(f => !f.confirmed && !f.waived).map(f => f.id);
    if (pendingIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('special_fines')
        .update({
          confirmed: true,
          confirmed_by: user?.email || 'System',
          waived: false,
          updated_at: new Date().toISOString()
        })
        .in('id', pendingIds);

      if (error) throw error;
      await fetchFines();
      onFinesChanged();
    } catch (e) {
      console.error(e);
      alert('Failed to confirm all fines');
    }
  };

  const getStatusBadge = (fine: SpecialFine) => {
    if (fine.waived) {
      return (
        <span className="bg-[rgba(107,114,128,0.12)] text-[#9CA3AF] border border-[rgba(107,114,128,0.2)] text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
          Waived
        </span>
      );
    }
    if (fine.confirmed) {
      return (
        <span className="bg-[rgba(74,222,128,0.12)] text-[#4ADE80] border border-[rgba(74,222,128,0.2)] text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
          Confirmed
        </span>
      );
    }
    return (
      <span className="bg-[rgba(251,191,36,0.12)] text-[#FBBF24] border border-[rgba(251,191,36,0.2)] text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
        Pending
      </span>
    );
  };

  const canManage = user?.role === 'admin' || user?.role === 'ops_manager';
  const hasPending = fines.some(f => !f.confirmed && !f.waived);

  if (loading) {
    return <div className="text-xs text-[var(--text-muted)] animate-pulse py-2">Loading special fines...</div>;
  }

  if (fines.length === 0) {
    return (
      <div className="text-[11px] text-[var(--text-muted)] italic py-2 border-t border-[var(--border-strong)] mt-2">
        No special fines logged for this staff member this month.
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--border-strong)] mt-3 pt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1">
          <ShieldAlert size={12} className="text-[#F87171]" />
          <span>Special Fines</span>
        </h4>
        {canManage && hasPending && (
          <button
            onClick={handleConfirmAll}
            className="text-[10px] bg-[#4ADE80]/15 hover:bg-[#4ADE80]/25 text-[#4ADE80] border border-[#4ADE80]/30 font-bold px-2 py-0.5 rounded-[4px] active:scale-95 transition-all"
          >
            Confirm All
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-[var(--border-strong)] text-[var(--text-muted)] font-bold">
              <th className="py-1.5 pr-2">Date</th>
              <th className="py-1.5 px-2">Reason</th>
              <th className="py-1.5 px-2">Added By</th>
              <th className="py-1.5 px-2 text-right">Amount</th>
              <th className="py-1.5 px-2 text-center">Status</th>
              {canManage && <th className="py-1.5 pl-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-strong)]/40">
            {fines.map((f) => {
              const displayAmt = f.edited_amount ?? f.amount;
              const isPending = !f.confirmed && !f.waived;

              return (
                <tr key={f.id} className="text-white hover:bg-white/2 transition-colors">
                  <td className="py-2 pr-2 font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                    {new Date(f.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="py-2 px-2 max-w-[120px] truncate" title={f.reason}>
                    {f.reason}
                  </td>
                  <td className="py-2 px-2 text-[var(--text-muted)] truncate" title={f.added_by}>
                    {f.added_by.split('@')[0]}
                  </td>
                  <td className="py-2 px-2 text-right font-bold whitespace-nowrap">
                    {editingId === f.id ? (
                      <input
                        type="number"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        className="w-12 bg-[var(--bg-input)] border border-[var(--border)] rounded px-1 text-[10px] text-right font-bold focus:outline-none"
                      />
                    ) : (
                      <>
                        {f.edited_amount !== null && (
                          <span className="text-[9px] text-[var(--text-muted)] line-through mr-1">
                            ₹{f.amount}
                          </span>
                        )}
                        ₹{displayAmt}
                      </>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center whitespace-nowrap">
                    {getStatusBadge(f)}
                  </td>
                  {canManage && (
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1">
                        {editingId === f.id ? (
                          <>
                            <button
                              onClick={() => handleEditSave(f.id)}
                              className="p-0.5 bg-[#4ADE80]/15 hover:bg-[#4ADE80]/25 text-[#4ADE80] rounded border border-[#4ADE80]/30"
                              title="Save"
                            >
                              <Check size={10} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-0.5 bg-[#F87171]/15 hover:bg-[#F87171]/25 text-[#F87171] rounded border border-[#F87171]/30"
                              title="Cancel"
                            >
                              <X size={10} />
                            </button>
                          </>
                        ) : isPending ? (
                          <>
                            <button
                              onClick={() => handleEditStart(f)}
                              className="p-0.5 bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] rounded border border-[var(--border-strong)]"
                              title="Edit"
                            >
                              <Edit2 size={10} />
                            </button>
                            <button
                              onClick={() => handleConfirm(f.id)}
                              className="p-0.5 bg-[#4ADE80]/15 hover:bg-[#4ADE80]/25 text-[#4ADE80] rounded border border-[#4ADE80]/30"
                              title="Confirm"
                            >
                              <Check size={10} />
                            </button>
                            <button
                              onClick={() => handleWaive(f.id)}
                              className="p-0.5 bg-[var(--danger-bg)] hover:bg-[#F87171]/25 text-[#F87171] rounded border border-[var(--danger)]"
                              title="Waive"
                            >
                              <X size={10} />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

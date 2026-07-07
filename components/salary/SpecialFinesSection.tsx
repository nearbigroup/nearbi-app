'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createAuditLog } from '@/lib/audit';
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
  waived_amount?: number;
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

  // Fine Waive States
  const [waiveModalOpen, setWaiveModalOpen] = useState(false);
  const [selectedFineForWaive, setSelectedFineForWaive] = useState<any | null>(null);
  const [waivedAmountInput, setWaivedAmountInput] = useState('');
  const [isSavingWaive, setIsSavingWaive] = useState(false);

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
    if (user?.role === 'partner_viewer' || user?.role === 'nearbi_homes_supervisor') return;
    setEditingId(fine.id);
    setEditVal(String(fine.edited_amount ?? fine.amount));
  };

  const handleEditSave = async (id: string) => {
    if (user?.role === 'partner_viewer' || user?.role === 'nearbi_homes_supervisor') return;
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

  const handleSaveWaive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role === 'partner_viewer' || user?.role === 'nearbi_homes_supervisor') return;
    if (!selectedFineForWaive) return;

    const inputVal = Number(waivedAmountInput);
    if (isNaN(inputVal) || inputVal < 0 || inputVal > selectedFineForWaive.originalAmount) {
      alert(`Please enter a valid waived amount between 0 and ${selectedFineForWaive.originalAmount}`);
      return;
    }

    setIsSavingWaive(true);
    try {
      const isFullyWaived = inputVal === selectedFineForWaive.originalAmount;
      const waivedBy = user?.email || 'System';

      const { error } = await supabase
        .from('special_fines')
        .update({
          waived: isFullyWaived,
          waived_amount: inputVal,
          waived_by: waivedBy,
          confirmed: !isFullyWaived,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedFineForWaive.id);

      if (error) throw error;

      await createAuditLog({
        action: 'waive_special_fine',
        table_name: 'special_fines',
        record_id: selectedFineForWaive.id,
        old_value: { amount: selectedFineForWaive.originalAmount, waived: false },
        new_value: { waived_amount: inputVal, waived: isFullyWaived },
        performed_by: user?.email || 'System',
        performed_by_role: 'admin',
        reason: `Waived ₹${inputVal} from special fine of ₹${selectedFineForWaive.originalAmount} (${selectedFineForWaive.reason || 'no reason'})`
      });

      setWaiveModalOpen(false);
      setSelectedFineForWaive(null);
      await fetchFines();
      onFinesChanged();
    } catch (e) {
      console.error(e);
      alert('Failed to save waiver');
    } finally {
      setIsSavingWaive(false);
    }
  };

  const handleConfirm = async (id: string) => {
    if (user?.role === 'partner_viewer' || user?.role === 'nearbi_homes_supervisor') return;
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

      await createAuditLog({
        action: 'confirm_special_fine',
        table_name: 'special_fines',
        record_id: id,
        new_value: { confirmed: true },
        performed_by: user?.email || 'System',
        performed_by_role: 'admin',
        reason: 'Confirmed special fine'
      });

      await fetchFines();
      onFinesChanged();
    } catch (e) {
      console.error(e);
      alert('Failed to confirm fine');
    }
  };

  const handleConfirmAll = async () => {
    if (user?.role === 'partner_viewer' || user?.role === 'nearbi_homes_supervisor') return;
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

      await createAuditLog({
        action: 'bulk_confirm_special_fines',
        table_name: 'special_fines',
        new_value: { confirmed: true, count: pendingIds.length },
        performed_by: user?.email || 'System',
        performed_by_role: 'admin',
        reason: `Bulk confirmed ${pendingIds.length} special fines`
      });

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
        <span className="bg-[#F2F2F2] text-[#9CA3AF] border border-[#E8E8E8] text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
          Waived
        </span>
      );
    }
    if (fine.confirmed) {
      return (
        <span className="bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/20 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
          Confirmed
        </span>
      );
    }
    return (
      <span className="bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/20 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
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
      <div className="text-[11px] text-[var(--text-muted)] italic py-2 border-t border-[#E8E8E8] mt-2">
        No special fines logged for this staff member this month.
      </div>
    );
  }

  return (
    <div className="border-t border-[#E8E8E8] mt-3 pt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider flex items-center space-x-1">
          <ShieldAlert size={12} className="text-[var(--danger)]" />
          <span>Special Fines</span>
        </h4>
        {canManage && hasPending && (
          <button
            onClick={handleConfirmAll}
            className="text-[10px] bg-[var(--success-bg)] hover:bg-[var(--success-bg)]/80 text-[var(--success)] border border-[var(--success)]/20 font-bold px-2 py-0.5 rounded-[4px] active:scale-95 transition-all cursor-pointer"
          >
            Confirm All
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-[#E8E8E8] text-[var(--text-muted)] font-bold">
              <th className="py-1.5 pr-2">Date</th>
              <th className="py-1.5 px-2">Reason</th>
              <th className="py-1.5 px-2">Added By</th>
              <th className="py-1.5 px-2 text-right">Amount</th>
              <th className="py-1.5 px-2 text-center">Status</th>
              {canManage && <th className="py-1.5 pl-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8E8]">
            {fines.map((f) => {
              const displayAmt = f.edited_amount ?? f.amount;
              const isPending = !f.confirmed && !f.waived;

              return (
                <tr key={f.id} className="text-[#1A1A1A] hover:bg-[#F8F8F8] transition-colors">
                  <td className="py-2 pr-2 font-semibold text-[#555555] whitespace-nowrap">
                    {new Date(f.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="py-2 px-2 max-w-[120px] truncate" title={f.reason}>
                    {f.reason}
                  </td>
                  <td className="py-2 px-2 text-[var(--text-muted)] truncate" title={f.added_by}>
                    {f.added_by.split('@')[0]}
                  </td>
                  <td className="py-2 px-2 text-right font-bold whitespace-nowrap text-[10px]">
                    {editingId === f.id ? (
                      <input
                        type="number"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        className="w-12 bg-white border border-[#E8E8E8] rounded px-1.5 py-0.5 text-[10px] text-right font-bold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
                      />
                    ) : (
                      <div className="flex flex-col text-right">
                        <span>Original: ₹{f.edited_amount ?? f.amount}</span>
                        {Number(f.waived_amount || 0) > 0 && (
                          <span className="text-red-500 font-bold">Waived: ₹{f.waived_amount}</span>
                        )}
                        <span className="text-[#2D7A3A] font-extrabold text-[11px]">
                          Deducted: ₹{f.waived ? 0 : Math.max(0, (f.edited_amount ?? f.amount) - Number(f.waived_amount || 0))}
                        </span>
                      </div>
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
                              className="p-1 bg-[var(--success-bg)] hover:bg-[var(--success-bg)]/80 text-[var(--success)] rounded border border-[var(--success)]/20 cursor-pointer"
                              title="Save"
                            >
                              <Check size={10} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)]/80 text-[var(--danger)] rounded border border-[var(--danger)]/20 cursor-pointer"
                              title="Cancel"
                            >
                              <X size={10} />
                            </button>
                          </>
                        ) : isPending ? (
                          <>
                            <button
                              onClick={() => handleEditStart(f)}
                              className="p-1 bg-[#F8F8F8] hover:bg-[#EBEBEB] text-[#555555] rounded border border-[#E8E8E8] cursor-pointer"
                              title="Edit"
                            >
                              <Edit2 size={10} />
                            </button>
                            <button
                              onClick={() => handleConfirm(f.id)}
                              className="p-1 bg-[var(--success-bg)] hover:bg-[var(--success-bg)]/80 text-[var(--success)] rounded border border-[var(--success)]/20 cursor-pointer"
                              title="Confirm"
                            >
                              <Check size={10} />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedFineForWaive({
                                  id: f.id,
                                  date: f.date,
                                  originalAmount: f.edited_amount ?? f.amount,
                                  reason: f.reason
                                });
                                setWaivedAmountInput('');
                                setWaiveModalOpen(true);
                              }}
                              className="p-1 bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)]/80 text-[var(--danger)] rounded border border-[var(--danger)]/20 cursor-pointer"
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
      {/* Waive Fine Bottom Sheet */}
      {waiveModalOpen && selectedFineForWaive && (
        <div className="fixed inset-0 z-[12000] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => { setWaiveModalOpen(false); setSelectedFineForWaive(null); }} />
          <div className="bg-white rounded-t-3xl shadow-2xl relative z-10 p-5 w-full max-w-md border-t border-[#E8E8E8] flex flex-col space-y-4 text-[#1A1A1A] animate-in slide-in-from-bottom duration-250">
            <div className="w-12 h-1 bg-[#E8E8E8] rounded-full mx-auto flex-shrink-0" />
            <div className="flex justify-between items-center pb-1">
              <h3 className="text-[#1A1A1A] text-base font-extrabold">Waive Special Fine</h3>
              <button onClick={() => { setWaiveModalOpen(false); setSelectedFineForWaive(null); }} className="text-gray-400 hover:text-black p-1">
                <X size={18} />
              </button>
            </div>
            
            <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 space-y-2 text-xs font-semibold text-gray-500">
              <div className="flex justify-between">
                <span>Date:</span>
                <span className="text-[#1A1A1A] font-mono">{new Date(selectedFineForWaive.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between">
                <span>Fine Amount:</span>
                <span className="text-[#1A1A1A] font-bold">₹{selectedFineForWaive.originalAmount}</span>
              </div>
              {selectedFineForWaive.reason && (
                <div className="flex flex-col space-y-1 mt-1 border-t border-gray-200/50 pt-1.5">
                  <span>Reason:</span>
                  <span className="text-[#1A1A1A] italic">"{selectedFineForWaive.reason}"</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveWaive} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 tracking-wider mb-1.5">Waived Amount (₹)</label>
                <input
                  type="number"
                  value={waivedAmountInput}
                  onChange={(e) => setWaivedAmountInput(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-black font-bold"
                  required
                />
              </div>

              {/* Deduction Summary display */}
              {(() => {
                const amt = Number(waivedAmountInput) || 0;
                const deducted = Math.max(0, selectedFineForWaive.originalAmount - amt);
                return (
                  <div className="bg-black/5 rounded-xl p-3.5 space-y-2 text-xs font-bold text-gray-500 border border-black/5">
                    <div className="flex justify-between">
                      <span>Original Amount:</span>
                      <span className="text-[#1A1A1A] font-mono">₹{selectedFineForWaive.originalAmount}</span>
                    </div>
                    <div className="flex justify-between text-red-650">
                      <span>Waived Amount:</span>
                      <span className="font-mono">-₹{amt}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#E8E8E8] pt-2.5 text-[#2D7A3A]">
                      <span>Net Deducted Amount:</span>
                      <span className="font-mono text-sm">₹{deducted}</span>
                    </div>
                  </div>
                );
              })()}

              <button 
                type="submit" 
                disabled={isSavingWaive}
                className="w-full min-h-[44px] bg-[#1A1A1A] text-white hover:bg-black font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              >
                {isSavingWaive ? 'Saving...' : 'Save Waiver'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

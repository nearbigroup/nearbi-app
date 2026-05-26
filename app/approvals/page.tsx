'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Check, X, RefreshCw, CheckSquare } from 'lucide-react';

type ApprovalTab = 'ot' | 'early_in' | 'fines';

interface Staff {
  id: string;
  name: string;
  department: string;
  branch_id: string;
  shift: {
    start_time: string;
    end_time: string;
    hours: number;
  };
}

interface Adjustment {
  id: string;
  staff_id: string;
  date: string;
  type: 'ot' | 'early_in';
  minutes: number;
  status: 'pending' | 'approved' | 'rejected';
  staff: Staff;
}

interface LateFine {
  id: string;
  staff_id: string;
  date: string;
  late_minutes: number;
  color_code: string;
  fine_amount: number;
  waived: boolean;
  confirmed: boolean;
  staff: Staff;
}

interface AttendanceRecord {
  id: string;
  check_in_time: string | null;
  check_out_time: string | null;
  actual_hours_worked: number;
}

export default function ApprovalsPage() {
  const { user, userBranch } = useAuth();
  const [activeTab, setActiveTab] = useState<ApprovalTab>('ot');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [fines, setFines] = useState<LateFine[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const fetchApprovals = async () => {
    try {
      // 1. Fetch pending adjustments (OT / Early In)
      let adjQuery = supabase
        .from('attendance_adjustments')
        .select('*, staff!inner(*, shift:shifts(*))')
        .eq('status', 'pending');

      if (userBranch) {
        adjQuery = adjQuery.eq('staff.branch_id', userBranch);
      }

      const { data: adjData, error: adjErr } = await adjQuery;
      if (adjErr) throw adjErr;
      setAdjustments((adjData || []) as unknown as Adjustment[]);

      // 2. Fetch pending fines (waived=false and confirmed=false)
      let fineQuery = supabase
        .from('late_fines')
        .select('*, staff!inner(*)')
        .eq('waived', false)
        .eq('confirmed', false);

      if (userBranch) {
        fineQuery = fineQuery.eq('staff.branch_id', userBranch);
      }

      const { data: fineData, error: fineErr } = await fineQuery;
      if (fineErr) throw fineErr;
      setFines((fineData || []) as unknown as LateFine[]);

      // 3. Fetch corresponding attendance records for adjustments to show details
      if (adjData && adjData.length > 0) {
        const dates = adjData.map((a) => a.date);
        const staffIds = adjData.map((a) => a.staff_id);

        const { data: attData } = await supabase
          .from('attendance')
          .select('id, staff_id, date, check_in_time, check_out_time, actual_hours_worked')
          .in('date', dates)
          .in('staff_id', staffIds);

        if (attData) {
          const map: Record<string, AttendanceRecord> = {};
          attData.forEach((r) => {
            map[`${r.staff_id}_${r.date}`] = r;
          });
          setAttendanceMap(map);
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load pending approvals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchApprovals();

    // Subscribe to updates
    const adjChannel = supabase
      .channel('adjustments-approvals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_adjustments' },
        () => {
          fetchApprovals();
        }
      )
      .subscribe();

    const fineChannel = supabase
      .channel('fines-approvals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'late_fines' },
        () => {
          fetchApprovals();
        }
      )
      .subscribe();

    return () => {
      adjChannel.unsubscribe();
      fineChannel.unsubscribe();
    };
  }, [userBranch]);

  // Adjustments actions handlers
  const handleAdjustmentAction = async (adj: Adjustment, action: 'approved' | 'rejected') => {
    try {
      // 1. Update adjustment row
      const { error: adjErr } = await supabase
        .from('attendance_adjustments')
        .update({
          status: action,
          approved_by: user?.email || 'HR',
          approved_at: new Date().toISOString(),
        })
        .eq('id', adj.id);

      if (adjErr) throw adjErr;

      // 2. If approved, update attendance flag
      if (action === 'approved') {
        const updateField = adj.type === 'ot' ? { ot_approved: true } : { early_in_approved: true };
        await supabase
          .from('attendance')
          .update(updateField)
          .eq('staff_id', adj.staff_id)
          .eq('date', adj.date);
      }

      if (adj.type === 'ot') {
        try {
          await supabase.from('wall_events').insert({
            event_type: action === 'approved' ? 'ot_approved' : 'ot_rejected',
            staff_id: adj.staff_id,
            staff_name: adj.staff?.name,
            branch_id: adj.staff?.branch_id,
            description: `${adj.staff?.name}'s overtime (${adj.minutes} mins) on ${new Date(adj.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} was ${action} by ${user?.email || 'HR'}`
          });
        } catch (e) {
          console.error('Silent insert wall event failed:', e);
        }
      }

      showToast(`${adj.type === 'ot' ? 'Overtime' : 'Early check-in'} ${action}!`);
      fetchApprovals();
    } catch (err) {
      console.error(err);
      showToast('Error processing approval.');
    }
  };

  // Late fines actions handlers
  const handleFineAction = async (fine: LateFine, action: 'waived' | 'confirmed') => {
    try {
      const updateField = action === 'waived' ? { waived: true } : { confirmed: true };
      
      const { error } = await supabase
        .from('late_fines')
        .update(updateField)
        .eq('id', fine.id);

      if (error) throw error;

      try {
        await supabase.from('wall_events').insert({
          event_type: action === 'waived' ? 'fine_waived' : 'fine_confirmed',
          staff_id: fine.staff_id,
          staff_name: fine.staff?.name,
          branch_id: fine.staff?.branch_id,
          description: `Late fine ₹${fine.fine_amount} for ${fine.staff?.name} on ${new Date(fine.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} was ${action} by ${user?.email || 'HR'}`
        });
      } catch (e) {
        console.error('Silent insert wall event failed:', e);
      }

      showToast(`Fine ${action === 'waived' ? 'waived' : 'confirmed'} successfully!`);
      fetchApprovals();
    } catch (err) {
      console.error(err);
      showToast('Error processing fine.');
    }
  };

  const otPending = adjustments.filter((a) => a.type === 'ot');
  const earlyPending = adjustments.filter((a) => a.type === 'early_in');

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Approvals</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">
            Action pending items
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchApprovals();
          }}
          className="min-h-[44px] bg-transparent border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-white hover:border-white p-2.5 rounded-lg text-sm font-bold flex items-center justify-center space-x-1.5"
        >
          <RefreshCw size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchApprovals} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {[
          { id: 'ot', label: 'Overtime', count: otPending.length },
          { id: 'early_in', label: 'Early In', count: earlyPending.length },
          { id: 'fines', label: 'Late Fines', count: fines.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as ApprovalTab)}
            className={`flex-1 text-center py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === tab.id
                ? 'border-white text-white'
                : 'border-transparent text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-white text-[#1E2028]' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* List content */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[110px] w-full" />
          <div className="skeleton h-[110px] w-full" />
        </div>
      ) : (
        <div className="space-y-3.5">
          {activeTab === 'ot' && (
            otPending.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6">
                <CheckSquare size={48} strokeWidth={1} style={{ color: '#2D3140' }} className="mb-2" />
                <h3 className="text-sm font-bold text-white">No pending overtime</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">All overtime claims are approved or processed.</p>
              </div>
            ) : (
              otPending.map((adj) => {
                const att = attendanceMap[`${adj.staff_id}_${adj.date}`];
                const shiftHours = Number(adj.staff?.shift?.hours || 8);
                const actualHours = att ? Number(att.actual_hours_worked || 0) : 0;
                
                return (
                  <div key={adj.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 flex flex-col shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-sm text-white">{adj.staff?.name}</h3>
                        <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">
                          {adj.staff?.department} • <span className="capitalize">{getBranchLabel(adj.staff?.branch_id)}</span>
                        </p>
                      </div>
                      <span className="text-[9px] font-bold text-[#60A5FA] bg-[var(--info-bg)] border border-[var(--info)]/20 px-1.5 py-0.5 rounded">
                        {formatDate(adj.date)}
                      </span>
                    </div>

                    <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-2.5 mb-4 text-xs font-semibold text-[var(--text-secondary)] grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Shift Hrs</div>
                        <div className="text-white font-bold mt-0.5">{shiftHours} hrs</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Actual Hrs</div>
                        <div className="text-white font-bold mt-0.5">{actualHours} hrs</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">OT Claim</div>
                        <div className="text-[#60A5FA] font-bold mt-0.5">{adj.minutes} mins</div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleAdjustmentAction(adj, 'rejected')}
                        className="flex-1 min-h-[38px] bg-transparent border border-[var(--danger)] text-[#F87171] hover:bg-[var(--danger-bg)] text-xs font-bold rounded-lg active:scale-95 transition-transform flex items-center justify-center space-x-1"
                      >
                        <X size={14} strokeWidth={1.5} />
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => handleAdjustmentAction(adj, 'approved')}
                        className="flex-1 min-h-[38px] bg-white text-[#1E2028] hover:bg-gray-200 text-xs font-bold rounded-lg active:scale-95 transition-transform flex items-center justify-center space-x-1"
                      >
                        <Check size={14} strokeWidth={1.5} />
                        <span>Approve</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )
          )}

          {activeTab === 'early_in' && (
            earlyPending.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6">
                <CheckSquare size={48} strokeWidth={1} style={{ color: '#2D3140' }} className="mb-2" />
                <h3 className="text-sm font-bold text-white">No pending early entries</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">All early check-ins are verified or completed.</p>
              </div>
            ) : (
              earlyPending.map((adj) => {
                const att = attendanceMap[`${adj.staff_id}_${adj.date}`];
                const shiftStart = adj.staff?.shift?.start_time || 'None';
                const actualIn = att ? att.check_in_time || 'None' : 'None';

                return (
                  <div key={adj.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 flex flex-col shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-sm text-white">{adj.staff?.name}</h3>
                        <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">
                          {adj.staff?.department} • <span className="capitalize">{getBranchLabel(adj.staff?.branch_id)}</span>
                        </p>
                      </div>
                      <span className="text-[9px] font-bold text-[#60A5FA] bg-[var(--info-bg)] border border-[var(--info)]/20 px-1.5 py-0.5 rounded">
                        {formatDate(adj.date)}
                      </span>
                    </div>

                    <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-2.5 mb-4 text-xs font-semibold text-[var(--text-secondary)] grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Shift Start</div>
                        <div className="text-white font-bold mt-0.5">{shiftStart}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Actual IN</div>
                        <div className="text-white font-bold mt-0.5">{actualIn}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Early By</div>
                        <div className="text-[#4ADE80] font-bold mt-0.5">{adj.minutes} mins</div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleAdjustmentAction(adj, 'rejected')}
                        className="flex-1 min-h-[38px] bg-transparent border border-[var(--danger)] text-[#F87171] hover:bg-[var(--danger-bg)] text-xs font-bold rounded-lg active:scale-95 transition-transform flex items-center justify-center space-x-1"
                      >
                        <X size={14} strokeWidth={1.5} />
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => handleAdjustmentAction(adj, 'approved')}
                        className="flex-1 min-h-[38px] bg-white text-[#1E2028] hover:bg-gray-200 text-xs font-bold rounded-lg active:scale-95 transition-transform flex items-center justify-center space-x-1"
                      >
                        <Check size={14} strokeWidth={1.5} />
                        <span>Approve</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )
          )}

          {activeTab === 'fines' && (
            fines.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6">
                <CheckSquare size={48} strokeWidth={1} style={{ color: '#2D3140' }} className="mb-2" />
                <h3 className="text-sm font-bold text-white">No pending fines</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">All daily late arrival fines are reviewed.</p>
              </div>
            ) : (
              fines.map((fine) => (
                <div key={fine.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 flex flex-col shadow-sm">
                  <div className="flex items-start justify-between mb-3.5">
                    <div>
                      <h3 className="font-bold text-sm text-white">{fine.staff?.name}</h3>
                      <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">
                        {fine.staff?.department} • <span className="capitalize">{getBranchLabel(fine.staff?.branch_id)}</span>
                      </p>
                    </div>
                    <span className="text-[9px] font-bold text-[#FBBF24] bg-[var(--warning-bg)] border border-[var(--warning)]/20 px-1.5 py-0.5 rounded">
                      {formatDate(fine.date)}
                    </span>
                  </div>

                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3 text-xs mb-4">
                    <div className="flex justify-between font-bold text-[var(--text-secondary)] mb-1">
                      <span>Late Minutes:</span>
                      <span className="text-[#FBBF24]">{fine.late_minutes} mins</span>
                    </div>
                    <div className="flex justify-between font-bold text-[var(--text-secondary)]">
                      <span>Fine Amount:</span>
                      <span className="text-[#F87171] text-sm">₹{fine.fine_amount}</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleFineAction(fine, 'waived')}
                      className="flex-1 min-h-[38px] bg-transparent border border-[var(--warning)] text-[#FBBF24] hover:bg-[var(--warning-bg)] text-xs font-bold rounded-lg active:scale-95 transition-transform flex items-center justify-center space-x-1"
                    >
                      <X size={14} strokeWidth={1.5} />
                      <span>Waive Fine</span>
                    </button>
                    <button
                      onClick={() => handleFineAction(fine, 'confirmed')}
                      className="flex-1 min-h-[38px] bg-[rgba(74,222,128,0.15)] border border-[rgba(74,222,128,0.3)] text-[#4ADE80] hover:bg-[rgba(74,222,128,0.25)] text-xs font-bold rounded-lg active:scale-95 transition-transform flex items-center justify-center space-x-1"
                    >
                      <Check size={14} strokeWidth={1.5} />
                      <span>Confirm Fine</span>
                    </button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      )}

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)] text-[#4ADE80] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

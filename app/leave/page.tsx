'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { RefreshCw, Calendar, Check, X } from 'lucide-react';

type TabType = 'pending' | 'approved' | 'rejected';

interface Staff {
  id: string;
  name: string;
  department: string;
  branch_id: string;
}

interface LeaveRequest {
  id: string;
  staff_id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  approved_by: string | null;
  staff: Staff;
}

export default function LeavePage() {
  const { user, userBranch } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchRequests = async () => {
    try {
      let query = supabase.from('leave_requests').select('*, staff:staff_id!inner(*)');
      
      // Branch isolation for branch HR
      if (userBranch) {
        query = query.eq('staff.branch_id', userBranch);
      }
      
      const { data, error } = await query.order('requested_at', { ascending: false });
      if (error) throw error;
      setRequests((data || []) as unknown as LeaveRequest[]);
    } catch (err) {
      console.error(err);
      setErrorMsg('Could not load leave requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchRequests();

    // Subscribe to leave requests updates
    const channel = supabase
      .channel('leave-requests-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests' },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userBranch]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    const approverName = user?.name || user?.email || 'HR';
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status,
          approved_by: approverName,
        })
        .eq('id', id);

      if (error) throw error;

      showToast(`Leave request ${status}!`);
      fetchRequests();
    } catch (err) {
      console.error(err);
      showToast('Error processing leave request.');
    }
  };

  // Group by status
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const approvedRequests = requests.filter((r) => r.status === 'approved');
  const rejectedRequests = requests.filter((r) => r.status === 'rejected');

  const visibleData =
    activeTab === 'pending'
      ? pendingRequests
      : activeTab === 'approved'
      ? approvedRequests
      : rejectedRequests;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getTimeAgo = (dateStr: string) => {
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${days}d ago`;
  };

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Leave Requests</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">
            {pendingRequests.length} pending review
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchRequests();
          }}
          className="min-h-[40px] bg-transparent border border-[var(--border-strong)] active:border-white text-[var(--text-secondary)] px-3 rounded-[10px] text-xs font-bold flex items-center justify-center space-x-1.5 transition-all active:scale-[0.97]"
        >
          <RefreshCw size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchRequests} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {[
          { id: 'pending', label: 'Pending', count: pendingRequests.length },
          { id: 'approved', label: 'Approved', count: approvedRequests.length },
          { id: 'rejected', label: 'Rejected', count: rejectedRequests.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex-1 text-center py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === tab.id
                ? 'border-white text-white'
                : 'border-transparent text-[var(--text-secondary)]'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id
                  ? 'bg-white text-[#1E2028]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-strong)]'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[110px] w-full" />
          <div className="skeleton h-[110px] w-full" />
        </div>
      ) : visibleData.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6">
          <Calendar size={48} strokeWidth={1} style={{ color: '#2A2D38' }} className="mb-2" />
          <h3 className="text-sm font-bold text-white">No requests found</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            No leave requests match the selected "{activeTab}" filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleData.map((r) => (
            <div
              key={r.id}
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 flex flex-col relative shadow-sm"
            >
              {/* Header profile info */}
              <div className="flex items-start justify-between mb-3.5">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 text-white border border-white/20 font-bold text-base flex items-center justify-center flex-shrink-0">
                    {r.staff?.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white leading-none">
                      {r.staff?.name}
                    </h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                      {r.staff?.department} • <span className="capitalize">{getBranchLabel(r.staff?.branch_id)}</span>
                    </p>
                  </div>
                </div>

                <span className="text-[9px] font-bold text-[var(--text-secondary)] tracking-wider uppercase bg-[var(--bg-elevated)] border border-[var(--border-strong)] px-1.5 py-0.5 rounded">
                  {getTimeAgo(r.requested_at)}
                </span>
              </div>

              {/* Leave details */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-3 text-xs mb-4">
                <div className="font-bold text-white mb-1.5 flex items-center">
                  <Calendar size={14} strokeWidth={1.5} className="mr-1.5 text-[var(--text-muted)]" />
                  <span>Date of Leave: {formatDate(r.date)}</span>
                </div>
                <div className="text-[var(--text-secondary)] font-medium">
                  <span className="text-[var(--text-muted)] font-bold">Reason:</span> "{r.reason || 'None provided'}"
                </div>
              </div>

              {/* Actions row */}
              {activeTab === 'pending' ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction(r.id, 'rejected')}
                    className="flex-1 min-h-[38px] bg-[rgba(248,113,113,0.15)] border border-[rgba(248,113,113,0.3)] text-[#F87171] hover:bg-[rgba(248,113,113,0.25)] text-xs font-bold rounded-[10px] active:scale-95 transition-all flex items-center justify-center space-x-1"
                  >
                    <X size={14} strokeWidth={1.5} />
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => handleAction(r.id, 'approved')}
                    className="flex-1 min-h-[38px] bg-white text-[#1E2028] font-bold text-xs rounded-[10px] active:scale-95 transition-transform flex items-center justify-center space-x-1"
                  >
                    <Check size={14} strokeWidth={1.5} />
                    <span>Approve</span>
                  </button>
                </div>
              ) : (
                <div
                  className={`text-xs font-bold p-2.5 rounded-[10px] border flex items-center justify-center space-x-1.5 ${
                    r.status === 'approved'
                      ? 'bg-[rgba(74,222,128,0.12)] text-[#4ADE80] border border-[rgba(74,222,128,0.2)]'
                      : 'bg-[rgba(248,113,113,0.12)] text-[#F87171] border border-[rgba(248,113,113,0.2)]'
                  }`}
                >
                  {r.status === 'approved' ? <Check size={14} strokeWidth={1.5} /> : <X size={14} strokeWidth={1.5} />}
                  <span>
                    {r.status === 'approved'
                      ? `Approved by ${r.approved_by || 'HR'}`
                      : 'Rejected'}
                  </span>
                </div>
              )}
            </div>
          ))}
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

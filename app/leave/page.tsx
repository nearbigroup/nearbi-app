'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createAuditLog } from '@/lib/audit';
import { RefreshCw, Calendar, Check, X } from 'lucide-react';

type TabType = 'pending' | 'approved' | 'rejected';

interface Staff {
  id: string;
  name: string;
  department: string;
  branch_id: string;
  monthly_salary: number;
  off_days_per_month: number;
}

interface LeaveRequest {
  id: string;
  staff_id: string;
  date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  approved_by: string | null;
  is_quota_leave?: boolean;
  staff: Staff;
}

export default function LeavePage() {
  const { user, userBranch } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [quotaWarning, setQuotaWarning] = useState<{
    id: string;
    staffId: string;
    staffName: string;
    earnedQuota: number;
    deductionAmount: number;
  } | null>(null);

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

      const req = requests.find((r) => r.id === id);
      if (req) {
        try {
          await supabase.from('wall_events').insert({
            event_type: status === 'approved' ? 'leave_approved' : 'leave_rejected',
            staff_id: req.staff_id,
            staff_name: req.staff?.name,
            branch_id: req.staff?.branch_id,
            description: `${req.staff?.name}'s leave request for ${new Date(req.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} was ${status} by ${approverName}`
          });
        } catch (e) {
          console.error('Silent insert wall event failed:', e);
        }

        await createAuditLog({
          action: status === 'approved' ? 'approve_leave' : 'reject_leave',
          table_name: 'leave_requests',
          record_id: id,
          new_value: { status, approved_by: approverName },
          performed_by: user?.email || 'admin',
          performed_by_role: user?.role || 'admin',
          reason: status === 'approved' ? 'Approved leave request' : 'Rejected leave request'
        });
      }

      showToast(`Leave request ${status}!`);
      fetchRequests();
    } catch (err) {
      console.error(err);
      showToast('Error processing leave request.');
    }
  };

  const checkLeaveQuota = async (staffId: string) => {
    // Get staff off_days_per_month
    const { data: staffData } = await supabase
      .from('staff')
      .select('off_days_per_month')
      .eq('id', staffId)
      .single();

    // Count days worked this month
    const firstDay = new Date();
    firstDay.setDate(1);
    const { data: attData } = await supabase
      .from('attendance')
      .select('date')
      .eq('staff_id', staffId)
      .not('check_in_time', 'is', null)
      .gte('date', firstDay.toISOString().split('T')[0]);

    const daysWorked = attData?.length || 0;
    const offDays = staffData?.off_days_per_month || 0;

    // Calculate earned quota
    let earnedQuota = 0;
    if (offDays === 4) earnedQuota = Math.floor(daysWorked / 6);
    if (offDays === 2) earnedQuota = Math.floor(daysWorked / 12);
    earnedQuota = Math.min(earnedQuota, offDays);

    // Count already approved leaves this month
    const { data: approvedLeaves } = await supabase
      .from('leave_requests')
      .select('id')
      .eq('staff_id', staffId)
      .eq('status', 'approved')
      .gte('date', firstDay.toISOString().split('T')[0]);

    const usedLeaves = approvedLeaves?.length || 0;
    const remaining = earnedQuota - usedLeaves;

    return { earnedQuota, usedLeaves, remaining };
  };

  const handleApproveClick = async (req: LeaveRequest) => {
    try {
      setLoading(true);
      const { earnedQuota, remaining } = await checkLeaveQuota(req.staff_id);
      setLoading(false);

      if (remaining > 0) {
        // Approve within quota
        await executeApproval(req.id, true);
      } else {
        // Show warning modal
        const monthlySalary = req.staff.monthly_salary || 0;
        const dailyRate = Math.round(monthlySalary / 30);
        setQuotaWarning({
          id: req.id,
          staffId: req.staff_id,
          staffName: req.staff.name,
          earnedQuota,
          deductionAmount: dailyRate,
        });
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
      showToast('Error checking leave quota.');
    }
  };

  const executeApproval = async (id: string, isWithinQuota: boolean) => {
    const approverName = isWithinQuota ? 'system_auto' : (user?.email || 'Admin');
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'approved',
          approved_by: approverName,
          is_quota_leave: isWithinQuota,
        })
        .eq('id', id);

      if (error) throw error;

      const req = requests.find((r) => r.id === id);
      if (req) {
        try {
          await supabase.from('wall_events').insert({
            event_type: 'leave_approved',
            staff_id: req.staff_id,
            staff_name: req.staff?.name,
            branch_id: req.staff?.branch_id,
            description: `${req.staff?.name}'s leave request for ${new Date(req.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} was approved by ${approverName}`
          });
        } catch (e) {
          console.error('Silent insert wall event failed:', e);
        }

        await createAuditLog({
          action: 'approve_leave',
          table_name: 'leave_requests',
          record_id: id,
          new_value: { status: 'approved', approved_by: approverName, is_quota_leave: isWithinQuota },
          performed_by: user?.email || 'admin',
          performed_by_role: user?.role || 'admin',
          reason: isWithinQuota ? 'Approved (within quota)' : 'Approved (salary deduction impact)'
        });
      }

      showToast('Leave request approved!');
      setQuotaWarning(null);
      fetchRequests();
    } catch (err) {
      console.error(err);
      showToast('Error approving leave request.');
    }
  };

  // Group by status
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const approvedRequests = requests.filter((r) => r.status === 'approved');
  const rejectedRequests = requests.filter((r) => r.status === 'rejected');

  const visibleData = (
    activeTab === 'pending'
      ? pendingRequests
      : activeTab === 'approved'
      ? approvedRequests
      : rejectedRequests
  ).filter((r) => {
    if (searchQuery.trim()) {
      return r.staff?.name?.toLowerCase().includes(searchQuery.toLowerCase().trim());
    }
    return true;
  });

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
          <h1 className="text-[#1A1A1A] text-2xl font-bold">Leave Requests</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">
            {pendingRequests.length} pending review
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchRequests();
          }}
          className="min-h-[40px] bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-[0.98] text-[#1A1A1A] px-3.5 rounded-[12px] text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer"
        >
          <RefreshCw size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button onClick={fetchRequests} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Search Input Box */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search staff by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white border border-[#E8E8E8] rounded-xl p-3 pl-10 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-medium shadow-sm"
        />
        <svg
          className="absolute left-3.5 top-3.5 h-4 w-4 text-[#999999]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E8E8E8]">
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
                ? 'border-[#1A1A1A] text-[#1A1A1A]'
                : 'border-transparent text-[#555555]'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-[#F2F2F2] text-[#555555] border border-[#E8E8E8]'
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
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6 shadow-sm">
          <Calendar size={48} strokeWidth={1} style={{ color: '#999999' }} className="mb-2" />
          <h3 className="text-sm font-bold text-[#1A1A1A]">No requests found</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            No leave requests match the selected "{activeTab}" filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleData.map((r) => (
            <div
              key={r.id}
              className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col relative shadow-sm"
            >
              {/* Header profile info */}
              <div className="flex items-start justify-between mb-3.5">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-[#1A1A1A] text-white font-bold text-base flex items-center justify-center flex-shrink-0">
                    {r.staff?.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#1A1A1A] leading-none">
                      {r.staff?.name}
                    </h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-1">
                      {r.staff?.department} • <span className="capitalize">{getBranchLabel(r.staff?.branch_id)}</span>
                    </p>
                  </div>
                </div>

                <span className="text-[9px] font-bold text-[#555555] tracking-wider uppercase bg-[#F2F2F2] border border-[#E8E8E8] px-2 py-0.5 rounded-[20px]">
                  {getTimeAgo(r.requested_at)}
                </span>
              </div>

              {/* Leave details */}
              <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 text-xs mb-4">
                <div className="font-bold text-[#1A1A1A] mb-1.5 flex items-center">
                  <Calendar size={14} strokeWidth={1.5} className="mr-1.5 text-[var(--text-muted)]" />
                  <span>Date of Leave: {formatDate(r.date)}</span>
                </div>
                <div className="text-[#555555] font-medium">
                  <span className="text-[var(--text-muted)] font-bold">Reason:</span> "{r.reason || 'None provided'}"
                </div>
              </div>

              {/* Actions row */}
              {activeTab === 'pending' ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction(r.id, 'rejected')}
                    className="flex-1 min-h-[40px] bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-[var(--danger)] hover:bg-[var(--danger-bg)]/80 text-xs font-bold rounded-[12px] active:scale-95 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <X size={14} strokeWidth={1.5} />
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => handleApproveClick(r)}
                    className="flex-1 min-h-[40px] bg-[#1A1A1A] text-white font-bold text-xs rounded-[12px] hover:bg-[#333333] active:scale-95 transition-transform flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <Check size={14} strokeWidth={1.5} />
                    <span>Approve</span>
                  </button>
                </div>
              ) : (
                <div
                  className={`text-xs font-bold p-3 rounded-[12px] border flex flex-col items-center justify-center space-y-1.5 ${
                    r.status === 'approved'
                      ? 'bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/20'
                      : 'bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger)]/20'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    {r.status === 'approved' ? <Check size={14} strokeWidth={1.5} /> : <X size={14} strokeWidth={1.5} />}
                    <span>
                      {r.status === 'approved'
                        ? `Approved by ${r.approved_by || 'HR'}`
                        : 'Rejected'}
                    </span>
                  </div>
                  
                  {r.status === 'approved' && (
                    <div className="mt-1">
                      {r.is_quota_leave ? (
                        <span className="text-[10px] font-bold text-[var(--success)] bg-white/60 border border-[var(--success)]/20 px-2 py-0.5 rounded-[20px]">
                          Within quota — no deduction
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-[var(--warning)] bg-white/60 border border-[var(--warning)]/20 px-2 py-0.5 rounded-[20px]">
                          Exceeds quota — salary deducted
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {quotaWarning && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-center">
            <div className="flex flex-col items-center">
              <span className="text-[var(--warning)] mb-2 text-3xl">⚠️</span>
              <h3 className="text-[#1A1A1A] text-base font-bold">Quota Warning</h3>
              <p className="text-[#555555] text-xs font-semibold mt-2 leading-relaxed">
                This staff has used all <strong>{quotaWarning.earnedQuota}</strong> earned leave days this month.
                Approving will deduct 1 day salary (<strong>₹{quotaWarning.deductionAmount.toLocaleString()}</strong>).
                Approve anyway?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setQuotaWarning(null)}
                className="flex-1 min-h-[40px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeApproval(quotaWarning.id, false)}
                className="flex-1 min-h-[40px] bg-[#1A1A1A] text-white hover:bg-[#333333] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Approve with Deduction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

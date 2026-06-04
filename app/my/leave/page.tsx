'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Calendar, ClipboardList, CheckCircle, XCircle, AlertCircle, Clock, ArrowRight } from 'lucide-react';

interface LeaveRequest {
  id: string;
  date: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  is_quota_leave?: boolean;
  requested_at: string;
}

export default function StaffLeavePage() {
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [staffInfo, setStaffInfo] = useState<any>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [daysWorkedThisMonth, setDaysWorkedThisMonth] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  
  // Form states
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Future dates only: calculate tomorrow's date string
  const tomorrowStr = React.useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }, []);

  const fetchData = async () => {
    if (!user || !user.staffId) return;
    try {
      // 1. Fetch Staff Info (for off_days_per_month, branch_id, name)
      const { data: sData, error: sErr } = await supabase
        .from('staff')
        .select('name, branch_id, off_days_per_month')
        .eq('id', user.staffId)
        .single();
      if (sErr) throw sErr;
      setStaffInfo(sData);

      // 2. Fetch Attendance for current month to compute earned leaves
      const currentMonth = new Date().toISOString().slice(0, 7);
      const { data: attData } = await supabase
        .from('attendance')
        .select('check_in_time, status')
        .eq('staff_id', user.staffId)
        .gte('date', `${currentMonth}-01`)
        .lte('date', `${currentMonth}-31`);
      
      const worked = attData?.filter(a => a.check_in_time && a.status !== 'absent').length || 0;
      setDaysWorkedThisMonth(worked);

      // 3. Fetch All Leave Requests
      const { data: lData, error: lErr } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('staff_id', user.staffId)
        .order('date', { ascending: false });
      if (lErr) throw lErr;
      setLeaves(lData || []);
    } catch (err) {
      console.error('Error fetching leave details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.staffId || !staffInfo) return;
    if (!date) {
      setError('Please select a date.');
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a reason for the leave.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      // Insert leave request
      const { data: insertedLeave, error: insertError } = await supabase
        .from('leave_requests')
        .insert({
          staff_id: user.staffId,
          date: date,
          reason: reason.trim(),
          status: 'pending'
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          setError('You have already submitted a leave request for this date.');
          setSubmitting(false);
          return;
        }
        throw insertError;
      }

      // Format date for notification message
      const formattedDate = new Date(date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const notifMessage = `${staffInfo.name} has requested leave for ${formattedDate}. Reason: ${reason.trim()}`;

      // Insert notifications for staff_executive and ops_manager
      const { error: notifError } = await supabase
        .from('notifications')
        .insert([
          {
            type: 'leave_request',
            title: 'New Leave Request',
            message: notifMessage,
            branch_id: staffInfo.branch_id,
            staff_id: user.staffId,
            related_id: insertedLeave.id,
            target_role: 'staff_executive',
            is_read: false
          },
          {
            type: 'leave_request',
            title: 'New Leave Request',
            message: notifMessage,
            branch_id: staffInfo.branch_id,
            staff_id: user.staffId,
            related_id: insertedLeave.id,
            target_role: 'ops_manager',
            is_read: false
          }
        ]);

      if (notifError) {
        console.error('Failed to create notifications for leave:', notifError);
      }

      setSuccess('Leave request submitted successfully!');
      setDate('');
      setReason('');
      fetchData(); // Refresh list & quota metrics
    } catch (err: any) {
      console.error('Error submitting leave:', err);
      setError(err.message || 'Failed to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  // Dynamic Quota Metrics based on Section 1
  const quota = React.useMemo(() => {
    if (!staffInfo) return { earned: 0, used: 0, remaining: 0 };
    const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    
    // 4-off staff: 1 day per 6 days worked
    // 2-off staff: 1 day per 12 days worked
    const offDays = staffInfo.off_days_per_month || 0;
    let earned = 0;
    if (offDays === 4) {
      earned = Math.floor(daysWorkedThisMonth / 6);
    } else if (offDays === 2) {
      earned = Math.floor(daysWorkedThisMonth / 12);
    }
    
    // Earned quota cannot exceed total possible off days
    earned = Math.min(earned, offDays);
    
    const used = leaves.filter(l => 
      l.status === 'approved' && 
      l.date.startsWith(currentMonth)
    ).length;
    
    return {
      earned,
      used,
      remaining: Math.max(0, earned - used)
    };
  }, [staffInfo, leaves, daysWorkedThisMonth]);

  const filteredLeaves = React.useMemo(() => {
    if (activeTab === 'all') return leaves;
    return leaves.filter(l => l.status === activeTab);
  }, [leaves, activeTab]);

  const getStatusIcon = (status: 'pending' | 'approved' | 'rejected') => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={15} className="text-[var(--success)]" />;
      case 'rejected':
        return <XCircle size={15} className="text-[var(--danger)]" />;
      default:
        return <Clock size={15} className="text-[var(--warning)]" />;
    }
  };

  const getStatusBadge = (status: 'pending' | 'approved' | 'rejected') => {
    switch (status) {
      case 'approved':
        return (
          <span className="bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/20 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger)]/20 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
            Rejected
          </span>
        );
      default:
        return (
          <span className="bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/20 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
            Pending
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[70px] w-full" />
        <div className="skeleton h-[200px] w-full" />
        <div className="skeleton h-[250px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Title */}
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3 shadow-sm flex items-center justify-between">
        <span className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider">Leave Register</span>
        <ClipboardList size={18} className="text-[var(--text-secondary)]" />
      </div>

      {/* Quota Info Bar */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 shadow-sm">
        <h3 className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider mb-2">Leave Quota (This Month)</h3>
        <p className="text-[10px] text-[var(--text-muted)] font-semibold mb-3 leading-tight">
          Earned based on worked days: {daysWorkedThisMonth} worked this month.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-[#1A1A1A]">{quota.earned}</div>
            <div className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-1">Earned</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-[var(--warning)]">{quota.used}</div>
            <div className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-1">Used</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 text-center">
            <div className="text-lg font-black text-[var(--success)]">{quota.remaining}</div>
            <div className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-1">Remaining</div>
          </div>
        </div>
      </div>

      {/* Apply Leave Section */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider border-b border-[var(--border)] pb-2">Apply for Leave</h3>
        
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-[var(--danger)] p-3 rounded-lg text-xs font-bold flex items-center space-x-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] p-3 rounded-lg text-xs font-bold flex items-center space-x-2">
              <CheckCircle size={16} className="flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Select Leave Date
            </label>
            <input
              type="date"
              min={tomorrowStr}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-[#1A1A1A] font-bold [color-scheme:light]"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Reason for Leave
            </label>
            <textarea
              rows={3}
              placeholder="Please explain why you are requesting leave..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-[#1A1A1A] font-semibold placeholder:text-[var(--text-muted)] resize-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] bg-[#1A1A1A] text-white font-bold text-xs rounded-xl hover:bg-[#333333] active:scale-95 transition-all shadow flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            {submitting ? (
              <span>Submitting...</span>
            ) : (
              <>
                <span>Submit Application</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Leave History Tabs */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 shadow-sm flex flex-col">
        <h3 className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider mb-3">Leave History</h3>
        
        {/* Tab Filters */}
        <div className="flex bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-0.5 mb-4">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-[10px] font-bold py-1.5 rounded-md capitalize transition-all ${
                activeTab === tab
                  ? 'bg-white text-[#1A1A1A] shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-secondary)] hover:text-[#1A1A1A]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* History List */}
        {filteredLeaves.length === 0 ? (
          <div className="text-center py-6 text-xs text-[var(--text-muted)] font-semibold italic">
            No {activeTab !== 'all' ? activeTab : ''} leave requests found.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {filteredLeaves.map((l) => (
              <div key={l.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(l.status)}
                    <span className="text-xs font-black text-[#1A1A1A] font-mono">
                      {new Date(l.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })}
                    </span>
                  </div>
                  {getStatusBadge(l.status)}
                </div>
                {l.reason && (
                  <p className="text-[11px] text-[var(--text-secondary)] font-semibold leading-relaxed bg-white p-2 rounded-lg border border-[var(--border)] break-words">
                    {l.reason}
                  </p>
                )}
                
                {/* Quota Impact Notes */}
                {l.status === 'approved' && (
                  <div className="mt-0.5 text-[9.5px] font-bold">
                    {l.is_quota_leave ? (
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-100/50 px-2 py-0.5 rounded">
                        Within quota — no deduction
                      </span>
                    ) : (
                      <span className="text-amber-700 bg-amber-50 border border-amber-100/50 px-2 py-0.5 rounded">
                        Approved — 1 day salary impact
                      </span>
                    )}
                  </div>
                )}
                
                <div className="text-[9px] text-[var(--text-muted)] font-bold text-right pt-1">
                  Applied: {new Date(l.requested_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

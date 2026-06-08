'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Timer, Clock, Calendar, UserX, Bell, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createAuditLog } from '@/lib/audit';
import { formatTime12hr } from '@/lib/utils';

interface SystemNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  branch_id: string | null;
  staff_id: string | null;
  related_id: string | null;
  created_at: string;
}

export default function NotificationsPage() {
  const { user, userBranch } = useAuth();
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const router = useRouter();

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Bottom Sheet States
  const [selectedNotif, setSelectedNotif] = useState<SystemNotification | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [notifDetails, setNotifDetails] = useState<any>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  const handleConfirmFine = async () => {
    if (!selectedNotif || !notifDetails?.lateFine) return;
    setIsActionSubmitting(true);
    try {
      const { error } = await supabase
        .from('late_fines')
        .update({ confirmed: true })
        .eq('id', notifDetails.lateFine.id);
      if (error) throw error;

      await createAuditLog({
        action: 'CONFIRM_FINE',
        table_name: 'late_fines',
        record_id: notifDetails.lateFine.id,
        old_value: { confirmed: false },
        new_value: { confirmed: true },
        performed_by: user?.name || user?.email || 'Admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Confirmed fine via notifications panel'
      });

      showToast('Fine confirmed successfully ✓');
      setSelectedNotif(null);
      fetchNotifications();
    } catch (err: any) {
      alert('Failed to confirm fine: ' + err.message);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleWaiveFine = async () => {
    if (!selectedNotif || !notifDetails?.lateFine) return;
    if (!waiveReason.trim()) {
      alert('Please provide a waive reason.');
      return;
    }
    setIsActionSubmitting(true);
    try {
      const waivedBy = user?.name || user?.email || 'Management';
      const { error } = await supabase
        .from('late_fines')
        .update({
          waived: true,
          waived_amount: notifDetails.lateFine.fine_amount,
          waived_by: waivedBy,
          waived_reason: waiveReason.trim()
        })
        .eq('id', notifDetails.lateFine.id);
      if (error) throw error;

      await createAuditLog({
        action: 'WAIVE_FINE',
        table_name: 'late_fines',
        record_id: notifDetails.lateFine.id,
        old_value: { waived: false },
        new_value: { waived: true, waived_amount: notifDetails.lateFine.fine_amount, waived_reason: waiveReason.trim() },
        performed_by: waivedBy,
        performed_by_role: user?.role || 'admin',
        reason: waiveReason.trim()
      });

      showToast('Fine waived successfully ✓');
      setSelectedNotif(null);
      fetchNotifications();
    } catch (err: any) {
      alert('Failed to waive fine: ' + err.message);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleApproveOT = async () => {
    if (!selectedNotif || !notifDetails?.attendance) return;
    setIsActionSubmitting(true);
    try {
      const { error } = await supabase
        .from('attendance')
        .update({ ot_approved: true })
        .eq('id', notifDetails.attendance.id);
      if (error) throw error;

      await createAuditLog({
        action: 'APPROVE_OT',
        table_name: 'attendance',
        record_id: notifDetails.attendance.id,
        old_value: { ot_approved: false },
        new_value: { ot_approved: true },
        performed_by: user?.name || user?.email || 'Admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Approved OT via notifications panel'
      });

      showToast('OT approved ✓');
      setSelectedNotif(null);
      fetchNotifications();
    } catch (err: any) {
      alert('Failed to approve OT: ' + err.message);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleRejectOT = async () => {
    if (!selectedNotif || !notifDetails?.attendance) return;
    setIsActionSubmitting(true);
    try {
      const { error } = await supabase
        .from('attendance')
        .update({ ot_minutes: 0, ot_approved: false })
        .eq('id', notifDetails.attendance.id);
      if (error) throw error;

      await createAuditLog({
        action: 'REJECT_OT',
        table_name: 'attendance',
        record_id: notifDetails.attendance.id,
        old_value: { ot_minutes: notifDetails.attendance.ot_minutes, ot_approved: false },
        new_value: { ot_minutes: 0, ot_approved: false },
        performed_by: user?.name || user?.email || 'Admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Rejected OT via notifications panel'
      });

      showToast('OT rejected');
      setSelectedNotif(null);
      fetchNotifications();
    } catch (err: any) {
      alert('Failed to reject OT: ' + err.message);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleApproveLeave = async () => {
    if (!selectedNotif || !notifDetails?.leaveRequest) return;
    setIsActionSubmitting(true);
    try {
      const approvedBy = user?.name || user?.email || 'HR';
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'approved', approved_by: approvedBy })
        .eq('id', notifDetails.leaveRequest.id);
      if (error) throw error;

      const { error: attError } = await supabase
        .from('attendance')
        .upsert({
          staff_id: notifDetails.leaveRequest.staff_id,
          date: notifDetails.leaveRequest.date,
          status: 'absent',
          day_type: 'leave',
          marked_by: 'admin_leave_approval'
        }, { onConflict: 'staff_id,date' });

      if (attError) throw attError;

      await createAuditLog({
        action: 'APPROVE_LEAVE',
        table_name: 'leave_requests',
        record_id: notifDetails.leaveRequest.id,
        old_value: { status: 'pending' },
        new_value: { status: 'approved' },
        performed_by: approvedBy,
        performed_by_role: user?.role || 'staff_executive',
        reason: 'Approved leave request via notifications panel'
      });

      showToast('Leave approved ✓');
      setSelectedNotif(null);
      fetchNotifications();
    } catch (err: any) {
      alert('Failed to approve leave: ' + err.message);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleRejectLeave = async () => {
    if (!selectedNotif || !notifDetails?.leaveRequest) return;
    setIsActionSubmitting(true);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'rejected' })
        .eq('id', notifDetails.leaveRequest.id);
      if (error) throw error;

      await createAuditLog({
        action: 'REJECT_LEAVE',
        table_name: 'leave_requests',
        record_id: notifDetails.leaveRequest.id,
        old_value: { status: 'pending' },
        new_value: { status: 'rejected' },
        performed_by: user?.name || user?.email || 'HR',
        performed_by_role: user?.role || 'staff_executive',
        reason: 'Rejected leave request via notifications panel'
      });

      showToast('Leave rejected');
      setSelectedNotif(null);
      fetchNotifications();
    } catch (err: any) {
      alert('Failed to reject leave: ' + err.message);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleMarkWeeklyOff = async () => {
    if (!selectedNotif || !selectedNotif.staff_id || !notifDetails?.attendance?.date) return;
    setIsActionSubmitting(true);
    try {
      const { data: oldRecord } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', selectedNotif.staff_id)
        .eq('date', notifDetails.attendance.date)
        .maybeSingle();

      const { error } = await supabase
        .from('attendance')
        .upsert({
          id: oldRecord?.id || undefined,
          staff_id: selectedNotif.staff_id,
          date: notifDetails.attendance.date,
          check_in_time: null,
          check_out_time: null,
          status: 'present',
          day_type: 'weekly_off',
          color_code: 'green',
          marked_by: user?.name || user?.email || 'admin'
        }, { onConflict: 'staff_id,date' });

      if (error) throw error;

      await createAuditLog({
        action: 'MARK_WEEKLY_OFF',
        table_name: 'attendance',
        record_id: oldRecord?.id || null,
        old_value: oldRecord || null,
        new_value: { day_type: 'weekly_off', status: 'present', check_in_time: null, check_out_time: null },
        performed_by: user?.name || user?.email || 'Admin',
        performed_by_role: user?.role || 'admin',
        reason: 'Marked weekly off from notifications panel'
      });

      showToast('Marked weekly off ✓');
      setSelectedNotif(null);
      fetchNotifications();
    } catch (err: any) {
      alert('Failed to mark weekly off: ' + err.message);
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });

      // Branch isolation for branch HR
      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }

      // Role filtering
      if (user?.role === 'staff_executive') {
        query = query.in('type', [
          'late_fine',
          'ot_pending',
          'early_in_pending',
          'leave_request',
          'absent_alert',
        ]);
      }

      const { data, error } = await query;
      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchNotifications();

    // Subscribe to realtime notifications channel
    const channel = supabase
      .channel('notifications-page-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userBranch]);

  const handleMarkAllRead = async () => {
    try {
      const currentRole = user?.role || 'staff_executive';
      let query = supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false)
        .in('target_role', [currentRole, 'all']);

      // Apply scoping so we don't accidentally update unread notifications we shouldn't see
      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }

      const { error } = await query;
      if (error) throw error;

      showToast('All notifications marked as read');
      fetchNotifications();
    } catch (err) {
      console.error(err);
      showToast('Error marking notifications as read.');
    }
  };

  const handleNotificationClick = async (notif: SystemNotification) => {
    try {
      // Mark as read in DB
      if (!notif.is_read) {
        await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      }

      // Open bottom sheet
      setSelectedNotif(notif);
      setDetailsLoading(true);
      setNotifDetails(null);
      setWaiveReason('');

      // Fetch related info
      let staffData: any = null;
      if (notif.staff_id) {
        const { data, error } = await supabase
          .from('staff')
          .select('*, shifts(*)')
          .eq('id', notif.staff_id)
          .maybeSingle();
        if (!error && data) {
          staffData = data;
        }
      }

      let detailsObj: any = { staff: staffData };

      if (notif.type === 'late_fine') {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notif.related_id || '');
        let fineQuery = supabase.from('late_fines').select('*');
        if (isUUID) {
          fineQuery = fineQuery.eq('id', notif.related_id);
        } else if (notif.related_id) {
          fineQuery = fineQuery.eq('staff_id', notif.staff_id).eq('date', notif.related_id);
        } else {
          fineQuery = fineQuery.eq('staff_id', notif.staff_id).order('date', { ascending: false }).limit(1);
        }
        const { data: fineRec } = await fineQuery.maybeSingle();
        detailsObj.lateFine = fineRec;

        const attDate = fineRec?.date || notif.related_id;
        if (attDate && !isUUID) {
          const { data: attRec } = await supabase
            .from('attendance')
            .select('*')
            .eq('staff_id', notif.staff_id)
            .eq('date', attDate)
            .maybeSingle();
          detailsObj.attendance = attRec;
        }
      } else if (['ot_pending', 'early_in_pending', 'absent_alert'].includes(notif.type)) {
        const dateStr = notif.related_id || new Date().toISOString().split('T')[0];
        const { data: attRec } = await supabase
          .from('attendance')
          .select('*')
          .eq('staff_id', notif.staff_id)
          .eq('date', dateStr)
          .maybeSingle();
        detailsObj.attendance = attRec;

        const { data: adjRec } = await supabase
          .from('attendance_adjustments')
          .select('*')
          .eq('staff_id', notif.staff_id)
          .eq('date', dateStr)
          .eq('type', notif.type === 'ot_pending' ? 'ot' : 'early_in')
          .maybeSingle();
        detailsObj.adjustment = adjRec;
      } else if (notif.type === 'leave_request') {
        if (notif.related_id) {
          const { data: leaveRec } = await supabase
            .from('leave_requests')
            .select('*')
            .eq('id', notif.related_id)
            .maybeSingle();
          detailsObj.leaveRequest = leaveRec;
        }
      }

      setNotifDetails(detailsObj);
    } catch (err) {
      console.error('Click handle error:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'late_fine':
        return <Timer size={20} strokeWidth={1.5} className="text-[#FBBF24]" />;
      case 'ot_pending':
      case 'early_in_pending':
        return <Clock size={20} strokeWidth={1.5} className="text-[#60A5FA]" />;
      case 'leave_request':
        return <Calendar size={20} strokeWidth={1.5} className="text-[#4ADE80]" />;
      case 'absent_alert':
        return <UserX size={20} strokeWidth={1.5} className="text-[#F87171]" />;
      default:
        return <Bell size={20} strokeWidth={1.5} className="text-[var(--text-secondary)]" />;
    }
  };

  const formatReceivedTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Scrub any monetary amount values for staff_executive role just in case
  const scrubMessageBody = (type: string, msg: string) => {
    if (user?.role === 'staff_executive') {
      // Remove ₹ amounts, or words like "Fine: ₹100"
      return msg.replace(/₹\s*\d+/g, '').replace(/Fine:\s*₹?\d+/gi, '');
    }
    return msg;
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1A1A1A] text-2xl font-bold">Notifications</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">
            Alert logs
          </p>
        </div>
        <button
          onClick={handleMarkAllRead}
          disabled={notifications.filter((n) => !n.is_read).length === 0}
          className="min-h-[44px] bg-white border border-[#E8E8E8] disabled:opacity-30 disabled:pointer-events-none active:scale-95 px-4 rounded-xl text-xs font-bold text-[#1A1A1A] hover:bg-[#F8F8F8] transition-all cursor-pointer shadow-sm"
        >
          Mark all as read
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button onClick={fetchNotifications} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Main List */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[72px] w-full" />
          <div className="skeleton h-[72px] w-full" />
          <div className="skeleton h-[72px] w-full" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6 shadow-sm">
          <Bell size={48} strokeWidth={1} style={{ color: '#999999' }} className="mb-2" />
          <h3 className="text-sm font-bold text-[#1A1A1A]">Inbox clean!</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            You don't have any notifications right now.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notifications.map((notif) => {
            const isUnread = !notif.is_read;
            return (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`border rounded-[14px] p-3.5 flex items-start space-x-3.5 cursor-pointer transition-all ${
                  isUnread
                    ? 'bg-[var(--warning-bg)] border-[var(--warning)]/20 hover:border-[var(--warning)]/40 hover:bg-[var(--warning-bg)]/80'
                    : 'bg-white border-[#E8E8E8] hover:bg-[#F8F8F8]'
                }`}
              >
                {/* Type Emoji */}
                <div className="w-10 h-10 rounded-full bg-[#F8F8F8] border border-[#E8E8E8] flex items-center justify-center flex-shrink-0 relative">
                  {getIconForType(notif.type)}
                  {isUnread && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[var(--warning)] border-2 border-white rounded-full" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className={`text-xs font-bold truncate ${isUnread ? 'text-[#1A1A1A]' : 'text-[#555555]'}`}>
                      {notif.title}
                    </h3>
                    <span className="text-[9px] font-bold text-[var(--text-muted)] whitespace-nowrap pl-2">
                      {formatReceivedTime(notif.created_at)}
                    </span>
                  </div>
                  <p className={`text-[11px] font-semibold leading-normal truncate ${isUnread ? 'text-[#1A1A1A]' : 'text-[var(--text-muted)]'}`}>
                    {scrubMessageBody(notif.type, notif.message)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* Bottom Sheet Detail Modal */}
      {selectedNotif && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[999] transition-opacity duration-300"
            onClick={() => setSelectedNotif(null)}
          />
          <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] bg-white z-[1000] rounded-t-[24px] overflow-y-auto px-6 pb-8 pt-4 shadow-xl border-t border-[#E8E8E8] animate-slide-up flex flex-col">
            <div className="w-12 h-1.5 bg-[#E8E8E8] rounded-full mx-auto mb-5 flex-shrink-0" />
            <button
              onClick={() => setSelectedNotif(null)}
              className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-[#1A1A1A] p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>
            <div className="flex-1 overflow-y-auto">
              <h2 className="text-lg font-extrabold text-[#1A1A1A] mb-1 pr-8">
                {selectedNotif.title}
              </h2>
              <p className="text-[var(--text-muted)] text-xs font-semibold mb-4">
                Received {formatReceivedTime(selectedNotif.created_at)}
              </p>

              {detailsLoading ? (
                <div className="space-y-4 py-4">
                  <div className="skeleton h-6 w-1/3" />
                  <div className="skeleton h-20 w-full" />
                  <div className="skeleton h-12 w-full" />
                </div>
              ) : !notifDetails ? (
                <div className="text-center py-6 text-xs text-[var(--text-muted)] font-semibold">
                  Failed to load details.
                </div>
              ) : (
                <div className="space-y-5 text-sm">
                  {notifDetails.staff && (
                    <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <div className="font-extrabold text-[#1A1A1A] text-sm">{notifDetails.staff.name}</div>
                        <div className="text-xs text-[var(--text-muted)] font-semibold mt-0.5">
                          {notifDetails.staff.department} • {notifDetails.staff.shifts?.label || 'No Shift'}
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase bg-[#E8E8E8] text-[#1A1A1A] px-2.5 py-1 rounded-md">
                        {notifDetails.staff.pin}
                      </span>
                    </div>
                  )}

                  <div className="bg-[#FDF6E2] border border-[#FBBF24]/30 rounded-2xl p-4 text-xs font-semibold text-[#1A1A1A] leading-relaxed">
                    {scrubMessageBody(selectedNotif.type, selectedNotif.message)}
                  </div>

                  {selectedNotif.type === 'late_fine' && notifDetails.lateFine && (
                    <div className="border border-[#E8E8E8] rounded-2xl p-4 space-y-3.5">
                      <h4 className="text-[11px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                        Late Fine Details
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Date</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.lateFine.date}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Late Minutes</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.lateFine.late_minutes} mins</div>
                        </div>
                        {user?.role !== 'staff_executive' && (
                          <div>
                            <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Fine Amount</div>
                            <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">₹{notifDetails.lateFine.fine_amount}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Status</div>
                          <div className="text-xs font-bold mt-0.5 font-sans">
                            {notifDetails.lateFine.waived ? (
                              <span className="text-blue-600">Waived (by {notifDetails.lateFine.waived_by})</span>
                            ) : notifDetails.lateFine.confirmed ? (
                              <span className="text-green-600">Confirmed</span>
                            ) : (
                              <span className="text-amber-600">Pending Approval</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {notifDetails.attendance && (
                        <div className="pt-3 border-t border-[#E8E8E8] grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Check In</div>
                            <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.attendance.check_in_time || '--:--'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Check Out</div>
                            <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.attendance.check_out_time || '--:--'}</div>
                          </div>
                        </div>
                      )}

                      {!notifDetails.lateFine.confirmed && !notifDetails.lateFine.waived && (
                        <div className="space-y-4 pt-4 border-t border-[#E8E8E8]">
                          <button
                            onClick={handleConfirmFine}
                            disabled={isActionSubmitting}
                            className="w-full min-h-[44px] bg-[#1A1A1A] text-white rounded-xl text-xs font-bold hover:bg-[#333333] transition-all active:scale-95 disabled:opacity-50"
                          >
                            Confirm Fine
                          </button>
                          <div className="space-y-2">
                            <label className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Reason for Waiving</label>
                            <input
                              type="text"
                              value={waiveReason}
                              onChange={(e) => setWaiveReason(e.target.value)}
                              placeholder="e.g. rain/transport delay"
                              className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#1A1A1A]"
                            />
                            <button
                              onClick={handleWaiveFine}
                              disabled={isActionSubmitting || !waiveReason.trim()}
                              className="w-full min-h-[44px] bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-all active:scale-95 disabled:opacity-50"
                            >
                              Waive Fine
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {(selectedNotif.type === 'ot_pending' || selectedNotif.type === 'early_in_pending') && notifDetails.attendance && (
                    <div className="border border-[#E8E8E8] rounded-2xl p-4 space-y-3.5">
                      <h4 className="text-[11px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                        Attendance Details
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Date</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.attendance.date}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Shift</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.staff?.shifts?.label || '--'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Check In</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.attendance.check_in_time || '--:--'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Check Out</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.attendance.check_out_time || '--:--'}</div>
                        </div>
                        {selectedNotif.type === 'ot_pending' ? (
                          <>
                            <div>
                              <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Overtime</div>
                              <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.attendance.ot_minutes} mins</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">OT Approved</div>
                              <div className="text-xs font-bold mt-0.5">
                                {notifDetails.attendance.ot_approved ? (
                                  <span className="text-green-600">Yes</span>
                                ) : (
                                  <span className="text-amber-600">Pending</span>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Early In</div>
                              <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.attendance.early_in_minutes} mins</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Early In Approved</div>
                              <div className="text-xs font-bold mt-0.5">
                                {notifDetails.attendance.early_in_approved ? (
                                  <span className="text-green-600">Yes</span>
                                ) : (
                                  <span className="text-amber-600">Pending</span>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {selectedNotif.type === 'ot_pending' && !notifDetails.attendance.ot_approved && (
                        <div className="flex space-x-3 pt-4 border-t border-[#E8E8E8]">
                          <button
                            onClick={handleRejectOT}
                            disabled={isActionSubmitting}
                            className="flex-1 min-h-[44px] bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-all active:scale-95"
                          >
                            Reject OT
                          </button>
                          <button
                            onClick={handleApproveOT}
                            disabled={isActionSubmitting}
                            className="flex-1 min-h-[44px] bg-[#1A1A1A] text-white rounded-xl text-xs font-bold hover:bg-[#333333] transition-all active:scale-95"
                          >
                            Approve OT
                          </button>
                        </div>
                      )}

                      {selectedNotif.type === 'early_in_pending' && !notifDetails.attendance.early_in_approved && (
                        <div className="flex space-x-3 pt-4 border-t border-[#E8E8E8]">
                          <button
                            onClick={async () => {
                              setIsActionSubmitting(true);
                              try {
                                const { error } = await supabase
                                  .from('attendance')
                                  .update({ early_in_minutes: 0, early_in_approved: false })
                                  .eq('id', notifDetails.attendance.id);
                                if (error) throw error;
                                
                                await createAuditLog({
                                  action: 'REJECT_EARLY_IN',
                                  table_name: 'attendance',
                                  record_id: notifDetails.attendance.id,
                                  old_value: { early_in_minutes: notifDetails.attendance.early_in_minutes, early_in_approved: false },
                                  new_value: { early_in_minutes: 0, early_in_approved: false },
                                  performed_by: user?.name || user?.email || 'Admin',
                                  performed_by_role: user?.role || 'admin',
                                  reason: 'Rejected early in approval via notifications panel'
                                });
                                showToast('Early check-in rejected');
                                setSelectedNotif(null);
                                fetchNotifications();
                              } catch (err: any) {
                                alert('Error: ' + err.message);
                              } finally {
                                setIsActionSubmitting(false);
                              }
                            }}
                            disabled={isActionSubmitting}
                            className="flex-1 min-h-[44px] bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-all active:scale-95"
                          >
                            Reject Early In
                          </button>
                          <button
                            onClick={async () => {
                              setIsActionSubmitting(true);
                              try {
                                const { error } = await supabase
                                  .from('attendance')
                                  .update({ early_in_approved: true })
                                  .eq('id', notifDetails.attendance.id);
                                if (error) throw error;

                                await createAuditLog({
                                  action: 'APPROVE_EARLY_IN',
                                  table_name: 'attendance',
                                  record_id: notifDetails.attendance.id,
                                  old_value: { early_in_approved: false },
                                  new_value: { early_in_approved: true },
                                  performed_by: user?.name || user?.email || 'Admin',
                                  performed_by_role: user?.role || 'admin',
                                  reason: 'Approved early in approval via notifications panel'
                                });
                                showToast('Early check-in approved ✓');
                                setSelectedNotif(null);
                                fetchNotifications();
                              } catch (err: any) {
                                alert('Error: ' + err.message);
                              } finally {
                                setIsActionSubmitting(false);
                              }
                            }}
                            disabled={isActionSubmitting}
                            className="flex-1 min-h-[44px] bg-[#1A1A1A] text-white rounded-xl text-xs font-bold hover:bg-[#333333] transition-all active:scale-95"
                          >
                            Approve Early In
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedNotif.type === 'leave_request' && notifDetails.leaveRequest && (
                    <div className="border border-[#E8E8E8] rounded-2xl p-4 space-y-3.5">
                      <h4 className="text-[11px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                        Leave Request Details
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Date Requested</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.leaveRequest.date}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Day of Week</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.leaveRequest.day_of_week || 'N/A'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Reason</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{notifDetails.leaveRequest.reason || 'No reason specified'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Status</div>
                          <div className="text-xs font-bold mt-0.5 capitalize">
                            <span className={
                              notifDetails.leaveRequest.status === 'approved' ? 'text-green-600' :
                              notifDetails.leaveRequest.status === 'rejected' ? 'text-red-600' :
                              'text-amber-600'
                            }>
                              {notifDetails.leaveRequest.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      {notifDetails.leaveRequest.status === 'pending' && (
                        <div className="flex space-x-3 pt-4 border-t border-[#E8E8E8]">
                          <button
                            onClick={handleRejectLeave}
                            disabled={isActionSubmitting}
                            className="flex-1 min-h-[44px] bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-all active:scale-95"
                          >
                            Reject Leave
                          </button>
                          <button
                            onClick={handleApproveLeave}
                            disabled={isActionSubmitting}
                            className="flex-1 min-h-[44px] bg-[#1A1A1A] text-white rounded-xl text-xs font-bold hover:bg-[#333333] transition-all active:scale-95"
                          >
                            Approve Leave
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedNotif.type === 'absent_alert' && (
                    <div className="border border-[#E8E8E8] rounded-2xl p-4 space-y-3.5">
                      <h4 className="text-[11px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                        Absence Details
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Date</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">{selectedNotif.related_id || new Date().toISOString().split('T')[0]}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[var(--text-muted)] font-bold uppercase">Scheduled Shift</div>
                          <div className="text-xs font-bold text-[#1A1A1A] mt-0.5">
                            {notifDetails.staff?.shifts?.label || 'No Shift'} ({notifDetails.staff?.shifts?.start_time} - {notifDetails.staff?.shifts?.end_time})
                          </div>
                        </div>
                      </div>

                      {(() => {
                        const dateStr = selectedNotif.related_id || new Date().toISOString().split('T')[0];
                        const notifDate = new Date(dateStr);
                        const today = new Date();
                        const isCurrentMonth = notifDate.getMonth() === today.getMonth() && notifDate.getFullYear() === today.getFullYear();
                        const isHR = user?.role === 'staff_executive';
                        const disabled = isHR && !isCurrentMonth;
                        
                        return (
                          <div className="pt-4 border-t border-[#E8E8E8] space-y-2">
                            {disabled && (
                              <p className="text-[10px] text-red-600 font-semibold">
                                * HR Executives can only set weekly offs for the current month.
                              </p>
                            )}
                            <button
                              onClick={handleMarkWeeklyOff}
                              disabled={isActionSubmitting || disabled}
                              className="w-full min-h-[44px] bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-bold hover:bg-green-100 transition-all active:scale-95 disabled:opacity-50"
                            >
                              Mark Weekly Off
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

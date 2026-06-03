'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Timer, Clock, Calendar, UserX, Bell } from 'lucide-react';

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
      let query = supabase.from('notifications').update({ is_read: true }).eq('is_read', false);

      // Apply scoping so we don't accidentally update unread notifications we shouldn't see
      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }

      if (user?.role === 'staff_executive') {
        query = query.in('type', [
          'late_fine',
          'ot_pending',
          'early_in_pending',
          'leave_request',
          'absent_alert',
        ]);
      }

      const { error } = await query;
      if (error) throw error;

      showToast('All notifications marked as read!');
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
      }

      // Route mapping based on notification type
      if (['late_fine', 'ot_pending', 'early_in_pending'].includes(notif.type)) {
        router.push('/approvals');
      } else if (notif.type === 'leave_request') {
        router.push('/leave');
      } else if (notif.type === 'absent_alert') {
        router.push('/attendance');
      }
    } catch (err) {
      console.error('Click handle error:', err);
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
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Activity, RefreshCw, Circle } from 'lucide-react';

interface WallEvent {
  id: string;
  event_type: string;
  staff_id: string;
  staff_name: string;
  branch_id: string;
  description: string;
  created_at: string;
}

type TypeFilter = 'All' | 'Attendance' | 'Breaks' | 'Leave' | 'Fines' | 'Salary' | 'Staff';
type BranchFilter = 'all' | 'daily' | 'hypermarket';

export default function WallPage() {
  const router = useRouter();
  const { user, userBranch } = useAuth();
  const [events, setEvents] = useState<WallEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [branchFilter, setBranchFilter] = useState<BranchFilter>('all');
  const [newEventId, setNewEventId] = useState<string | null>(null);
  
  const [page, setPage] = useState(0);
  const pageSize = 30;

  // Set initial branch filter for branch HR
  useEffect(() => {
    if (userBranch) {
      setBranchFilter(userBranch as BranchFilter);
    }
  }, [userBranch]);

  const getEventCategory = (type: string): TypeFilter => {
    switch (type) {
      case 'check_in':
      case 'check_out':
      case 'absent':
      case 'early_checkout':
      case 'late_check_in':
      case 'absent_alert':
        return 'Attendance';
      case 'break_start':
      case 'break_end':
      case 'break_overstay':
      case 'break_auto_closed':
        return 'Breaks';
      case 'leave_approved':
      case 'leave_rejected':
      case 'leave_requested':
      case 'leave_request':
        return 'Leave';
      case 'late_fine_added':
      case 'special_fine_added':
      case 'fine_confirmed':
      case 'fine_waived':
      case 'special_fine_confirmed':
      case 'special_fine_waived':
        return 'Fines';
      case 'salary_confirmed':
      case 'salary_paid':
        return 'Salary';
      case 'staff_added':
      case 'staff_removed':
        return 'Staff';
      default:
        return 'Attendance';
    }
  };

  const getDotColor = (type: string) => {
    switch (type) {
      case 'check_in':
      case 'break_end':
      case 'leave_approved':
      case 'fine_confirmed':
      case 'special_fine_confirmed':
      case 'salary_confirmed':
        return 'text-[#4ADE80]'; // Green for successes/ends/confirmations
      case 'check_out':
        return 'text-[#60A5FA]'; // Blue for check out
      case 'absent':
      case 'absent_alert':
      case 'break_auto_closed':
      case 'leave_rejected':
      case 'late_fine_added':
      case 'special_fine_added':
        return 'text-[#F87171]'; // Red for fines/absences/rejections/auto-closes
      case 'late_check_in':
      case 'break_overstay':
      case 'leave_requested':
      case 'leave_request':
        return 'text-[#FBBF24]'; // Yellow/Amber for pending or lates
      case 'fine_waived':
      case 'special_fine_waived':
        return 'text-[#9CA3AF]'; // Gray for waived
      default:
        return 'text-[#A78BFA]'; // Purple for others
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;

    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    if (isYesterday) {
      return `Yesterday ${timeStr}`;
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]} ${timeStr}`;
  };

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Daily' : 'Hypermarket';
  };

  const fetchEvents = async (pageNumber = 0, append = false) => {
    try {
      if (pageNumber === 0) setLoading(true);
      else setLoadingMore(true);

      setErrorMsg('');

      let query = supabase
        .from('wall_events')
        .select('*')
        .order('created_at', { ascending: false });

      // Branch Isolation
      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      } else if (branchFilter !== 'all') {
        query = query.eq('branch_id', branchFilter);
      }

      // Pagination
      const from = pageNumber * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error } = await query;
      if (error) throw error;

      const loadedEvents = data || [];
      
      if (append) {
        setEvents((prev) => [...prev, ...loadedEvents]);
      } else {
        setEvents(loadedEvents);
      }

      setHasMore(loadedEvents.length === pageSize);
      setPage(pageNumber);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to load events.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') return;
    fetchEvents(0, false);

    // Live subscriptions
    const channel = supabase
      .channel('wall-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wall_events' },
        (payload) => {
          const newEvent = payload.new as WallEvent;
          
          // Verify branch isolation
          if (userBranch && newEvent.branch_id !== userBranch) return;
          if (branchFilter !== 'all' && newEvent.branch_id !== branchFilter) return;

          // Verify type filter
          if (typeFilter !== 'All') {
            const cat = getEventCategory(newEvent.event_type);
            if (cat !== typeFilter) return;
          }

          setEvents((prev) => [newEvent, ...prev]);
          setNewEventId(newEvent.id);
          
          // Clear flash after 2 seconds
          setTimeout(() => {
            setNewEventId(null);
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [typeFilter, branchFilter, userBranch, user]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchEvents(page + 1, true);
  };

  // Filter events client-side based on type (while maintaining live subscription filters)
  const filteredEvents = events.filter((e) => {
    if (typeFilter === 'All') return true;
    return getEventCategory(e.event_type) === typeFilter;
  });

  // Access check
  if (user?.role === 'admin') {
    return (
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 text-center max-w-sm mx-auto my-8 flex flex-col items-center justify-center shadow-sm">
        <h3 className="text-base font-bold text-[#1A1A1A] mb-1">Access Denied</h3>
        <p className="text-xs text-[var(--text-muted)]">Administrators do not have access to The Wall.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1A1A1A] text-2xl font-bold flex items-center space-x-2">
            <Activity className="text-[var(--danger)]" />
            <span>The Wall</span>
          </h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">Real-time branch activity stream</p>
        </div>
        <button
          onClick={() => fetchEvents(0, false)}
          className="min-h-[40px] bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-[0.98] text-[#1A1A1A] px-3.5 rounded-[12px] text-xs font-bold flex items-center justify-center space-x-1.5 transition-all shadow-sm cursor-pointer"
        >
          <RefreshCw size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button onClick={() => fetchEvents(0, false)} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Branch selector (Ops / Head HR only) */}
      {!userBranch && (
        <div className="flex gap-2">
          {(['all', 'daily', 'hypermarket'] as const).map((b) => {
            const isActive = branchFilter === b;
            return (
              <button
                key={b}
                onClick={() => {
                  setBranchFilter(b);
                  setPage(0);
                }}
                className={`flex-1 text-center py-2.5 rounded-[12px] border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                    : 'bg-white text-[#555555] border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95'
                }`}
              >
                {b === 'all' ? 'All' : b === 'daily' ? 'Daily' : 'Hypermarket'}
              </button>
            );
          })}
        </div>
      )}

      {/* Type Filter Pills */}
      <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none select-none">
        {(['All', 'Attendance', 'Breaks', 'Leave', 'Fines', 'Salary', 'Staff'] as TypeFilter[]).map((pill) => {
          const isSelected = typeFilter === pill;
          return (
            <button
              key={pill}
              onClick={() => {
                setTypeFilter(pill);
                setPage(0);
              }}
              className={`px-4 py-2 text-xs font-bold rounded-full transition-all border whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                  : 'bg-white text-[#555555] border-[#E8E8E8] hover:bg-[#F8F8F8] active:scale-95'
              }`}
            >
              {pill}
            </button>
          );
        })}
      </div>

      {/* Event list */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[76px] w-full" />
          <div className="skeleton h-[76px] w-full" />
          <div className="skeleton h-[76px] w-full" />
          <div className="skeleton h-[76px] w-full" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6 shadow-sm">
          <Activity size={48} strokeWidth={1} style={{ color: '#999999' }} className="mb-2" />
          <h3 className="text-sm font-bold text-[#1A1A1A]">No activity logged</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Events will stream live as they happen in the branch kiosks and portal.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredEvents.map((item) => {
            const isNew = newEventId === item.id;
            return (
              <div
                key={item.id}
                className={`border rounded-[12px] p-3.5 flex items-center justify-between shadow-sm transition-all duration-1000 ${
                  isNew
                    ? 'bg-[var(--warning-bg)] border-[var(--warning)]/40 scale-[1.01]'
                    : 'bg-white border-[#E8E8E8]'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  {/* Event Color Dot */}
                  <Circle
                    size={8}
                    fill="currentColor"
                    className={`${getDotColor(item.event_type)} flex-shrink-0`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1A1A1A] leading-snug">
                      {item.staff_name && item.description.startsWith(item.staff_name) && item.staff_id ? (
                        <>
                          <span
                            onClick={() => router.push('/staff/' + item.staff_id)}
                            className="underline font-bold cursor-pointer hover:text-[#555555] transition-colors"
                          >
                            {item.staff_name}
                          </span>
                          {item.description.slice(item.staff_name.length)}
                        </>
                      ) : (
                        item.description
                      )}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        {getEventCategory(item.event_type)}
                      </span>
                      {!userBranch && (
                        <>
                          <span className="text-[9px] text-[var(--text-muted)]">•</span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[#555555] bg-[#F2F2F2] border border-[#E8E8E8] px-2 py-0.5 rounded-[20px]">
                            {getBranchLabel(item.branch_id)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0 pl-3">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] whitespace-nowrap">
                    {formatTimeAgo(item.created_at)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Load More Button */}
          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full min-h-[44px] bg-white hover:bg-[#F8F8F8] border border-[#E8E8E8] active:scale-98 transition-all text-xs font-bold text-[#1A1A1A] rounded-xl py-3 mt-4 cursor-pointer shadow-sm"
            >
              {loadingMore ? 'Loading more events...' : 'Load more activities'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

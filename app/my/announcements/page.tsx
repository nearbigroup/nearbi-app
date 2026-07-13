'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Megaphone, Calendar, User, AlertCircle, RefreshCw } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  message: string;
  created_by: string;
  branch_id: string | null;
  target: 'all' | 'daily' | 'hypermarket';
  requires_acknowledgement: boolean;
  created_at: string;
}

export default function StaffAnnouncementsPage() {
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [acknowledgedIds, setAcknowledgedIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const fetchAnnouncements = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    
    try {
      const branchFilter = user.branch ? `branch_id.eq.${user.branch},target.eq.${user.branch}` : '';
      const orFilter = `target.eq.all${branchFilter ? ',' + branchFilter : ''}`;

      const { data, error: fetchErr } = await supabase
        .from('staff_announcements')
        .select('*')
        .or(orFilter)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setAnnouncements(data || []);

      if (user.staffId) {
        const { data: ackD } = await supabase
          .from('announcement_acknowledgements')
          .select('announcement_id')
          .eq('staff_id', user.staffId);
        
        if (ackD) {
          setAcknowledgedIds(ackD.map(a => a.announcement_id));
        }
      }
    } catch (err: any) {
      console.error('Error fetching announcements:', err);
      setError('Failed to load announcements. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [user]);

  const isNew = (createdAtString: string) => {
    const diffMs = new Date().getTime() - new Date(createdAtString).getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours < 24;
  };

  const handleAcknowledge = async (annId: string) => {
    if (!user?.staffId) return;
    try {
      const { error: insertErr } = await supabase
        .from('announcement_acknowledgements')
        .insert({
          announcement_id: annId,
          staff_id: user.staffId
        });
      if (insertErr) throw insertErr;
      setAcknowledgedIds(prev => [...prev, annId]);
    } catch (err) {
      console.error('Error acknowledging announcement:', err);
      alert('Failed to record acknowledgement. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[50px] w-full" />
        <div className="skeleton h-[120px] w-full" />
        <div className="skeleton h-[120px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3 shadow-sm flex items-center justify-between">
        <span className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider">Updates & Announcements</span>
        <button
          onClick={fetchAnnouncements}
          className="p-1.5 text-[var(--text-secondary)] hover:text-[#1A1A1A] transition-all active:scale-90"
          title="Refresh"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {error && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-[var(--danger)] p-4 rounded-xl text-xs font-bold flex items-center space-x-2">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Announcements Feed */}
      {announcements.length === 0 ? (
        <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center mx-auto mb-3 text-[var(--text-secondary)]">
            <Megaphone size={20} strokeWidth={1.5} />
          </div>
          <h4 className="font-extrabold text-sm text-[#1A1A1A]">All quiet here</h4>
          <p className="text-xs text-[var(--text-muted)] font-bold mt-1 max-w-[200px] mx-auto leading-relaxed">
            There are no recent announcements for your branch.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => {
            const hasNewBadge = isNew(ann.created_at);
            const isAcked = acknowledgedIds.includes(ann.id);
            return (
              <div
                key={ann.id}
                className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 shadow-sm flex flex-col space-y-3 relative overflow-hidden"
              >
                {/* Visual accent left line if new */}
                {hasNewBadge && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--warning)]" />
                )}

                <div className="flex items-start justify-between">
                  <h3 className="font-extrabold text-sm text-[#1A1A1A] leading-tight pr-2">
                    {ann.title}
                  </h3>
                  {hasNewBadge && (
                    <span className="bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/20 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse flex-shrink-0">
                      New
                    </span>
                  )}
                </div>

                <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed whitespace-pre-wrap break-words">
                  {ann.message}
                </p>

                {/* Acknowledgement trigger button if required */}
                {ann.requires_acknowledgement && (
                  <div className="pt-2">
                    {isAcked ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-extrabold bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1">
                        ✓ Read & Understood
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(ann.id)}
                        className="bg-[#1A1A1A] hover:bg-[#333333] text-white font-extrabold text-[10px] px-3.5 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer shadow-sm uppercase tracking-wider"
                      >
                        Acknowledge Read & Understood
                      </button>
                    )}
                  </div>
                )}

                <div className="border-t border-[var(--border)] pt-2.5 flex items-center justify-between text-[10px] font-bold text-[var(--text-muted)]">
                  <div className="flex items-center space-x-1">
                    <User size={12} className="text-[var(--text-muted)]" />
                    <span>Posted by: {ann.created_by}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Calendar size={12} className="text-[var(--text-muted)]" />
                    <span>
                      {new Date(ann.created_at).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

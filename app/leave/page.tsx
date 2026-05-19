'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type TabType = 'pending' | 'approved' | 'rejected';

const SkeletonCard = () => (
  <div style={{
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: '12px',
    height: '72px',
    marginBottom: '8px',
  }} />
);

export default function LeaveRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pending');

  const fetchRequests = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setFetchError(false);
    try {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, staff:staff_id(*)')
        .order('requested_at', { ascending: false });
      
      if (error) throw error;
      if (data) setRequests(data);
    } catch (e) {
      console.error('Error fetching leave requests:', e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    // Subscribe to leave_requests changes
    const channel = supabase
      .channel('leave-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        fetchRequests(true); // background refresh
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    // Optimistic UI
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status, approved_by: user?.email } : r));
    
    try {
      await supabase.from('leave_requests').update({ 
        status, 
        approved_by: user?.email 
      }).eq('id', id);
    } catch (e) {
      console.error('Error performing leave action:', e);
      fetchRequests(); // revert on fail
    }
  };

  const pending = requests.filter(r => r.status === 'pending');
  const approved = requests.filter(r => r.status === 'approved');
  const rejected = requests.filter(r => r.status === 'rejected');

  const visibleData = activeTab === 'pending' ? pending : activeTab === 'approved' ? approved : rejected;

  const formatDate = (dStr: string) => {
    const d = new Date(dStr);
    const day = d.getDate();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const timeAgo = (dateStr: string) => {
    const ms = Date.now() - new Date(dateStr).getTime();
    const hrs = Math.floor(ms / 3600000);
    if (hrs < 1) return 'Just now';
    if (hrs < 24) return `Requested ${hrs} hour${hrs>1?'s':''} ago`;
    return `Requested ${Math.floor(hrs/24)} day${Math.floor(hrs/24)>1?'s':''} ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Leave Requests</h1>
          <div className="flex items-center space-x-2 mt-1">
            <span className="bg-brand-accent text-[#111] text-xs font-bold px-2 py-0.5 rounded-full">{pending.length} pending</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'pending', label: 'Pending', count: pending.length },
          { id: 'approved', label: 'Approved', count: approved.length },
          { id: 'rejected', label: 'Rejected', count: rejected.length }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as TabType)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center space-x-2 transition-colors ${
              activeTab === t.id ? 'bg-[#111] text-white shadow' : 'text-gray-600 hover:text-[#111]'
            }`}
          >
            <span>{t.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === t.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {fetchError ? (
        <div className="py-12 text-center bg-red-50 border border-red-300 rounded-2xl p-6 my-4">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-bold text-red-700 mb-1">Could not load data. Check connection.</h3>
          <p className="text-xs text-red-500 mb-4">Please verify your internet connection.</p>
          <button 
            onClick={() => fetchRequests()} 
            className="bg-brand-accent text-[#111] font-bold px-6 py-2.5 rounded-xl active:scale-95 transition-transform"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : visibleData.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-4 opacity-50">🌴</div>
          <div className="text-lg font-bold text-gray-500">No {activeTab} requests</div>
        </div>
      ) : (

        <div className="space-y-4">
          {visibleData.map(r => (
            <div key={r.id} className="nearbi-card p-4">
              <div className="flex items-start space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-brand-accent/20 text-brand-accent font-bold text-lg flex items-center justify-center flex-shrink-0">
                  {r.staff?.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-bold">{r.staff?.name}</div>
                  <div className="text-xs text-gray-500 font-medium">
                    {r.staff?.department} • <span className="capitalize">{r.staff?.branch_id}</span>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 font-medium text-right">
                  {timeAgo(r.requested_at)}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 mb-4 border border-gray-100">
                <div className="text-sm font-bold text-[#111] mb-1">
                  📅 {formatDate(r.date)}
                </div>
                <div className="text-sm text-gray-600">
                  <span className="text-gray-400 mr-1">Reason:</span> 
                  {r.reason || 'No reason provided'}
                </div>
              </div>

              {activeTab === 'pending' && (
                <div className="flex space-x-3">
                  <button onClick={() => handleAction(r.id, 'rejected')} className="flex-1 py-2 rounded-xl border border-[#D32F2F] text-[#D32F2F] font-bold text-sm active:bg-red-50">
                    ✕ Reject
                  </button>
                  <button onClick={() => handleAction(r.id, 'approved')} className="flex-1 py-2 rounded-xl bg-brand-accent text-[#111] font-bold text-sm hover:bg-[#E09900]">
                    ✓ Approve
                  </button>
                </div>
              )}

              {activeTab !== 'pending' && (
                <div className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center ${activeTab === 'approved' ? 'bg-[#E8F5E9] text-[#2E7D32]' : 'bg-[#FFEBEE] text-[#D32F2F]'}`}>
                  <span className="mr-2">{activeTab === 'approved' ? '✓' : '✕'}</span>
                  {activeTab === 'approved' ? `Approved by ${r.approved_by}` : 'Rejected'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

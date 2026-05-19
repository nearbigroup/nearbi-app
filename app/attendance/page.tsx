'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type StatusFilter = 'All' | 'Present' | 'Late' | 'Absent' | 'Checked Out';
type BranchFilter = 'All' | 'daily' | 'hypermarket';

export default function Attendance() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [branchFilter, setBranchFilter] = useState<BranchFilter>('All');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const fetchAttendance = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setFetchError(false);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get all active staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*, shift:shifts(*)')
        .eq('active', true);
      if (staffError) throw staffError;

      // Get today's attendance
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', today);
      if (attendanceError) throw attendanceError;

      const staff = staffData || [];
      const attendance = attendanceData || [];

      const combined = staff.map(s => {
        const record = attendance.find(a => a.staff_id === s.id);
        return {
          ...s,
          attendance: record || { status: 'absent' }
        };
      });

      setData(combined);
    } catch (e) {
      console.error(e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();

    // Subscribe to attendance Postgres changes
    const channel = supabase
      .channel('attendance-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        fetchAttendance(true); // background refresh
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredData = data.filter(item => {
    if (branchFilter !== 'All' && item.branch_id !== branchFilter) return false;
    
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Checked Out' && item.attendance.check_out_time) return true;
    if (statusFilter === 'Checked Out') return false;
    
    if (statusFilter.toLowerCase() === item.attendance.status) {
      return true;
    }
    
    return false;
  });

  const getStatusColor = (status: string) => {
    if (status === 'present') return 'bg-[#E8F5E9] text-[#2E7D32]';
    if (status === 'late') return 'bg-[#FFF3E0] text-[#E65100]';
    return 'bg-[#FFEBEE] text-[#D32F2F]';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-brand-text-secondary text-sm">Today's register</p>
        </div>
        <button 
          onClick={() => fetchAttendance()}
          className="text-sm font-medium border border-gray-300 rounded-lg px-3 py-1.5 active:bg-gray-100 min-h-[44px] flex items-center justify-center cursor-pointer"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Branch Filters */}
      <div className="flex space-x-2 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'All', label: 'All Branches' },
          { id: 'daily', label: 'Daily' },
          { id: 'hypermarket', label: 'Hypermarket' }
        ].map(b => (
          <button
            key={b.id}
            onClick={() => setBranchFilter(b.id as BranchFilter)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              branchFilter === b.id ? 'bg-[#111] text-white shadow' : 'text-gray-600 hover:text-[#111]'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Status Pills Scrollable */}
      <div className="flex overflow-x-auto space-x-2 pb-2 scrollbar-hide">
        {['All', 'Present', 'Late', 'Absent', 'Checked Out'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s as StatusFilter)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              statusFilter === s 
                ? 'bg-[#111] text-white border-[#111]' 
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* List */}
      {fetchError ? (
        <div className="py-12 text-center bg-red-50 border border-red-200 rounded-2xl p-6">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-bold text-red-700 mb-1">Failed to load attendance register</h3>
          <p className="text-sm text-red-500 mb-4">Please check your internet connection and try again.</p>
          <button 
            onClick={() => fetchAttendance()} 
            className="bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl active:scale-95 transition-transform"
          >
            Retry Connection
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse"></div>
          ))}
        </div>
      ) : filteredData.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-4 opacity-50">📋</div>
          <div className="text-lg font-bold text-gray-500">No staff found</div>
          <p className="text-sm text-gray-400">Try changing your filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredData.map(item => (
            <div key={item.id} className="nearbi-card p-4 relative flex items-start space-x-3">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full bg-brand-accent text-[#111] font-bold text-xl flex items-center justify-center flex-shrink-0">
                {item.name.charAt(0).toUpperCase()}
              </div>
              
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-lg leading-tight">{item.name}</div>
                    <div className="text-xs text-gray-500 font-medium">{item.department} • {item.shift?.label}</div>
                  </div>
                  
                  {/* Status Badge */}
                  <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${getStatusColor(item.attendance.status)}`}>
                    {item.attendance.status}
                  </div>
                </div>

                {/* Times & Photos */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.attendance.check_in_time && (
                    <div className="flex items-center space-x-1.5 bg-[#E8F5E9]/50 border border-[#2E7D32]/20 px-2 py-1 rounded">
                      <span className="text-[#2E7D32] text-xs font-bold">IN: {item.attendance.check_in_time}</span>
                      {item.attendance.check_in_photo && (
                        <button 
                          onClick={() => setSelectedPhoto(item.attendance.check_in_photo)}
                          className="min-h-[24px] flex items-center justify-center cursor-pointer"
                        >
                          <img src={item.attendance.check_in_photo} alt="check in" className="w-5 h-5 rounded-full object-cover border border-gray-300" />
                        </button>
                      )}
                    </div>
                  )}

                  {item.attendance.minutes_late > 0 && (
                    <div className="flex items-center bg-[#FFF3E0]/50 border border-[#E65100]/20 px-2 py-1 rounded">
                      <span className="text-[#E65100] text-xs font-bold">{item.attendance.minutes_late} min late</span>
                    </div>
                  )}

                  {item.attendance.check_out_time && (
                    <div className="flex items-center space-x-1.5 bg-blue-50 border border-blue-200 px-2 py-1 rounded">
                      <span className="text-blue-700 text-xs font-bold">OUT: {item.attendance.check_out_time}</span>
                      {item.attendance.check_out_photo && (
                        <button 
                          onClick={() => setSelectedPhoto(item.attendance.check_out_photo)}
                          className="min-h-[24px] flex items-center justify-center cursor-pointer"
                        >
                          <img src={item.attendance.check_out_photo} alt="check out" className="w-5 h-5 rounded-full object-cover border border-gray-300" />
                        </button>
                      )}
                    </div>
                  )}

                  {item.attendance.ot_minutes > 0 && (
                    <div className="flex items-center bg-blue-100 border border-blue-300 px-2 py-1 rounded">
                      <span className="text-blue-800 text-xs font-bold">
                        OT: {Math.floor(item.attendance.ot_minutes/60)}h {item.attendance.ot_minutes%60}m
                      </span>
                    </div>
                  )}
                </div>

                <div className="absolute bottom-2 right-3 text-[10px] text-gray-400 font-medium capitalize">
                  {item.branch_id}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in" onClick={() => setSelectedPhoto(null)}>
          <button className="absolute top-6 right-6 text-white text-3xl font-light" onClick={() => setSelectedPhoto(null)}>×</button>
          <img src={selectedPhoto} alt="Attendance photo" className="max-w-full max-h-[80vh] rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}

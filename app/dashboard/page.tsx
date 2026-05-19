'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface DashboardData {
  stats: {
    daily: { present: number; late: number; absent: number; total: number };
    hypermarket: { present: number; late: number; absent: number; total: number };
  };
  lateStaff: any[];
  absentStaff: any[];
  pendingLeaves: number;
}

export default function Dashboard() {
  const { user, canSeeSalaryBreakdown } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const fetchData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setFetchError(false);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch all active staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, name, branch_id, shift:shifts(start_time)')
        .eq('active', true);
      if (staffError) throw staffError;
      
      // Fetch today's attendance
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('staff_id, status, minutes_late, check_in_time')
        .eq('date', today);
      if (attendanceError) throw attendanceError;

      // Fetch pending leaves
      const { count: pendingLeavesCount, error: leavesError } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (leavesError) throw leavesError;

      const staff = staffData || [];
      const attendance = attendanceData || [];
      
      const stats = {
        daily: { present: 0, late: 0, absent: 0, total: 0 },
        hypermarket: { present: 0, late: 0, absent: 0, total: 0 },
      };
      
      const lateStaff: any[] = [];
      const absentStaff: any[] = [];

      staff.forEach((s) => {
        const b = s.branch_id as 'daily' | 'hypermarket';
        if (!stats[b]) return;
        
        stats[b].total++;
        
        const record = attendance.find((a) => a.staff_id === s.id);
        if (record) {
          if (record.status === 'present') {
            stats[b].present++;
          } else if (record.status === 'late') {
            stats[b].late++;
            
            let mins = record.minutes_late;
            if ((!mins || mins === 0) && record.check_in_time && s.shift?.start_time) {
              const [ch, cm] = record.check_in_time.split(':').map(Number);
              const [sh, sm] = s.shift.start_time.split(':').map(Number);
              mins = (ch * 60 + cm) - (sh * 60 + sm);
              if (mins < 0) mins = 0;
            }
            
            lateStaff.push({ ...s, minutes_late: mins });
          } else if (record.status === 'absent') {
            stats[b].absent++;
            absentStaff.push(s);
          }
        } else {
          // No record means absent today
          stats[b].absent++;
          absentStaff.push(s);
        }
      });

      setData({
        stats,
        lateStaff,
        absentStaff,
        pendingLeaves: pendingLeavesCount || 0,
      });
    } catch (e) {
      console.error('Error fetching dashboard data', e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // 30 seconds fallback interval
    const interval = setInterval(() => {
      fetchData(true);
    }, 30000);

    // Subscribe to attendance Postgres changes
    const channel = supabase
      .channel('dashboard-attendance-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        fetchData(true); // background refresh
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const formatDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning 👋';
    if (hour < 18) return 'Good afternoon 👋';
    return 'Good evening 👋';
  };

  if (fetchError) {
    return (
      <div className="py-12 text-center bg-red-50 border border-red-200 rounded-2xl p-6">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="text-lg font-bold text-red-700 mb-1">Failed to load dashboard</h3>
        <p className="text-sm text-red-500 mb-4">Please check your internet connection and try again.</p>
        <button 
          onClick={() => fetchData()} 
          className="bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl active:scale-95 transition-transform"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-gray-200 rounded-xl"></div>
        <div className="space-y-4">
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
        </div>
        <div className="h-48 bg-gray-200 rounded-xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-brand-text-secondary text-sm font-medium mb-1">{formatDate()}</p>
        <h1 className="text-2xl font-bold">{getGreeting()}</h1>
      </div>

      {/* Branch Attendance Cards */}
      <div className="space-y-4">
        {[
          { id: 'daily', name: 'Nearbi Daily' },
          { id: 'hypermarket', name: 'Nearbi Hypermarket' },
        ].map((branch) => {
          const s = data?.stats[branch.id as 'daily' | 'hypermarket'];
          if (!s) return null;
          return (
            <div key={branch.id} className="nearbi-card border-l-4 border-l-brand-accent overflow-hidden">
              <h2 className="font-bold text-lg mb-3">{branch.name}</h2>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-[#E8F5E9] rounded-lg py-2">
                  <div className="text-xl font-bold text-[#2E7D32]">{s.present}</div>
                  <div className="text-[10px] font-medium text-[#2E7D32] uppercase">Present</div>
                </div>
                <div className="bg-[#FFF3E0] rounded-lg py-2">
                  <div className="text-xl font-bold text-[#E65100]">{s.late}</div>
                  <div className="text-[10px] font-medium text-[#E65100] uppercase">Late</div>
                </div>
                <div className="bg-[#FFEBEE] rounded-lg py-2">
                  <div className="text-xl font-bold text-[#D32F2F]">{s.absent}</div>
                  <div className="text-[10px] font-medium text-[#D32F2F] uppercase">Absent</div>
                </div>
                <div className="bg-gray-100 rounded-lg py-2">
                  <div className="text-xl font-bold text-gray-700">{s.total}</div>
                  <div className="text-[10px] font-medium text-gray-500 uppercase">Total</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Alerts */}
      {data && (data.lateStaff.length > 0 || data.absentStaff.length > 0 || data.pendingLeaves > 0) && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-400 uppercase text-xs tracking-wider">Alerts</h3>
          
          {data.lateStaff.length > 0 && (
            <div className="bg-[#FFF8E7] border border-brand-accent/30 rounded-xl p-4">
              <div className="font-bold text-[#E65100] flex items-center mb-2">
                <span className="mr-2">⏰</span> {data.lateStaff.length} staff arrived late today
              </div>
              <ul className="text-sm text-gray-700 space-y-1 ml-6">
                {data.lateStaff.map((s, i) => (
                  <li key={i}>{s.name} — <span className="font-medium text-[#E65100]">{s.minutes_late} mins late</span></li>
                ))}
              </ul>
            </div>
          )}

          {data.absentStaff.length > 0 && (
            <div className="bg-[#FFEBEE] border border-[#D32F2F]/30 rounded-xl p-4">
              <div className="font-bold text-[#D32F2F] flex items-center">
                <span className="mr-2">❌</span> {data.absentStaff.length} staff absent today
              </div>
            </div>
          )}

          {data.pendingLeaves > 0 && (
            <Link href="/leave" className="block bg-[#FFF8E7] border border-brand-accent/30 rounded-xl p-4 active:scale-95 transition-transform">
              <div className="font-bold text-brand-accent flex items-center">
                <span className="mr-2">📋</span> {data.pendingLeaves} leave requests pending approval
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h3 className="font-bold text-gray-400 uppercase text-xs tracking-wider mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-[10px]">
          <Link href="/attendance" className="bg-white border border-[#E0E0E0] rounded-xl p-4 min-h-[56px] flex flex-col items-center justify-center hover:border-brand-accent active:border-brand-accent active:bg-gray-50 transition-colors">
            <span className="text-[13px] font-bold text-black text-center">Attendance</span>
          </Link>
          <Link href="/staff" className="bg-white border border-[#E0E0E0] rounded-xl p-4 min-h-[56px] flex flex-col items-center justify-center hover:border-brand-accent active:border-brand-accent active:bg-gray-50 transition-colors">
            <span className="text-[13px] font-bold text-black text-center">Manage Staff</span>
          </Link>
          <Link href="/leave" className="bg-white border border-[#E0E0E0] rounded-xl p-4 min-h-[56px] flex flex-col items-center justify-center hover:border-brand-accent active:border-brand-accent active:bg-gray-50 transition-colors">
            <span className="text-[13px] font-bold text-black text-center">Leave Requests</span>
          </Link>
          {canSeeSalaryBreakdown && (
            <Link href="/salary" className="bg-white border border-[#E0E0E0] rounded-xl p-4 min-h-[56px] flex flex-col items-center justify-center hover:border-brand-accent active:border-brand-accent active:bg-gray-50 transition-colors">
              <span className="text-[13px] font-bold text-black text-center">Salary</span>
            </Link>
          )}
          <Link href="/kiosk" className="bg-white border border-[#E0E0E0] rounded-xl p-4 min-h-[56px] flex flex-col items-center justify-center hover:border-brand-accent active:border-brand-accent active:bg-gray-50 transition-colors col-span-2">
            <span className="text-[13px] font-bold text-black text-center">Open Staff Kiosk</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

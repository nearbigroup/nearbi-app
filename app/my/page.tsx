'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Calendar, User, Clock, AlertTriangle, CheckCircle, ChevronRight, Award } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface FineItem {
  id: string;
  date: string;
  type: 'late' | 'special';
  amount: number;
  reason?: string;
  status: 'confirmed' | 'pending' | 'waived';
  colorCode: 'green' | 'yellow' | 'orange' | 'red';
}

export default function StaffHomePage() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [staffInfo, setStaffInfo] = useState<any>(null);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0 });
  const [score, setScore] = useState<number | null>(null);
  const [fines, setFines] = useState<FineItem[]>([]);
  const [totalFines, setTotalFines] = useState(0);
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);

  useEffect(() => {
    if (!user || !user.staffId) return;

    const fetchData = async () => {
      try {
        const currentMonth = new Date().toISOString().slice(0, 7);

        // 1. Fetch Staff Info
        const { data: sData, error: sErr } = await supabase
          .from('staff')
          .select('*, shift:shifts(*)')
          .eq('id', user.staffId)
          .single();
        if (sErr) throw sErr;
        setStaffInfo(sData);

        // 2. Fetch Attendance for Current Month
        const { data: attData, error: attErr } = await supabase
          .from('attendance')
          .select('*')
          .eq('staff_id', user.staffId)
          .gte('date', `${currentMonth}-01`)
          .lte('date', `${currentMonth}-31`);
        if (attErr) throw attErr;

        const daysPresent = attData?.filter(a => a.check_in_time && a.status !== 'absent').length || 0;
        const daysLate = attData?.filter(a => a.status === 'late').length || 0;
        const daysAbsent = attData?.filter(a => a.status === 'absent').length || 0;
        setStats({ present: daysPresent, late: daysLate, absent: daysAbsent });

        // 3. Fetch Performance Score
        const { data: pScore, error: pErr } = await supabase
          .from('performance_scores')
          .select('*')
          .eq('staff_id', user.staffId)
          .eq('month', currentMonth)
          .maybeSingle();
        if (!pErr && pScore && pScore.visible_to_staff) {
          setScore(pScore.total_score);
        } else {
          setScore(null);
        }

        // 4. Fetch Fines
        const { data: lateFinesData, error: lfErr } = await supabase
          .from('late_fines')
          .select('*')
          .eq('staff_id', user.staffId)
          .eq('month', currentMonth);
        if (lfErr) throw lfErr;

        const { data: specialFinesData, error: sfErr } = await supabase
          .from('special_fines')
          .select('*')
          .eq('staff_id', user.staffId)
          .eq('month', currentMonth);
        if (sfErr) throw sfErr;

        const combinedFines: FineItem[] = [];
        let totalFinesAmt = 0;

        (lateFinesData || []).forEach(f => {
          const waived = !!f.waived;
          const amt = Number(f.fine_amount || 0);
          if (!waived) {
            totalFinesAmt += amt;
          }
          combinedFines.push({
            id: f.id,
            date: f.date,
            type: 'late',
            amount: amt,
            reason: `Late Clock-In (${f.late_minutes} mins)`,
            status: waived ? 'waived' : 'confirmed',
            colorCode: f.color_code || 'yellow'
          });
        });

        (specialFinesData || []).forEach(f => {
          const waived = !!f.waived;
          const confirmed = !!f.confirmed;
          const amt = f.edited_amount !== null && f.edited_amount !== undefined ? Number(f.edited_amount) : Number(f.amount);
          
          if (confirmed && !waived) {
            totalFinesAmt += amt;
          }

          let status: 'confirmed' | 'pending' | 'waived' = 'pending';
          if (waived) status = 'waived';
          else if (confirmed) status = 'confirmed';

          combinedFines.push({
            id: f.id,
            date: f.date,
            type: 'special',
            amount: amt,
            reason: f.reason,
            status,
            colorCode: 'red'
          });
        });

        // Sort fines by date descending
        combinedFines.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setFines(combinedFines);
        setTotalFines(totalFinesAmt);

        // 5. Fetch Recent Attendance (Last 5 days)
        const { data: recAtt, error: recErr } = await supabase
          .from('attendance')
          .select('*')
          .eq('staff_id', user.staffId)
          .order('date', { ascending: false })
          .limit(5);
        if (recErr) throw recErr;
        setRecentAttendance(recAtt || []);

      } catch (err) {
        console.error('Error fetching staff home data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  const getStatusBadge = (rec: any) => {
    if (!rec || !rec.check_in_time) {
      return (
        <span className="bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger)]/20 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
          Absent
        </span>
      );
    }
    if (rec.status === 'late') {
      return (
        <span className="bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/20 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
          Late
        </span>
      );
    }
    return (
      <span className="bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/20 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
        Present
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[120px] w-full" />
        <div className="skeleton h-[70px] w-full" />
        <div className="skeleton h-[180px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Staff Info Card */}
      {staffInfo && (
        <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 flex items-start space-x-3.5 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-dark)] text-white border border-[var(--bg-dark)] font-bold text-lg flex items-center justify-center flex-shrink-0">
            {staffInfo.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-extrabold text-base text-[#1A1A1A] leading-tight truncate">
              {staffInfo.name}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] font-bold mt-0.5">
              {staffInfo.department} • <span className="capitalize">{getBranchLabel(staffInfo.branch_id)}</span>
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] text-[10px] font-bold px-2 py-0.5 rounded">
                Shift: {staffInfo.shift?.label || 'None'} ({staffInfo.shift?.start_time} - {staffInfo.shift?.end_time})
              </span>
              {staffInfo.join_date && (
                <span className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] text-[10px] font-bold px-2 py-0.5 rounded">
                  Joined: {new Date(staffInfo.join_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats Row */}
      <div className={`grid ${score !== null ? 'grid-cols-4' : 'grid-cols-3'} gap-2.5`}>
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3 text-center flex flex-col items-center shadow-sm">
          <span className="text-[10px] text-[var(--text-muted)] font-extrabold uppercase tracking-wider mb-1">Present</span>
          <span className="text-xl font-black text-[var(--success)]">{stats.present}</span>
        </div>
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3 text-center flex flex-col items-center shadow-sm">
          <span className="text-[10px] text-[var(--text-muted)] font-extrabold uppercase tracking-wider mb-1">Late</span>
          <span className="text-xl font-black text-[var(--warning)]">{stats.late}</span>
        </div>
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3 text-center flex flex-col items-center shadow-sm">
          <span className="text-[10px] text-[var(--text-muted)] font-extrabold uppercase tracking-wider mb-1">Absent</span>
          <span className="text-xl font-black text-[var(--danger)]">{stats.absent}</span>
        </div>
        {score !== null && (
          <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3 text-center flex flex-col items-center shadow-sm">
            <span className="text-[10px] text-[var(--text-muted)] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-0.5">
              <Award size={10} className="text-[#FBBF24]" /> Score
            </span>
            <span className="text-xl font-black text-[#1A1A1A]">{score}</span>
          </div>
        )}
      </div>

      {/* Fines Section */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 flex flex-col shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-3">
          <h3 className="font-extrabold text-sm text-[#1A1A1A]">This Month's Fines</h3>
          <span className={`font-black text-sm ${totalFines > 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
            ₹{totalFines.toLocaleString()}
          </span>
        </div>

        {fines.length === 0 ? (
          <div className="py-2 text-center text-xs font-bold text-[var(--success)] flex items-center justify-center space-x-1.5">
            <CheckCircle size={14} />
            <span>No fines this month</span>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
            {fines.map((f) => (
              <div key={f.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[var(--text-muted)] font-bold">
                    {new Date(f.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-[11px] text-[#1A1A1A] font-bold leading-tight mt-0.5">
                    {f.reason}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                    f.status === 'waived'
                      ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-strong)]'
                      : f.status === 'pending'
                      ? 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning)]/20'
                      : 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger)]/20'
                  }`}>
                    {f.status}
                  </span>
                  <span className="font-bold text-xs text-[#1A1A1A]">
                    ₹{f.amount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Attendance */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 flex flex-col shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-3">
          <h3 className="font-extrabold text-sm text-[#1A1A1A]">Recent Attendance</h3>
          <button
            onClick={() => router.push('/my/attendance')}
            className="text-[10px] text-[var(--text-secondary)] hover:text-[#1A1A1A] font-extrabold flex items-center active:scale-95 transition-all"
          >
            <span>View all</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {recentAttendance.length === 0 ? (
          <div className="py-2 text-center text-xs font-semibold text-[var(--text-muted)]">
            No clock logs found.
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentAttendance.map((rec) => (
              <div key={rec.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-[var(--text-muted)] font-bold">
                    {new Date(rec.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', weekday: 'short' })}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)] font-bold mt-0.5">
                    {rec.check_in_time ? `IN: ${rec.check_in_time}` : '—'} 
                    {rec.check_out_time ? ` · OUT: ${rec.check_out_time}` : ''}
                  </span>
                </div>
                <div>{getStatusBadge(rec)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

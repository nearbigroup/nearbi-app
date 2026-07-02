'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Calendar, User, Clock, AlertTriangle, CheckCircle, ChevronRight, Award, Megaphone, Bell, Sparkles, X, Info, Coins } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatTime12hr } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  message: string;
  created_by: string;
  branch_id: string | null;
  target: 'all' | 'daily' | 'hypermarket';
  created_at: string;
}

export default function StaffHomePage() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [staffInfo, setStaffInfo] = useState<any>(null);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0, weeklyOffs: 0, lateCount: 0, earlyExits: 0, requiredDays: 0, percentage: 0 });
  const [score, setScore] = useState<number | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [featuredAnnouncement, setFeaturedAnnouncement] = useState<Announcement | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [tomorrowShift, setTomorrowShift] = useState<string>('');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [dobInput, setDobInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!user || !user.staffId) return;

    const fetchData = async () => {
      try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const year = parseInt(currentMonth.split('-')[0]);
        const monthNum = parseInt(currentMonth.split('-')[1]);
        const calendarDays = new Date(year, monthNum, 0).getDate();

        // 1. Fetch Staff Info
        const { data: sData, error: sErr } = await supabase
          .from('staff')
          .select('*, shift:shifts(*)')
          .eq('id', user.staffId)
          .single();
        if (sErr) throw sErr;
        setStaffInfo(sData);

        if (sData.profile_pending) {
          const isReminded = sessionStorage.getItem('profile_reminded');
          if (!isReminded) {
            setShowCompletionModal(true);
            if (sData.date_of_birth) {
              setDobInput(sData.date_of_birth);
            }
          }
        }

        // 2. Fetch Attendance for Current Month
        const { data: attData, error: attErr } = await supabase
          .from('attendance')
          .select('*')
          .eq('staff_id', user.staffId)
          .gte('date', `${currentMonth}-01`)
          .lte('date', `${currentMonth}-${calendarDays}`);
        if (attErr) throw attErr;

        // Fetch approved leaves
        const { data: leavesData } = await supabase
          .from('leave_requests')
          .select('date')
          .eq('staff_id', user.staffId)
          .eq('status', 'approved')
          .gte('date', `${currentMonth}-01`)
          .lte('date', `${currentMonth}-${calendarDays}`);

        const approvedLeaveDates = new Set(leavesData?.map(l => l.date) || []);

        const daysPresent = attData?.filter(a => a.check_in_time && a.status !== 'absent').length || 0;
        const daysLate = attData?.filter(a => a.status === 'late').length || 0;
        const todayStr = new Date().toISOString().split('T')[0];
        const daysAbsent = attData?.filter(a => {
          if (a.status !== 'absent') return false;
          if (a.day_type === 'weekly_off' || a.day_type === 'holiday') return false;
          if (approvedLeaveDates.has(a.date)) return false;
          if (a.date === todayStr && sData.shift?.start_time) {
            const now = new Date();
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const [sh, sm] = sData.shift.start_time.split(':').map(Number);
            const shiftStartMins = sh * 60 + sm;
            if (nowMins < shiftStartMins + 30) {
              return false;
            }
          }
          return true;
        }).length || 0;
        const earlyExitsCount = attData?.filter(a => (a.early_leave_minutes || 0) > 0).length || 0;

        const offDaysCount = sData.off_days_per_month || 4;

        const monthStart = new Date(year, monthNum - 1, 1);
        const joinDate = sData.join_date ? new Date(sData.join_date) : monthStart;
        const effectiveStart = joinDate > monthStart ? joinDate : monthStart;
        const todayObj = new Date();
        const effectiveStartZero = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), effectiveStart.getDate());
        const todayZero = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
        
        const daysAvailable = Math.max(1, Math.floor(
          (todayZero.getTime() - effectiveStartZero.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1);

        const attendancePercentage = Math.min(100,
          Math.round((daysPresent / daysAvailable) * 100)
        );

        setStats({
          present: daysPresent,
          late: daysLate,
          absent: daysAbsent,
          weeklyOffs: offDaysCount,
          lateCount: daysLate,
          earlyExits: earlyExitsCount,
          requiredDays: daysAvailable,
          percentage: attendancePercentage
        });

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

        // 4. Fetch Announcements
        const { data: annData } = await supabase
          .from('staff_announcements')
          .select('*')
          .or(`target.eq.all,target.eq.${sData.branch_id},target_staff_id.eq.${user.staffId}`)
          .order('created_at', { ascending: false });

        if (annData) {
          setAnnouncements(annData);
          
          // Check read status in DB announcement_reads
          const { data: readLogs } = await supabase
            .from('announcement_reads')
            .select('announcement_id')
            .eq('staff_id', user.staffId);
            
          const readIds = new Set(readLogs?.map(r => r.announcement_id) || []);
          const unread = annData.filter((a: any) => !readIds.has(a.id));
          setUnreadCount(unread.length);
          
          if (unread.length > 0) {
            setFeaturedAnnouncement(unread[0]);
          } else {
            setFeaturedAnnouncement(null);
          }
        }

        // 5. Calculate Tomorrow's Shift
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDay = tomorrow.getDay(); // 0 is Sunday, etc.
        
        // Simple logic: check if tomorrow is standard weekly off (e.g. Sunday for 4-off staff, or based on shift label)
        // Usually, tomorrow's shift is their regular shift unless it is an off day.
        if (sData.shift) {
          setTomorrowShift(`${formatTime12hr(sData.shift.start_time)} - ${formatTime12hr(sData.shift.end_time)} (${sData.shift.label})`);
        } else {
          setTomorrowShift('No shift scheduled');
        }

      } catch (err) {
        console.error('Error fetching staff home data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleDismissAnnouncement = async (annId: string) => {
    if (!user?.staffId) return;
    try {
      await supabase
        .from('announcement_reads')
        .upsert({
          announcement_id: annId,
          staff_id: user.staffId,
          read_on_kiosk: false,
          read_at: new Date().toISOString()
        }, { onConflict: 'announcement_id,staff_id' });
        
      // Re-fetch data to update UI
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const year = parseInt(currentMonth.split('-')[0]);
      const monthNum = parseInt(currentMonth.split('-')[1]);
      const calendarDays = new Date(year, monthNum, 0).getDate();
      
      const { data: annData } = await supabase
        .from('staff_announcements')
        .select('*')
        .or(`target.eq.all,target.eq.${staffInfo?.branch_id},target_staff_id.eq.${user.staffId}`)
        .order('created_at', { ascending: false });

      if (annData) {
        setAnnouncements(annData);
        const { data: readLogs } = await supabase
          .from('announcement_reads')
          .select('announcement_id')
          .eq('staff_id', user.staffId);
          
        const readIds = new Set(readLogs?.map(r => r.announcement_id) || []);
        const unread = annData.filter((a: any) => !readIds.has(a.id));
        setUnreadCount(unread.length);
        
        if (unread.length > 0) {
          setFeaturedAnnouncement(unread[0]);
        } else {
          setFeaturedAnnouncement(null);
        }
      }
    } catch (e) {
      console.error('Failed to dismiss announcement:', e);
    }
  };

  const handleOpenAnnouncement = async (ann: Announcement) => {
    setSelectedAnnouncement(ann);
    await handleDismissAnnouncement(ann.id);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.staffId || !dobInput) return;

    setSavingProfile(true);
    try {
      const { error: staffErr } = await supabase
        .from('staff')
        .update({
          date_of_birth: dobInput,
          profile_pending: false
        })
        .eq('id', user.staffId);

      if (staffErr) throw staffErr;

      const { error: accountErr } = await supabase
        .from('staff_accounts')
        .update({
          profile_completed: true
        })
        .eq('staff_id', user.staffId);

      if (accountErr) throw accountErr;

      setStaffInfo((prev: any) => ({
        ...prev,
        profile_pending: false,
        date_of_birth: dobInput
      }));
      setShowCompletionModal(false);
      alert('Profile completed successfully!');
    } catch (err) {
      console.error('Error completing profile:', err);
      alert('Failed to save profile details.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRemindLater = () => {
    sessionStorage.setItem('profile_reminded', 'true');
    setShowCompletionModal(false);
  };

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[120px] w-full rounded-2xl" />
        <div className="skeleton h-[70px] w-full rounded-xl" />
        <div className="skeleton h-[180px] w-full rounded-2xl" />
        <div className="skeleton h-[100px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      
      {/* 1. Announcement Banner at Top (if unread exists) */}
      {featuredAnnouncement && (
        <div className="bg-gradient-to-r from-amber-50 to-amber-100/80 border border-amber-200/60 rounded-2xl p-4 shadow-sm flex items-start justify-between relative overflow-hidden transition-all duration-300 animate-in slide-in-from-top-4">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/20 rounded-full blur-xl -mr-8 -mt-8" />
          
          <div className="flex items-start space-x-3.5 z-10 flex-1 mr-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm animate-bounce">
              <Megaphone size={16} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenAnnouncement(featuredAnnouncement)}>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/50 px-1.5 py-0.5 rounded">Announcement</span>
                <span className="text-[9px] font-bold text-amber-600">New</span>
              </div>
              <h4 className="font-extrabold text-xs text-amber-900 mt-1 truncate">{featuredAnnouncement.title}</h4>
              <p className="text-[11px] text-amber-800/80 font-semibold mt-0.5 truncate leading-snug">
                {featuredAnnouncement.message.substring(0, 50)}...
              </p>
            </div>
          </div>

          <button
            onClick={() => handleDismissAnnouncement(featuredAnnouncement.id)}
            className="p-1 rounded-full text-amber-700 hover:bg-amber-200/40 transition-colors z-10"
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* 2. Staff Info Card (Premium Glassmorphism Style) */}
      {staffInfo && (
        <div className="bg-white border border-[#E8E8E8] rounded-2xl p-5 flex flex-col space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--bg-secondary)] rounded-full blur-3xl -mr-10 -mt-10" />
          
          <div className="flex items-start space-x-4 z-10">
            <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] text-white border-2 border-white shadow-md font-black text-2xl flex items-center justify-center flex-shrink-0">
              {staffInfo.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[9px] font-black tracking-widest text-[var(--text-muted)] uppercase">Welcome Back</span>
              <h2 className="font-black text-lg text-[#1A1A1A] leading-tight truncate">
                {staffInfo.name}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] font-extrabold mt-1 flex items-center">
                <span className="capitalize">{staffInfo.department}</span>
                <span className="mx-1.5 text-gray-300">•</span>
                <span className="capitalize">{getBranchLabel(staffInfo.branch_id)}</span>
              </p>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-100 pt-3 flex flex-wrap gap-2 z-10">
            <span className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] text-[10px] font-black px-2.5 py-1 rounded-lg">
              Shift: {staffInfo.shift?.label || 'None'} ({formatTime12hr(staffInfo.shift?.start_time)} - {formatTime12hr(staffInfo.shift?.end_time)})
            </span>
            {staffInfo.join_date && (
              <span className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] text-[10px] font-black px-2.5 py-1 rounded-lg">
                Member Since: {new Date(staffInfo.join_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. Outstanding Advance Balance (Conditional Banner) */}
      {staffInfo && Number(staffInfo.advance_balance || 0) > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Coins size={16} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] font-black text-emerald-800 uppercase tracking-wider leading-none">Advance Balance</p>
              <h4 className="text-[14px] font-black text-emerald-900 mt-1">
                Outstanding: ₹{Number(staffInfo.advance_balance).toLocaleString()}
              </h4>
            </div>
          </div>
          <div className="bg-emerald-100/50 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded border border-emerald-200/50">
            Deducted at source
          </div>
        </div>
      )}

      {/* 4. Quick Stats Section (Rich Layout) */}
      <div className="grid grid-cols-2 gap-3.5">
        
        {/* Attendance Percentage Circle Meter */}
        <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 flex flex-col items-center text-center justify-between shadow-sm relative overflow-hidden">
          <div className="w-full flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-wider">Attendance %</span>
            <Sparkles size={13} className="text-amber-500 animate-pulse" />
          </div>
          
          <div className="my-2.5 relative flex items-center justify-center">
            <div className="w-20 h-20 rounded-full border-4 border-gray-100 flex items-center justify-center bg-gray-50/30">
              <div className="text-center">
                <span className="text-2xl font-black text-[#1A1A1A]">{stats.percentage}%</span>
                <span className="text-[8px] font-bold text-[var(--text-muted)] block uppercase tracking-tight">Month</span>
              </div>
            </div>
          </div>
          
          <span className="text-[10px] text-[var(--text-secondary)] font-extrabold mt-1">
            {stats.present} / {stats.requiredDays} working days
          </span>
        </div>

        {/* Performance Score Display */}
        <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 flex flex-col items-center text-center justify-between shadow-sm">
          <div className="w-full flex items-center justify-between mb-1">
            <span className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-wider flex items-center gap-1">
              <Award size={12} className="text-[#FBBF24]" /> Score
            </span>
            <span title="Visible if published by Ops Manager">
              <Info size={12} className="text-gray-300" />
            </span>
          </div>

          <div className="my-2 flex flex-col items-center justify-center">
            {score !== null ? (
              <>
                <span className="text-4xl font-black text-amber-500 tracking-tight leading-none">{score}</span>
                <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200/50 rounded px-1.5 py-0.5 uppercase mt-2 tracking-wide">Excellent</span>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-2.5">
                <Clock size={20} className="text-gray-300 animate-spin" />
                <span className="text-[9.5px] font-bold text-[var(--text-muted)] mt-1.5 uppercase tracking-tight">Review Pending</span>
              </div>
            )}
          </div>

          <span className="text-[9px] text-[var(--text-muted)] font-bold">
            Updated monthly
          </span>
        </div>
      </div>

      {/* 5. Detailed Attendance Summary Numbers */}
      <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 flex flex-col shadow-sm">
        <h3 className="font-extrabold text-xs text-[#1A1A1A] uppercase tracking-wider border-b border-[var(--border)] pb-2.5 mb-3 flex items-center justify-between">
          <span>This Month Summary</span>
          <span className="text-[9.5px] font-bold text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded border border-[var(--border)]">{new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
        </h3>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-[#EDF7EF] border border-[#C3E6CB]/30 rounded-xl p-2.5">
            <span className="text-[9px] text-[#2D7A3A] font-black uppercase tracking-wider block">Present</span>
            <span className="text-xl font-black text-[#2D7A3A] block mt-0.5">{stats.present}</span>
          </div>
          <div className="bg-[#FDECEA] border border-[#F5C6CB]/30 rounded-xl p-2.5">
            <span className="text-[9px] text-[#C0392B] font-black uppercase tracking-wider block">Absent</span>
            <span className="text-xl font-black text-[#C0392B] block mt-0.5">{stats.absent}</span>
          </div>
          <div className="bg-gray-50 border border-gray-200/50 rounded-xl p-2.5">
            <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Off Days</span>
            <span className="text-xl font-black text-gray-700 block mt-0.5">{stats.weeklyOffs}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2 text-center">
          <div className="bg-amber-50 border border-amber-200/30 rounded-xl p-2.5 flex items-center justify-between px-3">
            <span className="text-[10px] text-amber-800 font-extrabold uppercase tracking-wide">Late Arrivals</span>
            <span className="text-base font-black text-amber-700 bg-white/80 border border-amber-200/50 px-2.5 py-0.5 rounded-lg">{stats.lateCount}</span>
          </div>
          <div className="bg-orange-50 border border-orange-200/30 rounded-xl p-2.5 flex items-center justify-between px-3">
            <span className="text-[10px] text-orange-800 font-extrabold uppercase tracking-wide">Early Exits</span>
            <span className="text-base font-black text-orange-700 bg-white/80 border border-orange-200/50 px-2.5 py-0.5 rounded-lg">{stats.earlyExits}</span>
          </div>
        </div>
      </div>

      {/* 6. Tomorrow's Upcoming Shift */}
      <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 shadow-sm flex items-center justify-between relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1a1a1a]" />
        
        <div className="flex items-center space-x-3.5 pl-1.5">
          <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-[#1A1A1A] flex-shrink-0">
            <Clock size={16} strokeWidth={1.5} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Upcoming Shift (Tomorrow)</span>
            <h4 className="text-xs font-black text-[#1A1A1A] mt-1">{tomorrowShift}</h4>
          </div>
        </div>

        <div className="text-[9px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded uppercase border border-gray-200/50">
          Planned
        </div>
      </div>

      {/* 7. Announcement Detail Dialog (Popup Modal) */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl max-w-sm w-full p-5 flex flex-col space-y-4 shadow-2xl animate-in scale-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2">
                <Megaphone className="text-amber-500" size={18} />
                <h3 className="text-[#1A1A1A] text-sm font-black uppercase tracking-wider">Announcement</h3>
              </div>
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-base font-black text-[#1A1A1A] leading-tight">{selectedAnnouncement.title}</h4>
              <p className="text-xs text-gray-500 font-bold">
                Posted on {new Date(selectedAnnouncement.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} by {selectedAnnouncement.created_by}
              </p>
              
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 text-xs font-semibold text-gray-700 leading-relaxed max-h-[220px] overflow-y-auto whitespace-pre-wrap">
                {selectedAnnouncement.message}
              </div>
            </div>

            <button
              onClick={() => setSelectedAnnouncement(null)}
              className="w-full min-h-[42px] bg-[#1a1a1a] text-white font-black text-xs rounded-xl active:scale-95 transition-all shadow-md"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Profile Completion Modal */}
      {showCompletionModal && staffInfo && (
        <div className="fixed inset-0 z-[19000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-250">
          <div className="bg-white border border-[#E8E8E8] rounded-[24px] max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-left animate-in scale-in-95 duration-250">
            <div>
              <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-3">
                <User size={20} />
              </div>
              <h3 className="text-[#1A1A1A] text-base font-black leading-tight">Complete Your Profile</h3>
              <p className="text-[#555555] text-xs font-semibold mt-1">
                Please complete your details. Joining date is read-only, while Date of Birth is required.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs font-semibold text-[#555555]">
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Joining Date (Read-Only)</label>
                <input
                  type="text"
                  value={staffInfo.join_date ? new Date(staffInfo.join_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  disabled
                  className="w-full bg-gray-150 border border-gray-200 rounded-xl p-3 text-xs font-bold text-gray-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={dobInput}
                  onChange={e => setDobInput(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:border-black [color-scheme:light]"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleRemindLater}
                  className="flex-1 min-h-[40px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-black text-xs rounded-xl active:scale-95 transition-all cursor-pointer text-center"
                >
                  Remind Later
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="flex-1 min-h-[40px] bg-[#1A1A1A] hover:bg-black text-white font-black text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

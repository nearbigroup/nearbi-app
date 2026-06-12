'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight, X, Clock, AlertTriangle, AlertCircle, CheckCircle, Calendar, Sparkles } from 'lucide-react';
import { HOLIDAYS } from '@/lib/data';
import { formatTime12hr } from '@/lib/utils';
import { calculateEarlyLeaveDeduction } from '@/lib/salary';

interface AttendanceRecord {
  id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: 'present' | 'late' | 'absent';
  color_code: 'green' | 'yellow' | 'orange' | 'red';
  minutes_late: number;
  actual_hours_worked?: number | null;
  ot_minutes: number;
  ot_approved: boolean;
  day_type?: string;
  early_leave_minutes?: number;
}

interface FineItem {
  id: string;
  date: string;
  type: 'late' | 'special';
  fine_amount: number;
  waived: boolean;
  confirmed: boolean;
  late_minutes?: number;
  reason?: string;
}

interface AttendanceAdjustment {
  id: string;
  date: string;
  type: 'ot' | 'early_in';
  minutes: number;
  status: 'pending' | 'approved' | 'rejected';
}

export default function StaffAttendancePage() {
  const { user } = useAuth();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [fines, setFines] = useState<FineItem[]>([]);
  const [adjustments, setAdjustments] = useState<AttendanceAdjustment[]>([]);
  const [staff, setStaff] = useState<any>(null);
  const [selectedDayDetail, setSelectedDayDetail] = useState<any | null>(null);

  const fetchMonthData = async () => {
    if (!user || !user.staffId) return;
    setLoading(true);
    try {
      const year = parseInt(selectedMonth.split('-')[0]);
      const monthNum = parseInt(selectedMonth.split('-')[1]);
      const lastDay = new Date(year, monthNum, 0).getDate();
      const startOfMonth = `${selectedMonth}-01`;
      const endOfMonth = `${selectedMonth}-${lastDay}`;

      // 1. Fetch Staff info for shift
      const { data: sData } = await supabase
        .from('staff')
        .select('*, shift:shifts(*)')
        .eq('id', user.staffId)
        .single();
      
      if (sData) {
        let normalizedShift = null;
        if (sData.shift) {
          normalizedShift = Array.isArray(sData.shift) ? sData.shift[0] : sData.shift;
        } else if (sData.shifts) {
          normalizedShift = Array.isArray(sData.shifts) ? sData.shifts[0] : sData.shifts;
        }
        sData.shift = normalizedShift;
      }
      setStaff(sData);

      // 2. Fetch Attendance for Month
      const { data: attData } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', user.staffId)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);
      setAttendance(attData || []);

      // 3. Fetch Approved Leaves for Month
      const { data: leaveData } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('staff_id', user.staffId)
        .eq('status', 'approved')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);
      setLeaves(leaveData || []);

      // Fetch Attendance Adjustments for Month (for OT status)
      const { data: adjData } = await supabase
        .from('attendance_adjustments')
        .select('*')
        .eq('staff_id', user.staffId)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);
      setAdjustments(adjData || []);

      // 4. Fetch Fines for Month (both late and special)
      const { data: lfData } = await supabase
        .from('late_fines')
        .select('*')
        .eq('staff_id', user.staffId)
        .eq('month', selectedMonth);
      
      const { data: sfData } = await supabase
        .from('special_fines')
        .select('*')
        .eq('staff_id', user.staffId)
        .eq('month', selectedMonth);
      
      const combinedFines: FineItem[] = [];
      (lfData || []).forEach(f => {
        combinedFines.push({
          id: f.id,
          date: f.date,
          type: 'late',
          fine_amount: Number(f.fine_amount || 0),
          waived: !!f.waived,
          confirmed: !!f.confirmed,
          late_minutes: f.late_minutes,
          reason: `Arrived ${f.late_minutes} mins late`
        });
      });
      (sfData || []).forEach(f => {
        combinedFines.push({
          id: f.id,
          date: f.date,
          type: 'special',
          fine_amount: f.edited_amount !== null && f.edited_amount !== undefined ? Number(f.edited_amount) : Number(f.amount),
          waived: !!f.waived,
          confirmed: !!f.confirmed,
          reason: f.reason || 'Uniform or operational issue'
        });
      });
      setFines(combinedFines);

    } catch (err) {
      console.error('Error loading attendance details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthData();
  }, [user, selectedMonth]);

  // Touch swipe gesture handlers for month navigation
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(null);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      handleNextMonth();
    } else if (isRightSwipe) {
      handlePrevMonth();
    }
  };

  const handlePrevMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr);
    let month = parseInt(monthStr);
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    let year = parseInt(yearStr);
    let month = parseInt(monthStr);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    setSelectedMonth(`${year}-${String(month).padStart(2, '0')}`);
  };

  // Metrics computation
  const stats = useMemo(() => {
    const present = attendance.filter(a => a.status === 'present' || a.status === 'late').length;
    const late = attendance.filter(a => a.status === 'late').length;
    const absent = attendance.filter(a => a.status === 'absent').length;
    return { present, late, absent };
  }, [attendance]);

  // Weekly off balance calculations
  const weeklyOffStats = useMemo(() => {
    if (!staff) return { earnedQuota: 0, weeklyOffsUsed: 0, weeklyOffsRemaining: 0 };
    const daysActuallyWorked = attendance.filter(a => a.check_in_time !== null && a.day_type !== 'weekly_off' && a.day_type !== 'holiday').length;
    const offDaysPerMonth = staff.off_days_per_month ?? 4;
    
    const earnedQuota = offDaysPerMonth === 0 ? 0 : Math.min(Math.floor(daysActuallyWorked / 6), offDaysPerMonth);
    const weeklyOffsUsed = attendance.filter(a => a.day_type === 'weekly_off').length;
    const weeklyOffsRemaining = Math.max(0, earnedQuota - weeklyOffsUsed);

    return { earnedQuota, weeklyOffsUsed, weeklyOffsRemaining };
  }, [attendance, staff, selectedMonth]);

  const calendarDays = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 is Sunday
    
    // Convert Sunday 0 to index 6, Monday 1 to index 0, etc.
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    
    const days = [];
    for (let i = 0; i < startOffset; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    return days;
  }, [selectedMonth]);

  // Next 7 days schedule
  const next7DaysSchedule = useMemo(() => {
    if (!staff || !staff.shift) return [];
    const schedule = [];
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    
    for (let i = 1; i <= 7; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      const dateStr = futureDate.toISOString().split('T')[0];
      const isSunday = futureDate.getDay() === 0;
      
      const holiday = HOLIDAYS.find(h => h.date === dateStr);
      let label = staff.shift.label;
      let note = 'Standard Shift';
      
      if (holiday) {
        label = `HOLIDAY (${holiday.name})`;
        note = 'Public Holiday';
      }
      
      schedule.push({
        dateStr: futureDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        dayName: daysOfWeek[futureDate.getDay()],
        shiftLabel: label,
        note
      });
    }
    return schedule;
  }, [staff]);

  // Missed clocks (past dates where check-in exists but checkout is missing, or vice versa)
  const missedClocks = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const missedOut: string[] = [];
    const missedIn: string[] = [];
    
    attendance.forEach(a => {
      if (a.date < todayStr) {
        if (a.check_in_time && !a.check_out_time) {
          missedOut.push(a.date);
        }
        if (!a.check_in_time && a.check_out_time) {
          missedIn.push(a.date);
        }
      }
    });
    
    return { missedIn, missedOut };
  }, [attendance]);

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading && attendance.length === 0) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[50px] w-full" />
        <div className="skeleton h-[70px] w-full" />
        <div className="skeleton h-[280px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      
      {/* 1. Shift Schedule banner at top */}
      {staff?.shift && (
        <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 shadow-sm flex flex-col space-y-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-[#1a1a1a]">
              <Clock size={16} />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider">Current Shift Schedule</span>
              <h4 className="text-xs font-black text-[#1A1A1A] mt-0.5">Your shift: {staff.shift.label}</h4>
            </div>
          </div>
          
          {/* Next 7 Days Collapsible/List */}
          <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-3 space-y-2 text-[11px] font-semibold text-gray-600">
            <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider block border-b border-gray-200/50 pb-1 mb-1.5">Next 7 Days Schedule</span>
            {next7DaysSchedule.map((day, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span>{day.dateStr} ({day.dayName}):</span>
                <span className={`font-black ${day.shiftLabel.includes('OFF') || day.shiftLabel.includes('HOLIDAY') ? 'text-gray-400 font-bold' : 'text-[#1A1A1A]'}`}>
                  {day.shiftLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Month Selector header */}
      <div className="flex items-center justify-between bg-white border border-[#E8E8E8] rounded-[14px] p-3 shadow-sm">
        <span className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider">Attendance Calendar</span>
        <div className="flex items-center space-x-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2.5 py-1">
          <button onClick={handlePrevMonth} className="p-1 text-[var(--text-secondary)] hover:text-[#1A1A1A] transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-bold text-[#1A1A1A] font-mono uppercase px-2">
            {new Date(selectedMonth + '-02').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </span>
          <button onClick={handleNextMonth} className="p-1 text-[var(--text-secondary)] hover:text-[#1A1A1A] transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* 3. Summary stats bar */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-[#E8E8E8] rounded-xl p-2.5 text-center flex flex-col items-center shadow-sm">
          <span className="text-base font-extrabold text-[var(--success)] font-mono leading-none">{stats.present}</span>
          <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1.5 leading-none">Present</span>
        </div>
        <div className="bg-white border border-[#E8E8E8] rounded-xl p-2.5 text-center flex flex-col items-center shadow-sm">
          <span className="text-base font-extrabold text-[var(--warning)] font-mono leading-none">{stats.late}</span>
          <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1.5 leading-none">Late</span>
        </div>
        <div className="bg-white border border-[#E8E8E8] rounded-xl p-2.5 text-center flex flex-col items-center shadow-sm">
          <span className="text-base font-extrabold text-[var(--danger)] font-mono leading-none">{stats.absent}</span>
          <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1.5 leading-none">Absent</span>
        </div>
      </div>

      {/* Weekly Off Balance Indicator */}
      <div className="bg-white border border-[#E8E8E8] rounded-xl p-3 flex justify-between items-center text-xs font-bold text-gray-500 shadow-sm">
        <span className="uppercase text-[9px] tracking-wider text-[var(--text-muted)]">Weekly Off Balance</span>
        <span className="text-[#1A1A1A] font-mono">
          Weekly Off: {weeklyOffStats.earnedQuota} earned | {weeklyOffStats.weeklyOffsUsed} used | {weeklyOffStats.weeklyOffsRemaining} remaining
        </span>
      </div>

      {/* 4. Calendar Grid */}
      <div 
        className="bg-white border border-[#E8E8E8] rounded-[18px] p-4 shadow-sm"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="grid grid-cols-7 gap-1.5 text-center mb-3">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((h, i) => (
            <span key={i} className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">
              {h}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="aspect-square" />;
            }

            const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
            const record = attendance.find(a => a.date === dateStr);
            const isFuture = new Date(dateStr + 'T00:00:00') > new Date();
            const holiday = HOLIDAYS.find(h => h.date === dateStr);
            const isSunday = new Date(dateStr + 'T00:00:00').getDay() === 0;

            let cellClass = "aspect-square rounded-xl flex items-center justify-center text-xs font-extrabold transition-all border ";
            let dotColor = null;

            if (isFuture) {
              cellClass += "bg-gray-50/50 border-gray-100 text-gray-300 opacity-50 cursor-not-allowed";
            } else if (record) {
              if (record.day_type === 'weekly_off') {
                cellClass += "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100";
                dotColor = "bg-[#60A5FA]";
              } else if (record.day_type === 'holiday') {
                cellClass += "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100";
                dotColor = "bg-[#A78BFA]";
              } else if (record.day_type === 'leave') {
                cellClass += "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100";
                dotColor = "bg-[#FB923C]";
              } else if (record.status === 'present' || record.status === 'late') {
                if (record.color_code === 'green') {
                  cellClass += "bg-[var(--success-bg)] border-[var(--success)]/20 text-[var(--success)] hover:bg-[var(--success-bg)]/80";
                  dotColor = "bg-[var(--success)]";
                } else if (record.color_code === 'yellow') {
                  cellClass += "bg-yellow-50 border-yellow-200/50 text-yellow-700 hover:bg-yellow-100/50";
                  dotColor = "bg-yellow-500";
                } else if (record.color_code === 'orange') {
                  cellClass += "bg-orange-50 border-orange-200/50 text-orange-700 hover:bg-orange-100/50";
                  dotColor = "bg-orange-500";
                } else if (record.color_code === 'red') {
                  cellClass += "bg-red-50 border-red-200/50 text-red-700 hover:bg-red-100/50";
                  dotColor = "bg-red-500";
                }
              } else {
                cellClass += "bg-gray-100 border-gray-200 text-[#6B7280] hover:bg-gray-200";
                dotColor = "bg-[#6B7280]";
              }
            } else {
              const isLeaveApproved = leaves.some(l => l.date === dateStr);

              if (isLeaveApproved) {
                cellClass += "bg-[var(--info-bg)] border-[var(--info)]/20 text-[var(--info)] hover:bg-[var(--info-bg)]/80";
              } else if (holiday) {
                // Holiday is White with dotted outline or dashed marker
                cellClass += "bg-white border-dashed border-gray-300 text-gray-400 hover:border-gray-500";
              } else {
                // Unmarked past date = Absent
                cellClass += "bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200";
                dotColor = "bg-gray-600";
              }
            }

            const handleDayClick = () => {
              if (isFuture) return;
              const dayFines = fines.filter(f => f.date === dateStr);
              setSelectedDayDetail({
                day,
                dateStr,
                record: record || null,
                isLeaveApproved: leaves.some(l => l.date === dateStr),
                isOffDay: record?.day_type === 'weekly_off',
                holiday: holiday || null,
                fines: dayFines
              });
            };

            return (
              <button
                key={day}
                onClick={handleDayClick}
                disabled={isFuture}
                className={cellClass}
              >
                <div className="flex flex-col items-center justify-between py-1 h-full w-full">
                  <span>{day}</span>
                  {dotColor ? (
                    <span className={`w-1 h-1 rounded-full ${dotColor}`} />
                  ) : holiday ? (
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" title={holiday.name} />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Calendar Legend */}
      <div className="bg-white border border-[#E8E8E8] rounded-xl p-3.5 flex flex-wrap gap-x-4 gap-y-2 items-center justify-center text-[10px] font-extrabold text-[var(--text-secondary)] shadow-sm">
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded bg-[var(--success-bg)] border border-[var(--success)]/20 inline-block" />
          <span>Present (Green)</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded bg-yellow-50 border border-yellow-200 inline-block" />
          <span>Late 1-15m</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded bg-orange-50 border border-orange-200 inline-block" />
          <span>Late 16-30m</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded bg-red-50 border border-red-200 inline-block" />
          <span>Late 30m+</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded bg-gray-100 border border-gray-200 inline-block" />
          <span>Absent</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded border border-dashed border-gray-300 inline-block" />
          <span>Weekly Off / Holiday</span>
        </div>
      </div>

      {/* 6. Missed Clock Logs Section */}
      {(missedClocks.missedIn.length > 0 || missedClocks.missedOut.length > 0) && (
        <div className="bg-amber-50 border border-amber-200/50 rounded-2xl p-4 shadow-sm space-y-2.5">
          <div className="flex items-center space-x-2 text-amber-800">
            <AlertTriangle size={15} />
            <span className="text-[11px] font-black uppercase tracking-wider">Unrecorded Logs Flagged</span>
          </div>
          <div className="space-y-1.5 text-xs text-amber-850 font-bold">
            {missedClocks.missedOut.map(date => (
              <p key={date} className="flex justify-between">
                <span>Check-out not recorded:</span>
                <span>{formatDate(date)}</span>
              </p>
            ))}
            {missedClocks.missedIn.map(date => (
              <p key={date} className="flex justify-between">
                <span>Check-in not recorded:</span>
                <span>{formatDate(date)}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Day Details Modal Popup */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl relative z-10 p-5 w-full max-w-xs border border-[#E8E8E8] space-y-4 animate-in scale-in-95 duration-200">
            
            <div className="flex justify-between items-center border-b border-gray-100 pb-2.5">
              <h3 className="font-extrabold text-sm text-[#1A1A1A]">
                {formatDate(selectedDayDetail.dateStr)}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedDayDetail(null)}
                className="p-1 rounded-full hover:bg-gray-150 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs font-semibold text-[var(--text-secondary)]">
              {/* Status Display */}
              <div className="flex justify-between items-center">
                <span>Status:</span>
                {(() => {
                  if (selectedDayDetail.record) {
                    if (selectedDayDetail.record.status === 'late') return <span className="text-amber-600 font-black uppercase text-[10px] bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Late</span>;
                    return <span className="text-emerald-700 font-black uppercase text-[10px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Present</span>;
                  }
                  if (selectedDayDetail.isLeaveApproved) return <span className="text-[var(--info)] font-black uppercase text-[10px] bg-[var(--info-bg)] px-2 py-0.5 rounded border border-[var(--info)]/20">Leave Approved</span>;
                  if (selectedDayDetail.holiday) return <span className="text-blue-700 font-black uppercase text-[10px] bg-blue-50 px-2 py-0.5 rounded border border-blue-100">Holiday ({selectedDayDetail.holiday.name})</span>;
                  if (selectedDayDetail.isOffDay) return <span className="text-gray-500 font-black uppercase text-[10px] bg-gray-50 px-2 py-0.5 rounded border border-gray-150">Weekly Off</span>;
                  return <span className="text-red-700 font-black uppercase text-[10px] bg-red-50 px-2 py-0.5 rounded border border-red-100">Absent</span>;
                })()}
              </div>

              {selectedDayDetail.record && (
                <>
                  <div className="flex justify-between">
                    <span>Check-In:</span>
                    <span className="text-[#1A1A1A] font-mono font-bold">{formatTime12hr(selectedDayDetail.record.check_in_time) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Check-Out:</span>
                    <span className="text-[#1A1A1A] font-mono font-bold">{formatTime12hr(selectedDayDetail.record.check_out_time) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hours Worked:</span>
                    <span className="text-[#1A1A1A] font-mono font-bold">
                      {selectedDayDetail.record.actual_hours_worked !== null && selectedDayDetail.record.actual_hours_worked !== undefined
                        ? `${selectedDayDetail.record.actual_hours_worked} hrs`
                        : '—'}
                    </span>
                  </div>
                  {selectedDayDetail.record.status === 'late' && selectedDayDetail.record.minutes_late > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>Late by:</span>
                      <span className="font-mono font-black">{selectedDayDetail.record.minutes_late} mins</span>
                    </div>
                  )}
                  {selectedDayDetail.record.early_leave_minutes > 0 && (
                    <div className="flex justify-between text-red-700 font-bold">
                      <span>Early Leave ({selectedDayDetail.record.early_leave_minutes} mins):</span>
                      <span className="font-mono">
                        -₹{(() => {
                          const salary = staff?.monthly_salary || 0;
                          const shiftHours = staff?.shift?.hours || 9;
                          const recordDate = selectedDayDetail.dateStr;
                          const [yr, mo] = recordDate.split('-').map(Number);
                          const calendarDays = new Date(yr, mo, 0).getDate();
                          const dailyRate = salary / calendarDays;
                          return calculateEarlyLeaveDeduction(selectedDayDetail.record.early_leave_minutes, dailyRate, shiftHours);
                        })()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span>Overtime:</span>
                    {(() => {
                      const otMinutes = selectedDayDetail.record ? selectedDayDetail.record.ot_minutes || 0 : 0;
                      const checkOutTime = selectedDayDetail.record ? selectedDayDetail.record.check_out_time : null;
                      
                      let shiftEnd = '18:00';
                      if (staff?.shift) {
                        const s = Array.isArray(staff.shift) ? staff.shift[0] : staff.shift;
                        shiftEnd = s?.end_time || '18:00';
                      } else if (staff?.shifts) {
                        const s = Array.isArray(staff.shifts) ? staff.shifts[0] : staff.shifts;
                        shiftEnd = s?.end_time || '18:00';
                      }

                      if (otMinutes > 0) {
                        const otAdj = adjustments.find(adj => adj.date === selectedDayDetail.dateStr && adj.type === 'ot');
                        const status = otAdj ? otAdj.status : (selectedDayDetail.record?.ot_approved ? 'approved' : 'pending');
                        
                        const hrs = Math.floor(otMinutes / 60);
                        const mins = otMinutes % 60;
                        const timeStr = `${hrs > 0 ? `${hrs}h ` : ''}${mins}m`;
                        
                        if (status === 'approved') {
                          return <span className="text-emerald-600 font-bold font-mono">{timeStr} (Approved ✓)</span>;
                        } else if (status === 'rejected') {
                          return <span className="text-gray-500 font-bold font-mono">{timeStr} (Not approved)</span>;
                        } else {
                          return <span className="text-amber-600 font-bold font-mono">{timeStr} (Pending approval)</span>;
                        }
                      } else {
                        if (!checkOutTime) {
                          return <span className="text-gray-400 font-mono">No OT recorded</span>;
                        } else {
                          const [eh, em] = shiftEnd.split(':').map(Number);
                          const [oh, om] = checkOutTime.split(':').map(Number);
                          const shiftEndMins = eh * 60 + em;
                          const checkoutMins = oh * 60 + om;
                          const diff = checkoutMins - shiftEndMins;
                          if (diff > 0 && diff < 30) {
                            return <span className="text-gray-400 font-mono">No OT (left before 30m threshold)</span>;
                          } else {
                            return <span className="text-gray-400 font-mono">No OT recorded</span>;
                          }
                        }
                      }
                    })()}
                  </div>
                </>
              )}

              {/* Fines info with exact ₹ and status badges */}
              {selectedDayDetail.fines && selectedDayDetail.fines.length > 0 && (
                <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
                  <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider">Logged Deductions</span>
                  {selectedDayDetail.fines.map((f: any) => {
                    let badgeText = 'Pending';
                    let badgeClass = 'text-amber-700 bg-amber-50 border-amber-100';
                    if (f.waived) {
                      badgeText = 'Waived';
                      badgeClass = 'text-gray-500 bg-gray-50 border-gray-150';
                    } else if (f.confirmed) {
                      badgeText = 'Confirmed';
                      badgeClass = 'text-emerald-700 bg-emerald-50 border-emerald-100';
                    }

                    return (
                      <div key={f.id} className="bg-red-50/50 border border-red-100/50 rounded-xl p-2.5 flex flex-col space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="capitalize text-red-900 font-bold">{f.type} Fine</span>
                          <span className={`font-mono font-black ${f.waived ? 'text-gray-400 line-through' : 'text-red-750'}`}>
                            ₹{f.fine_amount}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <p className="text-[10px] text-red-800 font-medium leading-tight flex-1">{f.reason}</p>
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${badgeClass}`}>
                            {badgeText}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedDayDetail.record?.status === 'late' && (!selectedDayDetail.fines || selectedDayDetail.fines.length === 0) && (
                <p className="text-[10px] text-gray-400 italic text-center pt-2">Fine details not computed yet</p>
              )}
            </div>

            <button
              onClick={() => setSelectedDayDetail(null)}
              className="w-full min-h-[38px] bg-[#1a1a1a] text-white font-black text-xs rounded-xl active:scale-95 transition-all shadow-sm"
            >
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight, X, Clock, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';

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
}

interface FineItem {
  id: string;
  date: string;
  type: 'late' | 'special';
  fine_amount: number;
  waived: boolean;
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
  const [staff, setStaff] = useState<any>(null);
  const [selectedDayDetail, setSelectedDayDetail] = useState<any | null>(null);

  const fetchMonthData = async () => {
    if (!user || !user.staffId) return;
    setLoading(true);
    try {
      const startOfMonth = `${selectedMonth}-01`;
      const endOfMonth = `${selectedMonth}-31`;

      // 1. Fetch Staff info for shift
      const { data: sData } = await supabase
        .from('staff')
        .select('*, shift:shifts(*)')
        .eq('id', user.staffId)
        .single();
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
          waived: !!f.waived
        });
      });
      (sfData || []).forEach(f => {
        if (f.confirmed) {
          combinedFines.push({
            id: f.id,
            date: f.date,
            type: 'special',
            fine_amount: f.edited_amount !== null && f.edited_amount !== undefined ? Number(f.edited_amount) : Number(f.amount),
            waived: !!f.waived
          });
        }
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
    const otMins = attendance.reduce((sum, a) => sum + (a.ot_approved ? a.ot_minutes : 0), 0);
    const otHours = Math.round((otMins / 60) * 10) / 10;
    return { present, late, absent, otHours };
  }, [attendance]);

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
      {/* Month Selector header */}
      <div className="flex items-center justify-between bg-white border border-[#E8E8E8] rounded-[14px] p-3 shadow-sm">
        <span className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider">Attendance Register</span>
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

      {/* Summary stats bar */}
      <div className="grid grid-cols-4 gap-2">
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
        <div className="bg-white border border-[#E8E8E8] rounded-xl p-2.5 text-center flex flex-col items-center shadow-sm">
          <span className="text-base font-extrabold text-[var(--info)] font-mono leading-none">{stats.otHours}h</span>
          <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1.5 leading-none">OT Hours</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-4 shadow-sm">
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

            let cellClass = "aspect-square rounded-xl flex items-center justify-center text-xs font-extrabold transition-all border ";
            let dotColor = null;

            if (isFuture) {
              cellClass += "bg-transparent border-[var(--border)] text-[var(--text-muted)] opacity-30 cursor-not-allowed";
            } else if (record) {
              if (record.status === 'present' || record.status === 'late') {
                if (record.color_code === 'green') {
                  cellClass += "bg-[var(--success-bg)] border-[var(--success)]/20 text-[var(--success)] hover:bg-[var(--success-bg)]/80";
                  dotColor = "bg-[var(--success)]";
                } else if (record.color_code === 'yellow') {
                  cellClass += "bg-[var(--warning-bg)] border-[var(--warning)]/20 text-[var(--warning)] hover:bg-[var(--warning-bg)]/80";
                  dotColor = "bg-[var(--warning)]";
                } else if (record.color_code === 'orange') {
                  cellClass += "bg-[#FFF3E0] border-[#FFE0B2] text-[#E65100] hover:bg-[#FFE0B2]/50";
                  dotColor = "bg-[#E65100]";
                } else if (record.color_code === 'red') {
                  cellClass += "bg-[var(--danger-bg)] border-[var(--danger)]/20 text-[var(--danger)] hover:bg-[var(--danger-bg)]/80";
                  dotColor = "bg-[var(--danger)]";
                }
              } else {
                cellClass += "bg-[var(--danger-bg)]/30 border-[var(--danger)]/10 text-[var(--text-muted)] hover:bg-[var(--danger-bg)]/50";
                dotColor = "bg-[var(--danger)]";
              }
            } else {
              const isLeaveApproved = leaves.some(l => l.date === dateStr);
              const isSunday = new Date(dateStr + 'T00:00:00').getDay() === 0;

              if (isLeaveApproved) {
                cellClass += "bg-[var(--info-bg)] border-[var(--info)]/20 text-[var(--info)] hover:bg-[var(--info-bg)]/80";
              } else if (isSunday && staff?.off_days_per_month > 0) {
                cellClass += "bg-transparent border-dashed border-[var(--border-strong)] text-[var(--text-muted)] hover:border-[#1A1A1A]/10";
              } else {
                cellClass += "bg-[var(--danger-bg)]/30 border-[var(--danger)]/10 text-[var(--text-muted)] hover:bg-[var(--danger-bg)]/50";
                dotColor = "bg-[var(--danger)]";
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
                isSunday: new Date(dateStr + 'T00:00:00').getDay() === 0,
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
                  {dotColor && <span className={`w-1 h-1 rounded-full ${dotColor}`} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendar Legend */}
      <div className="flex flex-wrap gap-2.5 items-center justify-center text-[9px] font-bold text-[var(--text-secondary)]">
        <div className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded bg-[var(--success-bg)] border border-[var(--success)]/20 inline-block" />
          <span>Present</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded bg-[var(--warning-bg)] border border-[var(--warning)]/20 inline-block" />
          <span>Late</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded bg-[var(--danger-bg)] border border-[var(--danger)]/20 inline-block" />
          <span>Absent</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded border border-dashed border-[var(--border-strong)] inline-block" />
          <span>OFF Day</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-2 h-2 rounded bg-[var(--info-bg)] border border-[var(--info)]/20 inline-block" />
          <span>Leave</span>
        </div>
      </div>

      {/* Day Details Modal */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedDayDetail(null)}
          />
          <div className="bg-white rounded-[16px] shadow-2xl relative z-10 p-5 w-full max-w-xs border border-[#E8E8E8]">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-2.5 mb-4">
              <h3 className="font-extrabold text-sm text-[#1A1A1A]">
                {new Date(selectedDayDetail.dateStr).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'long' })}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedDayDetail(null)}
                className="text-[var(--text-secondary)] hover:text-[#1A1A1A]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs font-semibold text-[var(--text-secondary)]">
              {/* Status Display */}
              <div className="flex justify-between items-center">
                <span>Status:</span>
                {(() => {
                  if (selectedDayDetail.record) {
                    if (selectedDayDetail.record.status === 'late') return <span className="text-[var(--warning)] font-bold uppercase text-[10px]">Late (Code {selectedDayDetail.record.color_code.toUpperCase()})</span>;
                    return <span className="text-[var(--success)] font-bold uppercase text-[10px]">Present</span>;
                  }
                  if (selectedDayDetail.isLeaveApproved) return <span className="text-[var(--info)] font-bold uppercase text-[10px]">Approved Leave</span>;
                  if (selectedDayDetail.isSunday && staff?.off_days_per_month > 0) return <span className="text-[var(--text-muted)] font-bold uppercase text-[10px]">OFF Day</span>;
                  return <span className="text-[var(--danger)] font-bold uppercase text-[10px]">Absent</span>;
                })()}
              </div>

              {selectedDayDetail.record && (
                <>
                  <div className="flex justify-between">
                    <span>Clock In:</span>
                    <span className="text-[#1A1A1A] font-mono font-bold">{selectedDayDetail.record.check_in_time || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Clock Out:</span>
                    <span className="text-[#1A1A1A] font-mono font-bold">{selectedDayDetail.record.check_out_time || '—'}</span>
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
                    <div className="flex justify-between text-[var(--warning)]">
                      <span>Minutes Late:</span>
                      <span className="font-mono font-bold">{selectedDayDetail.record.minutes_late} mins</span>
                    </div>
                  )}
                  {selectedDayDetail.record.ot_minutes > 0 && (
                    <div className="flex justify-between text-[var(--info)]">
                      <span>Overtime minutes:</span>
                      <span className="font-mono font-bold">
                        {selectedDayDetail.record.ot_minutes} mins {selectedDayDetail.record.ot_approved ? '(Approved)' : '(Pending)'}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Fines info */}
              {selectedDayDetail.fines && selectedDayDetail.fines.length > 0 && (
                <div className="border-t border-[var(--border)] pt-3 mt-3">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Fines logged on this day</span>
                  <div className="space-y-2 mt-1.5">
                    {selectedDayDetail.fines.map((f: any) => (
                      <div key={f.id} className="flex justify-between items-center text-[11px]">
                        <span className="capitalize text-[#1A1A1A] font-bold">{f.type} Fine</span>
                        <span className={`font-mono font-black ${f.waived ? 'text-gray-400 line-through' : 'text-[var(--danger)]'}`}>
                          ₹{f.fine_amount} {f.waived && '(Waived)'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

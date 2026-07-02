'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { AlertCircle, ChevronLeft, ChevronRight, CheckCircle, HelpCircle, XCircle, Clock } from 'lucide-react';
import { calculateEarlyLeaveDeduction } from '@/lib/salary';

interface FineItem {
  id: string;
  date: string;
  type: 'late' | 'special';
  amount: number;
  originalAmount: number;
  waivedAmount: number;
  reason: string;
  status: 'confirmed' | 'waived' | 'pending';
  colorCode?: string;
  lateMinutes?: number;
}

export default function StaffFinesPage() {
  const { user } = useAuth();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(true);
  const [fines, setFines] = useState<FineItem[]>([]);
  const [earlyLeaves, setEarlyLeaves] = useState<any[]>([]);
  const [lateDeductions, setLateDeductions] = useState<any[]>([]);

  const fetchFinesData = async () => {
    if (!user || !user.staffId) return;
    setLoading(true);
    try {
      // 1. Fetch Late Fines
      const { data: lfData, error: lfErr } = await supabase
        .from('late_fines')
        .select('*')
        .eq('staff_id', user.staffId)
        .eq('month', selectedMonth);
      if (lfErr) throw lfErr;

      // 2. Fetch Special Fines
      const { data: sfData, error: sfErr } = await supabase
        .from('special_fines')
        .select('*')
        .eq('staff_id', user.staffId)
        .eq('month', selectedMonth);
      if (sfErr) throw sfErr;

      // 3. Fetch Staff info for early leave calculation
      const { data: sData } = await supabase
        .from('staff')
        .select('monthly_salary, pay_type, shift:shifts(hours)')
        .eq('id', user.staffId)
        .single();
      const monthlySalary = sData?.monthly_salary || 0;
      const shiftObj: any = sData?.shift;
      const shiftHours = (Array.isArray(shiftObj) ? shiftObj[0]?.hours : shiftObj?.hours) || 9;

      const year = parseInt(selectedMonth.split('-')[0]);
      const monthNum = parseInt(selectedMonth.split('-')[1]);
      const calendarDays = new Date(year, monthNum, 0).getDate();
      const dailyRate = monthlySalary / calendarDays;

      const startDate = `${selectedMonth}-01`;
      const endDate = `${selectedMonth}-${calendarDays}`;

      const { data: attData } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', user.staffId)
        .gte('date', startDate)
        .lte('date', endDate);

      const combined: FineItem[] = [];

      (lfData || []).forEach(f => {
        let status: 'confirmed' | 'waived' | 'pending' = 'pending';
        if (f.waived) status = 'waived';
        else if (f.confirmed) status = 'confirmed';

        const originalAmt = Number(f.fine_amount || 0);
        const waivedAmt = Number(f.waived_amount || 0);
        const netAmt = f.waived ? 0 : Math.max(0, originalAmt - waivedAmt);

        combined.push({
          id: f.id,
          date: f.date,
          type: 'late',
          amount: netAmt,
          originalAmount: originalAmt,
          waivedAmount: waivedAmt,
          reason: `Arrived ${f.late_minutes} mins late`,
          status,
          colorCode: f.color_code || 'yellow',
          lateMinutes: f.late_minutes
        });
      });

      (sfData || []).forEach(f => {
        let status: 'confirmed' | 'waived' | 'pending' = 'pending';
        if (f.waived) status = 'waived';
        else if (f.confirmed) status = 'confirmed';

        const originalAmt = f.edited_amount !== null && f.edited_amount !== undefined 
          ? Number(f.edited_amount) 
          : Number(f.amount);
        const waivedAmt = Number(f.waived_amount || 0);
        const netAmt = f.waived ? 0 : Math.max(0, originalAmt - waivedAmt);

        combined.push({
          id: f.id,
          date: f.date,
          type: 'special',
          amount: netAmt,
          originalAmount: originalAmt,
          waivedAmount: waivedAmt,
          reason: f.reason || 'Uniform or operational issue',
          status
        });
      });

      // Sort by date descending
      combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setFines(combined);

      const mappedEarlyLeaves = (attData || [])
        .filter((att: any) => (att.early_leave_minutes || 0) > 0)
        .map((att: any) => {
          const roundedAmt = calculateEarlyLeaveDeduction(att.early_leave_minutes, dailyRate, shiftHours);
          return {
            id: att.id,
            date: att.date,
            minutes: att.early_leave_minutes,
            amount: roundedAmt
          };
        });
      mappedEarlyLeaves.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEarlyLeaves(mappedEarlyLeaves);

      const isHourly = sData?.pay_type === 'hourly';
      const mappedLateDeds = isHourly ? [] : (attData || [])
        .filter((att: any) => (att.late_salary_deduction_minutes || 0) > 0)
        .map((att: any) => {
          const roundedAmt = Math.round(((att.late_salary_deduction_minutes || 0) / 60) * dailyRate / shiftHours * 100) / 100;
          return {
            id: att.id,
            date: att.date,
            minutes: att.late_salary_deduction_minutes,
            amount: roundedAmt
          };
        });
      mappedLateDeds.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLateDeductions(mappedLateDeds);

    } catch (e) {
      console.error('Error fetching fines data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinesData();
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

  // Summaries
  const stats = useMemo(() => {
    let confirmed = 0;
    let waived = 0;
    let pending = 0;

    fines.forEach(f => {
      const originalAmt = f.originalAmount;
      const waivedAmt = f.waivedAmount;
      const netAmt = f.amount;

      if (f.status === 'confirmed') {
        confirmed += netAmt;
        waived += waivedAmt;
      } else if (f.status === 'waived') {
        waived += originalAmt;
      } else if (f.status === 'pending') {
        pending += netAmt;
        waived += waivedAmt;
      }
    });

    return { confirmed, waived, pending };
  }, [fines]);

  const earlyLeaveTotal = useMemo(() => {
    return earlyLeaves.reduce((sum, e) => sum + e.amount, 0);
  }, [earlyLeaves]);

  const lateDeductionsTotal = useMemo(() => {
    return lateDeductions.reduce((sum, e) => sum + e.amount, 0);
  }, [lateDeductions]);

  // Grouped fines
  const lateFinesList = useMemo(() => fines.filter(f => f.type === 'late'), [fines]);
  const specialFinesList = useMemo(() => fines.filter(f => f.type === 'special'), [fines]);

  const getLateFineColorDot = (color: string) => {
    switch (color) {
      case 'red': return '🟢 Present on time'; // wait, red fine means late orange/red
      case 'orange': return '🟠';
      case 'yellow': return '🟡';
      default: return '🟡';
    }
  };

  const getLateBadge = (color: string) => {
    switch (color) {
      case 'red':
        return <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded leading-none">🔴 30m+</span>;
      case 'orange':
        return <span className="bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded leading-none">🟠 16-30m</span>;
      default:
        return <span className="bg-amber-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded leading-none">🟡 1-15m</span>;
    }
  };

  const getStatusLabel = (f: FineItem) => {
    if (f.status === 'waived') {
      return (
        <span className="bg-gray-150 text-gray-400 border border-gray-200 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
          Waived ✓
        </span>
      );
    }
    if (f.status === 'confirmed') {
      return (
        <span className="bg-red-50 text-red-700 border border-red-200 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
          Confirmed
        </span>
      );
    }
    return (
      <span className="bg-amber-55 text-amber-800 border border-amber-200 text-[9.5px] font-black px-2.5 py-0.5 rounded leading-none">
        Pending Review
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[50px] w-full" />
        <div className="skeleton h-[110px] w-full" />
        <div className="skeleton h-[200px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Month selector header */}
      <div className="flex items-center justify-between bg-white border border-[#E8E8E8] rounded-[14px] p-3 shadow-sm">
        <span className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider">Fines Register</span>
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

      {/* Summary Box */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 shadow-sm">
        <h3 className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider mb-3">Fines Summary (This Month)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#FFF5F5] border border-red-100 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-red-650 leading-none">₹{stats.confirmed}</div>
            <div className="text-[9px] text-red-800 font-bold uppercase tracking-wider mt-1.5 leading-none">Confirmed</div>
          </div>
          <div className="bg-gray-50 border border-gray-200/50 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-gray-500 leading-none">₹{stats.waived}</div>
            <div className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-1.5 leading-none">Waived</div>
          </div>
          <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-center">
            <div className="text-lg font-black text-amber-750 leading-none">₹{stats.pending}</div>
            <div className="text-[9px] text-amber-700 font-bold uppercase tracking-wider mt-1.5 leading-none">Pending</div>
          </div>
        </div>
      </div>

      {/* Fine list */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 shadow-sm flex flex-col space-y-5">
        
        {/* Late Fines Section */}
        <div>
          <h3 className="text-xs font-black text-[#1A1A1A] uppercase tracking-wider border-b border-[var(--border)] pb-2 mb-3.5 flex items-center justify-between">
            <span>Late Clocks Fines</span>
            <span className="text-[9px] font-bold text-gray-400 font-mono">Count: {lateFinesList.length}</span>
          </h3>

          {lateFinesList.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] italic py-3 text-center">No late clock-in fines logged.</p>
          ) : (
            <div className="space-y-3">
              {lateFinesList.map(f => (
                <div key={f.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 flex flex-col space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      {getLateBadge(f.colorCode || 'yellow')}
                      <span className="text-xs font-black text-[#1A1A1A] font-mono">
                        {new Date(f.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })}
                      </span>
                    </div>
                    {getStatusLabel(f)}
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold bg-white border border-gray-150/40 rounded-lg p-2">
                    <span className="text-[11px] text-gray-600">{f.reason}</span>
                    <div className="flex flex-col text-right">
                      {f.waivedAmount > 0 && (
                        <>
                          <span className="text-[9px] text-gray-400 line-through">Org: ₹{f.originalAmount}</span>
                          <span className="text-[9px] text-red-500">Waived: -₹{f.waivedAmount}</span>
                        </>
                      )}
                      <span className={`font-mono font-black ${f.status === 'waived' ? 'text-gray-400 line-through' : 'text-red-755'}`}>
                        ₹{f.amount}
                      </span>
                    </div>
                  </div>
                  {f.status === 'pending' && (
                    <p className="text-[9.5px] text-amber-700 font-semibold bg-amber-50/50 border border-amber-100/50 rounded p-1.5 text-center leading-none">
                      Pending — will be reviewed at month end
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Special Fines Section */}
        <div>
          <h3 className="text-xs font-black text-[#1A1A1A] uppercase tracking-wider border-b border-[var(--border)] pb-2 mb-3.5 flex items-center justify-between">
            <span>Special Deductions</span>
            <span className="text-[9px] font-bold text-gray-400 font-mono">Count: {specialFinesList.length}</span>
          </h3>

          {specialFinesList.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] italic py-3 text-center">No special fines logged.</p>
          ) : (
            <div className="space-y-3">
              {specialFinesList.map(f => (
                <div key={f.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 flex flex-col space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-[#1A1A1A] font-mono">
                      {new Date(f.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })}
                    </span>
                    {getStatusLabel(f)}
                  </div>
                  <div className="flex flex-col space-y-1.5 bg-white border border-gray-150/40 rounded-lg p-2.5">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-[10px] text-gray-400 uppercase leading-none">Operational Incident</span>
                      <div className="flex flex-col text-right">
                        {f.waivedAmount > 0 && (
                          <>
                            <span className="text-[9px] text-gray-400 line-through">Org: ₹{f.originalAmount}</span>
                            <span className="text-[9px] text-red-500">Waived: -₹{f.waivedAmount}</span>
                          </>
                        )}
                        <span className={`font-mono font-black ${f.status === 'waived' ? 'text-gray-400 line-through' : 'text-red-755'}`}>
                          ₹{f.amount}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-700 font-semibold leading-normal">{f.reason}</p>
                  </div>
                  {f.status === 'pending' && (
                    <p className="text-[9.5px] text-amber-700 font-semibold bg-amber-50/50 border border-amber-100/50 rounded p-1.5 text-center leading-none">
                      Pending — will be reviewed at month end
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Early Leave Deductions Section */}
        <div>
          <h3 className="text-xs font-black text-[#1A1A1A] uppercase tracking-wider border-b border-[var(--border)] pb-2 mb-3.5 flex items-center justify-between">
            <span>Early Leave Deductions</span>
            <span className="text-[9px] font-bold text-gray-450 font-mono">Total: -₹{earlyLeaveTotal.toFixed(2)}</span>
          </h3>

          {earlyLeaves.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] italic py-3 text-center">No early check-out deductions logged.</p>
          ) : (
            <div className="space-y-3">
              {earlyLeaves.map(e => (
                <div key={e.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 flex flex-col space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded leading-none flex items-center gap-1">
                        <Clock size={10} />
                        <span>Left Early</span>
                      </span>
                      <span className="text-xs font-black text-[#1A1A1A] font-mono">
                        {new Date(e.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold bg-white border border-gray-150/40 rounded-lg p-2">
                    <span className="text-[11px] text-gray-600">Left shift {e.minutes} minutes early</span>
                    <span className="font-mono font-black text-red-750">
                      -₹{e.amount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Late Arrival Deductions Section */}
        <div>
          <h3 className="text-xs font-black text-[#1A1A1A] uppercase tracking-wider border-b border-[var(--border)] pb-2 mb-3.5 flex items-center justify-between">
            <span>Late Arrival Deductions</span>
            <span className="text-[9px] font-bold text-gray-450 font-mono">Total: -₹{lateDeductionsTotal.toFixed(2)}</span>
          </h3>

          {lateDeductions.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)] italic py-3 text-center">No late arrival deductions logged.</p>
          ) : (
            <div className="space-y-3">
              {lateDeductions.map(e => {
                const dateObj = new Date(e.date);
                const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <div key={e.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 flex flex-col space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded leading-none flex items-center gap-1">
                          <Clock size={10} />
                          <span>Late Arrival</span>
                        </span>
                        <span className="text-xs font-black text-[#1A1A1A] font-mono">
                          {dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold bg-white border border-gray-150/40 rounded-lg p-2">
                      <span className="text-[11px] text-gray-600">{formattedDate} — arrived {e.minutes} mins late (time deduction)</span>
                      <span className="font-mono font-black text-red-750">
                        -₹{e.amount.toFixed(2)} (permanent)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

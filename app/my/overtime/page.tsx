'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Timer, ChevronLeft, ChevronRight, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { formatTime12hr } from '@/lib/utils';

interface OTRecord {
  date: string;
  shiftEndTime: string;
  actualOutTime: string;
  extraMinutes: number;
  status: 'pending' | 'approved' | 'rejected';
}

export default function StaffOvertimePage() {
  const { user } = useAuth();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<OTRecord[]>([]);
  const [staffInfo, setStaffInfo] = useState<any>(null);

  const fetchOTData = async () => {
    if (!user || !user.staffId) return;
    setLoading(true);
    try {
      const year = parseInt(selectedMonth.split('-')[0]);
      const monthNum = parseInt(selectedMonth.split('-')[1]);
      const lastDay = new Date(year, monthNum, 0).getDate();
      const startOfMonth = `${selectedMonth}-01`;
      const endOfMonth = `${selectedMonth}-${lastDay}`;

      // 1. Fetch staff shift details
      const { data: sData, error: sErr } = await supabase
        .from('staff')
        .select('name, shift:shifts(*)')
        .eq('id', user.staffId)
        .single();
      if (sErr) throw sErr;
      setStaffInfo(sData);

      // 2. Fetch attendance logs with ot_minutes
      const { data: attData, error: attErr } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', user.staffId)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth)
        .gt('ot_minutes', 0);
      if (attErr) throw attErr;

      // 3. Fetch adjustments for the month (to identify rejected OT)
      const { data: adjData, error: adjErr } = await supabase
        .from('attendance_adjustments')
        .select('*')
        .eq('staff_id', user.staffId)
        .eq('type', 'ot')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);
      if (adjErr) throw adjErr;

      // Merge records
      const merged: OTRecord[] = (attData || []).map((att: any) => {
        const matchingAdj = (adjData || []).find((adj: any) => adj.date === att.date);
        
        let status: 'pending' | 'approved' | 'rejected' = 'pending';
        if (matchingAdj) {
          status = matchingAdj.status; // pending, approved, rejected
        } else if (att.ot_approved) {
          status = 'approved';
        }

        const shiftObj = Array.isArray(sData?.shift) ? sData.shift[0] : sData?.shift;
        return {
          date: att.date,
          shiftEndTime: shiftObj?.end_time || '18:00',
          actualOutTime: att.check_out_time || '—',
          extraMinutes: att.ot_minutes || 0,
          status
        };
      });

      // Sort by date descending
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecords(merged);

    } catch (e) {
      console.error('Error fetching OT details:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOTData();
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

  // Convert minutes to "X hrs Y mins" helper
  const formatMins = (totalMins: number) => {
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    
    const hrsStr = hrs > 0 ? `${hrs} hr${hrs > 1 ? 's' : ''}` : '';
    const minsStr = mins > 0 ? `${mins} min${mins > 1 ? 's' : ''}` : '';
    
    if (hrsStr && minsStr) return `${hrsStr} ${minsStr}`;
    if (hrsStr) return hrsStr;
    if (minsStr) return minsStr;
    return '0 mins';
  };

  // Monthly summary stats calculations (HOURS AND MINUTES ONLY - NO₹)
  const summaries = useMemo(() => {
    let earned = 0;
    let approved = 0;
    let pending = 0;

    records.forEach(r => {
      earned += r.extraMinutes;
      if (r.status === 'approved') {
        approved += r.extraMinutes;
      } else if (r.status === 'pending') {
        pending += r.extraMinutes;
      }
    });

    return {
      earned: formatMins(earned),
      approved: formatMins(approved),
      pending: formatMins(pending)
    };
  }, [records]);

  const getStatusBadge = (status: 'pending' | 'approved' | 'rejected') => {
    switch (status) {
      case 'approved':
        return (
          <span className="bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/20 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
            Approved ✓
          </span>
        );
      case 'rejected':
        return (
          <span className="bg-gray-100 text-gray-505 border border-gray-200 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
            Not Approved
          </span>
        );
      default:
        return (
          <span className="bg-amber-50 text-amber-700 border border-amber-200/50 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
            Pending Approval
          </span>
        );
    }
  };

  const getStatusIcon = (status: 'pending' | 'approved' | 'rejected') => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={15} className="text-[var(--success)]" />;
      case 'rejected':
        return <XCircle size={15} className="text-gray-400" />;
      default:
        return <Clock size={15} className="text-amber-500" />;
    }
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
      {/* Tab Header */}
      <div className="flex items-center justify-between bg-white border border-[#E8E8E8] rounded-[14px] p-3 shadow-sm">
        <span className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider">Overtime Register</span>
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

      {/* Summary Box (OT summary in hrs/mins only, no ₹ symbols) */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 shadow-sm">
        <h3 className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider mb-3">OT Summary (This Month)</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 text-center">
            <div className="text-[13px] font-black text-[#1A1A1A] leading-tight truncate" title={summaries.earned}>{summaries.earned}</div>
            <div className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-1.5 leading-none">Earned</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 text-center">
            <div className="text-[13px] font-black text-[var(--success)] leading-tight truncate" title={summaries.approved}>{summaries.approved}</div>
            <div className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-1.5 leading-none">Approved</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 text-center">
            <div className="text-[13px] font-black text-amber-600 leading-tight truncate" title={summaries.pending}>{summaries.pending}</div>
            <div className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider mt-1.5 leading-none">Pending</div>
          </div>
        </div>
      </div>

      {/* List of OT Records */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 shadow-sm flex flex-col">
        <h3 className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider border-b border-[var(--border)] pb-2 mb-3">OT Details</h3>

        {records.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--text-muted)] font-semibold italic">
            No overtime logged for this month.
          </div>
        ) : (
          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {records.map((r, index) => (
              <div key={index} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3.5 flex flex-col space-y-2.5">
                
                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(r.status)}
                    <span className="text-xs font-black text-[#1A1A1A]">
                      {new Date(r.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })}
                    </span>
                  </div>
                  {getStatusBadge(r.status)}
                </div>

                <div className="bg-white border border-gray-150/50 rounded-lg p-2.5 text-xs text-gray-600 font-semibold grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[9px] text-[var(--text-muted)] uppercase block">Shift Out Time</span>
                    <span className="text-[#1A1A1A] font-mono font-bold mt-0.5 block">{formatTime12hr(r.shiftEndTime)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-[var(--text-muted)] uppercase block">Actual Checkout</span>
                    <span className="text-[#1A1A1A] font-mono font-bold mt-0.5 block">{formatTime12hr(r.actualOutTime)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs font-bold pt-1">
                  <span>Extra Time worked:</span>
                  <span className="text-emerald-700 font-black font-mono">{formatMins(r.extraMinutes)}</span>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

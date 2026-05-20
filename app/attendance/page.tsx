'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Clock, RefreshCw, CircleCheck, CircleX, AlertTriangle, X } from 'lucide-react';

type StatusFilter = 'All' | 'Present' | 'Late' | 'Absent' | 'Checked Out';
type BranchFilter = 'All' | 'daily' | 'hypermarket';

interface StaffMember {
  id: string;
  name: string;
  branch_id: string;
  department: string;
  active: boolean;
  shift: {
    id: string;
    label: string;
    start_time: string;
    end_time: string;
  };
}

interface AttendanceRecord {
  id: string;
  staff_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: 'present' | 'late' | 'absent';
  color_code: 'green' | 'yellow' | 'orange' | 'red';
  minutes_late: number;
  ot_minutes: number;
  ot_approved: boolean;
  early_in_minutes: number;
  early_in_approved: boolean;
  check_in_photo: string | null;
  check_out_photo: string | null;
  marked_by: string;
}

interface LateFine {
  id: string;
  staff_id: string;
  date: string;
  fine_amount: number;
  waived: boolean;
}

interface Adjustment {
  id: string;
  staff_id: string;
  date: string;
  type: 'ot' | 'early_in';
  minutes: number;
  status: 'pending' | 'approved' | 'rejected';
}

export default function AttendancePage() {
  const { user, userBranch, canSeeAllBranches } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [fines, setFines] = useState<LateFine[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [branchFilter, setBranchFilter] = useState<BranchFilter>('All');
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; label: string; time?: string } | null>(null);

  // Set initial branch filter for branch HR
  useEffect(() => {
    if (userBranch) {
      setBranchFilter(userBranch as BranchFilter);
    }
  }, [userBranch]);

  const fetchData = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Fetch staff
      let staffQuery = supabase.from('staff').select('*, shift:shifts(*)').eq('active', true);
      if (userBranch) {
        staffQuery = staffQuery.eq('branch_id', userBranch);
      }
      const { data: sData, error: sErr } = await staffQuery;
      if (sErr) throw sErr;
      setStaff((sData || []) as unknown as StaffMember[]);

      // 2. Fetch today's attendance
      let attendanceQuery = supabase.from('attendance').select('*').eq('date', todayStr);
      const { data: aData, error: aErr } = await attendanceQuery;
      if (aErr) throw aErr;
      setAttendance(aData || []);

      // 3. Fetch today's late fines
      let finesQuery = supabase.from('late_fines').select('*').eq('date', todayStr);
      const { data: fData, error: fErr } = await finesQuery;
      if (fErr) throw fErr;
      setFines(fData || []);

      // 4. Fetch today's adjustments
      let adjustmentsQuery = supabase.from('attendance_adjustments').select('*').eq('date', todayStr);
      const { data: adjData, error: adjErr } = await adjustmentsQuery;
      if (adjErr) throw adjErr;
      setAdjustments(adjData || []);

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Could not load data. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData();

    // Realtime attendance channel
    const channel = supabase
      .channel('attendance-page-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userBranch]);

  // Combine staff with today's metrics
  const combinedData = staff.map((s) => {
    const record = attendance.find((a) => a.staff_id === s.id);
    const lateFine = fines.find((f) => f.staff_id === s.id);
    const staffAdjustments = adjustments.filter((adj) => adj.staff_id === s.id);

    return {
      ...s,
      record: record || null,
      fine: lateFine || null,
      adjustments: staffAdjustments,
    };
  });

  // Filters application
  const filteredData = combinedData.filter((item) => {
    // 1. Branch isolation filter
    if (userBranch) {
      if (item.branch_id !== userBranch) return false;
    } else {
      if (branchFilter !== 'All' && item.branch_id !== branchFilter) return false;
    }

    // 2. Status filter
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Present') return !!item.record && item.record.check_in_time;
    if (statusFilter === 'Late') return !!item.record && item.record.status === 'late';
    if (statusFilter === 'Absent') return !item.record || !item.record.check_in_time;
    if (statusFilter === 'Checked Out') return !!item.record && !!item.record.check_out_time;

    return true;
  });

  const getStatusBadge = (record: AttendanceRecord | null) => {
    if (!record || !record.check_in_time) {
      return (
        <span className="bg-[rgba(248,113,113,0.12)] text-[#F87171] border border-[rgba(248,113,113,0.2)] text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center space-x-1">
          <CircleX size={16} strokeWidth={1.5} style={{ color: '#F87171' }} />
          <span>Absent</span>
        </span>
      );
    }
    if (record.status === 'late') {
      return (
        <span className="bg-[rgba(251,191,36,0.12)] text-[#FBBF24] border border-[rgba(251,191,36,0.2)] text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center space-x-1">
          <AlertTriangle size={16} strokeWidth={1.5} style={{ color: '#FBBF24' }} />
          <span>Late</span>
        </span>
      );
    }
    return (
      <span className="bg-[rgba(74,222,128,0.12)] text-[#4ADE80] border border-[rgba(74,222,128,0.2)] text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center space-x-1">
        <CircleCheck size={16} strokeWidth={1.5} style={{ color: '#4ADE80' }} />
        <span>Present</span>
      </span>
    );
  };

  const getDotColor = (record: AttendanceRecord | null) => {
    if (!record || !record.check_in_time) return 'bg-[#6B7280]';
    if (record.color_code === 'green') return 'bg-[#4ADE80]';
    if (record.color_code === 'yellow') return 'bg-[#FBBF24]';
    if (record.color_code === 'orange') return 'bg-[#FB923C]';
    if (record.color_code === 'red') return 'bg-[#F87171]';
    return 'bg-[#4ADE80]';
  };

  const getBranchName = (id: string) => {
    return id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Attendance</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">Today's register</p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="min-h-[40px] bg-transparent border border-[var(--border-strong)] active:border-white text-[var(--text-secondary)] px-3 rounded-[10px] text-xs font-bold flex items-center justify-center space-x-1.5 transition-all active:scale-[0.97]"
        >
          <RefreshCw size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            onClick={() => {
              setLoading(true);
              setErrorMsg('');
              fetchData();
            }}
            className="text-xs underline font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Branch selector (Admin/Ops/Head HR only) */}
      {canSeeAllBranches && !userBranch && (
        <div className="flex border-b border-[var(--border)]">
          {[
            { id: 'All', label: 'All Branches' },
            { id: 'daily', label: 'Nearbi Daily' },
            { id: 'hypermarket', label: 'Nearbi Hypermarket' },
          ].map((b) => (
            <button
              key={b.id}
              onClick={() => setBranchFilter(b.id as BranchFilter)}
              className={`flex-1 text-center py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                branchFilter === b.id
                  ? 'border-white text-white'
                  : 'border-transparent text-[var(--text-secondary)]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* Status pills selector */}
      <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none select-none">
        {(['All', 'Present', 'Late', 'Absent', 'Checked Out'] as StatusFilter[]).map((pill) => {
          const isSelected = statusFilter === pill;
          return (
            <button
              key={pill}
              onClick={() => setStatusFilter(pill)}
              className={`px-4 py-2 text-xs font-bold rounded-full transition-all border whitespace-nowrap ${
                isSelected
                  ? 'bg-white text-[#1E2028] border-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-white/20 active:scale-95'
              }`}
            >
              {pill}
            </button>
          );
        })}
      </div>

      {/* Main List */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6">
          <Clock size={48} strokeWidth={1} style={{ color: '#2A2D38' }} className="mb-2" />
          <h3 className="text-sm font-bold text-white">No attendance records yet today</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Tap refresh or check back once kiosks report registrations.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredData.map((item) => {
            const hasCheckIn = !!item.record && !!item.record.check_in_time;
            const hasCheckOut = !!item.record && !!item.record.check_out_time;

            // Find OT and Early In approvals status
            const otAdjustment = item.adjustments.find((adj) => adj.type === 'ot');
            const earlyAdjustment = item.adjustments.find((adj) => adj.type === 'early_in');

            return (
              <div
                key={item.id}
                className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-4 flex items-start space-x-3.5 relative shadow-sm"
              >
                {/* Left Dot Indicator */}
                <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-2 ${getDotColor(item.record)}`} />

                {/* Avatar */}
                <div
                  className={`w-11 h-11 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 border ${
                    hasCheckIn
                      ? 'bg-white/10 text-white border-white/20'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border-strong)]'
                  }`}
                >
                  {item.name.charAt(0).toUpperCase()}
                </div>

                {/* Info block */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-white leading-tight truncate">
                        {item.name}
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)] font-semibold mt-0.5 leading-none">
                        {item.department} • {item.shift?.label || 'No Shift'}
                      </p>
                      {/* Admin/Ops see branch indicator */}
                      {!userBranch && (
                        <span className="inline-block text-[9px] font-bold uppercase text-[var(--text-secondary)] mt-1 bg-[var(--bg-elevated)] border border-[var(--border-strong)] px-1.5 py-0.5 rounded">
                          {getBranchName(item.branch_id)}
                        </span>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="flex-shrink-0">{getStatusBadge(item.record)}</div>
                  </div>

                  {/* Metrics details */}
                  {hasCheckIn && item.record && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {/* Check In Time & Photo */}
                      <div className="bg-[rgba(74,222,128,0.1)] border border-[rgba(74,222,128,0.15)] text-[#4ADE80] text-[10px] font-bold px-2 py-1 rounded flex items-center space-x-1.5">
                        <span>IN: {item.record.check_in_time}</span>
                        {item.record.check_in_photo && (
                          <button
                            onClick={() =>
                              setSelectedPhoto({
                                url: item.record!.check_in_photo!,
                                label: `${item.name} - Check In`,
                                time: item.record!.check_in_time || '',
                              })
                            }
                            className="w-4 h-4 rounded-full overflow-hidden border border-[rgba(74,222,128,0.3)] active:scale-90"
                          >
                            <img
                              src={item.record.check_in_photo}
                              alt="Selfie"
                              className="w-full h-full object-cover"
                            />
                          </button>
                        )}
                      </div>

                      {/* Minutes Late */}
                      {item.record.status === 'late' && item.record.minutes_late > 0 && (
                        <div className="bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.15)] text-[#FBBF24] text-[10px] font-bold px-2 py-1 rounded">
                          {item.record.minutes_late} mins late
                        </div>
                      )}

                      {/* Check Out Time & Photo */}
                      {hasCheckOut && (
                        <div className="bg-[rgba(96,165,250,0.1)] border border-[rgba(96,165,250,0.15)] text-[#60A5FA] text-[10px] font-bold px-2 py-1 rounded flex items-center space-x-1.5">
                          <span>OUT: {item.record.check_out_time}</span>
                          {item.record.check_out_photo && (
                            <button
                              onClick={() =>
                                setSelectedPhoto({
                                  url: item.record!.check_out_photo!,
                                  label: `${item.name} - Check Out`,
                                  time: item.record!.check_out_time || '',
                                })
                              }
                              className="w-4 h-4 rounded-full overflow-hidden border border-[rgba(96,165,250,0.3)] active:scale-90"
                            >
                              <img
                                src={item.record.check_out_photo}
                                alt="Selfie"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Overtime Approval status */}
                      {otAdjustment && (
                        <div
                          className={`text-[9px] font-bold px-2 py-1 rounded border ${
                            otAdjustment.status === 'pending'
                              ? 'bg-[rgba(251,191,36,0.1)] border-[rgba(251,191,36,0.15)] text-[#FBBF24]'
                              : otAdjustment.status === 'approved'
                              ? 'bg-[rgba(74,222,128,0.1)] border-[rgba(74,222,128,0.15)] text-[#4ADE80]'
                              : 'bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-muted)]'
                          }`}
                        >
                          OT {otAdjustment.status === 'pending' ? 'Pending' : otAdjustment.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                        </div>
                      )}

                      {/* Early Check-in Approval status */}
                      {earlyAdjustment && (
                        <div
                          className={`text-[9px] font-bold px-2 py-1 rounded border ${
                            earlyAdjustment.status === 'pending'
                              ? 'bg-[rgba(251,191,36,0.1)] border-[rgba(251,191,36,0.15)] text-[#FBBF24]'
                              : earlyAdjustment.status === 'approved'
                              ? 'bg-[rgba(74,222,128,0.1)] border-[rgba(74,222,128,0.15)] text-[#4ADE80]'
                              : 'bg-[var(--bg-elevated)] border-[var(--border-strong)] text-[var(--text-muted)]'
                          }`}
                        >
                          Early In {earlyAdjustment.status === 'pending' ? 'Pending' : earlyAdjustment.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                        </div>
                      )}

                      {/* Late fine amount */}
                      {item.fine && (
                        <div className="bg-[rgba(248,113,113,0.1)] border border-[rgba(248,113,113,0.15)] text-[#F87171] text-[10px] font-bold px-2 py-1 rounded">
                          Fine: ₹{item.fine.fine_amount} {item.fine.waived && '(Waived)'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[11000] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-sm w-full bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-strong)] p-4 flex flex-col items-center">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-white flex items-center justify-center p-1"
            >
              <X size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
            </button>
            <h4 className="text-white text-sm font-bold mb-1">{selectedPhoto.label}</h4>
            {selectedPhoto.time && (
              <p className="text-[10px] text-[var(--text-muted)] font-bold mb-3">Time: {selectedPhoto.time}</p>
            )}
            <img
              src={selectedPhoto.url}
              alt="Verification selfie"
              className="w-full max-h-[60vh] object-contain rounded-lg border border-[var(--border)]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

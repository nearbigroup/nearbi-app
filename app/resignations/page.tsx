'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  UserMinus,
  ChevronRight,
  AlertCircle,
  Calendar,
  Building2,
  Play,
  RefreshCw,
  CheckCircle2,
  UserX
} from 'lucide-react';

interface ResignationItem {
  id: string;
  staff_id: string;
  initiated_by: string;
  initiated_at: string;
  reason: string;
  last_working_day: string;
  status: 'in_progress' | 'clearance_complete' | 'approved' | 'settled';
  staff: {
    name: string;
    branch_id: string;
    department: string;
  };
}

export default function ResignationsPage() {
  const { user, userBranch, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [resignations, setResignations] = useState<ResignationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'in_progress' | 'approved' | 'settled'>('all');
  const [simulating, setSimulating] = useState(false);

  // Role Protection
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/');
        return;
      }
      const allowedRoles = ['admin', 'ops_manager', 'staff_executive'];
      if (!allowedRoles.includes(user.role)) {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, router]);

  const fetchResignations = async () => {
    try {
      setLoading(true);
      setErrorMsg('');

      // Build query to fetch resignations left-joining staff details
      let query = supabase
        .from('resignations')
        .select('*, staff:staff_id(name, branch_id, department)');

      const { data, error } = await query.order('last_working_day', { ascending: true });
      if (error) throw error;

      let items = (data || []) as unknown as ResignationItem[];

      // Filter branch scoping for daily_hr and hyper_hr
      if (userBranch) {
        items = items.filter(item => item.staff?.branch_id === userBranch);
      }

      setResignations(items);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to load resignations list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchResignations();
    }
  }, [user, userBranch]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleSimulateDailyCheck = async () => {
    if (simulating) return;
    setSimulating(true);
    try {
      const { data, error } = await supabase.rpc('process_daily_resignations');
      if (error) throw error;

      const res = data as { staff_updated: number; resignations_updated: number } | null;
      const staffCount = res?.staff_updated ?? 0;
      const resCount = res?.resignations_updated ?? 0;

      showToast(`Simulation completed! Settled ${resCount} resignations.`);
      fetchResignations();
    } catch (err: any) {
      console.error(err);
      alert('Simulation check failed: ' + err.message);
    } finally {
      setSimulating(false);
    }
  };

  const filteredResignations = resignations.filter(r => {
    if (activeTab === 'all') return true;
    if (activeTab === 'in_progress') {
      return r.status === 'in_progress' || r.status === 'clearance_complete';
    }
    return r.status === activeTab;
  });

  const getStatusBadge = (status: ResignationItem['status']) => {
    switch (status) {
      case 'in_progress':
        return (
          <span className="bg-amber-500/10 border border-amber-500/25 text-amber-500 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
            In Progress
          </span>
        );
      case 'clearance_complete':
        return (
          <span className="bg-blue-500/10 border border-blue-500/25 text-blue-500 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
            Cleared
          </span>
        );
      case 'approved':
        return (
          <span className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
            Approved
          </span>
        );
      case 'settled':
        return (
          <span className="bg-gray-500/10 border border-gray-500/25 text-gray-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
            Settled
          </span>
        );
      default:
        return null;
    }
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[40px] w-1/3" />
        <div className="skeleton h-[50px] w-full" />
        <div className="skeleton h-[120px] w-full" />
        <div className="skeleton h-[120px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header back bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="w-10 h-10 rounded-full border border-[#E8E8E8] bg-white flex items-center justify-center text-[#555555] hover:text-[#1A1A1A] active:scale-90 transition-transform cursor-pointer shadow-sm"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#999999]">Management</span>
            <h1 className="text-xl font-extrabold text-[#1A1A1A] leading-tight">Resignations</h1>
          </div>
        </div>

        {/* Simulation button (Admin/Ops only) */}
        {(user?.role === 'admin' || user?.role === 'ops_manager') && (
          <button
            onClick={handleSimulateDailyCheck}
            disabled={simulating}
            className="bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer flex items-center space-x-1.5"
          >
            {simulating ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} strokeWidth={2.5} />
            )}
            <span>Simulate Cron</span>
          </button>
        )}
      </div>

      {errorMsg ? (
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 text-center max-w-sm mx-auto flex flex-col items-center justify-center shadow-sm">
          <AlertCircle size={40} strokeWidth={1.5} className="text-[#C0392B] mb-2" />
          <h3 className="text-sm font-bold text-[#1A1A1A] mb-1">{errorMsg}</h3>
          <button
            onClick={fetchResignations}
            className="mt-4 px-4 py-2 bg-[#1A1A1A] text-white text-xs font-bold rounded-lg shadow cursor-pointer active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Tabs selector */}
          <div className="flex bg-[#F2F2F2] rounded-full p-1 w-full select-none">
            {[
              { id: 'all', label: 'All' },
              { id: 'in_progress', label: 'Active' },
              { id: 'approved', label: 'Approved' },
              { id: 'settled', label: 'Settled' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 text-center py-2 text-xs font-bold rounded-full transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#1A1A1A] text-white shadow-sm'
                    : 'text-[#555555] hover:text-[#1A1A1A]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* List display */}
          {filteredResignations.length === 0 ? (
            <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-8 text-center flex flex-col items-center justify-center shadow-sm">
              <UserX size={44} strokeWidth={1.5} className="text-[#BBBBBB] mb-2" />
              <h3 className="text-sm font-bold text-[#1A1A1A]">No resignation records found</h3>
              <p className="text-xs text-[#999999] mt-1">
                There are no resignation clearances matching this tab filter.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredResignations.map(r => (
                <Link
                  href={`/resignations/${r.id}`}
                  key={r.id}
                  className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 flex items-center justify-between hover:border-[#B0B0B0] transition-colors cursor-pointer shadow-sm group"
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-sm text-[#1A1A1A] leading-tight truncate">
                        {r.staff?.name || 'Unknown Staff'}
                      </h3>
                      {getStatusBadge(r.status)}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-[#555555] font-semibold">
                      <span className="flex items-center gap-1">
                        <Building2 size={11} className="text-[#999999]" />
                        {r.staff?.branch_id === 'daily' ? 'Daily' : 'Hypermarket'} • {r.staff?.department}
                      </span>
                      <span className="text-[#D0D0D0]">•</span>
                      <span className="flex items-center gap-1 font-mono text-[#D97706]">
                        <Calendar size={11} />
                        LWD: {new Date(r.last_working_day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    <p className="text-[10px] text-[#999999] font-medium italic">
                      Reason: <span className="capitalize text-[#555555] font-bold">{r.reason.replace(/_/g, ' ')}</span>
                    </p>
                  </div>

                  <ChevronRight
                    size={18}
                    className="text-[#BBBBBB] group-hover:text-[#1A1A1A] group-hover:translate-x-0.5 transition-all ml-2"
                  />
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Simple Toast Alerts */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[15000] bg-[#EDF7EF] border border-[#2D7A3A] text-[#2D7A3A] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-1">
          <CheckCircle2 size={14} className="text-[#2D7A3A]" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

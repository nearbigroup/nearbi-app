'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { User, LogOut, Lock, Calendar, Building, Briefcase, Phone, Smartphone, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatTime12hr } from '@/lib/utils';

export default function StaffProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [staffInfo, setStaffInfo] = useState<any>(null);

  useEffect(() => {
    if (!user || !user.staffId) return;

    const fetchStaff = async () => {
      try {
        const { data, error } = await supabase
          .from('staff')
          .select('*, shift:shifts(*)')
          .eq('id', user.staffId)
          .single();
        if (error) throw error;
        setStaffInfo(data);
      } catch (e) {
        console.error('Error fetching profile staff info:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchStaff();
  }, [user]);

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  const getMaskedMobile = (mobile: string) => {
    if (!mobile) return '—';
    const clean = mobile.trim();
    if (clean.length < 5) return clean;
    return `${clean.substring(0, 5)} XXXXX`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[180px] w-full rounded-2xl" />
        <div className="skeleton h-[60px] w-full rounded-xl" />
        <div className="skeleton h-[60px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Profile Title */}
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3 shadow-sm flex items-center justify-between">
        <span className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider">My Profile</span>
        <User size={18} className="text-[var(--text-secondary)]" />
      </div>

      {/* Info Card */}
      {staffInfo && (
        <div className="bg-white border border-[#E8E8E8] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-[#1A1A1A] text-white font-black text-2xl flex items-center justify-center shadow-md">
              {staffInfo.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-[#1A1A1A] font-black text-base leading-none">{staffInfo.name}</h3>
              <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider mt-1.5">{staffInfo.department}</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3.5 text-xs text-[#555555] font-semibold">
            <div className="flex items-center justify-between">
              <span className="flex items-center text-[var(--text-muted)]">
                <Building size={14} className="mr-2" /> Branch:
              </span>
              <span className="text-[#1a1a1a] font-bold">{getBranchLabel(staffInfo.branch_id)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center text-[var(--text-muted)]">
                <Briefcase size={14} className="mr-2" /> Shift Schedule:
              </span>
              <span className="text-[#1a1a1a] font-bold">
                {staffInfo.shift?.label || 'None'} ({formatTime12hr(staffInfo.shift?.start_time)} - {formatTime12hr(staffInfo.shift?.end_time)})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center text-[var(--text-muted)]">
                <Calendar size={14} className="mr-2" /> Join Date:
              </span>
              <span className="text-[#1a1a1a] font-bold">
                {new Date(staffInfo.join_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center text-[var(--text-muted)]">
                <Smartphone size={14} className="mr-2" /> Registered Mobile:
              </span>
              <span className="text-[#1a1a1a] font-mono font-bold">
                {getMaskedMobile(user?.email || '')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2.5">
        <button
          onClick={() => router.push('/my/change-password')}
          className="w-full bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-gray-50/50 min-h-[46px] rounded-xl flex items-center justify-between px-4 text-xs font-bold transition-all active:scale-[0.98] shadow-sm cursor-pointer"
        >
          <span className="flex items-center">
            <Lock size={15} className="mr-2 text-[var(--text-secondary)]" /> Change Account Password
          </span>
          <ChevronRight size={16} className="text-gray-400" />
        </button>

        <button
          onClick={logout}
          className="w-full bg-red-50 border border-red-200/50 hover:bg-red-100/30 text-red-700 min-h-[46px] rounded-xl flex items-center justify-center text-xs font-bold transition-all active:scale-[0.98] shadow-sm cursor-pointer space-x-1.5"
        >
          <LogOut size={15} />
          <span>Sign Out of Account</span>
        </button>
      </div>

    </div>
  );
}

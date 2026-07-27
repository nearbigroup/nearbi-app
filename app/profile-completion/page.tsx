'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import AppShell from '@/components/AppShell';
import { Search, Users, ChevronRight, CheckCircle2, AlertCircle, ShieldAlert, ArrowUpDown, Filter } from 'lucide-react';

interface StaffCompletion {
  id: string;
  name: string;
  department: string;
  branch_id: string;
  completionPercent: number;
  completedCount: number;
  missingSections: string[];
}

export default function ProfileCompletionPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [staffList, setStaffList] = useState<StaffCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<'all' | 'daily' | 'hypermarket'>('all');
  const [sortAscending, setSortAscending] = useState(true);

  // Access Control Guard
  useEffect(() => {
    if (!isLoading) {
      if (!user || (user.role !== 'admin' && user.role !== 'ops_manager')) {
        router.replace('/dashboard');
      }
    }
  }, [user, isLoading, router]);

  const fetchStaffCompletion = async () => {
    try {
      setLoading(true);
      const { data: staffData, error } = await supabase
        .from('staff')
        .select(`
          id,
          name,
          department,
          branch_id,
          active,
          is_resigned,
          staff_profiles(*),
          staff_emergency_contacts(*),
          staff_documents(*)
        `)
        .eq('active', true)
        .eq('is_resigned', false);

      if (error) throw error;

      const computed: StaffCompletion[] = (staffData || []).map((s: any) => {
        const profile = Array.isArray(s.staff_profiles) ? s.staff_profiles[0] : s.staff_profiles;
        const contacts = s.staff_emergency_contacts || [];

        let completedCount = 0;
        const missing: string[] = [];

        // 1. Personal (5 items)
        let personalScore = 0;
        if (profile?.dob) personalScore++;
        if (profile?.gender) personalScore++;
        if (profile?.blood_group) personalScore++;
        if (profile?.marital_status) personalScore++;
        if (profile?.profile_photo_url) personalScore++;
        completedCount += personalScore;
        if (personalScore < 5) missing.push('Personal Details');

        // 2. Contact Info (4 items)
        let contactScore = 0;
        if (profile?.personal_phone?.trim()) contactScore++;
        if (profile?.personal_email?.trim()) contactScore++;
        if (profile?.current_address?.trim()) contactScore++;
        if (profile?.permanent_address?.trim()) contactScore++;
        completedCount += contactScore;
        if (contactScore < 4) missing.push('Contact Info');

        // 3. Emergency Contacts (1 item if >= 2 contacts completely filled)
        const validContacts = contacts.filter((c: any) => c.name?.trim() && c.phone?.trim()).length;
        if (validContacts >= 2) {
          completedCount++;
        } else {
          missing.push('Emergency Contacts');
        }

        // 4. Govt ID (2 items)
        let govtScore = 0;
        if (profile?.aadhaar_number?.trim() && profile?.aadhaar_number.replace(/\s+/g, '').length === 12) govtScore++;
        if (profile?.aadhaar_photo_url) govtScore++;
        completedCount += govtScore;
        if (govtScore < 2) missing.push('Aadhaar ID & Photo');

        // 5. Bank Details (4 items)
        let bankScore = 0;
        if (profile?.bank_account_number?.trim()) bankScore++;
        if (profile?.bank_ifsc?.trim()) bankScore++;
        if (profile?.bank_name?.trim()) bankScore++;
        if (profile?.bank_proof_url) bankScore++;
        completedCount += bankScore;
        if (bankScore < 4) missing.push('Bank Details');

        const percent = Math.round((completedCount / 16) * 100);

        return {
          id: s.id,
          name: s.name,
          department: s.department,
          branch_id: s.branch_id,
          completionPercent: percent,
          completedCount,
          missingSections: missing
        };
      });

      setStaffList(computed);
    } catch (err: any) {
      console.error('Error fetching profile completion data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'ops_manager')) {
      fetchStaffCompletion();
    }
  }, [user]);

  if (isLoading || !user || (user.role !== 'admin' && user.role !== 'ops_manager')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A1A1A]"></div>
      </div>
    );
  }

  // Filtering & Sorting
  const filteredList = staffList.filter((s) => {
    const matchesBranch = branchFilter === 'all' || s.branch_id === branchFilter;
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.department.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesBranch && matchesSearch;
  });

  const sortedList = [...filteredList].sort((a, b) => {
    if (sortAscending) {
      return a.completionPercent - b.completionPercent;
    }
    return b.completionPercent - a.completionPercent;
  });

  // Summary Metrics
  const totalStaff = staffList.length;
  const avgPercent = totalStaff > 0 ? Math.round(staffList.reduce((sum, s) => sum + s.completionPercent, 0) / totalStaff) : 0;
  const fullyCompletedCount = staffList.filter(s => s.completionPercent === 100).length;
  const incompleteCount = totalStaff - fullyCompletedCount;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#1A1A1A]">Staff Profile Completion Overview 📋</h1>
            <p className="text-xs text-[var(--text-muted)] font-semibold mt-0.5">
              Ops Head tracking dashboard for employee profile documentation & onboarding completeness.
            </p>
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-[#E8E8E8] rounded-xl p-3.5 shadow-sm">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Total Active Staff</span>
            <p className="text-lg font-black text-[#1A1A1A] mt-0.5">{totalStaff}</p>
          </div>
          <div className="bg-white border border-[#E8E8E8] rounded-xl p-3.5 shadow-sm">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Avg Completion</span>
            <p className="text-lg font-black text-[#1A1A1A] mt-0.5">{avgPercent}%</p>
          </div>
          <div className="bg-white border border-[#E8E8E8] rounded-xl p-3.5 shadow-sm">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">100% Completed</span>
            <p className="text-lg font-black text-[#2D7A3A] mt-0.5">{fullyCompletedCount}</p>
          </div>
          <div className="bg-white border border-[#E8E8E8] rounded-xl p-3.5 shadow-sm">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Action Needed</span>
            <p className="text-lg font-black text-[#C0392B] mt-0.5">{incompleteCount}</p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3.5 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999999]" />
              <input
                type="text"
                placeholder="Search staff name or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
              />
            </div>

            {/* Branch Filter & Sort */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
              <div className="flex bg-[#F2F2F2] rounded-xl p-1 text-xs font-bold text-[#555555]">
                <button
                  onClick={() => setBranchFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${branchFilter === 'all' ? 'bg-white text-[#1A1A1A] shadow-xs' : 'hover:text-[#1A1A1A]'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setBranchFilter('daily')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${branchFilter === 'daily' ? 'bg-white text-[#1A1A1A] shadow-xs' : 'hover:text-[#1A1A1A]'}`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setBranchFilter('hypermarket')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${branchFilter === 'hypermarket' ? 'bg-white text-[#1A1A1A] shadow-xs' : 'hover:text-[#1A1A1A]'}`}
                >
                  Hyper
                </button>
              </div>

              <button
                onClick={() => setSortAscending(!sortAscending)}
                className="bg-white border border-[#E8E8E8] hover:bg-[#F8F8F8] px-3 py-2 rounded-xl text-xs font-bold text-[#1A1A1A] flex items-center gap-1 shadow-xs"
                title="Toggle Sort Order"
              >
                <ArrowUpDown size={13} />
                <span>{sortAscending ? 'Least First' : 'Most First'}</span>
              </button>
            </div>

          </div>
        </div>

        {/* Staff Completion List */}
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-[90px] w-full" />
            <div className="skeleton h-[90px] w-full" />
            <div className="skeleton h-[90px] w-full" />
          </div>
        ) : sortedList.length === 0 ? (
          <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6 shadow-sm">
            <Users size={48} strokeWidth={1} className="text-[#999999] mb-2" />
            <h3 className="text-sm font-bold text-[#1A1A1A]">No staff records found</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">Try adjusting your search or branch filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedList.map((staff) => {
              const is100 = staff.completionPercent === 100;
              const isLow = staff.completionPercent < 50;

              return (
                <Link
                  key={staff.id}
                  href={`/staff/${staff.id}`}
                  className="bg-white border border-[#E8E8E8] rounded-[14px] p-4 flex flex-col hover:border-[#1A1A1A] transition-all shadow-sm group block cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${
                        is100 ? 'bg-[#EDF7EF] text-[#2D7A3A] border border-[#C3E6CB]' :
                        isLow ? 'bg-[#FDECEA] text-[#C0392B] border border-[#FADBD8]' :
                        'bg-[#FFF8E6] text-[#B8860B] border border-[#FEEFB3]'
                      }`}>
                        {staff.completionPercent}%
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-[#1A1A1A] group-hover:text-black flex items-center gap-1.5">
                          <span>{staff.name}</span>
                          {is100 && <CheckCircle2 size={14} className="text-[#2D7A3A]" />}
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)] font-semibold mt-0.5">
                          {staff.department} • <span className="capitalize">{staff.branch_id}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        is100 ? 'bg-[#EDF7EF] text-[#2D7A3A]' :
                        isLow ? 'bg-[#FDECEA] text-[#C0392B]' :
                        'bg-[#FFF8E6] text-[#B8860B]'
                      }`}>
                        {is100 ? 'Complete' : `${staff.completedCount}/16 Items`}
                      </span>
                      <ChevronRight size={16} className="text-[#999999] group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-[#F2F2F2] h-1.5 rounded-full overflow-hidden my-2">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        is100 ? 'bg-[#2D7A3A]' :
                        isLow ? 'bg-[#C0392B]' :
                        'bg-[#B8860B]'
                      }`}
                      style={{ width: `${staff.completionPercent}%` }}
                    />
                  </div>

                  {/* Missing Sections Summary */}
                  {!is100 && staff.missingSections.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[#C0392B]">Missing:</span>
                      {staff.missingSections.map((sec, idx) => (
                        <span key={idx} className="bg-[#F8F8F8] border border-[#E8E8E8] text-[#555555] text-[9.5px] font-semibold px-2 py-0.5 rounded-md">
                          {sec}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

      </div>
    </AppShell>
  );
}

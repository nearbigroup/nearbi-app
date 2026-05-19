'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { calculateSalary } from '@/lib/salary';
import { Staff, SalaryConfirmation } from './types';
import { formatCurrency, getCurrentMonthStr, formatMonthDisplay } from './utils';

const SkeletonCard = () => (
  <div style={{
    background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: '12px',
    height: '72px',
    marginBottom: '8px',
  }} />
);

export default function BulkConfirmTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [confirmations, setConfirmations] = useState<SalaryConfirmation[]>([]);
  
  // Computed salary data for each staff
  const [salaryData, setSalaryData] = useState<Record<string, any>>({});
  // Editable extra leave days per staff
  const [extraLeaves, setExtraLeaves] = useState<Record<string, number>>({});
  
  const [filterBranch, setFilterBranch] = useState<'all' | 'daily' | 'hypermarket'>('all');
  const month = getCurrentMonthStr();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    // Recalculate salaries whenever staff, leaves, or data changes
    const newSalaryData: Record<string, any> = {};
    
    staffList.forEach(s => {
      if (!s.shift) return;
      
      const config = {
        monthly_salary: s.monthly_salary,
        off_days_per_month: s.off_days_per_month,
        shift_hours: s.shift.hours
      };
      
      const attendance = {
        ot_minutes: s.total_ot_minutes || 0,
        extra_leave_days: extraLeaves[s.id] || 0
      };
      
      const breakdown = calculateSalary(config, attendance);
      newSalaryData[s.id] = breakdown;
    });
    
    setSalaryData(newSalaryData);
  }, [staffList, extraLeaves]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setFetchError(false);
      
      // 1. Fetch active staff
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*, branch:branches(name), shift:shifts(*)')
        .eq('active', true)
        .order('name');
         
      if (staffError) throw staffError;
      if (!staffData) return;

      // 2. Fetch OT minutes from attendance for this month
      const startDate = `${month}-01`;
      const endDate = `${month}-31`;
      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .select('staff_id, ot_minutes')
        .gte('date', startDate)
        .lte('date', endDate);

      if (attError) throw attError;

      // Aggregate OT
      const otMap: Record<string, number> = {};
      if (attData) {
        attData.forEach(r => {
          otMap[r.staff_id] = (otMap[r.staff_id] || 0) + (r.ot_minutes || 0);
        });
      }

      const staffWithOT = staffData.map(s => ({
        ...s,
        total_ot_minutes: otMap[s.id] || 0
      }));

      setStaffList(staffWithOT);

      // 3. Fetch existing confirmations
      const { data: confData, error: confError } = await supabase
        .from('salary_confirmations')
        .select('*')
        .eq('month', month);

      if (confError) throw confError;
      if (confData) setConfirmations(confData);

    } catch (e) {
      console.error('Error fetching salary confirmations:', e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLeave = (staffId: string, delta: number) => {
    setExtraLeaves(prev => {
      const current = prev[staffId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [staffId]: next };
    });
  };

  const handleConfirmAll = async () => {
    if (!user) return;
    setConfirming(true);
    try {
      const unconfirmed = filteredStaff.filter(s => !confirmations.find(c => c.staff_id === s.id));
      
      const payload = unconfirmed.map(s => {
        const bd = salaryData[s.id];
        return {
          staff_id: s.id,
          month: month,
          net_salary: bd.net_salary,
          base_salary: s.monthly_salary,
          leave_deduction: bd.leave_deduction,
          ot_pay: bd.ot_pay,
          extra_leave_days: extraLeaves[s.id] || 0,
          ot_minutes: s.total_ot_minutes || 0,
          confirmed_by: user.email || 'Admin',
        };
      });

      if (payload.length > 0) {
        const { error } = await supabase.from('salary_confirmations').insert(payload);
        if (error) throw error;
        // Refresh confirmations
        await fetchData();
        alert('All unconfirmed salaries have been successfully confirmed.');
      }
    } catch (e) {
      console.error('Error confirming salaries:', e);
      alert('Error confirming salaries.');
    } finally {
      setConfirming(false);
    }
  };

  if (fetchError) {
    return (
      <div className="py-12 text-center bg-red-50 border border-red-300 rounded-2xl p-6 my-4">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="text-lg font-bold text-red-700 mb-1">Could not load data. Check connection.</h3>
        <p className="text-xs text-red-500 mb-4">Please verify your internet connection.</p>
        <button 
          onClick={() => fetchData()} 
          className="bg-brand-accent text-[#111] font-bold px-6 py-2.5 rounded-xl active:scale-95 transition-transform"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }


  const filteredStaff = staffList.filter(s => filterBranch === 'all' || s.branch_id === filterBranch);
  const unconfirmedCount = filteredStaff.filter(s => !confirmations.find(c => c.staff_id === s.id)).length;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h2 className="text-xl font-bold text-white">Salary Confirmation — {formatMonthDisplay(month)}</h2>
        <p className="text-gray-400 text-sm">Review and confirm salary for all staff</p>
      </div>

      <div className="flex space-x-2 bg-[#111] p-1.5 rounded-xl print:hidden">
        {['all', 'daily', 'hypermarket'].map(b => (
          <button
            key={b}
            onClick={() => setFilterBranch(b as any)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wider transition-colors ${
              filterBranch === b ? 'bg-white text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            {b === 'all' ? 'All Branches' : b}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredStaff.map(s => {
          const bd = salaryData[s.id];
          if (!bd) return null;
          const isConfirmed = confirmations.find(c => c.staff_id === s.id);

          return (
            <div key={s.id} className="bg-[#1A1A1A] border border-[#333] rounded-2xl p-4 flex flex-col space-y-4">
              {/* Header */}
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-brand-accent text-[#111] font-bold text-lg flex items-center justify-center flex-shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-white">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.department} • {s.branch?.name}</div>
                </div>
              </div>

              {/* Salary Details */}
              <div className="grid grid-cols-2 gap-2 text-sm bg-black/40 rounded-xl p-3 border border-white/5">
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">Base</span>
                  <span className="text-white font-medium">{formatCurrency(s.monthly_salary)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">OT Pay</span>
                  <span className={bd.ot_pay > 0 ? "text-[#69F0AE] font-medium" : "text-gray-400"}>
                    +{formatCurrency(bd.ot_pay)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">Leave Ded.</span>
                  <span className={bd.leave_deduction > 0 ? "text-[#FF5252] font-medium" : "text-gray-400"}>
                    -{formatCurrency(bd.leave_deduction)}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-gray-500 text-[10px] uppercase font-bold">Net Salary</span>
                  <span className="text-brand-accent font-bold text-base">{formatCurrency(bd.net_salary)}</span>
                </div>
              </div>

              {/* Action Area */}
              <div className="flex items-center justify-between pt-1 border-t border-[#333] print:hidden">
                {!isConfirmed ? (
                  <>
                    <div className="flex items-center space-x-2 bg-black/50 border border-white/10 rounded-lg px-2 py-1">
                      <span className="text-xs text-gray-400 mr-2">Extra Leave:</span>
                      <button onClick={() => handleUpdateLeave(s.id, -1)} className="w-6 h-6 rounded-md bg-[#222] text-white flex items-center justify-center active:scale-95">-</button>
                      <span className="w-4 text-center text-sm font-bold text-white">{extraLeaves[s.id] || 0}</span>
                      <button onClick={() => handleUpdateLeave(s.id, 1)} className="w-6 h-6 rounded-md bg-[#222] text-white flex items-center justify-center active:scale-95">+</button>
                    </div>
                    <div className="text-xs font-bold text-amber-500 uppercase">Pending</div>
                  </>
                ) : (
                  <div className="w-full flex justify-between items-center bg-[#2E7D32]/10 border border-[#2E7D32]/30 px-3 py-2 rounded-lg">
                    <span className="text-xs text-gray-400">Confirmed on {new Date(isConfirmed.confirmed_at).toLocaleDateString()}</span>
                    <span className="text-[#69F0AE] text-sm font-bold flex items-center">
                      <span className="mr-1">✓</span> Confirmed
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredStaff.length === 0 && (
          <div className="text-center py-10 text-gray-500">No staff found for this branch.</div>
        )}
      </div>

      {/* Bulk Confirm Button */}
      {unconfirmedCount > 0 ? (
        <button 
          onClick={handleConfirmAll}
          disabled={confirming}
          className="w-full bg-brand-accent text-[#111] font-bold text-lg py-4 rounded-xl shadow-[0_4px_14px_rgba(245,168,0,0.4)] active:scale-95 transition-all print:hidden disabled:opacity-50"
        >
          {confirming ? 'Confirming...' : `CONFIRM ALL (${unconfirmedCount})`}
        </button>
      ) : (
        <div className="w-full bg-[#2E7D32]/20 border border-[#2E7D32]/50 text-[#69F0AE] font-bold text-center py-4 rounded-xl print:hidden">
          All salaries confirmed ✓
        </div>
      )}
    </div>
  );
}

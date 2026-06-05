'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Plus, Trash2 } from 'lucide-react';

interface FineSettings {
  id: string;
  yellow_fine: number;
  orange_fine: number;
  red_fine: number;
  yellow_free_passes: number;
}

interface BreakSettings {
  id?: string;
  morning_tea_duration: number;
  morning_tea_start: string;
  morning_tea_end: string;
  food_break_duration: number;
  food_break_start: string;
  food_break_end: string;
  evening_tea_duration: number;
  evening_tea_start: string;
  evening_tea_end: string;
}

interface Staff {
  id: string;
  name: string;
  department: string;
  branch_id: string;
}

interface Exemption {
  id: string;
  staff_id: string;
  staff: Staff;
}

export default function SettingsPage() {
  const { user, canSeeSalaryBreakdown, isLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Danger zone states
  const [dangerAction, setDangerAction] = useState<'CLEAR_ATTENDANCE' | 'DELETE_INACTIVE' | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [executingDanger, setExecutingDanger] = useState(false);

  const [settings, setSettings] = useState<FineSettings>({
    id: 'default',
    yellow_fine: 25,
    orange_fine: 50,
    red_fine: 100,
    yellow_free_passes: 4,
  });

  const [exemptions, setExemptions] = useState<Exemption[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  const [savingSettings, setSavingSettings] = useState(false);
  const [addingExemption, setAddingExemption] = useState(false);

  const [breakSettings, setBreakSettings] = useState<BreakSettings>({
    morning_tea_duration: 10,
    morning_tea_start: '09:30',
    morning_tea_end: '11:30',
    food_break_duration: 25,
    food_break_start: '12:00',
    food_break_end: '15:00',
    evening_tea_duration: 10,
    evening_tea_start: '16:00',
    evening_tea_end: '18:30',
  });
  const [savingBreakSettings, setSavingBreakSettings] = useState(false);

  const [recalculating, setRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState<string | null>(null);
  const [recalcResult, setRecalcResult] = useState<{
    total: number;
    corrected: number;
    deleted: number;
    skipped: number;
  } | null>(null);
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const fetchData = async () => {
    try {
      // 1. Fetch fine settings section: independent try/catch
      try {
        const { data: setD, error: setE } = await supabase
          .from('fine_settings')
          .select('*')
          .eq('id', 'default')
          .maybeSingle();

        if (setE) throw setE;
        if (setD) {
          setSettings(setD);
        }
      } catch (err: any) {
        console.error('Fine settings fetch error:', err);
      }

      // 2. Fetch exemptions section: independent try/catch
      try {
        const { data: exD, error: exE } = await supabase
          .from('staff_fine_exemptions')
          .select('*, staff!inner(*)');
        
        if (exE) throw exE;
        setExemptions((exD || []) as unknown as Exemption[]);
      } catch (err: any) {
        console.error('Exemptions fetch error:', err);
        setExemptions([]);
      }

      // 3. Fetch active staff list: independent try/catch
      try {
        const { data: stD, error: stE } = await supabase
          .from('staff')
          .select('id, name, department, branch_id')
          .eq('active', true)
          .order('name');
        
        if (stE) throw stE;
        setStaffList(stD || []);
      } catch (err: any) {
        console.error('Staff list fetch error:', err);
        setStaffList([]);
      }

      // 4. Fetch break settings section: independent try/catch with auto default initialization
      try {
        const { data: breakData, error: breakE } = await supabase
          .from('break_settings')
          .select('*')
          .limit(1);

        if (breakE) throw breakE;

        if (!breakData || breakData.length === 0) {
          const defaultBreak = {
            morning_tea_duration: 10,
            morning_tea_start: '09:30',
            morning_tea_end: '11:30',
            food_break_duration: 25,
            food_break_start: '12:00',
            food_break_end: '15:00',
            evening_tea_duration: 10,
            evening_tea_start: '16:00',
            evening_tea_end: '18:30',
          };
          
          const { data: insertedData, error: insertE } = await supabase
            .from('break_settings')
            .insert(defaultBreak)
            .select()
            .maybeSingle();

          if (insertE) {
            console.error('Failed to initialize default break settings:', insertE);
          } else if (insertedData) {
            setBreakSettings(insertedData);
          }
        } else if (breakData[0]) {
          setBreakSettings(breakData[0]);
        }
      } catch (err: any) {
        console.error('Break settings fetch error:', err);
      }

    } catch (err: any) {
      console.error('Settings fetch error:', err);
      setErrorMsg('Failed to load settings data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading || !canSeeSalaryBreakdown) return;
    setLoading(true);
    fetchData();
  }, [isLoading, canSeeSalaryBreakdown]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('fine_settings')
        .upsert({
          id: 'default',
          yellow_fine: Number(settings.yellow_fine),
          orange_fine: Number(settings.orange_fine),
          red_fine: Number(settings.red_fine),
          yellow_free_passes: Number(settings.yellow_free_passes),
        });

      if (error) throw error;
      showToast('Settings saved successfully!');
    } catch (err: any) {
      console.error('Save settings error:', err);
      showToast('Error saving settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddExemption = async () => {
    if (!selectedStaffId) return;
    setAddingExemption(true);
    try {
      // Check if already exists
      const exists = exemptions.some((ex) => ex.staff_id === selectedStaffId);
      if (exists) {
        showToast('Staff is already exempt!');
        setAddingExemption(false);
        return;
      }

      const pKey = 'ex_' + Math.random().toString(36).substr(2, 9);
      const { error } = await supabase
        .from('staff_fine_exemptions')
        .insert({
          id: pKey,
          staff_id: selectedStaffId,
        });

      if (error) throw error;
      setSelectedStaffId('');
      showToast('Exemption added!');
      fetchData();
    } catch (err: any) {
      console.error('Add exemption error:', err);
      showToast('Error adding exemption.');
    } finally {
      setAddingExemption(false);
    }
  };

  const handleRemoveExemption = async (id: string) => {
    try {
      const { error } = await supabase
        .from('staff_fine_exemptions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast('Exemption removed!');
      fetchData();
    } catch (err: any) {
      console.error('Remove exemption error:', err);
      showToast('Error removing exemption.');
    }
  };

  const handleExecuteDangerAction = async () => {
    if (confirmText !== 'DELETE' || !dangerAction) return;
    setExecutingDanger(true);
    try {
      if (dangerAction === 'CLEAR_ATTENDANCE') {
        const tables = [
          'attendance',
          'late_fines',
          'break_logs',
          'wall_events',
          'notifications'
        ];

        for (const table of tables) {
          try {
            const { error: delErr } = await supabase
              .from(table)
              .delete()
              .neq('id', '00000000-0000-0000-0000-000000000000');
            if (delErr) {
              console.error(`Error clearing ${table}:`, delErr);
              const errMsg = String(delErr.message || '').toLowerCase();
              if (!errMsg.includes('does not exist') && !errMsg.includes('not find')) {
                throw delErr;
              }
            }
          } catch (err: any) {
            console.error(`Exception clearing ${table}:`, err);
          }
        }
        showToast('All attendance and activity data cleared!');

      } else if (dangerAction === 'DELETE_INACTIVE') {
        // Fetch inactive staff
        const { data: inactiveStaff, error: fetchErr } = await supabase
          .from('staff')
          .select('id')
          .eq('active', false);

        if (fetchErr) throw fetchErr;

        const inactiveIds = inactiveStaff?.map(s => s.id) || [];

        if (inactiveIds.length > 0) {
          const tables = [
            'attendance',
            'late_fines',
            'break_logs',
            'wall_events',
            'notifications',
            'leave_requests',
            'salary_confirmations',
            'salary_payments',
            'performance_scores',
            'staff_fine_exemptions',
            'attendance_adjustments',
            'special_fines'
          ];

          for (const table of tables) {
            try {
              const { error: delErr } = await supabase
                .from(table)
                .delete()
                .in('staff_id', inactiveIds);
              if (delErr) {
                console.error(`Error deleting from ${table} for inactive staff:`, delErr);
                const errMsg = String(delErr.message || '').toLowerCase();
                if (!errMsg.includes('does not exist') && !errMsg.includes('not find')) {
                  throw delErr;
                }
              }
            } catch (err: any) {
              console.error(`Exception deleting from ${table}:`, err);
            }
          }

          // Finally delete the staff records
          const { error: staffDelErr } = await supabase
            .from('staff')
            .delete()
            .in('id', inactiveIds);

          if (staffDelErr) throw staffDelErr;
          showToast(`Deleted ${inactiveIds.length} inactive staff profiles.`);
        } else {
          showToast('No inactive staff profiles found.');
        }
      }

      setDangerAction(null);
      setConfirmText('');
      
      // Redirect to dashboard
      router.push('/dashboard');

    } catch (err: any) {
      console.error('Danger zone action execution error:', err);
      showToast('Action failed — see console.');
    } finally {
      setExecutingDanger(false);
    }
  };

  const handleSaveBreakSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBreakSettings(true);
    try {
      const payload: any = {
        morning_tea_duration: Number(breakSettings.morning_tea_duration),
        morning_tea_start: breakSettings.morning_tea_start,
        morning_tea_end: breakSettings.morning_tea_end,
        food_break_duration: Number(breakSettings.food_break_duration),
        food_break_start: breakSettings.food_break_start,
        food_break_end: breakSettings.food_break_end,
        evening_tea_duration: Number(breakSettings.evening_tea_duration),
        evening_tea_start: breakSettings.evening_tea_start,
        evening_tea_end: breakSettings.evening_tea_end,
        updated_by: user?.email || 'Admin',
        updated_at: new Date().toISOString(),
      };

      if (breakSettings.id) {
        payload.id = breakSettings.id;
      }

      const { error } = await supabase
        .from('break_settings')
        .upsert(payload);

      if (error) throw error;
      showToast('Break settings saved successfully!');
    } catch (err: any) {
      console.error('Save break settings error:', err);
      showToast('Error saving break settings.');
    } finally {
      setSavingBreakSettings(false);
    }
  };

  const handleRecalculateFines = async () => {
    setRecalcConfirmOpen(false);
    setRecalculating(true);
    setRecalcResult(null);

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const firstDay = `${monthStr}-01`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const lastDay = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

      // Fetch all attendance records for this month with check_in
      const { data: attRecords, error: attErr } = await supabase
        .from('attendance')
        .select('id, staff_id, date, check_in_time, minutes_late, color_code, status')
        .not('check_in_time', 'is', null)
        .gte('date', firstDay)
        .lte('date', lastDay);

      if (attErr) throw attErr;
      if (!attRecords || attRecords.length === 0) {
        setRecalculating(false);
        setRecalcResult({ total: 0, corrected: 0, deleted: 0, skipped: 0 });
        return;
      }

      // Sort attRecords by date chronologically
      attRecords.sort((a, b) => a.date.localeCompare(b.date));

      // Fetch all staff with shifts
      const staffIds = [...new Set(attRecords.map(a => a.staff_id))];
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, shift_id, shift:shifts(start_time)')
        .in('id', staffIds);

      const staffShiftMap = new Map<string, string>();
      staffData?.forEach((s: any) => {
        const shift = Array.isArray(s.shift) ? s.shift[0] : s.shift;
        staffShiftMap.set(s.id, shift?.start_time || '09:00');
      });

      // Fetch fine settings
      const { data: fSettings } = await supabase.from('fine_settings').select('*').limit(1).maybeSingle();
      const fs = fSettings || { yellow_fine: 50, orange_fine: 100, red_fine: 200, yellow_free_passes: 4 };

      // Fetch exemptions
      const { data: exemptions } = await supabase.from('staff_fine_exemptions').select('staff_id');
      const exemptSet = new Set(exemptions?.map(e => e.staff_id) || []);

      // Fetch existing fines for the month
      const { data: existingFines } = await supabase
        .from('late_fines')
        .select('id, staff_id, date, confirmed')
        .gte('date', firstDay)
        .lte('date', lastDay);

      const fineMap = new Map<string, { id: string; confirmed: boolean }>();
      existingFines?.forEach(f => {
        fineMap.set(`${f.staff_id}_${f.date}`, { id: f.id, confirmed: f.confirmed });
      });

      let total = 0;
      let corrected = 0;
      let deleted = 0;
      let skipped = 0;

      const parseMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      const yellowCountMap = new Map<string, number>();

      for (let i = 0; i < attRecords.length; i++) {
        const rec = attRecords[i];
        total++;
        setRecalcProgress(`Processing ${i + 1} / ${attRecords.length}...`);

        const shiftStart = staffShiftMap.get(rec.staff_id) || '09:00';
        const shiftStartMins = parseMins(shiftStart);
        const checkInMins = parseMins(rec.check_in_time);

        const correctMinutesLate = Math.max(0, checkInMins - shiftStartMins);
        let correctColorCode = 'green';
        let correctStatus: string = 'present';

        if (correctMinutesLate > 0) {
          correctStatus = 'late';
          if (correctMinutesLate <= 15) correctColorCode = 'yellow';
          else if (correctMinutesLate <= 30) correctColorCode = 'orange';
          else correctColorCode = 'red';
        }

        // Update attendance if different
        if (rec.minutes_late !== correctMinutesLate || rec.color_code !== correctColorCode || rec.status !== correctStatus) {
          await supabase
            .from('attendance')
            .update({
              minutes_late: correctMinutesLate,
              color_code: correctColorCode,
              status: correctStatus === 'late' ? 'late' : (rec.check_in_time ? 'present' : rec.status),
            })
            .eq('id', rec.id);
        }

        const fineKey = `${rec.staff_id}_${rec.date}`;
        const existingFine = fineMap.get(fineKey);

        if (correctMinutesLate === 0) {
          // Staff was not late — delete unconfirmed fine
          if (existingFine) {
            if (existingFine.confirmed) {
              skipped++;
            } else {
              await supabase.from('late_fines').delete().eq('id', existingFine.id);
              deleted++;
            }
          }
        } else if (!exemptSet.has(rec.staff_id)) {
          // Staff was late — upsert fine
          let fineAmount = 0;
          if (correctColorCode === 'yellow') {
            const currentYellows = yellowCountMap.get(rec.staff_id) || 0;
            yellowCountMap.set(rec.staff_id, currentYellows + 1);
            if (currentYellows >= Number(fs.yellow_free_passes || 0)) {
              fineAmount = Number(fs.yellow_fine);
            }
          } else if (correctColorCode === 'orange') {
            fineAmount = Number(fs.orange_fine);
          } else if (correctColorCode === 'red') {
            fineAmount = Number(fs.red_fine);
          }

          if (fineAmount > 0) {
            if (existingFine?.confirmed) {
              skipped++;
            } else {
              await supabase.from('late_fines').upsert({
                staff_id: rec.staff_id,
                date: rec.date,
                late_minutes: correctMinutesLate,
                color_code: correctColorCode,
                fine_amount: fineAmount,
                waived: false,
                month: monthStr,
              }, { onConflict: 'staff_id,date' });
              corrected++;
            }
          } else {
            // Delete fine if it became 0 due to pass
            if (existingFine) {
              if (existingFine.confirmed) {
                skipped++;
              } else {
                await supabase.from('late_fines').delete().eq('id', existingFine.id);
                deleted++;
              }
            }
          }
        } else {
          // Staff was exempt — delete unconfirmed fine if exists
          if (existingFine) {
            if (existingFine.confirmed) {
              skipped++;
            } else {
              await supabase.from('late_fines').delete().eq('id', existingFine.id);
              deleted++;
            }
          }
        }
      }

      setRecalcResult({ total, corrected, deleted, skipped });
      showToast('Recalculation complete!');
    } catch (err: any) {
      console.error('Recalculate fines error:', err);
      showToast('Failed to recalculate fines — see console.');
    } finally {
      setRecalculating(false);
      setRecalcProgress(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-[200px] w-full" />
      </div>
    );
  }

  // Security gate
  if (!canSeeSalaryBreakdown) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="bg-white border border-[var(--border)] rounded-[14px] p-8 max-w-sm w-full flex flex-col items-center shadow-sm">
          <Lock size={48} strokeWidth={1.5} className="mb-4 text-[var(--text-muted)]" />
          <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">Access Restricted</h2>
          <p className="text-[var(--text-muted)] text-xs font-semibold leading-relaxed mb-6">
            Only the Owner and Operations Manager can modify system configurations.
          </p>
          <div className="font-[900] text-lg tracking-tight flex items-center leading-none opacity-40">
            <span className="text-[#1A1A1A]">near</span>
            <span className="text-[#FBBF24]">bi</span>
          </div>
        </div>
      </div>
    );
  }

  const getBranchName = (id: string) => {
    return id === 'daily' ? 'Daily' : 'Hypermarket';
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div>
        <h1 className="text-[#1A1A1A] text-2xl font-bold">Settings</h1>
        <p className="text-[var(--text-muted)] text-xs font-semibold">
          System rules configuration
        </p>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchData} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-[180px] w-full" />
          <div className="skeleton h-[150px] w-full" />
        </div>
      ) : (
        <>
          {/* Late Fine Settings Card */}
          <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm">
            <h2 className="text-[#1A1A1A] font-bold text-sm mb-4">
              1. Late Fine Settings
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Yellow Late Fine (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.yellow_fine}
                    onChange={(e) => setSettings({ ...settings, yellow_fine: Number(e.target.value) })}
                    className="w-full text-[#1A1A1A] font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Yellow Free Passes
                  </label>
                  <input
                    type="number"
                    value={settings.yellow_free_passes}
                    onChange={(e) => setSettings({ ...settings, yellow_free_passes: Number(e.target.value) })}
                    className="w-full text-[#1A1A1A] font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Orange Late Fine (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.orange_fine}
                    onChange={(e) => setSettings({ ...settings, orange_fine: Number(e.target.value) })}
                    className="w-full text-[#1A1A1A] font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Red Late Fine (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.red_fine}
                    onChange={(e) => setSettings({ ...settings, red_fine: Number(e.target.value) })}
                    className="w-full text-[#1A1A1A] font-bold"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full min-h-[44px] bg-[#1A1A1A] text-white font-bold text-xs rounded-xl hover:bg-[#333333] active:scale-95 transition-all shadow-sm mt-2"
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>

          {/* Fine Exemptions Card */}
          <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
            <h2 className="text-[#1A1A1A] font-bold text-sm">
              2. Fine Exemptions
            </h2>

            {/* Add exemption form */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Exempt Staff Member
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="flex-1 text-[#1A1A1A] font-bold"
                >
                  <option value="" className="bg-white text-[var(--text-muted)]">Select staff member...</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id} className="bg-white">
                      {st.name} ({st.department} - {getBranchName(st.branch_id)})
                    </option>
                  ))}
                </select>
                
                <button
                  type="button"
                  onClick={handleAddExemption}
                  disabled={addingExemption || !selectedStaffId}
                  className="bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs px-4 rounded-xl active:scale-95 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center space-x-1"
                >
                  <Plus size={14} strokeWidth={1.5} style={{ color: 'currentColor' }} />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* List of exemptions */}
            <div className="space-y-2 pt-2 border-t border-[var(--border)]">
              <h3 className="text-xs font-bold text-[var(--text-secondary)] mb-2">Exempted List</h3>
              
              {exemptions.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] font-semibold italic text-center py-4">
                  No staff members currently exempted.
                </p>
              ) : (
                <div className="space-y-2">
                  {exemptions.map((ex) => (
                    <div
                      key={ex.id}
                      className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-2.5 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-xs text-[#1A1A1A]">
                          {ex.staff?.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] font-bold">
                          {ex.staff?.department} • {getBranchName(ex.staff?.branch_id)}
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => handleRemoveExemption(ex.id)}
                        className="text-[var(--danger)] hover:bg-[var(--danger-bg)] p-2 rounded active:scale-90 flex items-center justify-center"
                        title="Remove Exemption"
                      >
                        <Trash2 size={16} strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Break Settings Card */}
          <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
            <h2 className="text-[#1A1A1A] font-bold text-sm">
              3. Break Schedule Settings
            </h2>

            <form onSubmit={handleSaveBreakSettings} className="space-y-4">
              {/* Morning Tea */}
              <div className="space-y-2 border-b border-[var(--border)] pb-3">
                <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Morning Tea</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      Duration (mins)
                    </label>
                    <input
                      type="number"
                      value={breakSettings.morning_tea_duration}
                      onChange={(e) => setBreakSettings({ ...breakSettings, morning_tea_duration: Number(e.target.value) })}
                      className="w-full text-[#1A1A1A] font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      Start Time
                    </label>
                    <input
                      type="text"
                      placeholder="09:30"
                      value={breakSettings.morning_tea_start}
                      onChange={(e) => setBreakSettings({ ...breakSettings, morning_tea_start: e.target.value })}
                      className="w-full text-[#1A1A1A] font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      End Time
                    </label>
                    <input
                      type="text"
                      placeholder="11:30"
                      value={breakSettings.morning_tea_end}
                      onChange={(e) => setBreakSettings({ ...breakSettings, morning_tea_end: e.target.value })}
                      className="w-full text-[#1A1A1A] font-bold"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Food Break */}
              <div className="space-y-2 border-b border-[var(--border)] pb-3">
                <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Food Break</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      Duration (mins)
                    </label>
                    <input
                      type="number"
                      value={breakSettings.food_break_duration}
                      onChange={(e) => setBreakSettings({ ...breakSettings, food_break_duration: Number(e.target.value) })}
                      className="w-full text-[#1A1A1A] font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      Start Time
                    </label>
                    <input
                      type="text"
                      placeholder="12:00"
                      value={breakSettings.food_break_start}
                      onChange={(e) => setBreakSettings({ ...breakSettings, food_break_start: e.target.value })}
                      className="w-full text-[#1A1A1A] font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      End Time
                    </label>
                    <input
                      type="text"
                      placeholder="15:00"
                      value={breakSettings.food_break_end}
                      onChange={(e) => setBreakSettings({ ...breakSettings, food_break_end: e.target.value })}
                      className="w-full text-[#1A1A1A] font-bold"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Evening Tea */}
              <div className="space-y-2 pb-2">
                <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Evening Tea</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      Duration (mins)
                    </label>
                    <input
                      type="number"
                      value={breakSettings.evening_tea_duration}
                      onChange={(e) => setBreakSettings({ ...breakSettings, evening_tea_duration: Number(e.target.value) })}
                      className="w-full text-[#1A1A1A] font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      Start Time
                    </label>
                    <input
                      type="text"
                      placeholder="16:00"
                      value={breakSettings.evening_tea_start}
                      onChange={(e) => setBreakSettings({ ...breakSettings, evening_tea_start: e.target.value })}
                      className="w-full text-[#1A1A1A] font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      End Time
                    </label>
                    <input
                      type="text"
                      placeholder="18:30"
                      value={breakSettings.evening_tea_end}
                      onChange={(e) => setBreakSettings({ ...breakSettings, evening_tea_end: e.target.value })}
                      className="w-full text-[#1A1A1A] font-bold"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingBreakSettings}
                className="w-full min-h-[44px] bg-[#1A1A1A] text-white font-bold text-xs rounded-xl hover:bg-[#333333] active:scale-95 transition-all shadow-sm mt-2"
              >
                {savingBreakSettings ? 'Saving...' : 'Save Break Settings'}
              </button>
            </form>
          </div>

          {/* Data Tools Section (Admin Only) */}
          {user?.role === 'admin' && (
            <div className="space-y-4 pt-6">
              <div>
                <h2 className="text-[#1A1A1A] font-extrabold text-sm tracking-wider uppercase">
                  Data Tools
                </h2>
                <div className="text-[#E8E8E8] text-xs font-semibold select-none leading-none my-1">
                  ─────────────────────────────
                </div>
              </div>

              <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
                <h3 className="text-[#1A1A1A] font-bold text-sm">
                  Chronological Late Fines Recalculator
                </h3>
                <p className="text-[10px] text-[var(--text-muted)] font-semibold leading-relaxed">
                  Recalculates all late fines for the current month chronologically, day-by-day, applying yellow free pass limits (first 4 free passes). Wrong unconfirmed fines will be corrected or deleted. Confirmed fines are left unchanged.
                </p>

                {recalcResult && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 text-xs space-y-1">
                    <div className="font-bold text-[#1A1A1A]">Recalculation Complete</div>
                    <div className="text-[var(--text-secondary)] font-semibold">Processed: {recalcResult.total} records</div>
                    <div className="text-[var(--success)] font-semibold">Corrected: {recalcResult.corrected} fines updated</div>
                    <div className="text-[var(--warning)] font-semibold">Deleted: {recalcResult.deleted} wrong fines removed</div>
                    <div className="text-[var(--text-muted)] font-semibold">Skipped: {recalcResult.skipped} confirmed fines (unchanged)</div>
                  </div>
                )}

                {recalculating && recalcProgress && (
                  <div className="bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl p-3 text-xs text-[var(--info)] font-bold text-center">
                    {recalcProgress}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setRecalcConfirmOpen(true)}
                  disabled={recalculating}
                  className="w-full min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl active:scale-95 transition-all shadow-sm disabled:opacity-50"
                >
                  {recalculating ? 'Recalculating...' : 'Recalculate All Fines for Current Month'}
                </button>
              </div>
            </div>
          )}

          {/* Danger Zone Section (Admin Only) */}
          {user?.role === 'admin' && (
            <div className="space-y-4 pt-6">
              <div>
                <h2 className="text-[var(--danger)] font-extrabold text-sm tracking-wider">
                  DANGER ZONE
                </h2>
                <div className="text-[var(--danger)]/20 text-xs font-semibold select-none leading-none my-1">
                  ─────────────────────────────
                </div>
              </div>

              {/* Red bordered card */}
              <div className="bg-white border border-[var(--danger)] rounded-[14px] p-5 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[#1A1A1A] text-xs font-bold">Clear all attendance data</p>
                    <p className="text-[var(--text-muted)] text-[10px] font-semibold leading-normal max-w-md">
                      Deletes all records from attendance, late_fines, break_logs, wall_events, notifications tables. Staff profiles are kept. Only activity data removed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDangerAction('CLEAR_ATTENDANCE');
                      setConfirmText('');
                    }}
                    className="min-h-[38px] px-4 bg-transparent border border-[var(--danger)] text-[var(--danger)] hover:text-white hover:bg-[var(--danger)] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  >
                    Clear Attendance Data
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[var(--border)]">
                  <div className="space-y-1">
                    <p className="text-[#1A1A1A] text-xs font-bold">Delete inactive staff</p>
                    <p className="text-[var(--text-muted)] text-[10px] font-semibold leading-normal max-w-md">
                      Deletes staff where active = false along with all their related records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDangerAction('DELETE_INACTIVE');
                      setConfirmText('');
                    }}
                    className="min-h-[38px] px-4 bg-transparent border border-[var(--danger)] text-[var(--danger)] hover:text-white hover:bg-[var(--danger)] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  >
                    Delete Inactive Staff
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {recalcConfirmOpen && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-center">
            <div className="flex flex-col items-center">
              <span className="text-amber-500 mb-2 text-3xl">⚙️</span>
              <h3 className="text-[#1A1A1A] text-base font-bold">Recalculate Fines</h3>
              <p className="text-[#555555] text-xs font-semibold mt-2 leading-relaxed">
                This will recalculate all late fines for the current month based on each staff member's actual shift start time. Wrong fines will be corrected. Confirmed fines will not be changed.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRecalcConfirmOpen(false)}
                className="flex-1 min-h-[40px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecalculateFines}
                className="flex-1 min-h-[40px] bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Recalculate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Confirmation Modal */}
      {dangerAction && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white rounded-[20px] max-w-sm w-full border border-[var(--danger)] p-6 flex flex-col space-y-4 shadow-2xl">
            <div>
              <h3 className="text-[var(--danger)] text-base font-black uppercase tracking-wider">Danger Zone</h3>
              <p className="text-[#1A1A1A] text-sm font-bold mt-2">
                {dangerAction === 'CLEAR_ATTENDANCE' 
                  ? 'Clear All Attendance Data' 
                  : 'Delete Inactive Staff'}
              </p>
              <p className="text-[var(--text-muted)] text-xs font-semibold mt-1 leading-normal">
                {dangerAction === 'CLEAR_ATTENDANCE'
                  ? 'This will permanently delete all records from attendance, late_fines, break_logs, wall_events, and notifications. Active staff profiles are kept.'
                  : 'This will permanently delete all staff members marked as inactive (active = false) along with all their related attendance, late fine, and break records.'}
              </p>
            </div>

            <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/20 rounded-lg p-3 text-[10px] text-[var(--danger)] font-bold">
              WARNING: This action is permanent and cannot be undone.
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Type "DELETE" to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full text-[#1A1A1A] font-bold"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDangerAction(null);
                  setConfirmText('');
                }}
                disabled={executingDanger}
                className="flex-1 min-h-[40px] bg-transparent border border-[var(--border-strong)] text-[var(--text-secondary)] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDangerAction}
                disabled={confirmText !== 'DELETE' || executingDanger}
                className="flex-1 min-h-[40px] bg-[var(--danger)] hover:bg-[#A93226] disabled:opacity-30 disabled:pointer-events-none text-white font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              >
                {executingDanger ? 'Deleting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

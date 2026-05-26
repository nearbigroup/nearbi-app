'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
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
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const [settings, setSettings] = useState<FineSettings>({
    id: 'default',
    yellow_fine: 50,
    orange_fine: 100,
    red_fine: 200,
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
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-8 max-w-sm w-full flex flex-col items-center shadow-sm">
          <Lock size={48} strokeWidth={1.5} className="mb-4 text-[var(--text-muted)]" />
          <h2 className="text-lg font-bold text-white mb-2">Access Restricted</h2>
          <p className="text-[var(--text-muted)] text-xs font-semibold leading-relaxed mb-6">
            Only the Owner and Operations Manager can modify system configurations.
          </p>
          <div className="font-[900] text-lg tracking-tight flex items-center leading-none opacity-40">
            <span className="text-white">near</span>
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
    <div className="space-y-6 pb-6 select-none">
      {/* Header */}
      <div>
        <h1 className="text-white text-2xl font-bold">Settings</h1>
        <p className="text-[var(--text-muted)] text-xs font-semibold">
          System rules configuration
        </p>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
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
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-5 shadow-sm">
            <h2 className="text-white font-bold text-sm mb-4">
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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white font-bold"
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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white font-bold"
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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white font-bold"
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
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white font-bold"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full min-h-[42px] bg-white text-[#1E2028] font-bold text-xs rounded-xl hover:bg-gray-200 active:scale-95 transition-all shadow mt-2"
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>

          {/* Fine Exemptions Card */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-5 shadow-sm space-y-4">
            <h2 className="text-white font-bold text-sm">
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
                  className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
                >
                  <option value="" className="bg-[var(--bg-surface)] text-[var(--text-muted)]">Select staff member...</option>
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id} className="bg-[var(--bg-surface)]">
                      {st.name} ({st.department} - {getBranchName(st.branch_id)})
                    </option>
                  ))}
                </select>
                
                <button
                  type="button"
                  onClick={handleAddExemption}
                  disabled={addingExemption || !selectedStaffId}
                  className="bg-white hover:bg-gray-200 text-[#1E2028] font-bold text-xs px-4 rounded-xl active:scale-95 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center space-x-1"
                >
                  <Plus size={14} strokeWidth={1.5} style={{ color: 'currentColor' }} />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* List of exemptions */}
            <div className="space-y-2 pt-2 border-t border-[var(--border-strong)]">
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
                      className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-2.5 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-xs text-white">
                          {ex.staff?.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] font-bold">
                          {ex.staff?.department} • {getBranchName(ex.staff?.branch_id)}
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => handleRemoveExemption(ex.id)}
                        className="text-[#F87171] hover:bg-[var(--danger-bg)] p-2 rounded active:scale-90 flex items-center justify-center"
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
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-5 shadow-sm space-y-4">
            <h2 className="text-white font-bold text-sm">
              3. Break Schedule Settings
            </h2>

            <form onSubmit={handleSaveBreakSettings} className="space-y-4">
              {/* Morning Tea */}
              <div className="space-y-2 border-b border-[var(--border-strong)]/40 pb-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Morning Tea</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      Duration (mins)
                    </label>
                    <input
                      type="number"
                      value={breakSettings.morning_tea_duration}
                      onChange={(e) => setBreakSettings({ ...breakSettings, morning_tea_duration: Number(e.target.value) })}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
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
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
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
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Food Break */}
              <div className="space-y-2 border-b border-[var(--border-strong)]/40 pb-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Food Break</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      Duration (mins)
                    </label>
                    <input
                      type="number"
                      value={breakSettings.food_break_duration}
                      onChange={(e) => setBreakSettings({ ...breakSettings, food_break_duration: Number(e.target.value) })}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
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
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
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
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Evening Tea */}
              <div className="space-y-2 pb-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Evening Tea</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      Duration (mins)
                    </label>
                    <input
                      type="number"
                      value={breakSettings.evening_tea_duration}
                      onChange={(e) => setBreakSettings({ ...breakSettings, evening_tea_duration: Number(e.target.value) })}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
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
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
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
                      className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2.5 text-xs focus:outline-none focus:border-white/40 text-white font-bold"
                      required
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingBreakSettings}
                className="w-full min-h-[42px] bg-white text-[#1E2028] font-bold text-xs rounded-xl hover:bg-gray-200 active:scale-95 transition-all shadow mt-2"
              >
                {savingBreakSettings ? 'Saving...' : 'Save Break Settings'}
              </button>
            </form>
          </div>
        </>
      )}

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)] text-[#4ADE80] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

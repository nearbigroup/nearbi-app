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

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const fetchData = async () => {
    try {
      // 1. Fetch fine settings
      const { data: setD, error: setE } = await supabase
        .from('fine_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (setE) throw setE;
      if (setD) {
        setSettings(setD);
      }

      // 2. Fetch exemptions
      const { data: exD, error: exE } = await supabase
        .from('staff_fine_exemptions')
        .select('*, staff!inner(*)');
      
      if (exE) throw exE;
      setExemptions((exD || []) as unknown as Exemption[]);

      // 3. Fetch active staff list for select dropdown
      const { data: stD, error: stE } = await supabase
        .from('staff')
        .select('id, name, department, branch_id')
        .eq('active', true)
        .order('name');
      
      if (stE) throw stE;
      setStaffList(stD || []);

    } catch (err) {
      console.error(err);
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
    } catch (err) {
      console.error(err);
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
    } catch (err) {
      console.error(err);
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
    } catch (err) {
      console.error(err);
      showToast('Error removing exemption.');
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

'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Search, Plus, Trash2, Eye, EyeOff, Lock, X, AlertTriangle, Users } from 'lucide-react';

interface Shift {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
  hours: number;
}

interface StaffMember {
  id: string;
  name: string;
  pin: string;
  branch_id: string;
  department: string;
  shift_id: string;
  off_days_per_month: number;
  monthly_salary: number;
  join_date: string;
  active: boolean;
  shift?: Shift;
}

export default function StaffPage() {
  const { user, userBranch, canSeeSalaryBreakdown } = useAuth();
  
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Add staff form state
  const [formData, setFormData] = useState({
    name: '',
    pin: '',
    branch_id: '',
    department: '',
    shift_id: '',
    off_days_per_month: 4,
    monthly_salary: '',
    join_date: '',
  });
  
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Custom Shift state
  const [isCustomShift, setIsCustomShift] = useState(false);
  const [customShift, setCustomShift] = useState({
    label: '',
    start_time: '',
    end_time: '',
  });
  const [customShiftError, setCustomShiftError] = useState('');
  const [customShiftLoading, setCustomShiftLoading] = useState(false);

  // Show PIN visibility mappings
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});

  // Delete staff state
  const [deleteModeId, setDeleteModeId] = useState<string | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<StaffMember | null>(null);

  // Fetch staff list
  const fetchStaff = async () => {
    try {
      let query = supabase.from('staff').select('*, shift:shifts(*)').eq('active', true);
      
      // Branch isolation
      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }
      
      const { data, error } = await query.order('name');
      if (error) throw error;
      setStaff((data || []) as unknown as StaffMember[]);
    } catch (err) {
      console.error(err);
      setErrorMsg('Could not load staff list.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch shifts list
  const fetchShifts = async () => {
    try {
      const { data, error } = await supabase.from('shifts').select('*').order('label');
      if (error) throw error;
      setShifts(data || []);
      
      // Pre-select first shift as default if none selected
      if (data && data.length > 0 && !formData.shift_id) {
        setFormData((prev) => ({ ...prev, shift_id: data[0].id }));
      }
    } catch (err) {
      console.error('Error fetching shifts:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchStaff();
    fetchShifts();

    // Set default join date to today
    const todayStr = new Date().toISOString().split('T')[0];
    setFormData((prev) => ({
      ...prev,
      join_date: todayStr,
      branch_id: userBranch || '', // pre-select branch if isolated
    }));

    // Realtime channel
    const channel = supabase
      .channel('staff-realtime-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff' },
        () => {
          fetchStaff();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userBranch]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleOpenAddPanel = () => {
    setFormError('');
    setFormData({
      name: '',
      pin: '',
      branch_id: userBranch || '',
      department: '',
      shift_id: shifts.length > 0 ? shifts[0].id : '',
      off_days_per_month: 4,
      monthly_salary: '',
      join_date: new Date().toISOString().split('T')[0],
    });
    setIsCustomShift(false);
    setShowAddPanel(true);
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name || !formData.pin || !formData.branch_id || !formData.department || !formData.shift_id || !formData.join_date) {
      setFormError('All fields are required');
      return;
    }

    if (!/^\d{4}$/.test(formData.pin)) {
      setFormError('PIN must be exactly 4 digits');
      return;
    }

    setFormLoading(true);

    try {
      // Validate unique PIN across ALL staff members
      const { data: existingPin } = await supabase
        .from('staff')
        .select('id, name')
        .eq('pin', formData.pin)
        .maybeSingle();

      if (existingPin) {
        setFormError(`PIN is already in use by ${existingPin.name}`);
        setFormLoading(false);
        return;
      }

      // Generate text unique primary key for staff id
      const staffId = 'staff_' + Math.random().toString(36).substr(2, 9);

      const payload = {
        id: staffId,
        name: formData.name,
        pin: formData.pin,
        branch_id: formData.branch_id,
        department: formData.department,
        shift_id: formData.shift_id,
        off_days_per_month: Number(formData.off_days_per_month),
        monthly_salary: canSeeSalaryBreakdown ? Number(formData.monthly_salary) : 0,
        join_date: formData.join_date,
        active: true,
      };

      const { error } = await supabase.from('staff').insert(payload);
      if (error) throw error;

      setShowAddPanel(false);
      showToast('Staff added successfully!');
      fetchStaff();
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'An error occurred while saving.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddCustomShift = async () => {
    setCustomShiftError('');
    if (!customShift.label || !customShift.start_time || !customShift.end_time) {
      setCustomShiftError('All custom shift fields are required');
      return;
    }

    const [sh, sm] = customShift.start_time.split(':').map(Number);
    const [eh, em] = customShift.end_time.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    if (endMins <= startMins) {
      setCustomShiftError('End time must be after start time');
      return;
    }

    const durationHours = parseFloat(((endMins - startMins) / 60).toFixed(2));
    setCustomShiftLoading(true);

    try {
      const shiftId = 'shift_' + Date.now();
      const payload = {
        id: shiftId,
        label: customShift.label,
        start_time: customShift.start_time,
        end_time: customShift.end_time,
        hours: durationHours,
      };

      const { error } = await supabase.from('shifts').insert(payload);
      if (error) throw error;

      await fetchShifts();
      setFormData((prev) => ({ ...prev, shift_id: shiftId }));
      setIsCustomShift(false);
      setCustomShift({ label: '', start_time: '', end_time: '' });
      showToast('Custom shift created!');
    } catch (err: any) {
      console.error(err);
      setCustomShiftError(err.message || 'Could not add custom shift.');
    } finally {
      setCustomShiftLoading(false);
    }
  };

  const handleDeleteStaff = async () => {
    if (!staffToDelete) return;
    try {
      // Hard delete from database. Schema will cascade delete all attendance, leave, late_fines, salary_summaries, etc.
      const { error } = await supabase.from('staff').delete().eq('id', staffToDelete.id);
      if (error) throw error;

      showToast(`${staffToDelete.name} has been removed.`);
      setStaffToDelete(null);
      setDeleteModeId(null);
      fetchStaff();
    } catch (err: any) {
      console.error(err);
      showToast('Error removing staff member.');
    }
  };

  const togglePinVisibility = (id: string) => {
    setVisiblePins((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Search filtering
  const filteredStaff = staff.filter((s) => {
    const terms = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(terms) ||
      s.department.toLowerCase().includes(terms) ||
      (s.shift?.label || '').toLowerCase().includes(terms)
    );
  });

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Staff</h1>
          <p className="text-[var(--text-muted)] text-xs font-semibold">
            {staff.length} active staff members
          </p>
        </div>
        <button
          onClick={handleOpenAddPanel}
          className="bg-white text-[#1E2028] font-bold px-4 py-2 rounded-[10px] text-sm flex items-center space-x-1.5 active:scale-95 transition-transform"
        >
          <Plus size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Add Staff</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchStaff} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search size={18} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] pl-11 pr-4 py-3 text-white focus:outline-none focus:border-white/40 focus:ring-0 text-sm"
        />
      </div>

      {/* Staff list */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
          <div className="skeleton h-[90px] w-full" />
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-8 text-center flex flex-col items-center justify-center my-6">
          <Users size={48} strokeWidth={1} style={{ color: '#2A2D38' }} className="mb-2" />
          <h3 className="text-sm font-bold text-white">No staff found</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {search ? 'Try adjusting your search terms.' : 'Get started by adding your first staff member.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredStaff.map((s) => {
            const isDeleteMode = deleteModeId === s.id;
            const isPinVisible = !!visiblePins[s.id];

            return (
              <div
                key={s.id}
                className={`bg-[var(--bg-surface)] border rounded-[14px] p-4 flex flex-col transition-all relative ${
                  isDeleteMode ? 'border-[#F87171] ring-1 ring-[#F87171]' : 'border-[var(--border)] shadow-sm'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  {/* Avatar or Delete Mode Trigger */}
                  {user?.role === 'admin' || user?.role === 'ops_manager' ? (
                    <button
                      onClick={() => setDeleteModeId(isDeleteMode ? null : s.id)}
                      className={`w-12 h-12 rounded-full font-bold text-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                        isDeleteMode
                          ? 'bg-[rgba(248,113,113,0.15)] text-[#F87171] border border-[rgba(248,113,113,0.3)]'
                          : 'bg-white/10 text-white border border-white/20'
                      }`}
                    >
                      {isDeleteMode ? <Trash2 size={20} strokeWidth={1.5} style={{ color: '#F87171' }} /> : s.name.charAt(0).toUpperCase()}
                    </button>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white/10 text-white border border-white/20 font-bold text-lg flex items-center justify-center flex-shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Profile info details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-white leading-tight truncate">
                      {s.name}
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)] font-semibold mt-0.5 leading-none">
                      {s.department} • <span className="capitalize">{getBranchLabel(s.branch_id)}</span>
                    </p>

                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-strong)] text-[10px] font-bold px-2 py-0.5 rounded">
                        Shift: {s.shift?.label || 'None'}
                      </span>
                      <span className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-strong)] text-[10px] font-bold px-2 py-0.5 rounded">
                        {s.off_days_per_month} off days
                      </span>
                    </div>

                    {/* PIN & Salary Display */}
                    <div className="mt-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg p-2.5 flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs font-bold text-[var(--text-secondary)]">
                        <span>PIN:</span>
                        <span className="font-mono text-sm tracking-widest text-white">
                          {isPinVisible ? s.pin : '••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePinVisibility(s.id)}
                          className="text-[var(--text-secondary)] hover:text-white px-1 active:scale-90 flex items-center justify-center"
                        >
                          {isPinVisible ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                        </button>
                      </div>

                      <div className="text-xs font-bold text-white flex items-center">
                        {canSeeSalaryBreakdown ? `₹${s.monthly_salary.toLocaleString()}/mo` : <Lock size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delete staff button under delete mode */}
                {isDeleteMode && (
                  <div className="mt-4 pt-3.5 border-t border-[var(--border)] flex justify-end">
                    <button
                      onClick={() => setStaffToDelete(s)}
                      className="bg-[rgba(248,113,113,0.15)] border border-[rgba(248,113,113,0.3)] text-[#F87171] hover:bg-[rgba(248,113,113,0.25)] font-bold text-xs px-4 py-2 rounded-[10px] active:scale-95 transition-all"
                    >
                      Delete Staff Member
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Staff Slide-Up Panel */}
      {showAddPanel && (
        <div className="fixed inset-0 z-[11000] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAddPanel(false)}
          />
          <div
            className="bg-[var(--bg-surface)] rounded-t-3xl shadow-2xl relative z-10 p-5 flex flex-col max-h-[85vh] overflow-y-auto w-full max-w-md mx-auto border-t border-[var(--border-strong)]"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 16px))' }}
          >
            {/* Grabber bar */}
            <div className="w-12 h-1 bg-[var(--border-strong)] rounded-full mx-auto mb-4 flex-shrink-0" />

            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">New Staff Member</h2>
              <button
                onClick={() => setShowAddPanel(false)}
                className="text-[var(--text-muted)] hover:text-white flex items-center justify-center p-1"
              >
                <X size={16} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              </button>
            </div>

            {formError && (
              <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-bold px-3 py-2 rounded-md mb-4 flex-shrink-0">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddStaff} className="space-y-4 flex-1">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    4-Digit PIN
                  </label>
                  <input
                    type="text"
                    pattern="\d*"
                    maxLength={4}
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').substring(0, 4) })}
                    placeholder="e.g. 1234"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white font-mono text-center"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Join Date
                  </label>
                  <input
                    type="date"
                    value={formData.join_date}
                    onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Branch
                  </label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
                    disabled={!!userBranch}
                    required
                  >
                    <option value="">Select branch...</option>
                    <option value="daily">Nearbi Daily</option>
                    <option value="hypermarket">Nearbi Hypermarket</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Department
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
                    required
                  >
                    <option value="">Select...</option>
                    <option value="Grocery">Grocery</option>
                    <option value="Fresh & Produce">Fresh & Produce</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Cashier">Cashier</option>
                    <option value="Housekeeping">Housekeeping</option>
                    <option value="Receiving">Receiving</option>
                  </select>
                </div>
              </div>

              {/* Shift selector & custom creator inline */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                  Shift Profile
                </label>
                <select
                  value={isCustomShift ? 'custom' : formData.shift_id}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomShift(true);
                    } else {
                      setIsCustomShift(false);
                      setFormData({ ...formData, shift_id: e.target.value });
                    }
                  }}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white mb-2"
                  required={!isCustomShift}
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.start_time} - {s.end_time})
                    </option>
                  ))}
                  <option value="custom">+ Create custom shift...</option>
                </select>

                {isCustomShift && (
                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-3.5 space-y-3 mt-2">
                    <h4 className="text-xs font-bold text-white">New Custom Shift</h4>
                    {customShiftError && (
                      <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-[10px] font-bold p-2 rounded">
                        {customShiftError}
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                        Shift Label (e.g. Evening shift)
                      </label>
                      <input
                        type="text"
                        value={customShift.label}
                        onChange={(e) => setCustomShift({ ...customShift, label: e.target.value })}
                        placeholder="e.g. General Shift"
                        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2 text-xs focus:outline-none text-white focus:border-white/40"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                          Start Time
                        </label>
                        <input
                          type="time"
                          value={customShift.start_time}
                          onChange={(e) => setCustomShift({ ...customShift, start_time: e.target.value })}
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2 text-xs focus:outline-none text-white focus:border-white/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[var(--text-muted)] mb-0.5">
                          End Time
                        </label>
                        <input
                          type="time"
                          value={customShift.end_time}
                          onChange={(e) => setCustomShift({ ...customShift, end_time: e.target.value })}
                          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-2 text-xs focus:outline-none text-white focus:border-white/40"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomShift(false);
                          if (shifts.length > 0) {
                            setFormData((prev) => ({ ...prev, shift_id: shifts[0].id }));
                          }
                        }}
                        className="text-xs text-[var(--text-secondary)] font-bold hover:underline"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCustomShift}
                        disabled={customShiftLoading}
                        className="bg-white text-[#1E2028] font-bold text-xs px-3.5 py-1.5 rounded-[10px] active:scale-95 transition-transform"
                      >
                        {customShiftLoading ? 'Creating...' : 'Create Shift'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Off Days Choice */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
                  Monthly Off Days
                </label>
                <div className="flex gap-2">
                  {[0, 2, 4].map((num) => {
                    const isSelected = formData.off_days_per_month === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFormData({ ...formData, off_days_per_month: num })}
                        className={`flex-1 py-2.5 rounded-[10px] border text-xs font-bold transition-all ${
                          isSelected
                            ? 'bg-white text-[#1E2028] border-white'
                            : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border)] active:scale-95'
                        }`}
                      >
                        {num} Days
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Monthly Salary Input (Admin/Ops only) */}
              {canSeeSalaryBreakdown && (
                <div>
                  <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                    Monthly Salary (₹)
                  </label>
                  <input
                    type="number"
                    value={formData.monthly_salary}
                    onChange={(e) => setFormData({ ...formData, monthly_salary: e.target.value })}
                    placeholder="e.g. 15000"
                    className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 text-sm focus:outline-none focus:border-white/40 text-white"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={formLoading}
                className="w-full min-h-[40px] bg-white text-[#1E2028] font-bold text-sm rounded-[10px] active:scale-95 transition-all mt-4"
              >
                {formLoading ? 'Saving...' : 'Save Staff Member'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {staffToDelete && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setStaffToDelete(null)}
          />
          <div className="bg-[var(--bg-surface)] rounded-[16px] shadow-2xl relative z-10 p-6 w-full max-w-xs text-center border border-[var(--border-strong)] flex flex-col items-center">
            <AlertTriangle size={36} strokeWidth={1.5} style={{ color: '#FBBF24' }} className="mb-3" />
            <h3 className="text-base font-bold text-white mb-1">
              Remove {staffToDelete.name}?
            </h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-6">
              This will permanently delete this staff member and all associated registers, leave claims, and fine sheets.
            </p>

            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setStaffToDelete(null)}
                className="flex-1 bg-transparent border border-[var(--border-strong)] text-[var(--text-secondary)] font-bold text-xs py-2.5 rounded-[10px] active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStaff}
                className="flex-1 bg-[rgba(248,113,113,0.15)] border border-[rgba(248,113,113,0.3)] text-[#F87171] hover:bg-[rgba(248,113,113,0.25)] font-bold text-xs py-2.5 rounded-[10px] active:scale-95 transition-all shadow"
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simple Toast Alerts */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)] text-[#4ADE80] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-1">
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export default function Staff() {
  const { user, canSeeSalaryBreakdown } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [fetchError, setFetchError] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Add staff form state
  const [formData, setFormData] = useState({
    name: '',
    pin: '',
    branch_id: '',
    department: '',
    shift_id: '',
    off_days_per_month: 4,
    monthly_salary: '',
    join_date: new Date().toISOString().split('T')[0]
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [shifts, setShifts] = useState<any[]>([]);
  
  // Custom Shift state
  const [isCustomShift, setIsCustomShift] = useState(false);
  const [customShift, setCustomShift] = useState({ label: '', start_time: '', end_time: '' });
  const [customShiftError, setCustomShiftError] = useState('');
  const [customShiftLoading, setCustomShiftLoading] = useState(false);
  
  // Show PIN state
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});

  // Delete state
  const [deleteModeId, setDeleteModeId] = useState<string | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<any>(null);

  const fetchStaff = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setFetchError(false);
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*, shift:shifts(*), branch:branches(*)')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      if (data) setStaff(data);
    } catch (e) {
      console.error(e);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchShifts = async () => {
    const { data } = await supabase.from('shifts').select('*');
    if (data) setShifts(data);
  };

  useEffect(() => {
    fetchStaff();
    fetchShifts();

    // Subscribe to staff Postgres changes
    const channel = supabase
      .channel('staff-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, () => {
        fetchStaff(true); // refresh in background
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleInputFocus = (e: any) => {
    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    
    // Validations
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
      // Check PIN uniqueness
      const { data: existing } = await supabase.from('staff').select('id').eq('pin', formData.pin).single();
      if (existing) {
        setFormError('PIN is already in use by another staff member');
        setFormLoading(false);
        return;
      }

      const payload: any = {
        name: formData.name,
        pin: formData.pin,
        branch_id: formData.branch_id,
        department: formData.department,
        shift_id: formData.shift_id,
        off_days_per_month: formData.off_days_per_month,
        join_date: formData.join_date,
        monthly_salary: canSeeSalaryBreakdown ? Number(formData.monthly_salary) : 0
      };

      const { error } = await supabase.from('staff').insert(payload);
      
      if (error) throw error;

      setShowAddPanel(false);
      setFormData({
        name: '', pin: '', branch_id: '', department: '', shift_id: '', 
        off_days_per_month: 4, monthly_salary: '', join_date: new Date().toISOString().split('T')[0]
      });
      showToast('Staff added ✓');
      
      // Re-fetch immediately
      const { data } = await supabase
        .from('staff')
        .select('*, shift:shifts(*), branch:branches(*)')
        .eq('active', true)
        .order('name');
      if (data) setStaff(data);
      
      // Scroll to top
      setTimeout(() => {
        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);

    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'Error saving staff');
    } finally {
      setFormLoading(false);
    }
  };

  const handleAddCustomShift = async () => {
    setCustomShiftError('');
    if (!customShift.label || !customShift.start_time || !customShift.end_time) {
      setCustomShiftError('All fields are required');
      return;
    }
    
    const startParts = customShift.start_time.split(':').map(Number);
    const endParts = customShift.end_time.split(':').map(Number);
    const startMins = startParts[0] * 60 + startParts[1];
    const endMins = endParts[0] * 60 + endParts[1];
    
    if (endMins <= startMins) {
      setCustomShiftError('End time must be after start time');
      return;
    }
    
    const hours = Number(((endMins - startMins) / 60).toFixed(2));
    
    setCustomShiftLoading(true);
    try {
      const newId = 'custom_' + Date.now();
      const payload = {
        id: newId,
        label: customShift.label,
        start_time: customShift.start_time,
        end_time: customShift.end_time,
        hours
      };
      
      const { error } = await supabase.from('shifts').insert(payload);
      if (error) throw error;
      
      await fetchShifts();
      setFormData({ ...formData, shift_id: newId });
      setIsCustomShift(false);
      setCustomShift({ label: '', start_time: '', end_time: '' });
      showToast('Shift added ✓');
    } catch (e: any) {
      console.error(e);
      setCustomShiftError(e.message || 'Error adding shift');
    } finally {
      setCustomShiftLoading(false);
    }
  };

  const togglePin = (id: string) => {
    setVisiblePins(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDelete = async () => {
    if (!staffToDelete) return;
    try {
      const id = staffToDelete.id;
      // Cascade delete related records
      await supabase.from('attendance').delete().eq('staff_id', id);
      await supabase.from('leave_requests').delete().eq('staff_id', id);
      await supabase.from('salary_summaries').delete().eq('staff_id', id);
      
      const { error } = await supabase.from('staff').delete().eq('id', id);
      if (error) throw error;
      
      setStaff(prev => prev.filter(s => s.id !== id));
      showToast(`${staffToDelete.name} removed ✓`);
    } catch (err: any) {
      console.error(err);
      showToast('Error deleting staff');
    } finally {
      setStaffToDelete(null);
      setDeleteModeId(null);
    }
  };

  const filteredStaff = staff.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.department.toLowerCase().includes(search.toLowerCase()) ||
    s.branch_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 relative pb-10">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Staff Directory</h1>
          <p className="text-brand-text-secondary text-sm">{staff.length} staff members</p>
        </div>
        <button 
          onClick={() => {
            setFormData(prev => ({
              ...prev,
              shift_id: prev.shift_id ? prev.shift_id : (shifts.length > 0 ? shifts[0].id : '')
            }));
            setShowAddPanel(true);
          }}
          className="bg-brand-accent text-[#111] font-bold rounded-xl active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            minHeight: '44px',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent'
          }}
        >
          + Add Staff
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input 
          type="text" 
          placeholder="Search by name, department..."
          className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Staff List */}
      {fetchError ? (
        <div className="py-12 text-center bg-red-50 border border-red-200 rounded-2xl p-6">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-lg font-bold text-red-700 mb-1">Failed to load staff list</h3>
          <p className="text-sm text-red-500 mb-4">Please check your internet connection and try again.</p>
          <button 
            onClick={() => fetchStaff()} 
            className="bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl active:scale-95 transition-transform"
          >
            Retry Connection
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse"></div>)}
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center bg-gray-50 rounded-2xl border border-gray-100 p-6">
          <div className="text-6xl mb-4 opacity-50">👥</div>
          <div className="text-lg font-bold text-gray-500 mb-1">No staff members found</div>
          <p className="text-sm text-gray-400 max-w-xs">There are no active staff members in this branch yet. Tap "+ Add Staff" above to create one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredStaff.map(s => {
            const isDeleteMode = deleteModeId === s.id;
            return (
              <div key={s.id} className={`nearbi-card p-4 transition-all duration-300 ${isDeleteMode ? 'border-l-4 border-l-[#D32F2F]' : ''}`}>
                <div className="flex items-start space-x-4">
                  {user?.role === 'admin' ? (
                    <button 
                      onClick={() => setDeleteModeId(isDeleteMode ? null : s.id)}
                      className={`w-14 h-14 rounded-full font-bold text-2xl flex items-center justify-center flex-shrink-0 transition-colors ${isDeleteMode ? 'bg-[#D32F2F] text-white' : 'bg-[#111] text-brand-accent'}`}
                    >
                      {isDeleteMode ? '✕' : s.name.charAt(0).toUpperCase()}
                    </button>
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-[#111] text-brand-accent font-bold text-2xl flex items-center justify-center flex-shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <div className="font-bold text-lg">{s.name}</div>
                    <div className="text-sm text-gray-500 font-medium mb-2">
                      {s.department} • <span className="capitalize">{s.branch?.name || s.branch_id}</span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2 py-1 rounded text-xs font-bold">
                        {s.shift?.label}
                      </span>
                      <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-1 rounded text-xs font-medium">
                        {s.off_days_per_month} off days
                      </span>
                    </div>

                    <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                      <div className="flex items-center space-x-2 text-sm">
                        <span className="text-gray-500">PIN:</span>
                        <span className="font-mono font-bold tracking-widest">{visiblePins[s.id] ? s.pin : '••••'}</span>
                        <button 
                          onClick={() => togglePin(s.id)} 
                          className="text-gray-400 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                        >
                          {visiblePins[s.id] ? '👁️' : '👁️‍🗨️'}
                        </button>
                      </div>
                      
                      <div className="text-sm font-bold text-[#111]">
                        {canSeeSalaryBreakdown ? `₹${s.monthly_salary.toLocaleString()}` : <span className="text-gray-400">🔒</span>}
                      </div>
                    </div>
                  </div>
                </div>
                
                {isDeleteMode && (
                  <div className="mt-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2">
                    <button 
                      onClick={() => setStaffToDelete(s)}
                      className="w-full bg-[#FFEBEE] text-[#D32F2F] font-bold py-3 rounded-xl border border-[#D32F2F]/30 hover:bg-[#FFCDD2] active:bg-[#FFCDD2] transition-colors min-h-[44px] flex items-center justify-center cursor-pointer"
                      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
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

      {/* Add Staff Slide-up Panel */}
      {showAddPanel && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowAddPanel(false)}></div>
          
          <div className="bg-white w-full sm:max-w-[480px] mx-auto rounded-t-3xl sm:rounded-2xl shadow-2xl relative z-10 animate-in slide-in-from-bottom-full sm:animate-in sm:zoom-in-95 duration-300 max-h-[90vh] sm:max-h-[85vh] flex flex-col">
            <div className="flex-none p-6 border-b border-gray-100">
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4"></div>
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-brand-accent">New Staff Member</h2>
                <button onClick={() => setShowAddPanel(false)} className="text-gray-400 text-2xl">×</button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 pb-safe">
              {formError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium mb-4 border border-red-200">
                  {formError}
                </div>
              )}
              
              <form onSubmit={handleAddStaff} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" value={formData.name} onFocus={handleInputFocus} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-xl px-4 py-3 focus:outline-none focus:border-brand-accent" required />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">4-Digit PIN</label>
                    <input type="number" min="0000" max="9999" value={formData.pin} onFocus={handleInputFocus} onChange={e => setFormData({...formData, pin: e.target.value.slice(0,4)})} className="w-full border rounded-xl px-4 py-3 focus:outline-none focus:border-brand-accent font-mono" placeholder="1234" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Join Date</label>
                    <input type="date" value={formData.join_date} onFocus={handleInputFocus} onChange={e => setFormData({...formData, join_date: e.target.value})} className="w-full border rounded-xl px-4 py-3 focus:outline-none focus:border-brand-accent" required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                    <select value={formData.branch_id} onFocus={handleInputFocus} onChange={e => setFormData({...formData, branch_id: e.target.value})} className="w-full border rounded-xl px-4 py-3 bg-white" required>
                      <option value="">Select...</option>
                      <option value="daily">Nearbi Daily</option>
                      <option value="hypermarket">Nearbi Hypermarket</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                    <select value={formData.department} onFocus={handleInputFocus} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full border rounded-xl px-4 py-3 bg-white" required>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
                  <select 
                    value={isCustomShift ? 'custom' : formData.shift_id} 
                    onFocus={handleInputFocus}
                    onChange={e => {
                      if (e.target.value === 'custom') {
                        setIsCustomShift(true);
                      } else {
                        setIsCustomShift(false);
                        setFormData({...formData, shift_id: e.target.value});
                      }
                    }} 
                    className={`w-full border rounded-xl px-4 py-3 focus:outline-none focus:border-brand-accent ${isCustomShift ? 'bg-gray-100 text-gray-400' : 'bg-white'}`} 
                    required={!isCustomShift}
                    disabled={isCustomShift}
                  >
                    {shifts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    <option value="custom">＋ Add custom shift...</option>
                  </select>
                  
                  {isCustomShift && (
                    <div className="bg-white mt-3 p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                      {customShiftError && (
                        <div className="text-[#D32F2F] text-xs font-bold bg-[#FFEBEE] p-2 rounded">{customShiftError}</div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Shift Label</label>
                        <input type="text" value={customShift.label} onFocus={handleInputFocus} onChange={e => setCustomShift({...customShift, label: e.target.value})} placeholder="e.g. 10:00 AM – 7:00 PM" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-accent bg-white" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                          <input type="time" value={customShift.start_time} onFocus={handleInputFocus} onChange={e => setCustomShift({...customShift, start_time: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-accent bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                          <input type="time" value={customShift.end_time} onFocus={handleInputFocus} onChange={e => setCustomShift({...customShift, end_time: e.target.value})} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-accent bg-white" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Hours</label>
                        <div className="w-full bg-gray-50 text-gray-600 rounded-lg px-3 py-2 text-sm font-medium border border-gray-100">
                          {customShift.start_time && customShift.end_time ? 
                            (() => {
                              const s = customShift.start_time.split(':').map(Number);
                              const e = customShift.end_time.split(':').map(Number);
                              const mins = (e[0]*60 + e[1]) - (s[0]*60 + s[1]);
                              return mins > 0 ? `${(mins / 60).toFixed(2)} hours` : 'Invalid';
                            })() : 'Auto-calculated'
                          }
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <button type="button" onClick={() => { setIsCustomShift(false); setFormData({...formData, shift_id: shifts.length > 0 ? shifts[0].id : ''}); }} className="px-2 py-2 text-sm font-medium text-gray-500 hover:text-gray-800 underline">Cancel</button>
                        <button type="button" onClick={handleAddCustomShift} disabled={customShiftLoading} className="bg-brand-accent text-[#111] font-bold text-sm px-6 py-2 rounded-xl active:scale-95 transition-transform">{customShiftLoading ? 'Adding...' : 'Add shift'}</button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Off Days</label>
                  <div className="flex space-x-3">
                    {[0, 2, 4].map(n => (
                      <button 
                        key={n} type="button" 
                        onClick={() => setFormData({...formData, off_days_per_month: n})}
                        className={`flex-1 py-3 rounded-xl border font-medium ${formData.off_days_per_month === n ? 'border-brand-accent bg-[#FFF8E7] text-brand-accent' : 'border-gray-200 bg-gray-50'}`}
                      >
                        {n} Days
                      </button>
                    ))}
                  </div>
                </div>

                {canSeeSalaryBreakdown && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Salary (₹)</label>
                    <input type="number" value={formData.monthly_salary} onFocus={handleInputFocus} onChange={e => setFormData({...formData, monthly_salary: e.target.value})} className="w-full border rounded-xl px-4 py-3 focus:outline-none focus:border-brand-accent" placeholder="e.g. 15000" required />
                  </div>
                )}

                <button type="submit" disabled={formLoading} className="w-full bg-brand-accent text-[#111] font-bold text-lg py-4 rounded-xl mt-6">
                  {formLoading ? 'Saving...' : 'Save Staff Member'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Bottom Sheet */}
      {staffToDelete && (
        <div className="fixed inset-0 z-[10000] flex flex-col justify-end">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" 
            onClick={() => setStaffToDelete(null)}
          ></div>
          <div 
            className="bg-white w-full max-w-[480px] mx-auto rounded-t-[20px] shadow-2xl relative z-10 animate-in slide-in-from-bottom-full duration-300 p-6"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 16px))' }}
          >
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4"></div>
            <div className="w-12 h-12 rounded-full bg-[#FFEBEE] text-[#D32F2F] flex items-center justify-center text-2xl mb-4 mx-auto">⚠️</div>
            <h3 className="text-xl font-bold text-center mb-2">Remove {staffToDelete.name}?</h3>
            <p className="text-gray-500 text-sm text-center mb-6">
              Are you sure you want to remove {staffToDelete.name} from the system? This will delete all their attendance and leave records.
            </p>
            <div className="flex space-x-3">
              <button 
                onClick={() => setStaffToDelete(null)} 
                className="flex-1 min-h-[44px] rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center justify-center cursor-pointer"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete} 
                className="flex-1 min-h-[44px] rounded-xl bg-[#D32F2F] text-white font-bold hover:bg-red-800 active:bg-red-950 transition-colors shadow-lg shadow-red-500/30 flex items-center justify-center cursor-pointer"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[20000] bg-[#2E7D32] text-white px-6 py-3 rounded-full font-bold text-sm shadow-xl animate-in fade-in slide-in-from-top-4 flex items-center space-x-2">
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

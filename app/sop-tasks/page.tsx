'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { 
  Lock, 
  ClipboardList, 
  Plus, 
  Trash2, 
  Edit, 
  ArrowUp, 
  ArrowDown, 
  RefreshCw,
  Save,
  CheckCircle,
  Calendar,
  AlertTriangle,
  FileText
} from 'lucide-react';
import AppShell from '@/components/AppShell';

interface SOPTask {
  id: string;
  branch_id: string;
  task_name: string;
  shift_window: 'opening' | 'mid_shift' | 'closing';
  time_start: string | null;
  time_end: string | null;
  requires_photo: boolean;
  is_critical: boolean;
  active: boolean;
  display_order: number;
}

interface RosterEntry {
  id?: string;
  branch_id: string;
  shift_window: 'opening' | 'closing';
  role_type: 'primary' | 'backup';
  staff_id: string;
  day_of_week: number;
  active?: boolean;
}

interface StaffMember {
  id: string;
  name: string;
  branch_id: string;
}

const DAYS_OF_WEEK = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 }
];

export default function SOPTasksPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'tasks' | 'roster' | 'swaps'>('tasks');
  const [selectedBranch, setSelectedBranch] = useState<'daily' | 'hypermarket'>('daily');

  // SOP Tasks State
  const [tasks, setTasks] = useState<SOPTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<SOPTask | null>(null);

  // Form State for Tasks
  const [taskName, setTaskName] = useState('');
  const [taskShift, setTaskShift] = useState<'opening' | 'mid_shift' | 'closing'>('opening');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [isCritical, setIsCritical] = useState(false);

  // Duty Roster State
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [savingRoster, setSavingRoster] = useState(false);

  // Shift Swap States
  const [swaps, setSwaps] = useState<any[]>([]);
  const [swapsLoading, setSwapsLoading] = useState(true);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingSwapId, setRejectingSwapId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingSwapId, setProcessingSwapId] = useState<string | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Guard routing
  useEffect(() => {
    if (!authLoading && user) {
      const allowed = user.role === 'admin' || user.role === 'ops_manager';
      if (!allowed) {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, router]);

  // Fetch SOP tasks
  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const { data, error } = await supabase
        .from('sop_tasks')
        .select('*')
        .eq('branch_id', selectedBranch)
        .eq('active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (e) {
      console.error('Error fetching SOP tasks:', e);
      showToast('Failed to load tasks.');
    } finally {
      setTasksLoading(false);
    }
  }, [selectedBranch]);

  // Fetch staff list for roster selection
  const fetchStaff = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, branch_id')
        .eq('active', true)
        .eq('is_resigned', false)
        .order('name');

      if (error) throw error;
      setStaffList(data || []);
    } catch (e) {
      console.error('Error fetching staff list:', e);
    }
  }, []);

  // Fetch duty roster entries
  const fetchRoster = useCallback(async () => {
    setRosterLoading(true);
    try {
      const { data, error } = await supabase
        .from('duty_roster')
        .select('*')
        .eq('branch_id', selectedBranch)
        .eq('active', true);

      if (error) throw error;
      setRoster(data || []);
    } catch (e) {
      console.error('Error fetching duty roster:', e);
      showToast('Failed to load roster.');
    } finally {
      setRosterLoading(false);
    }
  }, [selectedBranch]);

  const fetchPendingSwaps = useCallback(async () => {
    setSwapsLoading(true);
    try {
      const { data, error } = await supabase
        .from('shift_swap_requests')
        .select('*, requester:requested_by(name, branch_id), colleague:requested_with(name)')
        .eq('status', 'pending_ops_approval')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSwaps(data || []);
    } catch (e) {
      console.error('Error fetching pending swaps:', e);
      showToast('Failed to load swap requests.');
    } finally {
      setSwapsLoading(false);
    }
  }, []);

  const handleApproveSwap = async (swapId: string) => {
    setProcessingSwapId(swapId);
    try {
      const swap = swaps.find(s => s.id === swapId);
      if (!swap) return;

      const { error } = await supabase
        .from('shift_swap_requests')
        .update({
          status: 'approved',
          ops_approved_by: user?.email || 'Ops Head',
          ops_approved_at: new Date().toISOString()
        })
        .eq('id', swapId);

      if (error) throw error;

      const { createNotification } = await import('@/lib/notifications');
      
      await createNotification({
        type: 'shift_swap',
        title: '✅ Shift Swap Approved!',
        message: `Your shift swap request with ${swap.colleague?.name || 'your colleague'} for ${new Date(swap.swap_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} has been approved by Operations.`,
        branchId: swap.requester?.branch_id || null,
        staffId: swap.requested_by,
        targetRole: 'staff'
      });

      await createNotification({
        type: 'shift_swap',
        title: '✅ Shift Swap Approved!',
        message: `Your shift swap request with ${swap.requester?.name || 'your colleague'} for ${new Date(swap.swap_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} has been approved by Operations.`,
        branchId: swap.requester?.branch_id || null,
        staffId: swap.requested_with,
        targetRole: 'staff'
      });

      showToast('Shift swap request approved successfully ✓');
      fetchPendingSwaps();
    } catch (err: any) {
      console.error(err);
      alert('Failed to approve swap: ' + err.message);
    } finally {
      setProcessingSwapId(null);
    }
  };

  const handleRejectSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingSwapId || !rejectionReason.trim()) return;

    setProcessingSwapId(rejectingSwapId);
    try {
      const swap = swaps.find(s => s.id === rejectingSwapId);
      if (!swap) return;

      const { error } = await supabase
        .from('shift_swap_requests')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
          ops_approved_by: user?.email || 'Ops Head',
          ops_approved_at: new Date().toISOString()
        })
        .eq('id', rejectingSwapId);

      if (error) throw error;

      const { createNotification } = await import('@/lib/notifications');
      
      await createNotification({
        type: 'shift_swap',
        title: '❌ Shift Swap Rejected',
        message: `Your shift swap request for ${new Date(swap.swap_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} was rejected: ${rejectionReason.trim()}`,
        branchId: swap.requester?.branch_id || null,
        staffId: swap.requested_by,
        targetRole: 'staff'
      });

      await createNotification({
        type: 'shift_swap',
        title: '❌ Shift Swap Rejected',
        message: `Your shift swap request for ${new Date(swap.swap_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} was rejected: ${rejectionReason.trim()}`,
        branchId: swap.requester?.branch_id || null,
        staffId: swap.requested_with,
        targetRole: 'staff'
      });

      showToast('Shift swap request rejected ✓');
      setShowRejectModal(false);
      setRejectingSwapId(null);
      setRejectionReason('');
      fetchPendingSwaps();
    } catch (err: any) {
      console.error(err);
      alert('Failed to reject swap: ' + err.message);
    } finally {
      setProcessingSwapId(null);
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    if (activeTab === 'tasks') {
      fetchTasks();
    } else if (activeTab === 'roster' && user.role === 'admin') {
      fetchStaff();
      fetchRoster();
    } else if (activeTab === 'swaps') {
      fetchPendingSwaps();
    }
  }, [fetchTasks, fetchStaff, fetchRoster, fetchPendingSwaps, selectedBranch, activeTab, authLoading, user]);

  // Add or Edit SOP Task
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) {
      alert('Task name is required.');
      return;
    }

    try {
      if (editingTask) {
        // Update Task
        const { error } = await supabase
          .from('sop_tasks')
          .update({
            task_name: taskName.trim(),
            shift_window: taskShift,
            time_start: timeStart || null,
            time_end: timeEnd || null,
            requires_photo: requiresPhoto,
            is_critical: isCritical
          })
          .eq('id', editingTask.id);

        if (error) throw error;
        showToast('Task updated successfully ✓');
      } else {
        // Add Task
        // Get max order
        const maxOrder = tasks.filter(t => t.shift_window === taskShift).length + 1;
        const { error } = await supabase
          .from('sop_tasks')
          .insert({
            branch_id: selectedBranch,
            task_name: taskName.trim(),
            shift_window: taskShift,
            time_start: timeStart || null,
            time_end: timeEnd || null,
            requires_photo: requiresPhoto,
            is_critical: isCritical,
            display_order: maxOrder,
            created_by: user?.email || 'admin'
          });

        if (error) throw error;
        showToast('Task created successfully ✓');
      }

      setShowTaskModal(false);
      setEditingTask(null);
      resetTaskForm();
      fetchTasks();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save task: ' + err.message);
    }
  };

  const resetTaskForm = () => {
    setTaskName('');
    setTaskShift('opening');
    setTimeStart('');
    setTimeEnd('');
    setRequiresPhoto(false);
    setIsCritical(false);
  };

  // Reordering tasks
  const handleMoveOrder = async (task: SOPTask, direction: 'up' | 'down') => {
    const shiftTasks = tasks.filter(t => t.shift_window === task.shift_window);
    const currentIndex = shiftTasks.findIndex(t => t.id === task.id);

    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === shiftTasks.length - 1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const targetTask = shiftTasks[targetIndex];

    try {
      // Swap display_order in DB
      await supabase
        .from('sop_tasks')
        .update({ display_order: targetTask.display_order })
        .eq('id', task.id);

      await supabase
        .from('sop_tasks')
        .update({ display_order: task.display_order })
        .eq('id', targetTask.id);

      fetchTasks();
    } catch (e) {
      console.error('Error swapping task order:', e);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    try {
      // Soft delete by setting active = false
      const { error } = await supabase
        .from('sop_tasks')
        .update({ active: false })
        .eq('id', taskId);

      if (error) throw error;
      showToast('Task deleted successfully ✓');
      fetchTasks();
    } catch (e) {
      console.error(e);
      alert('Failed to delete task');
    }
  };

  // Edit task setup
  const openEditTask = (task: SOPTask) => {
    setEditingTask(task);
    setTaskName(task.task_name);
    setTaskShift(task.shift_window);
    setTimeStart(task.time_start || '');
    setTimeEnd(task.time_end || '');
    setRequiresPhoto(task.requires_photo);
    setIsCritical(task.is_critical);
    setShowTaskModal(true);
  };

  // Roster grid selection changes
  const handleRosterCellChange = (day: number, shift: 'opening' | 'closing', role: 'primary' | 'backup', staffId: string) => {
    // Find if entry already exists in local roster state
    const existingIndex = roster.findIndex(
      r => r.day_of_week === day && r.shift_window === shift && r.role_type === role
    );

    const updated = [...roster];
    if (existingIndex > -1) {
      if (staffId === '') {
        // delete / remove
        updated.splice(existingIndex, 1);
      } else {
        updated[existingIndex] = { ...updated[existingIndex], staff_id: staffId };
      }
    } else if (staffId !== '') {
      updated.push({
        branch_id: selectedBranch,
        shift_window: shift,
        role_type: role,
        staff_id: staffId,
        day_of_week: day,
        active: true
      });
    }

    setRoster(updated);
  };

  // Save roster changes to Supabase
  const handleSaveRoster = async () => {
    setSavingRoster(true);
    try {
      // 1. Delete all current roster assignments for this branch
      const { error: delError } = await supabase
        .from('duty_roster')
        .delete()
        .eq('branch_id', selectedBranch);

      if (delError) throw delError;

      // 2. Insert new roster entries
      if (roster.length > 0) {
        // Remove ids if they existed to let DB generate new ones
        const insertPayload = roster.map(({ id, ...rest }) => ({
          ...rest,
          branch_id: selectedBranch
        }));

        const { error: insError } = await supabase
          .from('duty_roster')
          .insert(insertPayload);

        if (insError) throw insError;
      }

      showToast('Weekly Roster Saved Successfully! ✓');
      fetchRoster();
    } catch (e: any) {
      console.error(e);
      alert('Failed to save roster: ' + e.message);
    } finally {
      setSavingRoster(false);
    }
  };

  // Helper to fetch roster cell value
  const getRosterValue = (day: number, shift: 'opening' | 'closing', role: 'primary' | 'backup') => {
    const entry = roster.find(
      r => r.day_of_week === day && r.shift_window === shift && r.role_type === role
    );
    return entry ? entry.staff_id : '';
  };

  // Filter staff list per branch to narrow dropdowns
  const branchStaff = staffList.filter(s => s.branch_id === selectedBranch);

  // Security guard rendering
  if (authLoading || (user && user.role !== 'admin' && user.role !== 'ops_manager')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center select-none bg-[#F8F9FA]">
        <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-8 max-w-sm w-full flex flex-col items-center shadow-lg">
          <Lock size={48} className="mb-4 text-slate-400 animate-pulse" />
          <h2 className="text-lg font-extrabold text-[#1A1A1A] mb-2 uppercase tracking-wide">Access Denied</h2>
          <p className="text-[#666666] text-xs font-semibold leading-relaxed mb-6">
            Only administrators and operations managers can manage SOP tasks and rosters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        
        {/* Header Block */}
        <div className="bg-gradient-to-br from-[#1A1A1A] via-slate-800 to-[#1A1A1A] rounded-[20px] p-6 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.05),transparent)] pointer-events-none" />
          <div className="space-y-1 z-10">
            <div className="flex items-center gap-2 text-slate-300">
              <ClipboardList size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operations Control</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider">SOP & Duty Settings</h1>
            <p className="text-xs text-slate-400 font-medium">Build branch checklist tasks, toggle photo rules, and define Store Guardian duty rosters.</p>
          </div>
          
          {/* Branch selector */}
          <div className="flex bg-white/10 rounded-xl p-1 border border-white/10 z-10">
            {[
              { label: 'Daily', value: 'daily' },
              { label: 'Hypermarket', value: 'hypermarket' }
            ].map(b => (
              <button
                key={b.value}
                onClick={() => setSelectedBranch(b.value as any)}
                className={`px-4 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                  selectedBranch === b.value ? 'bg-white text-[#1A1A1A] shadow-md' : 'text-slate-300 hover:text-white'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Toggle Navigation */}
        <div className="flex bg-[#F0F2F5] rounded-2xl p-1 gap-1 border border-[#E0E2E5]">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 text-center py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
              activeTab === 'tasks' ? 'bg-white text-[#1A1A1A] shadow' : 'text-slate-500 hover:text-[#1A1A1A]'
            }`}
          >
            SOP Tasks Config
          </button>
          
          {user?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('roster')}
              className={`flex-1 text-center py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                activeTab === 'roster' ? 'bg-white text-[#1A1A1A] shadow' : 'text-slate-500 hover:text-[#1A1A1A]'
              }`}
            >
              Guardian Duty Roster
            </button>
          )}

          <button
            onClick={() => setActiveTab('swaps')}
            className={`flex-1 text-center py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
              activeTab === 'swaps' ? 'bg-white text-[#1A1A1A] shadow' : 'text-slate-500 hover:text-[#1A1A1A]'
            }`}
          >
            Swap Requests
          </button>
        </div>

        {/* --- TAB 1: SOP TASKS CONFIG --- */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            
            {/* Header actions */}
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-extrabold uppercase text-[#1A1A1A] tracking-wider">
                {selectedBranch === 'daily' ? 'Daily Branch' : 'Hypermarket Branch'} Checklist Tasks
              </h2>
              <button
                onClick={() => { resetTaskForm(); setEditingTask(null); setShowTaskModal(true); }}
                className="bg-[#1A1A1A] hover:bg-[#333333] active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus size={16} />
                <span>Add Task</span>
              </button>
            </div>

            {tasksLoading ? (
              <div className="bg-white border border-[#EAEAEA] rounded-[20px] py-16 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="animate-spin text-slate-600" size={32} />
                <p className="text-xs text-[#888888] font-bold tracking-wider uppercase">Loading checklists...</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="bg-white border border-[#EAEAEA] rounded-[20px] py-16 text-center select-none text-slate-400 space-y-1.5">
                <ClipboardList size={36} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-black uppercase tracking-wider text-slate-600">No SOP Tasks Configured</p>
                <p className="text-[10px] text-slate-400 font-semibold max-w-xs mx-auto">Create checklists by clicking "Add Task" above.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {(['opening', 'mid_shift', 'closing'] as const).map(window => {
                  const windowTasks = tasks.filter(t => t.shift_window === window);
                  
                  return (
                    <div key={window} className="bg-white border border-[#EAEAEA] rounded-[20px] shadow-sm overflow-hidden">
                      <div className="bg-slate-50 border-b border-[#F0F0F0] py-3.5 px-5 flex justify-between items-center">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                          {window === 'opening' ? '🌅 Opening Shift' : window === 'mid_shift' ? '☀️ Mid-Shift' : '🌙 Closing Shift'}
                        </span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                          {windowTasks.length} {windowTasks.length === 1 ? 'task' : 'tasks'}
                        </span>
                      </div>
                      
                      {windowTasks.length === 0 ? (
                        <p className="p-5 text-center text-xs italic text-slate-400">No tasks configured for this shift window.</p>
                      ) : (
                        <div className="divide-y divide-[#F2F2F2]">
                          {windowTasks.map((t, idx) => (
                            <div key={t.id} className="p-4 flex items-center justify-between text-xs font-semibold hover:bg-slate-50/50 transition-colors">
                              
                              {/* Left task info */}
                              <div className="space-y-1 flex-1 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-[#1A1A1A] font-bold text-sm">{t.task_name}</span>
                                  {t.is_critical && (
                                    <span className="bg-red-50 text-red-600 border border-red-200 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                      CRITICAL GATE
                                    </span>
                                  )}
                                  {t.requires_photo && (
                                    <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                      PHOTO PROOF
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-semibold flex gap-2">
                                  <span>Time window: {t.time_start ? `${t.time_start.slice(0, 5)} - ${t.time_end?.slice(0, 5)}` : 'Flexible / Shift Hour'}</span>
                                </div>
                              </div>

                              {/* Reordering & edit actions */}
                              <div className="flex items-center gap-2.5">
                                
                                {/* Up/Down display order triggers */}
                                <div className="flex flex-col gap-1 border-r border-[#EAEAEA] pr-2.5">
                                  <button
                                    onClick={() => handleMoveOrder(t, 'up')}
                                    disabled={idx === 0}
                                    className="p-0.5 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleMoveOrder(t, 'down')}
                                    disabled={idx === windowTasks.length - 1}
                                    className="p-0.5 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                </div>

                                {/* Edit and Delete */}
                                <button
                                  onClick={() => openEditTask(t)}
                                  className="text-slate-500 hover:text-blue-600 transition-colors p-1.5 cursor-pointer"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteTask(t.id)}
                                  className="text-slate-500 hover:text-red-600 transition-colors p-1.5 cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>

                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- TAB 2: DUTY ROSTER --- */}
        {activeTab === 'roster' && user?.role === 'admin' && (
          <div className="space-y-6">
            
            {/* Header info */}
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-extrabold uppercase text-[#1A1A1A] tracking-wider">
                Weekly Recurring Guardian Assignments ({selectedBranch === 'daily' ? 'Daily' : 'Hypermarket'})
              </h2>
              
              <button
                onClick={handleSaveRoster}
                disabled={savingRoster}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                {savingRoster ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                <span>Save Roster</span>
              </button>
            </div>

            {rosterLoading ? (
              <div className="bg-white border border-[#EAEAEA] rounded-[20px] py-16 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="animate-spin text-slate-600" size={32} />
                <p className="text-xs text-[#888888] font-bold tracking-wider uppercase">Loading roster grid...</p>
              </div>
            ) : (
              <div className="bg-white border border-[#EAEAEA] rounded-[20px] shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs font-semibold">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#F0F0F0]">
                      <th className="py-3.5 px-4 text-[9px] font-black uppercase text-slate-500 tracking-wider">Day</th>
                      <th className="py-3.5 px-4 text-[9px] font-black uppercase text-slate-500 tracking-wider">Opening Primary</th>
                      <th className="py-3.5 px-4 text-[9px] font-black uppercase text-slate-500 tracking-wider">Opening Backup</th>
                      <th className="py-3.5 px-4 text-[9px] font-black uppercase text-slate-500 tracking-wider">Closing Primary</th>
                      <th className="py-3.5 px-4 text-[9px] font-black uppercase text-slate-500 tracking-wider">Closing Backup</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2F2F2]">
                    {DAYS_OF_WEEK.map(day => (
                      <tr key={day.value} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 font-extrabold text-[#1A1A1A] whitespace-nowrap bg-slate-50/40 border-r border-[#F0F0F0]">
                          {day.label}
                        </td>
                        
                        {/* Cells */}
                        {[
                          { shift: 'opening', role: 'primary' },
                          { shift: 'opening', role: 'backup' },
                          { shift: 'closing', role: 'primary' },
                          { shift: 'closing', role: 'backup' }
                        ].map(c => (
                          <td key={`${c.shift}_${c.role}`} className="p-2 min-w-[150px]">
                            <select
                              value={getRosterValue(day.value, c.shift as any, c.role as any)}
                              onChange={(e) => handleRosterCellChange(day.value, c.shift as any, c.role as any, e.target.value)}
                              className="w-full bg-[#F8F9FA] border border-[#EAEAEA] focus:border-slate-500 rounded-lg p-2 text-xs font-bold text-[#1A1A1A] outline-none cursor-pointer"
                            >
                              <option value="">-- Unassigned --</option>
                              {branchStaff.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </td>
                        ))}

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* --- TAB 3: SHIFT SWAP REQUESTS --- */}
        {activeTab === 'swaps' && (
          <div className="space-y-6">
            <h2 className="text-sm font-extrabold uppercase text-[#1A1A1A] tracking-wider pb-2 border-b border-[#F0F0F0]">
              Pending Shift Swap Approvals
            </h2>

            {swapsLoading ? (
              <div className="bg-white border border-[#EAEAEA] rounded-[20px] py-16 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="animate-spin text-slate-600" size={32} />
                <p className="text-xs text-[#888888] font-bold tracking-wider uppercase">Loading swap requests...</p>
              </div>
            ) : swaps.length === 0 ? (
              <div className="bg-white border border-[#EAEAEA] rounded-[20px] py-16 text-center select-none text-slate-400 space-y-1.5 shadow-sm">
                <RefreshCw size={36} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-black uppercase tracking-wider text-slate-600">No Swaps Pending Approval</p>
                <p className="text-[10px] text-slate-400 font-semibold">Any swap requests agreed by colleagues will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {swaps.map(swap => (
                  <div key={swap.id} className="bg-white border border-[#EAEAEA] rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="bg-[#F0F2F5] text-slate-700 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-[#EAEAEA]">
                          {swap.requester?.branch_id === 'daily' ? 'Daily Branch' : 'Hypermarket Branch'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(swap.swap_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-bold pt-1.5 text-center">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
                          <span className="text-[9px] font-black uppercase text-slate-400">Requester</span>
                          <p className="text-slate-800 truncate">{swap.requester?.name || 'Staff'}</p>
                          <span className="text-[9px] bg-slate-200/50 px-1 rounded inline-block text-slate-600 truncate max-w-full">
                            {swap.requester_original_role}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
                          <span className="text-[9px] font-black uppercase text-slate-400">Colleague</span>
                          <p className="text-slate-800 truncate">{swap.colleague?.name || 'Colleague'}</p>
                          <span className="text-[9px] bg-slate-200/50 px-1 rounded inline-block text-slate-600 truncate max-w-full">
                            {swap.colleague_original_role}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-[#F0F0F0]">
                      <button
                        onClick={() => handleApproveSwap(swap.id)}
                        disabled={processingSwapId !== null}
                        className="flex-grow min-h-[36px] bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      >
                        {processingSwapId === swap.id ? <RefreshCw size={14} className="animate-spin" /> : 'Approve Swap'}
                      </button>
                      <button
                        onClick={() => { setRejectingSwapId(swap.id); setRejectionReason(''); setShowRejectModal(true); }}
                        disabled={processingSwapId !== null}
                        className="flex-grow min-h-[36px] bg-red-600 hover:bg-red-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- ADD/EDIT TASK MODAL --- */}
        {showTaskModal && (
          <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
            <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-[#1A1A1A]">
                  {editingTask ? 'Edit SOP Task' : 'Add SOP Task'}
                </h3>
                <button
                  onClick={() => { setShowTaskModal(false); setEditingTask(null); }}
                  className="text-slate-400 hover:text-[#1A1A1A] text-xs font-bold"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleSaveTask} className="space-y-4 text-xs font-semibold">
                
                {/* Task Name */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Task Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Lights ON" 
                    value={taskName}
                    onChange={e => setTaskName(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500"
                    required
                  />
                </div>

                {/* Shift Window */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Shift Window</label>
                  <select
                    value={taskShift}
                    onChange={e => setTaskShift(e.target.value as any)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 cursor-pointer"
                  >
                    <option value="opening">Opening Shift</option>
                    <option value="mid_shift">Mid-Shift</option>
                    <option value="closing">Closing Shift</option>
                  </select>
                </div>

                {/* Start & End Times */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Start Time (Opt)</label>
                    <input 
                      type="time" 
                      value={timeStart}
                      onChange={e => setTimeStart(e.target.value)}
                      className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">End Time (Opt)</label>
                    <input 
                      type="time" 
                      value={timeEnd}
                      onChange={e => setTimeEnd(e.target.value)}
                      className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={requiresPhoto}
                      onChange={e => setRequiresPhoto(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-slate-900 focus:ring-slate-900"
                    />
                    <div className="flex flex-col">
                      <span className="text-[#1A1A1A] font-bold">Requires Photo Proof</span>
                      <span className="text-[9px] text-slate-400">User must snap a photo to verify completion</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={isCritical}
                      onChange={e => setIsCritical(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-[#C0392B] focus:ring-[#C0392B]"
                    />
                    <div className="flex flex-col">
                      <span className="text-[#1A1A1A] font-bold">Critical Task Gate</span>
                      <span className="text-[9px] text-[#C0392B] font-bold">Required to open/close the store status lock</span>
                    </div>
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  className="w-full py-3 bg-[#1A1A1A] hover:bg-[#333333] text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer mt-4"
                >
                  {editingTask ? 'Save Task Updates' : 'Create Task Template'}
                </button>

              </form>
            </div>
          </div>
        )}

      {/* Rejection Reason Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs font-semibold text-[#1A1A1A]">
            <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3 text-left">
              <h3 className="text-sm font-black uppercase tracking-wider text-red-600">
                Reject Swap Request
              </h3>
              <button
                onClick={() => { setShowRejectModal(false); setRejectingSwapId(null); }}
                className="text-slate-400 hover:text-[#1A1A1A] text-xs font-bold"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleRejectSwap} className="space-y-4 text-left">
              
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Reason for Rejection</label>
                <textarea
                  rows={3}
                  placeholder="Provide details why this swap is rejected..."
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-semibold"
                  required
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={processingSwapId !== null}
                className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer mt-4 flex items-center justify-center gap-1.5"
              >
                {processingSwapId !== null ? <RefreshCw size={14} className="animate-spin" /> : 'Confirm Rejection'}
              </button>

            </form>
          </div>
        </div>
      )}

        {/* Toast alerts */}
        {toastMsg && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[15000] bg-[#EDF7EF] border border-[#2D7A3A] text-[#2D7A3A] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-1">
            <CheckCircle size={14} className="text-[#2D7A3A]" />
            <span>{toastMsg}</span>
          </div>
        )}

      </div>
    </AppShell>
  );
}

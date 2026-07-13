'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { 
  Lock, 
  Wrench, 
  Plus, 
  RefreshCw,
  Clock,
  User,
  Filter,
  AlertTriangle,
  CheckCircle,
  FileText,
  Activity,
  UserCheck,
  Calendar,
  MessageSquare,
  WrenchIcon,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import AppShell from '@/components/AppShell';

interface MaintenanceTicket {
  id: string;
  branch_id: string;
  category: 'ac' | 'freezer' | 'lights' | 'pos' | 'plumbing' | 'stock_damage' | 'customer_complaint' | 'other';
  description: string;
  photo_url: string | null;
  reported_by: string;
  reported_at: string;
  status: 'open' | 'assigned' | 'in_progress' | 'fixed' | 'closed';
  assigned_to: string | null;
  priority: 'low' | 'normal' | 'urgent';
  fixed_at: string | null;
  fixed_notes: string | null;
  reporter?: { name: string };
}

interface ActivityLog {
  id: string;
  ticket_id: string | null;
  activity_type: 'created' | 'status_changed' | 'technician_visit' | 'note_added';
  visitor_name: string | null;
  visitor_type: 'electrician' | 'ac_technician' | 'pest_control' | 'it_support' | 'plumber' | 'other' | null;
  note: string | null;
  logged_by: string;
  logged_at: string;
}

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  ac: { label: 'AC / Cooling', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  freezer: { label: 'Freezer / Fridge', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  lights: { label: 'Lights / Elec', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  pos: { label: 'POS System', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  plumbing: { label: 'Plumbing', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  stock_damage: { label: 'Stock Damage', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  customer_complaint: { label: 'Complaint', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  other: { label: 'Other', color: 'bg-slate-50 text-slate-700 border-slate-200' }
};

const VISITOR_TYPES = [
  { val: 'electrician', label: 'Electrician' },
  { val: 'ac_technician', label: 'AC Technician' },
  { val: 'pest_control', label: 'Pest Control' },
  { val: 'it_support', label: 'IT Support' },
  { val: 'plumber', label: 'Plumber' },
  { val: 'other', label: 'Other Support' }
];

export default function MaintenanceTicketsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Tickets State
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicket | null>(null);
  const [activityTimeline, setActivityTimeline] = useState<ActivityLog[]>([]);

  // Filter States
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  // Modal / Action States
  const [showTechnicianModal, setShowTechnicianModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showFixedModal, setShowFixedModal] = useState(false);
  const [showStandaloneModal, setShowStandaloneModal] = useState(false);

  // Forms State
  const [visitorName, setVisitorName] = useState('');
  const [visitorType, setVisitorType] = useState<string>('other');
  const [actionNote, setActionNote] = useState('');
  const [fixingNotes, setFixingNotes] = useState('');
  const [pendingStatusChange, setPendingStatusChange] = useState<string | null>(null);

  // Standalone visit form
  const [standaloneBranch, setStandaloneBranch] = useState<'daily' | 'hypermarket'>('daily');
  const [standaloneName, setStandaloneName] = useState('');
  const [standaloneType, setStandaloneType] = useState<string>('other');
  const [standaloneNote, setStandaloneNote] = useState('');

  // Toast alerts
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

  // Fetch Tickets
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('maintenance_tickets')
        .select('*, reporter:reported_by(name)');

      if (filterBranch !== 'all') {
        query = query.eq('branch_id', filterBranch);
      }
      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      if (filterPriority !== 'all') {
        query = query.eq('priority', filterPriority);
      }

      const { data, error } = await query.order('reported_at', { ascending: false });
      if (error) throw error;
      setTickets(data || []);

      // If a ticket is currently expanded, refresh its details
      if (selectedTicket) {
        const updated = data?.find(t => t.id === selectedTicket.id);
        if (updated) {
          setSelectedTicket(updated);
        }
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  }, [filterBranch, filterCategory, filterStatus, filterPriority, selectedTicket]);

  // Fetch Activity Timeline
  const fetchActivityTimeline = useCallback(async (ticketId: string) => {
    try {
      const { data, error } = await supabase
        .from('ticket_activity_log')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('logged_at', { ascending: true });

      if (error) throw error;
      setActivityTimeline(data || []);
    } catch (e) {
      console.error('Failed to load timeline:', e);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchTickets();
  }, [filterBranch, filterCategory, filterStatus, filterPriority, authLoading, user]);

  // Expand / Close detail view
  const handleSelectTicket = (ticket: MaintenanceTicket) => {
    if (selectedTicket?.id === ticket.id) {
      setSelectedTicket(null);
      setActivityTimeline([]);
    } else {
      setSelectedTicket(ticket);
      fetchActivityTimeline(ticket.id);
    }
  };

  // Change Ticket Status
  const handleStatusChange = async (status: 'open' | 'assigned' | 'in_progress' | 'fixed' | 'closed') => {
    if (!selectedTicket) return;

    if (status === 'fixed') {
      // Prompt for notes in a modal first
      setPendingStatusChange(status);
      setFixingNotes('');
      setShowFixedModal(true);
      return;
    }

    try {
      const oldStatus = selectedTicket.status;
      const { error } = await supabase
        .from('maintenance_tickets')
        .update({ status })
        .eq('id', selectedTicket.id);

      if (error) throw error;

      // Log activity
      await supabase.from('ticket_activity_log').insert({
        ticket_id: selectedTicket.id,
        activity_type: 'status_changed',
        note: `Status updated from '${oldStatus}' to '${status}'.`,
        logged_by: user?.name || 'Ops Head'
      });

      showToast(`Status updated to ${status} ✓`);
      fetchTickets();
      fetchActivityTimeline(selectedTicket.id);
    } catch (err) {
      console.error(err);
      alert('Failed to update status');
    }
  };

  // Submit Fixed Notes
  const handleFixedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !fixingNotes.trim()) return;

    try {
      const oldStatus = selectedTicket.status;
      const { error } = await supabase
        .from('maintenance_tickets')
        .update({
          status: 'fixed',
          fixed_at: new Date().toISOString(),
          fixed_notes: fixingNotes.trim()
        })
        .eq('id', selectedTicket.id);

      if (error) throw error;

      // Log activity
      await supabase.from('ticket_activity_log').insert({
        ticket_id: selectedTicket.id,
        activity_type: 'status_changed',
        note: `Status updated from '${oldStatus}' to 'fixed'. Resolution: ${fixingNotes.trim()}`,
        logged_by: user?.name || 'Ops Head'
      });

      showToast('Ticket marked as resolved ✓');
      setShowFixedModal(false);
      setFixingNotes('');
      fetchTickets();
      fetchActivityTimeline(selectedTicket.id);
    } catch (err) {
      console.error(err);
      alert('Failed to resolve ticket');
    }
  };

  // Change Ticket Priority
  const handlePriorityChange = async (priority: 'low' | 'normal' | 'urgent') => {
    if (!selectedTicket) return;

    try {
      const { error } = await supabase
        .from('maintenance_tickets')
        .update({ priority })
        .eq('id', selectedTicket.id);

      if (error) throw error;

      // Log note
      await supabase.from('ticket_activity_log').insert({
        ticket_id: selectedTicket.id,
        activity_type: 'note_added',
        note: `Priority changed to '${priority}'.`,
        logged_by: user?.name || 'Ops Head'
      });

      showToast(`Priority updated to ${priority} ✓`);
      fetchTickets();
      fetchActivityTimeline(selectedTicket.id);
    } catch (err) {
      console.error(err);
      alert('Failed to update priority');
    }
  };

  // Log Technician Visit
  const handleTechnicianSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !visitorName.trim()) return;

    try {
      const { error } = await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: selectedTicket.id,
          activity_type: 'technician_visit',
          visitor_name: visitorName.trim(),
          visitor_type: visitorType as any,
          note: actionNote.trim() || 'Technician visited site.',
          logged_by: user?.name || 'Ops Head'
        });

      if (error) throw error;

      showToast('Technician visit logged successfully ✓');
      setShowTechnicianModal(false);
      setVisitorName('');
      setVisitorType('other');
      setActionNote('');
      fetchActivityTimeline(selectedTicket.id);
    } catch (err) {
      console.error(err);
      alert('Failed to log visit');
    }
  };

  // Add Free-Text Note
  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !actionNote.trim()) return;

    try {
      const { error } = await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: selectedTicket.id,
          activity_type: 'note_added',
          note: actionNote.trim(),
          logged_by: user?.name || 'Ops Head'
        });

      if (error) throw error;

      showToast('Note added successfully ✓');
      setShowNoteModal(false);
      setActionNote('');
      fetchActivityTimeline(selectedTicket.id);
    } catch (err) {
      console.error(err);
      alert('Failed to add note');
    }
  };

  // Standalone Technician Log Submit
  const handleStandaloneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!standaloneName.trim()) {
      alert('Technician name is required.');
      return;
    }

    try {
      const { error } = await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: null,
          activity_type: 'technician_visit',
          visitor_name: standaloneName.trim(),
          visitor_type: standaloneType as any,
          note: `[STANDALONE VISIT - ${standaloneBranch.toUpperCase()}] ${standaloneNote.trim() || 'General maintenance check.'}`,
          logged_by: user?.name || 'Ops Head'
        });

      if (error) throw error;

      showToast('General visitor logged successfully ✓');
      setShowStandaloneModal(false);
      setStandaloneName('');
      setStandaloneType('other');
      setStandaloneNote('');
    } catch (err) {
      console.error(err);
      alert('Failed to log generic visitor');
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'open') return 'bg-red-50 text-red-600 border border-red-200';
    if (status === 'assigned' || status === 'in_progress') return 'bg-amber-50 text-amber-600 border border-amber-200';
    return 'bg-emerald-50 text-emerald-600 border border-emerald-200';
  };

  const getPriorityColor = (priority: string) => {
    if (priority === 'urgent') return 'bg-rose-600 text-white';
    if (priority === 'normal') return 'bg-slate-700 text-white';
    return 'bg-slate-300 text-slate-700';
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (authLoading || (user && user.role !== 'admin' && user.role !== 'ops_manager')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center select-none bg-[#F8F9FA]">
        <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-8 max-w-sm w-full flex flex-col items-center shadow-lg">
          <Lock size={48} className="mb-4 text-slate-400 animate-pulse" />
          <h2 className="text-lg font-extrabold text-[#1A1A1A] mb-2 uppercase tracking-wide">Access Denied</h2>
          <p className="text-[#666666] text-xs font-semibold leading-relaxed mb-6">
            Only administrators and operations managers can access the maintenance module.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        
        {/* Header Block */}
        <div className="bg-gradient-to-br from-red-950 via-slate-900 to-red-950 rounded-[20px] p-6 text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.03),transparent)] pointer-events-none" />
          <div className="space-y-1 z-10">
            <div className="flex items-center gap-2 text-red-300">
              <Wrench size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Operations Facility Control</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider">Maintenance Log & Visits</h1>
            <p className="text-xs text-slate-400 font-medium">Manage AC, freezer, plumbing, electrical issues, log visitors, and track action timelines.</p>
          </div>

          <button
            onClick={() => setShowStandaloneModal(true)}
            className="bg-white hover:bg-slate-100 text-[#1A1A1A] text-xs font-extrabold px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow z-10 active:scale-95"
          >
            <Plus size={16} />
            <span>Log Visitor / Visit</span>
          </button>
        </div>

        {/* Filters Panel */}
        <div className="bg-white border border-[#EAEAEA] rounded-[20px] p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-slate-700 pb-1.5 border-b border-[#F0F0F0]">
            <Filter size={16} />
            <span className="text-xs font-black uppercase tracking-wider">Filter Tickets</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-bold text-[#1A1A1A]">
            {/* Branch */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Branch</label>
              <select
                value={filterBranch}
                onChange={e => setFilterBranch(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-[#EAEAEA] rounded-lg p-2.5 outline-none cursor-pointer"
              >
                <option value="all">All Branches</option>
                <option value="daily">Daily</option>
                <option value="hypermarket">Hypermarket</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Category</label>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-[#EAEAEA] rounded-lg p-2.5 outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                {Object.entries(CATEGORY_MAP).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-[#EAEAEA] rounded-lg p-2.5 outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="fixed">Fixed</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Priority</label>
              <select
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-[#EAEAEA] rounded-lg p-2.5 outline-none cursor-pointer"
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tickets Grid / List */}
        {loading ? (
          <div className="bg-white border border-[#EAEAEA] rounded-[20px] py-16 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="animate-spin text-slate-600" size={32} />
            <p className="text-xs text-[#888888] font-bold tracking-wider uppercase">Loading maintenance tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-white border border-[#EAEAEA] rounded-[20px] py-16 text-center select-none text-slate-400 space-y-1.5">
            <Wrench size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-black uppercase tracking-wider text-slate-600">No Tickets Filed</p>
            <p className="text-[10px] text-slate-400 font-semibold max-w-xs mx-auto">All systems are currently reported operational.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tickets.map(ticket => {
              const isExpanded = selectedTicket?.id === ticket.id;
              const catInfo = CATEGORY_MAP[ticket.category] || CATEGORY_MAP.other;

              return (
                <div 
                  key={ticket.id}
                  className={`bg-white border transition-all rounded-[20px] shadow-sm overflow-hidden ${
                    isExpanded ? 'border-slate-800 ring-1 ring-slate-800' : 'border-[#EAEAEA] hover:border-slate-400'
                  }`}
                >
                  {/* Card Header Tap Area */}
                  <div 
                    onClick={() => handleSelectTicket(ticket)}
                    className="p-5 flex items-start justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${catInfo.color}`}>
                          {catInfo.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getStatusColor(ticket.status)}`}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold ml-1">
                          {ticket.branch_id === 'daily' ? 'Daily' : 'Hypermarket'}
                        </span>
                      </div>
                      <p className="text-xs font-extrabold text-[#1A1A1A] leading-relaxed line-clamp-2">
                        {ticket.description}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
                        <span>By: {ticket.reporter?.name || 'Staff'}</span>
                        <span>•</span>
                        <span>{getTimeAgo(ticket.reported_at)}</span>
                      </div>
                    </div>

                    <div className="text-slate-400 pt-1">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="border-t border-[#F0F0F0] bg-slate-50/50 p-5 space-y-6 animate-in fade-in duration-200">
                      
                      {/* Description & Photo Details */}
                      <div className="flex flex-col md:flex-row gap-5">
                        <div className="flex-1 space-y-3 text-xs">
                          <div>
                            <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1">Full Description</h4>
                            <p className="bg-white border border-[#EAEAEA] rounded-xl p-3 text-slate-700 leading-relaxed font-semibold">
                              {ticket.description}
                            </p>
                          </div>

                          {ticket.fixed_notes && (
                            <div>
                              <h4 className="text-[9px] font-black uppercase text-emerald-600 tracking-wider mb-1">Fix / Resolution Notes</h4>
                              <p className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 leading-relaxed font-semibold">
                                {ticket.fixed_notes}
                              </p>
                            </div>
                          )}
                        </div>

                        {ticket.photo_url && (
                          <div className="w-full md:w-48 space-y-1">
                            <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1">Attached Photo</h4>
                            <a 
                              href={ticket.photo_url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="block border border-[#EAEAEA] rounded-xl overflow-hidden shadow-sm active:scale-98 transition-all"
                            >
                              <img 
                                src={ticket.photo_url} 
                                alt="Issue proof" 
                                className="w-full h-32 object-cover"
                              />
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Ticket Lifecycle Operations */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        
                        {/* Change Status */}
                        <div>
                          <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Change Status</label>
                          <select
                            value={ticket.status}
                            onChange={e => handleStatusChange(e.target.value as any)}
                            className="w-full bg-white border border-[#EAEAEA] rounded-xl p-2.5 text-xs font-bold text-[#1A1A1A] outline-none cursor-pointer shadow-sm"
                          >
                            <option value="open">Open</option>
                            <option value="assigned">Assigned</option>
                            <option value="in_progress">In Progress</option>
                            <option value="fixed">Fixed (Resolve)</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>

                        {/* Adjust Priority */}
                        <div>
                          <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Change Priority</label>
                          <select
                            value={ticket.priority}
                            onChange={e => handlePriorityChange(e.target.value as any)}
                            className="w-full bg-white border border-[#EAEAEA] rounded-xl p-2.5 text-xs font-bold text-[#1A1A1A] outline-none cursor-pointer shadow-sm"
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>

                        {/* Log Technician Trigger */}
                        <div className="flex flex-col justify-end">
                          <button
                            onClick={() => setShowTechnicianModal(true)}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-3 rounded-xl shadow-sm cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                          >
                            <UserCheck size={14} />
                            <span>Log Tech Visit</span>
                          </button>
                        </div>

                        {/* Add Note Trigger */}
                        <div className="flex flex-col justify-end">
                          <button
                            onClick={() => setShowNoteModal(true)}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-3 rounded-xl shadow-sm cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                          >
                            <MessageSquare size={14} />
                            <span>Add Comment</span>
                          </button>
                        </div>

                      </div>

                      {/* Ticket History Timeline */}
                      <div className="space-y-3 pt-4 border-t border-[#F0F0F0]">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                          <Activity size={14} />
                          <span>Audit & Activity Timeline</span>
                        </h4>

                        <div className="relative pl-4 border-l border-slate-200 space-y-4">
                          {activityTimeline.map(log => (
                            <div key={log.id} className="relative text-xs">
                              {/* Dot */}
                              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-500 border border-white" />
                              
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-slate-800">
                                    {log.activity_type === 'created' ? 'Ticket Created 🔧' : 
                                     log.activity_type === 'status_changed' ? 'Status Shift 🔄' : 
                                     log.activity_type === 'technician_visit' ? `Technician Logged (${log.visitor_type}) 👷` : 
                                     'Comment Added 💬'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-semibold">
                                    {new Date(log.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} — {new Date(log.logged_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                                  </span>
                                </div>
                                <p className="text-[#555555] font-semibold">
                                  {log.note}
                                </p>
                                {log.visitor_name && (
                                  <p className="text-[10px] text-slate-500 font-bold bg-slate-100 inline-block px-1.5 py-0.5 rounded">
                                    Visitor: {log.visitor_name} ({log.visitor_type})
                                  </p>
                                )}
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Action by: {log.logged_by}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

        {/* --- STANDALONE VISITOR LOG MODAL --- */}
        {showStandaloneModal && (
          <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
            <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs font-semibold text-[#1A1A1A]">
              <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Log Standalone Visitor
                </h3>
                <button
                  onClick={() => setShowStandaloneModal(false)}
                  className="text-slate-400 hover:text-[#1A1A1A] text-xs font-bold"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleStandaloneSubmit} className="space-y-4">
                
                {/* Branch Selection */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Branch</label>
                  <select
                    value={standaloneBranch}
                    onChange={e => setStandaloneBranch(e.target.value as any)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 cursor-pointer"
                  >
                    <option value="daily">Daily</option>
                    <option value="hypermarket">Hypermarket</option>
                  </select>
                </div>

                {/* Tech Name */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Technician / Visitor Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Ramesh Kumar"
                    value={standaloneName}
                    onChange={e => setStandaloneName(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500"
                    required
                  />
                </div>

                {/* Visitor Type */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Visitor Type</label>
                  <select
                    value={standaloneType}
                    onChange={e => setStandaloneType(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 cursor-pointer"
                  >
                    {VISITOR_TYPES.map(vt => (
                      <option key={vt.val} value={vt.val}>{vt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Purpose / Notes</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Routine monthly pest control walk through"
                    value={standaloneNote}
                    onChange={e => setStandaloneNote(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-semibold"
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="w-full py-3 bg-[#1A1A1A] hover:bg-[#333333] text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer mt-4 flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} />
                  <span>Log General Visitor</span>
                </button>

              </form>
            </div>
          </div>
        )}

        {/* --- LOG TECHNICIAN VISIT MODAL (ON TICKET) --- */}
        {showTechnicianModal && (
          <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
            <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs font-semibold text-[#1A1A1A]">
              <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Log Technician Visit
                </h3>
                <button
                  onClick={() => setShowTechnicianModal(false)}
                  className="text-slate-400 hover:text-[#1A1A1A] text-xs font-bold"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleTechnicianSubmit} className="space-y-4">
                
                {/* Tech Name */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Technician / Visitor Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Ramesh Kumar"
                    value={visitorName}
                    onChange={e => setVisitorName(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500"
                    required
                  />
                </div>

                {/* Visitor Type */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Visitor Type</label>
                  <select
                    value={visitorType}
                    onChange={e => setVisitorType(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 cursor-pointer"
                  >
                    {VISITOR_TYPES.map(vt => (
                      <option key={vt.val} value={vt.val}>{vt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Visit Note / Details</label>
                  <textarea
                    rows={3}
                    placeholder="Describe what the technician inspected, fixed, or proposed..."
                    value={actionNote}
                    onChange={e => setActionNote(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-semibold"
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="w-full py-3 bg-[#1A1A1A] hover:bg-[#333333] text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer mt-4 flex items-center justify-center gap-1.5"
                >
                  <UserCheck size={14} />
                  <span>Log Visit details</span>
                </button>

              </form>
            </div>
          </div>
        )}

        {/* --- ADD NOTE MODAL --- */}
        {showNoteModal && (
          <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
            <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs font-semibold text-[#1A1A1A]">
              <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Add Comment Note
                </h3>
                <button
                  onClick={() => setShowNoteModal(false)}
                  className="text-slate-400 hover:text-[#1A1A1A] text-xs font-bold"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleNoteSubmit} className="space-y-4">
                
                {/* Note */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Comment details</label>
                  <textarea
                    rows={3}
                    placeholder="Write audit details or progress update notes..."
                    value={actionNote}
                    onChange={e => setActionNote(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-semibold"
                    required
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="w-full py-3 bg-[#1A1A1A] hover:bg-[#333333] text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer mt-4 flex items-center justify-center gap-1.5"
                >
                  <MessageSquare size={14} />
                  <span>Save Note</span>
                </button>

              </form>
            </div>
          </div>
        )}

        {/* --- RESOLUTION FIXED NOTES MODAL --- */}
        {showFixedModal && (
          <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
            <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs font-semibold text-[#1A1A1A]">
              <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-600">
                  Resolve Ticket (Fixed)
                </h3>
                <button
                  onClick={() => { setShowFixedModal(false); setPendingStatusChange(null); }}
                  className="text-slate-400 hover:text-[#1A1A1A] text-xs font-bold"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleFixedSubmit} className="space-y-4">
                
                {/* Fixed Notes */}
                <div>
                  <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">What was fixed / done?</label>
                  <textarea
                    rows={3}
                    placeholder="Describe parts replaced, service work details or solutions..."
                    value={fixingNotes}
                    onChange={e => setFixingNotes(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-semibold"
                    required
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer mt-4 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle size={14} />
                  <span>Resolve & Close Ticket</span>
                </button>

              </form>
            </div>
          </div>
        )}

        {/* Toast alert display */}
        {toastMsg && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[25000] bg-[#EDF7EF] border border-[#2D7A3A] text-[#2D7A3A] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-1 animate-in fade-in">
            <CheckCircle size={14} className="text-[#2D7A3A]" />
            <span>{toastMsg}</span>
          </div>
        )}

      </div>
    </AppShell>
  );
}

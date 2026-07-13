'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { 
  Lock, 
  History, 
  Search, 
  Calendar, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw,
  Clock,
  Shield
} from 'lucide-react';
import AppShell from '@/components/AppShell';

interface StaffInfo {
  id: string;
  name: string;
  branch_id: string;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  performed_by: string;
  performed_by_role: string;
  staff_id: string | null;
  target_description: string | null;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
  created_at: string;
  staff?: StaffInfo | null;
}

const ACTION_TYPE_MAP: Record<string, string> = {
  salary_confirmed: 'Salary Confirmed',
  attendance_edited: 'Attendance Edited',
  ot_approved: 'OT Approved',
  ot_rejected: 'OT Rejected',
  fine_approved: 'Late Fine Approved',
  fine_rejected: 'Late Fine Rejected',
  staff_profile_edited: 'Staff Profile Edited',
  login_credentials_changed: 'Login Credentials Changed',
  resignation_initiated: 'Resignation Initiated',
  resignation_approved: 'Resignation Approved',
  resignation_settled: 'Resignation Settled',
  permission_changed: 'Permission Changed',
};

const ACTION_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  salary_confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  attendance_edited: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  ot_approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  ot_rejected: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  fine_approved: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  fine_rejected: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  staff_profile_edited: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  login_credentials_changed: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  resignation_initiated: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  resignation_approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  resignation_settled: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  permission_changed: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
};

export default function AuditHistoryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // State
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 15;

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [actionType, setActionType] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [staffFilter, setStaffFilter] = useState('all');
  
  // Staff list for filter
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);

  // Safety Role Guard Redirect
  useEffect(() => {
    if (!authLoading && user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  // Load staff list for filters
  useEffect(() => {
    if (authLoading || !user || user.role !== 'admin') return;

    const fetchStaff = async () => {
      try {
        const { data, error: err } = await supabase
          .from('staff')
          .select('id, name, branch_id')
          .order('name');
        if (err) throw err;
        setStaffList(data || []);
      } catch (e) {
        console.error('Error fetching staff list for filter:', e);
      }
    };

    fetchStaff();
  }, [user, authLoading]);

  // Fetch Logs
  const fetchLogs = useCallback(async () => {
    if (authLoading || !user || user.role !== 'admin') return;
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('audit_log')
        .select('*, staff:staff_id(id, name, branch_id)', { count: 'exact' });

      // Apply staff search
      if (searchQuery.trim()) {
        const { data: matchedStaff } = await supabase
          .from('staff')
          .select('id')
          .ilike('name', `%${searchQuery.trim()}%`);
        
        const ids = (matchedStaff || []).map(s => s.id);
        if (ids.length > 0) {
          query = query.in('staff_id', ids);
        } else {
          // Force empty result if search query doesn't match any staff
          query = query.eq('staff_id', '00000000-0000-0000-0000-000000000000');
        }
      }

      // Apply staff selection filter
      if (staffFilter !== 'all') {
        query = query.eq('staff_id', staffFilter);
      }

      // Apply action type filter
      if (actionType !== 'all') {
        query = query.eq('action_type', actionType);
      }

      // Apply performed by role filter
      if (roleFilter !== 'all') {
        query = query.eq('performed_by_role', roleFilter);
      }

      // Apply date range filters
      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate + 'T23:59:59.999Z');
      }

      // Sort and Paginate
      query = query
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      const { data, count, error: err } = await query;
      if (err) throw err;

      setLogs(data as unknown as AuditLogEntry[]);
      setTotalCount(count || 0);
    } catch (err: any) {
      console.error('Failed to fetch audit logs:', err);
      setError(err.message || 'Failed to load audit history logs.');
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, searchQuery, actionType, roleFilter, startDate, endDate, staffFilter, page]);

  // Trigger fetch when parameters change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setActionType('all');
    setRoleFilter('all');
    setStartDate('');
    setEndDate('');
    setStaffFilter('all');
    setPage(1);
  };

  const getActionLabel = (type: string) => {
    return ACTION_TYPE_MAP[type] || type.replace(/_/g, ' ').toUpperCase();
  };

  const getActionStyles = (type: string) => {
    return ACTION_COLOR_MAP[type] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
  };

  // Guard Loading State
  if (authLoading || (user && user.role !== 'admin')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center select-none bg-[#F8F9FA]">
        <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-8 max-w-sm w-full flex flex-col items-center shadow-lg transition-all">
          <Lock size={48} className="mb-4 text-slate-400 animate-pulse" />
          <h2 className="text-lg font-extrabold text-[#1A1A1A] mb-2 uppercase tracking-wide">Access Denied</h2>
          <p className="text-[#666666] text-xs font-semibold leading-relaxed mb-6">
            Only the Owner has permission to view the system change history and audit logs.
          </p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        
        {/* Header Block */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[20px] p-6 text-white shadow-md border border-slate-700/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.05),transparent)] pointer-events-none" />
          <div className="space-y-1 z-10">
            <div className="flex items-center gap-2 text-slate-300">
              <History size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Security Control</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-wider">Audit & Change History</h1>
            <p className="text-xs text-slate-400 font-medium">Trace administrative actions, permission changes, salary confirmations, and profile updates.</p>
          </div>
          <button 
            onClick={fetchLogs} 
            className="bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer z-10"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Reload Logs</span>
          </button>
        </div>

        {/* Filters and Control Board */}
        <div className="bg-white border border-[#EAEAEA] rounded-[20px] p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#F5F5F5] pb-3">
            <Filter size={16} className="text-slate-500" />
            <h2 className="text-xs font-extrabold uppercase text-slate-600 tracking-wider">Log Filter Controls</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            
            {/* Search staff */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Search Staff Name</label>
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                  className="w-full bg-[#F8F9FA] border border-[#EAEAEA] focus:border-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold text-[#1A1A1A] outline-none transition-all"
                />
              </div>
            </div>

            {/* Action Type Filter */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Action Type</label>
              <select 
                value={actionType}
                onChange={e => { setActionType(e.target.value); setPage(1); }}
                className="w-full bg-[#F8F9FA] border border-[#EAEAEA] focus:border-slate-500 rounded-xl py-2.5 px-3.5 text-xs font-bold text-[#1A1A1A] outline-none cursor-pointer"
              >
                <option value="all">All Actions</option>
                {Object.entries(ACTION_TYPE_MAP).map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
              </select>
            </div>

            {/* Staff Dropdown Filter */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Filter by Staff Profile</label>
              <select 
                value={staffFilter}
                onChange={e => { setStaffFilter(e.target.value); setPage(1); }}
                className="w-full bg-[#F8F9FA] border border-[#EAEAEA] focus:border-slate-500 rounded-xl py-2.5 px-3.5 text-xs font-bold text-[#1A1A1A] outline-none cursor-pointer"
              >
                <option value="all">All Staff Profiles</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.branch_id === 'daily' ? 'Daily' : 'Hypermarket'})</option>
                ))}
              </select>
            </div>

            {/* Performed By Role Filter */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Performed By Role</label>
              <select 
                value={roleFilter}
                onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
                className="w-full bg-[#F8F9FA] border border-[#EAEAEA] focus:border-slate-500 rounded-xl py-2.5 px-3.5 text-xs font-bold text-[#1A1A1A] outline-none cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="admin">Owner / Admin</option>
                <option value="ops_manager">Operations Manager</option>
                <option value="staff_executive">Staff Executive (HR)</option>
                <option value="system">System Job</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Start Date</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setPage(1); }}
                  className="w-full bg-[#F8F9FA] border border-[#EAEAEA] focus:border-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold text-[#1A1A1A] outline-none"
                />
              </div>
            </div>

            {/* End Date */}
            <div>
              <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">End Date</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setPage(1); }}
                  className="w-full bg-[#F8F9FA] border border-[#EAEAEA] focus:border-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold text-[#1A1A1A] outline-none"
                />
              </div>
            </div>

            {/* Reset Button */}
            <div className="flex items-end sm:col-span-2 md:col-span-1 lg:col-span-2">
              <button 
                onClick={handleResetFilters}
                className="w-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-[#1A1A1A] font-bold text-xs rounded-xl py-3 border border-slate-200 transition-all cursor-pointer text-center"
              >
                Reset All Filters
              </button>
            </div>

          </div>
        </div>

        {/* Results Block */}
        <div className="bg-white border border-[#EAEAEA] rounded-[20px] shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="animate-spin text-slate-600" size={32} />
              <p className="text-xs text-[#888888] font-bold tracking-wider uppercase">Loading audit entries...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-rose-600 font-semibold text-xs space-y-2">
              <p>{error}</p>
              <button 
                onClick={fetchLogs} 
                className="bg-rose-50 text-rose-600 px-4 py-2 rounded-xl border border-rose-200 hover:bg-rose-100 active:scale-95 text-xs font-bold transition-all cursor-pointer"
              >
                Try Again
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-24 text-center select-none text-slate-400 space-y-1.5">
              <History size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-black uppercase tracking-wider text-slate-600">No Change Logs Found</p>
              <p className="text-[10px] text-slate-400 font-semibold max-w-xs mx-auto">Try resetting or modifying your filter controls above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-[#F0F0F0]">
                    <th className="py-3.5 px-5 text-[9px] font-black uppercase text-slate-500 tracking-wider">Date & Time</th>
                    <th className="py-3.5 px-5 text-[9px] font-black uppercase text-slate-500 tracking-wider">Action Type</th>
                    <th className="py-3.5 px-5 text-[9px] font-black uppercase text-slate-500 tracking-wider">Performed By</th>
                    <th className="py-3.5 px-5 text-[9px] font-black uppercase text-slate-500 tracking-wider">Staff Involved</th>
                    <th className="py-3.5 px-5 text-[9px] font-black uppercase text-slate-500 tracking-wider">Summary Notes</th>
                    <th className="py-3.5 px-5 text-[9px] font-black uppercase text-slate-500 tracking-wider text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2F2F2]">
                  {logs.map((log) => {
                    const isExpanded = expandedRow === log.id;
                    const actionStyles = getActionStyles(log.action_type);
                    
                    return (
                      <React.Fragment key={log.id}>
                        {/* Normal Row */}
                        <tr 
                          onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                          className="hover:bg-slate-50/70 transition-all cursor-pointer align-middle text-xs font-bold text-[#1A1A1A]"
                        >
                          <td className="py-4 px-5 whitespace-nowrap text-[#555555]">
                            <div className="flex items-center gap-1.5">
                              <Clock size={12} className="text-slate-400" />
                              <span>{new Date(log.created_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</span>
                            </div>
                          </td>
                          <td className="py-4 px-5 whitespace-nowrap">
                            <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full border ${actionStyles.bg} ${actionStyles.text} ${actionStyles.border}`}>
                              {getActionLabel(log.action_type)}
                            </span>
                          </td>
                          <td className="py-4 px-5">
                            <div className="flex flex-col">
                              <span className="text-[#1A1A1A] font-extrabold">{log.performed_by.split('@')[0]}</span>
                              <span className="text-[9px] font-bold text-[#888888] uppercase tracking-wider">{log.performed_by_role}</span>
                            </div>
                          </td>
                          <td className="py-4 px-5 whitespace-nowrap text-[#333333]">
                            {log.staff ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-black text-slate-600 border border-slate-200">
                                  {log.staff.name.charAt(0)}
                                </div>
                                <div className="flex flex-col">
                                  <span>{log.staff.name}</span>
                                  <span className="text-[8px] font-black text-[#999999] uppercase tracking-widest">{log.staff.branch_id === 'daily' ? 'Daily' : 'Hypermarket'}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-semibold">—</span>
                            )}
                          </td>
                          <td className="py-4 px-5 max-w-xs truncate text-[#666666] font-semibold">
                            {log.notes || log.target_description || '—'}
                          </td>
                          <td className="py-4 px-5 text-right whitespace-nowrap">
                            <div className="text-slate-500 hover:text-[#1A1A1A] active:scale-90 transition-all p-1 flex justify-end">
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Detail Panel */}
                        {isExpanded && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={6} className="py-4 px-6 border-b border-[#EAEAEA]">
                              <div className="bg-white border border-[#EBEBEB] rounded-xl p-5 shadow-inner space-y-4 max-w-4xl mx-auto">
                                <div className="flex items-center gap-2 border-b border-[#F5F5F5] pb-2 text-[#1A1A1A]">
                                  <Shield size={14} className="text-slate-500" />
                                  <h3 className="text-xs font-black uppercase tracking-wider">Audit Record Breakdown</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-semibold">
                                  
                                  {/* Info Blocks */}
                                  <div className="space-y-3">
                                    <div>
                                      <span className="block text-[8px] font-black text-[#999999] uppercase tracking-wider mb-0.5">Performed By</span>
                                      <p className="text-slate-800 font-bold">{log.performed_by} <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 rounded px-1 py-0.5 font-bold uppercase ml-1.5">{log.performed_by_role}</span></p>
                                    </div>
                                    {log.target_description && (
                                      <div>
                                        <span className="block text-[8px] font-black text-[#999999] uppercase tracking-wider mb-0.5">Target Description</span>
                                        <p className="text-slate-800 font-bold">{log.target_description}</p>
                                      </div>
                                    )}
                                    {log.notes && (
                                      <div>
                                        <span className="block text-[8px] font-black text-[#999999] uppercase tracking-wider mb-0.5">Detailed Notes</span>
                                        <p className="text-slate-800 font-bold leading-relaxed">{log.notes}</p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Before -> After Blocks */}
                                  <div className="space-y-3">
                                    {(log.old_value || log.new_value) ? (
                                      <div className="bg-[#FAFBFB] border border-[#EDEDED] rounded-xl p-4 space-y-3">
                                        {log.old_value && (
                                          <div>
                                            <span className="block text-[8px] font-black text-rose-500 uppercase tracking-wider mb-1">Previous / Old Value</span>
                                            <pre className="text-[10px] bg-white border border-[#F0F0F0] rounded-lg p-2.5 overflow-x-auto font-mono text-slate-700 whitespace-pre-wrap leading-relaxed shadow-sm">
                                              {log.old_value}
                                            </pre>
                                          </div>
                                        )}
                                        {log.new_value && (
                                          <div>
                                            <span className="block text-[8px] font-black text-emerald-600 uppercase tracking-wider mb-1">New / Updated Value</span>
                                            <pre className="text-[10px] bg-white border border-[#F0F0F0] rounded-lg p-2.5 overflow-x-auto font-mono text-slate-700 whitespace-pre-wrap leading-relaxed shadow-sm">
                                              {log.new_value}
                                            </pre>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="h-full flex items-center justify-center p-4 border border-dashed border-slate-200 rounded-xl text-slate-400 italic">
                                        No value differences logged for this action type.
                                      </div>
                                    )}
                                  </div>

                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="bg-slate-50 border-t border-[#F0F0F0] py-3.5 px-5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Showing page <span className="font-extrabold text-[#1A1A1A]">{page}</span> of <span className="font-extrabold text-[#1A1A1A]">{totalPages}</span> ({totalCount} entries)
              </span>
              <div className="flex gap-2">
                <button 
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  className="bg-white border border-[#E5E5E5] hover:bg-slate-50 active:scale-95 disabled:opacity-50 text-[#1A1A1A] font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  Previous
                </button>
                <button 
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  className="bg-white border border-[#E5E5E5] hover:bg-slate-50 active:scale-95 disabled:opacity-50 text-[#1A1A1A] font-bold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}

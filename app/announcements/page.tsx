'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createAuditLog } from '@/lib/audit';
import { Megaphone, Users, User, CheckCircle, Clock, AlertCircle, Plus, Eye, ChevronRight, X, ArrowLeft, Send, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface Staff {
  id: string;
  name: string;
  department: string;
  branch_id: string;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  target: 'all' | 'daily' | 'hypermarket';
  target_staff_id: string | null;
  is_important: boolean;
  show_on_kiosk: boolean;
  created_by: string;
  created_at: string;
}

interface ReadReceipt {
  staff_id: string;
  name: string;
  department: string;
  branch_id: string;
  read: boolean;
  read_on_kiosk: boolean;
  read_at: string | null;
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'daily' | 'hypermarket' | 'specific'>('all');
  const [targetStaffId, setTargetStaffId] = useState('');
  const [isImportant, setIsImportant] = useState(false);
  const [showOnKiosk, setShowOnKiosk] = useState(false);

  // Selected announcement for receipts
  const [selectedAnn, setSelectedAnn] = useState<Announcement | null>(null);
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [readCountForWarning, setReadCountForWarning] = useState(0);
  const [receipts, setReceipts] = useState<ReadReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const fetchAnnouncements = async () => {
    try {
      const { data: annData, error: annErr } = await supabase
        .from('staff_announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (annErr) throw annErr;
      setAnnouncements(annData || []);

      const { data: staffData, error: staffErr } = await supabase
        .from('staff')
        .select('id, name, department, branch_id')
        .eq('active', true)
        .order('name');

      if (staffErr) throw staffErr;
      setStaffList(staffData || []);
    } catch (err) {
      console.error('Error fetching announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !message.trim()) return;

    setSubmitting(true);
    try {
      const targetVal = targetType === 'specific' ? 'all' : targetType;
      const staffIdVal = targetType === 'specific' ? targetStaffId : null;

      const { data: newAnn, error } = await supabase
        .from('staff_announcements')
        .insert({
          title: title.trim(),
          message: message.trim(),
          target: targetVal,
          target_staff_id: staffIdVal,
          is_important: isImportant,
          show_on_kiosk: showOnKiosk,
          created_by: user.name || user.email || 'Operations Manager'
        })
        .select()
        .single();

      if (error) throw error;

      await createAuditLog({
        action: 'create',
        table_name: 'staff_announcements',
        record_id: newAnn.id,
        new_value: { title: title.trim(), target: targetVal, is_important: isImportant, show_on_kiosk: showOnKiosk },
        performed_by: user.email,
        performed_by_role: user.role,
        reason: `Created announcement "${title.trim()}"`
      });

      // Insert notifications for targeted users
      const formattedTitle = isImportant ? `⚠️ IMPORTANT: ${title.trim()}` : title.trim();
      const notificationPayload: any[] = [];
      
      const targets = staffList.filter(s => {
        if (targetType === 'all') return true;
        if (targetType === 'daily') return s.branch_id === 'daily';
        if (targetType === 'hypermarket') return s.branch_id === 'hypermarket';
        if (targetType === 'specific') return s.id === targetStaffId;
        return false;
      });

      targets.forEach(s => {
        notificationPayload.push({
          type: 'salary_confirmed', // Use general notification type
          title: formattedTitle,
          message: message.trim().substring(0, 100),
          branch_id: s.branch_id,
          staff_id: s.id,
          target_role: 'all',
          is_read: false
        });
      });

      if (notificationPayload.length > 0) {
        await supabase.from('notifications').insert(notificationPayload);
      }

      setToastMsg('Announcement posted successfully ✓');
      setTimeout(() => setToastMsg(''), 3000);

      // Reset form
      setTitle('');
      setMessage('');
      setTargetType('all');
      setTargetStaffId('');
      setIsImportant(false);
      setShowOnKiosk(false);
      setShowCreateForm(false);
      fetchAnnouncements();
    } catch (err) {
      console.error('Error creating announcement:', err);
      alert('Failed to post announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = async (ann: Announcement) => {
    try {
      const { count, error } = await supabase
        .from('announcement_reads')
        .select('*', { count: 'exact', head: true })
        .eq('announcement_id', ann.id);
      if (!error && count !== null) {
        setReadCountForWarning(count);
      } else {
        setReadCountForWarning(0);
      }
    } catch (e) {
      console.error(e);
      setReadCountForWarning(0);
    }

    setEditingAnn(ann);
    setTitle(ann.title);
    setMessage(ann.message);
    if (ann.target_staff_id) {
      setTargetType('specific');
      setTargetStaffId(ann.target_staff_id);
    } else {
      setTargetType(ann.target as any);
      setTargetStaffId('');
    }
    setIsImportant(ann.is_important);
    setShowOnKiosk(ann.show_on_kiosk);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingAnn || !title.trim() || !message.trim()) return;

    setSubmitting(true);
    try {
      const targetVal = targetType === 'specific' ? 'all' : targetType;
      const staffIdVal = targetType === 'specific' ? targetStaffId : null;

      const { error } = await supabase
        .from('staff_announcements')
        .update({
          title: title.trim(),
          message: message.trim(),
          target: targetVal,
          target_staff_id: staffIdVal,
          is_important: isImportant,
          show_on_kiosk: showOnKiosk
        })
        .eq('id', editingAnn.id);

      if (error) throw error;

      await createAuditLog({
        action: 'update',
        table_name: 'staff_announcements',
        record_id: editingAnn.id,
        new_value: { title: title.trim(), target: targetVal, is_important: isImportant, show_on_kiosk: showOnKiosk },
        performed_by: user.email,
        performed_by_role: user.role,
        reason: `Updated announcement "${title.trim()}"`
      });

      setToastMsg('Announcement updated successfully ✓');
      setTimeout(() => setToastMsg(''), 3000);

      // Reset states
      setEditingAnn(null);
      setTitle('');
      setMessage('');
      setTargetType('all');
      setTargetStaffId('');
      setIsImportant(false);
      setShowOnKiosk(false);
      
      fetchAnnouncements();
    } catch (err) {
      console.error('Error updating announcement:', err);
      alert('Failed to update announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const annToDelete = announcements.find(a => a.id === id);
    if (!annToDelete) return;
    if (!confirm('Are you sure you want to delete this announcement? This will also delete all associated read receipt records.')) return;
    try {
      // 1. Delete read receipts
      const { error: readsErr } = await supabase
        .from('announcement_reads')
        .delete()
        .eq('announcement_id', id);
      if (readsErr) throw readsErr;

      // 2. Delete announcement
      const { error: annErr } = await supabase
        .from('staff_announcements')
        .delete()
        .eq('id', id);
      if (annErr) throw annErr;

      await createAuditLog({
        action: 'delete',
        table_name: 'staff_announcements',
        record_id: id,
        new_value: null,
        performed_by: user.email,
        performed_by_role: user.role,
        reason: `Deleted announcement "${annToDelete.title}"`
      });

      setToastMsg('Announcement and read receipts deleted ✓');
      setTimeout(() => setToastMsg(''), 3000);
      
      if (selectedAnn?.id === id) {
        setSelectedAnn(null);
      }
      fetchAnnouncements();
    } catch (err) {
      console.error('Error deleting announcement:', err);
      alert('Failed to delete announcement.');
    }
  };

  const loadReceipts = async (ann: Announcement) => {
    setSelectedAnn(ann);
    setLoadingReceipts(true);
    try {
      const { data: readData, error } = await supabase
        .from('announcement_reads')
        .select('*')
        .eq('announcement_id', ann.id);

      if (error) throw error;

      const readMap = new Map(readData?.map(r => [r.staff_id, r]) || []);

      // Filter staff list based on announcement targets
      const targetStaff = staffList.filter(s => {
        if (ann.target_staff_id) {
          return s.id === ann.target_staff_id;
        }
        if (ann.target === 'all') return true;
        return s.branch_id === ann.target;
      });

      const mergedReceipts: ReadReceipt[] = targetStaff.map(s => {
        const readLog = readMap.get(s.id);
        return {
          staff_id: s.id,
          name: s.name,
          department: s.department,
          branch_id: s.branch_id,
          read: !!readLog,
          read_on_kiosk: readLog ? !!readLog.read_on_kiosk : false,
          read_at: readLog ? readLog.read_at : null
        };
      });

      // Sort: Unread first, then read time desc
      mergedReceipts.sort((a, b) => {
        if (a.read === b.read) {
          if (a.read_at && b.read_at) {
            return new Date(b.read_at).getTime() - new Date(a.read_at).getTime();
          }
          return a.name.localeCompare(b.name);
        }
        return a.read ? 1 : -1;
      });

      setReceipts(mergedReceipts);
    } catch (e) {
      console.error('Error loading receipts:', e);
    } finally {
      setLoadingReceipts(false);
    }
  };

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Daily' : 'Hypermarket';
  };

  const getTargetLabel = (ann: Announcement) => {
    if (ann.target_staff_id) {
      const st = staffList.find(s => s.id === ann.target_staff_id);
      return st ? `Specific: ${st.name}` : 'Specific Staff';
    }
    if (ann.target === 'all') return 'All Staff';
    return ann.target === 'daily' ? 'Daily branch' : 'Hypermarket branch';
  };

  // Security check: Owner/Ops Manager/HR only
  const isAuthorized = user?.role === 'admin' || user?.role === 'ops_manager' || user?.role === 'staff_executive';

  if (!isAuthorized) {
    return (
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 text-center max-w-sm mx-auto my-8 flex flex-col items-center justify-center shadow-sm">
        <h3 className="text-base font-bold text-[#1A1A1A] mb-1">Access Denied</h3>
        <p className="text-xs text-[var(--text-muted)]">Only administrators and Operations Managers can access this dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[#E8E8E8] pb-4">
        <div className="flex items-center space-x-2">
          <Link href="/dashboard" className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-black transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#1A1A1A]">Announcements Center</h1>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">Publish management news and monitor read receipts.</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow active:scale-95 transition-all cursor-pointer"
        >
          {showCreateForm ? <X size={14} /> : <Plus size={14} />}
          <span>{showCreateForm ? 'Close Form' : 'New Post'}</span>
        </button>
      </div>

      {/* Post form */}
      {showCreateForm && (
        <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-5 shadow-md space-y-4 animate-in slide-in-from-top-4 duration-200">
          <h3 className="text-sm font-extrabold text-[#1A1A1A] border-b border-[#E8E8E8] pb-2">Create New Announcement</h3>
          <form onSubmit={handleCreate} className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Important Branch Meeting Tomorrow"
                className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-black text-[#1A1A1A]"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Message Body</label>
              <textarea
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Type the message contents..."
                className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-black text-[#1A1A1A] resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Target Audience</label>
                <select
                  value={targetType}
                  onChange={e => setTargetType(e.target.value as any)}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold focus:outline-none text-[#1A1A1A]"
                >
                  <option value="all">All Branches</option>
                  <option value="daily">Nearbi Daily Branch</option>
                  <option value="hypermarket">Nearbi Hypermarket Branch</option>
                  <option value="specific">Specific Staff Member</option>
                </select>
              </div>

              {targetType === 'specific' && (
                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Select Staff Member</label>
                  <select
                    value={targetStaffId}
                    onChange={e => setTargetStaffId(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold focus:outline-none text-[#1A1A1A]"
                    required
                  >
                    <option value="">Choose staff...</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({getBranchLabel(s.branch_id)})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-col space-y-2 border-t border-[#E8E8E8] pt-3">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isImportant}
                  onChange={e => setIsImportant(e.target.checked)}
                  className="rounded border-[#E8E8E8] text-[#1A1A1A] focus:ring-0"
                />
                <span className="font-semibold text-gray-700">Important (Enforce acknowledgment popup on staff portal)</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOnKiosk}
                  onChange={e => setShowOnKiosk(e.target.checked)}
                  className="rounded border-[#E8E8E8] text-[#1A1A1A] focus:ring-0"
                />
                <span className="font-semibold text-gray-700">Display on Kiosk (Forced check-in acknowledgment overlay)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] bg-[#1A1A1A] hover:bg-black text-white font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow"
            >
              <Send size={14} />
              <span>{submitting ? 'Posting...' : 'Publish Announcement'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Main split dashboard view */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        
        {/* Left side: list of announcements */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">Posted Announcements</h3>

          {loading ? (
            <div className="space-y-2.5">
              <div className="skeleton h-[80px] w-full" />
              <div className="skeleton h-[80px] w-full" />
            </div>
          ) : announcements.length === 0 ? (
            <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 text-center text-xs text-[var(--text-muted)] italic shadow-sm">
              No announcements posted yet. Click 'New Post' above to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map(ann => {
                const isSelected = selectedAnn?.id === ann.id;
                return (
                  <div
                    key={ann.id}
                    className={`bg-white border rounded-[14px] p-4 flex flex-col space-y-2.5 shadow-sm transition-all ${
                      isSelected ? 'border-black ring-1 ring-black' : 'border-[#E8E8E8] hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="bg-[#F2F2F2] border border-[#E8E8E8] text-[#555555] text-[9px] font-bold px-1.5 py-0.5 rounded">
                          {getTargetLabel(ann)}
                        </span>
                        {ann.is_important && (
                          <span className="bg-red-50 text-red-500 border border-red-200/50 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                            Important
                          </span>
                        )}
                        {ann.show_on_kiosk && (
                          <span className="bg-blue-50 text-blue-500 border border-blue-200/50 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                            Kiosk
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-[var(--text-muted)] font-semibold">
                        {new Date(ann.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-sm text-[#1A1A1A] leading-tight">{ann.title}</h4>
                      <p className="text-xs text-gray-600 font-medium leading-relaxed mt-1 line-clamp-2">{ann.message}</p>
                    </div>

                    <div className="flex justify-between items-center border-t border-[#F0F0F0] pt-2 mt-1">
                      <span className="text-[9.5px] text-[var(--text-muted)] font-semibold">Posted by {ann.created_by.split('@')[0]}</span>
                      <div className="flex items-center space-x-3.5">
                        <button
                          onClick={() => loadReceipts(ann)}
                          className="text-[#1A5FA8] hover:text-[#134478] text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
                        >
                          <Eye size={12} />
                          <span>Read Receipts</span>
                        </button>
                        {(() => {
                          const isCreator = ann.created_by === user?.name || ann.created_by === user?.email;
                          const canEditDelete = user?.role === 'admin' || user?.role === 'ops_manager' || (user?.role === 'staff_executive' && isCreator);
                          return canEditDelete && (
                            <>
                              <button
                                onClick={() => startEdit(ann)}
                                className="text-gray-500 hover:text-black transition-colors flex items-center gap-0.5 cursor-pointer"
                                title="Edit"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => handleDelete(ann.id)}
                                className="text-[var(--danger)] hover:text-[#A93226] transition-colors flex items-center gap-0.5 cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right side: Read Receipts details */}
        <div>
          {selectedAnn ? (
            <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-5 shadow-md space-y-4">
              <div className="flex justify-between items-start border-b border-[#E8E8E8] pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-[#1A1A1A]">Read Receipts</h3>
                  <p className="text-[9.5px] text-[var(--text-muted)] font-bold uppercase mt-0.5 tracking-wider truncate max-w-[200px]" title={selectedAnn.title}>
                    {selectedAnn.title}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedAnn(null)}
                  className="p-1 text-gray-400 hover:text-black rounded-full hover:bg-gray-150 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {loadingReceipts ? (
                <div className="py-8 flex justify-center items-center">
                  <Clock className="animate-spin text-gray-300" size={24} />
                </div>
              ) : (
                <div className="space-y-4 text-xs font-semibold text-[#555555]">
                  {/* Summary Counters */}
                  {(() => {
                    const readCount = receipts.filter(r => r.read).length;
                    const totalCount = receipts.length;
                    const percent = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;
                    return (
                      <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 grid grid-cols-3 gap-2.5 text-center font-bold">
                        <div>
                          <span className="text-[20px] text-[#1A1A1A] font-black">{readCount}</span>
                          <span className="text-[8.5px] text-[var(--text-muted)] uppercase block tracking-wider mt-0.5">Read</span>
                        </div>
                        <div>
                          <span className="text-[20px] text-gray-400 font-black">{totalCount - readCount}</span>
                          <span className="text-[8.5px] text-[var(--text-muted)] uppercase block tracking-wider mt-0.5">Unread</span>
                        </div>
                        <div>
                          <span className="text-[20px] text-[#2D7A3A] font-black">{percent}%</span>
                          <span className="text-[8.5px] text-[var(--text-muted)] uppercase block tracking-wider mt-0.5">Coverage</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* List of Receipts */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {receipts.map(rec => (
                      <div
                        key={rec.staff_id}
                        className="bg-gray-50/50 border border-gray-100 rounded-xl p-2.5 flex items-center justify-between text-[11px]"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-[#1A1A1A] block truncate">{rec.name}</span>
                          <span className="text-[9.5px] text-[var(--text-muted)] block truncate leading-none mt-0.5">
                            {rec.department} • {getBranchLabel(rec.branch_id)}
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {rec.read ? (
                            <div className="flex flex-col items-end">
                              <span className="bg-[#EDF7EF] text-[#2D7A3A] border border-[#C3E6CB]/20 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 uppercase leading-none">
                                <CheckCircle size={8} fill="currentColor" />
                                <span>Read ({rec.read_on_kiosk ? 'Kiosk' : 'Portal'})</span>
                              </span>
                              {rec.read_at && (
                                <span className="text-[8px] text-[var(--text-muted)] mt-1 font-bold">
                                  {new Date(rec.read_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="bg-gray-100 text-gray-400 border border-gray-200 text-[9px] font-black px-1.5 py-0.5 rounded uppercase leading-none">
                              Unread
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-[#E8E8E8] border-dashed rounded-[16px] p-8 text-center flex flex-col items-center justify-center min-h-[200px] shadow-sm select-none">
              <Megaphone size={40} className="text-gray-300 mb-2" />
              <h4 className="text-xs font-bold text-[#1A1A1A]">No Receipts Loaded</h4>
              <p className="text-[10px] text-[var(--text-muted)] mt-1 max-w-[200px]">
                Click 'Read Receipts' on any announcement card to view detailed read coverage.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Edit Announcement Modal */}
      {editingAnn && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-lg w-full p-6 flex flex-col space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-[#1A1A1A] text-base font-bold">Edit Announcement</h3>
              <button
                type="button"
                onClick={() => setEditingAnn(null)}
                className="text-[#999999] hover:text-[#1A1A1A] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="space-y-3.5 text-xs">
              {readCountForWarning > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs font-semibold leading-relaxed">
                  ⚠️ {readCountForWarning} staff already read this. They won't be re-notified of the edit.
                </div>
              )}
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Important Branch Meeting Tomorrow"
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-black text-[#1A1A1A]"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Message Body</label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Type the message contents..."
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-semibold focus:outline-none focus:border-black text-[#1A1A1A] resize-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Target Audience</label>
                  <select
                    value={targetType}
                    onChange={e => setTargetType(e.target.value as any)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold focus:outline-none text-[#1A1A1A]"
                  >
                    <option value="all">All Branches</option>
                    <option value="daily">Nearbi Daily Branch</option>
                    <option value="hypermarket">Nearbi Hypermarket Branch</option>
                    <option value="specific">Specific Staff Member</option>
                  </select>
                </div>

                {targetType === 'specific' && (
                  <div>
                    <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Select Staff Member</label>
                    <select
                      value={targetStaffId}
                      onChange={e => setTargetStaffId(e.target.value)}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold focus:outline-none text-[#1A1A1A]"
                      required
                    >
                      <option value="">Choose staff...</option>
                      {staffList.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({getBranchLabel(s.branch_id)})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex flex-col space-y-2 border-t border-[#E8E8E8] pt-3">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isImportant}
                    onChange={e => setIsImportant(e.target.checked)}
                    className="rounded border-[#E8E8E8] text-[#1A1A1A] focus:ring-0"
                  />
                  <span className="font-semibold text-gray-700">Important (Enforce acknowledgment popup on staff portal)</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showOnKiosk}
                    onChange={e => setShowOnKiosk(e.target.checked)}
                    className="rounded border-[#E8E8E8] text-[#1A1A1A] focus:ring-0"
                  />
                  <span className="font-semibold text-gray-700">Display on Kiosk (Forced check-in acknowledgment overlay)</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAnn(null)}
                  className="flex-1 min-h-[40px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 min-h-[40px] bg-[#1A1A1A] text-white hover:bg-black font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  {submitting ? 'Updating...' : 'Update Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Toast Alert */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-black text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

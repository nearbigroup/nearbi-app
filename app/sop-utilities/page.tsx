'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createAuditLog } from '@/lib/audit';
import { 
  Phone, 
  Lightbulb, 
  Award, 
  Trash2, 
  Plus, 
  X, 
  Search, 
  Filter, 
  Calendar, 
  ShieldAlert, 
  MessageSquare,
  Award as AwardIcon,
  HelpCircle,
  AlertTriangle,
  FileText,
  User,
  Clock,
  Sparkles,
  ArrowLeft,
  CheckCircle,
  ClipboardList
} from 'lucide-react';
import Link from 'next/link';

export default function SopUtilitiesDashboard() {
  const { user } = useAuth();
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'contacts' | 'lost_found' | 'renewals' | 'suggestions' | 'recognition'>('contacts');
  
  // Global States
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [toastMsg, setToastMsg] = useState('');

  // 1. Contacts Directory States
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactType, setContactType] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactBranch, setContactBranch] = useState<string>(''); // empty = global
  const [contactNotes, setContactNotes] = useState('');
  const [contactDisplayOrder, setContactDisplayOrder] = useState('0');

  // 2. Lost & Found States
  const [lostFoundItems, setLostFoundItems] = useState<any[]>([]);
  const [lostFoundModalOpen, setLostFoundModalOpen] = useState(false);
  const [lfDescription, setLfDescription] = useState('');
  const [lfBranch, setLfBranch] = useState('hypermarket');
  const [lfFoundBy, setLfFoundBy] = useState('');
  const [lfFoundDate, setLfFoundDate] = useState(new Date().toISOString().split('T')[0]);
  const [lfPhotoUrl, setLfPhotoUrl] = useState('');
  // Filter states
  const [lfFilterStatus, setLfFilterStatus] = useState<string>('all');
  const [lfFilterBranch, setLfFilterBranch] = useState<string>('all');
  // Claim states
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimingItem, setClaimingItem] = useState<any | null>(null);
  const [claimName, setClaimName] = useState('');
  const [claimPhone, setClaimPhone] = useState('');

  // 3. Compliance Renewals States
  const [renewals, setRenewals] = useState<any[]>([]);
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const [editingRenewal, setEditingRenewal] = useState<any | null>(null);
  const [renewalItemName, setRenewalItemName] = useState('');
  const [renewalType, setRenewalType] = useState<'fire_extinguisher' | 'weighing_scale' | 'pest_control' | 'fssai_license' | 'other'>('other');
  const [renewalLastService, setRenewalLastService] = useState('');
  const [renewalNextDue, setRenewalNextDue] = useState('');
  const [renewalReminderDays, setRenewalReminderDays] = useState('30');
  const [renewalBranch, setRenewalBranch] = useState('hypermarket');
  const [renewalNotes, setRenewalNotes] = useState('');

  // 4. Staff Suggestions States
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<any | null>(null);
  const [sugStatus, setSugStatus] = useState<'new' | 'reviewed' | 'implemented' | 'declined'>('reviewed');
  const [sugResponseText, setSugResponseText] = useState('');
  const [submittingResponse, setSubmittingResponse] = useState(false);

  // 5. Recognition System States
  const [recognitionList, setRecognitionList] = useState<any[]>([]);
  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [awardStaffId, setAwardStaffId] = useState('');
  const [awardType, setAwardType] = useState('Employee of the Week');
  const [awardPeriod, setAwardPeriod] = useState('');
  const [awardNote, setAwardNote] = useState('');
  const [submittingAward, setSubmittingAward] = useState(false);
  // Filters
  const [recFilterStaff, setRecFilterStaff] = useState('');
  const [recFilterBranch, setRecFilterBranch] = useState('all');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      // Load Staff
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, name, department, branch_id')
        .eq('active', true)
        .order('name');
      if (staffData) setStaffList(staffData);

      // 1. Load Emergency Contacts
      const { data: contactsData } = await supabase
        .from('emergency_contacts_directory')
        .select('*')
        .order('display_order');
      if (contactsData) setContacts(contactsData);

      // 2. Load Lost & Found Items
      const { data: lfData } = await supabase
        .from('lost_and_found')
        .select('*, found_by_staff:staff(name)')
        .order('found_date', { ascending: false });
      if (lfData) setLostFoundItems(lfData);

      // 3. Load Compliance Renewals
      const { data: renewalsData } = await supabase
        .from('compliance_renewals')
        .select('*')
        .order('next_due_date');
      if (renewalsData) setRenewals(renewalsData);

      // 4. Load Staff Suggestions
      const { data: suggestionsData } = await supabase
        .from('staff_suggestions')
        .select('*, staff:staff_id(name, department, branch_id)')
        .order('submitted_at', { ascending: false });
      if (suggestionsData) setSuggestions(suggestionsData);

      // 5. Load Recognitions History
      const { data: recData } = await supabase
        .from('staff_recognition')
        .select('*, staff:staff_id(name, department, branch_id)')
        .order('awarded_at', { ascending: false });
      if (recData) setRecognitionList(recData);

    } catch (e) {
      console.error('Failed loading SOP utilities data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // --- 1. EMERGENCY CONTACTS ACTIONS ---
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactType.trim() || !contactPhone.trim()) return;
    try {
      const payload = {
        contact_name: contactName.trim(),
        contact_type: contactType.trim(),
        phone_number: contactPhone.trim(),
        notes: contactNotes.trim() || null,
        branch_id: contactBranch || null,
        display_order: parseInt(contactDisplayOrder) || 0
      };

      if (editingContact) {
        const { error } = await supabase
          .from('emergency_contacts_directory')
          .update(payload)
          .eq('id', editingContact.id);
        if (error) throw error;
        showToast('Contact updated successfully ✓');
      } else {
        const { error } = await supabase
          .from('emergency_contacts_directory')
          .insert(payload);
        if (error) throw error;
        showToast('Contact added successfully ✓');
      }

      setContactModalOpen(false);
      setEditingContact(null);
      // reset
      setContactName('');
      setContactType('');
      setContactPhone('');
      setContactBranch('');
      setContactNotes('');
      setContactDisplayOrder('0');

      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to save contact.');
    }
  };

  const handleEditContact = (c: any) => {
    setEditingContact(c);
    setContactName(c.contact_name);
    setContactType(c.contact_type);
    setContactPhone(c.phone_number);
    setContactBranch(c.branch_id || '');
    setContactNotes(c.notes || '');
    setContactDisplayOrder(String(c.display_order || 0));
    setContactModalOpen(true);
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      const { error } = await supabase
        .from('emergency_contacts_directory')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Contact deleted ✓');
      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to delete contact.');
    }
  };

  // --- 2. LOST & FOUND ACTIONS ---
  const handleSaveLostFound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lfDescription.trim()) return;
    try {
      const payload = {
        item_description: lfDescription.trim(),
        branch_id: lfBranch,
        found_by: lfFoundBy || null,
        found_date: lfFoundDate,
        photo_url: lfPhotoUrl.trim() || null,
        status: 'unclaimed'
      };

      const { error } = await supabase
        .from('lost_and_found')
        .insert(payload);
      if (error) throw error;

      showToast('Found item logged successfully ✓');
      setLostFoundModalOpen(false);
      setLfDescription('');
      setLfFoundBy('');
      setLfPhotoUrl('');
      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to log found item.');
    }
  };

  const handleOpenClaimModal = (item: any) => {
    setClaimingItem(item);
    setClaimName('');
    setClaimPhone('');
    setClaimModalOpen(true);
  };

  const handleConfirmClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimingItem || !claimName.trim() || !claimPhone.trim()) return;
    try {
      const { error } = await supabase
        .from('lost_and_found')
        .update({
          status: 'claimed',
          claimed_by_name: claimName.trim(),
          claimed_by_phone: claimPhone.trim(),
          claimed_at: new Date().toISOString()
        })
        .eq('id', claimingItem.id);
      if (error) throw error;

      showToast('Item marked as claimed ✓');
      setClaimModalOpen(false);
      setClaimingItem(null);
      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to mark item as claimed.');
    }
  };

  const handleDisposeItem = async (id: string) => {
    if (!confirm('Mark this item as disposed? This action is permanent.')) return;
    try {
      const { error } = await supabase
        .from('lost_and_found')
        .update({
          status: 'disposed',
          claimed_at: new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      showToast('Item marked as disposed ✓');
      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to dispose item.');
    }
  };

  // --- 3. COMPLIANCE RENEWALS ACTIONS ---
  const handleSaveRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewalItemName.trim() || !renewalNextDue) return;
    try {
      const payload = {
        item_name: renewalItemName.trim(),
        renewal_type: renewalType,
        last_service_date: renewalLastService || null,
        next_due_date: renewalNextDue,
        reminder_days_before: parseInt(renewalReminderDays) || 30,
        branch_id: renewalBranch,
        notes: renewalNotes.trim() || null
      };

      if (editingRenewal) {
        const { error } = await supabase
          .from('compliance_renewals')
          .update(payload)
          .eq('id', editingRenewal.id);
        if (error) throw error;
        showToast('Renewal updated ✓');
      } else {
        const { error } = await supabase
          .from('compliance_renewals')
          .insert(payload);
        if (error) throw error;
        showToast('Renewal added ✓');
      }

      setRenewalModalOpen(false);
      setEditingRenewal(null);
      setRenewalItemName('');
      setRenewalNextDue('');
      setRenewalLastService('');
      setRenewalNotes('');

      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to save renewal.');
    }
  };

  const handleEditRenewal = (r: any) => {
    setEditingRenewal(r);
    setRenewalItemName(r.item_name);
    setRenewalType(r.renewal_type);
    setRenewalLastService(r.last_service_date || '');
    setRenewalNextDue(r.next_due_date);
    setRenewalReminderDays(String(r.reminder_days_before || 30));
    setRenewalBranch(r.branch_id);
    setRenewalNotes(r.notes || '');
    setRenewalModalOpen(true);
  };

  const handleDeleteRenewal = async (id: string) => {
    if (!confirm('Are you sure you want to delete this renewal alert?')) return;
    try {
      const { error } = await supabase
        .from('compliance_renewals')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Renewal alert deleted ✓');
      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to delete renewal.');
    }
  };

  // --- 4. STAFF SUGGESTIONS ACTIONS ---
  const handleOpenResponseModal = (sug: any) => {
    setSelectedSuggestion(sug);
    setSugStatus(sug.status);
    setSugResponseText(sug.ops_response || '');
    setResponseModalOpen(true);
  };

  const handleSaveSuggestionResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSuggestion) return;
    setSubmittingResponse(true);
    try {
      const { error } = await supabase
        .from('staff_suggestions')
        .update({
          status: sugStatus,
          ops_response: sugResponseText.trim() || null
        })
        .eq('id', selectedSuggestion.id);

      if (error) throw error;
      showToast('Suggestion reviewed successfully ✓');
      setResponseModalOpen(false);
      setSelectedSuggestion(null);
      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to update suggestion response.');
    } finally {
      setSubmittingResponse(false);
    }
  };

  // --- 5. STAFF RECOGNITION ACTIONS ---
  const handleAwardRecognition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!awardStaffId || !awardType.trim()) return;
    setSubmittingAward(true);
    try {
      const payload = {
        staff_id: awardStaffId,
        award_type: awardType.trim(),
        award_note: awardNote.trim() || null,
        period_label: awardPeriod.trim() || null,
        awarded_by: user?.name || user?.email || 'Operations Manager'
      };

      const { error } = await supabase
        .from('staff_recognition')
        .insert(payload);
      if (error) throw error;

      showToast('Award recognition saved successfully ✓');
      setAwardModalOpen(false);
      setAwardStaffId('');
      setAwardPeriod('');
      setAwardNote('');
      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to save recognition award.');
    } finally {
      setSubmittingAward(false);
    }
  };

  const handleDeleteRecognition = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recognition award?')) return;
    try {
      const { error } = await supabase
        .from('staff_recognition')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Recognition award deleted ✓');
      loadAllData();
    } catch (err) {
      console.error(err);
      alert('Failed to delete recognition.');
    }
  };

  if (!user || (user.role !== 'admin' && user.role !== 'ops_manager')) {
    return (
      <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center p-4">
        <div className="bg-white border border-[#E8E8E8] rounded-2xl p-6 text-center max-w-sm">
          <ShieldAlert className="text-red-500 mx-auto mb-2" size={36} />
          <h2 className="text-sm font-black uppercase text-[#1A1A1A]">Access Restricted</h2>
          <p className="text-xs text-gray-500 font-bold mt-1 leading-normal">
            Only administrators and operations managers can access the SOP utilities dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-gray-200">
        <div>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-400 hover:text-[#1A1A1A] transition-colors mb-1.5">
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-black text-[#1A1A1A]">SOP Utilities 🛡️</h1>
          <p className="text-xs text-slate-500 font-bold">Manage directory details, renew checklists, process feedback, and award recognition.</p>
        </div>

        {toastMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold shadow-md animate-pulse">
            {toastMsg}
          </div>
        )}
      </div>

      {/* Tabs Subnavigation */}
      <div className="flex bg-white border border-[#E8E8E8] p-1.5 rounded-2xl shadow-sm overflow-x-auto gap-1">
        {[
          { id: 'contacts', label: '📞 Contacts', count: contacts.length },
          { id: 'lost_found', label: '🎒 Lost & Found', count: lostFoundItems.filter(i => i.status === 'unclaimed').length },
          { id: 'renewals', label: '📅 Renewals', count: renewals.length },
          { id: 'suggestions', label: '💡 Suggestions', count: suggestions.filter(s => s.status === 'new').length },
          { id: 'recognition', label: '🏆 Recognition', count: recognitionList.length }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 ${
                isActive 
                  ? 'bg-[#1A1A1A] text-white shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none ${
                  isActive ? 'bg-white text-[#1A1A1A]' : 'bg-slate-200 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="bg-white border border-[#E8E8E8] rounded-2xl py-20 flex flex-col items-center justify-center gap-3 shadow-sm">
          <Clock className="animate-spin text-slate-400" size={32} />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Syncing SOP records...</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* TAB 1: EMERGENCY CONTACTS */}
          {activeTab === 'contacts' && (
            <div className="bg-white border border-[#E8E8E8] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black uppercase text-[#1A1A1A]">Contacts Directory</h3>
                  <p className="text-[10px] text-gray-500 font-bold">Standard contact numbers shared globally or per branch.</p>
                </div>
                <button
                  onClick={() => { setEditingContact(null); setContactName(''); setContactType('Maintenance'); setContactPhone(''); setContactBranch(''); setContactNotes(''); setContactDisplayOrder('0'); setContactModalOpen(true); }}
                  className="bg-[#1A1A1A] hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shadow cursor-pointer"
                >
                  <Plus size={14} /> Add Contact
                </button>
              </div>

              <div className="overflow-x-auto border border-[#E8E8E8] rounded-xl">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 border-b border-[#E8E8E8] font-bold text-[9.5px] uppercase">
                      <th className="p-3">Name</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Phone</th>
                      <th className="p-3">Scope</th>
                      <th className="p-3">Notes</th>
                      <th className="p-3 text-center">Order</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E8E8] font-medium text-slate-700">
                    {contacts.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="p-3 font-extrabold text-[#1A1A1A]">{c.contact_name}</td>
                        <td className="p-3">
                          <span className="bg-slate-100 border border-slate-200/50 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-660 uppercase">
                            {c.contact_type}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800">{c.phone_number}</td>
                        <td className="p-3 uppercase text-[10px] font-bold">
                          {c.branch_id ? (c.branch_id === 'daily' ? 'Nearbi Daily' : 'Hypermarket') : '🌍 Global (Both)'}
                        </td>
                        <td className="p-3 max-w-[200px] truncate text-gray-400 italic" title={c.notes}>{c.notes || '—'}</td>
                        <td className="p-3 text-center font-bold">{c.display_order || 0}</td>
                        <td className="p-3 text-right flex justify-end gap-1.5">
                          <button
                            onClick={() => handleEditContact(c)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] uppercase px-2 py-1 rounded shadow-xs cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteContact(c.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 font-extrabold text-[10px] uppercase px-2 py-1 rounded border border-red-200/30 shadow-xs cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: LOST & FOUND REGISTER */}
          {activeTab === 'lost_found' && (
            <div className="bg-white border border-[#E8E8E8] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black uppercase text-[#1A1A1A]">Lost & Found Register</h3>
                  <p className="text-[10px] text-gray-500 font-bold">Track lost customer items and claims records.</p>
                </div>
                <button
                  onClick={() => setLostFoundModalOpen(true)}
                  className="bg-[#1A1A1A] hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shadow cursor-pointer"
                >
                  <Plus size={14} /> Log Found Item
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-4 items-center bg-gray-50 p-3 rounded-xl border border-[#E8E8E8] text-xs font-bold text-slate-700">
                <div className="flex items-center gap-1.5">
                  <Filter size={14} className="text-slate-400" />
                  <span>Filters:</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">Status</span>
                  <select
                    value={lfFilterStatus}
                    onChange={e => setLfFilterStatus(e.target.value)}
                    className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold"
                  >
                    <option value="all">All Statuses</option>
                    <option value="unclaimed">Unclaimed</option>
                    <option value="claimed">Claimed</option>
                    <option value="disposed">Disposed</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">Branch</span>
                  <select
                    value={lfFilterBranch}
                    onChange={e => setLfFilterBranch(e.target.value)}
                    className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold"
                  >
                    <option value="all">All Branches</option>
                    <option value="daily">Nearbi Daily</option>
                    <option value="hypermarket">Nearbi Hypermarket</option>
                  </select>
                </div>
              </div>

              {/* Items List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {lostFoundItems
                  .filter(item => {
                    if (lfFilterStatus !== 'all' && item.status !== lfFilterStatus) return false;
                    if (lfFilterBranch !== 'all' && item.branch_id !== lfFilterBranch) return false;
                    return true;
                  })
                  .map(item => (
                    <div key={item.id} className="border border-[#E8E8E8] rounded-xl p-4 flex flex-col justify-between relative overflow-hidden bg-white hover:shadow-sm transition-shadow">
                      {/* Photo indicator or mock */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                            item.status === 'unclaimed' ? 'text-blue-500 bg-blue-50 border-blue-100' :
                            item.status === 'claimed' ? 'text-emerald-500 bg-emerald-50 border-emerald-100 animate-pulse' :
                            'text-slate-400 bg-slate-50 border-slate-200'
                          }`}>
                            {item.status}
                          </span>
                          <span className="text-[9px] text-gray-400 font-bold uppercase">{item.branch_id === 'daily' ? 'Daily' : 'Hypermarket'}</span>
                        </div>
                        <h4 className="text-xs font-black text-[#1A1A1A] leading-normal">{item.item_description}</h4>
                        
                        <div className="pt-2 text-[10px] text-slate-500 font-bold space-y-0.5 text-left border-t border-gray-50">
                          <p>Found on: {new Date(item.found_date).toLocaleDateString()}</p>
                          <p>Logged by: {item.found_by_staff?.name || 'Manager'}</p>
                        </div>

                        {item.status === 'claimed' && (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2 mt-2 text-left text-[9.5px]">
                            <span className="text-[8px] font-black text-emerald-800 uppercase block tracking-wider">Claimed Details:</span>
                            <p className="font-extrabold text-[#1A1A1A] mt-0.5">{item.claimed_by_name} ({item.claimed_by_phone})</p>
                            <p className="text-[8px] text-gray-400 mt-0.5">Claimed on: {new Date(item.claimed_at).toLocaleString()}</p>
                          </div>
                        )}
                      </div>

                      {item.status === 'unclaimed' && (
                        <div className="flex gap-2 pt-3 mt-3 border-t border-gray-55">
                          <button
                            onClick={() => handleOpenClaimModal(item)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase px-3 py-2 rounded-lg active:scale-95 transition-all cursor-pointer"
                          >
                            Mark Claimed
                          </button>
                          <button
                            onClick={() => handleDisposeItem(item.id)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] uppercase px-3 py-2 rounded-lg active:scale-95 transition-all cursor-pointer"
                          >
                            Dispose
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {/* TAB 3: COMPLIANCE RENEWALS */}
          {activeTab === 'renewals' && (
            <div className="bg-white border border-[#E8E8E8] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black uppercase text-[#1A1A1A]">Compliance Renewals</h3>
                  <p className="text-[10px] text-gray-500 font-bold">Track fire extinguisher testing, calibration, pest control services, and food licenses.</p>
                </div>
                <button
                  onClick={() => { setEditingRenewal(null); setRenewalItemName(''); setRenewalType('pest_control'); setRenewalNextDue(''); setRenewalLastService(''); setRenewalNotes(''); setRenewalModalOpen(true); }}
                  className="bg-[#1A1A1A] hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shadow cursor-pointer"
                >
                  <Plus size={14} /> Add Renewal Check
                </button>
              </div>

              <div className="overflow-x-auto border border-[#E8E8E8] rounded-xl">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 border-b border-[#E8E8E8] font-bold text-[9.5px] uppercase">
                      <th className="p-3">Item Name</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Branch</th>
                      <th className="p-3">Last Service</th>
                      <th className="p-3">Next Due</th>
                      <th className="p-3 text-center">Alert Limit</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E8E8] font-medium text-slate-700">
                    {renewals.map(r => {
                      const today = new Date();
                      const dueDate = new Date(r.next_due_date);
                      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
                      const isDueSoon = diffDays <= (r.reminder_days_before || 30) && diffDays >= 0;

                      return (
                        <tr key={r.id} className={`hover:bg-gray-50 ${isDueSoon ? 'bg-amber-50/50 hover:bg-amber-50' : ''}`}>
                          <td className="p-3 font-extrabold text-[#1A1A1A]">
                            <div className="flex items-center gap-1.5">
                              {r.item_name}
                              {isDueSoon && <AlertTriangle size={12} className="text-amber-500 animate-bounce" />}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="bg-slate-100 border border-slate-200/50 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-650 uppercase">
                              {r.renewal_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-3 uppercase text-[10px] font-bold">{r.branch_id === 'daily' ? 'Daily' : 'Hypermarket'}</td>
                          <td className="p-3 font-mono">{r.last_service_date ? new Date(r.last_service_date).toLocaleDateString() : '—'}</td>
                          <td className={`p-3 font-mono font-bold ${isDueSoon ? 'text-amber-600' : 'text-slate-800'}`}>
                            {new Date(r.next_due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="p-3 text-center font-extrabold text-slate-500">{r.reminder_days_before || 30} Days</td>
                          <td className="p-3 text-right flex justify-end gap-1.5">
                            <button
                              onClick={() => handleEditRenewal(r)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] uppercase px-2 py-1 rounded shadow-xs cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteRenewal(r.id)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 font-extrabold text-[10px] uppercase px-2 py-1 rounded border border-red-200/30 shadow-xs cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: STAFF SUGGESTIONS BOX */}
          {activeTab === 'suggestions' && (
            <div className="bg-white border border-[#E8E8E8] rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-black uppercase text-[#1A1A1A]">Staff Suggestions</h3>
                <p className="text-[10px] text-gray-500 font-bold">Read and respond to suggestions submitted by store staff members.</p>
              </div>

              <div className="space-y-3">
                {suggestions.length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-6">No suggestions received yet.</p>
                ) : (
                  suggestions.map(sug => (
                    <div key={sug.id} className="border border-[#E8E8E8] rounded-xl p-4 space-y-3 bg-white text-left text-xs font-semibold text-slate-650">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-extrabold text-[#1A1A1A] block">{sug.staff?.name}</span>
                          <span className="text-[9px] text-gray-400 font-bold uppercase">{sug.staff?.department} • {sug.staff?.branch_id === 'daily' ? 'Daily' : 'Hypermarket'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] text-gray-400">{new Date(sug.submitted_at).toLocaleDateString()}</span>
                          <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 rounded border ${
                            sug.status === 'new' ? 'text-blue-500 bg-blue-50 border-blue-100' :
                            sug.status === 'reviewed' ? 'text-amber-500 bg-amber-50 border-amber-100' :
                            sug.status === 'implemented' ? 'text-emerald-500 bg-emerald-50 border-emerald-100' :
                            'text-red-500 bg-red-50 border-red-100'
                          }`}>
                            {sug.status}
                          </span>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-slate-800 leading-relaxed font-bold whitespace-pre-wrap">
                        "{sug.suggestion_text}"
                      </div>

                      {sug.ops_response && (
                        <div className="bg-slate-100/60 border border-slate-200/40 rounded-xl p-3 text-slate-655 font-medium">
                          <span className="text-[8.5px] text-slate-400 font-black uppercase block tracking-wider">Management Response:</span>
                          <p className="mt-0.5 font-bold text-slate-700">"{sug.ops_response}"</p>
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleOpenResponseModal(sug)}
                          className="bg-[#1A1A1A] hover:bg-black text-white font-extrabold text-[10px] uppercase px-4 py-2 rounded-xl active:scale-95 transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquare size={12} /> Respond & Review
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 5: STAFF RECOGNITION */}
          {activeTab === 'recognition' && (
            <div className="bg-white border border-[#E8E8E8] rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black uppercase text-[#1A1A1A]">Staff Recognition & Awards</h3>
                  <p className="text-[10px] text-gray-500 font-bold">Award badges/medals to staff members to appreciate stellar service.</p>
                </div>
                <button
                  onClick={() => setAwardModalOpen(true)}
                  className="bg-[#1A1A1A] hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shadow cursor-pointer"
                >
                  <Plus size={14} /> Award Recognition
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-4 items-center bg-gray-50 p-3 rounded-xl border border-[#E8E8E8] text-xs font-bold text-slate-700">
                <div className="flex items-center gap-1.5">
                  <Filter size={14} className="text-slate-400" />
                  <span>Filters:</span>
                </div>
                
                <div className="flex-1 flex items-center gap-2">
                  <Search size={12} className="text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search staff by name..."
                    value={recFilterStaff}
                    onChange={e => setRecFilterStaff(e.target.value)}
                    className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold w-full max-w-xs focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">Branch</span>
                  <select
                    value={recFilterBranch}
                    onChange={e => setRecFilterBranch(e.target.value)}
                    className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold"
                  >
                    <option value="all">All Branches</option>
                    <option value="daily">Nearbi Daily</option>
                    <option value="hypermarket">Nearbi Hypermarket</option>
                  </select>
                </div>
              </div>

              {/* Recognition logs list */}
              <div className="overflow-x-auto border border-[#E8E8E8] rounded-xl">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 border-b border-[#E8E8E8] font-bold text-[9.5px] uppercase">
                      <th className="p-3">Staff Name</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Branch</th>
                      <th className="p-3">Award Type</th>
                      <th className="p-3">Period</th>
                      <th className="p-3">Citation Notes</th>
                      <th className="p-3">Awarded By</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E8E8] font-medium text-slate-700">
                    {recognitionList
                      .filter(rec => {
                        if (recFilterBranch !== 'all' && rec.staff?.branch_id !== recFilterBranch) return false;
                        if (recFilterStaff && !rec.staff?.name.toLowerCase().includes(recFilterStaff.toLowerCase())) return false;
                        return true;
                      })
                      .map(rec => (
                        <tr key={rec.id} className="hover:bg-gray-50">
                          <td className="p-3 font-extrabold text-[#1A1A1A]">{rec.staff?.name}</td>
                          <td className="p-3">{rec.staff?.department}</td>
                          <td className="p-3 uppercase text-[10px] font-bold">{rec.staff?.branch_id === 'daily' ? 'Daily' : 'Hypermarket'}</td>
                          <td className="p-3">
                            <span className="bg-indigo-50 border border-indigo-200 text-indigo-650 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide">
                              🏆 {rec.award_type}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 font-extrabold text-[10px]">{rec.period_label || '—'}</td>
                          <td className="p-3 max-w-[200px] truncate text-slate-655 font-semibold" title={rec.award_note}>
                            {rec.award_note ? `"${rec.award_note}"` : '—'}
                          </td>
                          <td className="p-3 font-bold">{rec.awarded_by}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteRecognition(rec.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              title="Delete Award"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* --- MODAL 1: EMERGENCY CONTACT DIALOG --- */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-left">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <h3 className="text-[#1A1A1A] text-sm font-black uppercase tracking-wider">
                {editingContact ? 'Edit Contact' : 'Add Contact'}
              </h3>
              <button
                onClick={() => setContactModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-650 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4 text-xs font-bold text-[#555555]">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="e.g. Police Station, IT Helpdesk"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Contact Type</label>
                <input
                  type="text"
                  value={contactType}
                  onChange={e => setContactType(e.target.value)}
                  placeholder="e.g. Emergency, Maintenance, IT"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="e.g. 100, 9876543210"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Branch Scope</label>
                  <select
                    value={contactBranch}
                    onChange={e => setContactBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  >
                    <option value="">🌍 Global (Both)</option>
                    <option value="daily">Nearbi Daily</option>
                    <option value="hypermarket">Nearbi Hypermarket</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Display Order</label>
                  <input
                    type="number"
                    value={contactDisplayOrder}
                    onChange={e => setContactDisplayOrder(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Notes / Description</label>
                <textarea
                  value={contactNotes}
                  onChange={e => setContactNotes(e.target.value)}
                  placeholder="e.g. Available 24/7 on call support"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  rows={2}
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] bg-[#1a1a1a] hover:bg-black text-white font-black text-xs rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Save Contact Details</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: LOG FOUND ITEM DIALOG --- */}
      {lostFoundModalOpen && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-left">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <h3 className="text-[#1A1A1A] text-sm font-black uppercase tracking-wider">Log Found Item</h3>
              <button
                onClick={() => setLostFoundModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-650 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveLostFound} className="space-y-4 text-xs font-bold text-[#555555]">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Item Description</label>
                <input
                  type="text"
                  value={lfDescription}
                  onChange={e => setLfDescription(e.target.value)}
                  placeholder="e.g. Blue leather wallet, Key bunch"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Branch</label>
                  <select
                    value={lfBranch}
                    onChange={e => setLfBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  >
                    <option value="hypermarket">Hypermarket</option>
                    <option value="daily">Nearbi Daily</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Found Date</label>
                  <input
                    type="date"
                    value={lfFoundDate}
                    onChange={e => setLfFoundDate(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 [color-scheme:light] text-[#1A1A1A]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Found By (Staff)</label>
                <select
                  value={lfFoundBy}
                  onChange={e => setLfFoundBy(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                >
                  <option value="">Select Staff Member...</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.department})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Photo URL (Optional)</label>
                <input
                  type="text"
                  value={lfPhotoUrl}
                  onChange={e => setLfPhotoUrl(e.target.value)}
                  placeholder="Paste direct photo link if uploaded"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] bg-[#1a1a1a] hover:bg-black text-white font-black text-xs rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center cursor-pointer"
              >
                <span>Save to Register</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2B: MARK CLAIMED DETAILS DIALOG --- */}
      {claimModalOpen && claimingItem && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-left">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <h3 className="text-[#1A1A1A] text-sm font-black uppercase tracking-wider">Mark Item Claimed</h3>
              <button
                onClick={() => setClaimModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-650 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmClaim} className="space-y-4 text-xs font-bold text-[#555555]">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Item:</span>
                <p className="text-slate-800 font-extrabold mt-0.5">{claimingItem.item_description}</p>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Claimer Name</label>
                <input
                  type="text"
                  value={claimName}
                  onChange={e => setClaimName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Claimer Phone Number</label>
                <input
                  type="text"
                  value={claimPhone}
                  onChange={e => setClaimPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center cursor-pointer"
              >
                <span>Confirm Claim Handover</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: COMPLIANCE RENEWAL DIALOG --- */}
      {renewalModalOpen && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-left">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <h3 className="text-[#1A1A1A] text-sm font-black uppercase tracking-wider">
                {editingRenewal ? 'Edit Renewal Check' : 'Add Renewal Check'}
              </h3>
              <button
                onClick={() => setRenewalModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-650 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveRenewal} className="space-y-4 text-xs font-bold text-[#555555]">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Item Name</label>
                <input
                  type="text"
                  value={renewalItemName}
                  onChange={e => setRenewalItemName(e.target.value)}
                  placeholder="e.g. Main Kitchen Fire Extinguisher"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Renewal Type</label>
                  <select
                    value={renewalType}
                    onChange={e => setRenewalType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  >
                    <option value="fire_extinguisher">Fire Extinguisher</option>
                    <option value="weighing_scale">Weighing Scale</option>
                    <option value="pest_control">Pest Control</option>
                    <option value="fssai_license">FSSAI License</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Branch Scope</label>
                  <select
                    value={renewalBranch}
                    onChange={e => setRenewalBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  >
                    <option value="hypermarket">Hypermarket</option>
                    <option value="daily">Nearbi Daily</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Last Service Date</label>
                  <input
                    type="date"
                    value={renewalLastService}
                    onChange={e => setRenewalLastService(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 [color-scheme:light] text-[#1A1A1A]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Next Due Date</label>
                  <input
                    type="date"
                    value={renewalNextDue}
                    onChange={e => setRenewalNextDue(e.target.value)}
                    className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 [color-scheme:light] text-[#1A1A1A]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Reminder Trigger Limit (Days Before)</label>
                <input
                  type="number"
                  value={renewalReminderDays}
                  onChange={e => setRenewalReminderDays(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Renewal Notes</label>
                <textarea
                  value={renewalNotes}
                  onChange={e => setRenewalNotes(e.target.value)}
                  placeholder="Service vendor contact, instructions..."
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  rows={2}
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] bg-[#1a1a1a] hover:bg-black text-white font-black text-xs rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center cursor-pointer"
              >
                <span>Save Renewal Schedule</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: REVIEW SUGGESTION RESPONSE DIALOG --- */}
      {responseModalOpen && selectedSuggestion && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-left">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <h3 className="text-[#1A1A1A] text-sm font-black uppercase tracking-wider">Respond & Review</h3>
              <button
                onClick={() => { setResponseModalOpen(false); setSelectedSuggestion(null); }}
                className="p-1 rounded-full text-gray-400 hover:text-gray-650 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSuggestionResponse} className="space-y-4 text-xs font-bold text-[#555555]">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1">
                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Submitted by {selectedSuggestion.staff?.name}:</span>
                <p className="text-slate-800 font-extrabold leading-normal whitespace-pre-wrap">"{selectedSuggestion.suggestion_text}"</p>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Status Action</label>
                <select
                  value={sugStatus}
                  onChange={e => setSugStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 font-bold text-[#1A1A1A]"
                >
                  <option value="new">New (Unreviewed)</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="implemented">Implemented</option>
                  <option value="declined">Declined</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Management Response Note (Visible to Staff)</label>
                <textarea
                  value={sugResponseText}
                  onChange={e => setSugResponseText(e.target.value)}
                  placeholder="Write response message..."
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  rows={4}
                />
              </div>

              <button
                type="submit"
                disabled={submittingResponse}
                className="w-full min-h-[44px] bg-[#1a1a1a] hover:bg-black text-white font-black text-xs rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center cursor-pointer"
              >
                <span>{submittingResponse ? 'Saving Changes...' : 'Save Review Action'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 5: AWARD RECOGNITION DIALOG --- */}
      {awardModalOpen && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-left">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <h3 className="text-[#1A1A1A] text-sm font-black uppercase tracking-wider">Award Recognition</h3>
              <button
                onClick={() => setAwardModalOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-650 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAwardRecognition} className="space-y-4 text-xs font-bold text-[#555555]">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Award Recipient (Staff)</label>
                <select
                  value={awardStaffId}
                  onChange={e => setAwardStaffId(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                >
                  <option value="">Select Recipient...</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.department} • {s.branch_id === 'daily' ? 'Daily' : 'HM'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Award Type</label>
                <input
                  type="text"
                  value={awardType}
                  onChange={e => setAwardType(e.target.value)}
                  placeholder="e.g. Employee of the Week, Star Performer"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  required
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Period Label (Optional)</label>
                <input
                  type="text"
                  value={awardPeriod}
                  onChange={e => setAwardPeriod(e.target.value)}
                  placeholder="e.g. Week of July 6, July 2026"
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider text-slate-400 mb-1">Award Note / Citation</label>
                <textarea
                  value={awardNote}
                  onChange={e => setAwardNote(e.target.value)}
                  placeholder="Stellar customer service, dedicated extra shifts..."
                  className="w-full bg-slate-50 border border-gray-200 rounded-xl p-3 text-[#1A1A1A]"
                  rows={3}
                />
              </div>

              <button
                type="submit"
                disabled={submittingAward}
                className="w-full min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles size={14} />
                <span>{submittingAward ? 'Saving Award...' : 'Appreciate & Award'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

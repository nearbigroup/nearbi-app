'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createAuditLog } from '@/lib/audit';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Filter,
  Plus,
  Trash2,
  X,
  Check,
  Camera,
  ChevronDown,
  Building2,
  Calendar,
  Phone,
  Paperclip,
  Save,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { DEPARTMENTS } from '@/lib/data';

interface Candidate {
  id: string;
  full_name: string;
  phone_number: string | null;
  departments: string[];
  experience: string | null;
  status: 'new' | 'shortlisted' | 'rejected' | 'hired' | 'on_hold';
  branch_id: string | null;
  photo_url: string | null;
  id_photo_url: string | null;
  notes: string | null;
  walk_in_date: string;
  added_by: string;
  created_at: string;
  updated_at: string;
  trial_kiosk_active?: boolean;
}

export default function CandidatesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Role restriction
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ops_manager')) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('both');
  const [searchQuery, setSearchQuery] = useState('');

  // UI Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ url: string; title: string } | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [branch, setBranch] = useState<'daily' | 'hypermarket'>('daily');
  const [experience, setExperience] = useState('');
  const [notes, setNotes] = useState('');
  const [walkInDate, setWalkInDate] = useState(() => {
    const today = new Date();
    const yr = today.getFullYear();
    const mo = today.getMonth() + 1;
    const dy = today.getDate();
    return `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
  });
  const [formStatus, setFormStatus] = useState<'new' | 'shortlisted' | 'rejected' | 'hired' | 'on_hold'>('new');
  const [submitting, setSubmitting] = useState(false);
  const [trialKioskActive, setTrialKioskActive] = useState(false);

  // File Upload State
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [idPhotoFile, setIdPhotoFile] = useState<File | null>(null);
  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null);

  const inlineNotesRef = useRef<HTMLTextAreaElement>(null);
  const [resignedStaffList, setResignedStaffList] = useState<any[]>([]);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      
      // Fetch resigned staff records to check rehire status
      const { data: resignedData, error: resignedErr } = await supabase
        .from('staff')
        .select('id, name, mobile_number, is_resigned, resignation:resignation_id(rehire_eligible, rehire_note)')
        .eq('is_resigned', true);

      if (!resignedErr && resignedData) {
        setResignedStaffList(resignedData);
      }

      const { data, error } = await supabase
        .from('job_candidates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCandidates(data || []);
    } catch (err: any) {
      console.error('Error fetching candidates:', err);
      setErrorMsg('Failed to load candidates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'ops_manager') {
      fetchCandidates();
    }
  }, [user]);

  const getResignedMatch = (name: string, phone: string | null) => {
    if (!resignedStaffList || resignedStaffList.length === 0) return null;
    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    return resignedStaffList.find(s => {
      const nameMatch = s.name.trim().toLowerCase() === name.trim().toLowerCase();
      const cleanStaffPhone = s.mobile_number ? s.mobile_number.replace(/\D/g, '') : '';
      const phoneMatch = cleanPhone && cleanStaffPhone && (cleanPhone === cleanStaffPhone);
      return nameMatch || phoneMatch;
    });
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  if (authLoading || !user || user.role !== 'ops_manager') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1A1A1A]"></div>
      </div>
    );
  }

  // Upload to Supabase Storage
  const handleUploadFile = async (file: File, candidateId: string, isIdPhoto = false): Promise<string> => {
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = isIdPhoto
        ? `candidates/${candidateId}/${Date.now()}_id.${ext}`
        : `candidates/${candidateId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('candidate-photos')
        .upload(path, file, {
          contentType: file.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('candidate-photos').getPublicUrl(path);
      return data.publicUrl;
    } catch (err) {
      console.error('Storage upload error:', err);
      throw err;
    }
  };

  const getStoragePathFromUrl = (url: string) => {
    const marker = '/storage/v1/object/public/candidate-photos/';
    const index = url.indexOf(marker);
    if (index !== -1) {
      return url.substring(index + marker.length);
    }
    return null;
  };

  const handleSaveCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      alert('Full Name is required.');
      return;
    }
    if (selectedDepts.length === 0) {
      alert('Please select at least one department of interest.');
      return;
    }
    if (!photoFile) {
      alert('Candidate Photo is required.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Generate client-side UUID for storage scoping
      const candidateId = crypto.randomUUID();

      // 2. Upload Candidate Photo
      const photoUrl = await handleUploadFile(photoFile, candidateId, false);

      // 3. Upload ID Photo if chosen
      let idPhotoUrl: string | null = null;
      if (idPhotoFile) {
        idPhotoUrl = await handleUploadFile(idPhotoFile, candidateId, true);
      }

      // 4. Save to Database
      const { error } = await supabase.from('job_candidates').insert({
        id: candidateId,
        full_name: fullName.trim(),
        phone_number: phoneNumber.trim() || null,
        departments: selectedDepts,
        experience: experience.trim() || null,
        status: formStatus,
        branch_id: branch,
        photo_url: photoUrl,
        id_photo_url: idPhotoUrl,
        notes: notes.trim() || null,
        walk_in_date: walkInDate,
        added_by: user.email,
        trial_kiosk_active: trialKioskActive,
      });

      if (error) throw error;

      if (trialKioskActive) {
        await syncTrialStaffRow(candidateId, true, fullName.trim(), phoneNumber.trim() || '', branch);
      }

      await createAuditLog({
        action: 'create_candidate',
        table_name: 'job_candidates',
        record_id: candidateId,
        new_value: { full_name: fullName, departments: selectedDepts, status: formStatus },
        performed_by: user.email,
        performed_by_role: user.role,
        reason: `Added candidate "${fullName}"`,
      });

      showToast('Candidate added ✓');
      setIsAddOpen(false);
      resetForm();
      fetchCandidates();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save candidate: ' + (err.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setPhoneNumber('');
    setSelectedDepts([]);
    setBranch('daily');
    setExperience('');
    setNotes('');
    setFormStatus('new');
    setPhotoFile(null);
    setPhotoPreview(null);
    setIdPhotoFile(null);
    setIdPhotoPreview(null);
    setTrialKioskActive(false);
  };

  const handleStatusChange = async (candidate: Candidate, newStatus: 'new' | 'shortlisted' | 'rejected' | 'hired' | 'on_hold') => {
    try {
      const { error } = await supabase
        .from('job_candidates')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', candidate.id);

      if (error) throw error;

      await createAuditLog({
        action: 'update_candidate_status',
        table_name: 'job_candidates',
        record_id: candidate.id,
        new_value: { status: newStatus },
        performed_by: user.email,
        performed_by_role: user.role,
        reason: `Changed candidate status for "${candidate.full_name}" to "${newStatus}"`,
      });

      // Update local states
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, status: newStatus } : c))
      );
      if (selectedCandidate?.id === candidate.id) {
        setSelectedCandidate((prev) => (prev ? { ...prev, status: newStatus } : null));
      }

      showToast(`Status updated to ${newStatus} ✓`);

      // If Hired -> Prompt creation of staff
      if (newStatus === 'hired') {
        const confirmHire = confirm(`Add ${candidate.full_name} as a staff member now? This will pre-fill the staff onboarding form.`);
        if (confirmHire) {
          setSelectedCandidate(null);
          setIsAddOpen(false);
          router.push(
            `/staff?prefill_name=${encodeURIComponent(candidate.full_name)}` +
            `&prefill_phone=${encodeURIComponent(candidate.phone_number || '')}` +
            `&prefill_dept=${encodeURIComponent(candidate.departments[0] || '')}` +
            `&prefill_branch=${encodeURIComponent(candidate.branch_id || 'daily')}`
          );
        }
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to update candidate status.');
    }
  };

  const syncTrialStaffRow = async (
    candidateId: string,
    active: boolean,
    name: string,
    phone: string,
    branchId: string
  ) => {
    if (active) {
      const { data: pinsData } = await supabase
        .from('staff')
        .select('pin')
        .eq('active', true);
      const activePins = new Set(pinsData?.map((s: any) => s.pin) || []);
      
      let generatedPin = '';
      let attempts = 0;
      while (attempts < 100) {
        const candidatePin = String(Math.floor(1000 + Math.random() * 9000));
        if (!activePins.has(candidatePin)) {
          generatedPin = candidatePin;
          break;
        }
        attempts++;
      }
      if (!generatedPin) {
        throw new Error("Unable to generate a unique PIN. Please try again.");
      }

      const { data: existingStaff } = await supabase
        .from('staff')
        .select('id')
        .eq('candidate_id', candidateId)
        .maybeSingle();

      if (existingStaff) {
        await supabase
          .from('staff')
          .update({
            active: true,
            name,
            mobile_number: phone || null,
            branch_id: branchId,
            is_trial: true,
            pay_type: 'trial',
            department: 'Nearbi Trial'
          })
          .eq('id', existingStaff.id);
      } else {
        await supabase
          .from('staff')
          .insert({
            candidate_id: candidateId,
            name,
            mobile_number: phone || null,
            branch_id: branchId,
            pin: generatedPin,
            shift_id: 's1',
            is_trial: true,
            pay_type: 'trial',
            active: true,
            department: 'Nearbi Trial',
            monthly_salary: 0,
            join_date: new Date().toISOString().split('T')[0]
          });
      }
    } else {
      await supabase
        .from('staff')
        .update({ active: false })
        .eq('candidate_id', candidateId);
    }
  };

  const handleToggleTrialKioskAccess = async (candidate: Candidate, active: boolean) => {
    try {
      const { error: candErr } = await supabase
        .from('job_candidates')
        .update({ trial_kiosk_active: active })
        .eq('id', candidate.id);
      if (candErr) throw candErr;

      await syncTrialStaffRow(candidate.id, active, candidate.full_name, candidate.phone_number || '', candidate.branch_id || 'daily');

      setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, trial_kiosk_active: active } : c));
      setSelectedCandidate(prev => prev && prev.id === candidate.id ? { ...prev, trial_kiosk_active: active } : prev);
      
      showToast(`Trial kiosk access ${active ? 'enabled' : 'disabled'} successfully.`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to update trial kiosk access.");
    }
  };

  const handleConvertToFullStaff = async (candidate: Candidate) => {
    try {
      const { data: linkedStaff, error: fetchErr } = await supabase
        .from('staff')
        .select('id')
        .eq('candidate_id', candidate.id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (linkedStaff) {
        const { error: updateErr } = await supabase
          .from('staff')
          .update({ is_trial: false, active: true })
          .eq('id', linkedStaff.id);
        if (updateErr) throw updateErr;

        showToast('Converted successfully! Redirecting...');
        setSelectedCandidate(null);
        router.push(`/staff?edit=${linkedStaff.id}`);
      } else {
        const { data: pinsData } = await supabase
          .from('staff')
          .select('pin')
          .eq('active', true);
        const activePins = new Set(pinsData?.map((s: any) => s.pin) || []);
        
        let generatedPin = '';
        let attempts = 0;
        while (attempts < 100) {
          const candidatePin = String(Math.floor(1000 + Math.random() * 9000));
          if (!activePins.has(candidatePin)) {
            generatedPin = candidatePin;
            break;
          }
          attempts++;
        }
        if (!generatedPin) {
          throw new Error("Unable to generate a unique PIN.");
        }

        const { data: newStaff, error: insertErr } = await supabase
          .from('staff')
          .insert({
            candidate_id: candidate.id,
            name: candidate.full_name,
            mobile_number: candidate.phone_number || null,
            branch_id: candidate.branch_id || 'daily',
            pin: generatedPin,
            shift_id: 's1',
            is_trial: false,
            pay_type: 'fixed_shift',
            active: true,
            department: candidate.departments[0] || 'Nearbi Trial',
            monthly_salary: 0,
            join_date: new Date().toISOString().split('T')[0]
          })
          .select('id')
          .single();

        if (insertErr) throw insertErr;

        showToast('Created staff record! Redirecting...');
        setSelectedCandidate(null);
        router.push(`/staff?edit=${newStaff.id}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to convert to full staff.');
    }
  };

  const handleNotesBlur = async (candidate: Candidate, updatedNotes: string) => {
    if (candidate.notes === updatedNotes) return;
    try {
      const { error } = await supabase
        .from('job_candidates')
        .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
        .eq('id', candidate.id);

      if (error) throw error;

      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, notes: updatedNotes } : c))
      );
      showToast('Notes saved ✓');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCandidate = async (candidate: Candidate) => {
    const doubleConfirm = confirm(`Are you sure you want to permanently delete candidate "${candidate.full_name}" and all uploaded documents?`);
    if (!doubleConfirm) return;

    try {
      // 1. Delete files from Supabase Storage
      const pathsToDelete: string[] = [];
      if (candidate.photo_url) {
        const p = getStoragePathFromUrl(candidate.photo_url);
        if (p) pathsToDelete.push(p);
      }
      if (candidate.id_photo_url) {
        const p = getStoragePathFromUrl(candidate.id_photo_url);
        if (p) pathsToDelete.push(p);
      }
      if (pathsToDelete.length > 0) {
        await supabase.storage.from('candidate-photos').remove(pathsToDelete);
      }

      // 2. Delete database record
      const { error } = await supabase.from('job_candidates').delete().eq('id', candidate.id);
      if (error) throw error;

      await createAuditLog({
        action: 'delete_candidate',
        table_name: 'job_candidates',
        record_id: candidate.id,
        new_value: null,
        performed_by: user.email,
        performed_by_role: user.role,
        reason: `Deleted candidate "${candidate.full_name}"`,
      });

      showToast('Candidate deleted ✓');
      setSelectedCandidate(null);
      fetchCandidates();
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete candidate.');
    }
  };

  const handleDeptCheckbox = (dept: string) => {
    setSelectedDepts((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  };

  // Filter candidates
  const filteredCandidates = candidates.filter((c) => {
    // Status Filter
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;

    // Branch Filter
    if (branchFilter !== 'both' && c.branch_id !== branchFilter) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = c.full_name.toLowerCase().includes(q);
      const phoneMatch = c.phone_number?.toLowerCase().includes(q) || false;
      return nameMatch || phoneMatch;
    }

    return true;
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'shortlisted':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'on_hold':
        return 'bg-gray-50 text-gray-700 border-gray-200';
      case 'hired':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'rejected':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getTodayDateDisplay = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[#1A1A1A] text-2xl font-black tracking-tight">Candidates</h1>
          <p className="text-[var(--text-muted)] text-[11px] font-bold uppercase tracking-wider mt-1">
            {getTodayDateDisplay()}
          </p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="min-h-[40px] bg-[#1A1A1A] text-white hover:bg-[#333333] active:scale-[0.98] px-4 rounded-[12px] text-xs font-black uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow"
        >
          <Plus size={15} strokeWidth={2.5} />
          <span>Add Candidate</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between shadow-sm">
          <span>{errorMsg}</span>
          <button onClick={fetchCandidates} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search candidate by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#E8E8E8] rounded-xl p-3 pl-10 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-semibold shadow-sm"
          />
          <Search size={16} className="absolute left-3.5 top-3.5 text-[#999999]" />
        </div>

        {/* Branch Filter */}
        <div className="flex bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-1 gap-1">
          {[
            { id: 'both', label: 'Both Branches' },
            { id: 'daily', label: 'Daily' },
            { id: 'hypermarket', label: 'Hypermarket' },
          ].map((b) => (
            <button
              key={b.id}
              onClick={() => setBranchFilter(b.id)}
              className={`flex-1 text-[10px] font-black uppercase tracking-wider py-2 rounded-lg transition-all ${
                branchFilter === b.id
                  ? 'bg-white text-[#1A1A1A] shadow-sm border border-[#E8E8E8]'
                  : 'text-[var(--text-secondary)] hover:text-[#1A1A1A]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Status Filter Scroll List */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {[
            { id: 'all', label: 'All' },
            { id: 'new', label: 'New' },
            { id: 'shortlisted', label: 'Shortlisted' },
            { id: 'on_hold', label: 'On Hold' },
            { id: 'hired', label: 'Hired' },
            { id: 'rejected', label: 'Rejected' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`flex-shrink-0 text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-[20px] border transition-all ${
                statusFilter === pill.id
                  ? 'bg-[#1A1A1A] border-[#1A1A1A] text-white shadow-sm'
                  : 'bg-white border-[#E8E8E8] text-[var(--text-secondary)] hover:border-[#1A1A1A] hover:text-[#1A1A1A]'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Candidates List Grid */}
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-[110px] w-full" />
          <div className="skeleton h-[110px] w-full" />
          <div className="skeleton h-[110px] w-full" />
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-8 text-center flex flex-col items-center justify-center my-6 shadow-sm">
          <Users size={48} strokeWidth={1} style={{ color: '#999999' }} className="mb-2" />
          <h3 className="text-sm font-bold text-[#1A1A1A]">No candidates found</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
            No candidates matched the selected filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredCandidates.map((c) => (
            <div
              key={c.id}
              onClick={() => setSelectedCandidate(c)}
              className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 flex flex-col relative shadow-sm hover:border-[#B0B0B0] transition-colors cursor-pointer"
            >
              {/* Top Row: photo, name, branch */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3.5">
                  {c.photo_url ? (
                    <img
                      src={c.photo_url}
                      alt={c.full_name}
                      className="w-12 h-12 rounded-[12px] object-cover border border-[#E8E8E8] flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-[12px] bg-[#1A1A1A] text-white font-bold text-lg flex items-center justify-center flex-shrink-0">
                      {c.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-extrabold text-sm text-[#1A1A1A] leading-tight">
                      {c.full_name}
                    </h3>
                    {(() => {
                      const match = getResignedMatch(c.full_name, c.phone_number);
                      if (!match) return null;
                      const eligible = match.resignation?.rehire_eligible;
                      return (
                        <div className="mt-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[9px] font-black px-2 py-0.5 rounded-full inline-block uppercase">
                          ⚠️ Former Staff • Rehire: {eligible === true ? 'Yes' : eligible === false ? 'No' : 'Pending'}
                        </div>
                      );
                    })()}
                    <div className="flex items-center space-x-2 text-[10px] text-[var(--text-muted)] font-semibold mt-1.5">
                      <span className="flex items-center gap-1">
                        <Building2 size={11} />
                        {c.branch_id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket'}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {formatDate(c.walk_in_date)}
                      </span>
                    </div>
                  </div>
                </div>

                <span className={`text-[8.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-[20px] border ${getStatusStyle(c.status)}`}>
                  {c.status}
                </span>
              </div>

              {/* Middle Row: departments badges */}
              <div className="flex flex-wrap gap-1 mt-3.5">
                {c.departments.map((dept) => (
                  <span
                    key={dept}
                    className="text-[9px] font-bold bg-[#F0F0F0] text-[#555555] border border-[#E8E8E8] px-2 py-0.5 rounded-lg"
                  >
                    {dept}
                  </span>
                ))}
              </div>

              {/* Bottom Row: phone number and quick status selector */}
              <div className="flex items-center justify-between border-t border-[#F0F0F0] pt-3 mt-3.5">
                <span className="text-[11px] font-bold text-[#555555] flex items-center gap-1.5 font-mono">
                  <Phone size={11} strokeWidth={2} />
                  {c.phone_number || '—'}
                </span>
                
                {/* Status Dropdown */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={c.status}
                    onChange={(e) => handleStatusChange(c, e.target.value as any)}
                    className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-lg text-[10px] font-bold px-2 py-1 h-[28px] min-h-[28px] focus:outline-none text-[#1A1A1A] cursor-pointer"
                  >
                    <option value="new">New</option>
                    <option value="shortlisted">Shortlisted</option>
                    <option value="on_hold">On Hold</option>
                    <option value="hired">Hired</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ADD CANDIDATE BOTTOM SHEET */}
      {isAddOpen && (
        <div className="fixed inset-0 z-[12000] bg-black/60 backdrop-blur-sm flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setIsAddOpen(false)} />
          <div className="bg-white border-t border-[#E8E8E8] rounded-t-[24px] max-w-[480px] w-full max-h-[92vh] flex flex-col z-[12001] animate-slide-up relative">
            
            {/* Grab bar */}
            <div className="w-12 h-1.5 bg-[#E0E0E0] rounded-full mx-auto my-3 flex-shrink-0" />
            
            {/* Sheet Title */}
            <div className="flex items-center justify-between px-5 pb-3 border-b border-[#F0F0F0] flex-shrink-0">
              <span className="text-xs font-black uppercase tracking-wider text-[#1A1A1A]">Add Candidate</span>
              <button
                onClick={() => setIsAddOpen(false)}
                className="w-7 h-7 rounded-full bg-[#F0F0F0] text-[#1A1A1A] flex items-center justify-center cursor-pointer active:scale-90"
              >
                <X size={14} />
              </button>
            </div>

            {/* Form Fields container */}
            <form onSubmit={handleSaveCandidate} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter candidate's full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full"
                  required
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +91 9876543210"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full font-mono"
                />
              </div>

              {/* Branch */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Branch Interested
                </label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value as any)}
                  className="w-full"
                >
                  <option value="daily">Nearbi Daily</option>
                  <option value="hypermarket">Nearbi Hypermarket</option>
                </select>
              </div>

              {/* Departments checklist */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Departments Interested <span className="text-red-500">*</span> (Select 1+)
                </label>
                <div className="grid grid-cols-2 gap-2 border border-[#E8E8E8] rounded-xl p-3 bg-[#F8F8F8] max-h-[160px] overflow-y-auto">
                  {DEPARTMENTS.map((dept) => (
                    <label key={dept} className="flex items-center space-x-2 text-xs font-semibold text-[#1A1A1A] cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={selectedDepts.includes(dept)}
                        onChange={() => handleDeptCheckbox(dept)}
                        className="rounded border-[#E8E8E8] text-[#1A1A1A] focus:ring-[#1A1A1A] w-4 h-4"
                      />
                      <span>{dept}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Experience */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Brief background or experience
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 2 years billing exp at supermarket"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full text-xs"
                />
              </div>

              {/* Walk-in Date */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Walk-in Date
                </label>
                <input
                  type="date"
                  value={walkInDate}
                  onChange={(e) => setWalkInDate(e.target.value)}
                  className="w-full font-mono text-xs"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Initial Status
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  className="w-full"
                >
                  <option value="new">New</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="on_hold">On Hold</option>
                  <option value="hired">Hired</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Enable Trial Kiosk Access */}
              <div className="flex items-center space-x-2 py-1">
                <input
                  type="checkbox"
                  id="enable-trial-kiosk"
                  checked={trialKioskActive}
                  onChange={(e) => setTrialKioskActive(e.target.checked)}
                  className="rounded border-[#E8E8E8] text-[#1A1A1A] focus:ring-[#1A1A1A] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="enable-trial-kiosk" className="text-xs font-bold text-[#1a1a1a] cursor-pointer selection:bg-transparent select-none">
                  Enable trial kiosk access (before hiring)
                </label>
              </div>

              {/* Photo Upload (Selfie - Required) */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Candidate Photo <span className="text-red-500">*</span>
                </label>
                {photoPreview ? (
                  <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-[#E8E8E8] group">
                    <img src={photoPreview} alt="Selfie preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoPreview(null);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-28 h-28 bg-[#F8F8F8] border border-dashed border-[#CCCCCC] rounded-xl cursor-pointer hover:bg-[#F2F2F2] transition-colors">
                    <Camera size={20} className="text-[#999999] mb-1.5" />
                    <span className="text-[9px] font-bold text-[#555555] uppercase tracking-wider">Take selfie</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPhotoFile(file);
                          setPhotoPreview(URL.createObjectURL(file));
                        }
                      }}
                      className="hidden"
                      required
                    />
                  </label>
                )}
              </div>

              {/* ID Document Photo (Optional) */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  ID or Document Photo
                </label>
                {idPhotoPreview ? (
                  <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-[#E8E8E8] group">
                    <img src={idPhotoPreview} alt="ID preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setIdPhotoFile(null);
                        setIdPhotoPreview(null);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center active:scale-90"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-28 h-28 bg-[#F8F8F8] border border-dashed border-[#CCCCCC] rounded-xl cursor-pointer hover:bg-[#F2F2F2] transition-colors">
                    <Paperclip size={20} className="text-[#999999] mb-1.5" />
                    <span className="text-[9px] font-bold text-[#555555] uppercase tracking-wider">Upload ID</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setIdPhotoFile(file);
                          setIdPhotoPreview(URL.createObjectURL(file));
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Any additional remarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs"
                />
              </div>

              {/* Action buttons */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[44px] bg-[#1A1A1A] text-white hover:bg-[#333333] active:scale-[0.98] font-bold text-xs rounded-xl transition-all shadow flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {submitting ? (
                    <span>Uploading & Saving...</span>
                  ) : (
                    <>
                      <Save size={14} />
                      <span>Save Candidate</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANDIDATE DETAIL VIEW BOTTOM SHEET */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-[12000] bg-black/60 backdrop-blur-sm flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setSelectedCandidate(null)} />
          <div className="bg-white border-t border-[#E8E8E8] rounded-t-[24px] max-w-[480px] w-full max-h-[92vh] flex flex-col z-[12001] animate-slide-up relative">
            
            {/* Grab bar */}
            <div className="w-12 h-1.5 bg-[#E0E0E0] rounded-full mx-auto my-3 flex-shrink-0" />
            
            {/* Sheet Title & Close */}
            <div className="flex items-center justify-between px-5 pb-3 border-b border-[#F0F0F0] flex-shrink-0">
              <span className="text-xs font-black uppercase tracking-wider text-[#1A1A1A]">Candidate Profile</span>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="w-7 h-7 rounded-full bg-[#F0F0F0] text-[#1A1A1A] flex items-center justify-center cursor-pointer active:scale-90"
              >
                <X size={14} />
              </button>
            </div>

            {/* Profile Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              
              {/* Photo & Name Grid */}
              <div className="flex items-center space-x-4">
                {selectedCandidate.photo_url ? (
                  <img
                    src={selectedCandidate.photo_url}
                    alt={selectedCandidate.full_name}
                    onClick={() => setFullscreenPhoto({ url: selectedCandidate.photo_url!, title: 'Candidate Photo' })}
                    className="w-20 h-20 rounded-xl object-cover border border-[#E8E8E8] cursor-pointer hover:opacity-90 active:scale-95 transition-all flex-shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-[#1A1A1A] text-white font-bold text-2xl flex items-center justify-center flex-shrink-0">
                    {selectedCandidate.full_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="space-y-1">
                  <h2 className="text-base font-extrabold text-[#1A1A1A]">{selectedCandidate.full_name}</h2>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedCandidate.departments.map((dept) => (
                      <span
                        key={dept}
                        className="text-[9px] font-bold bg-[#F2F2F2] text-[#555555] border border-[#E8E8E8] px-2 py-0.5 rounded-md"
                      >
                        {dept}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Former Employee Warning Card */}
              {(() => {
                const match = getResignedMatch(selectedCandidate.full_name, selectedCandidate.phone_number);
                if (!match) return null;
                const eligible = match.resignation?.rehire_eligible;
                const rehireNoteText = match.resignation?.rehire_note;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1.5">
                    <div className="flex items-center space-x-2 text-amber-800 text-xs font-black uppercase tracking-wider">
                      <AlertTriangle size={16} className="text-amber-600" />
                      <span>Warning: Former Employee Detected</span>
                    </div>
                    <p className="text-xs text-amber-700 font-bold">
                      Rehire Eligibility: <span className="font-extrabold text-amber-900 underline">{eligible === true ? 'Eligible for Rehire ✓' : eligible === false ? 'NOT Eligible for Rehire ✗' : 'Clearance Pending'}</span>
                    </p>
                    {rehireNoteText && (
                      <p className="text-[11px] text-amber-700 bg-amber-100/50 p-2 rounded-lg italic font-medium">
                        Note: "{rehireNoteText}"
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Status Picker Panel */}
              <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="block text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">Recruitment Pipeline</span>
                  <span className="text-xs font-bold text-[#1A1A1A] mt-1 block">Current: <span className="capitalize">{selectedCandidate.status}</span></span>
                </div>
                <select
                  value={selectedCandidate.status}
                  onChange={(e) => handleStatusChange(selectedCandidate, e.target.value as any)}
                  className="bg-white border border-[#E8E8E8] rounded-lg text-xs font-bold px-3 py-1.5 h-[34px] min-h-[34px] text-[#1A1A1A] focus:outline-none cursor-pointer shadow-sm"
                >
                  <option value="new">New</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="on_hold">On Hold</option>
                  <option value="hired">Hired</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Document/ID Card upload (if exists) */}
              {selectedCandidate.id_photo_url ? (
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-[var(--text-muted)] uppercase tracking-wider">
                    ID / Document Photo
                  </label>
                  <img
                    src={selectedCandidate.id_photo_url}
                    alt="ID Document"
                    onClick={() => setFullscreenPhoto({ url: selectedCandidate.id_photo_url!, title: 'ID/Document Photo' })}
                    className="w-full max-h-[140px] rounded-xl object-cover border border-[#E8E8E8] cursor-pointer hover:opacity-90 active:scale-95 transition-all"
                  />
                </div>
              ) : (
                <div className="bg-dashed border border-[#E0E0E0] rounded-xl p-3 text-center text-xs text-[var(--text-muted)] italic">
                  No ID/Document photo uploaded.
                </div>
              )}

              {/* Walk-in Info */}
              <div className="grid grid-cols-2 gap-3.5 border-t border-b border-[#F0F0F0] py-3.5">
                <div>
                  <span className="block text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">Walk-in Date</span>
                  <span className="text-xs font-extrabold text-[#1A1A1A] mt-1 block">{formatDate(selectedCandidate.walk_in_date)}</span>
                </div>
                <div>
                  <span className="block text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">Branch Selection</span>
                  <span className="text-xs font-extrabold text-[#1A1A1A] mt-1 block">
                    {selectedCandidate.branch_id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket'}
                  </span>
                </div>
              </div>

              {/* Experience Details */}
              <div>
                <span className="block text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider">Background & Experience</span>
                <p className="text-xs font-semibold text-[#555555] bg-[#F8F8F8] border border-[#E8E8E8] p-3 rounded-xl mt-1 leading-relaxed whitespace-pre-line">
                  {selectedCandidate.experience || 'No experience details specified.'}
                </p>
              </div>

              {/* Inline Notes Auto-save */}
              <div>
                <span className="block text-[9px] font-black text-[var(--text-muted)] uppercase tracking-wider mb-1">
                  Candidate Notes (Tap to edit — auto-saves)
                </span>
                <textarea
                  ref={inlineNotesRef}
                  defaultValue={selectedCandidate.notes || ''}
                  onBlur={(e) => handleNotesBlur(selectedCandidate, e.target.value)}
                  placeholder="Add comments or interview remarks..."
                  rows={3}
                  className="w-full text-xs leading-relaxed"
                />
              </div>

              {/* Trial Kiosk Access Toggle */}
              <div className="flex items-center space-x-2 py-2 border-t border-[#F0F0F0]">
                <input
                  type="checkbox"
                  id="detail-trial-kiosk"
                  checked={selectedCandidate.trial_kiosk_active || false}
                  onChange={(e) => handleToggleTrialKioskAccess(selectedCandidate, e.target.checked)}
                  className="rounded border-[#E8E8E8] text-[#1A1A1A] focus:ring-[#1A1A1A] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="detail-trial-kiosk" className="text-xs font-bold text-[#1a1a1a] cursor-pointer selection:bg-transparent select-none">
                  Enable trial kiosk access (before hiring)
                </label>
              </div>

              {/* Convert to Full Staff button */}
              {selectedCandidate.status === 'hired' && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleConvertToFullStaff(selectedCandidate)}
                    className="w-full min-h-[44px] bg-[#2D7A3A] text-white hover:bg-[#256330] font-bold text-xs rounded-xl transition-all shadow flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95 mb-2"
                  >
                    <span>Convert to Full Staff</span>
                  </button>
                </div>
              )}

              {/* Danger Actions: Delete Candidate */}
              <div className="border-t border-[#F0F0F0] pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleDeleteCandidate(selectedCandidate)}
                  className="flex-1 min-h-[44px] bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-[var(--danger)] hover:bg-[var(--danger-bg)]/80 font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Delete Candidate</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN PHOTO PREVIEW MODAL */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 z-[15000] bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setFullscreenPhoto(null)}
        >
          <div className="absolute top-4 right-4 flex items-center justify-between w-full px-4">
            <span className="text-white text-xs font-extrabold uppercase tracking-widest">{fullscreenPhoto.title}</span>
            <button
              onClick={() => setFullscreenPhoto(null)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-90"
            >
              <X size={16} />
            </button>
          </div>
          <img
            src={fullscreenPhoto.url}
            alt="Fullscreen preview"
            className="max-w-full max-h-[85vh] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[16000] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-black text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

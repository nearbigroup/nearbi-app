'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  RefreshCw,
  Search,
  Building2,
  Calendar,
  AlertTriangle,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

interface QueueItem {
  id: string; // unique item key
  staff_id: string;
  staff_name: string;
  branch_id: string;
  doc_type: string;
  field_name: 'aadhaar' | 'pan' | 'bank' | 'passport' | 'driving_licence' | string; // DB field or cert id
  doc_url: string;
  uploaded_at: string;
  is_profile_doc: boolean;
  doc_name?: string;
  id_number?: string; // e.g. Aadhaar number, account number
  expiry?: string | null;
}

export default function VerificationQueuePage() {
  const { user, userBranch, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Selected item detail modal
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [signedUrl, setSignedUrl] = useState<string>('');
  const [loadingSignedUrl, setLoadingSignedUrl] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Role protection
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/');
        return;
      }
      const allowedRoles = ['admin', 'ops_manager', 'staff_executive'];
      if (!allowedRoles.includes(user.role)) {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, router]);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const items: QueueItem[] = [];

      // 1. Fetch Profile Pending Documents
      const { data: profiles, error: profErr } = await supabase
        .from('staff_profiles')
        .select('*, staff:staff_id(name, branch_id, active)')
        .eq('staff.active', true);

      if (profErr) throw profErr;

      if (profiles) {
        profiles.forEach((p: any) => {
          if (!p.staff) return; // Skip if staff is inactive/missing

          // Aadhaar
          if (p.aadhaar_photo_url && p.aadhaar_verification_status === 'pending') {
            items.push({
              id: `prof_aadhaar_${p.id}`,
              staff_id: p.staff_id,
              staff_name: p.staff.name,
              branch_id: p.staff.branch_id,
              doc_type: 'Aadhaar Card',
              field_name: 'aadhaar',
              doc_url: p.aadhaar_photo_url,
              uploaded_at: p.updated_at,
              is_profile_doc: true,
              id_number: p.aadhaar_number
            });
          }

          // PAN
          if (p.pan_photo_url && p.pan_verification_status === 'pending') {
            items.push({
              id: `prof_pan_${p.id}`,
              staff_id: p.staff_id,
              staff_name: p.staff.name,
              branch_id: p.staff.branch_id,
              doc_type: 'PAN Card',
              field_name: 'pan',
              doc_url: p.pan_photo_url,
              uploaded_at: p.updated_at,
              is_profile_doc: true,
              id_number: p.pan_number
            });
          }

          // Bank Proof
          if (p.bank_proof_url && p.bank_verification_status === 'pending') {
            items.push({
              id: `prof_bank_${p.id}`,
              staff_id: p.staff_id,
              staff_name: p.staff.name,
              branch_id: p.staff.branch_id,
              doc_type: 'Bank Proof (Passbook/Cheque)',
              field_name: 'bank',
              doc_url: p.bank_proof_url,
              uploaded_at: p.updated_at,
              is_profile_doc: true,
              id_number: `${p.bank_name || 'Bank'} - A/C: ${p.bank_account_number || ''}`
            });
          }

          // Passport
          if (p.passport_photo_url && p.passport_verification_status === 'pending') {
            items.push({
              id: `prof_passport_${p.id}`,
              staff_id: p.staff_id,
              staff_name: p.staff.name,
              branch_id: p.staff.branch_id,
              doc_type: 'Passport',
              field_name: 'passport',
              doc_url: p.passport_photo_url,
              uploaded_at: p.updated_at,
              is_profile_doc: true,
              id_number: p.passport_number,
              expiry: p.passport_expiry
            });
          }

          // Driving Licence
          if (p.driving_licence_photo_url && p.driving_licence_verification_status === 'pending') {
            items.push({
              id: `prof_dl_${p.id}`,
              staff_id: p.staff_id,
              staff_name: p.staff.name,
              branch_id: p.staff.branch_id,
              doc_type: 'Driving Licence',
              field_name: 'driving_licence',
              doc_url: p.driving_licence_photo_url,
              uploaded_at: p.updated_at,
              is_profile_doc: true,
              id_number: p.driving_licence_number,
              expiry: p.driving_licence_expiry
            });
          }
        });
      }

      // 2. Fetch staff_documents (certificates)
      const { data: certs, error: certsErr } = await supabase
        .from('staff_documents')
        .select('*, staff:staff_id(name, branch_id, active)')
        .eq('verification_status', 'pending')
        .eq('staff.active', true);

      if (certsErr) throw certsErr;

      if (certs) {
        certs.forEach((c: any) => {
          if (!c.staff) return;
          items.push({
            id: `cert_${c.id}`,
            staff_id: c.staff_id,
            staff_name: c.staff.name,
            branch_id: c.staff.branch_id,
            doc_type: c.doc_type === 'education_certificate' ? 'Education Certificate' : c.doc_type === 'experience_certificate' ? 'Experience Certificate' : 'Other Attachment',
            field_name: c.id, // Stores cert UUID
            doc_url: c.doc_url,
            uploaded_at: c.uploaded_at,
            is_profile_doc: false,
            doc_name: c.doc_name
          });
        });
      }

      // Filter branch scope
      let filtered = items;
      if (userBranch) {
        filtered = items.filter(item => item.branch_id === userBranch);
      }

      // Sort by uploaded date (oldest first to process in order)
      filtered.sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());

      setQueue(filtered);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to fetch verification queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchQueue();
    }
  }, [user, userBranch]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Generate signed URL for selected document preview
  const handleOpenItem = async (item: QueueItem) => {
    setSelectedItem(item);
    setRejectionReason('');
    setSignedUrl('');
    setLoadingSignedUrl(true);
    try {
      const { data, error } = await supabase.storage
        .from('staff-documents')
        .createSignedUrl(item.doc_url, 3600); // 1 hour validity

      if (error) throw error;
      if (data?.signedUrl) {
        setSignedUrl(data.signedUrl);
      }
    } catch (err) {
      console.error('Error creating signed preview URL:', err);
      alert('Failed to load document preview.');
    } finally {
      setLoadingSignedUrl(false);
    }
  };

  // Verify/Reject action submitter
  const handleAction = async (status: 'verified' | 'rejected') => {
    if (!selectedItem || !user) return;
    if (status === 'rejected' && !rejectionReason.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }

    setSubmittingAction(true);
    try {
      const managerName = user.name || user.email || 'Management';
      const timestamp = new Date().toISOString();

      if (selectedItem.is_profile_doc) {
        // Update staff_profiles table columns dynamically
        const fieldName = selectedItem.field_name;
        const statusKey = `${fieldName}_verification_status`;
        const reasonKey = `${fieldName}_rejection_reason`;
        const verifiedByKey = `${fieldName}_verified_by`;
        const verifiedAtKey = `${fieldName}_verified_at`;

        const updatePayload = {
          [statusKey]: status,
          [reasonKey]: status === 'rejected' ? rejectionReason.trim() : null,
          [verifiedByKey]: managerName,
          [verifiedAtKey]: timestamp
        };

        const { error } = await supabase
          .from('staff_profiles')
          .update(updatePayload)
          .eq('staff_id', selectedItem.staff_id);

        if (error) throw error;
      } else {
        // Update staff_documents table row
        const updatePayload = {
          verification_status: status,
          rejection_reason: status === 'rejected' ? rejectionReason.trim() : null,
          verified_by: managerName,
          verified_at: timestamp
        };

        const { error } = await supabase
          .from('staff_documents')
          .update(updatePayload)
          .eq('id', selectedItem.field_name); // field_name holds cert ID

        if (error) throw error;
      }

      showToast(`Document marked as ${status} ✓`);
      setSelectedItem(null);
      fetchQueue();
    } catch (err: any) {
      console.error(err);
      alert('Action failed: ' + err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[40px] w-1/3" />
        <div className="skeleton h-[50px] w-full" />
        <div className="skeleton h-[120px] w-full" />
        <div className="skeleton h-[120px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Back Bar */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => router.push('/dashboard')}
          className="w-10 h-10 rounded-full border border-[#E8E8E8] bg-white flex items-center justify-center text-[#555555] hover:text-[#1A1A1A] active:scale-90 transition-transform cursor-pointer shadow-sm"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#999999]">Clearance Queues</span>
          <h1 className="text-xl font-extrabold text-[#1A1A1A] leading-tight">Document Verification</h1>
        </div>
      </div>

      {errorMsg ? (
        <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 text-center max-w-sm mx-auto flex flex-col items-center justify-center shadow-sm">
          <AlertCircle size={40} strokeWidth={1.5} className="text-[#C0392B] mb-2" />
          <h3 className="text-sm font-bold text-[#1A1A1A] mb-1">{errorMsg}</h3>
          <button
            onClick={fetchQueue}
            className="mt-4 px-4 py-2 bg-[#1A1A1A] text-white text-xs font-bold rounded-lg shadow cursor-pointer active:scale-95"
          >
            Retry
          </button>
        </div>
      ) : queue.length === 0 ? (
        <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-8 text-center flex flex-col items-center justify-center shadow-sm">
          <CheckCircle2 size={44} strokeWidth={1.5} className="text-emerald-500 mb-2" />
          <h3 className="text-sm font-bold text-[#1A1A1A]">All documents verified!</h3>
          <p className="text-xs text-[#999999] mt-1">
            There are no pending profile documents or certificates awaiting approval.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[#555555] font-semibold">
            Showing <span className="font-bold text-[#1A1A1A]">{queue.length}</span> documents pending verification.
          </p>
          
          <div className="space-y-2.5">
            {queue.map(item => (
              <div
                key={item.id}
                onClick={() => handleOpenItem(item)}
                className="bg-white border border-[#E8E8E8] rounded-[16px] p-4 flex items-center justify-between hover:border-[#B0B0B0] transition-colors cursor-pointer shadow-sm group"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="font-extrabold text-sm text-[#1A1A1A] leading-tight">
                    {item.staff_name}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#555555] font-semibold">
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[9px] text-[#555555] font-black uppercase">
                      {item.doc_type}
                    </span>
                    {item.doc_name && (
                      <span className="text-[#999999]">"{item.doc_name}"</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2.5 text-[9.5px] text-[#999999] font-bold">
                    <span className="flex items-center gap-0.5">
                      <Building2 size={10} />
                      {item.branch_id === 'daily' ? 'Daily' : 'Hypermarket'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <Calendar size={10} />
                      Uploaded: {new Date(item.uploaded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>

                <ChevronRight
                  size={16}
                  className="text-[#BBBBBB] group-hover:text-[#1A1A1A] group-hover:translate-x-0.5 transition-all ml-2"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expanded item details modal drawer */}
      {selectedItem && (
        <div className="fixed inset-0 z-[12000] bg-black/60 backdrop-blur-xs flex items-end justify-center">
          <div className="fixed inset-0" onClick={() => setSelectedItem(null)} />
          <div className="bg-white border-t border-[#E8E8E8] rounded-t-[24px] max-w-[480px] w-full max-h-[92vh] flex flex-col z-[12001] animate-slide-up relative">
            
            {/* Grab bar */}
            <div className="w-12 h-1.5 bg-[#E0E0E0] rounded-full mx-auto my-3 flex-shrink-0" />

            <div className="flex items-center justify-between px-5 pb-3 border-b border-[#F0F0F0] flex-shrink-0">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-[#999999]">Verify Document</span>
                <h3 className="text-sm font-extrabold text-[#1A1A1A]">{selectedItem.staff_name}</h3>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-7 h-7 rounded-full bg-[#F0F0F0] text-[#1A1A1A] flex items-center justify-center cursor-pointer active:scale-90 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs font-semibold text-[#555555]">
              <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 space-y-2">
                <p>Document Type: <span className="text-[#1A1A1A] font-extrabold">{selectedItem.doc_type}</span></p>
                {selectedItem.doc_name && (
                  <p>Label/Name: <span className="text-[#1A1A1A] font-extrabold">"{selectedItem.doc_name}"</span></p>
                )}
                {selectedItem.id_number && (
                  <p>Document ID / Details: <span className="text-[#1A1A1A] font-bold font-mono bg-white px-2 py-0.5 rounded border border-[#E8E8E8]">{selectedItem.id_number}</span></p>
                )}
                {selectedItem.expiry && (
                  <p className="text-[#C0392B]">Expiry Date: <span className="font-bold">{new Date(selectedItem.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                )}
                <p>Uploaded Date: <span className="text-[#1A1A1A] font-bold">{new Date(selectedItem.uploaded_at).toLocaleString()}</span></p>
              </div>

              {/* Document Preview Box */}
              <div>
                <span className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1.5">File Preview</span>
                {loadingSignedUrl ? (
                  <div className="h-48 border border-dashed border-[#E8E8E8] rounded-xl flex items-center justify-center bg-[#F8F8F8]">
                    <RefreshCw size={20} className="animate-spin text-[#999999]" />
                  </div>
                ) : signedUrl ? (
                  <div className="border border-[#E8E8E8] rounded-xl overflow-hidden bg-[#F8F8F8] flex flex-col items-center justify-center">
                    {selectedItem.doc_url.toLowerCase().endsWith('.pdf') ? (
                      <div className="p-8 text-center space-y-3.5">
                        <FileText size={48} className="text-gray-400 mx-auto" />
                        <p className="font-bold text-xs text-[#1A1A1A]">PDF Document Uploaded</p>
                        <a
                          href={signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 bg-[#1A1A1A] hover:bg-[#333333] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all shadow cursor-pointer"
                        >
                          Open PDF in New Tab
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    ) : (
                      <div className="relative w-full max-h-60 overflow-hidden flex items-center justify-center">
                        <img
                          src={signedUrl}
                          alt="Preview"
                          className="max-w-full max-h-60 object-contain hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-48 border border-dashed border-[#E8E8E8] rounded-xl flex flex-col items-center justify-center text-center p-4 bg-[#F8F8F8]">
                    <AlertTriangle size={24} className="text-[#C0392B] mb-1" />
                    <p className="text-xs font-bold text-[#1A1A1A]">Preview not available</p>
                  </div>
                )}
              </div>

              {/* Action rejection reason */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider">Rejection Notes (Only required if rejecting)</label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="e.g. Aadhaar image blurred, IFSC number incorrect..."
                  rows={2}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs text-[#1A1A1A] focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2 flex-shrink-0">
                <button
                  onClick={() => handleAction('rejected')}
                  disabled={submittingAction}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold text-xs py-2.5 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                >
                  <XCircle size={14} />
                  <span>Reject</span>
                </button>
                <button
                  onClick={() => handleAction('verified')}
                  disabled={submittingAction}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs py-2.5 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                >
                  <CheckCircle2 size={14} />
                  <span>Verify & Approve</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Simple Toast Alerts */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[15000] bg-[#EDF7EF] border border-[#2D7A3A] text-[#2D7A3A] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-1">
          <CheckCircle2 size={14} className="text-[#2D7A3A]" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

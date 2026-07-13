'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  User,
  LogOut,
  Lock,
  Calendar,
  Briefcase,
  Smartphone,
  ChevronDown,
  ChevronRight,
  Upload,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Building,
  MapPin,
  CreditCard,
  AlertCircle,
  Stethoscope,
  Eye,
  RefreshCw,
  Award
} from 'lucide-react';
import { formatTime12hr } from '@/lib/utils';

interface EmergencyContact {
  id?: string;
  name: string;
  relation: string;
  phone: string;
}

interface DocumentItem {
  id: string;
  doc_type: 'education_certificate' | 'experience_certificate' | 'other';
  doc_url: string;
  doc_name: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  rejection_reason: string | null;
}

interface ProfileData {
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  marital_status: string | null;
  personal_phone: string | null;
  personal_email: string | null;
  current_address: string | null;
  permanent_address: string | null;
  aadhaar_number: string | null;
  aadhaar_photo_url: string | null;
  aadhaar_verification_status: 'pending' | 'verified' | 'rejected';
  aadhaar_rejection_reason: string | null;
  pan_number: string | null;
  pan_photo_url: string | null;
  pan_verification_status: 'pending' | 'verified' | 'rejected';
  pan_rejection_reason: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  bank_proof_url: string | null;
  bank_verification_status: 'pending' | 'verified' | 'rejected';
  bank_rejection_reason: string | null;
  passport_number: string | null;
  passport_photo_url: string | null;
  passport_expiry: string | null;
  passport_verification_status: 'pending' | 'verified' | 'rejected';
  passport_rejection_reason: string | null;
  driving_licence_number: string | null;
  driving_licence_photo_url: string | null;
  driving_licence_expiry: string | null;
  driving_licence_verification_status: 'pending' | 'verified' | 'rejected';
  driving_licence_rejection_reason: string | null;
  profile_photo_url: string | null;
  medical_notes: string | null;
}

export default function StaffProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [staffInfo, setStaffInfo] = useState<any>(null);
  
  // Accordion Toggles
  const [openSection, setOpenSection] = useState<string | null>('personal');

  // Form States
  const [profile, setProfile] = useState<ProfileData>({
    dob: null,
    gender: '',
    blood_group: '',
    marital_status: '',
    personal_phone: '',
    personal_email: '',
    current_address: '',
    permanent_address: '',
    aadhaar_number: '',
    aadhaar_photo_url: null,
    aadhaar_verification_status: 'pending',
    aadhaar_rejection_reason: null,
    pan_number: '',
    pan_photo_url: null,
    pan_verification_status: 'pending',
    pan_rejection_reason: null,
    bank_account_number: '',
    bank_ifsc: '',
    bank_name: '',
    bank_proof_url: null,
    bank_verification_status: 'pending',
    bank_rejection_reason: null,
    passport_number: '',
    passport_photo_url: null,
    passport_expiry: null,
    passport_verification_status: 'pending',
    passport_rejection_reason: null,
    driving_licence_number: '',
    driving_licence_photo_url: null,
    driving_licence_expiry: null,
    driving_licence_verification_status: 'pending',
    driving_licence_rejection_reason: null,
    profile_photo_url: null,
    medical_notes: ''
  });

  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([
    { name: '', relation: 'Father', phone: '' },
    { name: '', relation: 'Mother', phone: '' }
  ]);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  
  // Document uploading state
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  // Signed previews urls for uploaded documents
  const [previews, setPreviews] = useState<Record<string, string>>({});

  // Certificate upload state
  const [certType, setCertType] = useState<'education_certificate' | 'experience_certificate' | 'other'>('education_certificate');
  const [certName, setCertName] = useState('');
  const [certFile, setCertFile] = useState<File | null>(null);
  const [uploadingCert, setUploadingCert] = useState(false);

  // General saving state
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [recognitions, setRecognitions] = useState<any[]>([]);

  const fetchProfileDetails = async () => {
    if (!user || !user.staffId) return;
    try {
      setLoading(true);

      // 1. Fetch Staff Core Info
      const { data: sData, error: sErr } = await supabase
        .from('staff')
        .select('*, shift:shifts(*)')
        .eq('id', user.staffId)
        .single();
      if (sErr) throw sErr;
      setStaffInfo(sData);

      // 2. Fetch Profile details
      const { data: pData, error: pErr } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('staff_id', user.staffId)
        .maybeSingle();

      if (pData) {
        setProfile({
          dob: pData.dob,
          gender: pData.gender || '',
          blood_group: pData.blood_group || '',
          marital_status: pData.marital_status || '',
          personal_phone: pData.personal_phone || '',
          personal_email: pData.personal_email || '',
          current_address: pData.current_address || '',
          permanent_address: pData.permanent_address || '',
          aadhaar_number: pData.aadhaar_number || '',
          aadhaar_photo_url: pData.aadhaar_photo_url,
          aadhaar_verification_status: pData.aadhaar_verification_status || 'pending',
          aadhaar_rejection_reason: pData.aadhaar_rejection_reason,
          pan_number: pData.pan_number || '',
          pan_photo_url: pData.pan_photo_url,
          pan_verification_status: pData.pan_verification_status || 'pending',
          pan_rejection_reason: pData.pan_rejection_reason,
          bank_account_number: pData.bank_account_number || '',
          bank_ifsc: pData.bank_ifsc || '',
          bank_name: pData.bank_name || '',
          bank_proof_url: pData.bank_proof_url,
          bank_verification_status: pData.bank_verification_status || 'pending',
          bank_rejection_reason: pData.bank_rejection_reason,
          passport_number: pData.passport_number || '',
          passport_photo_url: pData.passport_photo_url,
          passport_expiry: pData.passport_expiry,
          passport_verification_status: pData.passport_verification_status || 'pending',
          passport_rejection_reason: pData.passport_rejection_reason,
          driving_licence_number: pData.driving_licence_number || '',
          driving_licence_photo_url: pData.driving_licence_photo_url,
          driving_licence_expiry: pData.driving_licence_expiry,
          driving_licence_verification_status: pData.driving_licence_verification_status || 'pending',
          driving_licence_rejection_reason: pData.driving_licence_rejection_reason,
          profile_photo_url: pData.profile_photo_url,
          medical_notes: pData.medical_notes || ''
        });

        // Load signed URLs for photos
        const fieldsToPreload = [
          { key: 'profile_photo', path: pData.profile_photo_url },
          { key: 'aadhaar_photo', path: pData.aadhaar_photo_url },
          { key: 'pan_photo', path: pData.pan_photo_url },
          { key: 'bank_proof', path: pData.bank_proof_url },
          { key: 'passport_photo', path: pData.passport_photo_url },
          { key: 'driving_licence_photo', path: pData.driving_licence_photo_url }
        ];

        for (const item of fieldsToPreload) {
          if (item.path) {
            loadSignedPreview(item.key, item.path);
          }
        }
      }

      // 3. Fetch Emergency Contacts
      const { data: contactsData } = await supabase
        .from('staff_emergency_contacts')
        .select('*')
        .eq('staff_id', user.staffId);

      if (contactsData && contactsData.length > 0) {
        setEmergencyContacts(contactsData.map(c => ({
          id: c.id,
          name: c.name,
          relation: c.relation,
          phone: c.phone
        })));
      }

      // 4. Fetch Certificates
      const { data: docsData } = await supabase
        .from('staff_documents')
        .select('*')
        .eq('staff_id', user.staffId);

      if (docsData) {
        setDocuments(docsData);
        // Load signed URLs for certs
        for (const doc of docsData) {
          if (doc.doc_url) {
            loadSignedPreview(`doc_${doc.id}`, doc.doc_url);
          }
        }
      }

      // 5. Fetch Recognitions
      const { data: recData } = await supabase
        .from('staff_recognition')
        .select('*')
        .eq('staff_id', user.staffId)
        .order('awarded_at', { ascending: false });
      if (recData) {
        setRecognitions(recData);
      }

    } catch (e) {
      console.error('Error loading profile info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProfileDetails();
    }
  }, [user]);

  const loadSignedPreview = async (key: string, path: string) => {
    try {
      if (!path) return;
      // If path already starts with http, it is a public URL (old system)
      if (path.startsWith('http')) {
        setPreviews(prev => ({ ...prev, [key]: path }));
        return;
      }

      const { data, error } = await supabase.storage
        .from('staff-documents')
        .createSignedUrl(path, 3600); // 1 hour signed URL

      if (error) throw error;
      if (data?.signedUrl) {
        setPreviews(prev => ({ ...prev, [key]: data.signedUrl }));
      }
    } catch (e) {
      console.error(`Error signing preview for ${key}:`, e);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Completion Progress calculation
  const calculateCompletion = () => {
    let completedCount = 0;

    // 1. Personal (5 items)
    if (profile.dob) completedCount++;
    if (profile.gender) completedCount++;
    if (profile.blood_group) completedCount++;
    if (profile.marital_status) completedCount++;
    if (profile.profile_photo_url) completedCount++;

    // 2. Contact (4 items)
    if (profile.personal_phone?.trim()) completedCount++;
    if (profile.personal_email?.trim()) completedCount++;
    if (profile.current_address?.trim()) completedCount++;
    if (profile.permanent_address?.trim()) completedCount++;

    // 3. Emergency Contacts (1 item if >= 2 contacts completely filled)
    const validContactsCount = emergencyContacts.filter(
      c => c.name?.trim() && c.relation?.trim() && c.phone?.trim()
    ).length;
    if (validContactsCount >= 2) completedCount++;

    // 4. Government ID (2 items)
    if (profile.aadhaar_number?.trim() && profile.aadhaar_number.replace(/\s+/g, '').length === 12) completedCount++;
    if (profile.aadhaar_photo_url) completedCount++;

    // 5. Bank Details (4 items)
    if (profile.bank_account_number?.trim()) completedCount++;
    if (profile.bank_ifsc?.trim()) completedCount++;
    if (profile.bank_name?.trim()) completedCount++;
    if (profile.bank_proof_url) completedCount++;

    const percent = Math.round((completedCount / 16) * 100);
    return { percent, completedCount };
  };

  const { percent: completionPercent } = calculateCompletion();

  // Expiry Banner Check
  const getExpiryWarnings = () => {
    const warnings: string[] = [];
    const today = new Date();
    const limit = new Date();
    limit.setDate(today.getDate() + 30);

    if (profile.passport_expiry) {
      const expDate = new Date(profile.passport_expiry);
      if (expDate > today && expDate <= limit) {
        const diff = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        warnings.push(`Passport expires in ${diff} days — please update.`);
      }
    }

    if (profile.driving_licence_expiry) {
      const expDate = new Date(profile.driving_licence_expiry);
      if (expDate > today && expDate <= limit) {
        const diff = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        warnings.push(`Driving licence expires in ${diff} days — please update.`);
      }
    }

    return warnings;
  };

  const expiryWarnings = getExpiryWarnings();

  // Generic File Upload Handler
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0];
    if (!file || !user?.staffId) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds the 10 MB limit.');
      return;
    }

    setUploadingField(fieldName);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `staff/${user.staffId}/${Date.now()}_${fieldName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('staff-documents')
        .upload(path, file, {
          contentType: file.type,
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Update local state
      const photoUrlKey = `${fieldName}_url`;
      const statusKey = `${fieldName}_verification_status`;
      
      const updatedProfile = {
        ...profile,
        [photoUrlKey]: path,
        ...(fieldName !== 'profile_photo' ? { [statusKey]: 'pending' } : {})
      };

      setProfile(updatedProfile);

      // Save database link immediately
      const profilePayload = {
        staff_id: user.staffId,
        [photoUrlKey]: path,
        ...(fieldName !== 'profile_photo' ? { [statusKey]: 'pending' } : {}),
        updated_at: new Date().toISOString()
      };

      const { error: dbErr } = await supabase
        .from('staff_profiles')
        .upsert(profilePayload, { onConflict: 'staff_id' });

      if (dbErr) throw dbErr;

      showToast('Document uploaded successfully ✓');
      loadSignedPreview(fieldName, path);
    } catch (err: any) {
      console.error(err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploadingField(null);
    }
  };

  // Emergency Contacts handlers
  const handleContactChange = (index: number, field: keyof EmergencyContact, value: string) => {
    const updated = [...emergencyContacts];
    updated[index] = { ...updated[index], [field]: value };
    setEmergencyContacts(updated);
  };

  const handleAddContact = () => {
    setEmergencyContacts([...emergencyContacts, { name: '', relation: 'Father', phone: '' }]);
  };

  const handleRemoveContact = (index: number) => {
    if (emergencyContacts.length <= 2) {
      alert('Minimum 2 emergency contacts are required.');
      return;
    }
    const updated = emergencyContacts.filter((_, idx) => idx !== index);
    setEmergencyContacts(updated);
  };

  // Certificate upload
  const handleUploadCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certFile || !certName.trim() || !user?.staffId) {
      alert('Please provide a document name and file.');
      return;
    }

    setUploadingCert(true);
    try {
      const ext = certFile.name.split('.').pop() || 'pdf';
      const path = `staff/${user.staffId}/certs/${Date.now()}_cert.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('staff-documents')
        .upload(path, certFile, {
          contentType: certFile.type,
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Insert record in staff_documents
      const docPayload = {
        staff_id: user.staffId,
        doc_type: certType,
        doc_name: certName.trim(),
        doc_url: path,
        verification_status: 'pending',
        uploaded_at: new Date().toISOString()
      };

      const { data: insertedDoc, error: docErr } = await supabase
        .from('staff_documents')
        .insert(docPayload)
        .select()
        .single();

      if (docErr) throw docErr;

      showToast('Certificate uploaded successfully ✓');
      setCertName('');
      setCertFile(null);
      
      // Reset input element
      const fileInput = document.getElementById('cert-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Reload document items list
      fetchProfileDetails();
    } catch (err: any) {
      console.error(err);
      alert('Failed to upload certificate: ' + err.message);
    } finally {
      setUploadingCert(false);
    }
  };

  // Save general profile texts
  const handleSaveProfile = async () => {
    if (!user || !user.staffId) return;

    // Check emergency contacts count validation
    const validCount = emergencyContacts.filter(c => c.name.trim() && c.phone.trim()).length;
    if (validCount < 2) {
      alert('You must provide at least 2 complete emergency contacts (Name & Phone).');
      return;
    }

    setSaving(true);
    try {
      // 1. Save Profiles Row
      const profilePayload = {
        staff_id: user.staffId,
        dob: profile.dob,
        gender: profile.gender,
        blood_group: profile.blood_group,
        marital_status: profile.marital_status,
        personal_phone: profile.personal_phone,
        personal_email: profile.personal_email,
        current_address: profile.current_address,
        permanent_address: profile.permanent_address,
        aadhaar_number: profile.aadhaar_number,
        pan_number: profile.pan_number,
        bank_account_number: profile.bank_account_number,
        bank_ifsc: profile.bank_ifsc,
        bank_name: profile.bank_name,
        passport_number: profile.passport_number,
        passport_expiry: profile.passport_expiry || null,
        driving_licence_number: profile.driving_licence_number,
        driving_licence_expiry: profile.driving_licence_expiry || null,
        medical_notes: profile.medical_notes,
        updated_at: new Date().toISOString()
      };

      const { error: profErr } = await supabase
        .from('staff_profiles')
        .upsert(profilePayload, { onConflict: 'staff_id' });

      if (profErr) throw profErr;

      // 2. Save Emergency Contacts (Delete and re-insert)
      const { error: delErr } = await supabase
        .from('staff_emergency_contacts')
        .delete()
        .eq('staff_id', user.staffId);

      if (delErr) throw delErr;

      const contactsPayload = emergencyContacts.map(c => ({
        staff_id: user.staffId,
        name: c.name.trim(),
        relation: c.relation,
        phone: c.phone.trim()
      }));

      const { error: insErr } = await supabase
        .from('staff_emergency_contacts')
        .insert(contactsPayload);

      if (insErr) throw insErr;

      // 3. Mark profile completed or update staff table profile_pending setting
      const isProfileFullyFinished = completionPercent === 100;
      if (staffInfo.profile_pending && isProfileFullyFinished) {
        await supabase
          .from('staff')
          .update({ profile_pending: false })
          .eq('id', user.staffId);
      }

      showToast('Profile changes saved successfully ✓');
      fetchProfileDetails();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save profile: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (sec: string) => {
    setOpenSection(openSection === sec ? null : sec);
  };

  const getStatusBadge = (status: 'pending' | 'verified' | 'rejected', reason?: string | null) => {
    switch (status) {
      case 'verified':
        return (
          <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5">
            Verified
          </span>
        );
      case 'rejected':
        return (
          <div className="flex flex-col items-end">
            <span className="bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5">
              Rejected
            </span>
            {reason && (
              <span className="text-[9px] font-bold text-red-500 mt-0.5 text-right max-w-[150px] truncate italic">
                Reason: {reason}
              </span>
            )}
          </div>
        );
      case 'pending':
      default:
        return (
          <span className="bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-0.5">
            Pending
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[80px] w-full rounded-2xl" />
        <div className="skeleton h-[60px] w-full rounded-xl" />
        <div className="skeleton h-[60px] w-full rounded-xl" />
        <div className="skeleton h-[60px] w-full rounded-xl" />
      </div>
    );
  }

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  return (
    <div className="space-y-6 pb-12 select-none">
      {/* Expiry Warning Banners */}
      {expiryWarnings.map((warning, idx) => (
        <div key={idx} className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3.5 text-xs font-bold flex items-center gap-2 shadow-sm animate-in slide-in-from-top-2">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
          <span>{warning}</span>
        </div>
      ))}

      {/* Header completion card */}
      <div className="bg-white border border-[#E8E8E8] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center space-x-3.5">
          {previews.profile_photo ? (
            <img
              src={previews.profile_photo}
              alt="Profile"
              className="w-14 h-14 rounded-2xl object-cover border border-[#E8E8E8] flex-shrink-0 shadow-sm"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-[#1A1A1A] text-white font-black text-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
              {staffInfo?.name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-base text-[#1A1A1A] leading-tight truncate">
              {staffInfo?.name}
            </h2>
            <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-wider mt-1">
              {staffInfo?.department} • {getBranchLabel(staffInfo?.branch_id)}
            </p>
          </div>
        </div>

        {/* Completion indicator */}
        <div className="space-y-1.5 pt-1.5 border-t border-[#F2F2F2]">
          <div className="flex justify-between items-center text-xs font-bold text-[#1A1A1A]">
            <span>Profile Completion</span>
            <span className="font-black text-sm">{completionPercent}%</span>
          </div>
          <div className="w-full bg-[#F2F2F2] h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                completionPercent === 100
                  ? 'bg-emerald-600'
                  : completionPercent > 50
                  ? 'bg-amber-500'
                  : 'bg-gray-400'
              }`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          <p className="text-[10px] text-[#999999] font-bold">
            Required parts filled: Aadhaar, Bank, Contact, 2 Emergency Contacts, Personal info
          </p>
        </div>
      </div>

      {/* Accordion form */}
      <div className="space-y-3">
        {/* 1. PERSONAL DETAILS */}
        <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('personal')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-[#1a1a1a] hover:bg-gray-50/50 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <User size={15} />
              1. Personal Details
            </span>
            <ChevronDown
              size={16}
              className={`text-[#BBBBBB] transition-transform ${openSection === 'personal' ? 'rotate-180' : ''}`}
            />
          </button>
          
          {openSection === 'personal' && (
            <div className="px-4 pb-5 pt-1.5 border-t border-[#F2F2F2] space-y-4 text-xs font-semibold text-[#555555]">
              {/* Profile image upload */}
              <div className="flex items-center gap-4">
                {previews.profile_photo ? (
                  <img
                    src={previews.profile_photo}
                    alt="Preview"
                    className="w-16 h-16 rounded-2xl object-cover border border-[#E8E8E8] flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0">
                    <User size={24} />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Profile Photo</label>
                  <label className="relative cursor-pointer bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#1a1a1a] font-bold px-3 py-1.5 rounded-lg border border-[#E8E8E8] flex items-center gap-1.5 active:scale-95 transition-all text-[11px] inline-block">
                    <Upload size={13} />
                    <span>{uploadingField === 'profile_photo' ? 'Uploading...' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleUploadFile(e, 'profile_photo')}
                      disabled={!!uploadingField}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={profile.dob || ''}
                    onChange={e => setProfile({ ...profile, dob: e.target.value })}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] [color-scheme:light]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Gender</label>
                  <select
                    value={profile.gender || ''}
                    onChange={e => setProfile({ ...profile, gender: e.target.value })}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Blood Group</label>
                  <select
                    value={profile.blood_group || ''}
                    onChange={e => setProfile({ ...profile, blood_group: e.target.value })}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none"
                  >
                    <option value="">Select Blood Group</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Marital Status</label>
                  <select
                    value={profile.marital_status || ''}
                    onChange={e => setProfile({ ...profile, marital_status: e.target.value })}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none"
                  >
                    <option value="">Select Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Divorced">Divorced</option>
                    <option value="Widowed">Widowed</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. CONTACT DETAILS */}
        <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('contact')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-[#1a1a1a] hover:bg-gray-50/50 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <MapPin size={15} />
              2. Contact Information
            </span>
            <ChevronDown
              size={16}
              className={`text-[#BBBBBB] transition-transform ${openSection === 'contact' ? 'rotate-180' : ''}`}
            />
          </button>

          {openSection === 'contact' && (
            <div className="px-4 pb-5 pt-1.5 border-t border-[#F2F2F2] space-y-4 text-xs font-semibold text-[#555555]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Personal Phone</label>
                  <input
                    type="tel"
                    value={profile.personal_phone || ''}
                    onChange={e => setProfile({ ...profile, personal_phone: e.target.value })}
                    placeholder="Enter phone"
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Personal Email</label>
                  <input
                    type="email"
                    value={profile.personal_email || ''}
                    onChange={e => setProfile({ ...profile, personal_email: e.target.value })}
                    placeholder="Enter email"
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Current Address</label>
                <textarea
                  value={profile.current_address || ''}
                  onChange={e => setProfile({ ...profile, current_address: e.target.value })}
                  placeholder="Street address, city, state, pin"
                  rows={2}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider">Permanent Address</label>
                  <button
                    type="button"
                    onClick={() => setProfile(p => ({ ...p, permanent_address: p.current_address }))}
                    className="text-[10px] text-emerald-600 font-extrabold hover:underline"
                  >
                    Copy Current Address
                  </button>
                </div>
                <textarea
                  value={profile.permanent_address || ''}
                  onChange={e => setProfile({ ...profile, permanent_address: e.target.value })}
                  placeholder="Street address, city, state, pin"
                  rows={2}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 3. EMERGENCY CONTACTS */}
        <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('emergency')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-[#1a1a1a] hover:bg-gray-50/50 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <Smartphone size={15} />
              3. Emergency Contacts
            </span>
            <ChevronDown
              size={16}
              className={`text-[#BBBBBB] transition-transform ${openSection === 'emergency' ? 'rotate-180' : ''}`}
            />
          </button>

          {openSection === 'emergency' && (
            <div className="px-4 pb-5 pt-1.5 border-t border-[#F2F2F2] space-y-4 text-xs font-semibold text-[#555555]">
              <p className="text-[10px] text-[#999999] font-bold">
                At least 2 complete contact records are required.
              </p>

              <div className="space-y-4">
                {emergencyContacts.map((contact, index) => (
                  <div key={index} className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 space-y-3 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase text-[#1a1a1a]">Contact #{index + 1}</span>
                      {emergencyContacts.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveContact(index)}
                          className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Full Name</label>
                        <input
                          type="text"
                          value={contact.name}
                          onChange={e => handleContactChange(index, 'name', e.target.value)}
                          placeholder="Contact Name"
                          className="w-full bg-white border border-[#E8E8E8] rounded-lg p-2 text-xs font-bold text-[#1A1A1A]"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Relation</label>
                        <select
                          value={contact.relation}
                          onChange={e => handleContactChange(index, 'relation', e.target.value)}
                          className="w-full bg-white border border-[#E8E8E8] rounded-lg p-2 text-xs font-bold text-[#1A1A1A] focus:outline-none"
                        >
                          {['Father', 'Mother', 'Spouse', 'Sibling', 'Child', 'Friend', 'Other'].map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={contact.phone}
                        onChange={e => handleContactChange(index, 'phone', e.target.value)}
                        placeholder="Mobile Number"
                        className="w-full bg-white border border-[#E8E8E8] rounded-lg p-2 text-xs font-bold text-[#1A1A1A]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddContact}
                className="w-full py-2 border-2 border-dashed border-[#E8E8E8] text-[#555555] hover:border-black hover:text-[#1a1a1a] transition-all rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              >
                <Plus size={14} />
                <span>Add Emergency Contact</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. GOVERNMENT ID */}
        <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('gov_id')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-[#1a1a1a] hover:bg-gray-50/50 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <FileText size={15} />
              4. Government ID Records
            </span>
            <ChevronDown
              size={16}
              className={`text-[#BBBBBB] transition-transform ${openSection === 'gov_id' ? 'rotate-180' : ''}`}
            />
          </button>

          {openSection === 'gov_id' && (
            <div className="px-4 pb-5 pt-1.5 border-t border-[#F2F2F2] space-y-5 text-xs font-semibold text-[#555555]">
              {/* Aadhaar */}
              <div className="space-y-2 border-b border-[#F2F2F2] pb-4">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black uppercase text-[#1a1a1a] tracking-wider">Aadhaar (Required)</label>
                  {getStatusBadge(profile.aadhaar_verification_status, profile.aadhaar_rejection_reason)}
                </div>
                <input
                  type="text"
                  maxLength={14}
                  disabled={profile.aadhaar_verification_status === 'verified'}
                  value={profile.aadhaar_number || ''}
                  onChange={e => setProfile({ ...profile, aadhaar_number: e.target.value.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim() })}
                  placeholder="XXXX XXXX XXXX"
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] font-mono tracking-wider disabled:opacity-75"
                />

                {previews.aadhaar_photo && (
                  <div className="mt-2">
                    <span className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Uploaded Proof</span>
                    <a
                      href={previews.aadhaar_photo}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-extrabold hover:underline"
                    >
                      <Eye size={12} />
                      View Aadhaar Document
                    </a>
                  </div>
                )}

                {profile.aadhaar_verification_status !== 'verified' && (
                  <label className="relative cursor-pointer bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#1a1a1a] font-bold px-3.5 py-2 rounded-xl border border-[#E8E8E8] flex items-center justify-center gap-1.5 active:scale-95 transition-all text-xs cursor-pointer">
                    <Upload size={14} />
                    <span>{uploadingField === 'aadhaar_photo' ? 'Uploading...' : 'Upload Aadhaar Photo/PDF'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={e => handleUploadFile(e, 'aadhaar_photo')}
                      disabled={!!uploadingField}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* PAN */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black uppercase text-[#1a1a1a] tracking-wider">PAN Card (Optional)</label>
                  {getStatusBadge(profile.pan_verification_status, profile.pan_rejection_reason)}
                </div>
                <input
                  type="text"
                  maxLength={10}
                  disabled={profile.pan_verification_status === 'verified'}
                  value={profile.pan_number || ''}
                  onChange={e => setProfile({ ...profile, pan_number: e.target.value.toUpperCase().trim() })}
                  placeholder="ABCDE1234F"
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] font-mono tracking-widest disabled:opacity-75"
                />

                {previews.pan_photo && (
                  <div className="mt-2">
                    <span className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Uploaded Proof</span>
                    <a
                      href={previews.pan_photo}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-extrabold hover:underline"
                    >
                      <Eye size={12} />
                      View PAN Document
                    </a>
                  </div>
                )}

                {profile.pan_verification_status !== 'verified' && (
                  <label className="relative cursor-pointer bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#1a1a1a] font-bold px-3.5 py-2 rounded-xl border border-[#E8E8E8] flex items-center justify-center gap-1.5 active:scale-95 transition-all text-xs cursor-pointer">
                    <Upload size={14} />
                    <span>{uploadingField === 'pan_photo' ? 'Uploading...' : 'Upload PAN Photo/PDF'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={e => handleUploadFile(e, 'pan_photo')}
                      disabled={!!uploadingField}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5. BANK DETAILS */}
        <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('bank')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-[#1a1a1a] hover:bg-gray-50/50 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <CreditCard size={15} />
              5. Bank Details
            </span>
            <ChevronDown
              size={16}
              className={`text-[#BBBBBB] transition-transform ${openSection === 'bank' ? 'rotate-180' : ''}`}
            />
          </button>

          {openSection === 'bank' && (
            <div className="px-4 pb-5 pt-1.5 border-t border-[#F2F2F2] space-y-4 text-xs font-semibold text-[#555555]">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-[#999999] font-black uppercase tracking-wider">Bank Account Info</span>
                {getStatusBadge(profile.bank_verification_status, profile.bank_rejection_reason)}
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Bank Name</label>
                <input
                  type="text"
                  disabled={profile.bank_verification_status === 'verified'}
                  value={profile.bank_name || ''}
                  onChange={e => setProfile({ ...profile, bank_name: e.target.value })}
                  placeholder="e.g. HDFC Bank"
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] disabled:opacity-75"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Account Number</label>
                  <input
                    type="text"
                    disabled={profile.bank_verification_status === 'verified'}
                    value={profile.bank_account_number || ''}
                    onChange={e => setProfile({ ...profile, bank_account_number: e.target.value.replace(/\D/g, '') })}
                    placeholder="Enter account num"
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] font-mono disabled:opacity-75"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">IFSC Code</label>
                  <input
                    type="text"
                    maxLength={11}
                    disabled={profile.bank_verification_status === 'verified'}
                    value={profile.bank_ifsc || ''}
                    onChange={e => setProfile({ ...profile, bank_ifsc: e.target.value.toUpperCase().trim() })}
                    placeholder="HDFC0001234"
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] font-mono tracking-wide disabled:opacity-75"
                  />
                </div>
              </div>

              {previews.bank_proof && (
                <div>
                  <span className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Passbook / Cheque Proof</span>
                  <a
                    href={previews.bank_proof}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-extrabold hover:underline"
                  >
                    <Eye size={12} />
                    View Uploaded Bank Proof
                  </a>
                </div>
              )}

              {profile.bank_verification_status !== 'verified' && (
                <label className="relative cursor-pointer bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#1a1a1a] font-bold px-3.5 py-2 rounded-xl border border-[#E8E8E8] flex items-center justify-center gap-1.5 active:scale-95 transition-all text-xs cursor-pointer">
                  <Upload size={14} />
                  <span>{uploadingField === 'bank_proof' ? 'Uploading...' : 'Upload Passbook/Cheque photo'}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={e => handleUploadFile(e, 'bank_proof')}
                    disabled={!!uploadingField}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          )}
        </div>

        {/* 6. OPTIONAL DOCUMENTS */}
        <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('optional')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-[#1a1a1a] hover:bg-gray-50/50 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <Building size={15} />
              6. Optional Documents (Passport & DL)
            </span>
            <ChevronDown
              size={16}
              className={`text-[#BBBBBB] transition-transform ${openSection === 'optional' ? 'rotate-180' : ''}`}
            />
          </button>

          {openSection === 'optional' && (
            <div className="px-4 pb-5 pt-1.5 border-t border-[#F2F2F2] space-y-6 text-xs font-semibold text-[#555555]">
              {/* Passport */}
              <div className="space-y-3 border-b border-[#F2F2F2] pb-4">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black uppercase text-[#1a1a1a] tracking-wider">Passport</label>
                  {getStatusBadge(profile.passport_verification_status, profile.passport_rejection_reason)}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Passport Number</label>
                    <input
                      type="text"
                      disabled={profile.passport_verification_status === 'verified'}
                      value={profile.passport_number || ''}
                      onChange={e => setProfile({ ...profile, passport_number: e.target.value.toUpperCase().trim() })}
                      placeholder="Enter passport number"
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] disabled:opacity-75"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Expiry Date</label>
                    <input
                      type="date"
                      disabled={profile.passport_verification_status === 'verified'}
                      value={profile.passport_expiry || ''}
                      onChange={e => setProfile({ ...profile, passport_expiry: e.target.value })}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] [color-scheme:light] disabled:opacity-75"
                    />
                  </div>
                </div>

                {previews.passport_photo && (
                  <div>
                    <span className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Uploaded Proof</span>
                    <a
                      href={previews.passport_photo}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-extrabold hover:underline"
                    >
                      <Eye size={12} />
                      View Passport Document
                    </a>
                  </div>
                )}

                {profile.passport_verification_status !== 'verified' && (
                  <label className="relative cursor-pointer bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#1a1a1a] font-bold px-3 py-1.5 rounded-lg border border-[#E8E8E8] flex items-center justify-center gap-1.5 active:scale-95 transition-all text-[11px] cursor-pointer">
                    <Upload size={13} />
                    <span>{uploadingField === 'passport_photo' ? 'Uploading...' : 'Upload Passport Photo/PDF'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={e => handleUploadFile(e, 'passport_photo')}
                      disabled={!!uploadingField}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* DL */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black uppercase text-[#1a1a1a] tracking-wider">Driving Licence</label>
                  {getStatusBadge(profile.driving_licence_verification_status, profile.driving_licence_rejection_reason)}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Licence Number</label>
                    <input
                      type="text"
                      disabled={profile.driving_licence_verification_status === 'verified'}
                      value={profile.driving_licence_number || ''}
                      onChange={e => setProfile({ ...profile, driving_licence_number: e.target.value.toUpperCase() })}
                      placeholder="e.g. DL-12345"
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] disabled:opacity-75"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Expiry Date</label>
                    <input
                      type="date"
                      disabled={profile.driving_licence_verification_status === 'verified'}
                      value={profile.driving_licence_expiry || ''}
                      onChange={e => setProfile({ ...profile, driving_licence_expiry: e.target.value })}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] [color-scheme:light] disabled:opacity-75"
                    />
                  </div>
                </div>

                {previews.driving_licence_photo && (
                  <div>
                    <span className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Uploaded Proof</span>
                    <a
                      href={previews.driving_licence_photo}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-extrabold hover:underline"
                    >
                      <Eye size={12} />
                      View Driving Licence Document
                    </a>
                  </div>
                )}

                {profile.driving_licence_verification_status !== 'verified' && (
                  <label className="relative cursor-pointer bg-[#F2F2F2] hover:bg-[#EBEBEB] text-[#1a1a1a] font-bold px-3 py-1.5 rounded-lg border border-[#E8E8E8] flex items-center justify-center gap-1.5 active:scale-95 transition-all text-[11px] cursor-pointer">
                    <Upload size={13} />
                    <span>{uploadingField === 'driving_licence_photo' ? 'Uploading...' : 'Upload DL Photo/PDF'}</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={e => handleUploadFile(e, 'driving_licence_photo')}
                      disabled={!!uploadingField}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 7. CERTIFICATES */}
        <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('certificates')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-[#1a1a1a] hover:bg-gray-50/50 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <FileText size={15} />
              7. Academic & Experience Certificates
            </span>
            <ChevronDown
              size={16}
              className={`text-[#BBBBBB] transition-transform ${openSection === 'certificates' ? 'rotate-180' : ''}`}
            />
          </button>

          {openSection === 'certificates' && (
            <div className="px-4 pb-5 pt-1.5 border-t border-[#F2F2F2] space-y-5 text-xs font-semibold text-[#555555]">
              {/* Existing list */}
              {documents.length > 0 && (
                <div className="space-y-2">
                  <span className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-2">Uploaded Certificates</span>
                  {documents.map((doc) => (
                    <div key={doc.id} className="border border-[#E8E8E8] rounded-xl p-3 flex justify-between items-center bg-[#F8F8F8]">
                      <div>
                        <h4 className="font-bold text-xs text-[#1a1a1a] truncate max-w-[200px]">{doc.doc_name}</h4>
                        <span className="text-[9px] font-black text-[#999999] capitalize block mt-0.5">
                          {doc.doc_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        {previews[`doc_${doc.id}`] && (
                          <a
                            href={previews[`doc_${doc.id}`]}
                            target="_blank"
                            rel="noreferrer"
                            className="w-7 h-7 bg-white border border-[#E8E8E8] hover:border-black rounded-lg flex items-center justify-center text-[#555555] active:scale-95 transition-all"
                            title="View Document"
                          >
                            <Eye size={12} />
                          </a>
                        )}
                        {getStatusBadge(doc.verification_status, doc.rejection_reason)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Certificate Form */}
              <form onSubmit={handleUploadCertificate} className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 space-y-3">
                <span className="block text-[10px] font-black uppercase text-[#1a1a1a] tracking-wider mb-1">Add New Certificate</span>
                
                <div>
                  <label className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Certificate Type</label>
                  <select
                    value={certType}
                    onChange={e => setCertType(e.target.value as any)}
                    className="w-full bg-white border border-[#E8E8E8] rounded-lg p-2 text-xs font-bold text-[#1A1A1A] focus:outline-none"
                  >
                    <option value="education_certificate">Education Certificate</option>
                    <option value="experience_certificate">Experience Certificate</option>
                    <option value="other">Other Attachment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Document Name / Label</label>
                  <input
                    type="text"
                    value={certName}
                    onChange={e => setCertName(e.target.value)}
                    placeholder="e.g. B.Com Degree, Relieving Certificate..."
                    className="w-full bg-white border border-[#E8E8E8] rounded-lg p-2 text-xs font-bold text-[#1A1A1A]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black text-[#999999] uppercase tracking-wider mb-1">Choose File (PDF or Image)</label>
                  <input
                    id="cert-file-input"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={e => setCertFile(e.target.files?.[0] || null)}
                    className="w-full text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={uploadingCert || !certFile || !certName.trim()}
                  className="w-full bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-white font-bold text-xs py-2 rounded-lg active:scale-95 transition-all cursor-pointer shadow-sm text-center"
                >
                  {uploadingCert ? 'Uploading...' : 'Save & Upload Certificate'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* 8. MEDICAL NOTES */}
        <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSection('medical')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-[#1a1a1a] hover:bg-gray-50/50 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <Stethoscope size={15} />
              8. Medical Information (Private)
            </span>
            <ChevronDown
              size={16}
              className={`text-[#BBBBBB] transition-transform ${openSection === 'medical' ? 'rotate-180' : ''}`}
            />
          </button>

          {openSection === 'medical' && (
            <div className="px-4 pb-5 pt-1.5 border-t border-[#F2F2F2] space-y-4 text-xs font-semibold text-[#555555]">
              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200/30 p-2.5 rounded-lg leading-relaxed font-bold flex gap-1.5 items-start">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <span>🔐 Privacy notice: This medical notes field is strictly confidential. It is never displayed to other staff members or broad viewers (like Partner roles), and is only accessible to you and the HR/Ops Management team.</span>
              </p>

              <div>
                <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1">Allergies, Medical Conditions or Emergency Info</label>
                <textarea
                  value={profile.medical_notes || ''}
                  onChange={e => setProfile({ ...profile, medical_notes: e.target.value })}
                  placeholder="e.g. Diabetic, allergic to penicillin, contact +91 XXXXX XXXXX in medical emergencies..."
                  rows={3}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 text-xs font-bold text-[#1A1A1A] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 9. RECOGNITION & AWARDS */}
        <div className="bg-white border border-[#E8E8E8] rounded-xl overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => toggleSection('awards')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-[#1a1a1a] hover:bg-gray-50/50 transition-colors"
          >
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <Award size={15} className="text-indigo-650" />
              9. Recognition & Awards Received
            </span>
            <div className="flex items-center gap-1">
              {recognitions.length > 0 && (
                <span className="bg-indigo-50 border border-indigo-200 text-indigo-705 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {recognitions.length} Awards
                </span>
              )}
              <ChevronDown
                size={16}
                className={`text-[#BBBBBB] transition-transform ${openSection === 'awards' ? 'rotate-180' : ''}`}
              />
            </div>
          </button>

          {openSection === 'awards' && (
            <div className="px-4 pb-5 pt-1.5 border-t border-[#F2F2F2] space-y-4 text-xs font-semibold text-[#555555]">
              {recognitions.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-4">No recognition awards or badges received yet.</p>
              ) : (
                <div className="space-y-3">
                  {recognitions.map((rec: any, idx: number) => (
                    <div key={idx} className="bg-slate-50/80 border border-slate-100 p-3.5 rounded-xl space-y-1.5 text-left">
                      <div className="flex justify-between items-center">
                        <span className="bg-indigo-50 border border-indigo-205 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wide">
                          🏆 {rec.award_type}
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold">
                          {new Date(rec.awarded_at).toLocaleDateString()}
                        </span>
                      </div>
                      
                      {rec.period_label && (
                        <span className="text-[9px] text-amber-600 font-black uppercase block tracking-wider mt-1">
                          Period: {rec.period_label}
                        </span>
                      )}

                      {rec.award_note && (
                        <p className="text-[11px] text-slate-700 italic border-l-2 border-indigo-200 pl-2 font-medium mt-1 leading-relaxed">
                          "{rec.award_note}"
                        </p>
                      )}

                      <p className="text-[8.5px] text-gray-450 mt-1 font-bold">
                        Awarded by: {rec.awarded_by}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Save Profile Button */}
      <button
        onClick={handleSaveProfile}
        disabled={saving}
        className="w-full min-h-[44px] bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-white font-extrabold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-md"
      >
        {saving ? (
          <RefreshCw size={14} className="animate-spin mr-1.5" />
        ) : (
          <span>Save Profile Changes</span>
        )}
      </button>

      {/* Account actions block */}
      <div className="pt-2 border-t border-[#F2F2F2] space-y-2">
        <button
          onClick={() => router.push('/my/change-password')}
          className="w-full bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-gray-50/50 min-h-[44px] rounded-xl flex items-center justify-between px-4 text-xs font-bold transition-all active:scale-[0.98] shadow-sm cursor-pointer"
        >
          <span className="flex items-center">
            <Lock size={14} className="mr-2 text-gray-500" /> Change Account Password
          </span>
          <ChevronRight size={16} className="text-gray-400" />
        </button>

        <button
          onClick={logout}
          className="w-full bg-red-50 border border-red-200/50 hover:bg-red-100/30 text-red-700 min-h-[44px] rounded-xl flex items-center justify-center text-xs font-bold transition-all active:scale-[0.98] shadow-sm cursor-pointer space-x-1.5"
        >
          <LogOut size={14} />
          <span>Sign Out of Account</span>
        </button>
      </div>

      {/* Global Toast Alert */}
      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[15000] bg-[#EDF7EF] border border-[#2D7A3A] text-[#2D7A3A] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-1">
          <CheckCircle2 size={14} className="text-[#2D7A3A]" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckSquare,
  CheckCircle2,
  FileText,
  UserCheck,
  ShieldAlert,
  HelpCircle,
  FileMinus,
  Settings,
  AlertCircle
} from 'lucide-react';
import { calculateSalary } from '@/lib/salary';
import { jsPDF } from 'jspdf';
import { createAuditLog } from '@/lib/audit';

interface ResignationDetail {
  id: string;
  staff_id: string;
  initiated_by: string;
  initiated_at: string;
  reason: string;
  reason_note: string | null;
  notice_served: 'yes' | 'no' | 'waived';
  last_working_day: string;
  asset_cleared: boolean;
  asset_cleared_by: string | null;
  asset_cleared_at: string | null;
  asset_notes: string | null; // Stores JSON state of asset checklist
  financial_cleared: boolean;
  financial_cleared_by: string | null;
  financial_cleared_at: string | null;
  financial_settlement_amount: number | null;
  status: 'in_progress' | 'clearance_complete' | 'approved' | 'settled';
  approved_by: string | null;
  approved_at: string | null;
  rehire_eligible: boolean | null;
  rehire_note: string | null;
  staff: {
    id: string;
    name: string;
    branch_id: string;
    department: string;
    monthly_salary: number;
    join_date: string;
    off_days_per_month: number;
    shift: {
      hours: number;
    } | null;
  };
}

export default function ResignationDetailPage() {
  const { id } = useParams() as { id: string };
  const { user, userBranch, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [data, setData] = useState<ResignationDetail | null>(null);

  // Asset Checklist UI State
  const [uniformReturned, setUniformReturned] = useState(false);
  const [idReturned, setIdReturned] = useState(false);
  const [kioskRevoked, setKioskRevoked] = useState(false);
  const [keysReturned, setKeysReturned] = useState(false);
  const [generalNotes, setGeneralNotes] = useState('');
  const [savingAssetClearance, setSavingAssetClearance] = useState(false);

  // Financial Settlement calculation state
  const [settlementResult, setSettlementResult] = useState<any>(null);
  const [savingFinancialClearance, setSavingFinancialClearance] = useState(false);

  // Override State
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);

  // Rehire Eligibility
  const [rehireEligible, setRehireEligible] = useState<boolean | null>(null);
  const [rehireNote, setRehireNote] = useState('');
  const [savingRehire, setSavingRehire] = useState(false);

  // Role check
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

  const loadResignationDetail = async () => {
    try {
      setLoading(true);
      setErrorMsg('');

      const { data: resData, error } = await supabase
        .from('resignations')
        .select('*, staff:staff_id(*, shift:shifts(*))')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!resData) {
        setErrorMsg('Resignation record not found.');
        return;
      }

      // Branch isolation checks
      if (userBranch && resData.staff?.branch_id !== userBranch) {
        setErrorMsg('Access denied: Profile is outside your branch.');
        return;
      }

      const item = resData as unknown as ResignationDetail;
      setData(item);

      // Parse asset checklist states from asset_notes JSON if present
      if (item.asset_notes) {
        try {
          const parsed = JSON.parse(item.asset_notes);
          setUniformReturned(!!parsed.uniform?.checked);
          setIdReturned(!!parsed.id_card?.checked);
          setKioskRevoked(!!parsed.kiosk?.checked);
          setKeysReturned(!!parsed.keys?.checked);
          setGeneralNotes(parsed.notes || '');
        } catch (e) {
          setGeneralNotes(item.asset_notes);
        }
      }

      if (item.rehire_eligible !== undefined) {
        setRehireEligible(item.rehire_eligible);
      }
      setRehireNote(item.rehire_note || '');

      // Load financial calculations up to last_working_day
      if (item.staff) {
        await calculateFinancialClearance(item);
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to load resignation details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && id) {
      loadResignationDetail();
    }
  }, [user, id, userBranch]);

  const calculateFinancialClearance = async (res: ResignationDetail) => {
    try {
      const lwd = res.last_working_day;
      const [yearStr, monthStr, dayStr] = lwd.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);

      const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;

      // 1. Fetch attendance records up to last_working_day
      const { data: attRecords } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', res.staff_id)
        .gte('date', firstDay)
        .lte('date', lwd);

      const attendanceList = attRecords || [];

      // 2. Fetch confirmed late fines up to last_working_day
      const monthStrFormatted = `${year}-${String(month).padStart(2, '0')}`;
      const { data: lfData } = await supabase
        .from('late_fines')
        .select('*')
        .eq('staff_id', res.staff_id)
        .eq('month', monthStrFormatted)
        .lte('date', lwd)
        .eq('confirmed', true);

      const lateFines = lfData || [];

      // 3. Fetch confirmed special fines up to last_working_day
      const { data: sfData } = await supabase
        .from('special_fines')
        .select('*')
        .eq('staff_id', res.staff_id)
        .eq('month', monthStrFormatted)
        .lte('date', lwd)
        .eq('confirmed', true);

      const specialFines = sfData || [];

      // Sum values
      const daysActuallyWorked = attendanceList.filter(r => r.check_in_time).length;
      
      const approvedOTMinutes = attendanceList
        .filter(r => r.ot_approved === true)
        .reduce((sum, r) => sum + (r.ot_minutes || 0), 0) || 0;

      const approvedEarlyInMinutes = attendanceList
        .filter(r => r.early_in_approved === true)
        .reduce((sum, r) => sum + (r.early_in_minutes || 0), 0) || 0;

      const earlyLeaveMinutes = attendanceList.reduce(
        (sum, r) => sum + (r.early_leave_minutes || 0), 0
      ) || 0;

      const totalLateFinesAmt = lateFines.reduce((sum, f) => sum + (f.waived ? 0 : (Number(f.fine_amount) - Number(f.waived_amount || 0))), 0);
      const totalSpecialFinesAmt = specialFines.reduce((sum, f) => sum + (f.waived ? 0 : (Number(f.amount) - Number(f.waived_amount || 0))), 0);

      const shiftHours = res.staff.shift?.hours || 9;
      const offDaysPerMonth = (res.staff.off_days_per_month ?? 4) as 0 | 2 | 4;

      const result = calculateSalary(
        {
          monthlySalary: Number(res.staff.monthly_salary),
          offDaysPerMonth,
          shiftHours,
          year,
          month,
          branchId: res.staff.branch_id
        },
        {
          daysActuallyWorked,
          confirmedLateFines: totalLateFinesAmt,
          confirmedSpecialFines: totalSpecialFinesAmt,
          approvedOTMinutes,
          approvedEarlyInMinutes,
          earlyLeaveMinutes,
          late_salary_deduction_minutes: attendanceList.reduce((sum, a) => sum + (a.late_salary_deduction_minutes || 0), 0)
        }
      );

      setSettlementResult(result);
    } catch (err) {
      console.error('Error calculating final settlement:', err);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleSaveAssetClearance = async () => {
    if (!data || !user) return;
    setSavingAssetClearance(true);
    try {
      const isAllChecked = uniformReturned && idReturned && kioskRevoked && keysReturned;
      const checkedBy = user.name || user.email || 'Management';

      const checklistPayload = JSON.stringify({
        uniform: { checked: uniformReturned, by: checkedBy },
        id_card: { checked: idReturned, by: checkedBy },
        kiosk: { checked: kioskRevoked, by: checkedBy },
        keys: { checked: keysReturned, by: checkedBy },
        notes: generalNotes.trim()
      });

      // Update resignation details
      const updates: Partial<ResignationDetail> = {
        asset_notes: checklistPayload,
        asset_cleared: isAllChecked,
        asset_cleared_by: isAllChecked ? checkedBy : null,
        asset_cleared_at: isAllChecked ? new Date().toISOString() : null
      };

      // Auto update status if both cleared
      let newStatus = data.status;
      if (isAllChecked && data.financial_cleared) {
        newStatus = 'clearance_complete';
      } else if (data.status === 'clearance_complete') {
        newStatus = 'in_progress';
      }
      updates.status = newStatus;

      const { error } = await supabase
        .from('resignations')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      showToast('Asset clearance checklist updated ✓');
      loadResignationDetail();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save asset clearance: ' + err.message);
    } finally {
      setSavingAssetClearance(false);
    }
  };

  const handleSaveFinancialClearance = async () => {
    if (!data || !user || !settlementResult) return;
    setSavingFinancialClearance(true);
    try {
      const clearedBy = user.name || user.email || 'Management';
      
      const updates: Partial<ResignationDetail> = {
        financial_cleared: true,
        financial_cleared_by: clearedBy,
        financial_cleared_at: new Date().toISOString(),
        financial_settlement_amount: settlementResult.netSalary
      };

      // Auto update status if both cleared
      let newStatus = data.status;
      if (data.asset_cleared) {
        newStatus = 'clearance_complete';
      }
      updates.status = newStatus;

      const { error } = await supabase
        .from('resignations')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      showToast('Financial clearance completed ✓');
      loadResignationDetail();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save financial clearance: ' + err.message);
    } finally {
      setSavingFinancialClearance(false);
    }
  };

  const handleApproveResignation = async (isOverride = false) => {
    if (!data || !user) return;
    if (isOverride && !overrideReason.trim()) {
      alert('Please enter a reason for the clearance override.');
      return;
    }

    setIsApproving(true);
    try {
      const approver = user.name || user.email || 'Management';
      const updates: Partial<ResignationDetail> = {
        status: 'approved',
        approved_by: approver,
        approved_at: new Date().toISOString()
      };

      if (isOverride) {
        // Log override reason in audit log
        await createAuditLog({
          action: 'resignation_clearance_override',
          table_name: 'resignations',
          record_id: data.id,
          new_value: { override_reason: overrideReason },
          performed_by: user.email,
          performed_by_role: user.role,
          reason: `Cleared resignation via override: "${overrideReason.trim()}"`
        });
      } else {
        await createAuditLog({
          action: 'approve_resignation',
          table_name: 'resignations',
          record_id: data.id,
          new_value: { status: 'approved' },
          performed_by: user.email,
          performed_by_role: user.role,
          reason: `Approved resignation clearance for ${data.staff.name}`
        });
      }

      const { error } = await supabase
        .from('resignations')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      showToast('Resignation approved successfully ✓');
      setShowOverride(false);
      setOverrideReason('');
      loadResignationDetail();
    } catch (err: any) {
      console.error(err);
      alert('Approval failed: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  const handleSaveRehireStatus = async () => {
    if (!data || !user) return;
    setSavingRehire(true);
    try {
      const { error } = await supabase
        .from('resignations')
        .update({
          rehire_eligible: rehireEligible,
          rehire_note: rehireNote.trim() || null
        })
        .eq('id', id);

      if (error) throw error;

      showToast('Rehire status updated successfully ✓');
      loadResignationDetail();
    } catch (err: any) {
      console.error(err);
      alert('Failed to update rehire eligibility: ' + err.message);
    } finally {
      setSavingRehire(false);
    }
  };

  // PDF Document Generation
  const generatePDF = (type: 'relieving' | 'experience') => {
    if (!data) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const primaryColor = [26, 26, 26]; // Dark Slate
    const accentColor = [148, 163, 184]; 

    // Header Branding
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('nearbi', 20, 25);
    
    doc.setFontSize(8);
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(42, 20.5, 12, 5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('STAFF', 44, 24);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Nearbi Staff Management Portal', 20, 31);
    doc.line(20, 34, 190, 34);

    // Document Metadata
    const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Date: ${todayStr}`, 145, 45);

    if (type === 'relieving') {
      // RELIEVING LETTER
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('RELIEVING LETTER', 20, 58);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      
      doc.text('To,', 20, 72);
      doc.setFont('helvetica', 'bold');
      doc.text(data.staff.name, 20, 77);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.staff.department} Department`, 20, 82);
      doc.text(`${data.staff.branch_id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket'} Branch`, 20, 87);

      const bodyText = `Dear ${data.staff.name},\n\n` +
        `This is to confirm that your resignation has been accepted and you are officially relieved from your duties as a ${data.staff.department} at our ${data.staff.branch_id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket'} branch, effective from the close of business hours on ${new Date(data.last_working_day).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}.\n\n` +
        `We appreciate the contributions you have made during your tenure with us from ${new Date(data.staff.join_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} to ${new Date(data.last_working_day).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}.\n\n` +
        `All your asset and financial clearance checklists have been successfully completed, and your final settlement has been processed.\n\n` +
        `We wish you the very best in all your future professional and personal endeavors.`;

      const splitText = doc.splitTextToSize(bodyText, 170);
      doc.text(splitText, 20, 102);

    } else {
      // EXPERIENCE CERTIFICATE
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('EXPERIENCE CERTIFICATE', 20, 58);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);

      const bodyText = `This is to certify that ${data.staff.name} was employed with Nearbi Group as a ${data.staff.department} at our ${data.staff.branch_id === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket'} branch from ${new Date(data.staff.join_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} to ${new Date(data.last_working_day).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}.\n\n` +
        `During their tenure of service with us, we found them to be diligent, hard-working, and honest. They carried out their responsibilities with professionalism and dedication, showing an excellent work ethic.\n\n` +
        `We wish them continued success in all their future pursuits and careers.`;

      const splitText = doc.splitTextToSize(bodyText, 170);
      doc.text(splitText, 20, 78);
    }

    // Signatory
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('For Nearbi Group', 20, 185);

    doc.setFont('helvetica', 'normal');
    doc.text('Authorized Signatory', 20, 205);
    doc.line(20, 201, 60, 201); // Signature line

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('CONFIDENTIAL • GENERATED BY NEARBI STAFF SYSTEM', 20, 280);
    doc.text('Page 1 of 1', 175, 280);

    const docName = type === 'relieving' ? 'Relieving_Letter' : 'Experience_Certificate';
    doc.save(`Nearbi_${docName}_${data.staff.name.replace(/\s+/g, '_')}.pdf`);
    showToast(`${type === 'relieving' ? 'Relieving Letter' : 'Experience Certificate'} downloaded successfully.`);
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[40px] w-1/3" />
        <div className="skeleton h-[180px] w-full" />
        <div className="skeleton h-[120px] w-full" />
        <div className="skeleton h-[150px] w-full" />
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 text-center max-w-sm mx-auto flex flex-col items-center justify-center shadow-sm">
        <AlertCircle size={40} strokeWidth={1.5} className="text-[#C0392B] mb-2" />
        <h3 className="text-sm font-bold text-[#1A1A1A] mb-1">{errorMsg || 'Failed to load details'}</h3>
        <button
          onClick={() => router.push('/resignations')}
          className="mt-4 px-4 py-2 bg-[#1A1A1A] text-white text-xs font-bold rounded-lg shadow cursor-pointer"
        >
          Go Back
        </button>
      </div>
    );
  }

  const lwdFormatted = new Date(data.last_working_day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const isApprovedOrSettled = data.status === 'approved' || data.status === 'settled';

  return (
    <div className="space-y-6 pb-12">
      {/* Header back bar */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => router.push('/resignations')}
          className="w-10 h-10 rounded-full border border-[#E8E8E8] bg-white flex items-center justify-center text-[#555555] hover:text-[#1A1A1A] active:scale-90 transition-transform cursor-pointer shadow-sm"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#999999]">Clearance Sheet</span>
          <h1 className="text-xl font-extrabold text-[#1A1A1A] leading-tight">{data.staff.name}</h1>
        </div>
      </div>

      {/* Staff profile summary card */}
      <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-5 shadow-sm space-y-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-14 h-14 rounded-full bg-[#1A1A1A] text-white text-xl font-bold flex items-center justify-center flex-shrink-0">
            {data.staff.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex flex-wrap gap-1.5 mb-1">
              <span className="bg-[#F0F0F0] text-[#555555] border border-[#E8E8E8] text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 uppercase">
                <Briefcase size={10} />
                {data.staff.department}
              </span>
              <span className="bg-[#F0F0F0] text-[#555555] border border-[#E8E8E8] text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 uppercase">
                <MapPin size={10} />
                {data.staff.branch_id === 'daily' ? 'Daily' : 'Hypermarket'}
              </span>
            </div>
            <p className="text-[10px] text-[#999999] font-bold">
              Joined: {new Date(data.staff.join_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="border-t border-[#F0F0F0] pt-4.5 grid grid-cols-2 gap-3.5 text-xs font-semibold">
          <div>
            <span className="block text-[9px] font-black text-[#999999] uppercase tracking-wider">Last Working Day</span>
            <span className="text-sm font-extrabold text-[#D97706] mt-0.5 block font-mono">{lwdFormatted}</span>
          </div>
          <div>
            <span className="block text-[9px] font-black text-[#999999] uppercase tracking-wider">Notice Period</span>
            <span className="text-sm font-extrabold text-[#1A1A1A] mt-0.5 block capitalize">
              {data.notice_served === 'yes' ? 'Served' : data.notice_served === 'no' ? 'Not Served' : 'Waived'}
            </span>
          </div>
          <div className="col-span-2">
            <span className="block text-[9px] font-black text-[#999999] uppercase tracking-wider">Reason for Exit</span>
            <p className="text-xs font-bold text-[#555555] mt-1 bg-[#F8F8F8] p-2.5 border border-[#E8E8E8] rounded-xl leading-relaxed">
              <span className="capitalize font-black text-[#1a1a1a] block mb-0.5">{data.reason.replace(/_/g, ' ')}</span>
              {data.reason_note || 'No Exit note provided.'}
            </p>
          </div>
        </div>
      </div>

      {/* Asset Clearance Section */}
      <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-5 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 border-b border-[#F0F0F0] pb-2.5">
          <CheckSquare size={18} className="text-[#1A1A1A]" />
          <h2 className="text-sm font-extrabold text-[#1A1A1A] uppercase tracking-wider">1. Asset Clearance</h2>
        </div>

        <div className="space-y-3">
          {[
            { id: 'uniform', label: 'Uniform Returned', checked: uniformReturned, setChecked: setUniformReturned },
            { id: 'id_card', label: 'ID Card / Badge Returned', checked: idReturned, setChecked: setIdReturned },
            { id: 'kiosk', label: 'Kiosk System PIN Revoked', checked: kioskRevoked, setChecked: setKioskRevoked },
            { id: 'keys', label: 'Keys & Store Equipment Returned', checked: keysReturned, setChecked: setKeysReturned }
          ].map(item => (
            <div key={item.id} className="flex items-center space-x-3.5">
              <input
                type="checkbox"
                id={`asset-${item.id}`}
                checked={item.checked}
                disabled={data.asset_cleared || isApprovedOrSettled}
                onChange={e => item.setChecked(e.target.checked)}
                className="w-5 h-5 rounded border-[#E8E8E8] text-[#1a1a1a] focus:ring-[#1a1a1a] disabled:opacity-75 cursor-pointer"
              />
              <label htmlFor={`asset-${item.id}`} className="text-xs font-bold text-[#1A1A1A] cursor-pointer">
                {item.label}
              </label>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Asset Clearance Notes</label>
          <textarea
            value={generalNotes}
            disabled={data.asset_cleared || isApprovedOrSettled}
            onChange={e => setGeneralNotes(e.target.value)}
            placeholder="Add comments on returned keys, laptops, damaged uniform..."
            rows={2}
            className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]/30"
          />
        </div>

        {!data.asset_cleared && !isApprovedOrSettled && (
          <button
            onClick={handleSaveAssetClearance}
            disabled={savingAssetClearance}
            className="w-full min-h-[40px] bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-white font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-sm"
          >
            {savingAssetClearance ? 'Saving clearance...' : 'Mark Asset Clearance Complete'}
          </button>
        )}

        {data.asset_cleared && (
          <div className="bg-[#EDF7EF] border border-[#2D7A3A]/20 text-[#2D7A3A] p-3 rounded-xl text-xs font-bold flex items-center justify-between">
            <span>Cleared by {data.asset_cleared_by || 'Management'}</span>
            <span className="text-[10px] font-mono">{data.asset_cleared_at ? new Date(data.asset_cleared_at).toLocaleDateString('en-IN') : ''}</span>
          </div>
        )}
      </div>

      {/* Financial Clearance Section */}
      <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-5 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 border-b border-[#F0F0F0] pb-2.5">
          <FileText size={18} className="text-[#1A1A1A]" />
          <h2 className="text-sm font-extrabold text-[#1A1A1A] uppercase tracking-wider">2. Financial Clearance</h2>
        </div>

        {settlementResult ? (
          <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-4 space-y-3 text-xs font-bold text-[#555555]">
            <div className="flex justify-between">
              <span>Prorated Paid Days:</span>
              <span className="text-[#1A1A1A] font-mono">{settlementResult.paidDays} / {settlementResult.calendarDays} days</span>
            </div>
            <div className="flex justify-between">
              <span>Prorated Gross Pay:</span>
              <span className="text-[#1A1A1A] font-mono">₹{settlementResult.grossPay}</span>
            </div>
            {settlementResult.otPay > 0 && (
              <div className="flex justify-between text-[#2D7A3A]">
                <span>Overtime Pay:</span>
                <span className="font-mono">+₹{settlementResult.otPay}</span>
              </div>
            )}
            {settlementResult.earlyInPay > 0 && (
              <div className="flex justify-between text-[#2D7A3A]">
                <span>Early Check-in Pay:</span>
                <span className="font-mono">+₹{settlementResult.earlyInPay}</span>
              </div>
            )}
            {settlementResult.earlyLeaveDeduction > 0 && (
              <div className="flex justify-between text-[#C0392B]">
                <span>Early Leave Deduction:</span>
                <span className="font-mono">-₹{settlementResult.earlyLeaveDeduction}</span>
              </div>
            )}
            {settlementResult.lateSalaryDeduction > 0 && (
              <div className="flex justify-between text-[#C0392B]">
                <span>Late Deductions:</span>
                <span className="font-mono">-₹{settlementResult.lateSalaryDeduction}</span>
              </div>
            )}
            {settlementResult.confirmedLateFines > 0 && (
              <div className="flex justify-between text-[#C0392B]">
                <span>Late Arrival Fines:</span>
                <span className="font-mono">-₹{settlementResult.confirmedLateFines}</span>
              </div>
            )}
            {settlementResult.confirmedSpecialFines > 0 && (
              <div className="flex justify-between text-[#C0392B]">
                <span>Special Fines:</span>
                <span className="font-mono">-₹{settlementResult.confirmedSpecialFines}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[#E8E8E8] pt-2.5 text-[#1A1A1A] text-sm font-extrabold">
              <span>Estimated Settlement:</span>
              <span className="font-mono text-base">₹{settlementResult.netSalary}</span>
            </div>
          </div>
        ) : (
          <div className="skeleton h-[120px] w-full" />
        )}

        {!data.financial_cleared && !isApprovedOrSettled && (
          <button
            onClick={handleSaveFinancialClearance}
            disabled={savingFinancialClearance || !settlementResult}
            className="w-full min-h-[40px] bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-white font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-sm"
          >
            {savingFinancialClearance ? 'Saving clearance...' : 'Mark Financial Clearance Complete'}
          </button>
        )}

        {data.financial_cleared && (
          <div className="bg-[#EDF7EF] border border-[#2D7A3A]/20 text-[#2D7A3A] p-3 rounded-xl text-xs font-bold flex items-center justify-between">
            <span>Settled amount: ₹{data.financial_settlement_amount} • Marked by {data.financial_cleared_by}</span>
            <span className="text-[10px] font-mono">{data.financial_cleared_at ? new Date(data.financial_cleared_at).toLocaleDateString('en-IN') : ''}</span>
          </div>
        )}
      </div>

      {/* Attendance Lock Section */}
      <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-5 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 border-b border-[#F0F0F0] pb-2.5">
          <ShieldAlert size={18} className="text-[#1A1A1A]" />
          <h2 className="text-sm font-extrabold text-[#1A1A1A] uppercase tracking-wider">3. Attendance Lock</h2>
        </div>
        <p className="text-xs text-[#555555] leading-relaxed font-semibold">
          🔐 Kiosk check-in authorization and system access will be auto-revoked on the day following exit (<span className="font-mono font-black text-[#1A1A1A]">{new Date(new Date(data.last_working_day).getTime() + 86400000).toLocaleDateString('en-IN')}</span>). No manual action is required.
        </p>
      </div>

      {/* Override Section (Admin/Ops Manager only) */}
      {!isApprovedOrSettled && (!data.asset_cleared || !data.financial_cleared) && (user?.role === 'admin' || user?.role === 'ops_manager') && (
        <div className="bg-[#FFF8E6] border border-[#D97706]/20 rounded-[18px] p-5 space-y-4">
          <div className="flex items-center space-x-2">
            <ShieldAlert size={18} className="text-[#D97706]" />
            <h3 className="text-sm font-extrabold text-[#D97706] uppercase tracking-wider">Clearance Override</h3>
          </div>
          <p className="text-xs text-[#555555] font-semibold leading-relaxed">
            As an Administrator or Operations Manager, you can bypass the clearance requirements and immediately approve this resignation. An override reason is required and will be logged.
          </p>
          
          {showOverride ? (
            <div className="space-y-3 animate-fade-in">
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="Why are you overriding the clearance checklists? (Required)"
                rows={2}
                className="w-full bg-white border border-[#E8E8E8] rounded-xl p-3 text-xs text-[#1A1A1A] focus:outline-none"
              />
              <div className="flex gap-2.5">
                <button
                  onClick={() => handleApproveResignation(true)}
                  disabled={isApproving}
                  className="flex-1 bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs py-2.5 rounded-xl active:scale-95 transition-all cursor-pointer shadow-sm text-center"
                >
                  Confirm Override Approval
                </button>
                <button
                  onClick={() => { setShowOverride(false); setOverrideReason(''); }}
                  className="bg-gray-100 hover:bg-gray-200 text-[#555555] font-bold text-xs px-4 py-2.5 rounded-xl active:scale-95 transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowOverride(true)}
              className="bg-transparent hover:bg-amber-500/10 border border-[#D97706]/40 text-[#D97706] font-bold text-xs py-2 px-4 rounded-xl active:scale-95 transition-all cursor-pointer text-center"
            >
              Bypass and Approve
            </button>
          )}
        </div>
      )}

      {/* Main Approval Button */}
      {data.status === 'clearance_complete' && (
        <button
          onClick={() => handleApproveResignation(false)}
          disabled={isApproving}
          className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-md"
        >
          {isApproving ? 'Approving...' : 'Approve Resignation Clearance'}
        </button>
      )}

      {/* Approved / Settled Actions & Document Generation */}
      {isApprovedOrSettled && (
        <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 border-b border-[#F0F0F0] pb-2.5">
            <UserCheck size={18} className="text-[#2D7A3A]" />
            <h2 className="text-sm font-extrabold text-[#2D7A3A] uppercase tracking-wider">Approved & Cleared</h2>
          </div>
          
          <div className="text-xs text-[#555555] font-semibold space-y-1.5">
            <p>Approved By: <span className="text-[#1A1A1A] font-bold">{data.approved_by || 'Management'}</span></p>
            {data.approved_at && (
              <p>Approved At: <span className="text-[#1A1A1A] font-bold">{new Date(data.approved_at).toLocaleString('en-IN')}</span></p>
            )}
            <p>Settlement Status: <span className="text-amber-600 font-extrabold uppercase">{data.status}</span></p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => generatePDF('relieving')}
              className="bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs py-3 px-3 rounded-xl active:scale-95 transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 shadow"
            >
              <FileText size={16} />
              <span>Relieving Letter</span>
            </button>
            <button
              onClick={() => generatePDF('experience')}
              className="bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold text-xs py-3 px-3 rounded-xl active:scale-95 transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 shadow"
            >
              <FileText size={16} />
              <span>Experience Cert</span>
            </button>
          </div>
        </div>
      )}

      {/* Rehire Flag (Admin/Ops Manager only, visible once approved/settled) */}
      {isApprovedOrSettled && (user?.role === 'admin' || user?.role === 'ops_manager') && (
        <div className="bg-white border border-[#E8E8E8] rounded-[18px] p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 border-b border-[#F0F0F0] pb-2.5">
            <Settings size={18} className="text-[#1A1A1A]" />
            <h2 className="text-sm font-extrabold text-[#1A1A1A] uppercase tracking-wider">Future Rehire Eligibility</h2>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Rehire Eligible</label>
            <div className="flex bg-[#F2F2F2] rounded-xl p-1 w-full gap-1">
              {[
                { label: 'Eligible', value: true },
                { label: 'Not Eligible', value: false }
              ].map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setRehireEligible(opt.value)}
                  className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all ${
                    rehireEligible === opt.value
                      ? opt.value === true
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-red-600 text-white shadow-sm'
                      : 'text-[#555555] hover:text-[#1A1A1A]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Rehire Note / Comments</label>
            <textarea
              value={rehireNote}
              onChange={e => setRehireNote(e.target.value)}
              placeholder="e.g. Recommended for shift supervisor, not reliable..."
              rows={2}
              className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3.5 text-xs text-[#1A1A1A] focus:outline-none"
            />
          </div>

          <button
            onClick={handleSaveRehireStatus}
            disabled={savingRehire || rehireEligible === null}
            className="w-full min-h-[40px] bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-white font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-sm"
          >
            {savingRehire ? 'Saving status...' : 'Update Rehire Eligibility'}
          </button>
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

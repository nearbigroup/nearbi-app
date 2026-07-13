'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { 
  Calendar, 
  User, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight, 
  Award, 
  Megaphone, 
  Bell, 
  Sparkles, 
  X, 
  Info, 
  Coins,
  Shield,
  Camera,
  Check,
  FileText,
  AlertCircle,
  Lock,
  RefreshCw,
  Wrench
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatTime12hr } from '@/lib/utils';
import { getActiveDutyInfo, handOffDuty, checkAndMarkMissedTasks } from '@/lib/sop-logic';

interface Announcement {
  id: string;
  title: string;
  message: string;
  created_by: string;
  branch_id: string | null;
  target: 'all' | 'daily' | 'hypermarket';
  created_at: string;
}

export default function StaffHomePage() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [staffInfo, setStaffInfo] = useState<any>(null);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0, weeklyOffs: 0, lateCount: 0, earlyExits: 0, requiredDays: 0, percentage: 0 });
  const [score, setScore] = useState<number | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [featuredAnnouncement, setFeaturedAnnouncement] = useState<Announcement | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [tomorrowShift, setTomorrowShift] = useState<string>('');
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [dobInput, setDobInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // SOP State variables
  const [dutyStatus, setDutyStatus] = useState<any>(null);
  const [activeShiftWindow, setActiveShiftWindow] = useState<'opening' | 'closing' | null>(null);
  const [isActiveGuardian, setIsActiveGuardian] = useState(false);
  const [isDeputyGuardian, setIsDeputyGuardian] = useState(false);
  const [sopTasks, setSopTasks] = useState<any[]>([]);
  const [completions, setCompletions] = useState<Record<string, any>>({});
  const [missedTasks, setMissedTasks] = useState<any[]>([]);
  const [handoverNotes, setHandoverNotes] = useState<any[]>([]);
  const [overrideBanner, setOverrideBanner] = useState<string | null>(null);
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  
  // Close store modal states
  const [showCloseStoreModal, setShowCloseStoreModal] = useState(false);
  const [isOverrideTime, setIsOverrideTime] = useState(false);
  const [overrideTime, setOverrideTime] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [handoverCategory, setHandoverCategory] = useState<'maintenance' | 'stock' | 'customer_staff' | 'summary'>('summary');
  const [handoverText, setHandoverText] = useState('');
  const [handoverPhoto, setHandoverPhoto] = useState<File | null>(null);
  const [submittingClose, setSubmittingClose] = useState(false);

  // Issue reporting states
  const [showReportIssueModal, setShowReportIssueModal] = useState(false);
  const [issueCategory, setIssueCategory] = useState<'ac' | 'freezer' | 'lights' | 'pos' | 'plumbing' | 'stock_damage' | 'customer_complaint' | 'other'>('other');
  const [issueDescription, setIssueDescription] = useState('');
  const [issuePhoto, setIssuePhoto] = useState<File | null>(null);
  const [submittingIssue, setSubmittingIssue] = useState(false);

  // Shift Swap States
  const [colleagues, setColleagues] = useState<any[]>([]);
  const [incomingSwaps, setIncomingSwaps] = useState<any[]>([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapColleagueId, setSwapColleagueId] = useState('');
  const [swapDate, setSwapDate] = useState('');
  const [swapNote, setSwapNote] = useState('');
  const [submittingSwap, setSubmittingSwap] = useState(false);
  const [processingSwapId, setProcessingSwapId] = useState<string | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  useEffect(() => {
    if (!user || !user.staffId) return;

    const fetchData = async () => {
      try {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const year = parseInt(currentMonth.split('-')[0]);
        const monthNum = parseInt(currentMonth.split('-')[1]);
        const calendarDays = new Date(year, monthNum, 0).getDate();

        // 1. Fetch Staff Info
        const { data: sData, error: sErr } = await supabase
          .from('staff')
          .select('*, shift:shifts(*)')
          .eq('id', user.staffId)
          .single();
        if (sErr) throw sErr;
        setStaffInfo(sData);

        if (sData.profile_pending) {
          const isReminded = sessionStorage.getItem('profile_reminded');
          if (!isReminded) {
            setShowCompletionModal(true);
            if (sData.date_of_birth) {
              setDobInput(sData.date_of_birth);
            }
          }
        }

        // 2. Fetch Attendance for Current Month
        const { data: attData, error: attErr } = await supabase
          .from('attendance')
          .select('*')
          .eq('staff_id', user.staffId)
          .gte('date', `${currentMonth}-01`)
          .lte('date', `${currentMonth}-${calendarDays}`);
        if (attErr) throw attErr;

        // Fetch approved leaves
        const { data: leavesData } = await supabase
          .from('leave_requests')
          .select('date')
          .eq('staff_id', user.staffId)
          .eq('status', 'approved')
          .gte('date', `${currentMonth}-01`)
          .lte('date', `${currentMonth}-${calendarDays}`);

        const approvedLeaveDates = new Set(leavesData?.map(l => l.date) || []);

        const daysWorked = attData?.filter(
          r => r.check_in_time !== null &&
               r.check_in_time !== undefined &&
               r.check_in_time !== ''
        ).length || 0;
        const daysPresent = daysWorked;
        const daysLate = attData?.filter(a => a.status === 'late').length || 0;

        const trueAbsentDays = attData?.filter(
          r => r.date <= todayStr &&
          !r.check_in_time &&
          r.day_type !== 'weekly_off' &&
          r.day_type !== 'leave' &&
          r.day_type !== 'holiday'
        ).length || 0;

        const earlyExitsCount = attData?.filter(a => (a.early_leave_minutes || 0) > 0).length || 0;

        const offDaysCount = sData.off_days_per_month || 4;

        const monthStart = new Date(year, monthNum - 1, 1);
        const joinDate = new Date(sData.join_date);
        const effectiveStart = joinDate > monthStart ? joinDate : monthStart;
        const today = new Date();

        const daysAvailable = Math.max(1,
          Math.floor(
            (today.getTime() - effectiveStart.getTime())
            / (1000 * 60 * 60 * 24)
          ) + 1
        );

        const attendancePercentage = Math.min(100,
          Math.round((daysWorked / daysAvailable) * 100)
        );

        setStats({
          present: daysPresent,
          late: daysLate,
          absent: trueAbsentDays,
          weeklyOffs: offDaysCount,
          lateCount: daysLate,
          earlyExits: earlyExitsCount,
          requiredDays: daysAvailable,
          percentage: attendancePercentage
        });

        // 3. Fetch Performance Score
        const { data: pScore, error: pErr } = await supabase
          .from('performance_scores')
          .select('*')
          .eq('staff_id', user.staffId)
          .eq('month', currentMonth)
          .maybeSingle();
        if (!pErr && pScore && pScore.visible_to_staff) {
          setScore(pScore.total_score);
        } else {
          setScore(null);
        }

        // 4. Fetch Announcements
        const { data: annData } = await supabase
          .from('staff_announcements')
          .select('*')
          .or(`target.eq.all,target.eq.${sData.branch_id},target_staff_id.eq.${user.staffId}`)
          .order('created_at', { ascending: false });

        if (annData) {
          setAnnouncements(annData);
          
          // Check read status in DB announcement_reads
          const { data: readLogs } = await supabase
            .from('announcement_reads')
            .select('announcement_id')
            .eq('staff_id', user.staffId);
            
          const readIds = new Set(readLogs?.map(r => r.announcement_id) || []);
          const unread = annData.filter((a: any) => !readIds.has(a.id));
          setUnreadCount(unread.length);
          
          if (unread.length > 0) {
            setFeaturedAnnouncement(unread[0]);
          } else {
            setFeaturedAnnouncement(null);
          }
        }

        // 5. Calculate Tomorrow's Shift
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDay = tomorrow.getDay(); // 0 is Sunday, etc.
        
        // Simple logic: check if tomorrow is standard weekly off (e.g. Sunday for 4-off staff, or based on shift label)
        // Usually, tomorrow's shift is their regular shift unless it is an off day.
        if (sData.shift) {
          setTomorrowShift(`${formatTime12hr(sData.shift.start_time)} - ${formatTime12hr(sData.shift.end_time)} (${sData.shift.label})`);
        } else {
          setTomorrowShift('No shift scheduled');
        }

        // SOP & Swap Initialization
        if (sData.branch_id) {
          await checkAndMarkMissedTasks(sData.branch_id, todayStr);
          await loadTodayDuty(sData.branch_id, user.staffId!);
          await fetchSwapData(sData.branch_id, user.staffId!);
        }

      } catch (err) {
        console.error('Error fetching staff home data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const loadTodayDuty = async (branchId: string, staffId: string) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const dutyInfo = await getActiveDutyInfo(branchId, todayStr);
      setDutyStatus(dutyInfo);
      
      let activeShift: 'opening' | 'closing' | null = null;
      let activeG = false;
      let backupG = false;
      
      if (dutyInfo.opening.active?.id === staffId) {
        activeShift = 'opening';
        activeG = true;
      } else if (dutyInfo.opening.backup?.id === staffId && dutyInfo.opening.status !== 'backup_promoted') {
        backupG = true;
      }
      
      if (dutyInfo.closing.active?.id === staffId) {
        activeShift = 'closing';
        activeG = true;
      } else if (dutyInfo.closing.backup?.id === staffId && dutyInfo.closing.status !== 'backup_promoted') {
        backupG = true;
      }
      
      setIsActiveGuardian(activeG);
      setIsDeputyGuardian(backupG);
      setActiveShiftWindow(activeShift);
      
      if (activeG && activeShift) {
        // Fetch tasks
        const { data: tasksData } = await supabase
          .from('sop_tasks')
          .select('*')
          .eq('branch_id', branchId)
          .eq('active', true)
          .order('display_order', { ascending: true });
          
        setSopTasks(tasksData || []);
        
        // Fetch completions
        const { data: compData } = await supabase
          .from('daily_task_completion')
          .select('*')
          .eq('branch_id', branchId)
          .eq('task_date', todayStr);
          
        const compMap: Record<string, any> = {};
        compData?.forEach(c => {
          compMap[c.task_id] = c;
        });
        setCompletions(compMap);
        
        // Fetch missed tasks
        const { data: missedData } = await supabase
          .from('daily_task_completion')
          .select('*, task:task_id(*)')
          .eq('branch_id', branchId)
          .eq('status', 'missed')
          .order('task_date', { ascending: false });
        
        setMissedTasks(missedData || []);
        
        // Fetch handover notes
        if (activeShift === 'opening') {
          const { data: notesData } = await supabase
            .from('handover_notes')
            .select('*, staff:written_by(name)')
            .eq('branch_id', branchId)
            .is('acknowledged_at', null);
            
          setHandoverNotes(notesData || []);
        }
        
        // Check for override banner
        const { data: statusData } = await supabase
          .from('store_status')
          .select('*')
          .eq('branch_id', branchId)
          .eq('status_date', todayStr)
          .maybeSingle();
          
        if (statusData?.closing_time_override) {
          setOverrideBanner(`Closing time override today: ${statusData.closing_time_override.slice(0, 5)} - Reason: ${statusData.override_reason || 'N/A'}`);
        } else {
          setOverrideBanner(null);
        }
      }
    } catch (err) {
      console.error('Error loading duty info:', err);
    }
  };

  const uploadPhotoFile = async (file: File, path: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from('attendance-selfies')
        .upload(path, file, { cacheControl: '3600', upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from('attendance-selfies')
        .getPublicUrl(path);
      return publicUrl;
    } catch (e) {
      console.error('Storage photo upload failed:', e);
      return null;
    }
  };

  const handlePhotoUpload = async (taskId: string, file: File) => {
    if (!staffInfo) return;
    try {
      setUploadingTaskId(taskId);
      const todayStr = new Date().toISOString().split('T')[0];
      const fileName = `sop/${staffInfo.id}/${todayStr}_task_${taskId}_${Date.now()}.jpg`;
      
      const publicUrl = await uploadPhotoFile(file, fileName);
      if (!publicUrl) throw new Error('Photo upload failed');
      
      const { error: compError } = await supabase
        .from('daily_task_completion')
        .upsert({
          task_id: taskId,
          branch_id: staffInfo.branch_id,
          task_date: todayStr,
          completed_by: staffInfo.id,
          completed_at: new Date().toISOString(),
          photo_proof_url: publicUrl,
          status: 'completed',
          duty_role: activeShiftWindow
        }, { onConflict: 'task_id,task_date' });
        
      if (compError) throw compError;
      
      showToast('Task completed successfully ✓');
      loadTodayDuty(staffInfo.branch_id, staffInfo.id);
    } catch (err: any) {
      console.error(err);
      alert('Photo upload failed: ' + err.message);
    } finally {
      setUploadingTaskId(null);
    }
  };

  const handleMarkDoneDirect = async (taskId: string) => {
    if (!staffInfo) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('daily_task_completion')
        .upsert({
          task_id: taskId,
          branch_id: staffInfo.branch_id,
          task_date: todayStr,
          completed_by: staffInfo.id,
          completed_at: new Date().toISOString(),
          status: 'completed',
          duty_role: activeShiftWindow
        }, { onConflict: 'task_id,task_date' });
        
      if (error) throw error;
      
      showToast('Task completed ✓');
      loadTodayDuty(staffInfo.branch_id, staffInfo.id);
    } catch (err: any) {
      console.error(err);
      alert('Failed to complete task');
    }
  };

  const handleConfirmStoreOpened = async () => {
    if (!staffInfo) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('store_status')
        .upsert({
          branch_id: staffInfo.branch_id,
          status_date: todayStr,
          opened_at: new Date().toISOString(),
          opened_by: staffInfo.id
        }, { onConflict: 'branch_id,status_date' });
        
      if (error) throw error;
      
      showToast('Store Opening Confirmed ✓');
      loadTodayDuty(staffInfo.branch_id, staffInfo.id);
    } catch (err: any) {
      console.error(err);
      alert('Failed to open store');
    }
  };

  const handleCloseStoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffInfo) return;
    setSubmittingClose(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      let photoUrl: string | null = null;
      if (handoverPhoto) {
        const pathName = `handover/${staffInfo.id}/${todayStr}_handover_${Date.now()}.jpg`;
        photoUrl = await uploadPhotoFile(handoverPhoto, pathName);
      }

      // 1. Save Handover Note if present
      if (handoverText.trim()) {
        const { error: noteErr } = await supabase
          .from('handover_notes')
          .insert({
            branch_id: staffInfo.branch_id,
            note_date: todayStr,
            category: handoverCategory,
            note_text: handoverText.trim(),
            photo_url: photoUrl,
            written_by: staffInfo.id,
            resolution_status: 'pending'
          });
        if (noteErr) throw noteErr;
      }

      // 2. Update store status closing fields
      const { error: statusErr } = await supabase
        .from('store_status')
        .upsert({
          branch_id: staffInfo.branch_id,
          status_date: todayStr,
          closed_at: new Date().toISOString(),
          closed_by: staffInfo.id,
          closing_time_override: isOverrideTime ? overrideTime : null,
          override_reason: isOverrideTime ? overrideReason : null
        }, { onConflict: 'branch_id,status_date' });

      if (statusErr) throw statusErr;

      showToast('Store Closing Confirmed ✓');
      setShowCloseStoreModal(false);
      
      // Reset close form
      setIsOverrideTime(false);
      setOverrideTime('');
      setOverrideReason('');
      setHandoverText('');
      setHandoverPhoto(null);

      loadTodayDuty(staffInfo.branch_id, staffInfo.id);
    } catch (err: any) {
      console.error(err);
      alert('Failed to close store: ' + err.message);
    } finally {
      setSubmittingClose(false);
    }
  };

  const handleHandoffDuty = async () => {
    if (!staffInfo || !dutyStatus || !activeShiftWindow) return;
    const backupStaff = dutyStatus[activeShiftWindow].backup;
    if (!backupStaff) {
      alert('No backup assigned to handoff to.');
      return;
    }

    if (!window.confirm(`Are you sure you want to hand off Active Guardian duty to ${backupStaff.name}?`)) {
      return;
    }

    try {
      await handOffDuty(
        staffInfo.branch_id,
        activeShiftWindow,
        staffInfo.id,
        backupStaff.id,
        user?.email || 'staff',
        'staff'
      );
      
      showToast('Duty handed off successfully ✓');
      loadTodayDuty(staffInfo.branch_id, staffInfo.id);
    } catch (err) {
      console.error(err);
      alert('Failed to hand off duty');
    }
  };

  const handleAcknowledgeHandoverNote = async (note: any, action: 'done' | 'still_pending') => {
    if (!staffInfo) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      // Update original note status
      const { error } = await supabase
        .from('handover_notes')
        .update({
          acknowledged_by: staffInfo.id,
          acknowledged_at: new Date().toISOString(),
          resolution_status: action
        })
        .eq('id', note.id);
        
      if (error) throw error;

      // If still pending, auto-carry forward by creating a new note
      if (action === 'still_pending') {
        const { error: carryError } = await supabase
          .from('handover_notes')
          .insert({
            branch_id: staffInfo.branch_id,
            note_date: todayStr,
            category: note.category,
            note_text: `[CARRIED FORWARD] ${note.note_text}`,
            photo_url: note.photo_url,
            written_by: note.written_by,
            resolution_status: 'still_pending',
            carried_from: note.id
          });
        if (carryError) throw carryError;
      }

      showToast('Handover note acknowledged ✓');
      loadTodayDuty(staffInfo.branch_id, staffInfo.id);
    } catch (err) {
      console.error(err);
      alert('Failed to acknowledge note');
    }
  };

  const handleReportIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffInfo) return;
    if (!issueDescription.trim()) {
      alert('Please describe the issue.');
      return;
    }
    setSubmittingIssue(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      let photoUrl: string | null = null;
      
      if (issuePhoto) {
        const fileName = `issues/${staffInfo.id}/${todayStr}_issue_${Date.now()}.jpg`;
        photoUrl = await uploadPhotoFile(issuePhoto, fileName);
      }

      // Insert ticket
      const { data: ticket, error: ticketErr } = await supabase
        .from('maintenance_tickets')
        .insert({
          branch_id: staffInfo.branch_id,
          category: issueCategory,
          description: issueDescription.trim(),
          photo_url: photoUrl,
          reported_by: staffInfo.id,
          status: 'open',
          priority: 'normal'
        })
        .select('id')
        .single();

      if (ticketErr) throw ticketErr;

      // Insert activity log
      const { error: logErr } = await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: ticket.id,
          activity_type: 'created',
          logged_by: staffInfo.name,
          note: 'Issue reported by staff.'
        });

      if (logErr) throw logErr;

      showToast('Issue reported successfully ✓');
      setShowReportIssueModal(false);
      setIssueDescription('');
      setIssuePhoto(null);
      setIssueCategory('other');
    } catch (err: any) {
      console.error(err);
      alert('Failed to report issue: ' + err.message);
    } finally {
      setSubmittingIssue(false);
    }
  };

  const fetchSwapData = async (branchId: string, staffId: string) => {
    try {
      const { data: cols } = await supabase
        .from('staff')
        .select('id, name')
        .eq('branch_id', branchId)
        .neq('id', staffId)
        .eq('active', true)
        .eq('is_resigned', false)
        .order('name');
      setColleagues(cols || []);

      const { data: swaps } = await supabase
        .from('shift_swap_requests')
        .select('*, requested_by_staff:requested_by(name)')
        .eq('requested_with', staffId)
        .eq('status', 'pending_colleague');
      setIncomingSwaps(swaps || []);
    } catch (e) {
      console.error('Failed to fetch swap data:', e);
    }
  };

  const handleSwapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffInfo || !swapColleagueId || !swapDate) {
      alert('Please fill in all swap fields.');
      return;
    }
    setSubmittingSwap(true);
    try {
      const dateObj = new Date(swapDate + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();

      const { data: rosterEntries } = await supabase
        .from('duty_roster')
        .select('*')
        .eq('branch_id', staffInfo.branch_id)
        .eq('day_of_week', dayOfWeek)
        .eq('active', true);

      const reqEntry = rosterEntries?.find(r => r.staff_id === staffInfo.id);
      const colEntry = rosterEntries?.find(r => r.staff_id === swapColleagueId);

      const requesterOriginalRole = reqEntry 
        ? `${reqEntry.role_type === 'primary' ? 'Primary' : 'Backup'} (${reqEntry.shift_window === 'opening' ? 'Opening' : 'Closing'})` 
        : 'Regular Shift';

      const colleagueOriginalRole = colEntry 
        ? `${colEntry.role_type === 'primary' ? 'Primary' : 'Backup'} (${colEntry.shift_window === 'opening' ? 'Opening' : 'Closing'})` 
        : 'Regular Shift';

      const { error } = await supabase
        .from('shift_swap_requests')
        .insert({
          requested_by: staffInfo.id,
          requested_with: swapColleagueId,
          swap_date: swapDate,
          requester_original_role: requesterOriginalRole,
          colleague_original_role: colleagueOriginalRole,
          status: 'pending_colleague'
        });

      if (error) throw error;

      const { createNotification } = await import('@/lib/notifications');
      await createNotification({
        type: 'shift_swap',
        title: '🔄 Shift Swap Request',
        message: `${staffInfo.name} wants to swap shift with you on ${new Date(swapDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Note: ${swapNote || 'None'}`,
        branchId: staffInfo.branch_id,
        staffId: swapColleagueId,
        targetRole: 'staff'
      });

      showToast('Shift swap request sent ✓');
      setShowSwapModal(false);
      setSwapColleagueId('');
      setSwapDate('');
      setSwapNote('');
      fetchSwapData(staffInfo.branch_id, staffInfo.id);
    } catch (err: any) {
      console.error(err);
      alert('Failed to request shift swap: ' + err.message);
    } finally {
      setSubmittingSwap(false);
    }
  };

  const handleColleagueResponse = async (swapId: string, action: 'accept' | 'decline') => {
    if (!staffInfo) return;
    setProcessingSwapId(swapId);
    try {
      const status = action === 'accept' ? 'pending_ops_approval' : 'declined';
      
      const { data: swapReq, error: updateErr } = await supabase
        .from('shift_swap_requests')
        .update({
          status,
          colleague_responded_at: new Date().toISOString()
        })
        .eq('id', swapId)
        .select('*, requester:requested_by(name, branch_id)')
        .single();

      if (updateErr) throw updateErr;

      const requesterName = (swapReq.requester as any)?.name || 'Your colleague';
      const { createNotification } = await import('@/lib/notifications');
      
      if (action === 'decline') {
        await createNotification({
          type: 'shift_swap',
          title: '❌ Shift Swap Declined',
          message: `${staffInfo.name} declined your shift swap request for ${new Date(swapReq.swap_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
          branchId: staffInfo.branch_id,
          staffId: swapReq.requested_by,
          targetRole: 'staff'
        });
        showToast('Shift swap declined ✓');
      } else {
        await createNotification({
          type: 'shift_swap',
          title: '⏳ Shift Swap Accepted (Pending Ops)',
          message: `${staffInfo.name} accepted your shift swap request for ${new Date(swapReq.swap_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Awaiting Operations Head approval.`,
          branchId: staffInfo.branch_id,
          staffId: swapReq.requested_by,
          targetRole: 'staff'
        });

        await createNotification({
          type: 'shift_swap',
          title: '🔄 Shift Swap Approval Pending',
          message: `${requesterName} and ${staffInfo.name} have agreed to swap shifts on ${new Date(swapReq.swap_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. Operations approval required.`,
          branchId: staffInfo.branch_id,
          staffId: null,
          targetRole: 'ops_manager'
        });
        showToast('Shift swap accepted & pending approval ✓');
      }

      fetchSwapData(staffInfo.branch_id, staffInfo.id);
    } catch (err: any) {
      console.error(err);
      alert('Failed to respond to swap request: ' + err.message);
    } finally {
      setProcessingSwapId(null);
    }
  };

  const handleDismissAnnouncement = async (annId: string) => {
    if (!user?.staffId) return;
    try {
      await supabase
        .from('announcement_reads')
        .upsert({
          announcement_id: annId,
          staff_id: user.staffId,
          read_on_kiosk: false,
          read_at: new Date().toISOString()
        }, { onConflict: 'announcement_id,staff_id' });
        
      // Re-fetch data to update UI
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const year = parseInt(currentMonth.split('-')[0]);
      const monthNum = parseInt(currentMonth.split('-')[1]);
      const calendarDays = new Date(year, monthNum, 0).getDate();
      
      const { data: annData } = await supabase
        .from('staff_announcements')
        .select('*')
        .or(`target.eq.all,target.eq.${staffInfo?.branch_id},target_staff_id.eq.${user.staffId}`)
        .order('created_at', { ascending: false });

      if (annData) {
        setAnnouncements(annData);
        const { data: readLogs } = await supabase
          .from('announcement_reads')
          .select('announcement_id')
          .eq('staff_id', user.staffId);
          
        const readIds = new Set(readLogs?.map(r => r.announcement_id) || []);
        const unread = annData.filter((a: any) => !readIds.has(a.id));
        setUnreadCount(unread.length);
        
        if (unread.length > 0) {
          setFeaturedAnnouncement(unread[0]);
        } else {
          setFeaturedAnnouncement(null);
        }
      }
    } catch (e) {
      console.error('Failed to dismiss announcement:', e);
    }
  };

  const handleOpenAnnouncement = async (ann: Announcement) => {
    setSelectedAnnouncement(ann);
    await handleDismissAnnouncement(ann.id);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.staffId || !dobInput) return;

    setSavingProfile(true);
    try {
      const { error: staffErr } = await supabase
        .from('staff')
        .update({
          date_of_birth: dobInput,
          profile_pending: false
        })
        .eq('id', user.staffId);

      if (staffErr) throw staffErr;

      const { error: accountErr } = await supabase
        .from('staff_accounts')
        .update({
          profile_completed: true
        })
        .eq('staff_id', user.staffId);

      if (accountErr) throw accountErr;

      setStaffInfo((prev: any) => ({
        ...prev,
        profile_pending: false,
        date_of_birth: dobInput
      }));
      setShowCompletionModal(false);
      alert('Profile completed successfully!');
    } catch (err) {
      console.error('Error completing profile:', err);
      alert('Failed to save profile details.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRemindLater = () => {
    sessionStorage.setItem('profile_reminded', 'true');
    setShowCompletionModal(false);
  };

  const getBranchLabel = (branchId: string) => {
    return branchId === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-[120px] w-full rounded-2xl" />
        <div className="skeleton h-[70px] w-full rounded-xl" />
        <div className="skeleton h-[180px] w-full rounded-2xl" />
        <div className="skeleton h-[100px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">

      {/* --- INCOMING SHIFT SWAP REQUESTS --- */}
      {incomingSwaps.map(swap => (
        <div 
          key={swap.id} 
          className="bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200 rounded-2xl p-4 shadow-sm flex flex-col space-y-3 animate-in fade-in duration-200 text-xs font-semibold text-amber-950"
        >
          <div className="flex items-start gap-3 text-left">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <RefreshCw size={16} />
            </div>
            <div className="flex-1 space-y-0.5">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-800">Shift Swap Request</h4>
              <p className="font-extrabold text-[#1A1A1A]">
                {swap.requested_by_staff?.name || 'A colleague'} wants to swap shift with you.
              </p>
              <p className="text-[10px] text-slate-500 font-bold">
                Date: {new Date(swap.swap_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              {swap.colleague_original_role && swap.colleague_original_role !== 'Regular Shift' && (
                <p className="text-[9px] bg-amber-200/50 px-1.5 py-0.5 rounded inline-block text-amber-900 font-black uppercase mt-1">
                  Your Duty Role: {swap.colleague_original_role}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handleColleagueResponse(swap.id, 'accept')}
              disabled={processingSwapId !== null}
              className="flex-1 min-h-[36px] bg-slate-900 hover:bg-black text-white font-black text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              {processingSwapId === swap.id ? <RefreshCw size={14} className="animate-spin" /> : 'Accept Swap'}
            </button>
            <button
              onClick={() => handleColleagueResponse(swap.id, 'decline')}
              disabled={processingSwapId !== null}
              className="flex-1 min-h-[36px] bg-white border border-[#EAEAEA] text-slate-700 hover:bg-slate-50 font-black text-[10px] uppercase tracking-wider rounded-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {/* --- SOP TODAY'S DUTY CARDS --- */}
      {isDeputyGuardian && activeShiftWindow && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="text-slate-400" size={20} />
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">🛡️ Deputy Guardian Today</h4>
              <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                {staffInfo?.branch_id === 'daily' ? 'Daily' : 'Hypermarket'} — {activeShiftWindow === 'opening' ? 'Opening Shift' : 'Closing Shift'}
              </p>
            </div>
          </div>
          <span className="bg-slate-100 text-slate-600 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-slate-200">
            Backup
          </span>
        </div>
      )}

      {isActiveGuardian && activeShiftWindow && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-3xl p-5 text-white shadow-xl space-y-4 relative overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.04),transparent)] pointer-events-none" />
          
          {/* Card Header */}
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-400">
                <Shield size={18} className="animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-300">Active Store Guardian</span>
              </div>
              <h3 className="text-base font-black uppercase tracking-wider">
                {staffInfo?.branch_id === 'daily' ? 'Daily' : 'Hypermarket'} — {activeShiftWindow === 'opening' ? 'Opening Lock' : 'Closing Lock'}
              </h3>
            </div>
            
            {/* Hand off button */}
            {dutyStatus && dutyStatus[activeShiftWindow]?.backup && (
              <button
                onClick={handleHandoffDuty}
                className="bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 hover:text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl border border-white/10 transition-all cursor-pointer"
              >
                Hand off Duty
              </button>
            )}
          </div>

          {/* Override caution banner */}
          {overrideBanner && (
            <div className="bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl p-3 text-[11px] font-bold leading-normal">
              {overrideBanner}
            </div>
          )}

          {/* Handover notes from last night */}
          {activeShiftWindow === 'opening' && handoverNotes.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Handover from Last Night ({handoverNotes.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {handoverNotes.map(note => (
                  <div key={note.id} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-start text-[10px]">
                      <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                        {note.category?.replace('_', ' ')}
                      </span>
                      <span className="text-slate-400 font-semibold">Written by: {note.staff?.name || 'Staff'}</span>
                    </div>
                    <p className="text-xs text-slate-200 font-semibold leading-relaxed">{note.note_text}</p>
                    {note.photo_url && (
                      <a href={note.photo_url} target="_blank" rel="noreferrer" className="block text-[10px] text-blue-400 font-bold underline">
                        View Photo Proof
                      </a>
                    )}
                    
                    {/* Acknowledge actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleAcknowledgeHandoverNote(note, 'done')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-wider px-2.5 py-1 rounded"
                      >
                        Acknowledge & Resolve
                      </button>
                      <button
                        onClick={() => handleAcknowledgeHandoverNote(note, 'still_pending')}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-black text-[9px] uppercase tracking-wider px-2.5 py-1 rounded"
                      >
                        Acknowledge & Keep Pending
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missed tasks carried forward */}
          {missedTasks.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-red-400">
                Pending from Last Shift ({missedTasks.length})
              </h4>
              <div className="space-y-2">
                {missedTasks.map(item => {
                  const task = item.task;
                  if (!task) return null;
                  return (
                    <div key={item.id} className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-200">{task.task_name}</span>
                        <span className="block text-[9px] text-red-300 font-bold uppercase">Missed on {item.task_date}</span>
                      </div>
                      
                      {/* Mark completed trigger */}
                      {task.requires_photo ? (
                        <div className="relative">
                          <label className="bg-red-600 hover:bg-red-700 p-2 rounded-xl text-white block cursor-pointer transition-colors">
                            {uploadingTaskId === task.id ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Camera size={16} />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(task.id, file);
                              }}
                              className="hidden"
                              disabled={uploadingTaskId !== null}
                            />
                          </label>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleMarkDoneDirect(task.id)}
                          className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-xl"
                        >
                          <Check size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Regular Tasks List */}
          <div className="space-y-2.5">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Shift Checklists Tasks
            </h4>
            
            <div className="space-y-2">
              {sopTasks
                .filter(t => t.shift_window === activeShiftWindow || t.shift_window === 'mid_shift')
                .map(task => {
                  const comp = completions[task.id];
                  const isCompleted = comp?.status === 'completed';
                  
                  // Check if task window is active/flexible
                  let isWindowPassed = false;
                  let isWindowNotStarted = false;
                  
                  if (task.time_start || task.time_end) {
                    const now = new Date();
                    const currentMins = now.getHours() * 60 + now.getMinutes();
                    if (task.time_start) {
                      const [h, m] = task.time_start.split(':').map(Number);
                      if (currentMins < h * 60 + m) isWindowNotStarted = true;
                    }
                    if (task.time_end) {
                      const [h, m] = task.time_end.split(':').map(Number);
                      if (currentMins > h * 60 + m) isWindowPassed = true;
                    }
                  }

                  const isDisabled = (isWindowPassed || isWindowNotStarted) && !isCompleted;
                  
                  return (
                    <div 
                      key={task.id} 
                      className={`bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between transition-all ${
                        isDisabled ? 'opacity-40 grayscale pointer-events-none' : ''
                      } ${isCompleted ? 'bg-emerald-500/10 border-emerald-500/20' : ''}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold ${isCompleted ? 'text-emerald-400 line-through' : 'text-slate-100'}`}>
                            {task.task_name}
                          </span>
                          {task.is_critical && (
                            <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                              CRITICAL
                            </span>
                          )}
                        </div>
                        <span className="block text-[9px] text-slate-400 font-semibold">
                          Window: {task.time_start ? `${task.time_start.slice(0, 5)} - ${task.time_end?.slice(0, 5)}` : 'Flexible'}
                        </span>
                      </div>

                      {/* Completion status or triggers */}
                      {isCompleted ? (
                        <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                          <CheckCircle size={16} />
                          <span>Done</span>
                        </div>
                      ) : task.requires_photo ? (
                        <div className="relative">
                          <label className="bg-slate-700 hover:bg-slate-600 active:scale-95 p-2 rounded-xl text-slate-200 block cursor-pointer transition-colors">
                            {uploadingTaskId === task.id ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Camera size={16} />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoUpload(task.id, file);
                              }}
                              className="hidden"
                              disabled={uploadingTaskId !== null}
                            />
                          </label>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleMarkDoneDirect(task.id)}
                          className="bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 p-2 rounded-xl cursor-pointer"
                        >
                          <Check size={16} />
                        </button>
                      )}

                    </div>
                  );
                })}
            </div>
          </div>

          {/* Confirm Open / Close Buttons */}
          <div className="pt-3 border-t border-white/10">
            {activeShiftWindow === 'opening' ? (
              <button
                onClick={handleConfirmStoreOpened}
                disabled={(() => {
                  const criticalTasks = sopTasks.filter(t => t.shift_window === 'opening' && t.is_critical);
                  return !criticalTasks.every(t => completions[t.id]?.status === 'completed');
                })()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check size={16} />
                <span>Confirm Store Opened</span>
              </button>
            ) : (
              <button
                onClick={() => setShowCloseStoreModal(true)}
                disabled={(() => {
                  const criticalTasks = sopTasks.filter(t => t.shift_window === 'closing' && t.is_critical);
                  return !criticalTasks.every(t => completions[t.id]?.status === 'completed');
                })()}
                className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Lock size={16} />
                <span>Confirm Store Closed</span>
              </button>
            )}
          </div>

        </div>
      )}

      {/* 1. Announcement Banner at Top (if unread exists) */}
      {featuredAnnouncement && (
        <div className="bg-gradient-to-r from-amber-50 to-amber-100/80 border border-amber-200/60 rounded-2xl p-4 shadow-sm flex items-start justify-between relative overflow-hidden transition-all duration-300 animate-in slide-in-from-top-4">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/20 rounded-full blur-xl -mr-8 -mt-8" />
          
          <div className="flex items-start space-x-3.5 z-10 flex-1 mr-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm animate-bounce">
              <Megaphone size={16} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenAnnouncement(featuredAnnouncement)}>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-200/50 px-1.5 py-0.5 rounded">Announcement</span>
                <span className="text-[9px] font-bold text-amber-600">New</span>
              </div>
              <h4 className="font-extrabold text-xs text-amber-900 mt-1 truncate">{featuredAnnouncement.title}</h4>
              <p className="text-[11px] text-amber-800/80 font-semibold mt-0.5 truncate leading-snug">
                {featuredAnnouncement.message.substring(0, 50)}...
              </p>
            </div>
          </div>

          <button
            onClick={() => handleDismissAnnouncement(featuredAnnouncement.id)}
            className="p-1 rounded-full text-amber-700 hover:bg-amber-200/40 transition-colors z-10"
            title="Dismiss"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* 2. Staff Info Card (Premium Glassmorphism Style) */}
      {staffInfo && (
        <div className="bg-white border border-[#E8E8E8] rounded-2xl p-5 flex flex-col space-y-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--bg-secondary)] rounded-full blur-3xl -mr-10 -mt-10" />
          
          <div className="flex items-start space-x-4 z-10">
            <div className="w-14 h-14 rounded-2xl bg-[#1a1a1a] text-white border-2 border-white shadow-md font-black text-2xl flex items-center justify-center flex-shrink-0">
              {staffInfo.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[9px] font-black tracking-widest text-[var(--text-muted)] uppercase">Welcome Back</span>
              <h2 className="font-black text-lg text-[#1A1A1A] leading-tight truncate">
                {staffInfo.name}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] font-extrabold mt-1 flex items-center">
                <span className="capitalize">{staffInfo.department}</span>
                <span className="mx-1.5 text-gray-300">•</span>
                <span className="capitalize">{getBranchLabel(staffInfo.branch_id)}</span>
              </p>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-100 pt-3 flex flex-wrap gap-2 z-10">
            <span className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] text-[10px] font-black px-2.5 py-1 rounded-lg">
              Shift: {staffInfo.shift?.label || 'None'} ({formatTime12hr(staffInfo.shift?.start_time)} - {formatTime12hr(staffInfo.shift?.end_time)})
            </span>
            {staffInfo.join_date && (
              <span className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] text-[10px] font-black px-2.5 py-1 rounded-lg">
                Member Since: {new Date(staffInfo.join_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. Outstanding Advance Balance (Conditional Banner) */}
      {staffInfo && Number(staffInfo.advance_balance || 0) > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Coins size={16} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] font-black text-emerald-800 uppercase tracking-wider leading-none">Advance Balance</p>
              <h4 className="text-[14px] font-black text-emerald-900 mt-1">
                Outstanding: ₹{Number(staffInfo.advance_balance).toLocaleString()}
              </h4>
            </div>
          </div>
          <div className="bg-emerald-100/50 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded border border-emerald-200/50">
            Deducted at source
          </div>
        </div>
      )}

      {/* 4. Quick Stats Section (Rich Layout) */}
      <div className="grid grid-cols-2 gap-3.5">
        
        {/* Attendance Percentage Circle Meter */}
        <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 flex flex-col items-center text-center justify-between shadow-sm relative overflow-hidden">
          <div className="w-full flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-wider">Attendance %</span>
            <Sparkles size={13} className="text-amber-500 animate-pulse" />
          </div>
          
          <div className="my-2.5 relative flex items-center justify-center">
            <div className="w-20 h-20 rounded-full border-4 border-gray-100 flex items-center justify-center bg-gray-50/30">
              <div className="text-center">
                <span className="text-2xl font-black text-[#1A1A1A]">{stats.percentage}%</span>
                <span className="text-[8px] font-bold text-[var(--text-muted)] block uppercase tracking-tight">Month</span>
              </div>
            </div>
          </div>
          
          <span className="text-[10px] text-[var(--text-secondary)] font-extrabold mt-1">
            {stats.present} / {stats.requiredDays} working days
          </span>
        </div>

        {/* Performance Score Display */}
        <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 flex flex-col items-center text-center justify-between shadow-sm">
          <div className="w-full flex items-center justify-between mb-1">
            <span className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-wider flex items-center gap-1">
              <Award size={12} className="text-[#FBBF24]" /> Score
            </span>
            <span title="Visible if published by Ops Manager">
              <Info size={12} className="text-gray-300" />
            </span>
          </div>

          <div className="my-2 flex flex-col items-center justify-center">
            {score !== null ? (
              <>
                <span className="text-4xl font-black text-amber-500 tracking-tight leading-none">{score}</span>
                <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200/50 rounded px-1.5 py-0.5 uppercase mt-2 tracking-wide">Excellent</span>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-2.5">
                <Clock size={20} className="text-gray-300 animate-spin" />
                <span className="text-[9.5px] font-bold text-[var(--text-muted)] mt-1.5 uppercase tracking-tight">Review Pending</span>
              </div>
            )}
          </div>

          <span className="text-[9px] text-[var(--text-muted)] font-bold">
            Updated monthly
          </span>
        </div>
      </div>

      {/* 5. Detailed Attendance Summary Numbers */}
      <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 flex flex-col shadow-sm">
        <h3 className="font-extrabold text-xs text-[#1A1A1A] uppercase tracking-wider border-b border-[var(--border)] pb-2.5 mb-3 flex items-center justify-between">
          <span>This Month Summary</span>
          <span className="text-[9.5px] font-bold text-[var(--text-muted)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded border border-[var(--border)]">{new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
        </h3>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-[#EDF7EF] border border-[#C3E6CB]/30 rounded-xl p-2.5">
            <span className="text-[9px] text-[#2D7A3A] font-black uppercase tracking-wider block">Present</span>
            <span className="text-xl font-black text-[#2D7A3A] block mt-0.5">{stats.present}</span>
          </div>
          <div className="bg-[#FDECEA] border border-[#F5C6CB]/30 rounded-xl p-2.5">
            <span className="text-[9px] text-[#C0392B] font-black uppercase tracking-wider block">Absent</span>
            <span className="text-xl font-black text-[#C0392B] block mt-0.5">{stats.absent}</span>
          </div>
          <div className="bg-gray-50 border border-gray-200/50 rounded-xl p-2.5">
            <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider block">Off Days</span>
            <span className="text-xl font-black text-gray-700 block mt-0.5">{stats.weeklyOffs}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2 text-center">
          <div className="bg-amber-50 border border-amber-200/30 rounded-xl p-2.5 flex items-center justify-between px-3">
            <span className="text-[10px] text-amber-800 font-extrabold uppercase tracking-wide">Late Arrivals</span>
            <span className="text-base font-black text-amber-700 bg-white/80 border border-amber-200/50 px-2.5 py-0.5 rounded-lg">{stats.lateCount}</span>
          </div>
          <div className="bg-orange-50 border border-orange-200/30 rounded-xl p-2.5 flex items-center justify-between px-3">
            <span className="text-[10px] text-orange-800 font-extrabold uppercase tracking-wide">Early Exits</span>
            <span className="text-base font-black text-orange-700 bg-white/80 border border-orange-200/50 px-2.5 py-0.5 rounded-lg">{stats.earlyExits}</span>
          </div>
        </div>
      </div>

      {/* 6. Tomorrow's Upcoming Shift */}
      <div className="bg-white border border-[#E8E8E8] rounded-2xl p-4 shadow-sm flex items-center justify-between relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1a1a1a]" />
        
        <div className="flex items-center space-x-3.5 pl-1.5">
          <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-[#1A1A1A] flex-shrink-0">
            <Clock size={16} strokeWidth={1.5} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">Upcoming Shift (Tomorrow)</span>
            <h4 className="text-xs font-black text-[#1A1A1A] mt-1">{tomorrowShift}</h4>
          </div>
        </div>

        <div className="text-[9px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded uppercase border border-gray-200/50">
          Planned
        </div>
      </div>

      {/* 7. Announcement Detail Dialog (Popup Modal) */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl max-w-sm w-full p-5 flex flex-col space-y-4 shadow-2xl animate-in scale-in-95 duration-200">
            <div className="flex items-start justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2">
                <Megaphone className="text-amber-500" size={18} />
                <h3 className="text-[#1A1A1A] text-sm font-black uppercase tracking-wider">Announcement</h3>
              </div>
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-base font-black text-[#1A1A1A] leading-tight">{selectedAnnouncement.title}</h4>
              <p className="text-xs text-gray-500 font-bold">
                Posted on {new Date(selectedAnnouncement.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} by {selectedAnnouncement.created_by}
              </p>
              
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 text-xs font-semibold text-gray-700 leading-relaxed max-h-[220px] overflow-y-auto whitespace-pre-wrap">
                {selectedAnnouncement.message}
              </div>
            </div>

            <button
              onClick={() => setSelectedAnnouncement(null)}
              className="w-full min-h-[42px] bg-[#1a1a1a] text-white font-black text-xs rounded-xl active:scale-95 transition-all shadow-md"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Profile Completion Modal */}
      {showCompletionModal && staffInfo && (
        <div className="fixed inset-0 z-[19000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-250">
          <div className="bg-white border border-[#E8E8E8] rounded-[24px] max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-left animate-in scale-in-95 duration-250">
            <div>
              <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-3">
                <User size={20} />
              </div>
              <h3 className="text-[#1A1A1A] text-base font-black leading-tight">Complete Your Profile</h3>
              <p className="text-[#555555] text-xs font-semibold mt-1">
                Please complete your details. Joining date is read-only, while Date of Birth is required.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs font-semibold text-[#555555]">
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Joining Date (Read-Only)</label>
                <input
                  type="text"
                  value={staffInfo.join_date ? new Date(staffInfo.join_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  disabled
                  className="w-full bg-gray-150 border border-gray-200 rounded-xl p-3 text-xs font-bold text-gray-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={dobInput}
                  onChange={e => setDobInput(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:border-black [color-scheme:light]"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleRemindLater}
                  className="flex-1 min-h-[40px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-black text-xs rounded-xl active:scale-95 transition-all cursor-pointer text-center"
                >
                  Remind Later
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="flex-1 min-h-[40px] bg-[#1A1A1A] hover:bg-black text-white font-black text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CLOSE STORE MODAL --- */}
      {showCloseStoreModal && (
        <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs font-semibold text-[#1A1A1A]">
            <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider">
                Store Closing Handover
              </h3>
              <button
                onClick={() => setShowCloseStoreModal(false)}
                className="text-slate-400 hover:text-[#1A1A1A] text-xs font-bold"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCloseStoreSubmit} className="space-y-4">
              
              {/* Closing Time Override toggle */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={isOverrideTime}
                    onChange={e => setIsOverrideTime(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-600"
                  />
                  <div className="flex flex-col">
                    <span className="font-bold">Override closing time?</span>
                    <span className="text-[9px] text-slate-400">Check if actual closing differs from regular shift</span>
                  </div>
                </label>

                {isOverrideTime && (
                  <div className="space-y-3 pt-1 border-l-2 border-red-500 pl-3">
                    <div>
                      <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">New Closing Time</label>
                      <input
                        type="time"
                        value={overrideTime}
                        onChange={e => setOverrideTime(e.target.value)}
                        className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500"
                        required={isOverrideTime}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Reason for Override</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Extended footfalls, inventory audit"
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-semibold"
                        required={isOverrideTime}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Handover Note category */}
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Handover Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {(['maintenance', 'stock', 'customer_staff', 'summary'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setHandoverCategory(cat)}
                      className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all cursor-pointer ${
                        handoverCategory === cat 
                          ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' 
                          : 'bg-[#f5f5f5] text-slate-500 border-slate-200'
                      }`}
                    >
                      {cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Handover Notes text */}
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Anything for morning staff?</label>
                <textarea
                  rows={3}
                  placeholder="Include notes about maintenance, supplies or stock issues..."
                  value={handoverText}
                  onChange={e => setHandoverText(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-semibold"
                />
              </div>

              {/* Optional Photo Attachment */}
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Handover Photo (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={e => setHandoverPhoto(e.target.files?.[0] || null)}
                  className="w-full text-[10px] file:mr-2.5 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submittingClose}
                className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer mt-4 flex items-center justify-center gap-1.5"
              >
                {submittingClose ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                <span>Submit & Close Store</span>
              </button>

            </form>
          </div>
        </div>
      )}

      {/* Report Issue Modal */}
      {showReportIssueModal && (
        <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs font-semibold text-[#1A1A1A]">
            <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider">
                Report a Maintenance Issue
              </h3>
              <button
                onClick={() => setShowReportIssueModal(false)}
                className="text-slate-400 hover:text-[#1A1A1A] text-xs font-bold"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleReportIssueSubmit} className="space-y-4">
              
              {/* Category Select Chips */}
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1.5">Issue Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { val: 'ac', label: 'AC / Cooling' },
                    { val: 'freezer', label: 'Freezer / Fridge' },
                    { val: 'lights', label: 'Lights / Elec' },
                    { val: 'pos', label: 'POS System' },
                    { val: 'plumbing', label: 'Plumbing' },
                    { val: 'stock_damage', label: 'Stock Damage' },
                    { val: 'customer_complaint', label: 'Complaint' },
                    { val: 'other', label: 'Other' }
                  ].map(cat => (
                    <button
                      key={cat.val}
                      type="button"
                      onClick={() => setIssueCategory(cat.val as any)}
                      className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all cursor-pointer ${
                        issueCategory === cat.val 
                          ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' 
                          : 'bg-[#f5f5f5] text-slate-500 border-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Issue Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe the issue in detail..."
                  value={issueDescription}
                  onChange={e => setIssueDescription(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-semibold"
                  required
                />
              </div>

              {/* Optional Photo Attachment */}
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Photo Proof (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={e => setIssuePhoto(e.target.files?.[0] || null)}
                  className="w-full text-[10px] file:mr-2.5 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submittingIssue}
                className="w-full py-3 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer mt-4 flex items-center justify-center gap-1.5"
              >
                {submittingIssue ? <RefreshCw size={14} className="animate-spin" /> : <Wrench size={14} />}
                <span>Submit Ticket</span>
              </button>

            </form>
          </div>
        </div>
      )}

      {/* Floating Action Button (Report Issue) */}
      <button
        onClick={() => setShowReportIssueModal(true)}
        className="fixed bottom-24 right-4 z-50 bg-[#C0392B] hover:bg-[#A93226] text-white rounded-full p-4 shadow-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center border border-white/10 animate-bounce"
        title="Report an Issue"
      >
        <Wrench size={22} />
      </button>

      {/* Shift Swap Request Modal */}
      {showSwapModal && (
        <div className="fixed inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-xs font-semibold text-[#1A1A1A]">
            <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3 text-left">
              <h3 className="text-sm font-black uppercase tracking-wider">
                Request Shift Swap
              </h3>
              <button
                onClick={() => setShowSwapModal(false)}
                className="text-slate-400 hover:text-[#1A1A1A] text-xs font-bold"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSwapSubmit} className="space-y-4 text-left">
              
              {/* Pick colleague */}
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Pick a Colleague (Same Branch)</label>
                <select
                  value={swapColleagueId}
                  onChange={e => setSwapColleagueId(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-bold cursor-pointer"
                  required
                >
                  <option value="">Select Colleague...</option>
                  {colleagues.map(col => (
                    <option key={col.id} value={col.id}>{col.name}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Swap Date</label>
                <input
                  type="date"
                  value={swapDate}
                  onChange={e => setSwapDate(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-bold cursor-pointer [color-scheme:light]"
                  required
                />
              </div>

              {/* Optional context note */}
              <div>
                <label className="block text-[9px] font-black uppercase text-[#999999] tracking-wider mb-1">Swap Note (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Can you cover my opening shift, I will cover yours?"
                  value={swapNote}
                  onChange={e => setSwapNote(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#EAEAEA] rounded-xl p-3 focus:outline-none focus:border-slate-500 font-semibold"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submittingSwap}
                className="w-full py-3 bg-[#1A1A1A] hover:bg-[#333333] disabled:opacity-50 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer mt-4 flex items-center justify-center gap-1.5"
              >
                {submittingSwap ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                <span>Submit Swap Request</span>
              </button>

            </form>
          </div>
        </div>
      )}

      {/* Floating Action Button (Request Swap) */}
      <button
        onClick={() => {
          setSwapColleagueId('');
          setSwapDate('');
          setSwapNote('');
          setShowSwapModal(true);
        }}
        className="fixed bottom-40 right-4 z-50 bg-[#7D3C98] hover:bg-[#6C3483] text-white rounded-full p-4 shadow-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center border border-white/10"
        title="Request Shift Swap"
      >
        <RefreshCw size={22} />
      </button>

      {/* Toast alert display */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[25000] bg-[#EDF7EF] border border-[#2D7A3A] text-[#2D7A3A] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-1">
          <CheckCircle size={14} className="text-[#2D7A3A]" />
          <span>{toastMsg}</span>
        </div>
      )}

    </div>
  );
}

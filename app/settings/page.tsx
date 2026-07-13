'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, VALID_USERS } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { useRouter } from 'next/navigation';
import { Lock, Plus, Trash2, CheckCircle2, Circle, Search, X } from 'lucide-react';
import { writeAuditLog } from '@/lib/audit';
import { calculateLateMinutes } from '@/lib/salary';

interface FineSettings {
  id: string;
  yellow_fine: number;
  orange_fine: number;
  red_fine: number;
  yellow_free_passes: number;
}

interface BreakSettings {
  id?: string;
  branch_id?: string;
  morning_tea_duration: number;
  morning_tea_start: string;
  morning_tea_end: string;
  morning_tea_enabled?: boolean;
  food_break_duration: number;
  food_break_start: string;
  food_break_end: string;
  food_break_enabled?: boolean;
  evening_tea_duration: number;
  evening_tea_start: string;
  evening_tea_end: string;
  evening_tea_enabled?: boolean;
}

interface Staff {
  id: string;
  name: string;
  department: string;
  branch_id: string;
}

interface Exemption {
  id: string;
  staff_id: string;
  staff: Staff;
}

export default function SettingsPage() {
  const { user, canSeeSalaryBreakdown, isLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Danger zone states
  const [dangerAction, setDangerAction] = useState<'CLEAR_ATTENDANCE' | 'DELETE_INACTIVE' | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [executingDanger, setExecutingDanger] = useState(false);

  // Data management cleanup states
  const [cleanupMonth, setCleanupMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cleanupBranch, setCleanupBranch] = useState<'all' | 'daily' | 'hypermarket'>('all');
  const [cleanupItems, setCleanupItems] = useState({
    attendance: false,
    fines: false,
    breaks: false,
    wall: false,
    notifications: false,
    leaves: false,
    salaries: false,
  });
  const [cleanupConfirmText, setCleanupConfirmText] = useState('');
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  const [settings, setSettings] = useState<FineSettings>({
    id: 'default',
    yellow_fine: 25,
    orange_fine: 50,
    red_fine: 100,
    yellow_free_passes: 4,
  });

  const [exemptions, setExemptions] = useState<Exemption[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [exemptionSearch, setExemptionSearch] = useState('');

  const [savingSettings, setSavingSettings] = useState(false);

  const [selectedBreakBranch, setSelectedBreakBranch] = useState<'all' | 'daily' | 'hypermarket'>('all');

  const [breakSettings, setBreakSettings] = useState<BreakSettings>({
    morning_tea_duration: 10,
    morning_tea_start: '09:30',
    morning_tea_end: '11:30',
    morning_tea_enabled: true,
    food_break_duration: 25,
    food_break_start: '12:00',
    food_break_end: '15:00',
    food_break_enabled: true,
    evening_tea_duration: 10,
    evening_tea_start: '16:00',
    evening_tea_end: '18:30',
    evening_tea_enabled: true,
  });
  const [savingBreakSettings, setSavingBreakSettings] = useState(false);

  const [recalculating, setRecalculating] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState<string | null>(null);
  const [recalcResult, setRecalcResult] = useState<{
    total: number;
    corrected: number;
    deleted: number;
    skipped: number;
  } | null>(null);
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);

  // Credentials & Login Permission Manager states (Fix 13 & Fix 16)
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [newCredEmail, setNewCredEmail] = useState('');
  const [newCredName, setNewCredName] = useState('');
  const [newCredPassword, setNewCredPassword] = useState('');
  const [newCredRole, setNewCredRole] = useState<'admin' | 'ops_manager' | 'staff_executive' | 'kiosk'>('staff_executive');
  const [newCredBranch, setNewCredBranch] = useState<string>('all');
  const [showAddCredModal, setShowAddCredModal] = useState(false);

  // app_logins credentials states
  const [appLogins, setAppLogins] = useState<any[]>([]);
  const [showEditLoginModal, setShowEditLoginModal] = useState(false);
  const [editingLogin, setEditingLogin] = useState<any>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});
  const [savingLogin, setSavingLogin] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const fetchData = async () => {
    try {
      // 1. Fetch fine settings section: independent try/catch
      try {
        const { data: setD, error: setE } = await supabase
          .from('fine_settings')
          .select('*')
          .limit(1)
          .maybeSingle();

        if (setE) throw setE;
        if (setD) {
          setSettings(setD);
        }
      } catch (err: any) {
        console.error('Fine settings fetch error:', err);
      }

      // 2. Fetch exemptions section: independent try/catch
      try {
        const { data: exD, error: exE } = await supabase
          .from('staff_fine_exemptions')
          .select('*, staff!inner(*)');
        
        if (exE) throw exE;
        setExemptions((exD || []) as unknown as Exemption[]);
      } catch (err: any) {
        console.error('Exemptions fetch error:', err);
        setExemptions([]);
      }

      // 3. Fetch active staff list: independent try/catch
      try {
        const { data: stD, error: stE } = await supabase
          .from('staff')
          .select('id, name, department, branch_id')
          .eq('active', true)
          .order('name');
        
        if (stE) throw stE;
        setStaffList(stD || []);
      } catch (err: any) {
        console.error('Staff list fetch error:', err);
        setStaffList([]);
      }

      // 4. Fetch break settings section: independent try/catch with auto default initialization
      try {
        const { data: breakData, error: breakE } = await supabase
          .from('break_settings')
          .select('*')
          .eq('branch_id', selectedBreakBranch)
          .maybeSingle();

        if (breakE) throw breakE;

        if (!breakData) {
          const defaultBreak = {
            branch_id: selectedBreakBranch,
            morning_tea_duration: 10,
            morning_tea_start: '09:30',
            morning_tea_end: '11:30',
            morning_tea_enabled: true,
            food_break_duration: 25,
            food_break_start: '12:00',
            food_break_end: '15:00',
            food_break_enabled: true,
            evening_tea_duration: 10,
            evening_tea_start: '16:00',
            evening_tea_end: '18:30',
            evening_tea_enabled: true,
          };
          
          const { data: insertedData, error: insertE } = await supabase
            .from('break_settings')
            .insert(defaultBreak)
            .select()
            .maybeSingle();

          if (insertE) {
            console.error('Failed to initialize default break settings:', insertE);
          } else if (insertedData) {
            setBreakSettings(insertedData);
          }
        } else {
          setBreakSettings(breakData);
        }
      } catch (err: any) {
        console.error('Break settings fetch error:', err);
      }

      // 5. Load custom/blocked credentials
      loadCredentials();

    } catch (err: any) {
      console.error('Settings fetch error:', err);
      setErrorMsg('Failed to load settings data.');
    } finally {
      setLoading(false);
    }
  };

  const loadCredentials = async () => {
    if (typeof window === 'undefined') return;
    try {
      const customUsersJson = localStorage.getItem('nearbi_custom_users');
      const customUsers = customUsersJson ? JSON.parse(customUsersJson) : {};
      
      const merged = {
        ...VALID_USERS,
        ...customUsers
      };

      const usersArray = Object.keys(merged).map((email) => ({
        email,
        name: merged[email].name,
        role: merged[email].role,
        branch: merged[email].branch,
        password: merged[email].password,
        isCustom: Object.prototype.hasOwnProperty.call(customUsers, email)
      }));

      setSystemUsers(usersArray);

      // Load blocked users from DB
      const { data: blockedData, error } = await supabase
        .from('user_permissions')
        .select('user_email')
        .eq('is_blocked', true);
      
      if (!error && blockedData) {
        setBlockedUsers(blockedData.map(r => r.user_email.toLowerCase().trim()));
      } else {
        const blockedJson = localStorage.getItem('nearbi_blocked_users');
        setBlockedUsers(blockedJson ? JSON.parse(blockedJson) : []);
      }

      // Load app logins from DB
      const { data: loginsData, error: loginsError } = await supabase
        .from('app_logins')
        .select('*')
        .order('display_name');
      if (!loginsError && loginsData) {
        setAppLogins(loginsData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEditLogin = (login: any) => {
    setEditingLogin(login);
    setEditEmail(login.email);
    setEditPassword('');
    setShowEditLoginModal(true);
  };

  const handleSaveLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmail.trim()) {
      alert("Email is required.");
      return;
    }
    setSavingLogin(true);
    try {
      const payload: any = {
        email: editEmail.trim().toLowerCase(),
        updated_at: new Date().toISOString()
      };

      if (editPassword.trim()) {
        payload.password_hash = bcrypt.hashSync(editPassword.trim(), 10);
      }

      const { error } = await supabase
        .from('app_logins')
        .update(payload)
        .eq('id', editingLogin.id);

      if (error) throw error;

      let details = `Changed email for role ${editingLogin.display_name}`;
      if (editPassword.trim()) {
        details += ` and updated password`;
      }
      await writeAuditLog({
        action_type: 'login_credentials_changed',
        performed_by: user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        target_description: editingLogin.display_name,
        notes: details
      });

      showToast(`Login updated for ${editingLogin.display_name} ✓`);
      setShowEditLoginModal(false);
      loadCredentials();
    } catch (err: any) {
      console.error(err);
      alert('Failed to update login: ' + err.message);
    } finally {
      setSavingLogin(false);
    }
  };

  const handleAddCredential = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCredEmail || !newCredName || !newCredPassword) {
      alert("Please fill all required fields.");
      return;
    }
    const emailKey = newCredEmail.toLowerCase().trim();
    try {
      const customUsersJson = localStorage.getItem('nearbi_custom_users');
      const customUsers = customUsersJson ? JSON.parse(customUsersJson) : {};
      
      customUsers[emailKey] = {
        email: emailKey,
        name: newCredName,
        password: newCredPassword,
        role: newCredRole,
        branch: newCredBranch === 'all' ? null : newCredBranch
      };

      localStorage.setItem('nearbi_custom_users', JSON.stringify(customUsers));
      showToast('User credential saved ✓');
      setShowAddCredModal(false);
      
      // Clear fields
      setNewCredEmail('');
      setNewCredName('');
      setNewCredPassword('');
      setNewCredRole('staff_executive');
      setNewCredBranch('all');

      loadCredentials();
    } catch (err) {
      console.error(err);
      alert("Failed to save credential.");
    }
  };

  const handleDeleteCredential = (email: string) => {
    if (!confirm(`Are you sure you want to delete credentials for ${email}?`)) return;
    try {
      const customUsersJson = localStorage.getItem('nearbi_custom_users');
      const customUsers = customUsersJson ? JSON.parse(customUsersJson) : {};
      
      delete customUsers[email.toLowerCase().trim()];

      localStorage.setItem('nearbi_custom_users', JSON.stringify(customUsers));
      showToast('Credential deleted ✓');
      loadCredentials();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBlockUser = async (email: string, role: string) => {
    const targetEmail = email.toLowerCase().trim();
    if (targetEmail === 'adminnearbi@gmail.com' || role === 'admin') {
      alert("Cannot block the primary owner or admin account.");
      return;
    }
    if (user?.email?.toLowerCase().trim() === targetEmail) {
      alert("Cannot self-block your own logged in session.");
      return;
    }
    try {
      const isCurrentlyBlocked = blockedUsers.includes(targetEmail);
      
      const payload = {
        user_email: targetEmail,
        role: role,
        is_blocked: !isCurrentlyBlocked,
        blocked_by: !isCurrentlyBlocked ? (user?.email || 'admin') : null,
        blocked_at: !isCurrentlyBlocked ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('user_permissions')
        .upsert(payload, { onConflict: 'user_email' });

      if (error) throw error;

      await writeAuditLog({
        action_type: 'permission_changed',
        performed_by: user?.email || 'admin',
        performed_by_role: user?.role || 'admin',
        target_description: `Toggle login access for ${targetEmail} (${role})`,
        old_value: isCurrentlyBlocked ? 'off' : 'on',
        new_value: !isCurrentlyBlocked ? 'off' : 'on',
        notes: `${isCurrentlyBlocked ? 'Unblocked' : 'Blocked'} user login access`
      });

      // Update local storage backup
      const blockedJson = localStorage.getItem('nearbi_blocked_users');
      let blocked: string[] = blockedJson ? JSON.parse(blockedJson) : [];
      if (!isCurrentlyBlocked) {
        if (!blocked.includes(targetEmail)) blocked.push(targetEmail);
        setBlockedUsers(prev => [...prev, targetEmail]);
        showToast('User blocked ✓');
      } else {
        blocked = blocked.filter(e => e !== targetEmail);
        setBlockedUsers(prev => prev.filter(e => e !== targetEmail));
        showToast('User unblocked ✓');
      }
      localStorage.setItem('nearbi_blocked_users', JSON.stringify(blocked));
    } catch (err: any) {
      console.error(err);
      alert('Failed to save block status: ' + err.message);
    }
  };

  useEffect(() => {
    if (isLoading || !canSeeSalaryBreakdown) return;
    setLoading(true);
    fetchData();
  }, [isLoading, canSeeSalaryBreakdown]);

  useEffect(() => {
    if (isLoading || !canSeeSalaryBreakdown) return;
    const loadScopedBreaks = async () => {
      try {
        const queryBranch = selectedBreakBranch === 'all' ? 'daily' : selectedBreakBranch;
        const { data: breakData, error: breakE } = await supabase
          .from('break_settings')
          .select('*')
          .eq('branch_id', queryBranch)
          .maybeSingle();

        if (breakE) throw breakE;

        if (!breakData) {
          setBreakSettings({
            branch_id: selectedBreakBranch,
            morning_tea_duration: 10,
            morning_tea_start: '09:30',
            morning_tea_end: '11:30',
            morning_tea_enabled: true,
            food_break_duration: 25,
            food_break_start: '12:00',
            food_break_end: '15:00',
            food_break_enabled: true,
            evening_tea_duration: 10,
            evening_tea_start: '16:00',
            evening_tea_end: '18:30',
            evening_tea_enabled: true,
          });
        } else {
          setBreakSettings(breakData);
        }
      } catch (err) {
        console.error('Error fetching scoped breaks:', err);
      }
    };
    loadScopedBreaks();
  }, [selectedBreakBranch, isLoading, canSeeSalaryBreakdown]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      if (settings?.id && settings.id !== 'default') {
        const { error } = await supabase
          .from('fine_settings')
          .update({
            yellow_fine: Number(settings.yellow_fine),
            orange_fine: Number(settings.orange_fine),
            red_fine: Number(settings.red_fine),
            yellow_free_passes: Number(settings.yellow_free_passes),
            updated_by: user?.email || 'admin',
            updated_at: new Date().toISOString()
          })
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('fine_settings')
          .insert({
            yellow_fine: Number(settings.yellow_fine),
            orange_fine: Number(settings.orange_fine),
            red_fine: Number(settings.red_fine),
            yellow_free_passes: Number(settings.yellow_free_passes),
            updated_by: user?.email || 'admin'
          });
        if (error) throw error;
      }

      showToast('Settings saved ✓');
      fetchData();
    } catch (err: any) {
      console.error('Save settings error:', err);
      showToast('Error saving settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleExemption = async (staffId: string) => {
    const existing = exemptions.find((ex) => ex.staff_id === staffId);
    try {
      if (existing) {
        const { error } = await supabase
          .from('staff_fine_exemptions')
          .delete()
          .eq('staff_id', staffId);

        if (error) throw error;
        showToast('Exemption removed ✓');
      } else {
        const { error } = await supabase
          .from('staff_fine_exemptions')
          .insert({
            staff_id: staffId,
            exempted_by: user?.email || 'admin'
          });

        if (error) throw error;
        showToast('Exemption added ✓');
      }
      fetchData();
    } catch (err: any) {
      console.error('Toggle exemption error:', err);
      showToast('Error toggling exemption.');
    }
  };

  const generateMonthsList = () => {
    const list = [];
    const d = new Date();
    for (let i = 0; i < 24; i++) {
      const year = d.getFullYear();
      const month = d.getMonth() - i;
      const date = new Date(year, month, 1);
      const mStr = String(date.getMonth() + 1).padStart(2, '0');
      const value = `${date.getFullYear()}-${mStr}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      list.push({ value, label });
    }
    return list;
  };

  const handleDataCleanup = async () => {
    if (cleanupConfirmText !== 'DELETE') {
      alert("Please type DELETE to confirm.");
      return;
    }
    setIsCleaningUp(true);
    setCleanupResult(null);
    try {
      const [yearStr, monthStr] = cleanupMonth.split('-');
      const year = parseInt(yearStr);
      const monthNum = parseInt(monthStr);
      const firstDay = `${cleanupMonth}-01`;
      const lastDayNum = new Date(year, monthNum, 0).getDate();
      const lastDay = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

      // Get staff for selected branch
      let staffQuery = supabase.from('staff').select('id');
      if (cleanupBranch !== 'all') {
        staffQuery = staffQuery.eq('branch_id', cleanupBranch);
      }
      const { data: staffData } = await staffQuery;
      const staffIds = staffData?.map(s => s.id) || [];

      if (staffIds.length === 0 && cleanupBranch !== 'all') {
        alert("No staff found for the selected branch.");
        setIsCleaningUp(false);
        return;
      }

      // Filter out staff who have locked confirmations for this month
      const { data: lockedSalaries } = await supabase
        .from('salary_confirmations')
        .select('staff_id')
        .eq('month', cleanupMonth)
        .eq('is_locked', true);
      
      const lockedStaffIds = new Set(lockedSalaries?.map(s => s.staff_id) || []);
      const allowedStaffIds = staffIds.filter(id => !lockedStaffIds.has(id));
      const skippedLockedCount = staffIds.length - allowedStaffIds.length;

      let summaryParts = [];
      if (skippedLockedCount > 0) {
        summaryParts.push(`${skippedLockedCount} staff skipped (salary locked)`);
      }

      // 1. Attendance
      if (cleanupItems.attendance && allowedStaffIds.length > 0) {
        const { data, error } = await supabase.from('attendance')
          .delete()
          .gte('date', firstDay)
          .lte('date', lastDay)
          .in('staff_id', allowedStaffIds)
          .select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} attendance records`);
      }

      // 2. Fines (Late & Special Fines)
      if (cleanupItems.fines && allowedStaffIds.length > 0) {
        const { data: lfData, error: lfError } = await supabase.from('late_fines')
          .delete()
          .eq('month', cleanupMonth)
          .in('staff_id', allowedStaffIds)
          .select();
        if (lfError) throw lfError;

        const { data: sfData, error: sfError } = await supabase.from('special_fines')
          .delete()
          .eq('month', cleanupMonth)
          .in('staff_id', allowedStaffIds)
          .select();
        if (sfError) throw sfError;

        summaryParts.push(`${(lfData?.length || 0) + (sfData?.length || 0)} late & special fines`);
      }

      // 3. Break Logs
      if (cleanupItems.breaks && allowedStaffIds.length > 0) {
        const { data, error } = await supabase.from('break_logs')
          .delete()
          .gte('date', firstDay)
          .lte('date', lastDay)
          .in('staff_id', allowedStaffIds)
          .select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} break logs`);
      }

      // 4. Wall Events
      if (cleanupItems.wall && allowedStaffIds.length > 0) {
        const { data, error } = await supabase.from('wall_events')
          .delete()
          .gte('created_at', `${firstDay}T00:00:00Z`)
          .lte('created_at', `${lastDay}T23:59:59Z`)
          .in('staff_id', allowedStaffIds)
          .select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} wall events`);
      }

      // 5. Notifications
      if (cleanupItems.notifications && allowedStaffIds.length > 0) {
        const { data, error } = await supabase.from('notifications')
          .delete()
          .gte('created_at', `${firstDay}T00:00:00Z`)
          .lte('created_at', `${lastDay}T23:59:59Z`)
          .in('staff_id', allowedStaffIds)
          .select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} notifications`);
      }

      // 6. Leave Requests
      if (cleanupItems.leaves && allowedStaffIds.length > 0) {
        const { data, error } = await supabase.from('leave_requests')
          .delete()
          .gte('date', firstDay)
          .lte('date', lastDay)
          .in('staff_id', allowedStaffIds)
          .select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} leave requests`);
      }

      // 7. Salary Confirmations
      if (cleanupItems.salaries && allowedStaffIds.length > 0) {
        const { data, error } = await supabase.from('salary_confirmations')
          .delete()
          .eq('month', cleanupMonth)
          .in('staff_id', allowedStaffIds)
          .select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} salary confirmations`);
      }

      setCleanupResult(`Deleted:\n` + summaryParts.map(s => `• ${s}`).join('\n'));
      setCleanupConfirmText('');
      showToast("Selected data deleted successfully ✓");
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("Failed to delete selected data: " + err.message);
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleExecuteDangerAction = async () => {
    if (confirmText !== 'DELETE' || !dangerAction) return;
    setExecutingDanger(true);
    try {
      if (dangerAction === 'CLEAR_ATTENDANCE') {
        const tables = [
          'attendance',
          'late_fines',
          'break_logs',
          'wall_events',
          'notifications'
        ];

        for (const table of tables) {
          try {
            let query = supabase.from(table).delete();
            if (table === 'late_fines') {
              query = query.eq('confirmed', false);
            } else {
              query = query.neq('id', '00000000-0000-0000-0000-000000000000');
            }
            const { error: delErr } = await query;
            if (delErr) {
              console.error(`Error clearing ${table}:`, delErr);
              const errMsg = String(delErr.message || '').toLowerCase();
              if (!errMsg.includes('does not exist') && !errMsg.includes('not find')) {
                throw delErr;
              }
            }
          } catch (err: any) {
            console.error(`Exception clearing ${table}:`, err);
          }
        }
        showToast('All attendance and activity data cleared!');

      } else if (dangerAction === 'DELETE_INACTIVE') {
        // Fetch inactive staff
        const { data: inactiveStaff, error: fetchErr } = await supabase
          .from('staff')
          .select('id')
          .eq('active', false);

        if (fetchErr) throw fetchErr;

        let inactiveIds = inactiveStaff?.map(s => s.id) || [];

        if (inactiveIds.length > 0) {
          // Find staff with confirmed late fines
          const { data: confLate } = await supabase
            .from('late_fines')
            .select('staff_id')
            .in('staff_id', inactiveIds)
            .eq('confirmed', true);
          
          // Find staff with confirmed special fines
          const { data: confSpec } = await supabase
            .from('special_fines')
            .select('staff_id')
            .in('staff_id', inactiveIds)
            .eq('confirmed', true);

          // Find staff with locked salary confirmations
          const { data: lockedSal } = await supabase
            .from('salary_confirmations')
            .select('staff_id')
            .in('staff_id', inactiveIds)
            .eq('is_locked', true);

          const skipIds = new Set([
            ...(confLate?.map(x => x.staff_id) || []),
            ...(confSpec?.map(x => x.staff_id) || []),
            ...(lockedSal?.map(x => x.staff_id) || [])
          ]);

          inactiveIds = inactiveIds.filter(id => !skipIds.has(id));

          if (inactiveIds.length > 0) {
            const tables = [
              'attendance',
              'late_fines',
              'break_logs',
              'wall_events',
              'notifications',
              'leave_requests',
              'salary_confirmations',
              'salary_payments',
              'performance_scores',
              'staff_fine_exemptions',
              'attendance_adjustments',
              'special_fines'
            ];

            for (const table of tables) {
              try {
                const { error: delErr } = await supabase
                  .from(table)
                  .delete()
                  .in('staff_id', inactiveIds);
                if (delErr) {
                  console.error(`Error deleting from ${table} for inactive staff:`, delErr);
                  const errMsg = String(delErr.message || '').toLowerCase();
                  if (!errMsg.includes('does not exist') && !errMsg.includes('not find')) {
                    throw delErr;
                  }
                }
              } catch (err: any) {
                console.error(`Exception deleting from ${table}:`, err);
              }
            }

            // Finally delete the staff records
            const { error: staffDelErr } = await supabase
              .from('staff')
              .delete()
              .in('id', inactiveIds);

            if (staffDelErr) throw staffDelErr;
            showToast(`Deleted ${inactiveIds.length} inactive staff profiles.`);
          } else {
            showToast('All inactive staff profiles have confirmed fines or locked salary history and were skipped.');
          }
        } else {
          showToast('No inactive staff profiles found.');
        }
      }

      setDangerAction(null);
      setConfirmText('');
      
      // Redirect to dashboard
      router.push('/dashboard');

    } catch (err: any) {
      console.error('Danger zone action execution error:', err);
      showToast('Action failed — see console.');
    } finally {
      setExecutingDanger(false);
    }
  };

  const handleSaveBreakSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBreakSettings(true);
    try {
      const basePayload = {
        morning_tea_duration: Number(breakSettings.morning_tea_duration),
        morning_tea_start: breakSettings.morning_tea_start,
        morning_tea_end: breakSettings.morning_tea_end,
        morning_tea_enabled: breakSettings.morning_tea_enabled !== false,
        food_break_duration: Number(breakSettings.food_break_duration),
        food_break_start: breakSettings.food_break_start,
        food_break_end: breakSettings.food_break_end,
        food_break_enabled: breakSettings.food_break_enabled !== false,
        evening_tea_duration: Number(breakSettings.evening_tea_duration),
        evening_tea_start: breakSettings.evening_tea_start,
        evening_tea_end: breakSettings.evening_tea_end,
        evening_tea_enabled: breakSettings.evening_tea_enabled !== false,
        updated_by: user?.email || 'Admin',
        updated_at: new Date().toISOString(),
      };

      if (selectedBreakBranch === 'all') {
        // Upsert for daily
        const { data: dailyExist } = await supabase
          .from('break_settings')
          .select('id')
          .eq('branch_id', 'daily')
          .maybeSingle();

        const dailyPayload = {
          ...basePayload,
          branch_id: 'daily',
          id: dailyExist?.id || undefined
        };

        const { error: errDaily } = await supabase
          .from('break_settings')
          .upsert(dailyPayload);
        if (errDaily) throw errDaily;

        // Upsert for hypermarket
        const { data: hyperExist } = await supabase
          .from('break_settings')
          .select('id')
          .eq('branch_id', 'hypermarket')
          .maybeSingle();

        const hyperPayload = {
          ...basePayload,
          branch_id: 'hypermarket',
          id: hyperExist?.id || undefined
        };

        const { error: errHyper } = await supabase
          .from('break_settings')
          .upsert(hyperPayload);
        if (errHyper) throw errHyper;
      } else {
        const payload: any = {
          ...basePayload,
          branch_id: selectedBreakBranch,
        };
        if (breakSettings.id) {
          payload.id = breakSettings.id;
        }

        const { error } = await supabase
          .from('break_settings')
          .upsert(payload);

        if (error) throw error;
      }

      showToast('Break settings saved successfully!');
    } catch (err: any) {
      console.error('Save break settings error:', err);
      showToast('Error saving break settings.');
    } finally {
      setSavingBreakSettings(false);
    }
  };

  const handleRecalculateFines = async () => {
    setRecalcConfirmOpen(false);
    setRecalculating(true);
    setRecalcResult(null);

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const firstDay = `${monthStr}-01`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const lastDay = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

      // Fetch all attendance records for this month with check_in
      const { data: attRecords, error: attErr } = await supabase
        .from('attendance')
        .select('id, staff_id, date, check_in_time, minutes_late, color_code, status')
        .not('check_in_time', 'is', null)
        .gte('date', firstDay)
        .lte('date', lastDay);

      if (attErr) throw attErr;
      if (!attRecords || attRecords.length === 0) {
        setRecalculating(false);
        setRecalcResult({ total: 0, corrected: 0, deleted: 0, skipped: 0 });
        return;
      }

      // Sort attRecords by date chronologically
      attRecords.sort((a, b) => a.date.localeCompare(b.date));

      // Fetch all staff with shifts
      const staffIds = [...new Set(attRecords.map(a => a.staff_id))];
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, shift_id, shift:shifts(start_time)')
        .in('id', staffIds);

      const staffShiftMap = new Map<string, string>();
      staffData?.forEach((s: any) => {
        const shift = Array.isArray(s.shift) ? s.shift[0] : s.shift;
        staffShiftMap.set(s.id, shift?.start_time || '09:00');
      });

      // Fetch fine settings
      const { data: fSettings } = await supabase.from('fine_settings').select('*').limit(1).maybeSingle();
      const fs = fSettings || { yellow_fine: 50, orange_fine: 100, red_fine: 200, yellow_free_passes: 4 };

      // Fetch exemptions
      const { data: exemptions } = await supabase.from('staff_fine_exemptions').select('staff_id');
      const exemptSet = new Set(exemptions?.map(e => e.staff_id) || []);

      // Fetch existing fines for the month
      const { data: existingFines } = await supabase
        .from('late_fines')
        .select('id, staff_id, date, confirmed')
        .gte('date', firstDay)
        .lte('date', lastDay);

      const fineMap = new Map<string, { id: string; confirmed: boolean }>();
      existingFines?.forEach(f => {
        fineMap.set(`${f.staff_id}_${f.date}`, { id: f.id, confirmed: f.confirmed });
      });

      let total = 0;
      let corrected = 0;
      let deleted = 0;
      let skipped = 0;

      const parseMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      const yellowCountMap = new Map<string, number>();

      for (let i = 0; i < attRecords.length; i++) {
        const rec = attRecords[i];
        total++;
        setRecalcProgress(`Processing ${i + 1} / ${attRecords.length}...`);

        const shiftStart = staffShiftMap.get(rec.staff_id) || '09:00';
        const correctMinutesLate = calculateLateMinutes(rec.check_in_time, shiftStart);
        let correctColorCode = 'green';
        let correctStatus: string = 'present';

        if (correctMinutesLate > 0) {
          correctStatus = 'late';
          if (correctMinutesLate <= 15) correctColorCode = 'yellow';
          else if (correctMinutesLate <= 30) correctColorCode = 'orange';
          else correctColorCode = 'red';
        }

        // Update attendance if different
        if (rec.minutes_late !== correctMinutesLate || rec.color_code !== correctColorCode || rec.status !== correctStatus) {
          await supabase
            .from('attendance')
            .update({
              minutes_late: correctMinutesLate,
              color_code: correctColorCode,
              status: correctStatus === 'late' ? 'late' : (rec.check_in_time ? 'present' : rec.status),
            })
            .eq('id', rec.id);
        }

        const fineKey = `${rec.staff_id}_${rec.date}`;
        const existingFine = fineMap.get(fineKey);

        if (correctMinutesLate === 0) {
          // Staff was not late — delete unconfirmed fine
          if (existingFine) {
            if (existingFine.confirmed) {
              skipped++;
            } else {
              await supabase.from('late_fines').delete().eq('id', existingFine.id);
              deleted++;
            }
          }
        } else if (!exemptSet.has(rec.staff_id)) {
          // Staff was late — upsert fine
          let fineAmount = 0;
          if (correctColorCode === 'yellow') {
            const currentYellows = yellowCountMap.get(rec.staff_id) || 0;
            yellowCountMap.set(rec.staff_id, currentYellows + 1);
            if (currentYellows >= Number(fs.yellow_free_passes || 0)) {
              fineAmount = Number(fs.yellow_fine);
            }
          } else if (correctColorCode === 'orange') {
            fineAmount = Number(fs.orange_fine);
          } else if (correctColorCode === 'red') {
            fineAmount = Number(fs.red_fine);
          }

          if (fineAmount > 0) {
            if (existingFine?.confirmed) {
              skipped++;
            } else {
              await supabase.from('late_fines').upsert({
                staff_id: rec.staff_id,
                date: rec.date,
                late_minutes: correctMinutesLate,
                color_code: correctColorCode,
                fine_amount: fineAmount,
                waived: false,
                month: monthStr,
              }, { onConflict: 'staff_id,date' });
              corrected++;
            }
          } else {
            // Delete fine if it became 0 due to pass
            if (existingFine) {
              if (existingFine.confirmed) {
                skipped++;
              } else {
                await supabase.from('late_fines').delete().eq('id', existingFine.id);
                deleted++;
              }
            }
          }
        } else {
          // Staff was exempt — delete unconfirmed fine if exists
          if (existingFine) {
            if (existingFine.confirmed) {
              skipped++;
            } else {
              await supabase.from('late_fines').delete().eq('id', existingFine.id);
              deleted++;
            }
          }
        }
      }

      setRecalcResult({ total, corrected, deleted, skipped });
      showToast('Recalculation complete!');
    } catch (err: any) {
      console.error('Recalculate fines error:', err);
      showToast('Failed to recalculate fines — see console.');
    } finally {
      setRecalculating(false);
      setRecalcProgress(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-[200px] w-full" />
      </div>
    );
  }

  // Security gate
  if (!canSeeSalaryBreakdown) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="bg-white border border-[var(--border)] rounded-[14px] p-8 max-w-sm w-full flex flex-col items-center shadow-sm">
          <Lock size={48} strokeWidth={1.5} className="mb-4 text-[var(--text-muted)]" />
          <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">Access Restricted</h2>
          <p className="text-[var(--text-muted)] text-xs font-semibold leading-relaxed mb-6">
            Only the Owner and Operations Manager can modify system configurations.
          </p>
          <div className="font-[900] text-lg tracking-tight flex items-center leading-none opacity-40">
            <span className="text-[#1A1A1A]">near</span>
            <span className="text-[#FBBF24]">bi</span>
          </div>
        </div>
      </div>
    );
  }

  const getBranchName = (id: string) => {
    return id === 'daily' ? 'Daily' : 'Hypermarket';
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div>
        <h1 className="text-[#1A1A1A] text-2xl font-bold">Settings</h1>
        <p className="text-[var(--text-muted)] text-xs font-semibold">
          System rules configuration
        </p>
      </div>

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[10px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchData} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="skeleton h-[180px] w-full" />
          <div className="skeleton h-[150px] w-full" />
        </div>
      ) : (
        <>
          {/* Late Fine Settings Card */}
          <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm">
            <h2 className="text-[#1A1A1A] font-bold text-sm mb-4">
              1. Late Fine Settings
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Yellow Late Fine (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.yellow_fine}
                    onChange={(e) => setSettings({ ...settings, yellow_fine: Number(e.target.value) })}
                    className="w-full text-[#1A1A1A] font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Yellow Free Passes
                  </label>
                  <input
                    type="number"
                    value={settings.yellow_free_passes}
                    onChange={(e) => setSettings({ ...settings, yellow_free_passes: Number(e.target.value) })}
                    className="w-full text-[#1A1A1A] font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Orange Late Fine (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.orange_fine}
                    onChange={(e) => setSettings({ ...settings, orange_fine: Number(e.target.value) })}
                    className="w-full text-[#1A1A1A] font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    Red Late Fine (₹)
                  </label>
                  <input
                    type="number"
                    value={settings.red_fine}
                    onChange={(e) => setSettings({ ...settings, red_fine: Number(e.target.value) })}
                    className="w-full text-[#1A1A1A] font-bold"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="w-full min-h-[44px] bg-[#1A1A1A] text-white font-bold text-xs rounded-xl hover:bg-[#333333] active:scale-95 transition-all shadow-sm mt-2"
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>

          {/* Fine Exemptions Card */}
          <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-[#1A1A1A] font-bold text-sm">
                2. Fine Exemptions
              </h2>
              <span className="bg-[#E8F5E9] text-[#2E7D32] text-[10px] font-bold px-2 py-0.5 rounded-full">
                {exemptions.length} staff exempted
              </span>
            </div>

            {/* Search bar */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                <Search size={14} />
              </span>
              <input
                type="text"
                value={exemptionSearch}
                onChange={(e) => setExemptionSearch(e.target.value)}
                placeholder="Search staff by name..."
                className="pl-9 w-full min-h-[40px] text-xs rounded-xl border border-[var(--border)] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] text-[#1A1A1A] font-medium"
              />
            </div>

            {/* Scrollable list of staff with checkboxes */}
            <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
              {staffList.filter((st) => st.name.toLowerCase().includes(exemptionSearch.toLowerCase())).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] font-semibold italic text-center py-4">
                  No staff members found.
                </p>
              ) : (
                staffList
                  .filter((st) => st.name.toLowerCase().includes(exemptionSearch.toLowerCase()))
                  .map((st) => {
                    const isExempted = exemptions.some((ex) => ex.staff_id === st.id);
                    return (
                      <div
                        key={st.id}
                        onClick={() => handleToggleExemption(st.id)}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-[#F0F0F0] hover:bg-[#F9F9F9] cursor-pointer active:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5">
                          <span className="flex-shrink-0">
                            {isExempted ? (
                              <CheckCircle2 size={18} className="text-[#2E7D32]" fill="#E8F5E9" />
                            ) : (
                              <Circle size={18} className="text-[#CCCCCC]" />
                            )}
                          </span>
                          <div>
                            <div className="font-bold text-xs text-[#1A1A1A]">
                              {st.name}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] font-semibold">
                              {st.department} • {getBranchName(st.branch_id)}
                            </div>
                          </div>
                        </div>
                        
                        {isExempted && (
                          <span className="text-[10px] text-[#2E7D32] font-bold bg-[#E8F5E9] px-2 py-0.5 rounded">
                            Exempted
                          </span>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Break Settings Card */}
          <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-[#1A1A1A] font-bold text-sm">
                3. Break Schedule Settings
              </h2>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Branch:</span>
                <select
                  value={selectedBreakBranch}
                  onChange={(e) => setSelectedBreakBranch(e.target.value as any)}
                  className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-lg px-2 py-1 text-xs font-bold text-[#1A1A1A] focus:outline-none"
                >
                  <option value="all">All Branches</option>
                  <option value="daily">Nearbi Daily</option>
                  <option value="hypermarket">Nearbi Hypermarket</option>
                </select>
              </div>
            </div>

            <form onSubmit={handleSaveBreakSettings} className="space-y-4">
              {/* Morning Tea */}
              <div className="space-y-2 border-b border-[var(--border)] pb-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Morning Tea</h3>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={breakSettings.morning_tea_enabled !== false}
                      onChange={(e) => setBreakSettings({ ...breakSettings, morning_tea_enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
                    />
                    <span className="text-[10px] font-extrabold text-[#1A1A1A] uppercase">Enabled</span>
                  </label>
                </div>
                {breakSettings.morning_tea_enabled !== false && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Duration (mins)
                      </label>
                      <input
                        type="number"
                        value={breakSettings.morning_tea_duration}
                        onChange={(e) => setBreakSettings({ ...breakSettings, morning_tea_duration: Number(e.target.value) })}
                        className="w-full text-[#1A1A1A] font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Start Time
                      </label>
                      <input
                        type="text"
                        placeholder="09:30"
                        value={breakSettings.morning_tea_start}
                        onChange={(e) => setBreakSettings({ ...breakSettings, morning_tea_start: e.target.value })}
                        className="w-full text-[#1A1A1A] font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        End Time
                      </label>
                      <input
                        type="text"
                        placeholder="11:30"
                        value={breakSettings.morning_tea_end}
                        onChange={(e) => setBreakSettings({ ...breakSettings, morning_tea_end: e.target.value })}
                        className="w-full text-[#1A1A1A] font-bold"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Food Break */}
              <div className="space-y-2 border-b border-[var(--border)] pb-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Food Break</h3>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={breakSettings.food_break_enabled !== false}
                      onChange={(e) => setBreakSettings({ ...breakSettings, food_break_enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
                    />
                    <span className="text-[10px] font-extrabold text-[#1A1A1A] uppercase">Enabled</span>
                  </label>
                </div>
                {breakSettings.food_break_enabled !== false && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Duration (mins)
                      </label>
                      <input
                        type="number"
                        value={breakSettings.food_break_duration}
                        onChange={(e) => setBreakSettings({ ...breakSettings, food_break_duration: Number(e.target.value) })}
                        className="w-full text-[#1A1A1A] font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Start Time
                      </label>
                      <input
                        type="text"
                        placeholder="12:00"
                        value={breakSettings.food_break_start}
                        onChange={(e) => setBreakSettings({ ...breakSettings, food_break_start: e.target.value })}
                        className="w-full text-[#1A1A1A] font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        End Time
                      </label>
                      <input
                        type="text"
                        placeholder="15:00"
                        value={breakSettings.food_break_end}
                        onChange={(e) => setBreakSettings({ ...breakSettings, food_break_end: e.target.value })}
                        className="w-full text-[#1A1A1A] font-bold"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Evening Tea */}
              <div className="space-y-2 pb-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Evening Tea</h3>
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={breakSettings.evening_tea_enabled !== false}
                      onChange={(e) => setBreakSettings({ ...breakSettings, evening_tea_enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
                    />
                    <span className="text-[10px] font-extrabold text-[#1A1A1A] uppercase">Enabled</span>
                  </label>
                </div>
                {breakSettings.evening_tea_enabled !== false && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Duration (mins)
                      </label>
                      <input
                        type="number"
                        value={breakSettings.evening_tea_duration}
                        onChange={(e) => setBreakSettings({ ...breakSettings, evening_tea_duration: Number(e.target.value) })}
                        className="w-full text-[#1A1A1A] font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        Start Time
                      </label>
                      <input
                        type="text"
                        placeholder="16:00"
                        value={breakSettings.evening_tea_start}
                        onChange={(e) => setBreakSettings({ ...breakSettings, evening_tea_start: e.target.value })}
                        className="w-full text-[#1A1A1A] font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        End Time
                      </label>
                      <input
                        type="text"
                        placeholder="18:30"
                        value={breakSettings.evening_tea_end}
                        onChange={(e) => setBreakSettings({ ...breakSettings, evening_tea_end: e.target.value })}
                        className="w-full text-[#1A1A1A] font-bold"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={savingBreakSettings}
                className="w-full min-h-[44px] bg-[#1A1A1A] text-white font-bold text-xs rounded-xl hover:bg-[#333333] active:scale-95 transition-all shadow-sm mt-2"
              >
                {savingBreakSettings ? 'Saving...' : 'Save Break Settings'}
              </button>
            </form>
          </div>

          {/* Data Tools Section (Admin Only) */}
          {user?.role === 'admin' && (
            <div className="space-y-4 pt-6">
              <div>
                <h2 className="text-[#1A1A1A] font-extrabold text-sm tracking-wider uppercase">
                  Data Tools
                </h2>
                <div className="text-[#E8E8E8] text-xs font-semibold select-none leading-none my-1">
                  ─────────────────────────────
                </div>
              </div>

              <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
                <h3 className="text-[#1A1A1A] font-bold text-sm">
                  Chronological Late Fines Recalculator
                </h3>
                <p className="text-[10px] text-[var(--text-muted)] font-semibold leading-relaxed">
                  Recalculates all late fines for the current month chronologically, day-by-day, applying yellow free pass limits (first 4 free passes). Wrong unconfirmed fines will be corrected or deleted. Confirmed fines are left unchanged.
                </p>

                {recalcResult && (
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-3 text-xs space-y-1">
                    <div className="font-bold text-[#1A1A1A]">Recalculation Complete</div>
                    <div className="text-[var(--text-secondary)] font-semibold">Processed: {recalcResult.total} records</div>
                    <div className="text-[var(--success)] font-semibold">Corrected: {recalcResult.corrected} fines updated</div>
                    <div className="text-[var(--warning)] font-semibold">Deleted: {recalcResult.deleted} wrong fines removed</div>
                    <div className="text-[var(--text-muted)] font-semibold">Skipped: {recalcResult.skipped} confirmed fines (unchanged)</div>
                  </div>
                )}

                {recalculating && recalcProgress && (
                  <div className="bg-[var(--info-bg)] border border-[var(--info)]/20 rounded-xl p-3 text-xs text-[var(--info)] font-bold text-center">
                    {recalcProgress}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setRecalcConfirmOpen(true)}
                  disabled={recalculating}
                  className="w-full min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl active:scale-95 transition-all shadow-sm disabled:opacity-50"
                >
                  {recalculating ? 'Recalculating...' : 'Recalculate All Fines for Current Month'}
                </button>
              </div>
            </div>
          )}

          {/* Data Management Section (Admin Only) */}
          {user?.role === 'admin' && (
            <div className="space-y-4 pt-6">
              <div>
                <h2 className="text-[#1A1A1A] font-extrabold text-sm tracking-wider">
                  DATA MANAGEMENT
                </h2>
                <div className="text-black/10 text-xs font-semibold select-none leading-none my-1">
                  ─────────────────────────────
                </div>
              </div>

              <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
                <p className="text-[var(--danger)] text-xs font-extrabold flex items-center gap-1">
                  ⚠️ This permanently deletes data. This cannot be undone.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#555555] mb-1">Select Month</label>
                    <select
                      value={cleanupMonth}
                      onChange={(e) => setCleanupMonth(e.target.value)}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                    >
                      {generateMonthsList().map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#555555] mb-1">Select Branch</label>
                    <select
                      value={cleanupBranch}
                      onChange={(e) => setCleanupBranch(e.target.value as any)}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                    >
                      <option value="all">All Branches</option>
                      <option value="daily">Nearbi Daily</option>
                      <option value="hypermarket">Nearbi Hypermarket</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-xs font-bold text-[#555555]">Select what to delete:</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center space-x-2.5 p-2 bg-[#F8F8F8] rounded-lg cursor-pointer hover:bg-[#F0F0F0]">
                      <input
                        type="checkbox"
                        checked={cleanupItems.attendance}
                        onChange={(e) => setCleanupItems(prev => ({ ...prev, attendance: e.target.checked }))}
                        className="rounded text-[#1A1A1A] focus:ring-[#1A1A1A]"
                      />
                      <span className="font-semibold text-[#1A1A1A]">Attendance records</span>
                    </label>

                    <label className="flex items-center space-x-2.5 p-2 bg-[#F8F8F8] rounded-lg cursor-pointer hover:bg-[#F0F0F0]">
                      <input
                        type="checkbox"
                        checked={cleanupItems.fines}
                        onChange={(e) => setCleanupItems(prev => ({ ...prev, fines: e.target.checked }))}
                        className="rounded text-[#1A1A1A] focus:ring-[#1A1A1A]"
                      />
                      <span className="font-semibold text-[#1A1A1A]">Late fines (unconfirmed only)</span>
                    </label>

                    <label className="flex items-center space-x-2.5 p-2 bg-[#F8F8F8] rounded-lg cursor-pointer hover:bg-[#F0F0F0]">
                      <input
                        type="checkbox"
                        checked={cleanupItems.breaks}
                        onChange={(e) => setCleanupItems(prev => ({ ...prev, breaks: e.target.checked }))}
                        className="rounded text-[#1A1A1A] focus:ring-[#1A1A1A]"
                      />
                      <span className="font-semibold text-[#1A1A1A]">Break logs</span>
                    </label>

                    <label className="flex items-center space-x-2.5 p-2 bg-[#F8F8F8] rounded-lg cursor-pointer hover:bg-[#F0F0F0]">
                      <input
                        type="checkbox"
                        checked={cleanupItems.wall}
                        onChange={(e) => setCleanupItems(prev => ({ ...prev, wall: e.target.checked }))}
                        className="rounded text-[#1A1A1A] focus:ring-[#1A1A1A]"
                      />
                      <span className="font-semibold text-[#1A1A1A]">Wall events</span>
                    </label>

                    <label className="flex items-center space-x-2.5 p-2 bg-[#F8F8F8] rounded-lg cursor-pointer hover:bg-[#F0F0F0]">
                      <input
                        type="checkbox"
                        checked={cleanupItems.notifications}
                        onChange={(e) => setCleanupItems(prev => ({ ...prev, notifications: e.target.checked }))}
                        className="rounded text-[#1A1A1A] focus:ring-[#1A1A1A]"
                      />
                      <span className="font-semibold text-[#1A1A1A]">Notifications (read only)</span>
                    </label>

                    <label className="flex items-center space-x-2.5 p-2 bg-[#F8F8F8] rounded-lg cursor-pointer hover:bg-[#F0F0F0]">
                      <input
                        type="checkbox"
                        checked={cleanupItems.leaves}
                        onChange={(e) => setCleanupItems(prev => ({ ...prev, leaves: e.target.checked }))}
                        className="rounded text-[#1A1A1A] focus:ring-[#1A1A1A]"
                      />
                      <span className="font-semibold text-[#1A1A1A]">Leave requests</span>
                    </label>

                    <label className="flex items-center space-x-2.5 p-2 bg-[#F8F8F8] rounded-lg cursor-pointer hover:bg-[#F0F0F0]">
                      <input
                        type="checkbox"
                        checked={cleanupItems.salaries}
                        onChange={(e) => setCleanupItems(prev => ({ ...prev, salaries: e.target.checked }))}
                        className="rounded text-[#1A1A1A] focus:ring-[#1A1A1A]"
                      />
                      <span className="font-semibold text-[#1A1A1A]">Salary confirmations (unlocked only)</span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E8E8E8] space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[#555555] mb-1">
                      Type <span className="text-[var(--danger)]">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      placeholder="Type DELETE"
                      value={cleanupConfirmText}
                      onChange={(e) => setCleanupConfirmText(e.target.value)}
                      className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleDataCleanup}
                    disabled={isCleaningUp || cleanupConfirmText !== 'DELETE' || !Object.values(cleanupItems).some(Boolean)}
                    className="w-full min-h-[44px] bg-[var(--danger)] hover:bg-[#A93226] text-white font-bold text-xs rounded-xl active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isCleaningUp ? 'Deleting Selected Data...' : 'Delete Selected Data'}
                  </button>
                </div>

                {cleanupResult && (
                  <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 text-xs font-mono text-[#555555] whitespace-pre-line leading-relaxed">
                    {cleanupResult}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Credentials & Access Manager Section (Admin/Ops Manager) */}
          {(user?.role === 'admin' || user?.role === 'ops_manager') && (
            <div className="space-y-4 pt-6">
              <div>
                <h2 className="text-[#1A1A1A] font-extrabold text-sm tracking-wider uppercase">
                  Credentials & Login Access Manager
                </h2>
                <div className="text-[#E8E8E8] text-xs font-semibold select-none leading-none my-1">
                  ─────────────────────────────
                </div>
              </div>

              <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <p className="text-[var(--text-muted)] text-[10px] font-semibold leading-normal max-w-md">
                    Manage system login user accounts and block/unblock their login access.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddCredModal(true)}
                    className="min-h-[38px] px-4 bg-[#1A1A1A] text-white hover:bg-[#333333] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer flex items-center space-x-1"
                  >
                    <Plus size={14} />
                    <span>Add Login User</span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-[#E8E8E8] rounded-[12px]">
                  <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                    <thead>
                      <tr className="text-[#999999] uppercase font-bold text-[9px] bg-[#F2F2F2] border-b border-[#E8E8E8]">
                        <th className="p-3">Name</th>
                        <th className="p-3">Email / Username</th>
                        <th className="p-3">Password</th>
                        <th className="p-3">Role</th>
                        <th className="p-3">Scope / Branch</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E8E8]">
                      {systemUsers.map((u) => {
                        const isBlocked = blockedUsers.includes(u.email);
                        return (
                          <tr key={u.email} className="hover:bg-[#F8F8F8] transition-colors">
                            <td className="p-3 font-bold text-[#1A1A1A]">{u.name}</td>
                            <td className="p-3 font-mono text-[#555555]">{u.email}</td>
                            <td className="p-3 font-mono text-[#555555]">{u.password}</td>
                            <td className="p-3 capitalize text-[#555555]">{u.role.replace('_', ' ')}</td>
                            <td className="p-3 text-[#555555]">
                              {u.branch ? (u.branch === 'daily' ? 'Nearbi Daily' : 'Hypermarket') : 'All Branches'}
                            </td>
                            <td className="p-3">
                              {u.isCustom ? (
                                <span className="text-[#B8860B] font-bold uppercase text-[9px] bg-[#FDF8E7] border border-[#B8860B]/20 px-2 py-0.5 rounded-[20px]">
                                  Custom
                                </span>
                              ) : (
                                <span className="text-[#555555] font-bold uppercase text-[9px] bg-[#F2F2F2] border border-[#E8E8E8] px-2 py-0.5 rounded-[20px]">
                                  Default
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {isBlocked ? (
                                <span className="text-[#C0392B] font-bold uppercase text-[9px] bg-[#FDECEA] border border-[#C0392B]/20 px-2 py-0.5 rounded-[20px]">
                                  Blocked
                                </span>
                              ) : (
                                <span className="text-[#2D7A3A] font-bold uppercase text-[9px] bg-[#EDF7EF] border border-[#2D7A3A]/20 px-2 py-0.5 rounded-[20px]">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleBlockUser(u.email, u.role)}
                                className={`px-2.5 py-1.5 font-bold text-[10px] rounded-md transition-all active:scale-95 cursor-pointer border ${
                                  isBlocked
                                    ? 'bg-[#EDF7EF] border-[#2D7A3A]/20 text-[#2D7A3A] hover:bg-[#EDF7EF]/80'
                                    : 'bg-[var(--danger-bg)] border-[var(--danger)]/20 text-[var(--danger)] hover:bg-[var(--danger-bg)]/80'
                                }`}
                              >
                                {isBlocked ? 'Unblock' : 'Block'}
                              </button>
                              {u.isCustom && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCredential(u.email)}
                                  className="p-1.5 text-[var(--danger)] hover:bg-[var(--danger-bg)] rounded transition-colors active:scale-95 cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Login Credentials Section (Admin Only) */}
          {user?.role === 'admin' && (
            <div className="space-y-4 pt-6">
              <div>
                <h2 className="text-[#1A1A1A] font-extrabold text-sm tracking-wider uppercase">
                  Login Credentials
                </h2>
                <div className="text-[#E8E8E8] text-xs font-semibold select-none leading-none my-1">
                  ─────────────────────────────
                </div>
              </div>

              <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-5 shadow-sm space-y-4">
                <p className="text-[var(--text-muted)] text-[10px] font-semibold leading-normal">
                  Manage the login emails and passwords for the standard roles in the system.
                </p>

                <div className="overflow-x-auto border border-[#E8E8E8] rounded-[12px]">
                  <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                    <thead>
                      <tr className="text-[#999999] uppercase font-bold text-[9px] bg-[#F2F2F2] border-b border-[#E8E8E8]">
                        <th className="p-3">Display Name</th>
                        <th className="p-3">Email / Username</th>
                        <th className="p-3">Password</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E8E8]">
                      {appLogins.map((login) => {
                        const showPass = showPasswordMap[login.id] || false;
                        return (
                          <tr key={login.id} className="hover:bg-[#F8F8F8] transition-colors">
                            <td className="p-3 font-bold text-[#1A1A1A]">{login.display_name}</td>
                            <td className="p-3 font-mono text-[#555555]">{login.email}</td>
                            <td className="p-3 font-mono text-[#555555]">
                              <div className="flex items-center space-x-2">
                                <span className="max-w-[200px] truncate block">
                                  {showPass ? login.password_hash : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowPasswordMap(prev => ({ ...prev, [login.id]: !showPass }))}
                                  className="text-[#1A1A1A] hover:underline text-[10px] font-bold cursor-pointer"
                                >
                                  {showPass ? 'Hide' : 'Show'}
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-right flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleOpenEditLogin(login)}
                                className="px-3 py-1.5 font-bold text-[10px] bg-white border border-[#E8E8E8] rounded-md text-[#1A1A1A] hover:bg-[#F8F8F8] active:scale-95 transition-all cursor-pointer"
                              >
                                Edit Credentials
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Danger Zone Section (Admin Only) */}
          {user?.role === 'admin' && (
            <div className="space-y-4 pt-6">
              <div>
                <h2 className="text-[var(--danger)] font-extrabold text-sm tracking-wider">
                  DANGER ZONE
                </h2>
                <div className="text-[var(--danger)]/20 text-xs font-semibold select-none leading-none my-1">
                  ─────────────────────────────
                </div>
              </div>

              {/* Red bordered card */}
              <div className="bg-white border border-[var(--danger)] rounded-[14px] p-5 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[#1A1A1A] text-xs font-bold">Clear all attendance data</p>
                    <p className="text-[var(--text-muted)] text-[10px] font-semibold leading-normal max-w-md">
                      Deletes all records from attendance, late_fines, break_logs, wall_events, notifications tables. Staff profiles are kept. Only activity data removed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDangerAction('CLEAR_ATTENDANCE');
                      setConfirmText('');
                    }}
                    className="min-h-[38px] px-4 bg-transparent border border-[var(--danger)] text-[var(--danger)] hover:text-white hover:bg-[var(--danger)] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  >
                    Clear Attendance Data
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[var(--border)]">
                  <div className="space-y-1">
                    <p className="text-[#1A1A1A] text-xs font-bold">Delete inactive staff</p>
                    <p className="text-[var(--text-muted)] text-[10px] font-semibold leading-normal max-w-md">
                      Deletes staff where active = false along with all their related records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDangerAction('DELETE_INACTIVE');
                      setConfirmText('');
                    }}
                    className="min-h-[38px] px-4 bg-transparent border border-[var(--danger)] text-[var(--danger)] hover:text-white hover:bg-[var(--danger)] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  >
                    Delete Inactive Staff
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {recalcConfirmOpen && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl text-center">
            <div className="flex flex-col items-center">
              <span className="text-amber-500 mb-2 text-3xl">⚙️</span>
              <h3 className="text-[#1A1A1A] text-base font-bold">Recalculate Fines</h3>
              <p className="text-[#555555] text-xs font-semibold mt-2 leading-relaxed">
                This will recalculate all late fines for the current month based on each staff member's actual shift start time. Wrong fines will be corrected. Confirmed fines will not be changed.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRecalcConfirmOpen(false)}
                className="flex-1 min-h-[40px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecalculateFines}
                className="flex-1 min-h-[40px] bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Recalculate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Confirmation Modal */}
      {dangerAction && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white rounded-[20px] max-w-sm w-full border border-[var(--danger)] p-6 flex flex-col space-y-4 shadow-2xl">
            <div>
              <h3 className="text-[var(--danger)] text-base font-black uppercase tracking-wider">Danger Zone</h3>
              <p className="text-[#1A1A1A] text-sm font-bold mt-2">
                {dangerAction === 'CLEAR_ATTENDANCE' 
                  ? 'Clear All Attendance Data' 
                  : 'Delete Inactive Staff'}
              </p>
              <p className="text-[var(--text-muted)] text-xs font-semibold mt-1 leading-normal">
                {dangerAction === 'CLEAR_ATTENDANCE'
                  ? 'This will permanently delete all records from attendance, late_fines, break_logs, wall_events, and notifications. Active staff profiles are kept.'
                  : 'This will permanently delete all staff members marked as inactive (active = false) along with all their related attendance, late fine, and break records.'}
              </p>
            </div>

            <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/20 rounded-lg p-3 text-[10px] text-[var(--danger)] font-bold">
              WARNING: This action is permanent and cannot be undone.
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Type "DELETE" to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full text-[#1A1A1A] font-bold"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDangerAction(null);
                  setConfirmText('');
                }}
                disabled={executingDanger}
                className="flex-1 min-h-[40px] bg-transparent border border-[var(--border-strong)] text-[var(--text-secondary)] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDangerAction}
                disabled={confirmText !== 'DELETE' || executingDanger}
                className="flex-1 min-h-[40px] bg-[var(--danger)] hover:bg-[#A93226] disabled:opacity-30 disabled:pointer-events-none text-white font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              >
                {executingDanger ? 'Deleting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Credential Modal */}
      {showAddCredModal && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-[#1A1A1A] text-base font-bold">Add Login User</h3>
              <button
                type="button"
                onClick={() => setShowAddCredModal(false)}
                className="text-[#999999] hover:text-[#1A1A1A] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddCredential} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={newCredName}
                  onChange={(e) => setNewCredName(e.target.value)}
                  placeholder="e.g. Finance Head"
                  className="w-full text-[#1A1A1A] font-bold bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                  Email / Username
                </label>
                <input
                  type="email"
                  required
                  value={newCredEmail}
                  onChange={(e) => setNewCredEmail(e.target.value)}
                  placeholder="e.g. finance@nearbi.com"
                  className="w-full text-[#1A1A1A] font-bold bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                  Password
                </label>
                <input
                  type="text"
                  required
                  value={newCredPassword}
                  onChange={(e) => setNewCredPassword(e.target.value)}
                  placeholder="e.g. securePass123"
                  className="w-full text-[#1A1A1A] font-bold bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                    Role
                  </label>
                  <select
                    value={newCredRole}
                    onChange={(e) => setNewCredRole(e.target.value as any)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                  >
                    <option value="staff_executive">HR Executive</option>
                    <option value="ops_manager">Operations Manager</option>
                    <option value="kiosk">Kiosk</option>
                    <option value="admin">Admin / Owner</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                    Scope / Branch
                  </label>
                  <select
                    value={newCredBranch}
                    onChange={(e) => setNewCredBranch(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A] text-[#1A1A1A] font-bold"
                  >
                    <option value="all">All Branches</option>
                    <option value="daily">Nearbi Daily Only</option>
                    <option value="hypermarket">Nearbi Hypermarket Only</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCredModal(false)}
                  className="flex-1 min-h-[40px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 min-h-[40px] bg-[#1A1A1A] text-white hover:bg-[#333333] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit App Login Modal */}
      {showEditLoginModal && editingLogin && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-[#E8E8E8] rounded-[20px] max-w-sm w-full p-6 flex flex-col space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-[#1A1A1A] text-base font-bold">Edit Login: {editingLogin.display_name}</h3>
              <button
                type="button"
                onClick={() => setShowEditLoginModal(false)}
                className="text-[#999999] hover:text-[#1A1A1A] cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveLogin} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                  Email Address / Username
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. email@nearbi.com"
                  className="w-full text-[#1A1A1A] font-bold bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                  New Password (leave blank to keep unchanged)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full text-[#1A1A1A] font-bold bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs focus:outline-none focus:border-[#1A1A1A]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditLoginModal(false)}
                  className="flex-1 min-h-[40px] bg-white border border-[#E8E8E8] text-[#1A1A1A] hover:bg-[#F8F8F8] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLogin}
                  className="flex-1 min-h-[40px] bg-[#1A1A1A] text-white hover:bg-[#333333] font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                >
                  {savingLogin ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

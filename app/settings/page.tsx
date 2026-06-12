'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Plus, Trash2, CheckCircle2, Circle, Search } from 'lucide-react';

interface FineSettings {
  id: string;
  yellow_fine: number;
  orange_fine: number;
  red_fine: number;
  yellow_free_passes: number;
}

interface BreakSettings {
  id?: string;
  morning_tea_duration: number;
  morning_tea_start: string;
  morning_tea_end: string;
  food_break_duration: number;
  food_break_start: string;
  food_break_end: string;
  evening_tea_duration: number;
  evening_tea_start: string;
  evening_tea_end: string;
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

  const [breakSettings, setBreakSettings] = useState<BreakSettings>({
    morning_tea_duration: 10,
    morning_tea_start: '09:30',
    morning_tea_end: '11:30',
    food_break_duration: 25,
    food_break_start: '12:00',
    food_break_end: '15:00',
    evening_tea_duration: 10,
    evening_tea_start: '16:00',
    evening_tea_end: '18:30',
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
          .eq('id', 'default')
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
          .limit(1);

        if (breakE) throw breakE;

        if (!breakData || breakData.length === 0) {
          const defaultBreak = {
            morning_tea_duration: 10,
            morning_tea_start: '09:30',
            morning_tea_end: '11:30',
            food_break_duration: 25,
            food_break_start: '12:00',
            food_break_end: '15:00',
            evening_tea_duration: 10,
            evening_tea_start: '16:00',
            evening_tea_end: '18:30',
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
        } else if (breakData[0]) {
          setBreakSettings(breakData[0]);
        }
      } catch (err: any) {
        console.error('Break settings fetch error:', err);
      }

    } catch (err: any) {
      console.error('Settings fetch error:', err);
      setErrorMsg('Failed to load settings data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading || !canSeeSalaryBreakdown) return;
    setLoading(true);
    fetchData();
  }, [isLoading, canSeeSalaryBreakdown]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const targetId = settings?.id || '00000000-0000-0000-0000-000000000001';
      const { error } = await supabase
        .from('fine_settings')
        .upsert({
          id: targetId,
          yellow_fine: Number(settings.yellow_fine),
          orange_fine: Number(settings.orange_fine),
          red_fine: Number(settings.red_fine),
          yellow_free_passes: Number(settings.yellow_free_passes),
          updated_by: user?.email || 'admin',
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (error) {
        console.error('Settings save error:', error);
        // Try insert if upsert fails
        const { error: insError } = await supabase
          .from('fine_settings')
          .insert({
            yellow_fine: Number(settings.yellow_fine),
            orange_fine: Number(settings.orange_fine),
            red_fine: Number(settings.red_fine),
            yellow_free_passes: Number(settings.yellow_free_passes),
            updated_by: user?.email || 'admin'
          });
        if (insError) throw insError;
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
          .eq('id', existing.id);

        if (error) throw error;
        showToast('Exemption removed ✓');
      } else {
        const pKey = 'ex_' + Math.random().toString(36).substr(2, 9);
        const { error } = await supabase
          .from('staff_fine_exemptions')
          .insert({
            id: pKey,
            staff_id: staffId,
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
      const lastDay = new Date(year, monthNum, 0).toISOString().split('T')[0];

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
        let attQuery = supabase.from('attendance')
          .delete()
          .gte('date', firstDay)
          .lte('date', lastDay)
          .in('staff_id', allowedStaffIds);
        const { data, error } = await attQuery.select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} attendance records`);
      }

      // 2. Late Fines (unconfirmed only)
      if (cleanupItems.fines && allowedStaffIds.length > 0) {
        let finesQuery = supabase.from('late_fines')
          .select('id, confirmed')
          .eq('month', cleanupMonth)
          .in('staff_id', allowedStaffIds);
        const { data: finesData } = await finesQuery;
        
        const unconfirmedFines = finesData?.filter(f => !f.confirmed).map(f => f.id) || [];
        const confirmedCount = finesData?.filter(f => f.confirmed).length || 0;

        if (unconfirmedFines.length > 0) {
          const { error } = await supabase.from('late_fines')
            .delete()
            .in('id', unconfirmedFines);
          if (error) throw error;
        }
        summaryParts.push(`${unconfirmedFines.length} late fines (${confirmedCount} skipped confirmed fines)`);
      }

      // 3. Break Logs
      if (cleanupItems.breaks && allowedStaffIds.length > 0) {
        let breakQuery = supabase.from('break_logs')
          .delete()
          .gte('date', firstDay)
          .lte('date', lastDay)
          .in('staff_id', allowedStaffIds);
        const { data, error } = await breakQuery.select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} break logs`);
      }

      // 4. Wall Events
      if (cleanupItems.wall && allowedStaffIds.length > 0) {
        let wallQuery = supabase.from('wall_events')
          .delete()
          .gte('created_at', `${firstDay}T00:00:00Z`)
          .lte('created_at', `${lastDay}T23:59:59Z`)
          .in('staff_id', allowedStaffIds);
        const { data, error } = await wallQuery.select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} wall events`);
      }

      // 5. Notifications (read only)
      if (cleanupItems.notifications && allowedStaffIds.length > 0) {
        let notifQuery = supabase.from('notifications')
          .select('id, is_read')
          .gte('created_at', `${firstDay}T00:00:00Z`)
          .lte('created_at', `${lastDay}T23:59:59Z`)
          .in('staff_id', allowedStaffIds);
        const { data: notifData } = await notifQuery;
        const readIds = notifData?.filter(n => n.is_read).map(n => n.id) || [];
        const unreadCount = notifData?.filter(n => !n.is_read).length || 0;

        if (readIds.length > 0) {
          const { error } = await supabase.from('notifications')
            .delete()
            .in('id', readIds);
          if (error) throw error;
        }
        summaryParts.push(`${readIds.length} notifications (${unreadCount} skipped unread notifications)`);
      }

      // 6. Leave Requests
      if (cleanupItems.leaves && allowedStaffIds.length > 0) {
        let leaveQuery = supabase.from('leave_requests')
          .delete()
          .gte('date', firstDay)
          .lte('date', lastDay)
          .in('staff_id', allowedStaffIds);
        const { data, error } = await leaveQuery.select();
        if (error) throw error;
        summaryParts.push(`${data?.length || 0} leave requests`);
      }

      // 7. Salary Confirmations (unlocked only)
      if (cleanupItems.salaries && allowedStaffIds.length > 0) {
        let salQuery = supabase.from('salary_confirmations')
          .select('id, is_locked')
          .eq('month', cleanupMonth)
          .in('staff_id', allowedStaffIds);
        const { data: salData } = await salQuery;
        
        const unlockedSalaries = salData?.filter(s => !s.is_locked).map(s => s.id) || [];
        const lockedCount = salData?.filter(s => s.is_locked).length || 0;

        if (unlockedSalaries.length > 0) {
          const { error } = await supabase.from('salary_confirmations')
            .delete()
            .in('id', unlockedSalaries);
          if (error) throw error;
        }
        summaryParts.push(`${unlockedSalaries.length} salary confirmations (${lockedCount} skipped locked confirmations)`);
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
      const payload: any = {
        morning_tea_duration: Number(breakSettings.morning_tea_duration),
        morning_tea_start: breakSettings.morning_tea_start,
        morning_tea_end: breakSettings.morning_tea_end,
        food_break_duration: Number(breakSettings.food_break_duration),
        food_break_start: breakSettings.food_break_start,
        food_break_end: breakSettings.food_break_end,
        evening_tea_duration: Number(breakSettings.evening_tea_duration),
        evening_tea_start: breakSettings.evening_tea_start,
        evening_tea_end: breakSettings.evening_tea_end,
        updated_by: user?.email || 'Admin',
        updated_at: new Date().toISOString(),
      };

      if (breakSettings.id) {
        payload.id = breakSettings.id;
      }

      const { error } = await supabase
        .from('break_settings')
        .upsert(payload);

      if (error) throw error;
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
        const shiftStartMins = parseMins(shiftStart);
        const checkInMins = parseMins(rec.check_in_time);

        const correctMinutesLate = Math.max(0, checkInMins - shiftStartMins);
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
            <h2 className="text-[#1A1A1A] font-bold text-sm">
              3. Break Schedule Settings
            </h2>

            <form onSubmit={handleSaveBreakSettings} className="space-y-4">
              {/* Morning Tea */}
              <div className="space-y-2 border-b border-[var(--border)] pb-3">
                <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Morning Tea</h3>
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
              </div>

              {/* Food Break */}
              <div className="space-y-2 border-b border-[var(--border)] pb-3">
                <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Food Break</h3>
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
              </div>

              {/* Evening Tea */}
              <div className="space-y-2 pb-2">
                <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Evening Tea</h3>
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

      {/* Global Toast */}
      {toastMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[15000] bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] font-bold text-xs px-4 py-2.5 rounded-full shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

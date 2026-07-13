import { supabase } from './supabase';
import { writeAuditLog } from './audit';

export interface ActiveGuardianInfo {
  primary: any;
  backup: any;
  active: any;
  status: 'primary_active' | 'backup_promoted' | 'no_coverage';
  reason: string;
}

export interface BranchDutyStatus {
  opening: ActiveGuardianInfo;
  closing: ActiveGuardianInfo;
}

// Helper to check if a time has passed (format HH:MM)
function hasTimePassed(timeStr: string, graceMinutes = 15): boolean {
  if (!timeStr) return false;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const [h, m] = timeStr.split(':').map(Number);
  const targetMins = h * 60 + m + graceMinutes;

  return currentMins > targetMins;
}

// Core cascading active duty resolver
export async function getActiveDutyInfo(branchId: string, dateStr: string): Promise<BranchDutyStatus> {
  const dateObj = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = dateObj.getDay(); // 0 is Sun, 6 is Sat

  // 1. Fetch Today's Duty Roster for the branch
  const { data: rosterEntries } = await supabase
    .from('duty_roster')
    .select('*, staff:staff_id(*, shift:shift_id(*))')
    .eq('branch_id', branchId)
    .eq('day_of_week', dayOfWeek)
    .eq('active', true);

  // 2. Fetch today's attendance for the branch
  const { data: attRecords } = await supabase
    .from('attendance')
    .select('*')
    .eq('date', dateStr);

  // 3. Fetch today's handoffs from audit_log
  const { data: handoffs } = await supabase
    .from('audit_log')
    .select('*')
    .eq('action_type', 'duty_handoff')
    .gte('created_at', dateStr + 'T00:00:00.000Z')
    .lte('created_at', dateStr + 'T23:59:59.999Z');

  const resolveShift = async (shiftWindow: 'opening' | 'closing'): Promise<ActiveGuardianInfo> => {
    const primaryEntry = rosterEntries?.find(r => r.shift_window === shiftWindow && r.role_type === 'primary');
    const backupEntry = rosterEntries?.find(r => r.shift_window === shiftWindow && r.role_type === 'backup');

    const primary = primaryEntry?.staff || null;
    const backup = backupEntry?.staff || null;

    if (!primary) {
      return {
        primary: null,
        backup: null,
        active: null,
        status: 'no_coverage',
        reason: 'No Primary Store Guardian assigned in roster.'
      };
    }

    const primaryAtt = attRecords?.find(a => a.staff_id === primary.id);
    const backupAtt = attRecords?.find(a => a.staff_id === (backup?.id || ''));

    // Check if Primary is on leave
    const primaryOnLeave = primaryAtt?.day_type === 'leave';
    
    // Check if Primary checked out early before shift end
    const shiftEnd = primary.shift?.end_time || '18:00';
    const primaryCheckedOutEarly = primaryAtt?.check_out_time && 
      (parseInt(primaryAtt.check_out_time.split(':')[0]) < parseInt(shiftEnd.split(':')[0]));

    // Check check-in status (Grace period: shift_start + 15 mins)
    const shiftStart = primary.shift?.start_time || '09:00';
    const isPastGrace = hasTimePassed(shiftStart, 15);
    const primaryCheckedIn = primaryAtt?.check_in_time !== undefined && primaryAtt?.check_in_time !== null;
    const primaryMissedCheckin = isPastGrace && !primaryCheckedIn;

    // Check if there was a manual handoff logged
    const isHandedOff = handoffs?.some(h => {
      try {
        const payload = JSON.parse(h.notes || '{}');
        return payload.branch_id === branchId && payload.shift_window === shiftWindow;
      } catch (_) {
        return false;
      }
    });

    // Promotion logic criteria
    let promoteBackup = false;
    let promotionReason = '';

    if (primaryOnLeave) {
      promoteBackup = true;
      promotionReason = 'Primary is on approved leave today.';
    } else if (primaryMissedCheckin) {
      promoteBackup = true;
      promotionReason = `Primary missed check-in grace period (Shift Start: ${shiftStart}).`;
    } else if (primaryCheckedOutEarly) {
      promoteBackup = true;
      promotionReason = 'Primary checked out early.';
    } else if (isHandedOff) {
      promoteBackup = true;
      promotionReason = 'Primary manually handed off duty to backup.';
    }

    if (promoteBackup) {
      if (!backup) {
        // No backup assigned
        await triggerNoCoverageFlag(branchId, shiftWindow, dateStr, 'No backup assigned to promote.');
        return {
          primary,
          backup: null,
          active: null,
          status: 'no_coverage',
          reason: `Primary absent (${promotionReason}). No backup assigned.`
        };
      }

      // Check if backup is also unavailable (on leave or missed checkin if grace period passed for backup)
      const backupOnLeave = backupAtt?.day_type === 'leave';
      const backupShiftStart = backup.shift?.start_time || '09:00';
      const backupIsPastGrace = hasTimePassed(backupShiftStart, 15);
      const backupCheckedIn = backupAtt?.check_in_time !== undefined && backupAtt?.check_in_time !== null;
      const backupMissedCheckin = backupIsPastGrace && !backupCheckedIn;

      if (backupOnLeave || backupMissedCheckin) {
        const backupReason = backupOnLeave 
          ? 'Backup on leave' 
          : `Backup missed check-in (Shift Start: ${backupShiftStart})`;
        
        await triggerNoCoverageFlag(branchId, shiftWindow, dateStr, `Both Primary and Backup unavailable. ${backupReason}.`);
        
        return {
          primary,
          backup,
          active: null,
          status: 'no_coverage',
          reason: `Both Primary and Backup unavailable. Primary: ${promotionReason}. Backup: ${backupReason}.`
        };
      }

      return {
        primary,
        backup,
        active: backup,
        status: 'backup_promoted',
        reason: `Backup promoted. Primary unavailable: ${promotionReason}`
      };
    }

    return {
      primary,
      backup,
      active: primary,
      status: 'primary_active',
      reason: 'Primary is active.'
    };
  };

  return {
    opening: await resolveShift('opening'),
    closing: await resolveShift('closing')
  };
}

// Log a coverage gap alert to the audit log if not already logged today
async function triggerNoCoverageFlag(branchId: string, shiftWindow: string, dateStr: string, reason: string) {
  try {
    const today = new Date().toISOString().split('T')[0];
    if (today !== dateStr) return; // Only log for today

    // Check if already logged today
    const { data } = await supabase
      .from('audit_log')
      .select('id')
      .eq('action_type', 'no_coverage_gap')
      .eq('target_description', `${branchId}_${shiftWindow}_${dateStr}`);

    if (data && data.length > 0) return; // Already logged

    await writeAuditLog({
      action_type: 'no_coverage_gap',
      performed_by: 'System',
      performed_by_role: 'system',
      target_description: `${branchId}_${shiftWindow}_${dateStr}`,
      notes: `No duty coverage — ${branchId.toUpperCase()} ${shiftWindow.toUpperCase()} today (${dateStr}). Reason: ${reason}`
    });
  } catch (err) {
    console.error('Failed to log coverage gap:', err);
  }
}

// Manual handoff function
export async function handOffDuty(branchId: string, shiftWindow: 'opening' | 'closing', fromStaffId: string, toStaffId: string, performedByEmail: string, performedByRole: string) {
  return writeAuditLog({
    action_type: 'duty_handoff',
    performed_by: performedByEmail,
    performed_by_role: performedByRole,
    staff_id: fromStaffId,
    notes: JSON.stringify({
      branch_id: branchId,
      shift_window: shiftWindow,
      from_staff_id: fromStaffId,
      to_staff_id: toStaffId,
      timestamp: new Date().toISOString()
    })
  });
}

// Auto marks pending completions after shift ends as 'missed'
export async function checkAndMarkMissedTasks(branchId: string, dateStr: string) {
  try {
    // 1. Fetch active tasks for this branch
    const { data: tasks } = await supabase
      .from('sop_tasks')
      .select('*')
      .eq('branch_id', branchId)
      .eq('active', true);

    if (!tasks || tasks.length === 0) return;

    // 2. Fetch completions for today
    const { data: completions } = await supabase
      .from('daily_task_completion')
      .select('*')
      .eq('branch_id', branchId)
      .eq('task_date', dateStr);

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    for (const task of tasks) {
      const completion = completions?.find(c => c.task_id === task.id);
      
      // If task window time_end has passed and status is not completed/missed
      if (task.time_end && (!completion || completion.status === 'pending')) {
        const [h, m] = task.time_end.split(':').map(Number);
        const endMins = h * 60 + m;

        // If current time has passed the end time window
        if (currentMins > endMins) {
          const payload = {
            task_id: task.id,
            branch_id: branchId,
            task_date: dateStr,
            status: 'missed',
            completed_at: new Date().toISOString()
          };

          if (completion) {
            await supabase
              .from('daily_task_completion')
              .update({ status: 'missed' })
              .eq('id', completion.id);
          } else {
            await supabase
              .from('daily_task_completion')
              .insert(payload);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to run missed tasks check:', err);
  }
}

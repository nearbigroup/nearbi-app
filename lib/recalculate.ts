import { supabase } from './supabase';
import {
  calculateLateMinutes,
  calculateOTMinutes,
  calculateEarlyLeaveMinutes,
  calculateSalary,
  getDaysInMonth
} from './salary';
import { writeAuditLog } from './audit';

export interface RecalculationOptions {
  staffId: string;
  year: number; // e.g. 2026
  month: number; // 1-12
  performedBy?: string;
  performedByRole?: string;
  triggerReason?: string; // e.g. 'shift_change', 'manual_edit', 'recalculate_only'
  isBulk?: boolean;
}

export interface RecalculationResult {
  staffId: string;
  staffName?: string;
  monthStr: string; // e.g. "2026-07"
  monthLabel: string; // e.g. "July 2026"
  recordsProcessed: number;
  finesVoided: number;
  finesAdjusted: number;
  finesConfirmedUntouched: number;
  otAdjusted: number;
  salaryUpdated: boolean;
  salaryLocked: boolean;
  message: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Executes the 4-step recalculation chain for a single staff member:
 * 1. Recomputes required_working_hours, late_minutes, OT_minutes, early_leave_minutes against current shift template using existing punch timestamps.
 * 2. Re-evaluates late fines: voids pending fine if late_minutes <= 5/0, adjusts pending fine amount if severity changed, leaves confirmed/waived fines untouched.
 * 3. Recomputes day's contribution to salary.
 * 4. Re-aggregates monthly salary totals IF month salary is pending. If confirmed, leaves salary untouched and flags message.
 * Logs run to audit_log table.
 */
export async function recalculateStaffAttendance(options: RecalculationOptions): Promise<RecalculationResult> {
  const {
    staffId,
    year,
    month,
    performedBy = 'system',
    performedByRole = 'admin',
    triggerReason = 'recalculate_only',
    isBulk = false
  } = options;

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const firstDay = `${monthStr}-01`;
  const lastDayNum = getDaysInMonth(year, month);
  const lastDay = `${monthStr}-${String(lastDayNum).padStart(2, '0')}`;

  // Fetch staff details
  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('*, shift:shift_id(*)')
    .eq('id', staffId)
    .single();

  if (staffErr || !staff) {
    throw new Error(`Staff not found: ${staffErr?.message || staffId}`);
  }

  // Determine effective shift template
  const shift = staff.shift || {
    start_time: '09:00',
    end_time: '18:00',
    hours: 8
  };

  const otThreshold = Number(staff.ot_threshold_minutes || 30);

  // Fetch all attendance records for this month
  const { data: attRecords, error: attErr } = await supabase
    .from('attendance')
    .select('*')
    .eq('staff_id', staffId)
    .gte('date', firstDay)
    .lte('date', lastDay);

  if (attErr) {
    throw new Error(`Failed to fetch attendance records: ${attErr.message}`);
  }

  // Fetch fine settings
  const { data: fineSettings } = await supabase
    .from('fine_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  const settings = fineSettings || {
    yellow_fine: 50,
    orange_fine: 100,
    red_fine: 200,
    yellow_free_passes: 4
  };

  // Check fine exemption
  const { data: exemption } = await supabase
    .from('staff_fine_exemptions')
    .select('id')
    .eq('staff_id', staffId)
    .maybeSingle();

  let recordsProcessed = 0;
  let finesVoided = 0;
  let finesAdjusted = 0;
  let finesConfirmedUntouched = 0;
  let otAdjusted = 0;

  // Sort chronologically for yellow pass calculation
  const sortedRecords = [...(attRecords || [])].sort((a, b) => a.date.localeCompare(b.date));
  let yellowPassCount = 0;

  for (const r of sortedRecords) {
    if (!r.check_in_time) continue;
    recordsProcessed++;

    const newLateMins = calculateLateMinutes(r.check_in_time, shift.start_time);
    const newColorCode: 'green' | 'yellow' | 'orange' | 'red' =
      newLateMins === 0 ? 'green' :
      newLateMins <= 15 ? 'yellow' :
      newLateMins <= 30 ? 'orange' : 'red';
    const newStatus = newLateMins > 0 ? 'late' : 'present';

    // Recalculate OT if not approved
    let newOTMins = r.ot_minutes || 0;
    if (!r.ot_approved) {
      newOTMins = r.check_out_time
        ? calculateOTMinutes(shift.end_time, r.check_out_time, shift.start_time, otThreshold)
        : 0;
      if (newOTMins !== r.ot_minutes) {
        otAdjusted++;
      }
    }

    // Recalculate early leave minutes
    const newEarlyLeaveMins = r.check_out_time
      ? calculateEarlyLeaveMinutes(shift.end_time, r.check_out_time, shift.start_time)
      : 0;

    // Recalculate early check-in minutes
    const [sh, sm] = shift.start_time.split(':').map(Number);
    const [ch, cm] = r.check_in_time.split(':').map(Number);
    const shiftStartMins = sh * 60 + sm;
    const checkInMins = ch * 60 + cm;
    const earlyInMins = Math.max(0, shiftStartMins - checkInMins);

    // 1. Update attendance derived values
    const { error: attUpdateErr } = await supabase
      .from('attendance')
      .update({
        minutes_late: newLateMins,
        color_code: newColorCode,
        status: newStatus,
        ot_minutes: newOTMins,
        early_leave_minutes: newEarlyLeaveMins,
        early_in_minutes: earlyInMins,
        late_salary_deduction_minutes: newLateMins
      })
      .eq('id', r.id);

    if (attUpdateErr) {
      console.error(`Failed to update attendance ID ${r.id}:`, attUpdateErr);
    }

    // 2. Re-evaluate late fines for this date
    const { data: existingFine } = await supabase
      .from('late_fines')
      .select('*')
      .eq('staff_id', staffId)
      .eq('date', r.date)
      .maybeSingle();

    const isFineLocked = existingFine?.confirmed === true || existingFine?.waived === true;

    if (isFineLocked) {
      finesConfirmedUntouched++;
      continue;
    }

    if (exemption || newColorCode === 'green' || newLateMins <= 5) {
      if (existingFine) {
        await supabase
          .from('late_fines')
          .delete()
          .eq('id', existingFine.id);
        finesVoided++;
      }
    } else {
      let fineAmount = 0;
      if (newColorCode === 'yellow') {
        if (yellowPassCount >= settings.yellow_free_passes) {
          fineAmount = Number(settings.yellow_fine);
        }
        yellowPassCount++;
      } else if (newColorCode === 'orange') {
        fineAmount = Number(settings.orange_fine);
      } else if (newColorCode === 'red') {
        fineAmount = Number(settings.red_fine);
      }

      if (fineAmount > 0) {
        const { error: fineUpsertErr } = await supabase
          .from('late_fines')
          .upsert({
            staff_id: staffId,
            date: r.date,
            late_minutes: newLateMins,
            color_code: newColorCode,
            fine_amount: fineAmount,
            waived: false,
            month: monthStr
          }, { onConflict: 'staff_id,date' });

        if (fineUpsertErr) {
          console.error('Fine upsert error:', fineUpsertErr);
        } else {
          if (!existingFine || existingFine.fine_amount !== fineAmount) {
            finesAdjusted++;
          }
        }
      } else if (existingFine) {
        await supabase
          .from('late_fines')
          .delete()
          .eq('id', existingFine.id);
        finesVoided++;
      }
    }
  }

  // 3 & 4. Check salary confirmation status and aggregate
  const { data: existingSalaryConf } = await supabase
    .from('salary_confirmations')
    .select('*')
    .eq('staff_id', staffId)
    .eq('month', monthStr)
    .maybeSingle();

  const isSalaryConfirmed = !!existingSalaryConf;
  let salaryUpdated = false;

  if (isSalaryConfirmed) {
    // Month salary is already confirmed — DO NOT TOUCH aggregate salary totals
    salaryUpdated = false;
  } else {
    // Re-aggregate pending salary for the month
    const { data: monthAtt } = await supabase
      .from('attendance')
      .select('*')
      .eq('staff_id', staffId)
      .gte('date', firstDay)
      .lte('date', lastDay);

    const { data: monthFines } = await supabase
      .from('late_fines')
      .select('*')
      .eq('staff_id', staffId)
      .eq('month', monthStr);

    const { data: monthSpecialFines } = await supabase
      .from('special_fines')
      .select('*')
      .eq('staff_id', staffId)
      .gte('date', firstDay)
      .lte('date', lastDay);

    const daysActuallyWorked = (monthAtt || []).filter(a => a.status === 'present' || a.status === 'late').length;
    const confirmedLateFines = (monthFines || []).filter(f => f.confirmed === true || f.waived === false).reduce((sum, f) => sum + Number(f.fine_amount || 0), 0);
    const confirmedSpecialFines = (monthSpecialFines || []).reduce((sum, f) => sum + Number(f.amount || 0), 0);
    const approvedOTMinutes = (monthAtt || []).filter(a => a.ot_approved).reduce((sum, a) => sum + Number(a.ot_minutes || 0), 0);
    const approvedEarlyInMinutes = (monthAtt || []).filter(a => a.early_in_approved).reduce((sum, a) => sum + Number(a.early_in_minutes || 0), 0);
    const earlyLeaveMinutesTotal = (monthAtt || []).reduce((sum, a) => sum + Number(a.early_leave_minutes || 0), 0);
    const totalLateDeductionMins = (monthAtt || []).reduce((sum, a) => sum + Number(a.late_salary_deduction_minutes || a.minutes_late || 0), 0);

    const salaryCalc = calculateSalary(
      {
        monthlySalary: Number(staff.monthly_salary || 0),
        offDaysPerMonth: (staff.off_days_per_month || 4) as 0 | 2 | 4,
        shiftHours: Number(shift.hours || 8),
        year,
        month,
        branchId: staff.branch_id
      },
      {
        daysActuallyWorked,
        confirmedLateFines,
        confirmedSpecialFines,
        approvedOTMinutes,
        approvedEarlyInMinutes,
        earlyLeaveMinutes: earlyLeaveMinutesTotal,
        late_salary_deduction_minutes: totalLateDeductionMins
      }
    );

    salaryUpdated = true;
  }

  // Construct result message
  const changesSummary: string[] = [];
  if (finesVoided > 0) changesSummary.push(`${finesVoided} fine(s) voided`);
  if (finesAdjusted > 0) changesSummary.push(`${finesAdjusted} fine(s) adjusted`);
  if (otAdjusted > 0) changesSummary.push(`${otAdjusted} OT entry(ies) adjusted`);
  if (changesSummary.length === 0) changesSummary.push('no fine or OT changes');

  const summaryText = changesSummary.join(', ');
  let resultMsg = `${monthLabel} attendance recalculated: ${summaryText}.`;
  if (isSalaryConfirmed) {
    resultMsg = `${monthLabel} salary is confirmed — attendance recalculated, but salary total was not changed. Use Recalculate-Only after review if needed.`;
  }

  // Audit log entry
  await writeAuditLog({
    action_type: 'recalculation_run',
    performed_by: performedBy,
    performed_by_role: performedByRole,
    staff_id: staffId,
    target_description: `${staff.name} (${monthLabel})`,
    notes: `Month: ${monthStr}, Mode: ${triggerReason}, Bulk: ${isBulk}, Summary: ${summaryText}, SalaryLocked: ${isSalaryConfirmed}`
  });

  return {
    staffId,
    staffName: staff.name,
    monthStr,
    monthLabel,
    recordsProcessed,
    finesVoided,
    finesAdjusted,
    finesConfirmedUntouched,
    otAdjusted,
    salaryUpdated,
    salaryLocked: isSalaryConfirmed,
    message: resultMsg
  };
}

import { getDaysInMonth, calculateBonusDays } from './salary';
import { formatTime12hr } from './utils';

export type ColorBand = 'green' | 'yellow' | 'orange' | 'red' | null;

export interface AttendanceRawRecord {
  id?: string;
  staff_id: string;
  date: string; // YYYY-MM-DD
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
  day_type?: string | null;
  minutes_late?: number | null;
  color_code?: string | null;
  override_shift_start?: string | null;
  override_shift_end?: string | null;
}

export interface StaffRawRecord {
  id: string;
  name: string;
  branch_id: string;
  department: string;
  pay_type?: string | null;
  shift_id?: string | null;
  off_days_per_month?: number | null;
  shift?: {
    id?: string;
    label?: string;
    start_time?: string | null;
    end_time?: string | null;
    hours?: number | null;
  } | null;
}

export interface LateFineRawRecord {
  id: string;
  staff_id: string;
  date: string;
  late_minutes?: number | null;
  color_code?: string | null;
  fine_amount: number;
  waived?: boolean | null;
  waived_amount?: number | null;
  waived_by?: string | null;
  waived_reason?: string | null;
  confirmed?: boolean | null;
}

export interface LeaveRequestRawRecord {
  id: string;
  staff_id: string;
  date: string;
  status: string;
  reason?: string | null;
}

export interface FineSettingsRecord {
  yellow_fine: number;
  orange_fine: number;
  red_fine: number;
  yellow_free_passes: number;
}

export interface LateDayDetail {
  date: string;
  dayNumber: number;
  colorCode: 'yellow' | 'orange' | 'red';
  minutesLate: number;
  statusText: string;
  fineAmount?: number;
  isWaived?: boolean;
  waivedBy?: string | null;
  waivedReason?: string | null;
  isFreePass?: boolean;
  freePassNumber?: number;
  isExempt?: boolean;
}

export interface DayCellData {
  date: string;
  dayNumber: number;
  dayOfWeek: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  formattedIn: string;
  formattedOut: string;
  colorCode: ColorBand;
  minutesLate: number;
  status: string | null;
  dayType: string | null;
  overrideShiftStart: string | null;
  isHourly: boolean;
  hasPunch: boolean;
  isFuture: boolean;
  isApprovedLeave: boolean;
}

export interface StaffGridRow {
  staffId: string;
  name: string;
  branchId: string;
  department: string;
  payType: string;
  isHourly: boolean;
  hasShift: boolean;
  offDaysPerMonth: number;
  shiftLabel: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  days: Record<number, DayCellData>;
  daysWorked: number;
  noPunchPastDays: number;
  earnedQuota: number;
  weeklyOffsUsed: number;
  leaveDays: number;
  approvedLeaveDays: number;
  targetDays: number;
  statusText: string;
  statusBadge: string;
  progressText?: string;
  isCurrentMonth: boolean;
  shortfall: number;
  place: number | null; // null for hourly/no-shift
  counts: {
    green: number;
    yellow: number;
    orange: number;
    red: number;
  };
  finesIssued: number;
  finesWaived: number;
  freePassesUsed: number;
  freePassesLeft: number;
  lateDayDetails: LateDayDetail[];
  isExempt: boolean;
}

export interface InTimeGridModel {
  year: number;
  month: number;
  calendarDays: number;
  todayStr: string;
  isCurrentMonth: boolean;
  fineSettings: FineSettingsRecord;
  dayColumns: Array<{
    dayNumber: number;
    dayOfWeek: string;
    date: string;
    isSunday: boolean;
    isFuture: boolean;
    isToday: boolean;
  }>;
  rows: StaffGridRow[];
  departments: string[];
  branches: string[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * Builds the complete monthly grid model for the In-Time Grid.
 * Filters out staff who have zero punches in the month.
 */
export function buildInTimeGridModel(
  staffList: StaffRawRecord[],
  attendanceRecords: AttendanceRawRecord[],
  lateFines: LateFineRawRecord[],
  leaveRequests: LeaveRequestRawRecord[],
  fineSettings: FineSettingsRecord = {
    yellow_fine: 20,
    orange_fine: 30,
    red_fine: 50,
    yellow_free_passes: 4,
  },
  exemptStaffIds: Set<string> = new Set(),
  year: number,
  month: number
): InTimeGridModel {
  const calendarDays = getDaysInMonth(year, month);
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const todayStr = getTodayIST();
  const isCurrentMonth = monthPrefix === todayStr.substring(0, 7);

  // Pre-generate day column headers
  const dayColumns = [];
  for (let d = 1; d <= calendarDays; d++) {
    const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    const dt = new Date(year, month - 1, d);
    const dayOfWeek = WEEKDAYS[dt.getDay()];
    const isFuture = dateStr > todayStr;
    const isToday = dateStr === todayStr;

    dayColumns.push({
      dayNumber: d,
      dayOfWeek,
      date: dateStr,
      isSunday: dt.getDay() === 0,
      isFuture,
      isToday,
    });
  }

  // Map attendance records: staff_id_date -> AttendanceRawRecord
  const attMap = new Map<string, AttendanceRawRecord>();
  for (const att of attendanceRecords) {
    if (att.staff_id && att.date) {
      attMap.set(`${att.staff_id}_${att.date}`, att);
    }
  }

  // Map approved leave requests: staff_id_date -> LeaveRequestRawRecord
  const leaveMap = new Map<string, LeaveRequestRawRecord>();
  for (const lv of leaveRequests) {
    if (lv.staff_id && lv.date && lv.status === 'approved') {
      leaveMap.set(`${lv.staff_id}_${lv.date}`, lv);
    }
  }

  // Group late fines by staff_id
  const finesByStaff = new Map<string, LateFineRawRecord[]>();
  for (const fn of lateFines) {
    if (fn.staff_id) {
      const arr = finesByStaff.get(fn.staff_id) || [];
      arr.push(fn);
      finesByStaff.set(fn.staff_id, arr);
    }
  }

  const rows: StaffGridRow[] = [];
  const deptSet = new Set<string>();
  const branchSet = new Set<string>();

  for (const st of staffList) {
    if (st.department) deptSet.add(st.department);
    if (st.branch_id) branchSet.add(st.branch_id);

    const hasShift = !!st.shift_id;
    const isHourly = st.pay_type === 'hourly' || !hasShift;
    const offDays = Number(st.off_days_per_month || 0);
    const isExempt = exemptStaffIds.has(st.id);

    let daysWorked = 0;
    let noPunchPastDays = 0;
    let approvedLeaveDays = 0;
    const counts = { green: 0, yellow: 0, orange: 0, red: 0 };
    const days: Record<number, DayCellData> = {};

    for (let d = 1; d <= calendarDays; d++) {
      const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const dt = new Date(year, month - 1, d);
      const dayOfWeek = WEEKDAYS[dt.getDay()];
      const isFuture = dateStr > todayStr;
      const key = `${st.id}_${dateStr}`;
      const att = attMap.get(key);
      const hasApprovedLeave = leaveMap.has(key);

      const hasCheckIn = !!(att && att.check_in_time && att.check_in_time.trim());

      // Approved leave for the whole month
      if (hasApprovedLeave) {
        approvedLeaveDays++;
      }

      if (hasCheckIn) {
        daysWorked++;
      } else if (!isFuture) {
        // Only past days count as no-punch
        noPunchPastDays++;
      }

      let colorCode: ColorBand = null;
      if (hasCheckIn) {
        if (att?.color_code === 'green') colorCode = 'green';
        else if (att?.color_code === 'yellow') colorCode = 'yellow';
        else if (att?.color_code === 'orange') colorCode = 'orange';
        else if (att?.color_code === 'red') colorCode = 'red';

        if (colorCode) {
          counts[colorCode]++;
        }
      }

      let formattedIn = '';
      if (hasCheckIn) {
        formattedIn = formatTime12hr(att!.check_in_time);
      }

      let formattedOut = '';
      if (att && att.check_out_time && att.check_out_time.trim()) {
        formattedOut = formatTime12hr(att.check_out_time);
      } else if (hasCheckIn) {
        formattedOut = '—';
      }

      days[d] = {
        date: dateStr,
        dayNumber: d,
        dayOfWeek,
        checkInTime: att?.check_in_time || null,
        checkOutTime: att?.check_out_time || null,
        formattedIn,
        formattedOut,
        colorCode,
        minutesLate: Number(att?.minutes_late || 0),
        status: att?.status || null,
        dayType: att?.day_type || null,
        overrideShiftStart: att?.override_shift_start || null,
        isHourly,
        hasPunch: hasCheckIn,
        isFuture,
        isApprovedLeave: !hasCheckIn && hasApprovedLeave,
      };
    }

    // Rule: Staff with ZERO punches in the whole month are excluded from the grid entirely.
    if (daysWorked === 0) {
      continue;
    }

    // Weekly offs used / leave days use PAST no-punch days only
    const earnedQuota = calculateBonusDays(daysWorked, offDays);
    const weeklyOffsUsed = Math.min(noPunchPastDays, earnedQuota);
    const leaveDays = Math.max(0, noPunchPastDays - weeklyOffsUsed);

    // Full-month TARGET = calendar days - off_days_per_month - approvedLeaveDays
    const targetDays = !hasShift ? 0 : Math.max(0, calendarDays - offDays - approvedLeaveDays);

    // Shortfall based on green days vs full-month target (used for ranking)
    const shortfall = !hasShift ? 9999 : Math.max(0, targetDays - counts.green);

    // PART B: Mid-month wording for current month in progress
    // days passed = calendar days up to and including today
    const daysPassed = isCurrentMonth
      ? Math.min(calendarDays, parseInt(todayStr.split('-')[2], 10))
      : calendarDays;

    let approvedLeaveDaysPassed = 0;
    for (let d = 1; d <= daysPassed; d++) {
      const dStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      if (leaveMap.has(`${st.id}_${dStr}`)) {
        approvedLeaveDaysPassed++;
      }
    }

    // Y = days passed minus weekly offs used minus approved leave days that have passed
    const Y = Math.max(0, daysPassed - weeklyOffsUsed - approvedLeaveDaysPassed);
    const X = counts.green;

    let statusText = '';
    let statusBadge = '';
    let progressText = '';

    if (!hasShift) {
      statusText = 'NO SHIFT SET';
      statusBadge = 'NO SHIFT SET';
    } else if (isCurrentMonth) {
      progressText = `${X} of ${Y} days so far`;
      if (X >= Y) {
        statusBadge = 'ON TRACK';
        statusText = 'ON TRACK';
      } else {
        const behind = Y - X;
        statusBadge = `${behind} BEHIND`;
        statusText = `${behind} BEHIND`;
      }
    } else {
      // Past months: keep FULL TARGET / N DAYS SHORT
      if (counts.green >= targetDays) {
        statusBadge = 'FULL TARGET';
        statusText = 'FULL TARGET';
      } else {
        const short = targetDays - counts.green;
        statusBadge = `${short} DAYS SHORT`;
        statusText = `${short} DAYS SHORT`;
      }
    }

    // Fines calculations for staff
    const staffFines = finesByStaff.get(st.id) || [];
    const finesIssued = staffFines.reduce(
      (sum, f) => sum + Number(f.fine_amount || 0),
      0
    );
    const finesWaived = staffFines.reduce((sum, f) => {
      if (f.waived) {
        const amt = Number(f.waived_amount);
        return sum + (amt > 0 ? amt : Number(f.fine_amount || 0));
      }
      return sum + Number(f.waived_amount || 0);
    }, 0);

    // Free passes left: yellow_free_passes setting minus yellow days that had NO fine row,
    // counted chronologically from day 1 of the month, min 0.
    const fineByDate = new Map<string, LateFineRawRecord>();
    for (const f of staffFines) {
      if (f.date) fineByDate.set(f.date, f);
    }

    let freePassesUsed = 0;
    const lateDayDetails: LateDayDetail[] = [];

    for (let d = 1; d <= calendarDays; d++) {
      const cell = days[d];
      if (!cell || !cell.hasPunch) continue;
      if (cell.colorCode === 'yellow' || cell.colorCode === 'orange' || cell.colorCode === 'red') {
        const fineRow = fineByDate.get(cell.date);
        let statusStr = '';
        let isFreePass = false;
        let passNum: number | undefined;

        if (isExempt) {
          statusStr = 'Exempt';
        } else if (fineRow) {
          if (fineRow.waived) {
            const waivedBy = fineRow.waived_by || 'Management';
            const reason = fineRow.waived_reason ? `: ${fineRow.waived_reason}` : ': no reason recorded';
            statusStr = `Waived by ${waivedBy}${reason}`;
          } else {
            statusStr = `Rs ${fineRow.fine_amount} charged`;
          }
        } else if (cell.colorCode === 'yellow') {
          freePassesUsed++;
          passNum = freePassesUsed;
          isFreePass = true;
          statusStr = `Free pass ${passNum} of ${fineSettings.yellow_free_passes}`;
        } else {
          statusStr = 'Exempt';
        }

        lateDayDetails.push({
          date: cell.date,
          dayNumber: d,
          colorCode: cell.colorCode,
          minutesLate: cell.minutesLate,
          statusText: statusStr,
          fineAmount: fineRow?.fine_amount,
          isWaived: !!fineRow?.waived,
          waivedBy: fineRow?.waived_by,
          waivedReason: fineRow?.waived_reason,
          isFreePass,
          freePassNumber: passNum,
          isExempt,
        });
      }
    }

    const freePassesLeft = Math.max(0, fineSettings.yellow_free_passes - freePassesUsed);

    rows.push({
      staffId: st.id,
      name: st.name,
      branchId: st.branch_id,
      department: st.department || 'General',
      payType: st.pay_type || 'monthly',
      isHourly,
      hasShift,
      offDaysPerMonth: offDays,
      shiftLabel: st.shift?.label || (isHourly ? 'Hourly' : 'No Shift'),
      shiftStart: st.shift?.start_time || null,
      shiftEnd: st.shift?.end_time || null,
      days,
      daysWorked,
      noPunchPastDays,
      earnedQuota,
      weeklyOffsUsed,
      leaveDays,
      approvedLeaveDays,
      targetDays,
      statusText,
      statusBadge,
      progressText,
      isCurrentMonth,
      shortfall,
      place: null, // Assigned below in ranking pass
      counts,
      finesIssued,
      finesWaived,
      freePassesUsed,
      freePassesLeft,
      lateDayDetails,
      isExempt,
    });
  }

  // Dense ranking pass across all staff with a shift
  const eligibleForRanking = rows.filter((r) => r.hasShift && !r.isHourly);
  const uniqueShortfalls = Array.from(
    new Set(eligibleForRanking.map((r) => r.shortfall))
  ).sort((a, b) => a - b);

  for (const r of rows) {
    if (r.hasShift && !r.isHourly) {
      r.place = uniqueShortfalls.indexOf(r.shortfall) + 1;
    } else {
      r.place = null; // not ranked (e.g. SINAN, Hanoon)
    }
  }

  return {
    year,
    month,
    calendarDays,
    todayStr,
    isCurrentMonth,
    fineSettings,
    dayColumns,
    rows,
    departments: Array.from(deptSet).sort(),
    branches: Array.from(branchSet).sort(),
  };
}

/**
 * Sorts staff rows either by place (default) or by name.
 */
export function sortStaffRows(
  rows: StaffGridRow[],
  sortBy: 'place' | 'name' = 'place'
): StaffGridRow[] {
  const cloned = [...rows];
  if (sortBy === 'name') {
    return cloned.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Default: by place ascending, then by name ascending
  return cloned.sort((a, b) => {
    if (a.place !== null && b.place !== null) {
      if (a.place !== b.place) return a.place - b.place;
      return a.name.localeCompare(b.name);
    }
    if (a.place !== null) return -1;
    if (b.place !== null) return 1;
    return a.name.localeCompare(b.name);
  });
}

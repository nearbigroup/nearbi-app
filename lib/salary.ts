import { supabase } from './supabase';

export function getDaysInMonth(
  year: number,
  month: number
): number {
  return new Date(year, month, 0).getDate();
}

export function calculateEarlyLeaveDeduction(
  earlyLeaveMinutes: number,
  dailyRate: number,
  shiftHours: number
): number {
  if (!earlyLeaveMinutes || earlyLeaveMinutes <= 0)
    return 0;
  const hourlyRate = dailyRate / shiftHours;
  const deduction = (earlyLeaveMinutes / 60) * hourlyRate;
  return Math.round(deduction * 100) / 100;
}

export function calculateSalary(
  config: {
    monthlySalary: number;
    offDaysPerMonth: 0 | 2 | 4;
    shiftHours: number;
    year: number;
    month: number; // 1-12
  },
  attendance: {
    daysActuallyWorked: number;
    confirmedLateFines: number;
    confirmedSpecialFines: number;
    approvedOTMinutes: number;
    approvedEarlyInMinutes: number;
    earlyLeaveMinutes: number;
    missingDays?: number;
    weeklyOffsTaken?: number;
    late_salary_deduction_minutes?: number;
    leaves_taken?: number;
  }
) {
  const {
    monthlySalary,
    offDaysPerMonth,
    shiftHours,
    year,
    month,
  } = config;

  const {
    daysActuallyWorked,
    confirmedLateFines,
    confirmedSpecialFines,
    approvedOTMinutes,
    approvedEarlyInMinutes,
    earlyLeaveMinutes,
    late_salary_deduction_minutes = 0,
    leaves_taken = 0,
  } = attendance;

  // Daily rate based on ACTUAL calendar days
  const calendarDays = getDaysInMonth(year, month);
  const dailyRate = monthlySalary / calendarDays;

  // Hourly rate = daily rate / shift hours
  const hourlyRate = dailyRate / shiftHours;

  // Required working days
  const requiredWorkingDays = calendarDays - offDaysPerMonth;

  // Maximum paid days cap
  const maxPaidDays = calendarDays;

  // Weekly off calculations
  let earnedQuota = 0;
  if (offDaysPerMonth === 4) {
    earnedQuota = Math.min(Math.floor(daysActuallyWorked / 6), 4);
  } else if (offDaysPerMonth === 2) {
    earnedQuota = Math.min(Math.floor(daysActuallyWorked / 12), 2);
  }

  // Calculate paid days and missing days
  let paidDays: number;
  let missingDays: number;

  if (attendance.missingDays !== undefined) {
    // If missingDays (deductedDays) is explicitly passed
    missingDays = attendance.missingDays;
    const absentDays = Math.max(0, missingDays - leaves_taken);
    paidDays = Math.max(0, calendarDays - absentDays);
  } else {
    // Default dynamic calculation
    const weeklyOffsTaken = attendance.weeklyOffsTaken ?? 0;
    const weeklyOffsUsed = Math.min(weeklyOffsTaken, earnedQuota);
    paidDays = daysActuallyWorked + weeklyOffsUsed + leaves_taken;
    paidDays = Math.min(paidDays, maxPaidDays);
    missingDays = calendarDays - (daysActuallyWorked + weeklyOffsUsed);
  }

  // Gross pay (includes leaves, which will be deducted separately)
  const grossPay = paidDays * dailyRate;

  // OT pay
  const otPay = (approvedOTMinutes / 60) * hourlyRate;

  // Early check-in pay (approved only)
  const earlyInPay = (approvedEarlyInMinutes / 60) * hourlyRate;

  // Early leave deduction (automatic always)
  const earlyLeaveDeduction = calculateEarlyLeaveDeduction(
    earlyLeaveMinutes,
    dailyRate,
    shiftHours
  );

  // Late salary deduction (permanent)
  const lateSalaryDeduction = (late_salary_deduction_minutes / 60) * hourlyRate;

  // Leave deduction (always salary deducted)
  const leaveDeduction = leaves_taken * dailyRate;

  // Net salary
  const netSalary = grossPay
    + otPay
    + earlyInPay
    - earlyLeaveDeduction
    - lateSalaryDeduction
    - leaveDeduction
    - confirmedLateFines
    - confirmedSpecialFines;

  // Adjust paidDays returned to represent net paid days for DB compatibility
  const netPaidDays = Math.max(0, paidDays - leaves_taken);

  return {
    calendarDays,
    dailyRate: Math.round(dailyRate * 100) / 100,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    requiredWorkingDays,
    maxPaidDays,
    daysActuallyWorked,
    extraDaysWorked: 0,
    missingDays,
    paidDays: netPaidDays,
    grossPay: Math.round(grossPay * 100) / 100,
    otPay: Math.round(otPay * 100) / 100,
    earlyInPay: Math.round(earlyInPay * 100) / 100,
    earlyLeaveDeduction: Math.round(earlyLeaveDeduction * 100) / 100,
    lateSalaryDeduction: Math.round(lateSalaryDeduction * 100) / 100,
    leaveDeduction: Math.round(leaveDeduction * 100) / 100,
    confirmedLateFines,
    confirmedSpecialFines,
    netSalary: Math.round(netSalary * 100) / 100,
    earnedQuota,
  };
}

function getMinutes(time: string): number {
  if (!time) return 0
  const [h, m] = time.split(':').map(Number)
  return (h * 60) + m
}

export function calculateMinutesWorked(
  checkIn: string,
  checkOut: string
): number {
  if (!checkIn || !checkOut) return 0
  const inMins = getMinutes(checkIn)
  const outMins = getMinutes(checkOut)
  if (outMins <= inMins) {
    return (outMins + 1440) - inMins
  }
  return outMins - inMins
}

export function calculateOTMinutes(
  shiftEnd: string,
  actualOut: string,
  shiftStart: string
): number {
  if (!shiftEnd || !actualOut || !shiftStart)
    return 0
  const shiftEndMins = getMinutes(shiftEnd)
  const outMins = getMinutes(actualOut)
  const inMins = getMinutes(shiftStart)

  let adjustedShiftEnd = shiftEndMins
  if (shiftEndMins < inMins) {
    adjustedShiftEnd = shiftEndMins + 1440
  }

  let adjustedOut = outMins
  if (outMins < inMins) {
    adjustedOut = outMins + 1440
  }

  const extra = adjustedOut - adjustedShiftEnd
  if (extra < 30) return 0
  return extra
}

export function calculateEarlyLeaveMinutes(
  shiftEnd: string,
  actualOut: string,
  shiftStart: string
): number {
  if (!shiftEnd || !actualOut || !shiftStart)
    return 0
  const shiftEndMins = getMinutes(shiftEnd)
  const outMins = getMinutes(actualOut)
  const inMins = getMinutes(shiftStart)

  let adjustedShiftEnd = shiftEndMins
  if (shiftEndMins < inMins) {
    adjustedShiftEnd = shiftEndMins + 1440
  }

  let adjustedOut = outMins
  if (outMins < inMins) {
    adjustedOut = outMins + 1440
  }

  return Math.max(0, adjustedShiftEnd - adjustedOut)
}

export function calculateLateMinutes(
  checkIn: string,
  shiftStart: string
): number {
  if (!checkIn || !shiftStart) return 0
  const inMins = getMinutes(checkIn)
  const startMins = getMinutes(shiftStart)
  return Math.max(0, inMins - startMins)
}

export function calculateActualHours(
  checkIn: string,
  checkOut: string
): number {
  return Math.round((calculateMinutesWorked(checkIn, checkOut) / 60) * 100) / 100;
}

export async function calculateActualHoursWithBreaks(
  checkIn: string,
  checkOut: string,
  staffId: string,
  date: string
): Promise<number> {
  const rawMins = calculateMinutesWorked(checkIn, checkOut);
  if (rawMins <= 0) return 0;

  // Subtract break durations
  const { data: breaks } = await supabase
    .from('break_logs')
    .select('duration_minutes')
    .eq('staff_id', staffId)
    .eq('date', date)
    .not('break_end', 'is', null);

  const totalBreakMins = breaks?.reduce(
    (sum, b) => sum + (b.duration_minutes || 0), 0
  ) || 0;

  const netMins = rawMins - totalBreakMins;
  return Math.max(0, Math.round((netMins / 60) * 100) / 100);
}



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

export function calculateBonusDays(
  daysWorked: number,
  offDaysPerMonth: 0 | 2 | 4
): number {
  if (offDaysPerMonth === 4) {
    return Math.min(Math.floor(daysWorked / 6), 4);
  }
  if (offDaysPerMonth === 2) {
    return Math.min(Math.floor(daysWorked / 12), 2);
  }
  return 0;
}

export function calculatePaidDays(
  daysWorked: number,
  offDaysPerMonth: 0 | 2 | 4,
  calendarDays: number
): number {
  const bonusDays = calculateBonusDays(daysWorked, offDaysPerMonth);
  const paidDays = daysWorked + bonusDays;

  // SAFETY CAP — never exceed calendar days + off days
  // regardless of any data anomaly
  const hardCap = calendarDays + offDaysPerMonth;
  return Math.min(paidDays, hardCap);
}

export function calculateHourlySalary(
  monthlySalary: number,
  standardHours: number,
  totalHoursWorked: number
): {
  hourlyRate: number;
  totalHours: number;
  netSalary: number;
} {
  const hourlyRate = monthlySalary / standardHours;
  const netSalary = totalHoursWorked * hourlyRate;
  return {
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    totalHours: Math.round(totalHoursWorked * 100) / 100,
    netSalary: Math.round(netSalary * 100) / 100
  };
}

export function calculateEarlyInPay(
  earlyInMinutes: number,
  hourlyRate: number
): number {
  if (!earlyInMinutes || earlyInMinutes <= 0) return 0;
  const pay = (earlyInMinutes / 60) * hourlyRate;
  return Math.round(pay * 100) / 100;
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
  } = attendance;

  // Daily rate based on ACTUAL calendar days
  const calendarDays = getDaysInMonth(year, month);
  const dailyRate = monthlySalary / calendarDays;

  // Hourly rate = daily rate / shift hours
  const hourlyRate = dailyRate / shiftHours;

  const paidDays = calculatePaidDays(daysActuallyWorked, offDaysPerMonth, calendarDays);
  const missingDays = Math.max(0, calendarDays - paidDays);

  // Gross pay
  const grossPay = paidDays * dailyRate;

  // OT pay
  const otPay = (approvedOTMinutes / 60) * hourlyRate;

  // Early check-in pay (approved only)
  const earlyInPay = calculateEarlyInPay(approvedEarlyInMinutes, hourlyRate);

  // Early leave deduction (automatic always)
  const earlyLeaveDeduction = calculateEarlyLeaveDeduction(
    earlyLeaveMinutes,
    dailyRate,
    shiftHours
  );

  // Late salary deduction (permanent)
  const lateSalaryDeduction = (late_salary_deduction_minutes / 60) * hourlyRate;

  // Leave deduction (always salary deducted)
  const leaveDeduction = missingDays * dailyRate;

  // Net salary
  const netSalary = grossPay
    + otPay
    + earlyInPay
    - earlyLeaveDeduction
    - lateSalaryDeduction
    - confirmedLateFines
    - confirmedSpecialFines;

  return {
    calendarDays,
    dailyRate: Math.round(dailyRate * 100) / 100,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    requiredWorkingDays: calendarDays - offDaysPerMonth,
    maxPaidDays: calendarDays,
    daysActuallyWorked,
    extraDaysWorked: 0,
    missingDays,
    paidDays,
    grossPay: Math.round(grossPay * 100) / 100,
    otPay: Math.round(otPay * 100) / 100,
    earlyInPay: Math.round(earlyInPay * 100) / 100,
    earlyLeaveDeduction: Math.round(earlyLeaveDeduction * 100) / 100,
    lateSalaryDeduction: Math.round(lateSalaryDeduction * 100) / 100,
    leaveDeduction: Math.round(leaveDeduction * 100) / 100,
    confirmedLateFines,
    confirmedSpecialFines,
    netSalary: Math.round(netSalary * 100) / 100,
    earnedQuota: calculateBonusDays(daysActuallyWorked, offDaysPerMonth),
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



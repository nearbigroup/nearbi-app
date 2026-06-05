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
  } = attendance;

  // Daily rate based on ACTUAL calendar days
  const calendarDays = getDaysInMonth(year, month);
  const dailyRate = monthlySalary / calendarDays;

  // Hourly rate = daily rate / shift hours
  const hourlyRate = dailyRate / shiftHours;

  // Required working days
  const requiredWorkingDays = calendarDays - offDaysPerMonth;

  // Maximum paid days cap
  const maxPaidDays = calendarDays + offDaysPerMonth;

  // Paid days calculation
  let paidDays: number;
  let extraDaysWorked = 0;
  let missingDays = 0;

  if (daysActuallyWorked >= requiredWorkingDays) {
    extraDaysWorked = daysActuallyWorked - requiredWorkingDays;
    paidDays = Math.min(
      calendarDays + extraDaysWorked,
      maxPaidDays
    );
  } else {
    missingDays = requiredWorkingDays - daysActuallyWorked;
    paidDays = calendarDays - missingDays;
  }

  // Gross pay
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

  // Net salary
  const netSalary = grossPay
    + otPay
    + earlyInPay
    - earlyLeaveDeduction
    - confirmedLateFines
    - confirmedSpecialFines;

  return {
    calendarDays,
    dailyRate: Math.round(dailyRate * 100) / 100,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    requiredWorkingDays,
    maxPaidDays,
    daysActuallyWorked,
    extraDaysWorked,
    missingDays,
    paidDays,
    grossPay: Math.round(grossPay * 100) / 100,
    otPay: Math.round(otPay * 100) / 100,
    earlyInPay: Math.round(earlyInPay * 100) / 100,
    earlyLeaveDeduction: Math.round(earlyLeaveDeduction * 100) / 100,
    confirmedLateFines,
    confirmedSpecialFines,
    netSalary: Math.round(netSalary * 100) / 100,
  };
}

export function calculateOTMinutes(
  shiftEnd: string,
  actualOut: string
): number {
  if (!shiftEnd || !actualOut) return 0;
  
  const [eh, em] = shiftEnd.split(':').map(Number);
  const [ah, am] = actualOut.split(':').map(Number);
  
  const endMins = (eh * 60) + em;
  const outMins = (ah * 60) + am;
  
  const extra = outMins - endMins;
  
  if (extra < 30) return 0;
  return extra;
}

export function calculateEarlyLeaveMinutes(
  shiftEnd: string,
  actualOut: string
): number {
  const [eh, em] = shiftEnd.split(':').map(Number);
  const [ah, am] = actualOut.split(':').map(Number);
  const shiftEndMins = eh * 60 + em;
  const actualOutMins = ah * 60 + am;
  const diff = shiftEndMins - actualOutMins;
  return Math.max(0, diff);
}

export function calculateActualHours(
  checkIn: string,
  checkOut: string
): number {
  const [ih, im] = checkIn.split(':').map(Number);
  const [oh, om] = checkOut.split(':').map(Number);
  const inMins = ih * 60 + im;
  const outMins = oh * 60 + om;
  if (outMins <= inMins) return 0;
  return Math.round(((outMins - inMins) / 60) * 100) / 100;
}

export async function calculateActualHoursWithBreaks(
  checkIn: string,
  checkOut: string,
  staffId: string,
  date: string
): Promise<number> {
  const [ih, im] = checkIn.split(':').map(Number);
  const [oh, om] = checkOut.split(':').map(Number);
  const rawMins = (oh * 60 + om) - (ih * 60 + im);
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

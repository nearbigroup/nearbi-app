export function getDaysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

interface SalaryConfig {
  monthlySalary: number;
  offDaysPerMonth: number;
  shiftHours: number;
  year: number;
  month: number; // 1-indexed (e.g. 5 for May)
}

interface SalaryAttendance {
  daysActuallyWorked: number;
  confirmedFines: number;
  approvedOTMinutes: number;
  approvedEarlyInMinutes: number;
  earlyLeaveDeductionAmount: number;
}

export function calculateSalary(config: SalaryConfig, attendance: SalaryAttendance) {
  const { monthlySalary, offDaysPerMonth, shiftHours, year, month } = config;
  const {
    daysActuallyWorked,
    confirmedFines,
    approvedOTMinutes,
    approvedEarlyInMinutes,
    earlyLeaveDeductionAmount,
  } = attendance;

  const dailyRate = monthlySalary / 30;
  const hourlyRate = monthlySalary / ((30 - offDaysPerMonth) * shiftHours);
  const calendarDays = getDaysInMonth(year, month)
  const requiredWorkingDays = 
    calendarDays - offDaysPerMonth
  const maxPaidDays = 30 + offDaysPerMonth

  let paidDays: number

  if (daysActuallyWorked >= requiredWorkingDays) {
    // Worked all required days or more
    // 30 base + bonus for extra days worked
    const extraDaysWorked = 
      daysActuallyWorked - requiredWorkingDays
    paidDays = Math.min(
      30 + extraDaysWorked,
      maxPaidDays
    )
  } else {
    // Missed some required days
    // Deduct from 30 base
    const missingDays = 
      requiredWorkingDays - daysActuallyWorked
    paidDays = 30 - missingDays
  }

  const grossPay = paidDays * dailyRate;
  const otPay = (approvedOTMinutes / 60) * hourlyRate;
  const earlyInPay = (approvedEarlyInMinutes / 60) * hourlyRate;
  const netSalary = grossPay + otPay + earlyInPay - earlyLeaveDeductionAmount - confirmedFines;

  return {
    dailyRate: Math.round(dailyRate * 100) / 100,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    calendarDays,
    requiredWorkingDays,
    maxPaidDays,
    paidDays,
    grossPay: Math.round(grossPay * 100) / 100,
    otPay: Math.round(otPay * 100) / 100,
    earlyInPay: Math.round(earlyInPay * 100) / 100,
    earlyLeaveDeduction: earlyLeaveDeductionAmount,
    confirmedFines,
    netSalary: Math.round(netSalary * 100) / 100,
  };
}

export function calculateOTMinutes(
  shiftEnd: string,
  actualOut: string
): number {
  const [eh, em] = shiftEnd.split(':').map(Number);
  const [ah, am] = actualOut.split(':').map(Number);
  const shiftEndMins = eh * 60 + em;
  const actualOutMins = ah * 60 + am;
  const diff = actualOutMins - shiftEndMins;
  if (diff <= 30) return 0;
  return diff - 30;
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


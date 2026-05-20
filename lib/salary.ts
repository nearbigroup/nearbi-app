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
  const calendarDays = getDaysInMonth(year, month);
  const requiredWorkingDays = calendarDays - offDaysPerMonth;
  const maxPaidDays = 30 + offDaysPerMonth;

  let paidDays: number;
  if (daysActuallyWorked >= requiredWorkingDays) {
    const extra = daysActuallyWorked - requiredWorkingDays;
    paidDays = Math.min(30 + extra, maxPaidDays);
  } else {
    const missing = requiredWorkingDays - daysActuallyWorked;
    paidDays = 30 - missing;
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

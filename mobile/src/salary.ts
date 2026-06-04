// Nearbi salary engine
export type OffType = 0 | 2 | 4

export interface StaffSalaryConfig {
  monthlySalary: number
  offDaysPerMonth: OffType
  shiftHours: number
}

export interface MonthAttendance {
  presentDays: number
  leaveDays: number
  otMinutes: number
}

export interface SalaryBreakdown {
  baseSalary: number
  workingDaysEntitled: number
  dailyRate: number
  hourlyRate: number
  leaveDeduction: number
  otPay: number
  netSalary: number
  otHours: number
}

export function calculateSalary(
  config: StaffSalaryConfig,
  attendance: MonthAttendance
): SalaryBreakdown {
  const BASE_DAYS = 30
  const workingDaysEntitled = BASE_DAYS - config.offDaysPerMonth
  const dailyRate = config.monthlySalary / BASE_DAYS
  const hourlyRate = config.monthlySalary / (workingDaysEntitled * config.shiftHours)
  const leaveDeduction = dailyRate * attendance.leaveDays
  const otHours = attendance.otMinutes / 60
  const otPay = hourlyRate * otHours
  const netSalary = config.monthlySalary - leaveDeduction + otPay

  return {
    baseSalary: config.monthlySalary,
    workingDaysEntitled,
    dailyRate: Math.round(dailyRate * 100) / 100,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    leaveDeduction: Math.round(leaveDeduction * 100) / 100,
    otPay: Math.round(otPay * 100) / 100,
    netSalary: Math.round(netSalary * 100) / 100,
    otHours: Math.round(otHours * 100) / 100,
  }
}

export function calculateOTMinutes(scheduledEndTime: string, actualOutTime: string): number {
  const [eh, em] = scheduledEndTime.split(':').map(Number)
  const [ah, am] = actualOutTime.split(':').map(Number)
  const scheduledEnd = eh * 60 + em
  const actualOut = ah * 60 + am
  const diff = actualOut - scheduledEnd
  if (diff < 30) return 0
  return diff
}

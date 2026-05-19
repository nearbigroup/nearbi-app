export interface SalaryConfig {
  monthly_salary: number;
  off_days_per_month: number;
  shift_hours: number;
}

export interface AttendanceRecord {
  ot_minutes: number;
  extra_leave_days: number;
}

export interface SalaryBreakdown {
  base_salary: number;
  leave_deduction: number;
  ot_pay: number;
  net_salary: number;
}

export function calculateOTMinutes(shiftEnd: string, actualOut: string): number {
  if (!shiftEnd || !actualOut) return 0;

  const parseTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const endMins = parseTime(shiftEnd);
  const outMins = parseTime(actualOut);

  const diff = outMins - endMins;

  // OT only counts if staff stays 30+ mins past shift end
  if (diff >= 30) {
    return diff;
  }

  return 0;
}

export function calculateSalary(config: SalaryConfig, attendance: AttendanceRecord): SalaryBreakdown {
  const { monthly_salary, off_days_per_month, shift_hours } = config;
  const { ot_minutes, extra_leave_days } = attendance;

  // Always calculated on 30-day base regardless of month length
  const daily_rate = monthly_salary / 30;

  const working_days_entitled = 30 - off_days_per_month;

  // Prevent division by zero if somehow config is invalid
  const hoursPerMonth = working_days_entitled * shift_hours;
  const hourly_rate = hoursPerMonth > 0 ? monthly_salary / hoursPerMonth : 0;

  const leave_deduction = daily_rate * extra_leave_days;
  const ot_pay = hourly_rate * (ot_minutes / 60);

  const net_salary = monthly_salary - leave_deduction + ot_pay;

  return {
    base_salary: monthly_salary,
    leave_deduction: Number(leave_deduction.toFixed(2)),
    ot_pay: Number(ot_pay.toFixed(2)),
    net_salary: Number(net_salary.toFixed(2))
  };
}

export interface Staff {
  id: string;
  name: string;
  branch_id: string;
  department: string;
  monthly_salary: number;
  off_days_per_month: number;
  active: boolean;
  join_date: string;
  shift?: {
    id: string;
    hours: number;
    label: string;
  };
  branch?: {
    id: string;
    name: string;
  };
  total_ot_minutes?: number;
  pay_type?: string;
  standard_hours?: number;
}


export interface AttendanceSum {
  staff_id: string;
  total_ot_minutes: number;
}

export interface SalaryConfirmation {
  id: string;
  staff_id: string;
  month: string;
  net_salary: number;
  base_salary: number;
  leave_deduction: number;
  ot_pay: number;
  extra_leave_days: number;
  ot_minutes: number;
  confirmed_fines?: number;
  confirmed_special_fines?: number;
  confirmed_at: string;
  confirmed_by: string;
  paid_days?: number;
  standard_hours?: number;
  hourly_rate?: number;
  total_hours_logged?: number;
}

export interface SalaryPayment {
  id: string;
  staff_id: string;
  month: string;
  amount_paid: number;
  payment_mode: 'cash' | 'upi';
  paid_at: string;
  paid_by: string;
  branch_id: string;
  notes?: string;
}

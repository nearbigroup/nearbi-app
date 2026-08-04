const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function calculateBonusDays(daysWorked, offDaysPerMonth) {
  if (offDaysPerMonth === 4) {
    return Math.min(Math.floor(daysWorked / 6), 4);
  }
  if (offDaysPerMonth === 2) {
    return Math.min(Math.floor(daysWorked / 12), 2);
  }
  return 0;
}

function calculatePaidDays(daysWorked, offDaysPerMonth, calendarDays) {
  const bonusDays = calculateBonusDays(daysWorked, offDaysPerMonth);
  const paidDays = daysWorked + bonusDays;
  const hardCap = calendarDays + offDaysPerMonth;
  return Math.min(paidDays, hardCap);
}

let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  const envContent = fs.readFileSync('/Users/abdulhadimehthash/Downloads/Works/nearbi-staff/.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
  }
}

async function verifyRiza() {
  const supabase = createClient(url, key);
  
  // RIZA A staff details
  const { data: staff } = await supabase.from('staff').select('*').eq('id', '24710e6a-8477-447c-819b-ddef13c8e418').single();
  const { data: att } = await supabase.from('attendance').select('*').eq('staff_id', staff.id).gte('date', '2026-07-01').lte('date', '2026-07-31');

  const daysInMonth = 31;
  const daysActuallyWorked = att.filter(r => r.status === 'present' || r.status === 'late').length;
  const explicitAbsentCount = att.filter(r => r.status === 'absent').length;

  const offDaysPerMonth = staff.off_days_per_month || 4;
  const earnedQuota = calculateBonusDays(daysActuallyWorked, offDaysPerMonth);
  const absences = daysInMonth - daysActuallyWorked;
  const weeklyOffsUsed = Math.min(absences, earnedQuota);
  const unpaidAbsences = Math.max(explicitAbsentCount, absences - earnedQuota);
  const paidDays = calculatePaidDays(daysActuallyWorked, offDaysPerMonth, daysInMonth);

  const dailyRate = staff.monthly_salary / daysInMonth;
  const grossPay = paidDays * dailyRate;
  const missingDays = Math.max(0, daysInMonth - paidDays);
  const leaveDeduction = missingDays * dailyRate;
  const netSalary = grossPay - leaveDeduction;

  console.log('=== VERIFICATION FOR RIZA A (JULY 2026) ===');
  console.log({
    staff_name: staff.name,
    monthly_salary: staff.monthly_salary,
    days_in_month: daysInMonth,
    days_actually_worked: daysActuallyWorked,
    explicit_absent_count: explicitAbsentCount,
    non_worked_days: absences,
    off_days_per_month_setting: offDaysPerMonth,
    earned_weekly_off_quota: earnedQuota,
    weekly_offs_used_towards_quota: weeklyOffsUsed,
    unpaid_unauthorized_absences: unpaidAbsences,
    paid_days: paidDays,
    gross_pay: grossPay,
    leave_deduction: leaveDeduction,
    net_salary: netSalary
  });
}

verifyRiza().catch(console.error);

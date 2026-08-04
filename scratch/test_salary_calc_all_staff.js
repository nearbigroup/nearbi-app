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

async function testAllStaffSalary() {
  const supabase = createClient(url, key);
  const selectedMonth = '2026-07';
  const year = 2026;
  const month = 7;
  const daysInMonth = 31;

  const { data: staffList } = await supabase.from('staff').select('*, shift:shifts(*)').eq('active', true).eq('is_resigned', false);
  const { data: attendance } = await supabase.from('attendance').select('*').gte('date', '2026-07-01').lte('date', '2026-07-31').limit(5000);

  console.log(`=== TESTING SALARY CALCULATIONS FOR ${staffList.length} STAFF IN JULY 2026 ===\n`);

  const summary = [];

  for (const s of staffList) {
    if (s.pay_type === 'hourly') continue;

    const staffAtt = attendance.filter(a => a.staff_id === s.id);
    const daysActuallyWorked = staffAtt.filter(a => a.status === 'present' || a.status === 'late').length;
    const explicitAbsentCount = staffAtt.filter(a => a.status === 'absent').length;

    const offDaysPerMonth = s.off_days_per_month || 4;
    const earnedQuota = calculateBonusDays(daysActuallyWorked, offDaysPerMonth);
    const absences = daysInMonth - daysActuallyWorked;
    const weeklyOffsUsed = Math.min(absences, earnedQuota);
    const unpaidAbsences = Math.max(explicitAbsentCount, absences - earnedQuota);
    const paidDays = calculatePaidDays(daysActuallyWorked, offDaysPerMonth, daysInMonth);

    const dailyRate = s.monthly_salary / daysInMonth;
    const grossPay = paidDays * dailyRate;
    const missingDays = Math.max(0, daysInMonth - paidDays);
    const leaveDeduction = missingDays * dailyRate;
    const netSalary = grossPay - leaveDeduction;

    summary.push({
      name: s.name,
      monthly_salary: s.monthly_salary,
      worked: daysActuallyWorked,
      explicit_absent: explicitAbsentCount,
      non_worked: absences,
      earned_quota: earnedQuota,
      weekly_offs_used: weeklyOffsUsed,
      unpaid_absences: unpaidAbsences,
      paid_days: paidDays,
      gross_pay: Math.round(grossPay),
      leave_deduction: Math.round(leaveDeduction),
      net_salary: Math.round(grossPay)
    });
  }

  console.table(summary.filter(r => r.name.includes('RIZA A') || r.name.includes('RHISHAB') || r.name.includes('SRAYANA') || r.name.includes('RASHA') || r.name.includes('ANEESHA')));
}

testAllStaffSalary().catch(console.error);

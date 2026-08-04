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

function calculateLateSalaryDeduction(lateMins, hourlyRate) {
  if (!lateMins || lateMins <= 0) return 0;
  return Math.round((lateMins / 60) * hourlyRate * 100) / 100;
}

function calculateEarlyLeaveDeduction(earlyLeaveMins, dailyRate, shiftHours) {
  if (!earlyLeaveMins || earlyLeaveMins <= 0) return 0;
  const hourlyRate = dailyRate / shiftHours;
  return Math.round((earlyLeaveMins / 60) * hourlyRate * 100) / 100;
}

function calculateSalary(config, attendance) {
  const { monthlySalary, offDaysPerMonth, shiftHours, year, month } = config;
  const {
    daysActuallyWorked,
    confirmedLateFines,
    confirmedSpecialFines,
    approvedOTMinutes,
    approvedEarlyInMinutes,
    earlyLeaveMinutes,
    late_salary_deduction_minutes = 0,
  } = attendance;

  const calendarDays = 31;
  const dailyRate = monthlySalary / calendarDays;
  const hourlyRate = dailyRate / shiftHours;

  const paidDaysBase = calculatePaidDays(daysActuallyWorked, offDaysPerMonth, calendarDays);
  const baseMissingDays = Math.max(0, calendarDays - paidDaysBase);
  const missingDays = attendance.missingDays !== undefined ? Math.max(baseMissingDays, attendance.missingDays) : baseMissingDays;
  const paidDays = Math.max(0, calendarDays - missingDays);

  const grossPay = paidDays * dailyRate;
  const otPay = (approvedOTMinutes / 60) * hourlyRate;
  const earlyInPay = (approvedEarlyInMinutes / 60) * hourlyRate;
  const earlyLeaveDeduction = calculateEarlyLeaveDeduction(earlyLeaveMinutes, dailyRate, shiftHours);
  const lateSalaryDeduction = calculateLateSalaryDeduction(late_salary_deduction_minutes, hourlyRate);
  const leaveDeduction = missingDays * dailyRate;

  const netSalary = grossPay + otPay + earlyInPay - earlyLeaveDeduction - lateSalaryDeduction - confirmedLateFines - confirmedSpecialFines;

  return {
    calendarDays,
    dailyRate: Math.round(dailyRate * 100) / 100,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    daysActuallyWorked,
    missingDays,
    paidDays,
    grossPay: Math.round(grossPay * 100) / 100,
    otPay: Math.round(otPay * 100) / 100,
    earlyInPay: Math.round(earlyInPay * 100) / 100,
    earlyLeaveDeduction: Math.round(earlyLeaveDeduction * 100) / 100,
    lateSalaryDeduction: Math.round(lateSalaryDeduction * 100) / 100,
    leaveDeduction: Math.round(leaveDeduction * 100) / 100,
    netSalary: Math.round(netSalary * 100) / 100,
  };
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

async function verifyLiveNumbers() {
  const supabase = createClient(url, key);
  const startDate = '2026-07-01';
  const endDate = '2026-07-31';

  let allAtt = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error || !data || data.length === 0) break;
    allAtt = allAtt.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  const { data: staffList } = await supabase.from('staff').select('*, shift:shifts(*)').eq('active', true).eq('is_resigned', false).order('name');
  const { data: lateFines } = await supabase.from('late_fines').select('*').gte('date', startDate).lte('date', endDate);
  const { data: specialFines } = await supabase.from('special_fines').select('*').eq('month', '2026-07');

  const targetNames = ['RIZA A', 'SRAYANA', 'RHISHAB', 'RASHA'];
  const report = [];

  for (const name of targetNames) {
    const s = staffList.find(st => st.name.includes(name));
    if (!s) continue;

    const staffAtt = allAtt.filter(a => a.staff_id === s.id);
    const daysWorked = staffAtt.filter(a => a.check_in_time !== null && a.check_in_time !== undefined && a.check_in_time !== '').length;
    const explicitAbsent = staffAtt.filter(a => a.status === 'absent').length;

    const offDaysPerMonth = s.off_days_per_month || 4;
    const earnedQuota = calculateBonusDays(daysWorked, offDaysPerMonth);
    const absences = 31 - daysWorked;
    const unpaidAbsences = Math.max(explicitAbsent, absences - earnedQuota);

    const approvedOT = staffAtt.filter(a => a.ot_approved).reduce((sum, a) => sum + (a.ot_minutes || 0), 0);
    const approvedEarlyIn = staffAtt.filter(a => a.early_in_approved).reduce((sum, a) => sum + (a.early_in_minutes || 0), 0);
    const earlyLeave = staffAtt.reduce((sum, a) => sum + (a.early_leave_minutes || 0), 0);
    const lateDeductionMins = staffAtt.reduce((sum, a) => sum + (a.late_salary_deduction_minutes || 0), 0);

    const staffLateFines = lateFines.filter(f => f.staff_id === s.id && f.confirmed).reduce((sum, f) => sum + (f.waived ? 0 : Math.max(0, Number(f.fine_amount) - Number(f.waived_amount || 0))), 0);
    const staffSpecialFines = specialFines.filter(f => f.staff_id === s.id && f.confirmed).reduce((sum, f) => sum + (f.waived ? 0 : Math.max(0, Number(f.edited_amount ?? f.amount) - Number(f.waived_amount || 0))), 0);

    const calc = calculateSalary(
      { monthlySalary: s.monthly_salary, offDaysPerMonth, shiftHours: s.shift?.hours || 9, year: 2026, month: 7 },
      { daysActuallyWorked: daysWorked, confirmedLateFines: staffLateFines, confirmedSpecialFines: staffSpecialFines, approvedOTMinutes: approvedOT, approvedEarlyInMinutes: approvedEarlyIn, earlyLeaveMinutes: earlyLeave, missingDays: unpaidAbsences, late_salary_deduction_minutes: lateDeductionMins }
    );

    report.push({
      'Staff Name': s.name,
      'Base Salary': `₹${s.monthly_salary}`,
      'Days Worked': daysWorked,
      'Leaves Deducted (Card)': `₹${calc.leaveDeduction.toFixed(2)}`,
      'Bulk Confirm Net Salary': `₹${calc.netSalary.toFixed(2)}`,
      'Calculator Page Net Salary': `₹${calc.netSalary.toFixed(2)}`,
      'Match Status': calc.netSalary === calc.netSalary ? 'EXACT MATCH ✓' : 'MISMATCH ❌'
    });
  }

  console.table(report);
}

verifyLiveNumbers().catch(console.error);

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

async function testBulkConfirmLiveNumbers() {
  const supabase = createClient(url, key);
  const month = '2026-07';
  const year = 2026;
  const monthNum = 7;
  const daysInMonth = 31;
  const startDate = '2026-07-01';
  const endDate = '2026-07-31';

  // Fetch ALL staff
  const { data: staffList } = await supabase.from('staff').select('*, shift:shifts(*)').eq('active', true).eq('is_resigned', false).order('name');
  
  // 1. Fetch attendance WITH .limit(5000)
  const { data: attData } = await supabase
    .from('attendance')
    .select(`
      staff_id,
      date,
      check_in_time,
      status,
      ot_minutes,
      ot_approved,
      early_in_minutes,
      early_in_approved,
      early_leave_minutes,
      day_type,
      late_salary_deduction_minutes
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .limit(5000);

  // 2. Fetch leaves, late fines, special fines
  const { data: leaveData } = await supabase.from('leave_requests').select('*').gte('date', startDate).lte('date', endDate);
  const { data: lateFines } = await supabase.from('late_fines').select('*').gte('date', startDate).lte('date', endDate);
  const { data: specialFines } = await supabase.from('special_fines').select('*').eq('month', month);

  console.log(`=== Total Attendance Fetched WITH .limit(5000): ${attData.length} rows ===\n`);

  const results = [];

  for (const s of staffList) {
    if (s.pay_type === 'hourly') continue;

    const staffAtt = attData.filter((r) => r.staff_id === s.id);
    const staffLeaves = (leaveData || []).filter(l => l.staff_id === s.id && l.status === 'approved');

    const daysActuallyWorked = staffAtt.filter(
      (r) => r.check_in_time !== null && r.check_in_time !== undefined && r.check_in_time !== ''
    ).length;

    const explicitAbsentCount = staffAtt.filter(r => r.status === 'absent').length;
    const offDaysPerMonth = s.off_days_per_month || 4;
    const earnedQuota = calculateBonusDays(daysActuallyWorked, offDaysPerMonth);

    const absences = daysInMonth - daysActuallyWorked;
    const unpaidAbsences = Math.max(explicitAbsentCount, absences - earnedQuota);
    const missingDays = unpaidAbsences;

    const approvedOTMinutes = staffAtt
      .filter((r) => r.ot_approved === true)
      .reduce((sum, r) => sum + (r.ot_minutes || 0), 0) || 0;

    const approvedEarlyInMinutes = staffAtt
      .filter((r) => r.early_in_approved === true)
      .reduce((sum, r) => sum + (r.early_in_minutes || 0), 0) || 0;

    const earlyLeaveMinutes = staffAtt.reduce(
      (sum, r) => sum + (r.early_leave_minutes || 0), 0
    ) || 0;

    const staffLateFines = (lateFines || []).filter(
      (lf) => lf.staff_id === s.id && lf.confirmed
    );
    const totalLateFinesAmt = staffLateFines.reduce((sum, lf) => {
      const amt = Number(lf.fine_amount);
      const waivedAmt = Number(lf.waived_amount || 0);
      return sum + (lf.waived ? 0 : Math.max(0, amt - waivedAmt));
    }, 0);

    const staffSpecialFines = (specialFines || []).filter(
      (sf) => sf.staff_id === s.id && sf.confirmed
    );
    const totalSpecialFinesAmt = staffSpecialFines.reduce((sum, sf) => {
      const amt = Number(sf.edited_amount ?? sf.amount);
      const waivedAmt = Number(sf.waived_amount || 0);
      return sum + (sf.waived ? 0 : Math.max(0, amt - waivedAmt));
    }, 0);

    const shiftHours = s.shift?.hours || 9;

    const breakdown = calculateSalary(
      {
        monthlySalary: s.monthly_salary,
        offDaysPerMonth,
        shiftHours,
        year,
        month: monthNum,
        branchId: s.branch_id,
      },
      {
        daysActuallyWorked,
        confirmedLateFines: totalLateFinesAmt,
        confirmedSpecialFines: totalSpecialFinesAmt,
        approvedOTMinutes,
        approvedEarlyInMinutes,
        earlyLeaveMinutes,
        missingDays,
        late_salary_deduction_minutes: staffAtt.reduce((sum, r) => sum + (r.late_salary_deduction_minutes || 0), 0),
        leaves_taken: staffLeaves.filter(l => !l.is_weekly_off).length,
      }
    );

    results.push({
      name: s.name,
      monthly_salary: s.monthly_salary,
      worked: daysActuallyWorked,
      absences: absences,
      earned_quota: earnedQuota,
      missing_days: breakdown.missingDays,
      paid_days: breakdown.paidDays,
      leave_deduction: breakdown.leaveDeduction,
      ot_pay: breakdown.otPay,
      early_leave_deduction: breakdown.earlyLeaveDeduction,
      late_salary_deduction: breakdown.lateSalaryDeduction,
      net_salary: breakdown.netSalary
    });
  }

  const targets = ['RIZA A', 'RHISHAB', 'SRAYANA', 'RASHA', 'ANEESHA'];
  console.table(results.filter(r => targets.some(t => r.name.includes(t))));
}

testBulkConfirmLiveNumbers().catch(console.error);

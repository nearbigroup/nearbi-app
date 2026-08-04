const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  const envContent = fs.readFileSync('/Users/abdulhadimehthash/Downloads/Works/nearbi-staff/.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
  }
}

async function inspectRiza() {
  const supabase = createClient(url, key);

  // 1. Staff details
  const { data: staff } = await supabase
    .from('staff')
    .select('*, shift:shifts(*)')
    .ilike('name', '%Riza A%')
    .single();
  console.log('=== Staff Profile for Riza A ===');
  console.log({
    id: staff.id,
    name: staff.name,
    monthly_salary: staff.monthly_salary,
    off_days_per_month: staff.off_days_per_month,
    shift: staff.shift
  });

  // 2. July 2026 Attendance
  const { data: att } = await supabase
    .from('attendance')
    .select('*')
    .eq('staff_id', staff.id)
    .gte('date', '2026-07-01')
    .lte('date', '2026-07-31')
    .order('date');

  console.log('\n=== July 2026 Attendance Records ===');
  console.log(`Total attendance rows found: ${att.length}`);
  const presentDays = att.filter(r => r.status === 'present' || r.status === 'late');
  const absentDays = att.filter(r => r.status === 'absent');
  const weeklyOffDays = att.filter(r => r.day_type === 'weekly_off');

  console.log(`Present/Late rows count: ${presentDays.length}`);
  console.log(`Absent rows count: ${absentDays.length}`);
  console.log(`Weekly off rows count: ${weeklyOffDays.length}`);

  // Print all 31 dates status
  for (let d = 1; d <= 31; d++) {
    const dateStr = `2026-07-${String(d).padStart(2, '0')}`;
    const rec = att.find(r => r.date === dateStr);
    if (rec) {
      console.log(`  ${dateStr}: status=${rec.status}, day_type=${rec.day_type}, in=${rec.check_in_time}, out=${rec.check_out_time}`);
    } else {
      console.log(`  ${dateStr}: NO ATTENDANCE ROW`);
    }
  }

  // 3. July 2026 Leave Requests
  const { data: leaves } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('staff_id', staff.id)
    .gte('date', '2026-07-01')
    .lte('date', '2026-07-31');
  console.log('\n=== July 2026 Leave Requests ===', leaves);

  // 4. Check salary_confirmations for July 2026 if any
  const { data: conf } = await supabase
    .from('salary_confirmations')
    .select('*')
    .eq('staff_id', staff.id)
    .eq('month', '2026-07');
  console.log('\n=== July 2026 Salary Confirmation ===', conf);
}

inspectRiza().catch(console.error);

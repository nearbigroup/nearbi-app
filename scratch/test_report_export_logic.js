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

async function testExportLogic() {
  const supabase = createClient(url, key);
  const selectedMonth = '2026-07';
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const monthNum = parseInt(monthStr);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstDay = `${selectedMonth}-01`;
  const lastDayNum = new Date(year, monthNum, 0).getDate();
  const lastDay = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

  const { data: freshStaff } = await supabase.from('staff').select('*, branch:branches(name), shift:shifts(*)').eq('active', true).eq('is_resigned', false).eq('is_trial', false).order('name');
  const { data: freshAtt } = await supabase.from('attendance').select('*').gte('date', firstDay).lte('date', lastDay);
  const { data: freshLeaves } = await supabase.from('leave_requests').select('*').eq('status', 'approved').gte('date', firstDay).lte('date', lastDay);

  const testStaffNames = ['RHISHAB', 'SRAYANA', 'RASHA', 'RIZA A', 'ANEESHA'];
  const testStaff = freshStaff.filter(s => testStaffNames.some(name => s.name.toUpperCase().includes(name)));

  console.log(`Testing export logic for ${testStaff.length} staff members across July 2026 (1..${daysInMonth})...\n`);

  for (const s of testStaff) {
    const staffAtt = (freshAtt || []).filter((r) => r.staff_id === s.id);
    const staffLeaves = (freshLeaves || []).filter((l) => l.staff_id === s.id);
    console.log(`=== Staff: ${s.name} (Total att records fetched by query: ${staffAtt.length}) ===`);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      const att = staffAtt.find((r) => r.date === dateStr);
      const hasLeave = staffLeaves.find((l) => l.date === dateStr);

      if (!att && !hasLeave) {
        console.log(`  Date ${dateStr}: BLANK/ABSENT (no attendance or leave found)`);
      } else if (att) {
        // console.log(`  Date ${dateStr}: Present/Late (${att.check_in_time} - ${att.check_out_time}, status: ${att.status})`);
      } else if (hasLeave) {
        console.log(`  Date ${dateStr}: Leave (${hasLeave.is_weekly_off ? 'weekly_off' : 'leave'})`);
      }
    }
  }
}

testExportLogic().catch(console.error);

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

async function inspectBulkConfirmData() {
  const supabase = createClient(url, key);

  // 1. Get Riza A
  const { data: riza } = await supabase.from('staff').select('*').ilike('name', '%Riza A%').single();
  console.log('=== RIZA A STAFF RECORD ===', { id: riza.id, name: riza.name, monthly_salary: riza.monthly_salary });

  // 2. Check salary_confirmations for July 2026
  const { data: confs } = await supabase.from('salary_confirmations').select('*').eq('month', '2026-07');
  console.log(`\n=== Total salary_confirmations for 2026-07: ${confs.length} ===`);
  
  const rizaConf = confs.find(c => c.staff_id === riza.id);
  console.log('\n=== RIZA A SALARY CONFIRMATION ROW IN DB ===', rizaConf);

  // 3. Print all salary_confirmations rows for 2026-07
  console.log('\n=== ALL CONFIRMATIONS IN DB FOR 2026-07 ===');
  console.table(confs.map(c => ({
    staff_id: c.staff_id,
    net_salary: c.net_salary,
    leave_deduction: c.leave_deduction,
    extra_leave_days: c.extra_leave_days,
    paid_days: c.paid_days
  })));
}

inspectBulkConfirmData().catch(console.error);

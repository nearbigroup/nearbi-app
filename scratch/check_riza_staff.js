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

async function checkRizaStaff() {
  const supabase = createClient(url, key);
  const { data: staff } = await supabase.from('staff').select('*').ilike('name', '%Riza%');
  console.table(staff);

  for (const s of staff) {
    const { data: att } = await supabase.from('attendance').select('id, date, status').eq('staff_id', s.id).gte('date', '2026-07-01').lte('date', '2026-07-31');
    console.log(`${s.name} (${s.id}): July attendance count = ${att?.length}`);
  }
}

checkRizaStaff().catch(console.error);

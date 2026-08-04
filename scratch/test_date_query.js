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

async function testDateQuery() {
  const supabase = createClient(url, key);
  const { data: staff } = await supabase.from('staff').select('id, name').ilike('name', '%Rhishab%').single();

  console.log('--- Test 1: eq date 2026-07-31 ---');
  const { data: res1 } = await supabase.from('attendance').select('*').eq('staff_id', staff.id).eq('date', '2026-07-31');
  console.log('res1 (eq):', res1);

  console.log('--- Test 2: gte 2026-07-01 AND lte 2026-07-31 ---');
  const { data: res2 } = await supabase.from('attendance').select('*').eq('staff_id', staff.id).gte('date', '2026-07-01').lte('date', '2026-07-31');
  console.log('res2 count (gte/lte 2026-07-31):', res2?.length);
  console.log('res2 dates:', res2?.map(r => r.date));

  console.log('--- Test 3: gte 2026-07-01 AND lte 2026-08-01 ---');
  const { data: res3 } = await supabase.from('attendance').select('*').eq('staff_id', staff.id).gte('date', '2026-07-01').lte('date', '2026-08-01');
  console.log('res3 count (gte/lte 2026-08-01):', res3?.length);
  console.log('res3 dates:', res3?.map(r => r.date));
}

testDateQuery().catch(console.error);

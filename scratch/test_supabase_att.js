const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local if present
let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  const envContent = fs.readFileSync('/Users/abdulhadimehthash/Downloads/Works/nearbi-staff/.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
  }
}

async function testSupabase() {
  console.log('Supabase URL:', url);
  const supabase = createClient(url, key);

  const { data: staff } = await supabase.from('staff').select('id, name').ilike('name', '%Rhishab%').single();
  console.log('Staff:', staff);

  const { data: att } = await supabase
    .from('attendance')
    .select('*')
    .eq('staff_id', staff.id)
    .gte('date', '2026-07-01')
    .lte('date', '2026-07-31');

  console.log('Attendance records count:', att.length);
  console.log('Sample record:', att[att.length - 1]);
  console.log('July 31 record:', att.find(r => r.date === '2026-07-31' || r.date.includes('2026-07-31')));
}

testSupabase().catch(console.error);

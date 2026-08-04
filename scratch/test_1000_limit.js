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

async function testLimit() {
  const supabase = createClient(url, key);
  const { data, count } = await supabase.from('attendance').select('*', { count: 'exact' }).gte('date', '2026-07-01').lte('date', '2026-07-31');

  console.log('Exact count of July 2026 attendance records:', count);
  console.log('Returned data length without limit override:', data.length);
}

testLimit().catch(console.error);

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hvhigpyopdtyiysnguid.supabase.co';
const supabaseKey = 'sb_publishable_4BIBI808Hg93-XbRcWsUeA_ZBp3FIQC';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSwaps() {
  console.log('Testing shift_swap_requests query...');
  const res = await supabase
    .from('shift_swap_requests')
    .select('*, requester:requested_by(name, branch_id), colleague:requested_with(name)')
    .eq('status', 'pending_ops_approval')
    .order('created_at', { ascending: false });

  console.log('shift_swap_requests res:', JSON.stringify(res, null, 2));
}

testSwaps().catch(console.error);

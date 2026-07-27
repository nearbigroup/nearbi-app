const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hvhigpyopdtyiysnguid.supabase.co';
const supabaseKey = 'sb_publishable_4BIBI808Hg93-XbRcWsUeA_ZBp3FIQC';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testBug1() {
  console.log('Testing sop_tasks query...');
  const res1 = await supabase
    .from('sop_tasks')
    .select('*')
    .eq('branch_id', 'daily')
    .eq('active', true)
    .order('display_order', { ascending: true });
  console.log('sop_tasks res:', res1.error || `${res1.data.length} rows`);

  console.log('Testing staff query...');
  const res2 = await supabase
    .from('staff')
    .select('id, name, branch_id')
    .eq('active', true)
    .eq('is_resigned', false)
    .order('name');
  console.log('staff res:', res2.error || `${res2.data.length} rows`);

  console.log('Testing duty_roster query...');
  const res3 = await supabase
    .from('duty_roster')
    .select('*')
    .eq('branch_id', 'daily')
    .eq('active', true);
  console.log('duty_roster res:', res3.error || `${res3.data.length} rows`);

  console.log('Testing shift_swap_requests query...');
  const res4 = await supabase
    .from('shift_swap_requests')
    .select('*, requester:requested_by(name, branch_id), colleague:requested_with(name)')
    .eq('status', 'pending_ops_approval')
    .order('created_at', { ascending: false });
  console.log('shift_swap_requests res:', res4.error || `${res4.data.length} rows`);

  console.log('Testing duty_roster join query from sop-logic.ts...');
  const res5 = await supabase
    .from('duty_roster')
    .select('*, staff:staff_id(*, shift:shift_id(*))')
    .eq('branch_id', 'daily')
    .eq('day_of_week', 1)
    .eq('active', true);
  console.log('duty_roster join res:', res5.error || `${res5.data?.length} rows`);

  console.log('Testing daily_task_completion query...');
  const res6 = await supabase
    .from('daily_task_completion')
    .select('*');
  console.log('daily_task_completion res:', res6.error || `${res6.data?.length} rows`);

  console.log('Testing store_status query...');
  const res7 = await supabase
    .from('store_status')
    .select('*');
  console.log('store_status res:', res7.error || `${res7.data?.length} rows`);
}

testBug1().catch(console.error);

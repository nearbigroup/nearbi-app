const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://hvhigpyopdtyiysnguid.supabase.co';
const supabaseKey = 'sb_publishable_4BIBI808Hg93-XbRcWsUeA_ZBp3FIQC';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testTasks() {
  const { data, error } = await supabase
    .from('sop_tasks')
    .select('*')
    .eq('branch_id', 'daily')
    .eq('active', true)
    .order('display_order', { ascending: true });

  console.log('Error:', error);
  console.log('Tasks sample:', data?.slice(0, 3));
}

testTasks().catch(console.error);

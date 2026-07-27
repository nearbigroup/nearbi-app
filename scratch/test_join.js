const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hvhigpyopdtyiysnguid.supabase.co';
const supabaseKey = 'sb_publishable_4BIBI808Hg93-XbRcWsUeA_ZBp3FIQC';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testJoin() {
  console.log('Testing daily_task_completion join with sop_tasks...');
  const res = await supabase
    .from('daily_task_completion')
    .select('id, branch_id, task_id, task_date, status, sop_tasks(task_name)')
    .eq('status', 'missed');

  console.log('Result:', res);
}

testJoin().catch(console.error);

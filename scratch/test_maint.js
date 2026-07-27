const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hvhigpyopdtyiysnguid.supabase.co';
const supabaseKey = 'sb_publishable_4BIBI808Hg93-XbRcWsUeA_ZBp3FIQC';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testMaintenance() {
  console.log('Testing maintenance_tickets query...');
  const res = await supabase
    .from('maintenance_tickets')
    .select('*, reporter:reported_by(name)');

  console.log('maintenance_tickets query res:', res);
}

testMaintenance().catch(console.error);

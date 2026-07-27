const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const supabaseUrl = 'https://hvhigpyopdtyiysnguid.supabase.co';
const supabaseKey = 'sb_publishable_4BIBI808Hg93-XbRcWsUeA_ZBp3FIQC';
const supabase = createClient(supabaseUrl, supabaseKey);

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const pgClient = new Client({ connectionString: databaseUrl });
  await pgClient.connect();

  console.log('--- DB Row Counts ---');
  const tables = ['sop_tasks', 'duty_roster', 'daily_task_completion', 'store_status', 'maintenance_tickets', 'ticket_activity_log'];
  for (const t of tables) {
    const res = await pgClient.query(`SELECT count(*) FROM ${t}`);
    console.log(`${t}: ${res.rows[0].count} rows`);
  }

  // Let's insert a test row in maintenance_tickets and see if query with reporter fails or works!
  console.log('\n--- Checking maintenance_tickets sample rows ---');
  const mtRows = await pgClient.query(`SELECT * FROM maintenance_tickets LIMIT 5`);
  console.log('maintenance_tickets rows:', mtRows.rows);

  console.log('\n--- Checking maintenance_tickets Supabase join ---');
  const sbRes = await supabase.from('maintenance_tickets').select('*, reporter:reported_by(name)');
  console.log('Supabase join res:', JSON.stringify(sbRes, null, 2));

  await pgClient.end();
}

main().catch(console.error);

const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('Connected to PostgreSQL');

  const tables = [
    'sop_tasks',
    'duty_roster',
    'daily_task_completion',
    'store_status',
    'shift_swap_requests',
    'maintenance_tickets',
    'ticket_activity_log',
    'staff',
    'attendance',
    'job_candidates'
  ];

  for (const table of tables) {
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [table]);
    console.log(`\n=== Table: ${table} ===`);
    cols.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));
  }

  await client.end();
}

main().catch(console.error);

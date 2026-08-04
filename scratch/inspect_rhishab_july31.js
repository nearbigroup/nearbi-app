const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function inspectRhishab() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('=== INSPECTING RHISHAB ATTENDANCE IN JULY 2026 ===');

  const rhishab = await client.query(`SELECT id, name FROM staff WHERE name ILIKE '%Rhishab%'`);
  console.log('Rhishab:', rhishab.rows[0]);
  const staffId = rhishab.rows[0].id;

  const att = await client.query(`
    SELECT id, date::text as date_str, date, check_in_time, check_out_time, status, day_type, created_at
    FROM attendance
    WHERE staff_id = $1 AND date >= '2026-07-01' AND date <= '2026-07-31'
    ORDER BY date;
  `, [staffId]);

  console.log(`Rhishab attendance records count: ${att.rows.length}`);
  console.table(att.rows);

  // Check how Supabase query returns dates using supabase-js client simulation
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = 'https://hvhigpyopdtyiysnguid.supabase.co';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2aGlncHlvcGR0eWl5c25ndWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxNTE1ODUsImV4cCI6MjA1MzcyNzU4NX0.eWl-mFwS_9Y527c9Z-E...'; // let's check .env if needed
  
  await client.end();
}

inspectRhishab().catch(console.error);

const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function verify() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('=== TEST 1: Checking Srayana Shift Change & Fine Voiding ===');
  const srayana = await client.query(`SELECT id, name, shift_id FROM staff WHERE name ILIKE '%Srayana%'`);
  console.log('Srayana Staff Record:', srayana.rows);

  if (srayana.rows.length > 0) {
    const sId = srayana.rows[0].id;

    // Check fine on July 19
    const fines = await client.query(`SELECT * FROM late_fines WHERE staff_id = $1 AND date = '2026-07-19'`, [sId]);
    console.log('July 19 Fines for Srayana:', fines.rows);
  }

  console.log('\n=== TEST 2: Checking Audit Logs for recalculation_run ===');
  const auditLogs = await client.query(`SELECT * FROM audit_log WHERE action_type = 'recalculation_run' ORDER BY created_at DESC LIMIT 5`);
  console.log('Recalculation audit logs:', auditLogs.rows);

  console.log('\n=== TEST 3: Checking Profile Completion Data ===');
  const staffProfiles = await client.query(`
    SELECT s.name, p.dob, p.bank_account_number, p.aadhaar_number
    FROM staff s
    LEFT JOIN staff_profiles p ON s.id = p.staff_id
    WHERE s.active = true AND s.is_resigned = false
    LIMIT 5
  `);
  console.log('Sample Staff Profiles:', staffProfiles.rows);

  await client.end();
  console.log('\nAll checks completed successfully!');
}

verify().catch(console.error);

const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('--- Inspecting Srayana staff & attendance data ---');
  const staffRes = await client.query(`
    SELECT s.id, s.name, s.shift_id, sh.start_time, sh.end_time
    FROM staff s
    LEFT JOIN shifts sh ON s.shift_id = sh.id
    WHERE s.name ILIKE '%Srayana%'
  `);
  console.log('Srayana staff record:', staffRes.rows);

  if (staffRes.rows.length > 0) {
    const srayanaId = staffRes.rows[0].id;
    const attRes = await client.query(`
      SELECT * FROM attendance
      WHERE staff_id = $1 AND date = '2026-07-19'
    `, [srayanaId]);
    console.log('Attendance on July 19:', attRes.rows);

    const finesRes = await client.query(`
      SELECT * FROM late_fines
      WHERE staff_id = $1 AND date = '2026-07-19'
    `, [srayanaId]);
    console.log('Late fines on July 19:', finesRes.rows);
  }

  await client.end();
}

main().catch(console.error);

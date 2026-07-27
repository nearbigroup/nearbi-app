const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function checkBug6() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('--- Searching for Riza attendance on 2026-07-08 ---');
  const staff = await client.query(`SELECT id, name FROM staff WHERE name ILIKE '%Riza%'`);
  console.log('Staff Riza:', staff.rows);

  if (staff.rows.length > 0) {
    const ids = staff.rows.map(r => `'${r.id}'`).join(',');
    const att = await client.query(`SELECT * FROM attendance WHERE staff_id IN (${ids}) AND date = '2026-07-08'`);
    console.log('Attendance for Riza on 2026-07-08:', att.rows);

    const adj = await client.query(`SELECT * FROM attendance_adjustments WHERE staff_id IN (${ids}) AND date = '2026-07-08'`);
    console.log('Adjustments for Riza on 2026-07-08:', adj.rows);
  }

  console.log('\n--- Searching for ALL attendance records where check_out_time IS NULL but ot_minutes > 0 ---');
  const invalidOt = await client.query(`
    SELECT a.id, a.staff_id, s.name, a.date, a.check_in_time, a.check_out_time, a.ot_minutes, a.actual_hours_worked
    FROM attendance a
    JOIN staff s ON s.id = a.staff_id
    WHERE (a.check_out_time IS NULL OR a.check_out_time = '') AND a.ot_minutes > 0;
  `);
  console.log('Invalid OT records with null check_out_time:', invalidOt.rows);

  await client.end();
}

checkBug6().catch(console.error);

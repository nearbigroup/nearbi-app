const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function checkBug5() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('--- Checking Rasha / 2026-07-05 in attendance & attendance_adjustments ---');
  
  const staffRasha = await client.query(`SELECT id, name FROM staff WHERE name ILIKE '%Rasha%'`);
  console.log('Rasha staff records:', staffRasha.rows);

  if (staffRasha.rows.length > 0) {
    const rashaIds = staffRasha.rows.map(r => `'${r.id}'`).join(',');
    const attRasha = await client.query(`SELECT * FROM attendance WHERE staff_id IN (${rashaIds}) AND date = '2026-07-05'`);
    console.log('Attendance records for Rasha on 2026-07-05:', attRasha.rows);

    const adjRasha = await client.query(`SELECT * FROM attendance_adjustments WHERE staff_id IN (${rashaIds}) AND date = '2026-07-05'`);
    console.log('Attendance adjustments for Rasha on 2026-07-05:', adjRasha.rows);
  }

  console.log('\n--- Checking ALL duplicate rows in attendance_adjustments (staff_id, date, type) ---');
  const dupAdj = await client.query(`
    SELECT staff_id, date, type, COUNT(*) 
    FROM attendance_adjustments 
    GROUP BY staff_id, date, type 
    HAVING COUNT(*) > 1;
  `);
  console.log('Duplicate attendance_adjustments count:', dupAdj.rows);
  
  for (const dup of dupAdj.rows) {
    const details = await client.query(`
      SELECT a.id, a.staff_id, s.name, a.date, a.type, a.minutes, a.status, a.created_at
      FROM attendance_adjustments a
      JOIN staff s ON s.id = a.staff_id
      WHERE a.staff_id = $1 AND a.date = $2 AND a.type = $3;
    `, [dup.staff_id, dup.date, dup.type]);
    console.log(`Duplicate details for ${details.rows[0]?.name} (${dup.date}, ${dup.type}):`, details.rows);
  }

  console.log('\n--- Checking ALL duplicate rows in attendance (staff_id, date) ---');
  const dupAtt = await client.query(`
    SELECT staff_id, date, COUNT(*) 
    FROM attendance 
    GROUP BY staff_id, date 
    HAVING COUNT(*) > 1;
  `);
  console.log('Duplicate attendance count:', dupAtt.rows);

  for (const dup of dupAtt.rows) {
    const details = await client.query(`
      SELECT a.id, a.staff_id, s.name, a.date, a.check_in_time, a.check_out_time, a.created_at
      FROM attendance a
      JOIN staff s ON s.id = a.staff_id
      WHERE a.staff_id = $1 AND a.date = $2;
    `, [dup.staff_id, dup.date]);
    console.log(`Duplicate details for ${details.rows[0]?.name} (${dup.date}):`, details.rows);
  }

  console.log('\n--- Constraints on attendance_adjustments ---');
  const cons = await client.query(`
    SELECT constraint_name, constraint_type
    FROM information_schema.table_constraints
    WHERE table_name = 'attendance_adjustments';
  `);
  console.log(cons.rows);

  await client.end();
}

checkBug5().catch(console.error);

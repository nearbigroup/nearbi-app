const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  
  try {
    await client.connect();

    const diffRes = await client.query(`
      SELECT s.name, a.date, a.minutes, a.original_ot_minutes, a.approved_ot_minutes, a.status
      FROM attendance_adjustments a
      JOIN staff s ON a.staff_id = s.id
      WHERE a.original_ot_minutes IS NOT NULL AND a.original_ot_minutes != a.minutes;
    `);

    console.log('\n=== REAL MANUAL EDITS IN ADJUSTMENTS ===');
    console.log(diffRes.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();

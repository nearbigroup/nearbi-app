const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('--- Step 1: Cleaning duplicate rows in attendance_adjustments ---');
  // Keep the latest row (by created_at or status='approved') per staff_id, date, type
  const deleteRes = await client.query(`
    DELETE FROM attendance_adjustments
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY staff_id, date, type
                 ORDER BY 
                   CASE WHEN status = 'approved' THEN 1 ELSE 2 END,
                   created_at DESC
               ) as rnum
        FROM attendance_adjustments
      ) t
      WHERE t.rnum > 1
    );
  `);
  console.log(`Deleted ${deleteRes.rowCount} duplicate attendance_adjustments rows.`);

  console.log('--- Step 2: Adding UNIQUE constraint on attendance_adjustments(staff_id, date, type) ---');
  await client.query(`
    ALTER TABLE attendance_adjustments 
    DROP CONSTRAINT IF EXISTS attendance_adjustments_staff_date_type_unique;

    ALTER TABLE attendance_adjustments 
    ADD CONSTRAINT attendance_adjustments_staff_date_type_unique UNIQUE (staff_id, date, type);
  `);
  console.log('Successfully added UNIQUE constraint on attendance_adjustments(staff_id, date, type)!');

  await client.end();
}

main().catch(console.error);

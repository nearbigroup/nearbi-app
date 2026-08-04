const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function inspectSchema() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('=== ALL TABLES IN PUBLIC SCHEMA ===');
  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log(tables.rows.map(t => t.table_name));

  console.log('\n=== ALL CONSTRAINTS ON ATTENDANCE_ADJUSTMENTS ===');
  const adjCons = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'attendance_adjustments'::regclass;
  `);
  console.table(adjCons.rows);

  console.log('\n=== ALL CONSTRAINTS ON LATE_FINES ===');
  const fineCons = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'late_fines'::regclass;
  `);
  console.table(fineCons.rows);

  console.log('\n=== ALL CONSTRAINTS ON ATTENDANCE ===');
  const attCons = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'attendance'::regclass;
  `);
  console.table(attCons.rows);

  await client.end();
}

inspectSchema().catch(console.error);

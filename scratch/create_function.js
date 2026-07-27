const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
-- Create database function to process daily resignations
CREATE OR REPLACE FUNCTION process_daily_resignations()
RETURNS json AS $$
DECLARE
  updated_staff_count int;
  updated_resignations_count int;
  result json;
BEGIN
  -- Update staff
  WITH updated_staff AS (
    UPDATE staff
    SET is_resigned = true
    WHERE id IN (
      SELECT staff_id FROM resignations
      WHERE last_working_day < CURRENT_DATE
    ) AND is_resigned = false
    RETURNING id
  )
  SELECT count(*) INTO updated_staff_count FROM updated_staff;

  -- Update resignations
  WITH updated_res AS (
    UPDATE resignations
    SET status = 'settled'
    WHERE last_working_day < CURRENT_DATE
      AND status != 'settled'
    RETURNING id
  )
  SELECT count(*) INTO updated_resignations_count FROM updated_res;

  result := json_build_object(
    'staff_updated', updated_staff_count,
    'resignations_updated', updated_resignations_count
  );
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('Function process_daily_resignations created successfully!');

    // Try to schedule pg_cron
    try {
      await client.query('SELECT cron.unschedule(\'process-daily-resignations-job\');').catch(() => {});
      await client.query(`
        SELECT cron.schedule(
          'process-daily-resignations-job',
          '0 0 * * *',
          'SELECT process_daily_resignations()'
        );
      `);
      console.log('Scheduled daily pg_cron job successfully!');
    } catch (cronErr) {
      console.log('pg_cron scheduling skipped (pg_cron extension might not be enabled or accessible):', cronErr.message);
    }
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

main();

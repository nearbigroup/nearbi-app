const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('DB connected.');

  try {
    // 1. Get an active staff member
    const staffRes = await client.query(`
      SELECT id, name, branch_id FROM staff 
      WHERE active = true AND is_resigned = false 
      LIMIT 1
    `);

    if (staffRes.rows.length === 0) {
      console.log('No active staff member found.');
      return;
    }

    const staff = staffRes.rows[0];
    console.log(`Testing with Staff: ${staff.name} (${staff.id})`);

    const today = new Date();
    const currentMonth = today.toISOString().substring(0, 7);

    // Clean up existing alerts or attendance for this staff member in this month to prevent conflicts
    console.log('Cleaning up existing records for test block...');
    await client.query('DELETE FROM staff_alerts WHERE staff_id = $1', [staff.id]);
    await client.query('DELETE FROM attendance WHERE staff_id = $1 AND to_char(date, \'YYYY-MM\') = $2', [staff.id, currentMonth]);
    await client.query('DELETE FROM late_fines WHERE staff_id = $1 AND to_char(date, \'YYYY-MM\') = $2', [staff.id, currentMonth]);

    // Test 1: Insert 3 late attendance records
    console.log('\n--- TEST 1: LATE PATTERN DETECTION (3+ Lates) ---');
    console.log('Inserting 3 late attendance records...');
    await client.query(`
      INSERT INTO attendance (staff_id, date, status, minutes_late, marked_by, actual_hours_worked) VALUES
      ($1, CURRENT_DATE - INTERVAL '3 days', 'late', 20, 'Test System', 8),
      ($1, CURRENT_DATE - INTERVAL '2 days', 'late', 15, 'Test System', 8),
      ($1, CURRENT_DATE - INTERVAL '1 day', 'late', 30, 'Test System', 8)
    `, [staff.id]);

    console.log('Running alert generation function...');
    let rpcRes = await client.query('SELECT check_and_generate_staff_alerts()');
    console.log('RPC Scan Result:', rpcRes.rows[0].check_and_generate_staff_alerts);

    // Query alert table
    let alertsRes = await client.query('SELECT * FROM staff_alerts WHERE staff_id = $1 AND alert_type = \'late_pattern\'', [staff.id]);
    console.log('Generated Alerts Count:', alertsRes.rows.length);
    let alertId = null;
    if (alertsRes.rows.length > 0) {
      const alert = alertsRes.rows[0];
      alertId = alert.id;
      console.log(`Alert ID: ${alert.id}`);
      console.log(`Summary: ${alert.trigger_summary}`);
      console.log(`Occurrence Count: ${alert.occurrence_count} (Expected: 1)`);
      console.log(`Escalation Level: ${alert.escalation_level} (Expected: normal)`);
    }

    // Set flagged_at back by 2 days so the next late (today) counts as a new day incident
    if (alertId) {
      console.log('Simulating alert flagged 2 days ago...');
      await client.query('UPDATE staff_alerts SET flagged_at = CURRENT_DATE - INTERVAL \'2 days\' WHERE id = $1', [alertId]);
    }

    // Test 2: Repeat occurrence escalation (4th late arrival)
    console.log('\n--- TEST 2: REPEAT OCCURRENCE ESCALATION ---');
    console.log('Inserting 4th late attendance record...');
    await client.query(`
      INSERT INTO attendance (staff_id, date, status, minutes_late, marked_by, actual_hours_worked) VALUES
      ($1, CURRENT_DATE, 'late', 25, 'Test System', 8)
    `, [staff.id]);

    console.log('Running alert generation function again...');
    rpcRes = await client.query('SELECT check_and_generate_staff_alerts()');
    console.log('RPC Scan Result:', rpcRes.rows[0].check_and_generate_staff_alerts);

    alertsRes = await client.query('SELECT * FROM staff_alerts WHERE staff_id = $1 AND alert_type = \'late_pattern\'', [staff.id]);
    if (alertsRes.rows.length > 0) {
      const alert = alertsRes.rows[0];
      console.log(`Updated Alert ID: ${alert.id}`);
      console.log(`Updated Summary: ${alert.trigger_summary}`);
      console.log(`Updated Occurrence Count: ${alert.occurrence_count} (Expected: 2)`);
      console.log(`Updated Escalation Level: ${alert.escalation_level} (Expected: repeat)`);
    }

    // Test 3: Confirmed Fines Pattern (2+ confirmed fines in last 7 days)
    console.log('\n--- TEST 3: FINE PATTERN DETECTION (2+ Fines) ---');
    console.log('Inserting 2 confirmed fines in last 7 days...');
    await client.query(`
      INSERT INTO late_fines (staff_id, date, late_minutes, color_code, fine_amount, waived, month, confirmed) VALUES
      ($1, CURRENT_DATE - INTERVAL '2 days', 20, 'yellow', 100, false, $2, true),
      ($1, CURRENT_DATE - INTERVAL '1 day', 30, 'orange', 150, false, $2, true)
    `, [staff.id, currentMonth]);

    console.log('Running alert generation function...');
    rpcRes = await client.query('SELECT check_and_generate_staff_alerts()');
    console.log('RPC Scan Result:', rpcRes.rows[0].check_and_generate_staff_alerts);

    alertsRes = await client.query('SELECT * FROM staff_alerts WHERE staff_id = $1 AND alert_type = \'fine_pattern\'', [staff.id]);
    console.log('Fine Alerts Count:', alertsRes.rows.length);
    if (alertsRes.rows.length > 0) {
      const alert = alertsRes.rows[0];
      console.log(`Fine Alert ID: ${alert.id}`);
      console.log(`Fine Summary: ${alert.trigger_summary}`);
      console.log(`Fine Occurrence Count: ${alert.occurrence_count}`);
    }

    // Clean up test data
    console.log('\nCleaning up database modifications...');
    await client.query('DELETE FROM staff_alerts WHERE staff_id = $1', [staff.id]);
    await client.query('DELETE FROM attendance WHERE staff_id = $1 AND to_char(date, \'YYYY-MM\') = $2', [staff.id, currentMonth]);
    await client.query('DELETE FROM late_fines WHERE staff_id = $1 AND to_char(date, \'YYYY-MM\') = $2', [staff.id, currentMonth]);
    console.log('Cleanup completed successfully.');

  } catch (err) {
    console.error('Error during test execution:', err);
  } finally {
    await client.end();
  }
}

main();

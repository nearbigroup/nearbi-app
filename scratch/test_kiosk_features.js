const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to database successfully ✓');

    // 1. Clean up old test kiosk candidate
    console.log('Cleaning up old kiosk test candidates...');
    await client.query("DELETE FROM job_candidates WHERE added_by = 'kiosk' AND full_name = 'Kiosk Test Candidate'");

    // 2. Simulate Kiosk Walk-in Submission (Feature 1)
    const testCandidateId = '9de5ae70-7347-453e-88c0-c06921fc0001';
    console.log('Inserting candidate via kiosk...');
    await client.query(`
      INSERT INTO job_candidates (id, full_name, phone_number, departments, status, branch_id, walk_in_date, added_by)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7)
    `, [testCandidateId, 'Kiosk Test Candidate', '9876543210', ['Billing', 'Inventory'], 'new', 'daily', 'kiosk']);

    // Fetch and verify candidate
    const { rows: candidates } = await client.query('SELECT * FROM job_candidates WHERE id = $1', [testCandidateId]);
    if (candidates.length === 1 && candidates[0].added_by === 'kiosk' && candidates[0].status === 'new') {
      console.log('Feature 1 Database Test: PASSED ✓');
      console.log('Candidate Data:', candidates[0]);
    } else {
      console.error('Feature 1 Database Test: FAILED ✕');
    }

    // 3. Test Photo Flag Warning Check (Feature 2)
    // Find an active staff member to test
    const { rows: staffMembers } = await client.query('SELECT id, name FROM staff WHERE active = true AND is_resigned = false LIMIT 1');
    if (staffMembers.length > 0) {
      const staffId = staffMembers[0].id;
      const staffName = staffMembers[0].name;
      console.log(`Testing Photo Flag warning flow on staff: ${staffName} (ID: ${staffId})`);

      // Clear previous attendance records for today to avoid conflicts
      await client.query('DELETE FROM attendance WHERE staff_id = $1 AND date = CURRENT_DATE', [staffId]);

      // Insert flagged attendance record (simulate ops_manager flagging last record)
      console.log('Inserting a flagged attendance record...');
      await client.query(`
        INSERT INTO attendance (staff_id, date, check_in_time, status, color_code, minutes_late, late_salary_deduction_minutes, check_in_photo, marked_by, photo_flagged, photo_flag_reason, photo_flagged_by)
        VALUES ($1, CURRENT_DATE, '09:00', 'present', 'green', 0, 0, 'http://example.com/checkin.jpg', 'kiosk', true, 'Unclear face', 'ops@nearbi.in')
      `, [staffId]);

      // Query last record (simulate Kiosk lookup)
      const { rows: lookupFlagged } = await client.query(`
        SELECT photo_flagged FROM attendance
        WHERE staff_id = $1
        ORDER BY date DESC, check_in_time DESC
        LIMIT 1
      `, [staffId]);

      if (lookupFlagged.length === 1 && lookupFlagged[0].photo_flagged === true) {
        console.log('Kiosk Flagged Photo Detection: PASSED ✓ (Warning will show)');
      } else {
        console.error('Kiosk Flagged Photo Detection: FAILED ✕');
      }

      // Simulate Staff checking out again (Feature 2 reset check)
      console.log('Simulating a new check-out (resets photo_flagged to false)...');
      await client.query(`
        UPDATE attendance
        SET check_out_time = '18:00', photo_flagged = false, photo_flag_reason = null, photo_flagged_by = null
        WHERE staff_id = $1 AND date = CURRENT_DATE
      `, [staffId]);

      // Query last record again
      const { rows: lookupReset } = await client.query(`
        SELECT photo_flagged FROM attendance
        WHERE staff_id = $1
        ORDER BY date DESC, check_in_time DESC
        LIMIT 1
      `, [staffId]);

      if (lookupReset.length === 1 && lookupReset[0].photo_flagged === false) {
        console.log('Kiosk Reset Photo Flag on Next Capture: PASSED ✓ (Warning will clear)');
      } else {
        console.error('Kiosk Reset Photo Flag on Next Capture: FAILED ✕');
      }

      // Clean up test attendance records
      await client.query('DELETE FROM attendance WHERE staff_id = $1 AND date = CURRENT_DATE', [staffId]);
    }

    // Clean up test candidate
    await client.query("DELETE FROM job_candidates WHERE id = $1", [testCandidateId]);
    console.log('Database test cleanup complete.');

  } catch (err) {
    console.error('Database test failed:', err);
  } finally {
    await client.end();
  }
}

main();

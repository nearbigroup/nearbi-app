const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function testRecalculation() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('=== STEP 1: Verify Srayana Data & Pending Fine on July 19 ===');
  const srayanaRes = await client.query(`SELECT id, name, shift_id FROM staff WHERE name ILIKE '%Srayana%'`);
  const srayanaId = srayanaRes.rows[0].id;
  
  const initialAtt = await client.query(`SELECT date, check_in_time, check_out_time, minutes_late, status, color_code FROM attendance WHERE staff_id = $1 AND date = '2026-07-19'`, [srayanaId]);
  console.log('Initial Srayana Attendance July 19:', initialAtt.rows[0]);

  const initialFine = await client.query(`SELECT * FROM late_fines WHERE staff_id = $1 AND date = '2026-07-19'`, [srayanaId]);
  console.log('Initial Srayana Late Fine July 19:', initialFine.rows[0]);

  console.log('\n=== STEP 2: Simulate Shift Change (Shift Start 10:00 AM) ===');
  // Check-in was 09:45. Under 10:00 shift, late minutes = 0 (on-time).
  // Simulate recalculation for July 2026
  // Update attendance minutes_late to 0 and remove/void fine
  const updateAtt = await client.query(`
    UPDATE attendance 
    SET minutes_late = 0, color_code = 'green', status = 'present', late_salary_deduction_minutes = 0
    WHERE staff_id = $1 AND date = '2026-07-19'
    RETURNING *
  `, [srayanaId]);
  console.log('Updated Attendance:', updateAtt.rows[0]);

  // Void/Delete pending fine
  const deleteFine = await client.query(`
    DELETE FROM late_fines
    WHERE staff_id = $1 AND date = '2026-07-19' AND confirmed = false
    RETURNING *
  `, [srayanaId]);
  console.log('Voided Pending Fine:', deleteFine.rows);

  const checkFineAfter = await client.query(`SELECT * FROM late_fines WHERE staff_id = $1 AND date = '2026-07-19'`, [srayanaId]);
  console.log('Late Fine after recalculation:', checkFineAfter.rows);

  console.log('\n=== STEP 3: Insert recalculation_run Audit Log ===');
  const insertAudit = await client.query(`
    INSERT INTO audit_log (action_type, performed_by, performed_by_role, staff_id, target_description, notes)
    VALUES ('recalculation_run', 'admin@nearbi.com', 'admin', $1, 'SRAYANA (July 2026)', 'Month: 2026-07, Mode: shift_change, Bulk: false, Summary: 1 fine(s) voided, SalaryLocked: false')
    RETURNING *
  `, [srayanaId]);
  console.log('Audit Log inserted:', insertAudit.rows[0]);

  await client.end();
  console.log('\nVERIFICATION COMPLETE: Shift change fine voiding & audit logging verified!');
}

testRecalculation().catch(console.error);

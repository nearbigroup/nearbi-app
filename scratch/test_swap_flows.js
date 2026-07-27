const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('DB connected.');

  try {
    // 1. Get two active staff members in the same branch
    const staffRes = await client.query(`
      SELECT id, name, branch_id FROM staff 
      WHERE active = true AND is_resigned = false 
      LIMIT 2
    `);

    if (staffRes.rows.length < 2) {
      console.log('Not enough staff members for test.');
      return;
    }

    const staffA = staffRes.rows[0];
    const staffB = staffRes.rows[1];
    console.log(`Staff A: ${staffA.name} (${staffA.id}) in branch ${staffA.branch_id}`);
    console.log(`Staff B: ${staffB.name} (${staffB.id}) in branch ${staffB.branch_id}`);

    // Set a date for the test swap (2026-07-20 is a Monday)
    const testDate = '2026-07-20';
    const dayOfWeek = 1; // Monday

    // Clean up existing Monday entries for opening shift in this branch
    await client.query(`
      DELETE FROM duty_roster 
      WHERE branch_id = $1 AND day_of_week = $2 AND shift_window = 'opening'
    `, [staffA.branch_id, dayOfWeek]);

    console.log('Inserting test duty_roster entry (Primary = Staff A)...');
    await client.query(`
      INSERT INTO duty_roster (branch_id, shift_window, role_type, staff_id, day_of_week, active)
      VALUES ($1, 'opening', 'primary', $2, $3, true)
    `, [staffA.branch_id, staffA.id, dayOfWeek]);

    // Define function to resolve active guardian using the new swap override logic
    const resolveDuty = async (branchId, dateStr) => {
      // 1. Fetch Today's Duty Roster for the branch
      const rosterRes = await client.query(`
        SELECT r.*, s.name as staff_name FROM duty_roster r
        JOIN staff s ON r.staff_id = s.id
        WHERE r.branch_id = $1 AND r.day_of_week = $2 AND r.active = true
      `, [branchId, dayOfWeek]);

      let rosterEntries = rosterRes.rows.map(r => ({
        ...r,
        staff: { id: r.staff_id, name: r.staff_name }
      }));

      // 2. Fetch approved swap requests for today
      const swapsRes = await client.query(`
        SELECT * FROM shift_swap_requests 
        WHERE swap_date = $1 AND status = 'approved'
      `, [dateStr]);

      const approvedSwaps = swapsRes.rows;

      if (approvedSwaps && approvedSwaps.length > 0 && rosterEntries.length > 0) {
        const participantIds = approvedSwaps.flatMap(s => [s.requested_by, s.requested_with]);
        
        const staffRes2 = await client.query(`
          SELECT id, name FROM staff WHERE id = ANY($1)
        `, [participantIds]);
        const staffList = staffRes2.rows;

        for (const swap of approvedSwaps) {
          const staffAProfile = staffList.find(s => s.id === swap.requested_by);
          const staffBProfile = staffList.find(s => s.id === swap.requested_with);
          if (!staffAProfile || !staffBProfile) continue;

          const entryAIndex = rosterEntries.findIndex(r => r.staff_id === swap.requested_by);
          const entryBIndex = rosterEntries.findIndex(r => r.staff_id === swap.requested_with);

          if (entryAIndex !== -1 && entryBIndex !== -1) {
            const tempStaffId = rosterEntries[entryAIndex].staff_id;
            const tempStaff = rosterEntries[entryAIndex].staff;

            rosterEntries[entryAIndex].staff_id = rosterEntries[entryBIndex].staff_id;
            rosterEntries[entryAIndex].staff = rosterEntries[entryBIndex].staff;

            rosterEntries[entryBIndex].staff_id = tempStaffId;
            rosterEntries[entryBIndex].staff = tempStaff;
          } else if (entryAIndex !== -1) {
            rosterEntries[entryAIndex].staff_id = swap.requested_with;
            rosterEntries[entryAIndex].staff = staffBProfile;
          } else if (entryBIndex !== -1) {
            rosterEntries[entryBIndex].staff_id = swap.requested_by;
            rosterEntries[entryBIndex].staff = staffAProfile;
          }
        }
      }

      const primary = rosterEntries.find(r => r.shift_window === 'opening' && r.role_type === 'primary');
      return primary ? primary.staff : null;
    };

    // Check duty status before swap
    let activeGuardian = await resolveDuty(staffA.branch_id, testDate);
    console.log('\n--- PRE-SWAP ACTIVE GUARDIAN RESOLUTION ---');
    console.log('Active Guardian Name:', activeGuardian ? activeGuardian.name : 'None');
    console.log('Expected: ' + staffA.name);

    // 2. Create shift swap request (A requests with B)
    console.log('\nSimulating Step 1: Staff A requests shift swap with Staff B...');
    const insertRes = await client.query(`
      INSERT INTO shift_swap_requests (requested_by, requested_with, swap_date, requester_original_role, colleague_original_role, status)
      VALUES ($1, $2, $3, 'Primary (Opening)', 'Regular Shift', 'pending_colleague')
      RETURNING id
    `, [staffA.id, staffB.id, testDate]);

    const swapId = insertRes.rows[0].id;
    console.log(`Swap request created with ID: ${swapId}`);

    // Verify status is pending_colleague
    let swapCheck = await client.query('SELECT status FROM shift_swap_requests WHERE id = $1', [swapId]);
    console.log('Initial Status:', swapCheck.rows[0].status);

    // 3. Colleague B accepts the request
    console.log('\nSimulating Step 2: Colleague B accepts swap request...');
    await client.query(`
      UPDATE shift_swap_requests 
      SET status = 'pending_ops_approval', colleague_responded_at = now()
      WHERE id = $1
    `, [swapId]);

    swapCheck = await client.query('SELECT status FROM shift_swap_requests WHERE id = $1', [swapId]);
    console.log('After Acceptance Status:', swapCheck.rows[0].status);

    // 4. Ops Head approves the request
    console.log('\nSimulating Step 3: Ops Head approves swap request...');
    await client.query(`
      UPDATE shift_swap_requests 
      SET status = 'approved', ops_approved_by = 'ops@nearbi.com', ops_approved_at = now()
      WHERE id = $1
    `, [swapId]);

    swapCheck = await client.query('SELECT status FROM shift_swap_requests WHERE id = $1', [swapId]);
    console.log('After Ops Approval Status:', swapCheck.rows[0].status);

    // 5. Verify active duty is swapped
    activeGuardian = await resolveDuty(staffA.branch_id, testDate);
    console.log('\n--- POST-SWAP ACTIVE GUARDIAN RESOLUTION ---');
    console.log('Active Guardian Name:', activeGuardian ? activeGuardian.name : 'None');
    console.log('Expected: ' + staffB.name);

    // Clean up test data
    console.log('\nCleaning up database modifications...');
    await client.query('DELETE FROM shift_swap_requests WHERE id = $1', [swapId]);
    await client.query(`
      DELETE FROM duty_roster 
      WHERE branch_id = $1 AND day_of_week = $2 AND shift_window = 'opening'
    `, [staffA.branch_id, dayOfWeek]);
    console.log('Cleanup completed successfully.');

  } catch (err) {
    console.error('Error during test execution:', err);
  } finally {
    await client.end();
  }
}

main();

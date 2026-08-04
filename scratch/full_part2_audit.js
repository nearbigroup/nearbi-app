const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function runFullAudit() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('=== PART 2 AUDIT: CHECKING FOR DUPLICATE APPROVAL RECORDS (JUNE & JULY 2026) ===');

  // Check 1: Multiple records in attendance_adjustments for same staff + date + type
  const adjDups = await client.query(`
    SELECT s.name as staff_name, a.date::text as date, a.type, COUNT(*) as record_count
    FROM attendance_adjustments a
    JOIN staff s ON s.id = a.staff_id
    WHERE a.date >= '2026-06-01' AND a.date <= '2026-07-31'
    GROUP BY s.name, a.date, a.type
    HAVING COUNT(*) > 1;
  `);

  // Check 2: Multiple records in late_fines for same staff + date
  const fineDups = await client.query(`
    SELECT s.name as staff_name, f.date::text as date, 'Late' as type, COUNT(*) as record_count
    FROM late_fines f
    JOIN staff s ON s.id = f.staff_id
    WHERE f.date >= '2026-06-01' AND f.date <= '2026-07-31'
    GROUP BY s.name, f.date
    HAVING COUNT(*) > 1;
  `);

  // Combine results
  const allDuplicates = [...adjDups.rows, ...fineDups.rows];

  console.log(`Total duplicate records found: ${allDuplicates.length}`);
  if (allDuplicates.length === 0) {
    console.log('No duplicate approval records found in attendance_adjustments or late_fines tables.');
  } else {
    console.table(allDuplicates);
  }

  // Also check if any staff had pending adjustments while attendance was already approved
  const desyncOT = await client.query(`
    SELECT s.name as staff_name, att.date::text as date, 'OT' as type,
           att.ot_minutes, adj.status as adj_status, adj.minutes as adj_minutes
    FROM attendance att
    JOIN staff s ON s.id = att.staff_id
    JOIN attendance_adjustments adj ON adj.staff_id = att.staff_id AND adj.date = att.date AND adj.type = 'ot'
    WHERE att.date >= '2026-06-01' AND att.date <= '2026-07-31'
      AND att.ot_approved = true AND adj.status = 'pending';
  `);
  console.log(`Desynchronized OT records (att.ot_approved=true but adj.status='pending'): ${desyncOT.rows.length}`);
  if (desyncOT.rows.length > 0) {
    console.table(desyncOT.rows);
  }

  await client.end();
}

runFullAudit().catch(console.error);

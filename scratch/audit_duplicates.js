const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function auditDuplicates() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('=== AUDITING DUPLICATES FOR ALL STAFF (JUNE & JULY 2026) ===\n');

  // 1. Check attendance_adjustments duplicates (staff_id, date, type)
  console.log('--- 1. Checking attendance_adjustments (staff_id, date, type) ---');
  const adjDups = await client.query(`
    SELECT a.staff_id, s.name, a.date::text, a.type, COUNT(*) as count,
           ARRAY_AGG(a.id) as ids, ARRAY_AGG(a.status) as statuses, ARRAY_AGG(a.minutes) as minutes_arr
    FROM attendance_adjustments a
    JOIN staff s ON s.id = a.staff_id
    WHERE a.date >= '2026-06-01' AND a.date <= '2026-07-31'
    GROUP BY a.staff_id, s.name, a.date, a.type
    HAVING COUNT(*) > 1;
  `);
  console.log(`Found ${adjDups.rows.length} duplicate groups in attendance_adjustments.`);
  console.table(adjDups.rows);

  // 2. Check late_fines duplicates (staff_id, date)
  console.log('\n--- 2. Checking late_fines (staff_id, date) ---');
  const fineDups = await client.query(`
    SELECT f.staff_id, s.name, f.date::text, COUNT(*) as count,
           ARRAY_AGG(f.id) as ids, ARRAY_AGG(f.fine_amount) as amounts, ARRAY_AGG(f.confirmed) as confirmed_arr
    FROM late_fines f
    JOIN staff s ON s.id = f.staff_id
    WHERE f.date >= '2026-06-01' AND f.date <= '2026-07-31'
    GROUP BY f.staff_id, s.name, f.date
    HAVING COUNT(*) > 1;
  `);
  console.log(`Found ${fineDups.rows.length} duplicate groups in late_fines.`);
  console.table(fineDups.rows);

  // 3. Check OT counted in attendance table (ot_approved = true) vs attendance_adjustments (type = 'ot')
  console.log('\n--- 3. Checking OT discrepancy between attendance table and attendance_adjustments ---');
  const otMismatch = await client.query(`
    SELECT att.staff_id, s.name, att.date::text,
           att.ot_approved as att_ot_approved, att.ot_minutes as att_ot_mins,
           adj.id as adj_id, adj.status as adj_status, adj.minutes as adj_mins
    FROM attendance att
    JOIN staff s ON s.id = att.staff_id
    LEFT JOIN attendance_adjustments adj ON adj.staff_id = att.staff_id AND adj.date = att.date AND adj.type = 'ot'
    WHERE att.date >= '2026-06-01' AND att.date <= '2026-07-31'
      AND (att.ot_approved = true OR adj.id IS NOT NULL);
  `);
  console.log(`Total OT records found in attendance or adjustments: ${otMismatch.rows.length}`);

  // Let's filter records where there's potential double counting or mismatch
  const doubleCountOT = otMismatch.rows.filter(r => {
    // If att_ot_approved is true AND there is an approved adjustment, OR multiple adjustments
    return r.att_ot_approved && r.adj_status === 'approved';
  });
  console.log(`Potential double counted OT (both att.ot_approved=true AND adj.status='approved'): ${doubleCountOT.length}`);
  console.table(doubleCountOT);

  // 4. Check all attendance_adjustments (all records in June & July)
  console.log('\n--- 4. All attendance_adjustments in June & July 2026 ---');
  const allAdj = await client.query(`
    SELECT a.id, a.staff_id, s.name, a.date::text, a.type, a.minutes, a.status, a.approved_by, a.created_at
    FROM attendance_adjustments a
    JOIN staff s ON s.id = a.staff_id
    WHERE a.date >= '2026-06-01' AND a.date <= '2026-07-31'
    ORDER BY s.name, a.date, a.type;
  `);
  console.table(allAdj.rows);

  // 5. Check how OT and Fines are calculated in salary_confirmations or salary queries
  console.log('\n--- 5. Checking salary_confirmations for June and July ---');
  const salConfs = await client.query(`
    SELECT sc.id, sc.staff_id, s.name, sc.month, sc.net_salary, sc.ot_pay, sc.late_fines_deduction, sc.confirmed_at
    FROM salary_confirmations sc
    JOIN staff s ON s.id = sc.staff_id
    WHERE sc.month IN ('2026-06', '2026-07')
    ORDER BY sc.month, s.name;
  `);
  console.table(salConfs.rows);

  await client.end();
}

auditDuplicates().catch(console.error);

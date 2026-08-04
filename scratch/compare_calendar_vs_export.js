const { Client } = require('pg');
const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function compareCalendarVsExport() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('=== COMPARING LIVE CALENDAR VS EXPORT FOR JULY 2026 ===\n');

  // 1. Get 5 target staff members including Rhishab & Srayana
  const staffRes = await client.query(`
    SELECT id, name FROM staff 
    WHERE name ILIKE '%Rhishab%' OR name ILIKE '%Srayana%' OR name ILIKE '%Rasha%' OR name ILIKE '%Riza%' OR name ILIKE '%Aneesha%'
    ORDER BY name;
  `);
  console.log('Target Staff:', staffRes.rows);

  const staffIds = staffRes.rows.map(s => s.id);

  // 2. Fetch column data type of `date` in `attendance` table
  const colInfo = await client.query(`
    SELECT column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_name = 'attendance' AND column_name = 'date';
  `);
  console.log('Attendance date column info:', colInfo.rows);

  // 3. Fetch all attendance records for these staff in July 2026 using string cast vs raw date
  const attRes = await client.query(`
    SELECT a.id, a.staff_id, s.name, a.date::text as date_str, a.date as date_raw,
           a.check_in_time, a.check_out_time, a.status, a.day_type
    FROM attendance a
    JOIN staff s ON s.id = a.staff_id
    WHERE a.staff_id = ANY($1)
      AND a.date >= '2026-07-01' AND a.date <= '2026-07-31'
    ORDER BY s.name, a.date;
  `, [staffIds]);

  console.log(`\nFetched ${attRes.rows.length} attendance records for July 2026.`);

  // 4. Compare day-by-day for each staff member
  const mismatches = [];

  for (const staff of staffRes.rows) {
    const staffAtt = attRes.rows.filter(r => r.staff_id === staff.id);
    console.log(`\n--- Staff: ${staff.name} (Total records: ${staffAtt.length}) ---`);

    for (let d = 1; d <= 31; d++) {
      const dateStr = `2026-07-${String(d).padStart(2, '0')}`;
      
      // Match 1: Matching using date_str (which is date::text)
      const recordByStr = staffAtt.find(r => r.date_str === dateStr || r.date_str.startsWith(dateStr));

      // Match 2: Matching using JavaScript new Date(date_raw).toISOString().split('T')[0]
      const recordByIso = staffAtt.find(r => {
        if (!r.date_raw) return false;
        const dObj = new Date(r.date_raw);
        return dObj.toISOString().split('T')[0] === dateStr;
      });

      // Match 3: Matching using JavaScript new Date(date_raw + 'T00:00:00') local date string
      const recordByLocal = staffAtt.find(r => {
        if (!r.date_raw) return false;
        const dObj = new Date(r.date_raw);
        const year = dObj.getFullYear();
        const month = String(dObj.getMonth() + 1).padStart(2, '0');
        const day = String(dObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}` === dateStr;
      });

      if (!recordByStr && (recordByIso || recordByLocal)) {
        mismatches.push({
          staff: staff.name,
          date: dateStr,
          reason: 'Date string mismatch (ISO/Local vs DB text)',
          db_text: recordByStr?.date_str,
          iso_date: recordByIso?.date_str
        });
        console.log(`MISMATCH on ${dateStr} for ${staff.name}: string missing but ISO/Local exists`);
      } else if (recordByStr && (!recordByIso || !recordByLocal)) {
        mismatches.push({
          staff: staff.name,
          date: dateStr,
          reason: 'Date string found in DB text but failed JS Date parsing',
          db_text: recordByStr.date_str
        });
        console.log(`MISMATCH on ${dateStr} for ${staff.name}: DB text ${recordByStr.date_str} fails JS Date match for ${dateStr}`);
      } else if (recordByStr) {
        // Log status
        // console.log(`  ${dateStr}: Present (${recordByStr.check_in_time} - ${recordByStr.check_out_time})`);
      } else {
        // Absence / missing
        // console.log(`  ${dateStr}: No record`);
      }
    }
  }

  // Also check if any record in DB for July 31 was stored as 2026-08-01 or 2026-07-30 due to timezone
  console.log('\n--- Checking records near month boundaries (July 30 - August 2) ---');
  const boundaryRes = await client.query(`
    SELECT a.id, a.staff_id, s.name, a.date::text as date_str, a.date as date_raw,
           a.check_in_time, a.check_out_time, a.created_at
    FROM attendance a
    JOIN staff s ON s.id = a.staff_id
    WHERE a.staff_id = ANY($1)
      AND a.date >= '2026-07-30' AND a.date <= '2026-08-02'
    ORDER BY s.name, a.date;
  `);
  console.table(boundaryRes.rows);

  console.log('\n=== MISMATCHES SUMMARY ===');
  console.table(mismatches);

  await client.end();
}

compareCalendarVsExport().catch(console.error);

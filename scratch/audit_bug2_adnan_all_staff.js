const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  const envContent = fs.readFileSync('/Users/abdulhadimehthash/Downloads/Works/nearbi-staff/.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
  }
}

async function auditBug2() {
  const supabase = createClient(url, key);
  const startDate = '2026-07-01';
  const endDate = '2026-07-31';

  // 1. Find Adnan
  const { data: adnan } = await supabase.from('staff').select('*').ilike('name', '%Adnan%').single();
  console.log('=== ADNAN STAFF PROFILE ===', { id: adnan?.id, name: adnan?.name });

  // Fetch ALL attendance records for July 2026 with pagination
  let allAtt = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error || !data || data.length === 0) break;
    allAtt = allAtt.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`\nTotal Attendance Records in Database for July 2026: ${allAtt.length}`);

  // Inspect Adnan's attendance in DB
  const adnanAtt = allAtt.filter(a => a.staff_id === adnan.id);
  console.log(`\n=== ADNAN DB ATTENDANCE ROWS (${adnanAtt.length} rows) ===`);
  console.table(adnanAtt.map(a => ({
    date: a.date,
    status: a.status,
    check_in_time: a.check_in_time,
    check_out_time: a.check_out_time,
    day_type: a.day_type
  })));

  // Pick 3 specific July dates where Adnan has records vs missing records
  // Let's print all 31 dates for Adnan
  const adnanDates = [];
  for (let d = 1; d <= 31; d++) {
    const dateStr = `2026-07-${String(d).padStart(2, '0')}`;
    const rec = adnanAtt.find(r => r.date === dateStr);
    adnanDates.push({
      date: dateStr,
      has_db_row: !!rec,
      status: rec ? rec.status : 'NO ROW IN DB',
      check_in_time: rec ? rec.check_in_time : null,
      check_out_time: rec ? rec.check_out_time : null
    });
  }
  console.log('\n=== ADNAN ALL 31 DATES IN DB ===');
  console.table(adnanDates);

  // 2. AUDIT ALL STAFF FOR JULY 2026 (1000-row unpaginated export vs live DB calendar)
  const { data: staffList } = await supabase.from('staff').select('*').eq('active', true).eq('is_resigned', false).order('name');
  
  // First 1000 rows (unpaginated export query emulation)
  const { data: unpaginatedExportAtt } = await supabase
    .from('attendance')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate); // Default 1000 rows limit!

  const unpaginatedMap = new Set(unpaginatedExportAtt.map(a => `${a.staff_id}_${a.date}`));
  const fullPaginatedMap = new Map(allAtt.map(a => [`${a.staff_id}_${a.date}`, a]));

  const mismatchReport = [];

  for (const s of staffList) {
    const sAtt = allAtt.filter(a => a.staff_id === s.id);
    const mismatchedDates = [];

    for (let d = 1; d <= 31; d++) {
      const dateStr = `2026-07-${String(d).padStart(2, '0')}`;
      const key = `${s.id}_${dateStr}`;
      const realDbRow = fullPaginatedMap.get(key);
      const inUnpaginatedExport = unpaginatedMap.has(key);

      // Check if real DB row exists (check-in/out exists) BUT unpaginated export shows absent/blank because row was truncated!
      if (realDbRow && (realDbRow.check_in_time || realDbRow.status === 'present' || realDbRow.status === 'late')) {
        if (!inUnpaginatedExport) {
          mismatchedDates.push(dateStr);
        }
      }
    }

    if (mismatchedDates.length > 0) {
      mismatchReport.push({
        'Staff Name': s.name,
        'Number of mismatched days found': mismatchedDates.length,
        'Example date(s)': mismatchedDates.slice(0, 5).join(', ')
      });
    }
  }

  console.log('\n=== PART 2: FULL MISMATCH TABLE ACROSS ALL STAFF (UNPAGINATED EXPORT VS LIVE DB) ===');
  console.table(mismatchReport);
}

auditBug2().catch(console.error);

const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const tasks = [
  // Opening tasks
  { task_name: 'Main gate unlock', shift_window: 'opening', requires_photo: false, is_critical: false, display_order: 1 },
  { task_name: 'Side gate unlock', shift_window: 'opening', requires_photo: false, is_critical: false, display_order: 2 },
  { task_name: 'Lights ON', shift_window: 'opening', requires_photo: false, is_critical: false, display_order: 3 },
  { task_name: 'Freezer/fridge temp check', shift_window: 'opening', requires_photo: false, is_critical: false, display_order: 4 },
  { task_name: 'CCTV check', shift_window: 'opening', requires_photo: false, is_critical: false, display_order: 5 },
  { task_name: 'POS boot + cash float count', shift_window: 'opening', requires_photo: false, is_critical: false, display_order: 6 },
  { task_name: 'Cleanliness walk', shift_window: 'opening', requires_photo: false, is_critical: false, display_order: 7 },

  // Mid-shift tasks
  { task_name: 'Freezer temp re-check', shift_window: 'mid_shift', requires_photo: false, is_critical: false, display_order: 1 },
  { task_name: 'Cash drawer spot check', shift_window: 'mid_shift', requires_photo: false, is_critical: false, display_order: 2 },
  { task_name: 'Restock/shelf check', shift_window: 'mid_shift', requires_photo: false, is_critical: false, display_order: 3 },

  // Closing tasks
  { task_name: 'Cash count + reconciliation', shift_window: 'closing', requires_photo: false, is_critical: false, display_order: 1 },
  { task_name: 'POS shutdown', shift_window: 'closing', requires_photo: false, is_critical: false, display_order: 2 },
  { task_name: 'Freezer confirmed ON overnight', shift_window: 'closing', requires_photo: true, is_critical: true, display_order: 3 },
  { task_name: 'Side gate locked', shift_window: 'closing', requires_photo: true, is_critical: true, display_order: 4 },
  { task_name: 'Main gate locked', shift_window: 'closing', requires_photo: true, is_critical: true, display_order: 5 },
  { task_name: 'Lights OFF', shift_window: 'closing', requires_photo: false, is_critical: false, display_order: 6 },
  { task_name: 'Alarm set', shift_window: 'closing', requires_photo: false, is_critical: false, display_order: 7 }
];

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');

    // Check if tasks already exist
    const checkRes = await client.query('SELECT count(*) FROM sop_tasks');
    if (parseInt(checkRes.rows[0].count) > 0) {
      console.log('SOP tasks already seeded. Skipping.');
      return;
    }

    const branches = ['daily', 'hypermarket'];
    for (const branchId of branches) {
      for (const t of tasks) {
        await client.query(`
          INSERT INTO sop_tasks (branch_id, task_name, shift_window, requires_photo, is_critical, display_order, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [branchId, t.task_name, t.shift_window, t.requires_photo, t.is_critical, t.display_order, 'system']);
      }
    }
    console.log('SOP tasks seeded successfully for both daily and hypermarket branches!');
  } catch (err) {
    console.error('Error seeding SOP tasks:', err);
  } finally {
    await client.end();
  }
}

main();

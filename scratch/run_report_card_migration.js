const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
CREATE TABLE IF NOT EXISTS role_permissions (
  role text PRIMARY KEY,
  can_view_report_card boolean DEFAULT false
);

ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;

-- Insert roles with their defaults if not already present
INSERT INTO role_permissions (role, can_view_report_card) VALUES
  ('admin', true),
  ('ops_manager', true),
  ('staff_executive', false),
  ('kiosk', false),
  ('staff', false),
  ('nearbi_homes_supervisor', false),
  ('partner_viewer', false)
ON CONFLICT (role) DO NOTHING;
`;

async function run() {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    console.log('Connected to Supabase Postgres');
    await client.query(sql);
    console.log('role_permissions table set up successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();

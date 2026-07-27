const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  performed_by text NOT NULL,
  performed_by_role text NOT NULL,
  staff_id uuid REFERENCES staff(id),
  target_description text,
  old_value text,
  new_value text,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_log_staff
  ON audit_log(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created
  ON audit_log(created_at DESC);
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('Audit log migration query executed successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

main();

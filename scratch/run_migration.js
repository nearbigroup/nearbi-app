const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
CREATE TABLE IF NOT EXISTS resignations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id),
  initiated_by text NOT NULL,
  initiated_at timestamptz DEFAULT now(),
  reason text NOT NULL CHECK (reason IN (
    'personal','better_opportunity','relocation',
    'performance','misconduct','other'
  )),
  reason_note text,
  notice_served text NOT NULL CHECK (notice_served IN (
    'yes','no','waived'
  )),
  last_working_day date NOT NULL,
  asset_cleared boolean DEFAULT false,
  asset_cleared_by text,
  asset_cleared_at timestamptz,
  asset_notes text,
  financial_cleared boolean DEFAULT false,
  financial_cleared_by text,
  financial_cleared_at timestamptz,
  financial_settlement_amount numeric,
  status text DEFAULT 'in_progress' CHECK (status IN (
    'in_progress','clearance_complete','approved','settled'
  )),
  approved_by text,
  approved_at timestamptz,
  rehire_eligible boolean,
  rehire_note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE resignations DISABLE ROW LEVEL SECURITY;

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS resignation_id uuid
  REFERENCES resignations(id);
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS is_resigned
  boolean NOT NULL DEFAULT false;
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('Migration queries executed successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

main();

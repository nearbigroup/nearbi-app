const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES staff(id) NOT NULL,
  requested_with uuid REFERENCES staff(id) NOT NULL,
  swap_date date NOT NULL,
  requester_original_role text,
  colleague_original_role text,
  status text DEFAULT 'pending_colleague' CHECK (status IN (
    'pending_colleague','declined','pending_ops_approval',
    'approved','rejected'
  )),
  colleague_responded_at timestamptz,
  ops_approved_by text,
  ops_approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE shift_swap_requests DISABLE ROW LEVEL SECURITY;
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('Shift Swap Table created successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

main();

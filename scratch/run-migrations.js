const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
let databaseUrl = '';

try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('DATABASE_URL=')) {
      databaseUrl = line.split('DATABASE_URL=')[1].trim();
      break;
    }
  }
} catch (err) {
  console.error('Error reading .env.local:', err);
  process.exit(1);
}

const sql = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  performed_by text NOT NULL,
  performed_by_role text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS staff_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  created_by text NOT NULL,
  branch_id text REFERENCES branches(id),
  target text DEFAULT 'all'
    CHECK (target IN ('all','daily','hypermarket')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE staff_announcements DISABLE ROW LEVEL SECURITY;

ALTER TABLE salary_confirmations
  ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false;

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS advance_balance numeric DEFAULT 0;

CREATE TABLE IF NOT EXISTS staff_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  mobile_number text NOT NULL UNIQUE,
  password text NOT NULL,
  must_change_password boolean DEFAULT true,
  last_login timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE staff_accounts DISABLE ROW LEVEL SECURITY;
`;

async function run() {
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set in .env.local');
    process.exit(1);
  }

  // pg connection string parser handles encoded characters automatically
  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');
    await client.query(sql);
    console.log('Migrations applied successfully!');
  } catch (err) {
    console.error('Error executing migrations:', err);
  } finally {
    await client.end();
  }
}

run();

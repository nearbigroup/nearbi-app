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
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS
  day_type text DEFAULT 'present';

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS
  short_attendance boolean DEFAULT false;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS
  early_leave_minutes integer DEFAULT 0;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS
  is_weekly_off boolean DEFAULT false;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS
  requires_ops_approval boolean DEFAULT false;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS
  day_of_week text;

ALTER TABLE late_fines
  ADD COLUMN IF NOT EXISTS
  waived_amount numeric DEFAULT 0;

ALTER TABLE late_fines
  ADD COLUMN IF NOT EXISTS
  waived_reason text;

ALTER TABLE special_fines
  ADD COLUMN IF NOT EXISTS
  waived_amount numeric DEFAULT 0;

ALTER TABLE special_fines
  ADD COLUMN IF NOT EXISTS
  waived_reason text;

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS
  advance_balance numeric DEFAULT 0;

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS
  profile_pending boolean DEFAULT true;

ALTER TABLE staff_accounts
  ADD COLUMN IF NOT EXISTS
  profile_completed boolean DEFAULT false;

ALTER TABLE salary_confirmations
  ADD COLUMN IF NOT EXISTS
  is_locked boolean DEFAULT false;

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
`;

async function run() {
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set in .env.local');
    process.exit(1);
  }

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

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Custom .env.local parser
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('.env.local file not found');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([\w.\-_]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      // Remove surrounding quotes if any
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.substring(1, value.length - 1);
      }
      if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  }
}

loadEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const client = new Client({
  connectionString,
});

const sql = `
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS
  pay_type text DEFAULT 'fixed_shift'
  CHECK (pay_type IN ('fixed_shift', 'hourly'));

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS
  standard_hours numeric DEFAULT 234;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS
  total_hours_logged numeric DEFAULT 0;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS
  photo_flagged boolean DEFAULT false;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS
  photo_flag_reason text;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS
  photo_flagged_by text;

ALTER TABLE break_settings
  ADD COLUMN IF NOT EXISTS
  branch_id text REFERENCES branches(id);

ALTER TABLE break_settings
  ADD COLUMN IF NOT EXISTS
  morning_tea_enabled boolean DEFAULT true;

ALTER TABLE break_settings
  ADD COLUMN IF NOT EXISTS
  food_break_enabled boolean DEFAULT true;

ALTER TABLE break_settings
  ADD COLUMN IF NOT EXISTS
  evening_tea_enabled boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL UNIQUE,
  role text NOT NULL,
  is_blocked boolean DEFAULT false,
  blocked_by text,
  blocked_at timestamptz,
  custom_permissions jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_permissions
  DISABLE ROW LEVEL SECURITY;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS
  affected_count integer DEFAULT 1;
`;

async function run() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');
    await client.query(sql);
    console.log('Migrations executed successfully!');
  } catch (err) {
    console.error('Error executing migrations:', err);
  } finally {
    await client.end();
  }
}

run();

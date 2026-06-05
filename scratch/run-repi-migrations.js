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
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS 
  requires_ops_approval boolean DEFAULT false;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS 
  day_of_week text;

ALTER TABLE late_fines
  ADD COLUMN IF NOT EXISTS 
  waived_amount numeric DEFAULT 0;

ALTER TABLE special_fines
  ADD COLUMN IF NOT EXISTS 
  waived_amount numeric DEFAULT 0;

ALTER TABLE staff_accounts
  ADD COLUMN IF NOT EXISTS 
  profile_completed boolean DEFAULT false;

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS 
  profile_pending boolean DEFAULT true;

ALTER TABLE salary_confirmations
  ADD COLUMN IF NOT EXISTS 
  is_locked boolean DEFAULT false;

ALTER TABLE staff_announcements
  ADD COLUMN IF NOT EXISTS
  target_staff_id uuid REFERENCES staff(id);

ALTER TABLE staff_announcements
  ADD COLUMN IF NOT EXISTS
  is_important boolean DEFAULT false;

ALTER TABLE staff_announcements
  ADD COLUMN IF NOT EXISTS
  show_on_kiosk boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES staff_announcements(id),
  staff_id uuid REFERENCES staff(id),
  read_at timestamptz DEFAULT now(),
  read_on_kiosk boolean DEFAULT false
);
ALTER TABLE announcement_reads 
  DISABLE ROW LEVEL SECURITY;
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

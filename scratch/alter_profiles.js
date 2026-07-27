const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS aadhaar_verification_status text DEFAULT 'pending' CHECK (aadhaar_verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS aadhaar_rejection_reason text,
  ADD COLUMN IF NOT EXISTS aadhaar_verified_by text,
  ADD COLUMN IF NOT EXISTS aadhaar_verified_at timestamptz,

  ADD COLUMN IF NOT EXISTS pan_verification_status text DEFAULT 'pending' CHECK (pan_verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS pan_rejection_reason text,
  ADD COLUMN IF NOT EXISTS pan_verified_by text,
  ADD COLUMN IF NOT EXISTS pan_verified_at timestamptz,

  ADD COLUMN IF NOT EXISTS bank_verification_status text DEFAULT 'pending' CHECK (bank_verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS bank_rejection_reason text,
  ADD COLUMN IF NOT EXISTS bank_verified_by text,
  ADD COLUMN IF NOT EXISTS bank_verified_at timestamptz,

  ADD COLUMN IF NOT EXISTS passport_verification_status text DEFAULT 'pending' CHECK (passport_verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS passport_rejection_reason text,
  ADD COLUMN IF NOT EXISTS passport_verified_by text,
  ADD COLUMN IF NOT EXISTS passport_verified_at timestamptz,

  ADD COLUMN IF NOT EXISTS driving_licence_verification_status text DEFAULT 'pending' CHECK (driving_licence_verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS driving_licence_rejection_reason text,
  ADD COLUMN IF NOT EXISTS driving_licence_verified_by text,
  ADD COLUMN IF NOT EXISTS driving_licence_verified_at timestamptz;
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('Altered staff_profiles successfully!');
  } catch (err) {
    console.error('Error altering table:', err);
  } finally {
    await client.end();
  }
}

main();

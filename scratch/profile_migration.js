const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
CREATE TABLE IF NOT EXISTS staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid UNIQUE NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  dob date,
  gender text,
  blood_group text,
  marital_status text,
  personal_phone text,
  personal_email text,
  current_address text,
  permanent_address text,
  aadhaar_number text,
  aadhaar_photo_url text,
  pan_number text,
  pan_photo_url text,
  bank_account_number text,
  bank_ifsc text,
  bank_name text,
  bank_proof_url text,
  passport_number text,
  passport_photo_url text,
  passport_expiry date,
  driving_licence_number text,
  driving_licence_photo_url text,
  driving_licence_expiry date,
  profile_photo_url text,
  medical_notes text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE staff_profiles DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS staff_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  name text NOT NULL,
  relation text NOT NULL,
  phone text NOT NULL
);
ALTER TABLE staff_emergency_contacts DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS staff_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN (
    'education_certificate','experience_certificate','other'
  )),
  doc_url text NOT NULL,
  doc_name text,
  verification_status text DEFAULT 'pending' CHECK (
    verification_status IN ('pending','verified','rejected')
  ),
  rejection_reason text,
  verified_by text,
  verified_at timestamptz,
  uploaded_at timestamptz DEFAULT now()
);
ALTER TABLE staff_documents DISABLE ROW LEVEL SECURITY;

-- Register storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-documents',
  'staff-documents',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('Profile and Document Management migrations executed successfully!');
  } catch (err) {
    console.error('Error running profile migration:', err);
  } finally {
    await client.end();
  }
}

main();

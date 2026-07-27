const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
ALTER TABLE staff_announcements
  ADD COLUMN IF NOT EXISTS requires_acknowledgement
  boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS announcement_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES staff_announcements(id) ON DELETE CASCADE NOT NULL,
  staff_id uuid REFERENCES staff(id) NOT NULL,
  acknowledged_at timestamptz DEFAULT now(),
  UNIQUE(announcement_id, staff_id)
);
ALTER TABLE announcement_acknowledgements DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS emergency_contacts_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text REFERENCES branches(id),
  contact_name text NOT NULL,
  contact_type text NOT NULL,
  phone_number text NOT NULL,
  notes text,
  display_order integer DEFAULT 0
);
ALTER TABLE emergency_contacts_directory DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS lost_and_found (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text REFERENCES branches(id) NOT NULL,
  item_description text NOT NULL,
  photo_url text,
  found_date date DEFAULT current_date,
  found_by uuid REFERENCES staff(id),
  status text DEFAULT 'unclaimed' CHECK (status IN (
    'unclaimed','claimed','disposed'
  )),
  claimed_by_name text,
  claimed_by_phone text,
  claimed_at timestamptz
);
ALTER TABLE lost_and_found DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS compliance_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text REFERENCES branches(id) NOT NULL,
  item_name text NOT NULL,
  renewal_type text NOT NULL CHECK (renewal_type IN (
    'fire_extinguisher','weighing_scale','pest_control',
    'fssai_license','other'
  )),
  last_service_date date,
  next_due_date date NOT NULL,
  reminder_days_before integer DEFAULT 30,
  notes text
);
ALTER TABLE compliance_renewals DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS staff_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) NOT NULL,
  suggestion_text text NOT NULL,
  submitted_at timestamptz DEFAULT now(),
  status text DEFAULT 'new' CHECK (status IN (
    'new','reviewed','implemented','declined'
  )),
  ops_response text
);
ALTER TABLE staff_suggestions DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS staff_recognition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) NOT NULL,
  award_type text NOT NULL,
  award_note text,
  awarded_by text NOT NULL,
  awarded_at timestamptz DEFAULT now(),
  period_label text
);
ALTER TABLE staff_recognition DISABLE ROW LEVEL SECURITY;

-- Seed Emergency Contacts if table is empty
INSERT INTO emergency_contacts_directory (contact_name, contact_type, phone_number, notes, display_order)
SELECT 'Police', 'Emergency Services', '100', 'Local Police Station helpline', 1
WHERE NOT EXISTS (SELECT 1 FROM emergency_contacts_directory WHERE contact_name = 'Police');

INSERT INTO emergency_contacts_directory (contact_name, contact_type, phone_number, notes, display_order)
SELECT 'Ambulance', 'Medical Services', '102', 'Emergency Medical Response', 2
WHERE NOT EXISTS (SELECT 1 FROM emergency_contacts_directory WHERE contact_name = 'Ambulance');

INSERT INTO emergency_contacts_directory (contact_name, contact_type, phone_number, notes, display_order)
SELECT 'Fire Station', 'Emergency Services', '101', 'Local Fire Department helpline', 3
WHERE NOT EXISTS (SELECT 1 FROM emergency_contacts_directory WHERE contact_name = 'Fire Station');

INSERT INTO emergency_contacts_directory (contact_name, contact_type, phone_number, notes, display_order)
SELECT 'AC Repair Technician', 'Maintenance', '9876543210', 'Primary HVAC service vendor', 4
WHERE NOT EXISTS (SELECT 1 FROM emergency_contacts_directory WHERE contact_name = 'AC Repair Technician');

INSERT INTO emergency_contacts_directory (contact_name, contact_type, phone_number, notes, display_order)
SELECT 'Electrician', 'Maintenance', '9876543211', 'On-call electrical maintenance vendor', 5
WHERE NOT EXISTS (SELECT 1 FROM emergency_contacts_directory WHERE contact_name = 'Electrician');

INSERT INTO emergency_contacts_directory (contact_name, contact_type, phone_number, notes, display_order)
SELECT 'IT Support Desk', 'Tech Support', '9876543212', 'Nearbi Head Office Tech helpline', 6
WHERE NOT EXISTS (SELECT 1 FROM emergency_contacts_directory WHERE contact_name = 'IT Support Desk');

INSERT INTO emergency_contacts_directory (contact_name, contact_type, phone_number, notes, display_order)
SELECT 'Company Owner Office', 'Management', '9876543213', 'Direct line to Nearbi Group Admin HQ', 7
WHERE NOT EXISTS (SELECT 1 FROM emergency_contacts_directory WHERE contact_name = 'Company Owner Office');
`;

async function run() {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    console.log('Connected to Supabase Postgres database.');
    await client.query(sql);
    console.log('SOP Part C migrations executed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();

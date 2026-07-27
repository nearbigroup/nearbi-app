const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text REFERENCES branches(id) NOT NULL,
  category text NOT NULL CHECK (category IN (
    'ac','freezer','lights','pos','plumbing',
    'stock_damage','customer_complaint','other'
  )),
  description text NOT NULL,
  photo_url text,
  reported_by uuid REFERENCES staff(id) NOT NULL,
  reported_at timestamptz DEFAULT now(),
  status text DEFAULT 'open' CHECK (status IN (
    'open','assigned','in_progress','fixed','closed'
  )),
  assigned_to text,
  priority text DEFAULT 'normal' CHECK (priority IN (
    'low','normal','urgent'
  )),
  fixed_at timestamptz,
  fixed_notes text
);
ALTER TABLE maintenance_tickets DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ticket_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES maintenance_tickets(id),
  activity_type text NOT NULL CHECK (activity_type IN (
    'created','status_changed','technician_visit','note_added'
  )),
  visitor_name text,
  visitor_type text CHECK (visitor_type IN (
    'electrician','ac_technician','pest_control','it_support',
    'plumber','other'
  )),
  note text,
  logged_by text NOT NULL,
  logged_at timestamptz DEFAULT now()
);
ALTER TABLE ticket_activity_log DISABLE ROW LEVEL SECURITY;
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('SOP B Tables created successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

main();

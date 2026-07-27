const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
CREATE TABLE IF NOT EXISTS sop_tasks ( 
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text REFERENCES branches(id) NOT NULL,
  task_name text NOT NULL,
  shift_window text NOT NULL CHECK (shift_window IN (
    'opening','mid_shift','closing'
  )),
  time_start time,
  time_end time,
  requires_photo boolean DEFAULT false,
  is_critical boolean DEFAULT false,
  active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sop_tasks DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS duty_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text REFERENCES branches(id) NOT NULL,
  shift_window text NOT NULL CHECK (shift_window IN (
    'opening','closing'
  )),
  role_type text NOT NULL CHECK (role_type IN (
    'primary','backup'
  )),
  staff_id uuid REFERENCES staff(id) NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  active boolean DEFAULT true
);
ALTER TABLE duty_roster DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS daily_task_completion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES sop_tasks(id) NOT NULL,
  branch_id text REFERENCES branches(id) NOT NULL,
  task_date date NOT NULL DEFAULT current_date,
  completed_by uuid REFERENCES staff(id),
  completed_at timestamptz,
  photo_proof_url text,
  status text DEFAULT 'pending' CHECK (status IN (
    'pending','completed','missed'
  )),
  duty_role text,
  UNIQUE(task_id, task_date)
);
ALTER TABLE daily_task_completion DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS store_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text REFERENCES branches(id) NOT NULL,
  status_date date NOT NULL DEFAULT current_date,
  opened_at timestamptz,
  opened_by uuid REFERENCES staff(id),
  closed_at timestamptz,
  closed_by uuid REFERENCES staff(id),
  closing_time_override time,
  override_reason text,
  UNIQUE(branch_id, status_date)
);
ALTER TABLE store_status DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS handover_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id text REFERENCES branches(id) NOT NULL,
  note_date date NOT NULL DEFAULT current_date,
  category text CHECK (category IN (
    'maintenance','stock','customer_staff','summary'
  )),
  note_text text NOT NULL,
  photo_url text,
  written_by uuid REFERENCES staff(id),
  written_at timestamptz DEFAULT now(),
  acknowledged_by uuid REFERENCES staff(id),
  acknowledged_at timestamptz,
  resolution_status text DEFAULT 'pending' CHECK (
    resolution_status IN ('pending','done','still_pending')
  ),
  carried_from uuid REFERENCES handover_notes(id)
);
ALTER TABLE handover_notes DISABLE ROW LEVEL SECURITY;
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('SOP Tables created successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

main();

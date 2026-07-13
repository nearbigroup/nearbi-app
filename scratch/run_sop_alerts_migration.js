const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
CREATE TABLE IF NOT EXISTS staff_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN (
    'late_pattern','fine_pattern','absent_pattern'
  )),
  trigger_summary text NOT NULL,
  flagged_at timestamptz DEFAULT now(),
  message_status text DEFAULT 'not_sent' CHECK (
    message_status IN ('not_sent','sent')
  ),
  sent_at timestamptz,
  sent_by text,
  ops_note text,
  occurrence_count integer DEFAULT 1,
  escalation_level text DEFAULT 'normal' CHECK (
    escalation_level IN ('normal','repeat','habitual')
  ),
  resolved boolean DEFAULT false,
  resolved_at timestamptz
);
ALTER TABLE staff_alerts DISABLE ROW LEVEL SECURITY;
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('Staff Alerts Table created successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

main();

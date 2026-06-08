ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS
  day_type text DEFAULT 'present';

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS
  is_weekly_off boolean DEFAULT false;

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

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS
  advance_balance numeric DEFAULT 0;

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS
  short_attendance boolean DEFAULT false;


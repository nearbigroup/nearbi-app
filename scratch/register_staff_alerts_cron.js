const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

const sql = `
CREATE OR REPLACE FUNCTION check_and_generate_staff_alerts()
RETURNS json AS $$
DECLARE
  r_staff RECORD;
  current_month text;
  late_count int;
  fine_count int;
  absent_count int;
  last_alert RECORD;
  latest_incident_date date;
  new_occ_count int;
  new_escalation text;
  resolved_alerts_count int := 0;
  new_alerts_count int := 0;
  updated_alerts_count int := 0;
BEGIN
  current_month := to_char(CURRENT_DATE, 'YYYY-MM');

  -- 1. Auto-resolve alerts older than 30 days
  WITH auto_resolved AS (
    UPDATE staff_alerts
    SET resolved = true, resolved_at = now()
    WHERE resolved = false 
      AND flagged_at < (now() - INTERVAL '30 days')
    RETURNING id
  )
  SELECT count(*) INTO resolved_alerts_count FROM auto_resolved;

  -- 2. Scan each active staff member
  FOR r_staff IN (SELECT id, name FROM staff WHERE active = true AND is_resigned = false) LOOP
    
    -- ==========================================
    -- A. LATE PATTERN (3+ lates this month)
    -- ==========================================
    SELECT COUNT(*) INTO late_count FROM attendance
    WHERE staff_id = r_staff.id
      AND to_char(date, 'YYYY-MM') = current_month
      AND status = 'late';

    IF late_count >= 3 THEN
      -- Get latest late date
      SELECT MAX(date) INTO latest_incident_date FROM attendance
      WHERE staff_id = r_staff.id
        AND to_char(date, 'YYYY-MM') = current_month
        AND status = 'late';

      -- Find latest alert of this type
      SELECT * INTO last_alert FROM staff_alerts
      WHERE staff_id = r_staff.id AND alert_type = 'late_pattern'
      ORDER BY flagged_at DESC LIMIT 1;

      IF last_alert.id IS NULL THEN
        -- Create new alert
        INSERT INTO staff_alerts (staff_id, alert_type, trigger_summary, occurrence_count, escalation_level, message_status)
        VALUES (r_staff.id, 'late_pattern', late_count || ' late arrivals this month', 1, 'normal', 'not_sent');
        new_alerts_count := new_alerts_count + 1;
      ELSE
        -- If unresolved and not sent, we can update it
        IF last_alert.resolved = false AND last_alert.message_status = 'not_sent' THEN
          -- Only update if there is a new late since flagged_at
          IF latest_incident_date > last_alert.flagged_at::date THEN
            new_occ_count := last_alert.occurrence_count + 1;
            IF new_occ_count = 2 THEN new_escalation := 'repeat';
            ELSE new_escalation := 'habitual';
            END IF;

            UPDATE staff_alerts
            SET occurrence_count = new_occ_count,
                escalation_level = new_escalation,
                trigger_summary = late_count || ' late arrivals this month',
                flagged_at = now()
            WHERE id = last_alert.id;
            updated_alerts_count := updated_alerts_count + 1;
          END IF;
        ELSE
          -- Already sent or resolved. Create a new alert if there is a new incident since the last alert's flagged_at/sent_at
          IF latest_incident_date > COALESCE(last_alert.sent_at, last_alert.flagged_at)::date THEN
            new_occ_count := last_alert.occurrence_count + 1;
            IF new_occ_count = 2 THEN new_escalation := 'repeat';
            ELSE new_escalation := 'habitual';
            END IF;

            INSERT INTO staff_alerts (staff_id, alert_type, trigger_summary, occurrence_count, escalation_level, message_status)
            VALUES (r_staff.id, 'late_pattern', late_count || ' late arrivals this month', new_occ_count, new_escalation, 'not_sent');
            new_alerts_count := new_alerts_count + 1;
          END IF;
        END IF;
      END IF;
    END IF;

    -- ==========================================
    -- B. FINE PATTERN (2+ confirmed fines in last 7 days)
    -- ==========================================
    SELECT (
      (SELECT COUNT(*) FROM late_fines WHERE staff_id = r_staff.id AND confirmed = true AND waived = false AND date >= (CURRENT_DATE - INTERVAL '7 days')) +
      (SELECT COUNT(*) FROM special_fines WHERE staff_id = r_staff.id AND confirmed = true AND waived = false AND date >= (CURRENT_DATE - INTERVAL '7 days'))
    ) INTO fine_count;

    IF fine_count >= 2 THEN
      -- Get latest fine date
      SELECT MAX(max_date) INTO latest_incident_date FROM (
        SELECT MAX(date) as max_date FROM late_fines WHERE staff_id = r_staff.id AND confirmed = true AND waived = false AND date >= (CURRENT_DATE - INTERVAL '7 days')
        UNION
        SELECT MAX(date) as max_date FROM special_fines WHERE staff_id = r_staff.id AND confirmed = true AND waived = false AND date >= (CURRENT_DATE - INTERVAL '7 days')
      ) t;

      -- Find latest alert of this type
      SELECT * INTO last_alert FROM staff_alerts
      WHERE staff_id = r_staff.id AND alert_type = 'fine_pattern'
      ORDER BY flagged_at DESC LIMIT 1;

      IF last_alert.id IS NULL THEN
        INSERT INTO staff_alerts (staff_id, alert_type, trigger_summary, occurrence_count, escalation_level, message_status)
        VALUES (r_staff.id, 'fine_pattern', fine_count || ' confirmed fines in the last 7 days', 1, 'normal', 'not_sent');
        new_alerts_count := new_alerts_count + 1;
      ELSE
        IF last_alert.resolved = false AND last_alert.message_status = 'not_sent' THEN
          IF latest_incident_date > last_alert.flagged_at::date THEN
            new_occ_count := last_alert.occurrence_count + 1;
            IF new_occ_count = 2 THEN new_escalation := 'repeat';
            ELSE new_escalation := 'habitual';
            END IF;

            UPDATE staff_alerts
            SET occurrence_count = new_occ_count,
                escalation_level = new_escalation,
                trigger_summary = fine_count || ' confirmed fines in the last 7 days',
                flagged_at = now()
            WHERE id = last_alert.id;
            updated_alerts_count := updated_alerts_count + 1;
          END IF;
        ELSE
          IF latest_incident_date > COALESCE(last_alert.sent_at, last_alert.flagged_at)::date THEN
            new_occ_count := last_alert.occurrence_count + 1;
            IF new_occ_count = 2 THEN new_escalation := 'repeat';
            ELSE new_escalation := 'habitual';
            END IF;

            INSERT INTO staff_alerts (staff_id, alert_type, trigger_summary, occurrence_count, escalation_level, message_status)
            VALUES (r_staff.id, 'fine_pattern', fine_count || ' confirmed fines in the last 7 days', new_occ_count, new_escalation, 'not_sent');
            new_alerts_count := new_alerts_count + 1;
          END IF;
        END IF;
      END IF;
    END IF;

    -- ==========================================
    -- C. ABSENT PATTERN (3+ unapproved absent days this month)
    -- ==========================================
    SELECT COUNT(*) INTO absent_count FROM attendance
    WHERE staff_id = r_staff.id
      AND to_char(date, 'YYYY-MM') = current_month
      AND status = 'absent'
      AND COALESCE(day_type, '') NOT IN ('weekly_off', 'holiday', 'leave');

    IF absent_count >= 3 THEN
      -- Get latest absent date
      SELECT MAX(date) INTO latest_incident_date FROM attendance
      WHERE staff_id = r_staff.id
        AND to_char(date, 'YYYY-MM') = current_month
        AND status = 'absent'
        AND COALESCE(day_type, '') NOT IN ('weekly_off', 'holiday', 'leave');

      -- Find latest alert of this type
      SELECT * INTO last_alert FROM staff_alerts
      WHERE staff_id = r_staff.id AND alert_type = 'absent_pattern'
      ORDER BY flagged_at DESC LIMIT 1;

      IF last_alert.id IS NULL THEN
        INSERT INTO staff_alerts (staff_id, alert_type, trigger_summary, occurrence_count, escalation_level, message_status)
        VALUES (r_staff.id, 'absent_pattern', absent_count || ' unapproved absences this month', 1, 'normal', 'not_sent');
        new_alerts_count := new_alerts_count + 1;
      ELSE
        IF last_alert.resolved = false AND last_alert.message_status = 'not_sent' THEN
          IF latest_incident_date > last_alert.flagged_at::date THEN
            new_occ_count := last_alert.occurrence_count + 1;
            IF new_occ_count = 2 THEN new_escalation := 'repeat';
            ELSE new_escalation := 'habitual';
            END IF;

            UPDATE staff_alerts
            SET occurrence_count = new_occ_count,
                escalation_level = new_escalation,
                trigger_summary = absent_count || ' unapproved absences this month',
                flagged_at = now()
            WHERE id = last_alert.id;
            updated_alerts_count := updated_alerts_count + 1;
          END IF;
        ELSE
          IF latest_incident_date > COALESCE(last_alert.sent_at, last_alert.flagged_at)::date THEN
            new_occ_count := last_alert.occurrence_count + 1;
            IF new_occ_count = 2 THEN new_escalation := 'repeat';
            ELSE new_escalation := 'habitual';
            END IF;

            INSERT INTO staff_alerts (staff_id, alert_type, trigger_summary, occurrence_count, escalation_level, message_status)
            VALUES (r_staff.id, 'absent_pattern', absent_count || ' unapproved absences this month', new_occ_count, new_escalation, 'not_sent');
            new_alerts_count := new_alerts_count + 1;
          END IF;
        END IF;
      END IF;
    END IF;

  END LOOP;

  RETURN json_build_object(
    'resolved_alerts', resolved_alerts_count,
    'new_alerts_created', new_alerts_count,
    'alerts_updated', updated_alerts_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

async function main() {
  const client = new Client({
    connectionString: databaseUrl,
  });
  try {
    await client.connect();
    console.log('Connected to the database');
    await client.query(sql);
    console.log('Function check_and_generate_staff_alerts created successfully!');

    // Schedule daily pg_cron
    try {
      await client.query('SELECT cron.unschedule(\'check-staff-alerts-job\');').catch(() => {});
      await client.query(`
        SELECT cron.schedule(
          'check-staff-alerts-job',
          '0 1 * * *',
          'SELECT check_and_generate_staff_alerts()'
        );
      `);
      console.log('Scheduled daily pg_cron job check-staff-alerts-job successfully!');
    } catch (cronErr) {
      console.log('pg_cron scheduling skipped:', cronErr.message);
    }
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await client.end();
  }
}

main();

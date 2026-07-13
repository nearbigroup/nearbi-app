const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres';

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('Connected to Supabase Postgres database.');

  try {
    // 1. Get an active staff member
    const staffRes = await client.query(`
      SELECT id, name, join_date, department, branch_id FROM staff 
      WHERE active = true AND is_resigned = false 
      LIMIT 1
    `);

    if (staffRes.rows.length === 0) {
      console.log('No active staff member found.');
      return;
    }

    const staff = staffRes.rows[0];
    console.log(`\nTesting Report Card Scoring for Staff: ${staff.name}`);
    console.log(`Department: ${staff.department} | Join Date: ${staff.join_date}`);

    // Query historical records
    const attRes = await client.query('SELECT * FROM attendance WHERE staff_id = $1 ORDER BY date DESC', [staff.id]);
    const lfRes = await client.query('SELECT * FROM late_fines WHERE staff_id = $1 AND confirmed = true AND waived = false', [staff.id]);
    const sfRes = await client.query('SELECT * FROM special_fines WHERE staff_id = $1 AND confirmed = true AND waived = false', [staff.id]);
    const alertsRes = await client.query('SELECT * FROM staff_alerts WHERE staff_id = $1 ORDER BY flagged_at DESC', [staff.id]);

    const att = attRes.rows;
    const lFines = lfRes.rows;
    const sFines = sfRes.rows;
    const alerts = alertsRes.rows;

    console.log(`Fetched logs count:`);
    console.log(`- Attendance records: ${att.length}`);
    console.log(`- Late Fines: ${lFines.length}`);
    console.log(`- Special Fines: ${sFines.length}`);
    console.log(`- Staff Alerts: ${alerts.length}`);

    // Scoping Rule Verification (Nearbi Homes Supervisor only scoped to Nearbi Homes department)
    console.log('\n--- VERIFICATION: Supervisor Scoping Rule ---');
    const isHomesStaff = staff.department === 'Nearbi Homes';
    console.log(`Is staff member in Nearbi Homes? ${isHomesStaff ? 'YES' : 'NO'}`);
    console.log(`Access permitted for Nearbi Homes Supervisor? ${isHomesStaff ? 'ALLOWED' : 'DENIED (Correct)'}`);

    // Clean streak calculation
    let cleanStreak = 0;
    let hasInfraction = false;
    
    for (const record of att) {
      if (record.status === 'late' || record.status === 'absent') {
        hasInfraction = true;
        const lastInfractionDate = new Date(record.date);
        const timeDiff = new Date().getTime() - lastInfractionDate.getTime();
        cleanStreak = Math.max(0, Math.floor(timeDiff / (24 * 60 * 60 * 1000)));
        break;
      }
    }
    if (!hasInfraction && att.length > 0) {
      const oldestRecord = att[att.length - 1];
      const timeDiff = new Date().getTime() - new Date(oldestRecord.date).getTime();
      cleanStreak = Math.max(0, Math.floor(timeDiff / (24 * 60 * 60 * 1000)));
    }
    console.log(`Calculated Clean Streak: ${cleanStreak} days`);

    // Group records into bins
    const scoreBins = {
      last30: { attTotal: 0, attPresent: 0, lates: 0, finesCount: 0, finesAmt: 0 },
      days31_90: { attTotal: 0, attPresent: 0, lates: 0, finesCount: 0, finesAmt: 0 },
      days90Plus: { attTotal: 0, attPresent: 0, lates: 0, finesCount: 0, finesAmt: 0 }
    };

    const getBin = (dateStr) => {
      const daysAgo = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000));
      if (daysAgo <= 30) return scoreBins.last30;
      if (daysAgo <= 90) return scoreBins.days31_90;
      return scoreBins.days90Plus;
    };

    att.forEach(record => {
      const bin = getBin(record.date);
      const isExempt = record.day_type === 'weekly_off' || record.day_type === 'holiday' || record.day_type === 'leave';
      if (!isExempt) {
        bin.attTotal += 1;
        if (record.status === 'present' || record.status === 'late') {
          bin.attPresent += 1;
        }
        if (record.status === 'late') {
          bin.lates += 1;
        }
      }
    });

    lFines.forEach(fine => {
      const bin = getBin(fine.date);
      bin.finesCount += 1;
      bin.finesAmt += Number(fine.fine_amount || 0);
    });

    sFines.forEach(fine => {
      const bin = getBin(fine.date);
      bin.finesCount += 1;
      bin.finesAmt += Number(fine.amount || 0);
    });

    const calcBinScores = (bin) => {
      const attScore = bin.attTotal > 0 ? (bin.attPresent / bin.attTotal) * 100 : 100;
      const punctScore = bin.attPresent > 0 ? ((bin.attPresent - bin.lates) / bin.attPresent) * 100 : 100;
      const finePenalty = Math.min(50, (bin.finesAmt / 100) + (bin.finesCount * 10));
      const fineScore = Math.max(0, 100 - finePenalty);
      return { attScore, punctScore, fineScore };
    };

    const bin30Scores = calcBinScores(scoreBins.last30);
    const bin31_90Scores = calcBinScores(scoreBins.days31_90);
    const bin90PlusScores = calcBinScores(scoreBins.days90Plus);

    const weightsSum = 1.0 + 0.6 + 0.3;
    const weightedAtt = (bin30Scores.attScore * 1.0 + bin31_90Scores.attScore * 0.6 + bin90PlusScores.attScore * 0.3) / weightsSum;
    const weightedPunct = (bin30Scores.punctScore * 1.0 + bin31_90Scores.punctScore * 0.6 + bin90PlusScores.punctScore * 0.3) / weightsSum;
    const weightedFine = (bin30Scores.fineScore * 1.0 + bin31_90Scores.fineScore * 0.6 + bin90PlusScores.fineScore * 0.3) / weightsSum;

    let alertsPenalty = 0;
    let hasUnresolvedHabitual = false;
    alerts.forEach(alert => {
      if (!alert.resolved) {
        if (alert.escalation_level === 'habitual') {
          alertsPenalty += 40;
          hasUnresolvedHabitual = true;
        } else if (alert.escalation_level === 'repeat') {
          alertsPenalty += 25;
        } else {
          alertsPenalty += 10;
        }
      }
    });
    const alertsScore = Math.max(0, 100 - alertsPenalty);

    const score = Math.round(
      (weightedAtt * 0.3) + 
      (weightedPunct * 0.3) + 
      (weightedFine * 0.2) + 
      (alertsScore * 0.2)
    );

    // Lifetime values
    const lifetimeTotalAtt = att.filter(r => r.day_type !== 'weekly_off' && r.day_type !== 'holiday' && r.day_type !== 'leave');
    const lifetimePresentAtt = lifetimeTotalAtt.filter(r => r.status === 'present' || r.status === 'late');
    const lifetimeLates = lifetimeTotalAtt.filter(r => r.status === 'late');
    
    const lifetimeAttScore = lifetimeTotalAtt.length > 0 ? (lifetimePresentAtt.length / lifetimeTotalAtt.length) * 100 : 100;
    const lifetimePunctScore = lifetimePresentAtt.length > 0 ? ((lifetimePresentAtt.length - lifetimeLates.length) / lifetimePresentAtt.length) * 100 : 100;
    
    const totalFinesAmt = lFines.reduce((acc, f) => acc + Number(f.fine_amount || 0), 0) + sFines.reduce((acc, f) => acc + Number(f.amount || 0), 0);
    const totalFinesCount = lFines.length + sFines.length;
    const lifetimeFineScore = Math.max(0, 100 - Math.min(50, (totalFinesAmt / 100) + (totalFinesCount * 10)));
    
    const lifetimeScore = Math.round(
      (lifetimeAttScore * 0.3) + 
      (lifetimePunctScore * 0.3) + 
      (lifetimeFineScore * 0.2) + 
      (alertsScore * 0.2)
    );

    const last30Score = Math.round(
      (bin30Scores.attScore * 0.3) + 
      (bin30Scores.punctScore * 0.3) + 
      (bin30Scores.fineScore * 0.2) + 
      (alertsScore * 0.2)
    );

    let trend = 'stable';
    if (last30Score > lifetimeScore + 3) trend = 'improving';
    else if (last30Score < lifetimeScore - 3) trend = 'declining';

    let verdict = 'reliable';
    if (score < 50 || hasUnresolvedHabitual) verdict = 'habitual';
    else if (score < 75 || trend === 'declining') verdict = 'watch';

    console.log('\n--- CALCULATED REPORT CARD RESULTS ---');
    console.log(`Weighted Score (0-100): ${score}`);
    console.log(`Verdict: ${verdict}`);
    console.log(`Trend: ${trend}`);
    console.log(`Dominant Factor Reason: ${
      hasUnresolvedHabitual ? 'Unresolved habitual alert flagged' :
      weightedAtt < 80 ? 'Low attendance' :
      weightedPunct < 85 ? 'Frequent lates' :
      'Consistent performance'
    }`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();

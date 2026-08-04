import { supabase } from './supabase';

/**
 * Checks for any resignations where last_working_day < today AND staff.is_resigned = false.
 * Updates staff.is_resigned = true and resignations.status = 'settled'.
 * Historical attendance, fine, and salary records remain untouched.
 */
export async function autoProcessResignations(): Promise<number> {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Find all approved/in_progress/clearance_complete resignations whose last_working_day is in the past
    const { data: pastResignations, error: resErr } = await supabase
      .from('resignations')
      .select('id, staff_id, last_working_day, status, staff:staff_id(is_resigned)')
      .lt('last_working_day', todayStr)
      .neq('status', 'settled');

    if (resErr || !pastResignations || pastResignations.length === 0) {
      return 0;
    }

    let processedCount = 0;

    for (const r of pastResignations) {
      // 1. Update staff is_resigned to true
      await supabase
        .from('staff')
        .update({ is_resigned: true })
        .eq('id', r.staff_id);

      // 2. Mark resignation status as settled
      await supabase
        .from('resignations')
        .update({ status: 'settled' })
        .eq('id', r.id);

      processedCount++;
    }

    return processedCount;
  } catch (err) {
    console.error('Error auto-processing past resignations:', err);
    return 0;
  }
}

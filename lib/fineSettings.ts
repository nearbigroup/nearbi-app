export interface FineSettings {
  id?: string;
  yellow_fine: number;
  orange_fine: number;
  red_fine: number;
  yellow_free_passes: number;
  updated_by?: string | null;
  updated_at?: string | null;
}

export const DEFAULT_FINE_SETTINGS: FineSettings = {
  yellow_fine: 20,
  orange_fine: 30,
  red_fine: 50,
  yellow_free_passes: 4,
};

/**
 * Fetches the latest fine settings from the database, ordered by updated_at DESCENDING.
 * Returns the fallback { yellow_fine: 20, orange_fine: 30, red_fine: 50, yellow_free_passes: 4 }
 * if no record is found or an error occurs.
 */
export async function getFineSettings(supabaseClient: any): Promise<FineSettings> {
  try {
    const { data, error } = await supabaseClient
      .from('fine_settings')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return { ...DEFAULT_FINE_SETTINGS };
    }

    return {
      id: data.id,
      yellow_fine: Number(data.yellow_fine ?? DEFAULT_FINE_SETTINGS.yellow_fine),
      orange_fine: Number(data.orange_fine ?? DEFAULT_FINE_SETTINGS.orange_fine),
      red_fine: Number(data.red_fine ?? DEFAULT_FINE_SETTINGS.red_fine),
      yellow_free_passes: Number(data.yellow_free_passes ?? DEFAULT_FINE_SETTINGS.yellow_free_passes),
      updated_by: data.updated_by,
      updated_at: data.updated_at,
    };
  } catch (err) {
    console.error('Error fetching fine settings:', err);
    return { ...DEFAULT_FINE_SETTINGS };
  }
}

/**
 * Pure function to calculate yellow late occurrence and fine amount.
 *
 * Rules:
 * - Count distinct EARLIER dates in the same month where staff had a yellow late punch.
 * - Current punch date is ignored (only dates strictly < current punch date in the same month are counted).
 * - occurrence = (number of earlier distinct yellow dates in the same month) + 1.
 * - Fine is applied only if occurrence > yellow_free_passes.
 */
export function calculateYellowLateFine(
  earlierYellowDates: string[],
  freePasses: number,
  yellowFine: number
): { occurrence: number; fineAmount: number; isFreePass: boolean } {
  const uniqueEarlierDates = new Set(earlierYellowDates);
  const occurrence = uniqueEarlierDates.size + 1;
  const isFreePass = occurrence <= freePasses;
  return {
    occurrence,
    fineAmount: isFreePass ? 0 : yellowFine,
    isFreePass,
  };
}

/**
 * Filter an array of attendance records to find earlier distinct yellow dates in the same month.
 * Strictly ignores punchDate itself, any date outside the month of punchDate, and any date >= punchDate.
 */
export function getEarlierYellowDates(
  attendanceRecords: { date: string; color_code?: string | null }[],
  punchDate: string
): string[] {
  const monthPrefix = punchDate.substring(0, 7);
  const distinctDates = new Set<string>();

  for (const rec of attendanceRecords) {
    if (
      rec.color_code === 'yellow' &&
      rec.date.startsWith(monthPrefix) &&
      rec.date < punchDate
    ) {
      distinctDates.add(rec.date);
    }
  }

  return Array.from(distinctDates);
}

/**
 * Pure function: Determines whether a staff member is exempt from late fines.
 * A staff member is exempt if:
 * 1. staff object is null/undefined
 * 2. pay_type is 'hourly'
 * 3. shift_id is null, undefined, or empty string
 */
export function isExemptFromLateFines(
  staff: { pay_type?: string | null; shift_id?: string | null } | null | undefined
): boolean {
  if (!staff) return true;
  if (staff.pay_type === 'hourly') return true;
  if (!staff.shift_id || String(staff.shift_id).trim() === '') return true;
  return false;
}


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

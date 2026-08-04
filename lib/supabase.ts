import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Executes a Supabase query with automatic range pagination to retrieve all matching records,
 * preventing silent data truncation at Supabase's default 1,000-row REST API limit.
 */
export async function fetchAllPages<T = any>(
  buildQuery: (start: number, end: number) => any
): Promise<{ data: T[]; error: any }> {
  let allRows: T[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const rangeStart = page * pageSize;
    const rangeEnd = (page + 1) * pageSize - 1;
    const { data, error } = await buildQuery(rangeStart, rangeEnd);

    if (error) {
      return { data: allRows, error };
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows = allRows.concat(data as T[]);
    if (data.length < pageSize) {
      break;
    }

    page++;
  }

  return { data: allRows, error: null };
}

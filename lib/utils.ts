export function formatTime12hr(time24: string | null | undefined): string {
  if (!time24) return '';
  const trimmed = time24.trim();
  if (!trimmed) return '';
  // Check if format is HH:MM or HH:MM:SS
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  
  let h = Number(parts[0]);
  let m = Number(parts[1]);
  
  if (isNaN(h) || isNaN(m)) return trimmed;
  
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

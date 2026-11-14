/**
 * Common export header helper for reports.
 * Matches role names and date/time format used in components/salary/MonthlyReportTab.tsx.
 */

export function getRoleDisplayName(user: any): string {
  if (user?.name) return user.name;
  const roleMap: Record<string, string> = {
    'admin': 'Owner',
    'ops_manager': 'Ops Manager',
    'staff_executive': 'Head HR',
    'nearbi_homes_supervisor': 'Nearbi Homes Supervisor',
    'partner_viewer': 'Partner',
    'kiosk': 'Kiosk',
  };
  return roleMap[user?.role || ''] || 'System';
}

export function getExportHeader(user: any, date: Date = new Date()): string {
  const roleDisplayName = getRoleDisplayName(user);
  const dateStr = date.toLocaleDateString('en-IN');
  const timeStr = date.toLocaleTimeString('en-IN');
  return `Generated on ${dateStr} at ${timeStr} by ${roleDisplayName}`;
}

export type Role =
  | 'admin'
  | 'ops_manager'
  | 'staff_executive'
  | 'kiosk'
  | 'staff'
  | 'nearbi_homes_supervisor'
  | 'partner_viewer';

/**
 * Returns true if the role is configured as read-only.
 * Currently, only 'partner_viewer' is a read-only role.
 */
export function isReadOnlyRole(role?: Role | string | null): boolean {
  if (!role) return false;
  return role === 'partner_viewer';
}

/**
 * Single source of truth helper for write/mutation permissions.
 * Returns true if the authenticated role is allowed to modify/write data or trigger administrative actions.
 * Returns false for read-only roles (e.g., partner_viewer) or unauthenticated users.
 */
export function canWrite(role?: Role | string | null): boolean {
  if (!role) return false;
  return !isReadOnlyRole(role);
}

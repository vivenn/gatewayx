// Roles and permissions are intentionally data, not code — "Permissions
// should be configurable" per the PRD. ROLE_PERMISSIONS is the default seed;
// Tier 2 moves this into Postgres so it's editable without a redeploy.
export enum Role {
  Admin = 'admin',
  Manager = 'manager',
  User = 'user',
}

export type Permission = string; // e.g. "orders:read", "orders:write"

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.Admin]: ['*'],
  [Role.Manager]: ['orders:read', 'orders:write', 'users:read'],
  [Role.User]: ['orders:read'],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return granted.includes('*') || granted.includes(permission);
}

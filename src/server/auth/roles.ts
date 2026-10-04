/**
 * The console's own roles. The API decides who is an admin; this decides what
 * the console lets them do, because the API has no viewer concept to ask about.
 *
 * `viewer` exists so a deployment can hand out a read-only console account. The
 * enforcement is in the BFF, on every route: a viewer never reaches a mutation
 * and never sees a secret's plaintext, whatever the UI renders.
 */

export const ROLES = ["owner", "admin", "viewer"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  viewer: "Viewer",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Admins may reach every screen. Viewers may reach the read-only ones. */
export function isAdmin(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Whether the role may change anything at all. Every non-GET route the console
 * serves checks this before it touches the API or the store, so a viewer is
 * refused with 403 rather than being allowed through and filtered later.
 */
export function mayMutate(role: Role): boolean {
  return isAdmin(role);
}

/**
 * Whether the role may see secret material: the list of names, and the reveal
 * flow. A viewer is told the console has a vault and is not shown its contents.
 */
export function mayReachSecrets(role: Role): boolean {
  return isAdmin(role);
}

/** Whether the role may act on other operators, which the API only lets admins do. */
export function mayManageOperators(role: Role): boolean {
  return role === "owner";
}

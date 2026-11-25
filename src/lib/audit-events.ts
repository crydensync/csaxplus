export type AuditEventTone = "ok" | "bad" | "warn" | "neutral";

const FAILED_EVENTS = new Set([
  "login_failed",
  "totp_challenge_failed",
  "webauthn_challenge_failed",
  "recovery_code_failed",
  "password_breach_rejected",
  "api_key_rejected",
]);

const REVIEW_EVENTS = new Set([
  "account_locked",
  "token_reuse_detected",
  "anomaly_detected",
  "credential_stuffing_detected",
  "admin_user_suspended",
]);

const SUCCESS_EVENTS = new Set([
  "signup_success",
  "login_success",
  "logout",
  "logout_all",
  "token_rotated",
  "session_revoked",
  "password_changed",
  "email_changed",
  "oauth_linked",
  "totp_enabled",
  "totp_disabled",
  "webauthn_registered",
  "webauthn_removed",
  "magic_link_requested",
  "recovery_codes_generated",
  "recovery_code_used",
  "password_hash_upgraded",
  "api_key_created",
  "api_key_revoked",
  "admin_user_created",
  "admin_account_unlocked",
  "admin_user_unsuspended",
  "admin_sessions_revoked",
  "admin_totp_disabled",
  "admin_oauth_unlinked",
]);

/** Color only known event outcomes; unknown host-defined events stay neutral. */
export function auditEventTone(eventType: string): AuditEventTone {
  if (FAILED_EVENTS.has(eventType)) return "bad";
  if (REVIEW_EVENTS.has(eventType)) return "warn";
  if (SUCCESS_EVENTS.has(eventType)) return "ok";
  return "neutral";
}

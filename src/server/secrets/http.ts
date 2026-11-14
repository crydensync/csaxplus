import "server-only";

import { responseForFailure } from "@/server/auth/failures";
import { jsonError } from "@/server/auth/response";
import { SecretVaultError } from "./vault";

export function secretFailure(error: unknown): Response {
  if (error instanceof SecretVaultError) {
    return jsonError(error.status, error.code, error.message);
  }
  return responseForFailure(error);
}

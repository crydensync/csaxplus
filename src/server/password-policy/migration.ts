import "server-only";

import {
  fetchHashMigration,
  fetchPasswordPolicy,
  type HashMigration,
  type PasswordPolicy,
} from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

export type PasswordMigrationPage = {
  migration: Section<HashMigration>;
  policy: Section<PasswordPolicy>;
};

/** Read the available hash migration report for the operator's API token. */
export async function readPasswordMigration(options: {
  token: string;
}): Promise<PasswordMigrationPage> {
  const [migration, policy] = await Promise.all([
    fetchHashMigration({ token: options.token }).then(
      (data): Section<HashMigration> => ({ state: "ok", data }),
      (error): Section<HashMigration> =>
        sectionFailure(error, "the password hash report", noStoreDetail("password hashes")),
    ),
    fetchPasswordPolicy({ token: options.token }).then(
      (data): Section<PasswordPolicy> => ({ state: "ok", data }),
      (error): Section<PasswordPolicy> =>
        sectionFailure(error, "the active password policy", noStoreDetail("password policy")),
    ),
  ]);
  return { migration, policy };
}

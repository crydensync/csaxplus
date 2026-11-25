import "server-only";

import {
  fetchSystemDoctor,
  fetchSystemMigrations,
  fetchSystemStats,
  type SystemDoctor,
  type SystemMigrations,
  type SystemStats,
} from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

export type SystemPage = {
  stats: Section<SystemStats>;
  doctor: Section<SystemDoctor>;
  migrations: Section<SystemMigrations>;
};

export type { SystemDoctor, SystemMigrations, SystemStats };

async function readSection<T>(read: () => Promise<T>, what: string): Promise<Section<T>> {
  try {
    return { state: "ok", data: await read() };
  } catch (error) {
    return sectionFailure(error, what, noStoreDetail(what));
  }
}

/** Reads independent operational reports separately so one failure doesn't hide the others. */
export async function readSystemPage(token: string): Promise<SystemPage> {
  const [stats, doctor, migrations] = await Promise.all([
    readSection(() => fetchSystemStats(token), "aggregate system statistics"),
    readSection(() => fetchSystemDoctor(token), "system diagnostics"),
    readSection(() => fetchSystemMigrations(token), "authentication database migrations"),
  ]);
  return { stats, doctor, migrations };
}

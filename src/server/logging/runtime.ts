import "server-only";

import { fetchRuntimeLogs, type ShippedLogs } from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

export type RuntimeLogPage = Section<ShippedLogs>;

/** Read the bounded, redacted log buffer held by the current CSAG process. */
export async function readRuntimeLogs(options: {
  token: string;
  level?: string;
}): Promise<RuntimeLogPage> {
  try {
    return { state: "ok", data: await fetchRuntimeLogs(options) };
  } catch (error) {
    return sectionFailure(error, "CSAG runtime logs", noStoreDetail("runtime logs"));
  }
}

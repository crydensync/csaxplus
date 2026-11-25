import "server-only";

import { fetchShippedLogs, type ShippedLogs } from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

export type LoggingPage = Section<ShippedLogs>;

/** Read recent records that CSAG actually handed to its configured sink. */
export async function readShippedLogs(options: {
  token: string;
  level?: string;
}): Promise<LoggingPage> {
  try {
    return { state: "ok", data: await fetchShippedLogs(options) };
  } catch (error) {
    return sectionFailure(error, "shipped log events", noStoreDetail("cloud logging"));
  }
}

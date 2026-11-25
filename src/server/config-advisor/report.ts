import "server-only";

import { fetchConfigTuning, type ConfigTuning } from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

export type ConfigAdvisorPage = Section<ConfigTuning>;

/** Read the API's configuration recommendations over a bounded evidence window. */
export async function readConfigTuning(options: {
  token: string;
  windowDays: number;
}): Promise<ConfigAdvisorPage> {
  try {
    return {
      state: "ok",
      data: await fetchConfigTuning({ token: options.token, windowDays: options.windowDays }),
    };
  } catch (error) {
    return sectionFailure(error, "configuration tuning report", noStoreDetail("audit history"));
  }
}

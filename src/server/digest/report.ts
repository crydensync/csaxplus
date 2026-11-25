import "server-only";

import { fetchDigestHistory, type DigestHistory } from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

export type DigestPage = Section<DigestHistory>;

/** Read stored digest runs from the API. */
export async function readDigestHistory(options: { token: string }): Promise<DigestPage> {
  try {
    return { state: "ok", data: await fetchDigestHistory({ token: options.token, limit: 50 }) };
  } catch (error) {
    return sectionFailure(error, "digest history", noStoreDetail("digest history"));
  }
}

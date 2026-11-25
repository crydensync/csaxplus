import "server-only";

import {
  fetchWebhookDeliveries,
  type WebhookDeliveries,
  type WebhookStatus,
} from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

export type WebhookPage = Section<WebhookDeliveries>;

/** Read the available delivery history for the operator's API deployment. */
export async function readWebhookDeliveries(options: {
  token: string;
  status?: WebhookStatus;
  destinationID?: string;
}): Promise<WebhookPage> {
  try {
    return { state: "ok", data: await fetchWebhookDeliveries(options) };
  } catch (error) {
    return sectionFailure(error, "webhook delivery history", noStoreDetail("webhook deliveries"));
  }
}

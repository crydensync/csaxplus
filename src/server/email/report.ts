import "server-only";

import {
  fetchEmailStats,
  fetchEmailTemplates,
  type EmailStats,
  type EmailTemplates,
} from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

export type EmailPage = {
  stats: Section<EmailStats>;
  templates: Section<EmailTemplates>;
};

/** Read the two independent, read-only email reports for an operator. */
export async function readEmailPage(options: { token: string }): Promise<EmailPage> {
  const [stats, templates] = await Promise.all([
    fetchEmailStats({ token: options.token }).then(
      (data): Section<EmailStats> => ({ state: "ok", data }),
      (error): Section<EmailStats> =>
        sectionFailure(error, "email activity", noStoreDetail("email activity")),
    ),
    fetchEmailTemplates({ token: options.token }).then(
      (data): Section<EmailTemplates> => ({ state: "ok", data }),
      (error): Section<EmailTemplates> =>
        sectionFailure(error, "email templates", noStoreDetail("email templates")),
    ),
  ]);
  return { stats, templates };
}

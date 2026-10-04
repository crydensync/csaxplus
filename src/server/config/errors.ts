import type { ZodError } from "zod";

/**
 * A configuration problem that should stop the process at boot. The message
 * lists every problem at once and never contains a setting's value, so it is
 * safe to print in a log and safe to show an operator.
 */
export class ConfigError extends Error {
  readonly keys: ReadonlyArray<string>;

  constructor(problems: ReadonlyArray<ConfigProblem>) {
    super(formatProblems(problems));
    this.name = "ConfigError";
    this.keys = problems.map((problem) => problem.key);
  }
}

export type ConfigProblem = {
  /** The setting's name, as it appears in the environment. */
  key: string;
  /** What is wrong, in plain words. Never the value. */
  reason: string;
};

const MAX_DETAIL = 3;

function describeIssue(issue: ZodError["issues"][number]): string {
  switch (issue.code) {
    case "invalid_type":
      return `expected ${issue.expected}`;
    case "invalid_format":
      return `not a valid ${issue.format}`;
    case "invalid_value":
      return "must be one of the allowed options";
    case "too_small":
      return "is empty or too short";
    case "too_big":
      return "is too long";
    case "invalid_union":
      return "does not match any accepted shape";
    default:
      return "is not valid";
  }
}

/** Turns zod issues into keyed problems, without echoing any input value. */
export function problemsFromZod(error: ZodError): ReadonlyArray<ConfigProblem> {
  return error.issues.map((issue) => ({
    key: issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)",
    reason: describeIssue(issue),
  }));
}

function formatProblems(problems: ReadonlyArray<ConfigProblem>): string {
  const lines = problems.map((problem) => `  ${problem.key}: ${problem.reason}`);
  const shown = lines.slice(0, MAX_DETAIL);
  const rest = lines.length - shown.length;

  return [
    `Configuration is not usable, ${problems.length} problem${problems.length === 1 ? "" : "s"}:`,
    ...shown,
    ...(rest > 0 ? [`  and ${rest} more`] : []),
    "See .env.example for every setting, its resolution order and a safe placeholder.",
  ].join("\n");
}

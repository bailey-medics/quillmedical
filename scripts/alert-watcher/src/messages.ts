// Which Slack messages are alerts, and what each one is.
//
// Three shapes are alerts: a Cloud Monitoring post naming one of the alert
// policies in infra/modules/monitoring/main.tf, a `*❌ Deploy failed*` post
// from deploy.yml, and a Cloud Monitoring post for the Google Cloud incident
// policy. Everything else is ignored, above all anything a person writes.
//
// The policies are a whitelist, not a pattern. A policy added in Terraform
// and missing here is not investigated, and messages.test.ts fails until it
// is listed, so the two cannot drift apart quietly.

export type AlertKind = "monitoring" | "deploy" | "gcp-incident";

export interface SlackMessage {
  channel?: string;
  ts: string;
  thread_ts?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  text?: string;
  attachments?: unknown[];
  blocks?: unknown[];
}

export interface Alert {
  kind: AlertKind;
  fingerprint: string;
  // The policy name for a Cloud Monitoring post, or "deploy.yml".
  source: string;
  // True for a post saying an incident has closed or recovered.
  closing: boolean;
  ts: string;
  text: string;
}

// Each alert policy's display name, without its ` (<environment>)` suffix.
// Longest first where one is the start of another, so "Uptime failure -
// sustained" is not read as "Uptime failure".
export const INVESTIGATED_POLICIES: readonly string[] = [
  "Uptime failure - sustained",
  "Uptime failure",
  "Cloud Run startup failure",
  "Scheduled action has not run",
  "Scheduled action failed",
  "Server errors - 5xx",
  "Backend error logged",
  "Browser errors",
  "Video files not found",
  "Cloud SQL disk filling",
  "Major outage - call the on-call",
];

// Policies that post to the channel but are not faults to fix. The alert
// route test proves each route still reaches a person, and the retention
// policy asks a person for a decision.
export const IGNORED_POLICIES: readonly string[] = [
  "Four-weekly alert test",
  "Records awaiting a deletion decision",
];

export const GCP_INCIDENT_POLICY = "Google Cloud incident";

// The closing words are narrow on purpose: a bare "closed" appears in the
// retention policy's own documentation, which is posted with the alert.
// The rehearsal confirms them against a real closing post.
const CLOSING = /\bis (?:now )?closed\b|\[RESOLVED\]|\bresolved\b|\brecovered\b/i;
const GCP_CLOSED = /State:\s*(RESOLVED|CLOSED)\b/i;
const DEPLOY_FAILED = /❌\s*Deploy failed/;
const COMMIT = /\/commit\/([0-9a-f]{7,40})/;
const MAX_DEPTH = 8;

// Every `text`, `title`, `pretext`, `fallback` and `value` string anywhere
// in a message, in order. Cloud Monitoring posts carry their content in
// attachments and blocks, and the top-level `text` can be empty.
export function flatten(message: SlackMessage): string {
  const parts: string[] = [];

  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH || node === null || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, depth + 1);
      }
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const readable = ["text", "title", "pretext", "fallback", "value"];
      if (typeof value === "string" && readable.includes(key)) {
        parts.push(value);
      } else {
        walk(value, depth + 1);
      }
    }
  };

  if (message.text) {
    parts.push(message.text);
  }

  walk(message.attachments ?? [], 0);
  walk(message.blocks ?? [], 0);

  return [...new Set(parts)].join("\n");
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The full policy name in the text, such as "Backend error logged (app)" or
// "Scheduled action has not run: backup (app)", or undefined.
export function findPolicy(
  text: string,
  prefixes: readonly string[],
  environment: string,
): { prefix: string; name: string } | undefined {
  const suffix = escapeForRegExp(` (${environment})`);

  for (const prefix of prefixes) {
    const pattern = new RegExp(`${escapeForRegExp(prefix)}(?::[^\\n()]*)?${suffix}`);
    const found = pattern.exec(text);
    if (found) {
      return { prefix, name: found[0] };
    }
  }

  return undefined;
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// What the message is, or undefined when it is not an alert to act on.
export function classify(
  message: SlackMessage,
  options: { ownBotId: string | undefined; environment: string; now: Date },
): Alert | undefined {
  if (!message.bot_id || message.bot_id === options.ownBotId) {
    return undefined;
  }

  if (message.thread_ts && message.thread_ts !== message.ts) {
    return undefined;
  }

  const text = flatten(message);
  const date = utcDate(options.now);

  if (DEPLOY_FAILED.test(text)) {
    const commit = COMMIT.exec(text)?.[1] ?? date;

    return {
      kind: "deploy",
      fingerprint: `deploy|deploy.yml|${commit}`,
      source: "deploy.yml",
      closing: false,
      ts: message.ts,
      text,
    };
  }

  const all = [GCP_INCIDENT_POLICY, ...IGNORED_POLICIES, ...INVESTIGATED_POLICIES];
  const policy = findPolicy(text, all, options.environment);

  if (!policy || IGNORED_POLICIES.includes(policy.prefix)) {
    return undefined;
  }

  if (policy.prefix === GCP_INCIDENT_POLICY) {
    return {
      kind: "gcp-incident",
      fingerprint: `gcp-incident|${policy.name}|${date}`,
      source: policy.name,
      closing: GCP_CLOSED.test(text),
      ts: message.ts,
      text,
    };
  }

  return {
    kind: "monitoring",
    fingerprint: `monitoring|${policy.name}|${date}`,
    source: policy.name,
    closing: CLOSING.test(text),
    ts: message.ts,
    text,
  };
}

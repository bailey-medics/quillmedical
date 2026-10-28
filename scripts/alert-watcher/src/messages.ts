// Which Slack messages are alerts, and what each one is.
//
// Every top-level bot post is an alert unless it is on the ignore list: the
// watcher would rather start a run that turns out not to be needed than
// drop a post it does not recognise without telling anyone. Anything a
// person writes, any reply in a thread and the watcher's own posts are
// never alerts.
//
// Three shapes are known: a Cloud Monitoring post for one of the alert
// policies in infra/modules/monitoring/main.tf, a `*❌ Deploy failed*` post
// from deploy.yml, and the Google Cloud incident policy. Every other bot
// post is `other`. messages.test.ts fails when a policy's subject in
// Terraform is not listed here, so the two cannot drift apart quietly.

export type AlertKind = "monitoring" | "deploy" | "gcp-incident" | "other";

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
  // "deploy.yml", or the post's first bold line: for a Cloud Monitoring
  // post, the policy's subject.
  source: string;
  // True for a post saying an incident has closed or recovered.
  closing: boolean;
  ts: string;
  text: string;
}

// Google's Slack post never names the alert policy. Its bold first line is
// the policy's documentation subject, so policies are known by the start of
// their subject, the part before anything Terraform or Google fills in.
export const INVESTIGATED_SUBJECTS: readonly string[] = [
  "Uptime failing:",
  "Still down after 15 minutes:",
  "Cloud Run container failed to start",
  "A scheduled action failed",
  "A scheduled action has not run for",
  "5xx errors on",
  "Backend error:",
  "Browser errors above threshold",
  "Learners are requesting video files that do not exist",
  "Cloud SQL disk high:",
  "Major outage:",
];

// Policies that post to the channel but are not faults to fix. The alert
// route test proves each route still reaches a person, and the retention
// policy asks a person for a decision.
export const IGNORED_SUBJECTS: readonly string[] = [
  "Scheduled alert test, no action needed",
  "Training records are awaiting a decision",
];

export const GCP_INCIDENT_SUBJECT = "Google Cloud reports an incident affecting this project";

// Unconfirmed: no closing post reached the channel in the 28 October 2026
// rehearsal, so Google may not post closings at all. A bare "closed" is not
// enough: it appears in the retention policy's own
// documentation, which is posted with the alert.
const CLOSING = /\bis (?:now )?closed\b|\[RESOLVED\]|\bresolved\b|\brecovered\b/i;
const GCP_CLOSED = /State:\s*(RESOLVED|CLOSED)\b/i;
// Slack hands a workflow's emoji to the watcher as its text code, `:x:` for
// ❌ and `:white_check_mark:` for ✅, as the failed deploy of 28 October
// 2026 showed, so each pattern takes both forms.
const DEPLOY_FAILED = /(?:❌|:x:)\s*Deploy failed/;
// A success post, such as `*✅ Deployed to app*`, opens with the tick.
const SUCCESS = /^[\s*_]*(?:✅|:white_check_mark:)/;
const BOLD = /\*([^*\n]+)\*/;
const TITLE_LENGTH = 80;
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

// What a post is about: its first bold line, which is how Google's posts
// and the workflows' posts both open, or else its first line. A Slack link,
// `<url|words>`, is read as its words.
export function title(text: string): string {
  const line = BOLD.exec(text)?.[1] ?? text.split("\n").find((part) => part.trim()) ?? "";
  const words = line
    .replace(/<[^|>]*\|([^>]*)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  const tidy = words.replace(/\s+/g, " ").trim().slice(0, TITLE_LENGTH);

  return tidy || "untitled";
}

function startsWithAny(subject: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => subject.startsWith(prefix));
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// What the message is, or undefined when it is not an alert to act on.
export function classify(
  message: SlackMessage,
  options: { ownUserId: string | undefined; now: Date },
): Alert | undefined {
  if (!message.bot_id) {
    return undefined;
  }

  // The watcher's own posts are known by its bot user, not its app: the app
  // may be the one deploy.yml's webhook posts through as well, and those
  // posts share its bot_id but carry no user. Its replies are in threads
  // too, which the next check skips whoever wrote them.
  if (options.ownUserId && message.user === options.ownUserId) {
    return undefined;
  }

  if (message.thread_ts && message.thread_ts !== message.ts) {
    return undefined;
  }

  const text = flatten(message);
  const date = utcDate(options.now);

  if (SUCCESS.test(text)) {
    return undefined;
  }

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

  const subject = title(text);

  if (startsWithAny(subject, IGNORED_SUBJECTS)) {
    return undefined;
  }

  if (subject.startsWith(GCP_INCIDENT_SUBJECT)) {
    return {
      kind: "gcp-incident",
      fingerprint: `gcp-incident|${subject}|${date}`,
      source: subject,
      closing: GCP_CLOSED.test(text),
      ts: message.ts,
      text,
    };
  }

  if (startsWithAny(subject, INVESTIGATED_SUBJECTS)) {
    return {
      kind: "monitoring",
      fingerprint: `monitoring|${subject}|${date}`,
      source: subject,
      closing: CLOSING.test(text),
      ts: message.ts,
      text,
    };
  }

  // Not a known shape. Its closing words are not read: in a post nobody
  // has described, "resolved" is as likely to be part of the fault.
  return {
    kind: "other",
    fingerprint: `other|${subject}|${date}`,
    source: subject,
    closing: false,
    ts: message.ts,
    text,
  };
}

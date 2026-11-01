import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  classify,
  flatten,
  GCP_INCIDENT_SUBJECT,
  IGNORED_SUBJECTS,
  INVESTIGATED_SUBJECTS,
  title,
  type SlackMessage,
} from "./messages.ts";

const NOW = new Date("2026-10-26T09:14:03Z");
const OPTIONS = { ownUserId: "U0000000001", now: NOW };

function botPost(fields: Partial<SlackMessage>): SlackMessage {
  return { ts: "1761480000.123456", bot_id: "B0000000002", ...fields };
}

// The shape of a Cloud Monitoring post, from the route test's real one on
// 28 October 2026: the subject is a bold link, and the policy's name
// appears nowhere.
function googlePost(subject: string, status = "Alert open", documentation = "Some documentation."): SlackMessage {
  const link = "https://console.cloud.google.com/monitoring/alerting/alerts/0.oecl1s8f20wr?channelType=slack&amp;project=quill-medical-app";
  const heading = `*<${link}|${subject}>*`;

  return botPost({
    text: `${heading} Log match condition fired. Alert status ${status} No severity *Documentation* ${documentation}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: heading } },
      { type: "context", elements: [{ type: "plain_text", text: status }] },
      { type: "section", text: { type: "mrkdwn", text: documentation } },
    ],
  });
}

const DEPLOY_FAILED = [
  "*❌ Deploy failed*",
  "",
  "*Commit:* <https://github.com/bailey-medics/quillmedical/commit/5d48c48c1234|5d48c48c1234>",
  "*Author:* someone",
].join("\n");

describe("classify", () => {
  it("reads a failed deploy, fingerprinted by its commit", () => {
    const alert = classify(botPost({ text: DEPLOY_FAILED }), OPTIONS);

    assert.equal(alert?.kind, "deploy");
    assert.equal(alert?.fingerprint, "deploy|deploy.yml|5d48c48c1234");
  });

  it("reads a failed deploy as Slack really sends it, with the emoji as :x:", () => {
    const text = [
      "*:x: Deploy failed*",
      "",
      "*Commit:* <https://github.com/bailey-medics/quillmedical/commit/6c2427461d0e|6c2427461d0e>",
      "*Author:* someone",
    ].join("\n");

    const alert = classify(botPost({ text }), OPTIONS);

    assert.equal(alert?.kind, "deploy");
    assert.equal(alert?.fingerprint, "deploy|deploy.yml|6c2427461d0e");
  });

  it("ignores a successful deploy", () => {
    assert.equal(classify(botPost({ text: "*✅ Deployed to app*" }), OPTIONS), undefined);
  });

  it("ignores a success post with the tick sent as :white_check_mark:", () => {
    assert.equal(classify(botPost({ text: "*:white_check_mark: Deployed to teaching*" }), OPTIONS), undefined);
  });

  it("ignores a success post with another emoji before the tick, as the pentest posts it", () => {
    const subject = "Monthly security pentest passed*\n\n*Action:* View Run";

    for (const emoji of [":closed_lock_with_key: :white_check_mark:", "🔐 ✅"]) {
      assert.equal(classify(botPost({ text: `*${emoji} ${subject}` }), OPTIONS), undefined);
    }
  });

  it("still reads a failure with an emoji before it as an alert", () => {
    const alert = classify(botPost({ text: "*:closed_lock_with_key: :x: Monthly security pentest failed*" }), OPTIONS);

    assert.equal(alert?.kind, "other");
  });

  it("reads a Cloud Monitoring alert by its subject, fingerprinted by subject and day", () => {
    const alert = classify(googlePost("Backend error: app.auth web [500 POST login]"), OPTIONS);

    assert.equal(alert?.kind, "monitoring");
    assert.equal(alert?.source, "Backend error: app.auth web [500 POST login]");
    assert.equal(alert?.fingerprint, "monitoring|Backend error: app.auth web [500 POST login]|2026-10-26");
    assert.equal(alert?.closing, false);
  });

  it("keeps what Terraform filled in after a subject's fixed start", () => {
    const alert = classify(googlePost("A scheduled action has not run for 26 hours"), OPTIONS);

    assert.equal(alert?.kind, "monitoring");
    assert.equal(alert?.source, "A scheduled action has not run for 26 hours");
  });

  it("marks a closing post as closing", () => {
    const alert = classify(googlePost("5xx errors on quill-backend-app", "Incident is now closed"), OPTIONS);

    assert.equal(alert?.closing, true);
  });

  it("ignores the four-weekly alert route test, as Google really posted it", () => {
    const documentation = "This is the four-weekly test of every alert route, not an outage.";

    assert.equal(classify(googlePost("Scheduled alert test, no action needed", "Alert open", documentation), OPTIONS), undefined);
  });

  it("ignores the retention decision", () => {
    assert.equal(classify(googlePost("Training records are awaiting a decision"), OPTIONS), undefined);
  });

  it("ignores the reminder to apply the GitHub rulesets, with either form of its emoji", () => {
    const subject = "GitHub rulesets changed - manual terraform apply required";
    const body = "Files under `infra/github/` were merged to main. *Action required:* `just terraform-github`";

    for (const emoji of [":warning:", "⚠️"]) {
      assert.equal(classify(botPost({ text: `*${emoji} ${subject}*\n\n${body}` }), OPTIONS), undefined);
    }

    assert.equal(classify(botPost({ text: `*${subject}*\n\n${body}` }), OPTIONS)?.kind, "other");
  });

  it("reads the Google Cloud incident policy as an incident, and its resolution as closing", () => {
    const opened = classify(googlePost(GCP_INCIDENT_SUBJECT, "Alert open", "State: ACTIVE"), OPTIONS);
    const closed = classify(googlePost(GCP_INCIDENT_SUBJECT, "Alert open", "State: RESOLVED"), OPTIONS);

    assert.equal(opened?.kind, "gcp-incident");
    assert.equal(opened?.closing, false);
    assert.equal(closed?.closing, true);
  });

  it("ignores anything a person writes, even naming a policy", () => {
    const message: SlackMessage = { ts: "1.000001", user: "U123", text: "*Backend error: again?*" };

    assert.equal(classify(message, OPTIONS), undefined);
  });

  it("ignores the watcher's own posts, known by its bot user", () => {
    assert.equal(classify(botPost({ user: "U0000000001", text: DEPLOY_FAILED }), OPTIONS), undefined);
  });

  it("reads a failed deploy posted through the watcher's own app", () => {
    const alert = classify(botPost({ bot_id: "B0000000001", text: DEPLOY_FAILED }), OPTIONS);

    assert.equal(alert?.kind, "deploy");
  });

  it("ignores a reply in a thread", () => {
    assert.equal(classify(botPost({ thread_ts: "1761470000.000001", text: DEPLOY_FAILED }), OPTIONS), undefined);
  });
});

describe("title", () => {
  it("takes the first bold line", () => {
    assert.equal(title("Run 42\n*❌ Public site deploy failed*\n*Commit:* abc"), "❌ Public site deploy failed");
  });

  it("falls back to the first line with text in it, on one line", () => {
    assert.equal(title("\n  Something   new\nsecond"), "Something new");
  });

  it("reads a Slack link as its words, and undoes Slack's escaping", () => {
    assert.equal(title("*<https://example.com/a?b=1&amp;c=2|Disk &amp; memory &lt;high&gt;>* more"), "Disk & memory <high>");
  });

  it("is cut to 80 characters, and never empty", () => {
    assert.equal(title(`*${"x".repeat(200)}*`).length, 80);
    assert.equal(title(""), "untitled");
  });
});

describe("flatten", () => {
  it("collects text from blocks as well as attachments", () => {
    const message = botPost({
      blocks: [{ type: "section", text: { type: "mrkdwn", text: "from a block" } }],
      attachments: [{ pretext: "from an attachment" }],
    });

    assert.match(flatten(message), /from a block/);
    assert.match(flatten(message), /from an attachment/);
  });
});

// Every alert policy's subject in Terraform must be listed in messages.ts,
// as one to investigate, one to ignore, or the incident policy. A policy
// added there and not here would still be investigated, as `other`, but the
// ignore list and the incident rule would not know it.
describe("the subject list", () => {
  it("names every alert policy's subject in infra/modules/monitoring/main.tf", () => {
    const terraform = readFileSync(new URL("../../../infra/modules/monitoring/main.tf", import.meta.url), "utf8");
    const known = [GCP_INCIDENT_SUBJECT, ...IGNORED_SUBJECTS, ...INVESTIGATED_SUBJECTS];
    const subjects = [...terraform.matchAll(/^\s*subject\s*=\s*"([^"]*)"/gm)];

    assert.ok(subjects.length > 5, "no alert policy subjects were found in main.tf");

    for (const [, subject] of subjects) {
      // "Uptime failing: $${resource.label.host}" is read up to the first
      // placeholder, which Terraform or Google fills in.
      const fixed = subject?.split("$")[0]?.trim() ?? "";
      assert.ok(known.includes(fixed), `"${fixed}" is an alert policy subject in main.tf but not listed in messages.ts`);
    }
  });
});

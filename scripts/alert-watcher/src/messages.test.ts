import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  classify,
  flatten,
  GCP_INCIDENT_POLICY,
  IGNORED_POLICIES,
  INVESTIGATED_POLICIES,
  type SlackMessage,
} from "./messages.ts";

const NOW = new Date("2026-10-26T09:14:03Z");
const OPTIONS = { ownBotId: "B0000000001", environment: "app", now: NOW };

function botPost(fields: Partial<SlackMessage>): SlackMessage {
  return { ts: "1761480000.123456", bot_id: "B0000000002", ...fields };
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

  it("ignores a successful deploy", () => {
    assert.equal(classify(botPost({ text: "*✅ Deployed to app*" }), OPTIONS), undefined);
  });

  it("reads a Cloud Monitoring alert from its attachments, fingerprinted by policy and day", () => {
    const message = botPost({
      text: "",
      attachments: [{ title: "Incident #0.abc is open", fields: [{ title: "Policy", value: "Backend error logged (app)" }] }],
    });

    const alert = classify(message, OPTIONS);

    assert.equal(alert?.kind, "monitoring");
    assert.equal(alert?.source, "Backend error logged (app)");
    assert.equal(alert?.fingerprint, "monitoring|Backend error logged (app)|2026-10-26");
    assert.equal(alert?.closing, false);
  });

  it("keeps the detail after a colon in a policy name", () => {
    const alert = classify(botPost({ text: "Scheduled action has not run: backup (app) is open" }), OPTIONS);

    assert.equal(alert?.source, "Scheduled action has not run: backup (app)");
  });

  it("reads the longer of two policy names that share a start", () => {
    const alert = classify(botPost({ text: "Uptime failure - sustained (app)" }), OPTIONS);

    assert.equal(alert?.source, "Uptime failure - sustained (app)");
  });

  it("marks a closing post as closing", () => {
    const alert = classify(botPost({ text: "Incident is now closed for Server errors - 5xx (app)" }), OPTIONS);

    assert.equal(alert?.closing, true);
  });

  it("ignores another environment's policy", () => {
    assert.equal(classify(botPost({ text: "Backend error logged (staging)" }), OPTIONS), undefined);
  });

  it("ignores the four-weekly alert route test", () => {
    assert.equal(classify(botPost({ text: "Four-weekly alert test: Slack (app)" }), OPTIONS), undefined);
  });

  it("reads the Google Cloud incident policy as an incident, and its resolution as closing", () => {
    const opened = classify(botPost({ text: "Google Cloud incident (app)\nState: ACTIVE" }), OPTIONS);
    const closed = classify(botPost({ text: "Google Cloud incident (app)\nState: RESOLVED" }), OPTIONS);

    assert.equal(opened?.kind, "gcp-incident");
    assert.equal(opened?.closing, false);
    assert.equal(closed?.closing, true);
  });

  it("ignores anything a person writes, even naming a policy", () => {
    const message: SlackMessage = { ts: "1.000001", user: "U123", text: "Backend error logged (app) again?" };

    assert.equal(classify(message, OPTIONS), undefined);
  });

  it("ignores the watcher's own replies", () => {
    assert.equal(classify(botPost({ bot_id: "B0000000001", text: DEPLOY_FAILED }), OPTIONS), undefined);
  });

  it("ignores a reply in a thread", () => {
    assert.equal(classify(botPost({ thread_ts: "1761470000.000001", text: DEPLOY_FAILED }), OPTIONS), undefined);
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

// Every alert policy in Terraform must be listed in messages.ts, as one to
// investigate, one to ignore, or the incident policy. A policy added there
// and not here would never be investigated, and nothing else would say so.
describe("the policy whitelist", () => {
  it("names every alert policy in infra/modules/monitoring/main.tf", () => {
    const terraform = readFileSync(new URL("../../../infra/modules/monitoring/main.tf", import.meta.url), "utf8");
    const known = [GCP_INCIDENT_POLICY, ...IGNORED_POLICIES, ...INVESTIGATED_POLICIES];
    const policies = [...terraform.matchAll(/resource "google_monitoring_alert_policy"[^{]*\{[^}]*?display_name\s*=\s*"([^"$]+)/g)];

    assert.ok(policies.length > 5, "no alert policies were found in main.tf");

    for (const [, name] of policies) {
      // "Uptime failure (${var.environment})" is read up to the "$", so the
      // " (" or ": " before it is trimmed off.
      const prefix = name?.replace(/[\s(:]+$/, "") ?? "";
      assert.ok(
        known.some((entry) => prefix === entry || prefix.startsWith(`${entry} `)),
        `"${prefix}" is an alert policy in main.tf but not listed in messages.ts`,
      );
    }
  });
});

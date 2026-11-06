// The watcher's settings, from the environment, checked before anything
// connects. The systemd unit reads them from
// ~/.config/quill-owl/env.

import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  appToken: string;
  botToken: string;
  channel: string;
  // The bot_ids of the apps whose posts may be alerts: Google Cloud's own
  // integration and Goshawk, the app the GitHub workflows post through.
  alertApps: string[];
  // The Slack member ids who may summon Owl with a mention. Empty means
  // nobody may, and alerts carry on as before.
  summoners: string[];
  worktree: string;
  tmuxTarget: string;
  stateDirectory: string;
  certificatePath: string;
  recordEvents: boolean;
}

export class ConfigError extends Error {}

function required(env: NodeJS.ProcessEnv, name: string, pattern: RegExp, hint: string): string {
  const value = env[name]?.trim() ?? "";

  if (!pattern.test(value)) {
    throw new ConfigError(`${name} is missing or malformed: ${hint}.`);
  }

  return value;
}

// A comma-separated list of Slack ids. An id that does not look like one is
// refused rather than dropped, so a typo is found at start-up and not when
// an alert goes unanswered.
function idList(env: NodeJS.ProcessEnv, name: string, pattern: RegExp, hint: string): string[] {
  const ids = (env[name] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");

  for (const id of ids) {
    if (!pattern.test(id)) {
      throw new ConfigError(`${name} holds a malformed id: ${hint}.`);
    }
  }

  return ids;
}

function alertApps(env: NodeJS.ProcessEnv): string[] {
  const hint = "a comma-separated list of the alerting apps' bot_ids, such as B0123456789";
  const ids = idList(env, "OWL_ALERT_APPS", /^B[A-Z0-9]{8,}$/, hint);

  // A watcher that investigates nothing would look healthy while every
  // alert went unanswered, so an empty list stops it starting.
  if (ids.length === 0) {
    throw new ConfigError(`OWL_ALERT_APPS is missing: ${hint}.`);
  }

  return ids;
}

export function readConfig(env: NodeJS.ProcessEnv): Config {
  const home = env["HOME"] ?? homedir();
  const stateHome = env["XDG_STATE_HOME"] || join(home, ".local", "state");

  return {
    appToken: required(env, "SLACK_APP_TOKEN", /^xapp-/, "the app-level token, starting xapp-"),
    botToken: required(env, "SLACK_BOT_TOKEN", /^xoxb-/, "the bot token, starting xoxb-"),
    channel: required(env, "OWL_CHANNEL", /^C[A-Z0-9]{8,}$/, "the channel's id, such as C0123456789, not its name"),
    alertApps: alertApps(env),
    summoners: idList(env, "OWL_SUMMONERS", /^[UW][A-Z0-9]{8,}$/, "a comma-separated list of Slack member ids, such as U0123456789"),
    worktree: env["OWL_WORKTREE"] || join(home, "github", "quillmedical-owl"),
    // Owl's own session, which scripts/claude-session.sh also names owl.
    tmuxTarget: env["OWL_TMUX_TARGET"] || "owl",
    // The same folder .claude/hooks/owl-busy.sh writes the flag in.
    stateDirectory: env["OWL_STATE"] || join(stateHome, "quill-owl"),
    // The client certificate the box signs in to Google with.
    certificatePath: env["OWL_CERTIFICATE"] || join(home, ".config", "quill-owl", "pki", "watcher.crt"),
    recordEvents: env["OWL_RECORD_EVENTS"] === "1",
  };
}

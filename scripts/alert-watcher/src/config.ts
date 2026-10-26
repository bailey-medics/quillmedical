// The watcher's settings, from the environment, checked before anything
// connects. The systemd unit reads them from
// ~/.config/quill-alert-watcher/env.

import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  appToken: string;
  botToken: string;
  channel: string;
  worktree: string;
  tmuxTarget: string;
  stateDirectory: string;
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

export function readConfig(env: NodeJS.ProcessEnv): Config {
  const home = env["HOME"] ?? homedir();
  const stateHome = env["XDG_STATE_HOME"] || join(home, ".local", "state");

  return {
    appToken: required(env, "SLACK_APP_TOKEN", /^xapp-/, "the app-level token, starting xapp-"),
    botToken: required(env, "SLACK_BOT_TOKEN", /^xoxb-/, "the bot token, starting xoxb-"),
    channel: required(env, "ALERT_WATCHER_CHANNEL", /^C[A-Z0-9]{8,}$/, "the channel's id, such as C0123456789, not its name"),
    worktree: env["ALERT_WATCHER_WORKTREE"] || join(home, "github", "quillmedical-5"),
    // The name ~/.local/bin/quill-sessions gives worktree 5's session.
    tmuxTarget: env["ALERT_WATCHER_TMUX_TARGET"] || "q5",
    // The same folder .claude/hooks/alert-watcher-busy.sh writes the flag in.
    stateDirectory: env["QUILL_ALERT_WATCHER_STATE"] || join(stateHome, "quill-alert-watcher"),
    recordEvents: env["ALERT_WATCHER_RECORD_EVENTS"] === "1",
  };
}

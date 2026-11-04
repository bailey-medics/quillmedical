// The watcher's settings, from the environment, checked before anything
// connects. The systemd unit reads them from
// ~/.config/quill-owl/env.

import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  appToken: string;
  botToken: string;
  channel: string;
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

export function readConfig(env: NodeJS.ProcessEnv): Config {
  const home = env["HOME"] ?? homedir();
  const stateHome = env["XDG_STATE_HOME"] || join(home, ".local", "state");

  return {
    appToken: required(env, "SLACK_APP_TOKEN", /^xapp-/, "the app-level token, starting xapp-"),
    botToken: required(env, "SLACK_BOT_TOKEN", /^xoxb-/, "the bot token, starting xoxb-"),
    channel: required(env, "OWL_CHANNEL", /^C[A-Z0-9]{8,}$/, "the channel's id, such as C0123456789, not its name"),
    worktree: env["OWL_WORKTREE"] || join(home, "github", "quillmedical-5"),
    // The name ~/.local/bin/quill-sessions gives worktree 5's session.
    tmuxTarget: env["OWL_TMUX_TARGET"] || "q5",
    // The same folder .claude/hooks/owl-busy.sh writes the flag in.
    stateDirectory: env["OWL_STATE"] || join(stateHome, "quill-owl"),
    // The client certificate the box signs in to Google with.
    certificatePath: env["OWL_CERTIFICATE"] || join(home, ".config", "quill-owl", "pki", "watcher.crt"),
    recordEvents: env["OWL_RECORD_EVENTS"] === "1",
  };
}

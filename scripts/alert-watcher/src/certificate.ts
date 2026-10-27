// Reminds the channel before the box's client certificate runs out.
//
// The /alert skill reads App production's logs as alert-watcher-logs, which
// the box signs in as by showing Google a client certificate (see
// infra/alert-watcher.tf). The certificate lasts a year, and once it runs out
// every investigation loses its logs without saying why. So from 30 days
// before, the watcher posts a reminder with the renewal command, once a week
// until the certificate is renewed.

import { X509Certificate } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
export const WARN_DAYS = 30;
export const REPEAT_DAYS = 7;

export type Expiry = { readable: true; expires: Date } | { readable: false };

// The same command as the certificate step of the remote dev machine plan.
// The authority is unchanged by it, so nothing in Terraform changes.
const RENEWAL = [
  "```",
  "cd ~/.config/quill-alert-watcher/pki",
  'openssl req -new -key watcher.key -subj "/O=Quill Medical/CN=quill-alert-watcher" -config exts.cnf -out watcher.csr',
  "openssl x509 -req -in watcher.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 365 -sha256 -extfile exts.cnf -extensions leaf_exts -out watcher.crt",
  "rm watcher.csr ca.srl",
  "```",
].join("\n");

export function readExpiry(path: string): Expiry {
  try {
    const certificate = new X509Certificate(readFileSync(path));
    return { readable: true, expires: certificate.validToDate };
  } catch {
    return { readable: false };
  }
}

// The reminder for this expiry, or undefined while more than WARN_DAYS are
// left.
export function reminderText(expiry: Expiry, now: Date, path: string): string | undefined {
  if (!expiry.readable) {
    return `The alert watcher cannot read its client certificate at \`${path}\`, so investigations cannot read App production's logs.`;
  }

  const daysLeft = Math.ceil((expiry.expires.getTime() - now.getTime()) / DAY_MS);
  const date = expiry.expires.toISOString().slice(0, 10);

  if (daysLeft > WARN_DAYS) {
    return undefined;
  }

  const when = daysLeft <= 0
    ? `ran out on ${date}, so investigations cannot read App production's logs`
    : `runs out in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}, on ${date}`;

  return `The alert watcher's client certificate ${when}. Renew it on the box:\n${RENEWAL}`;
}

export class CertificateReminder {
  private readonly certificatePath: string;
  private readonly statePath: string;
  private readonly read: (path: string) => Expiry;

  constructor(certificatePath: string, statePath: string, read: (path: string) => Expiry = readExpiry) {
    this.certificatePath = certificatePath;
    this.statePath = statePath;
    this.read = read;
  }

  // The reminder to post now, or undefined if none is due or one went out
  // within the last REPEAT_DAYS.
  due(now: Date): string | undefined {
    const text = reminderText(this.read(this.certificatePath), now, this.certificatePath);

    if (text === undefined) {
      return undefined;
    }

    const last = this.lastSent();

    if (last !== undefined && now.getTime() - last.getTime() < REPEAT_DAYS * DAY_MS) {
      return undefined;
    }

    return text;
  }

  // Kept on disk, so a restart does not post the same reminder again.
  sent(now: Date): void {
    mkdirSync(dirname(this.statePath), { recursive: true, mode: 0o700 });

    const temporary = `${this.statePath}.tmp`;
    writeFileSync(temporary, JSON.stringify({ sentAt: now.toISOString() }), { mode: 0o600 });
    renameSync(temporary, this.statePath);
  }

  private lastSent(): Date | undefined {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.statePath, "utf8"));

      if (parsed !== null && typeof parsed === "object" && "sentAt" in parsed && typeof parsed.sentAt === "string") {
        const at = new Date(parsed.sentAt);
        return Number.isNaN(at.getTime()) ? undefined : at;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }
}

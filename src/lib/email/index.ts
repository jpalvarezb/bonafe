/**
 * Provider-agnostic email adapter. The app must keep working with zero
 * EMAIL_* env vars set (getEmailAdapter falls back to a console logger in
 * that case) — mirrors the "(optional — degrades gracefully)" posture of
 * Stripe in .env.example.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  user?: string;
  pass?: string;
};

export type EmailAdapter =
  | {
      kind: "console";
      send(message: EmailMessage): Promise<void>;
    }
  | {
      kind: "smtp";
      config: SmtpConfig;
      send(message: EmailMessage): Promise<void>;
    };

/** Masks the local-part of an email for logging, same convention as
 * maskEmail in src/server/actions/members.ts (never log a full address). */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0] ?? "*"}***@${domain}`;
}

function createConsoleAdapter(): EmailAdapter {
  return {
    kind: "console",
    async send(message) {
      console.log(
        `[email:console] to=${maskEmail(message.to)} subject=${JSON.stringify(message.subject)}`,
      );
    },
  };
}

function createSmtpAdapter(config: SmtpConfig): EmailAdapter {
  return {
    kind: "smtp",
    config,
    async send(message) {
      // Lazily import nodemailer and only open a socket when a message is
      // actually being sent — never at adapter-construction time. That's
      // what lets getEmailAdapter's callers (and its tests) inspect
      // `kind`/`config` without ever touching the network.
      const { default: nodemailer } = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth:
          config.user && config.pass
            ? { user: config.user, pass: config.pass }
            : undefined,
      });
      await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}

export type EmailEnv = Record<string, string | undefined>;

/**
 * Reads env lazily — evaluated per call (default parameter, not a
 * module-level constant) so both the SMTP and console paths are exercisable
 * in the same test run and so a script/callback that mutates env at runtime
 * (e.g. --env-file) is respected without a restart.
 */
export function getEmailAdapter(env: EmailEnv = process.env): EmailAdapter {
  const host = env.EMAIL_SMTP_HOST;
  const portRaw = env.EMAIL_SMTP_PORT;
  const from = env.EMAIL_FROM;

  if (!host || !portRaw || !from) {
    return createConsoleAdapter();
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port)) {
    return createConsoleAdapter();
  }

  return createSmtpAdapter({
    host,
    port,
    secure: env.EMAIL_SMTP_SECURE === "true",
    from,
    user: env.EMAIL_SMTP_USER,
    pass: env.EMAIL_SMTP_PASS,
  });
}

// Re-exported so callers with no request context (better-auth callbacks,
// cron scripts) can render an invite email without a separate import.
// renderDigestEmail lives on src/lib/email/digest.ts instead — it wraps the
// same template with the (params, locale) shape the digest cron uses.
export {
  renderInviteEmail,
  type EmailLocale,
  type RenderInviteEmailParams,
  type RenderedEmail,
} from "./templates";

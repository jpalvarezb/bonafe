/**
 * Pure email-rendering module. Statically imports both locale JSON files
 * (no next-intl `getTranslations`/request-context call) because this must
 * work from two places that have no request context at all: the better-auth
 * `sendInvitationEmail` callback (src/lib/auth/index.ts) and the
 * `send-digest` cron script (src/scripts/send-digest.ts, run outside Next
 * entirely via tsx). Keep this file free of any import that touches
 * next-intl, the DB, or the network.
 */
import es from "../../../messages/es/email.json";
import en from "../../../messages/en/email.json";

export type EmailLocale = "es" | "en";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

const CATALOGS: Record<EmailLocale, typeof es> = { es, en };

/** 'es' | 'en' pass through; anything else (undefined, unknown locale codes
 * like the invitee's not-yet-created account) falls back to 'es'. */
function resolveLocale(locale: string | null | undefined): EmailLocale {
  return locale === "en" ? "en" : "es";
}

/** Minimal `{token}` interpolation — no plural/ICU rules needed for these
 * single-value substitutions, so we avoid pulling next-intl's formatter in. */
function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlParagraphs(lines: string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
}

export type RenderInviteEmailParams = {
  orgName: string;
  acceptUrl: string;
  inviterName?: string;
};

export function renderInviteEmail(
  params: RenderInviteEmailParams,
  locale?: string | null,
): RenderedEmail {
  const messages = CATALOGS[resolveLocale(locale)].invite;
  const subject = format(messages.subject, { orgName: params.orgName });
  const bodyTemplate = params.inviterName
    ? messages.bodyWithInviter
    : messages.bodyGeneric;
  const text = format(bodyTemplate, {
    orgName: params.orgName,
    acceptUrl: params.acceptUrl,
    inviterName: params.inviterName ?? "",
  });
  const html = `${htmlParagraphs([text])}\n<p><a href="${escapeHtml(params.acceptUrl)}">${escapeHtml(messages.cta)}</a></p>`;
  return { subject, text, html };
}

export type DigestTemplateSections = {
  subscriptionStatus: "past_due" | "canceled" | null;
  lowStockProducts: Array<{
    productId: string;
    name: string;
    quantity: string;
    minStock: string | null;
  }>;
  monitoringAlerts: Array<{ id: string; severity: number; title: string }>;
};

export type RenderDigestEmailParams = {
  locale?: string | null;
  orgName: string;
  sections: DigestTemplateSections;
};

export function renderDigestEmail(params: RenderDigestEmailParams): RenderedEmail {
  const messages = CATALOGS[resolveLocale(params.locale)].digest;
  const { sections } = params;
  const subject = format(messages.subject, { orgName: params.orgName });

  const lines: string[] = [];

  if (sections.subscriptionStatus === "past_due") {
    lines.push(messages.subscriptionHeading);
    lines.push(messages.subscriptionPastDue);
  } else if (sections.subscriptionStatus === "canceled") {
    lines.push(messages.subscriptionHeading);
    lines.push(messages.subscriptionCanceled);
  }

  if (sections.lowStockProducts.length > 0) {
    lines.push(messages.lowStockHeading);
    for (const product of sections.lowStockProducts) {
      lines.push(
        format(messages.lowStockLine, {
          name: product.name,
          quantity: product.quantity,
          minStock: product.minStock ?? "",
        }),
      );
    }
  }

  if (sections.monitoringAlerts.length > 0) {
    lines.push(messages.monitoringHeading);
    for (const alert of sections.monitoringAlerts) {
      lines.push(
        format(messages.monitoringLine, {
          title: alert.title,
          severity: String(alert.severity),
        }),
      );
    }
  }

  lines.push(messages.footer);

  const text = lines.join("\n");
  const html = htmlParagraphs(lines);

  return { subject, text, html };
}

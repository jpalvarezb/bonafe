import { and, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { invitation, member, user } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { ORG_ROLES } from "@/lib/auth/permissions";
import { inviteMemberAction } from "@/server/actions/members";
import { Input } from "@/components/ui/input";
import { CopyInviteLinkButton } from "@/components/org/copy-invite-link-button";
import { Notice } from "@/components/ui/notice";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { cn } from "@/lib/utils";

const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";
const CONTROL =
  "h-[var(--density-control-h)] rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BTN =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const KNOWN_ERROR_KEYS = ["duplicatePending"];

export default async function MembersPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("org");
  const { error } = await searchParams;
  const errorKey =
    error && KNOWN_ERROR_KEYS.includes(error) ? error : error ? "unknown" : null;

  const members = await db
    .select({
      id: member.id,
      role: member.role,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, ctx.org.id));

  const pendingInvites = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, ctx.org.id),
        eq(invitation.status, "pending"),
      ),
    );

  const canInvite = can(ctx.role, "invitation", "create");
  const path = `/${locale}/o/${orgSlug}/settings/members`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SettingsTabs orgSlug={orgSlug} role={ctx.role} active="members" />
      <h1 className="text-2xl font-semibold">{t("members.title")}</h1>

      {errorKey && <Notice variant="error">{t(`members.errors.${errorKey}`)}</Notice>}

      <div className="border border-border">
        {members.map((m) => (
          <div
            key={m.id}
            className={cn(
              CELL,
              "flex items-center justify-between border-b border-border last:border-b-0",
            )}
          >
            <div>
              <p className="text-[length:var(--density-font-body)] font-medium">
                {m.name}
              </p>
              <p className="text-[11px] text-muted-foreground">{m.email}</p>
            </div>
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {t(`roles.${m.role}`)}
            </span>
          </div>
        ))}
      </div>

      {canInvite && (
        <div className="border border-border">
          <div className="px-3.5 py-2.5">
            <span className="text-[13px] font-semibold">
              {t("members.invite")}
            </span>
          </div>
          <div className="border-t border-border px-3.5 py-3">
            <form action={inviteMemberAction} className="flex flex-wrap gap-3">
              <input type="hidden" name="path" value={path} />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <Input
                name="email"
                type="email"
                required
                placeholder={t("members.email")}
                className={cn(CONTROL, "w-64")}
              />
              <select
                name="role"
                defaultValue="field_supervisor"
                className={CONTROL}
              >
                {ORG_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`roles.${role}`)}
                  </option>
                ))}
              </select>
              <button type="submit" className={BTN}>
                {t("members.send")}
              </button>
            </form>

            {pendingInvites.length > 0 && (
              <div className="mt-6">
                <h3 className={cn(MICRO_LABEL, "mb-2")}>
                  {t("members.pending")}
                </h3>
                <ul className="flex flex-col gap-2">
                  {pendingInvites.map((inv) => {
                    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${locale}/invite/${inv.id}`;
                    return (
                      <li
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-border px-3 py-2 text-[length:var(--density-font-body)]"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span>
                            {inv.email} ·{" "}
                            {t(`roles.${inv.role ?? "field_supervisor"}`)}
                          </span>
                          <code className="truncate font-mono text-[10.5px] text-muted-foreground">
                            {inviteUrl}
                          </code>
                        </div>
                        <CopyInviteLinkButton url={inviteUrl} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

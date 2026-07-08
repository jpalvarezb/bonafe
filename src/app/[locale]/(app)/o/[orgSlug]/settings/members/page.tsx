import { and, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { invitation, member, user } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { ORG_ROLES } from "@/lib/auth/permissions";
import { inviteMemberAction } from "@/server/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyInviteLinkButton } from "@/components/org/copy-invite-link-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsTabs } from "@/components/settings/settings-tabs";

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

      {errorKey && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`members.errors.${errorKey}`)}
        </p>
      )}

      <Card>
        <CardContent className="divide-y">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-sm text-muted-foreground">{m.email}</p>
              </div>
              <span className="text-sm text-muted-foreground">
                {t(`roles.${m.role}`)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle>{t("members.invite")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={inviteMemberAction} className="flex flex-wrap gap-3">
              <input type="hidden" name="path" value={path} />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <Input
                name="email"
                type="email"
                required
                placeholder={t("members.email")}
                className="w-64"
              />
              <select
                name="role"
                defaultValue="field_supervisor"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
              >
                {ORG_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`roles.${role}`)}
                  </option>
                ))}
              </select>
              <Button type="submit">{t("members.send")}</Button>
            </form>

            {pendingInvites.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-medium">
                  {t("members.pending")}
                </h3>
                <ul className="flex flex-col gap-2">
                  {pendingInvites.map((inv) => {
                    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${locale}/invite/${inv.id}`;
                    return (
                      <li
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span>
                            {inv.email} ·{" "}
                            {t(`roles.${inv.role ?? "field_supervisor"}`)}
                          </span>
                          <code className="truncate text-xs text-muted-foreground">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}

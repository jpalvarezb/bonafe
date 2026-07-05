import { eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { invitation, organization } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AcceptInviteButton } from "@/components/auth/accept-invite-button";

export default async function InvitePage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; invitationId: string }>;
}>) {
  const { locale, invitationId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("org.invite");
  const session = await getSession();

  const rows = await db
    .select({ inv: invitation, org: organization })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .where(eq(invitation.id, invitationId))
    .limit(1);

  const row = rows[0];
  const valid =
    row && row.inv.status === "pending" && row.inv.expiresAt > new Date();

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {valid ? t("title", { org: row.org.name }) : t("error")}
          </CardTitle>
        </CardHeader>
        {valid && (
          <CardContent className="flex flex-col gap-4">
            {session ? (
              <AcceptInviteButton
                invitationId={invitationId}
                orgSlug={row.org.slug}
                label={t("accept")}
              />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {t("loginFirst")}
                </p>
                <Button asChild>
                  <Link href={`/login`}>{t("accept")}</Link>
                </Button>
              </>
            )}
          </CardContent>
        )}
      </Card>
    </main>
  );
}

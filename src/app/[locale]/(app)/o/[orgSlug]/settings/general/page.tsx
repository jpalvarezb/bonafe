import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function GeneralSettingsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("plan");

  const rows = [
    { key: "name", value: ctx.org.name },
    { key: "slug", value: ctx.org.slug },
    { key: "currency", value: ctx.org.baseCurrencyCode },
    { key: "country", value: ctx.org.country ?? "—" },
    { key: "timezone", value: ctx.org.timezone },
  ] as const;

  const links = [
    { key: "members", href: `/o/${orgSlug}/settings/members` },
    { key: "plan", href: `/o/${orgSlug}/settings/plan` },
    { key: "currencies", href: `/o/${orgSlug}/settings/currencies` },
    { key: "import", href: `/o/${orgSlug}/settings/import` },
  ] as const;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("general.title")}</h1>

      <Card>
        <CardContent className="divide-y">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between py-3"
            >
              <span className="text-sm text-muted-foreground">
                {t(`general.${row.key}`)}
              </span>
              <span className="text-sm font-medium">{row.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Button key={link.key} asChild variant="outline">
              <Link href={link.href}>{t(`general.links.${link.key}`)}</Link>
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

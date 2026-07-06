import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listFarms } from "@/server/services/farms";
import { createFarmAction } from "@/server/actions/farms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function FarmsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("farms");
  const farms = await listFarms(ctx, { includeInactive: true });
  const canCreate = can(ctx.role, "farm", "create");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {farms.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {farms.map((farm) => (
            <Link key={farm.id} href={`/o/${orgSlug}/farms/${farm.id}`}>
              <Card className="transition-colors hover:bg-accent/40">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle>{farm.name}</CardTitle>
                  {!farm.active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t("status.inactive")}
                    </span>
                  )}
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {farm.areaHa ? `${farm.areaHa} ha` : "—"}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createFarmAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input id="name" name="name" required className="w-56" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="areaHa">{t("areaHa")}</Label>
                <Input
                  id="areaHa"
                  name="areaHa"
                  type="number"
                  step="0.0001"
                  min="0"
                  className="w-32"
                />
              </div>
              <Button type="submit">{t("create")}</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

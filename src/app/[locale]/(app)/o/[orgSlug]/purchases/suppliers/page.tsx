import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { listSuppliers } from "@/server/services/suppliers";
import { createSupplierAction } from "@/server/actions/suppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SuppliersPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "inventory")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=inventory`);
  }

  const t = await getTranslations("purchases.suppliers");
  const suppliers = await listSuppliers(ctx);
  const canManage = can(ctx.role, "inventory", "manage");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardContent>
          {suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="divide-y">
              {suppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{supplier.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[supplier.contactName, supplier.phone, supplier.email]
                        .filter(Boolean)
                        .join(" · ") || t("noContact")}
                    </p>
                  </div>
                  {canManage && (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/o/${orgSlug}/purchases/suppliers/${supplier.id}`}
                      >
                        {t("edit")}
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createSupplierAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input id="name" name="name" required className="w-48" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="contactName">{t("contactName")}</Label>
                <Input id="contactName" name="contactName" className="w-40" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">{t("phone")}</Label>
                <Input id="phone" name="phone" className="w-32" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  className="w-48"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="taxId">{t("taxId")}</Label>
                <Input id="taxId" name="taxId" className="w-32" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">{t("notes")}</Label>
                <Input id="notes" name="notes" className="w-48" />
              </div>
              <Button type="submit">{t("create")}</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

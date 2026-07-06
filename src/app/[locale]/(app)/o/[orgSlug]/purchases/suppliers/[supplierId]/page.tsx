import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";
import { getSupplier } from "@/server/services/suppliers";
import {
  deleteSupplierAction,
  updateSupplierAction,
} from "@/server/actions/suppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EditSupplierPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; supplierId: string }>;
}>) {
  const { locale, orgSlug, supplierId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);

  const plan = await getOrgPlan(ctx.org.id);
  if (!hasFeature(plan, "inventory")) {
    redirect(`/${locale}/o/${orgSlug}/settings/plan?feature=inventory`);
  }

  if (!can(ctx.role, "inventory", "manage")) {
    redirect(`/${locale}/o/${orgSlug}/purchases/suppliers`);
  }

  const t = await getTranslations("purchases.suppliers");
  const supplier = await getSupplier(ctx, supplierId);
  if (!supplier) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{supplier.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("edit")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={updateSupplierAction}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="id" value={supplier.id} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input id="name" name="name" defaultValue={supplier.name} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contactName">{t("contactName")}</Label>
              <Input
                id="contactName"
                name="contactName"
                defaultValue={supplier.contactName ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={supplier.phone ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={supplier.email ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="taxId">{t("taxId")}</Label>
              <Input
                id="taxId"
                name="taxId"
                defaultValue={supplier.taxId ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">{t("notes")}</Label>
              <Input
                id="notes"
                name="notes"
                defaultValue={supplier.notes ?? ""}
              />
            </div>
            <Button type="submit" className="self-start">
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <form action={deleteSupplierAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="id" value={supplier.id} />
        <Button variant="destructive" type="submit">
          {t("delete")}
        </Button>
      </form>
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listProducts } from "@/server/services/catalog";
import { createProductAction } from "@/server/actions/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const CATEGORIES = [
  "fertilizer",
  "agrochemical",
  "seed",
  "tool",
  "fuel",
  "other",
] as const;

export default async function ProductsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("catalog.products");
  const tImporter = await getTranslations("importer");

  const products = await listProducts(ctx);
  const canManage = can(ctx.role, "catalog", "manage");
  const path = `/${locale}/o/${orgSlug}/catalog/products`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/export?type=products&org=${orgSlug}&locale=${locale}`}>
              {tImporter("exportCsv")}
            </a>
          </Button>
          {canManage && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/o/${orgSlug}/settings/import`}>
                {tImporter("importCsv")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="divide-y">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {t(`categories.${product.category}`)} · {product.unit}
                      {product.activeIngredient
                        ? ` · ${product.activeIngredient}`
                        : ""}
                    </p>
                  </div>
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
              action={createProductAction}
              className="flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="path" value={path} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input id="name" name="name" required className="w-48" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="category">{t("category")}</Label>
                <select
                  id="category"
                  name="category"
                  defaultValue="fertilizer"
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {t(`categories.${cat}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="unit">{t("unit")}</Label>
                <Input
                  id="unit"
                  name="unit"
                  placeholder="kg, L, saco"
                  className="w-28"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="activeIngredient">
                  {t("activeIngredient")}
                </Label>
                <Input
                  id="activeIngredient"
                  name="activeIngredient"
                  className="w-40"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="minStock">{t("minStock")}</Label>
                <Input
                  id="minStock"
                  name="minStock"
                  type="number"
                  min="0"
                  step="0.0001"
                  className="w-28"
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

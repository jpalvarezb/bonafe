import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listCostCenters } from "@/server/services/cost-centers";
import {
  createCostCenterAction,
  deleteCostCenterAction,
} from "@/server/actions/cost-centers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function CostCentersPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("costcenters");

  const costCenters = await listCostCenters(ctx);
  const canManage = can(ctx.role, "cost_center", "manage");

  const roots = costCenters.filter((cc) => cc.parentId === null);
  const childrenByParent = new Map<string, typeof costCenters>();
  for (const cc of costCenters) {
    if (cc.parentId === null) continue;
    const siblings = childrenByParent.get(cc.parentId) ?? [];
    siblings.push(cc);
    childrenByParent.set(cc.parentId, siblings);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {costCenters.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <Card>
          <CardContent className="divide-y">
            {roots.map((root) => (
              <div key={root.id} className="py-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{root.name}</p>
                  {canManage && (
                    <form action={deleteCostCenterAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="id" value={root.id} />
                      <Button variant="ghost" size="sm" type="submit">
                        {t("delete")}
                      </Button>
                    </form>
                  )}
                </div>
                {(childrenByParent.get(root.id) ?? []).map((child) => (
                  <div
                    key={child.id}
                    className="ml-6 flex items-center justify-between border-t py-2 first:border-t-0"
                  >
                    <p className="text-sm text-muted-foreground">
                      {child.name}
                    </p>
                    {canManage && (
                      <form action={deleteCostCenterAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="orgSlug" value={orgSlug} />
                        <input type="hidden" name="id" value={child.id} />
                        <Button variant="ghost" size="sm" type="submit">
                          {t("delete")}
                        </Button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createCostCenterAction}
              className="grid gap-4 sm:grid-cols-2"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("name")}</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="parentId">{t("parent")}</Label>
                <select
                  id="parentId"
                  name="parentId"
                  defaultValue=""
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">{t("parentNone")}</option>
                  {roots.map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="self-end justify-self-start">
                {t("create")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

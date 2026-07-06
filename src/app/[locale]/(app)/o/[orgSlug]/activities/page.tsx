import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { listActivities } from "@/server/services/activities";
import { deleteActivityAction } from "@/server/actions/activities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PendingEntries } from "@/components/offline/pending-entries";

export default async function ActivitiesPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("activities");
  const tImporter = await getTranslations("importer");
  const format = await getFormatter();

  const rows = await listActivities(ctx);
  const canCreate = can(ctx.role, "activity", "create");
  const canDelete = can(ctx.role, "activity", "delete");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/export?type=activities&org=${orgSlug}&locale=${locale}`}
            >
              {tImporter("exportCsv")}
            </a>
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href={`/o/${orgSlug}/activities/new`}>{t("new")}</Link>
            </Button>
          )}
        </div>
      </div>

      <PendingEntries orgSlug={orgSlug} kind="activity.create" />

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="divide-y">
              {rows.map(({ activity, typeName, parcelName, cycleName }) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {typeName}
                      {parcelName ? ` · ${parcelName}` : ` · ${t("parcelNone")}`}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {activity.date}
                      {cycleName ? ` · ${cycleName}` : ""}
                      {activity.description ? ` · ${activity.description}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium">
                      {format.number(Number(activity.totalCost), {
                        style: "currency",
                        currency: activity.currencyCode,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    {canDelete && (
                      <form action={deleteActivityAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="orgSlug" value={orgSlug} />
                        <input
                          type="hidden"
                          name="activityId"
                          value={activity.id}
                        />
                        <Button variant="ghost" size="sm" type="submit">
                          {t("delete")}
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

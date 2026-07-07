import { desc, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { withOrgRls } from "@/lib/db/rls";
import { importJobs } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { importCsvAction } from "@/server/actions/importer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RowError = { row: number; error: string };

export default async function ImportPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("importer");

  if (!can(ctx.role, "catalog", "manage")) {
    return null;
  }

  const jobs = await withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(importJobs)
      .where(eq(importJobs.orgId, ctx.org.id))
      .orderBy(desc(importJobs.createdAt))
      .limit(10),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {(["products", "parcels"] as const).map((type) => (
        <Card key={type}>
          <CardHeader>
            <CardTitle>{t(`${type}.title`)}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={importCsvAction}
              className="flex flex-wrap items-center gap-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="type" value={type} />
              <input
                type="file"
                name="file"
                accept=".csv"
                required
                className="text-sm"
              />
              <Button type="submit">{t("upload")}</Button>
            </form>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(`${type}.hint`)}
            </p>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{t("history.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("history.empty")}
            </p>
          ) : (
            <div className="divide-y">
              {jobs.map((job) => {
                const errors = (job.errorReport as RowError[]) ?? [];
                return (
                  <div key={job.id} className="flex flex-col gap-1 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <p className="min-w-0 truncate font-medium">
                        {job.fileName}
                      </p>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {t(`status.${job.status}`)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t(`types.${job.type}`)} ·{" "}
                      {t("history.rows", {
                        count: Number(job.rowsImported),
                      })}
                    </p>
                    {errors.slice(0, 3).map((err) => (
                      <p
                        key={`${job.id}-${err.row}`}
                        className="text-sm text-destructive"
                      >
                        {t("history.rowError", {
                          row: err.row,
                          error: err.error,
                        })}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

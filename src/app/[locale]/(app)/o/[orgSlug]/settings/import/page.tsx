import { desc, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { withOrgRls } from "@/lib/db/rls";
import { importJobs } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { importCsvAction } from "@/server/actions/importer";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { cn } from "@/lib/utils";

const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";
const BTN =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

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
      <SettingsTabs orgSlug={orgSlug} role={ctx.role} active="import" />
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {(["products", "parcels"] as const).map((type) => (
        <div key={type} className="border border-border">
          <div className="px-3.5 py-2.5">
            <span className="text-[13px] font-semibold">
              {t(`${type}.title`)}
            </span>
          </div>
          <div className="border-t border-border px-3.5 py-3">
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
                className="text-[length:var(--density-font-body)] focus-visible:outline-none"
              />
              <button type="submit" className={BTN}>
                {t("upload")}
              </button>
            </form>
            <p className="mt-2 text-[length:var(--density-font-label)] text-muted-foreground">
              {t(`${type}.hint`)}
            </p>
          </div>
        </div>
      ))}

      <div className="border border-border">
        <div className="px-3.5 py-2.5">
          <span className="text-[13px] font-semibold">
            {t("history.title")}
          </span>
        </div>
        {jobs.length === 0 ? (
          <p
            className={cn(
              CELL,
              "border-t border-border text-[length:var(--density-font-body)] text-muted-foreground",
            )}
          >
            {t("history.empty")}
          </p>
        ) : (
          <div className="border-t border-border">
            {jobs.map((job) => {
              const errors = (job.errorReport as RowError[]) ?? [];
              return (
                <div
                  key={job.id}
                  className={cn(
                    CELL,
                    "flex flex-col gap-1 border-b border-border last:border-b-0",
                  )}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="min-w-0 truncate font-medium">
                      {job.fileName}
                    </p>
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                      {t(`status.${job.status}`)}
                    </span>
                  </div>
                  <p className={MICRO_LABEL}>
                    {t(`types.${job.type}`)} ·{" "}
                    {t("history.rows", {
                      count: Number(job.rowsImported),
                    })}
                  </p>
                  {errors.slice(0, 3).map((err) => (
                    <p
                      key={`${job.id}-${err.row}`}
                      className="text-[length:var(--density-font-label)] text-destructive"
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
      </div>
    </div>
  );
}

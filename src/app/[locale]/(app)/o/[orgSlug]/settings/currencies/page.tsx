import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { CURRENCIES } from "@/lib/currency";
import { listExchangeRates } from "@/server/services/exchange-rates";
import {
  deleteExchangeRateAction,
  upsertExchangeRateAction,
} from "@/server/actions/exchange-rates";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { cn } from "@/lib/utils";

const MICRO_LABEL =
  "font-mono text-[length:var(--density-font-label)] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CELL = "px-[var(--density-cell-px)] py-[var(--density-cell-py)]";
const CONTROL =
  "h-[var(--density-control-h)] w-full rounded-[3px] border border-border bg-transparent px-[var(--density-cell-px)] text-[length:var(--density-font-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BTN =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] border border-border px-[var(--density-cell-px)] text-[length:var(--density-font-body)] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const BTN_GHOST =
  "inline-flex h-[var(--density-control-h)] items-center justify-center rounded-[3px] px-2 font-mono text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export default async function CurrenciesPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("currencies");

  const rates = await listExchangeRates(ctx);
  const canManage = can(ctx.role, "settings", "manage");
  const today = new Date().toISOString().slice(0, 10);
  const otherCurrencies = CURRENCIES.filter(
    (c) => c.code !== ctx.org.baseCurrencyCode,
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SettingsTabs orgSlug={orgSlug} role={ctx.role} active="currencies" />
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div
        className={cn(
          CELL,
          "flex items-center justify-between border border-border",
        )}
      >
        <span className={MICRO_LABEL}>{t("baseCurrency")}</span>
        <span className="tabular font-mono text-[18px] font-semibold">
          {ctx.org.baseCurrencyCode}
        </span>
      </div>

      <div className="border border-border">
        {rates.length === 0 ? (
          <p
            className={cn(
              CELL,
              "text-[length:var(--density-font-body)] text-muted-foreground",
            )}
          >
            {t("empty")}
          </p>
        ) : (
          rates.map((rate) => (
            <div
              key={rate.id}
              className={cn(
                CELL,
                "flex items-center justify-between border-b border-border last:border-b-0",
              )}
            >
              <div>
                <p className="font-mono text-[length:var(--density-font-body)] font-medium">
                  {rate.currencyCode}
                </p>
                <p className="tabular font-mono text-[10.5px] text-muted-foreground">
                  {t("rate")}: {rate.rateToBase} · {t("validFrom")}:{" "}
                  {rate.validDate}
                </p>
                <p className="tabular font-mono text-[10.5px] text-muted-foreground">
                  {t("source")}:{" "}
                  {rate.source === "open-er-api"
                    ? t("sourceFeed")
                    : t("sourceManual")}
                  {rate.fetchedAt && (
                    <>
                      {" "}
                      · {t("fetchedAt")}:{" "}
                      {new Date(rate.fetchedAt).toLocaleString(locale)}
                    </>
                  )}
                </p>
              </div>
              {canManage && (
                <form action={deleteExchangeRateAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="id" value={rate.id} />
                  <button type="submit" className={BTN_GHOST}>
                    {t("delete")}
                  </button>
                </form>
              )}
            </div>
          ))
        )}
      </div>

      {canManage && otherCurrencies.length > 0 && (
        <div className="border border-border">
          <div className="px-3.5 py-2.5">
            <span className="text-[13px] font-semibold">{t("addRate")}</span>
          </div>
          <div className="border-t border-border px-3.5 py-3">
            <form
              action={upsertExchangeRateAction}
              className="grid gap-4 sm:grid-cols-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currencyCode" className={MICRO_LABEL}>
                  {t("currency")}
                </Label>
                <select
                  id="currencyCode"
                  name="currencyCode"
                  required
                  className={CONTROL}
                >
                  {otherCurrencies.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} · {currency.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rateToBase" className={MICRO_LABEL}>
                  {t("rate")}
                </Label>
                <Input
                  id="rateToBase"
                  name="rateToBase"
                  type="number"
                  step="0.00000001"
                  min="0"
                  required
                  className={cn(CONTROL, "tabular font-mono")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="validDate" className={MICRO_LABEL}>
                  {t("validFrom")}
                </Label>
                <Input
                  id="validDate"
                  name="validDate"
                  type="date"
                  required
                  defaultValue={today}
                  className={CONTROL}
                />
              </div>
              <p className="text-[length:var(--density-font-label)] text-muted-foreground sm:col-span-3">
                {t("hint")}
              </p>
              <button
                type="submit"
                className={cn(BTN, "self-start sm:col-span-3")}
              >
                {t("addRate")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { can } from "@/lib/authz";
import { CURRENCIES } from "@/lib/currency";
import { listExchangeRates } from "@/server/services/exchange-rates";
import {
  deleteExchangeRateAction,
  upsertExchangeRateAction,
} from "@/server/actions/exchange-rates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

  const selectClass =
    "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-sm text-muted-foreground">
            {t("baseCurrency")}
          </span>
          <span className="text-lg font-semibold">
            {ctx.org.baseCurrencyCode}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="divide-y">
          {rates.length === 0 ? (
            <p className="py-4 text-muted-foreground">{t("empty")}</p>
          ) : (
            rates.map((rate) => (
              <div
                key={rate.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium">{rate.currencyCode}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("rate")}: {rate.rateToBase} · {t("validFrom")}:{" "}
                    {rate.validDate}
                  </p>
                </div>
                {canManage && (
                  <form action={deleteExchangeRateAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="id" value={rate.id} />
                    <Button variant="ghost" size="sm" type="submit">
                      {t("delete")}
                    </Button>
                  </form>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {canManage && otherCurrencies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("addRate")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={upsertExchangeRateAction}
              className="grid gap-4 sm:grid-cols-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="currencyCode">{t("currency")}</Label>
                <select
                  id="currencyCode"
                  name="currencyCode"
                  required
                  className={selectClass}
                >
                  {otherCurrencies.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} · {currency.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="rateToBase">{t("rate")}</Label>
                <Input
                  id="rateToBase"
                  name="rateToBase"
                  type="number"
                  step="0.00000001"
                  min="0"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="validDate">{t("validFrom")}</Label>
                <Input
                  id="validDate"
                  name="validDate"
                  type="date"
                  required
                  defaultValue={today}
                />
              </div>
              <p className="text-sm text-muted-foreground sm:col-span-3">
                {t("hint")}
              </p>
              <Button type="submit" className="self-start sm:col-span-3">
                {t("addRate")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

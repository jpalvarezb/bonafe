import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { createOrganizationAction } from "@/server/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const CURRENCIES = ["USD", "NIO", "GTQ", "HNL", "CRC", "MXN", "COP"];

export default async function OnboardingPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession(locale);
  const t = await getTranslations("org.onboarding");

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createOrganizationAction} className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input
                id="name"
                name="name"
                required
                minLength={2}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="country">{t("country")}</Label>
              <Input id="country" name="country" placeholder="Nicaragua" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="baseCurrencyCode">{t("currency")}</Label>
              <select
                id="baseCurrencyCode"
                name="baseCurrencyCode"
                defaultValue="USD"
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">{t("submit")}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

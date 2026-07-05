import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function HomePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");
  const tAuth = await getTranslations("auth");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">{t("appName")}</h1>
      <p className="text-lg text-muted-foreground">{t("tagline")}</p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/register">{tAuth("register.submit")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">{tAuth("login.submit")}</Link>
        </Button>
      </div>
      <div className="flex gap-2 text-sm text-muted-foreground">
        <Link href="/" locale="es" className="underline-offset-4 hover:underline">
          Español
        </Link>
        <span>·</span>
        <Link href="/" locale="en" className="underline-offset-4 hover:underline">
          English
        </Link>
      </div>
    </main>
  );
}

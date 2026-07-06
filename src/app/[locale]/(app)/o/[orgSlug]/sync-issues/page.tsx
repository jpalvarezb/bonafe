import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { SyncIssuesList } from "@/components/offline/sync-issues-list";

export default async function SyncIssuesPage({
  params,
}: Readonly<{ params: Promise<{ locale: string; orgSlug: string }> }>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("offline");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("issues.title")}</h1>
      <SyncIssuesList orgSlug={orgSlug} />
    </div>
  );
}

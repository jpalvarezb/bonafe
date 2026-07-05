import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { getFarm } from "@/server/services/farms";
import { ParcelForm } from "@/components/farms/parcel-form";

export default async function NewParcelPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string; farmId: string }>;
}>) {
  const { locale, orgSlug, farmId } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("farms");

  const farm = await getFarm(ctx, farmId);
  if (!farm) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {farm.name} · {t("parcels.new")}
      </h1>
      <ParcelForm locale={locale} orgSlug={orgSlug} farmId={farmId} />
    </div>
  );
}

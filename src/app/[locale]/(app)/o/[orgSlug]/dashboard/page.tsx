import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { listFarms } from "@/server/services/farms";
import { cockpitData } from "@/server/reports/cockpit";
import { MapCockpit } from "@/components/cockpit/map-cockpit";
import { ViewToggle } from "@/components/cockpit/view-toggle";
import { DashboardPanel } from "./dashboard-panel";

export default async function OrgDashboardPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ view?: string; farm?: string }>;
}>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const sp = await searchParams;
  const view = sp.view === "panel" ? "panel" : "mapa";
  const t = await getTranslations("cockpit");
  const toggleLabels = { mapa: t("toggle.mapa"), panel: t("toggle.panel") };

  if (view === "panel") {
    return (
      <DashboardPanel
        ctx={ctx}
        toggle={
          <ViewToggle
            orgSlug={orgSlug}
            active="panel"
            farmId={sp.farm}
            labels={toggleLabels}
          />
        }
      />
    );
  }

  // Map cockpit is farm-scoped (one farm's parcels at a time), same
  // farm-picker convention as the climate page: default to the first farm
  // by name (listFarms already orders by name).
  const farms = await listFarms(ctx);

  if (farms.length === 0) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{t("toggle.mapa")}</h1>
          <ViewToggle orgSlug={orgSlug} active="mapa" labels={toggleLabels} />
        </div>
        <p className="text-muted-foreground">{t("empty.noFarms")}</p>
      </div>
    );
  }

  const activeFarmId = farms.find((farm) => farm.id === sp.farm)?.id ?? farms[0].id;
  const data = await cockpitData(ctx, activeFarmId);

  return (
    <div className="-m-4 h-[calc(100%+2rem)] overflow-hidden md:-m-6 md:h-[calc(100%+3rem)]">
      <MapCockpit
        key={data.farmId}
        data={data}
        orgSlug={orgSlug}
        currencyCode={ctx.org.baseCurrencyCode}
        farms={farms.map((farm) => ({ id: farm.id, name: farm.name }))}
      />
    </div>
  );
}

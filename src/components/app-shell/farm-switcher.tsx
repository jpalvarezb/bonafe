"use client";

import { ChevronDown, MapPinned } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Farm = { readonly id: string; readonly name: string };

/**
 * Compact header dropdown replacing the old flat /map nav item — lists the
 * org's farms plus "Todas las fincas" (the standalone all-farms map, still
 * a live route). Hidden entirely when the org has 0 farms. Labels the
 * current context with the active farm's name when cheaply derivable from
 * the URL (on the dashboard with ?farm=<id>); otherwise falls back to the
 * neutral "Fincas" label — deliberately not over-engineered further.
 */
export function FarmSwitcher({
  orgSlug,
  farms,
}: {
  readonly orgSlug: string;
  readonly farms: readonly Farm[];
}) {
  const t = useTranslations("common.farmSwitcher");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (farms.length === 0) return null;

  const onDashboard = pathname === `/o/${orgSlug}/dashboard`;
  const activeFarmId = onDashboard ? searchParams.get("farm") : null;
  const activeFarm = activeFarmId
    ? farms.find((farm) => farm.id === activeFarmId)
    : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5">
          <MapPinned className="size-4" />
          <span className="max-w-32 truncate">
            {activeFarm ? activeFarm.name : t("label")}
          </span>
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {farms.map((farm) => (
          <DropdownMenuItem key={farm.id} asChild>
            <Link href={`/o/${orgSlug}/dashboard?view=mapa&farm=${farm.id}`}>
              {farm.name}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/o/${orgSlug}/map`}>{t("allFarms")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

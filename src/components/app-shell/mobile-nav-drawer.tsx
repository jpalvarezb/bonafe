"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import type { OrgRole } from "@/lib/auth/permissions";

/**
 * Interim fix for the no-nav-on-phone bug: below `md` the sidebar <aside>
 * is hidden with no replacement, so this renders the same grouped
 * SidebarNav inside a slide-over drawer, triggered by a hamburger button in
 * the header. The Campo bottom bar (the real mobile IA) is Phase 3 — out of
 * scope here.
 */
export function MobileNavDrawer(props: {
  readonly orgSlug: string;
  readonly role: OrgRole;
  readonly features: readonly string[];
  readonly featureTiers: Readonly<Record<string, string>>;
}) {
  const { orgSlug, role, features, featureTiers } = props;
  const t = useTranslations("common.nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Belt-and-suspenders close-on-navigation: SidebarNav's onNavigate covers
  // clicks; this covers any other pathname change while the drawer is open
  // (e.g. programmatic navigation). Deriving state during render — rather
  // than in a useEffect — is the React-recommended pattern for "reset state
  // when a prop changes" and avoids an extra cascading-render cycle.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label={t("openMenu")}
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" closeLabel={t("closeMenu")}>
        <SheetTitle>{t("menuTitle")}</SheetTitle>
        <SheetDescription>{t("menuTitle")}</SheetDescription>
        <div className="h-full overflow-y-auto">
          <SidebarNav
            orgSlug={orgSlug}
            role={role}
            features={features}
            featureTiers={featureTiers}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

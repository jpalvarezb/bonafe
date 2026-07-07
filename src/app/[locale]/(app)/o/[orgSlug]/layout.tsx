import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/lib/tenancy";
import { SidebarNav } from "@/components/app-shell/sidebar-nav";
import { LogoutButton } from "@/components/auth/logout-button";
import { SyncProvider } from "@/components/offline/sync-provider";
import { SyncStatusBadge } from "@/components/offline/sync-status-badge";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ModeToggle } from "@/components/layout/mode-toggle";

export default async function OrgLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string; orgSlug: string }>;
}>) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const ctx = await requireOrgContext(locale, orgSlug);
  const t = await getTranslations("common");

  return (
    <div className="flex min-h-svh flex-col">
      <SyncProvider orgSlug={orgSlug} />
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-baseline gap-3">
          <span className="font-semibold">{t("appName")}</span>
          <span className="text-sm text-muted-foreground">{ctx.org.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <SyncStatusBadge orgSlug={orgSlug} />
          <ModeToggle />
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r md:block">
          <SidebarNav orgSlug={orgSlug} />
        </aside>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

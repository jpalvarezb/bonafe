import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireSession } from "@/lib/auth/session";
import { listUserOrgs } from "@/lib/tenancy";

/** Post-login entry point: route to the user's org or to onboarding. */
export default async function DashboardRedirect({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireSession(locale);
  const orgs = await listUserOrgs(session.user.id);

  if (orgs.length === 0) {
    redirect(`/${locale}/onboarding`);
  }
  redirect(`/${locale}/o/${orgs[0].org.slug}/dashboard`);
}

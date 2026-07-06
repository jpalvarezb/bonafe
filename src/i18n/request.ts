import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

// Message namespaces, one JSON file each under messages/{locale}/
const NAMESPACES = [
  "common",
  "auth",
  "org",
  "farms",
  "catalog",
  "cycles",
  "activities",
  "dashboard",
  "monitoring",
  "climate",
  "workorders",
  "costcenters",
  "importer",
  "plan",
  "currencies",
  "offline",
  "workers",
  "attendance",
  "payroll",
  "harvests",
  "purchases",
  "inventory",
] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => [
      ns,
      (await import(`../../messages/${locale}/${ns}.json`)).default,
    ]),
  );

  return {
    locale,
    messages: Object.fromEntries(entries),
  };
});

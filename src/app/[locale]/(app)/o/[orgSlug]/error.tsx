"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Error boundary for the org segment (o/[orgSlug]/**). Server actions in
 * this codebase throw plain Errors on authz/plan failures (see
 * src/lib/authz.ts assertCan, src/lib/plan-limits.ts assertOrgFeature) —
 * before this file existed those surfaced as an uncaught 500. Must be a
 * Client Component (Next 16 error-file convention).
 */
export default function OrgError({
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const t = useTranslations("common.error");

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
          <Button onClick={() => reset()} className="mt-2">
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

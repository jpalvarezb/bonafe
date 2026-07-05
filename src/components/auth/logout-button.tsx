"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const t = useTranslations("common");
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
    >
      {t("nav.logout")}
    </Button>
  );
}

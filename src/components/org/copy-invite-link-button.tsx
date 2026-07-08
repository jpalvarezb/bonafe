"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Email sending is console-only in this codebase (see
 * src/lib/auth/index.ts sendInvitationEmail) — the copyable accept URL is
 * the only real way to hand a pending invitation to its recipient today.
 */
export function CopyInviteLinkButton({
  url,
}: Readonly<{ url: string }>) {
  const t = useTranslations("org.members");
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          // navigator.clipboard is undefined outside secure contexts (plain
          // http on a LAN IP) — fall back to the legacy selection API so the
          // button still works there instead of rejecting silently.
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
          } else {
            const textarea = document.createElement("textarea");
            textarea.value = url;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt(t("copyManual"), url);
        }
      }}
    >
      {copied ? (
        <>
          <Check className="size-3.5" aria-hidden="true" />
          {t("copied")}
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden="true" />
          {t("copyLink")}
        </>
      )}
    </Button>
  );
}

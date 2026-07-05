"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({
  invitationId,
  orgSlug,
  label,
}: Readonly<{ invitationId: string; orgSlug: string; label: string }>) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const result = await authClient.organization.acceptInvitation({
          invitationId,
        });
        setLoading(false);
        if (!result.error) {
          router.push(`/o/${orgSlug}/dashboard`);
        }
      }}
    >
      {label}
    </Button>
  );
}

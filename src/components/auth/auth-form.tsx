"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { signIn, signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthForm({ mode }: { readonly mode: "login" | "register" }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const result =
      mode === "login"
        ? await signIn.email({ email, password })
        : await signUp.email({
            email,
            password,
            name: String(form.get("name")),
            locale,
          });

    setLoading(false);
    if (result.error) {
      setError(t(`${mode}.error`));
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t(`${mode}.title`)}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "register" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">{t("register.name")}</Label>
                <Input id="name" name="name" required autoComplete="name" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t(`${mode}.email`)}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t(`${mode}.password`)}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {t(`${mode}.submit`)}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                {t("login.noAccount")}{" "}
                <Link href="/register" className="underline underline-offset-4">
                  {t("login.registerLink")}
                </Link>
              </>
            ) : (
              <>
                {t("register.hasAccount")}{" "}
                <Link href="/login" className="underline underline-offset-4">
                  {t("register.loginLink")}
                </Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

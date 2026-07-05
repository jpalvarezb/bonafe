import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from ".";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** For pages that require authentication; redirects to login otherwise. */
export async function requireSession(locale: string) {
  const session = await getSession();
  if (!session) {
    redirect(`/${locale}/login`);
  }
  return session;
}

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "../db";
import * as schema from "../db/schema";
import { ac, roles } from "./permissions";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Brute-force protection on auth endpoints (per-IP, in-memory; sign-in and
  // similar sensitive routes get Better Auth's stricter built-in overrides).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
  },
  user: {
    additionalFields: {
      locale: {
        type: "string",
        defaultValue: "es",
        input: true,
      },
    },
  },
  plugins: [
    organization({
      ac,
      roles,
      creatorRole: "owner",
      async sendInvitationEmail(data) {
        // TODO(phase 2): send via SMTP (mailpit locally). For now, log the link.
        console.log(
          `[invite] ${data.email} -> ${data.organization.name}: ` +
            `${process.env.BETTER_AUTH_URL}/es/invite/${data.id}`,
        );
      },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

import { createAuthClient } from "better-auth/react";
import {
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import type { auth } from ".";
import { ac, roles } from "./permissions";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    organizationClient({ ac, roles }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;

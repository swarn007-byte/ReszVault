import { createAuthClient } from "better-auth/react";
import { getApiBase } from "./api-base";

/**
 * Backend: `app.all(/^\/api\/auth\/(.*)/, toNodeHandler(auth))`
 * Vercel rewrites /api/auth → Render (see vercel.json)
 */
export const authClient = createAuthClient({
  baseURL: getApiBase(),
  basePath: "/api/auth",
});

export const { signIn, signUp, signOut, useSession } = authClient;

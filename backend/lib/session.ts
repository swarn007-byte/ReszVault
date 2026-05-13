import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";

export type AuthedRequest = Request & { userId?: string };

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) {
      return res.status(401).json({ error: "Sign in required" });
    }
    req.userId = session.user.id;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

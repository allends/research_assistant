import type { Context, Next } from "hono";

export function authMiddleware(validToken: string) {
  return async (c: Context, next: Next) => {
    if (c.req.path === "/health") return next();
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token !== validToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  };
}

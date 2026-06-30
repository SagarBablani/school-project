import { correlationId, readSession } from "../auth.js";

export async function requestContext(req, res, next) {
  req.correlationId = req.headers["x-correlation-id"] || correlationId();
  res.setHeader("X-Correlation-Id", req.correlationId);

  const session = readSession(req.headers.cookie, req.app.locals.secret);
  req.user = session ? await req.app.locals.store.read((data) => data.users.find((item) => item.id === session.userId)) : null;
  next();
}

export function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Login required" });
  next();
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { resolve } from "node:path";
import { JsonStore } from "./models/store.js";
import { createApiRouter } from "./routes/apiRoutes.js";
import { startScheduler } from "./scheduler.js";
import { startTelegramPolling } from "./telegramBot.js";

export function createApp({
  dataFile = process.env.DATA_FILE || "work/data.json",
  secret = process.env.SESSION_SECRET || "dev-secret-change-me",
  uploadDir = process.env.UPLOAD_DIR || "work/uploads",
  publicDir = resolve("dist"),
  telegramToken = process.env.TELEGRAM_BOT_TOKEN || ""
} = {}) {
  const app = express();
  // Basic security middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true }));
  app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));
  app.use("/api/login", rateLimit({ windowMs: 60 * 1000, max: 20 }));
  app.use("/api/register", rateLimit({ windowMs: 60 * 1000, max: 20 }));
  app.use("/api/join", rateLimit({ windowMs: 60 * 1000, max: 20 }));
  const sseClients = new Set();
  const store = new JsonStore(dataFile);

  app.locals.store = store;
  app.locals.secret = secret;
  app.locals.uploadDir = uploadDir;
  app.locals.sseClients = sseClients;
  app.locals.broadcast = (schoolId) => {
    for (const client of sseClients) {
      if (client.schoolId === schoolId) client.res.write(`event: update\ndata: {"at":"${new Date().toISOString()}"}\n\n`);
    }
  };

  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createApiRouter());
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(express.static(publicDir));
  app.get("*", (req, res) => {
    res.sendFile(resolve(publicDir, "index.html"), (error) => {
      if (error) res.status(404).type("text").send("Build the React app with npm run build, or run npm run dev for Vite.");
    });
  });
  app.use((error, req, res, next) => {
    console.error(JSON.stringify({ level: "error", message: error.message, stack: error.stack }));
    res.status(error.status || 500).json({ error: error.status ? error.message : "Internal server error" });
  });

  // start background scheduler to run reminders periodically
  try {
    startScheduler(app);
  } catch (err) {
    console.error('Failed to start scheduler', err);
  }

  // Telegram is opt-in: only poll for updates when a bot token is configured,
  // so the app runs (and tests run) with no external network calls by default.
  if (telegramToken) {
    try {
      startTelegramPolling(app, telegramToken);
    } catch (err) {
      console.error("Failed to start Telegram polling", err);
    }
  }

  return app;
}

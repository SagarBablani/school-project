import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { resolve } from "node:path";
import { JsonStore } from "./models/store.js";
import { createApiRouter } from "./routes/apiRoutes.js";
import { startScheduler } from "./scheduler.js";

export function createApp({
  dataFile = process.env.DATA_FILE || "work/data.json",
  secret = process.env.SESSION_SECRET || "dev-secret-change-me",
  uploadDir = process.env.UPLOAD_DIR || "work/uploads",
  publicDir = resolve("dist")
} = {}) {
  const app = express();
  // Basic security middleware
  app.use(cors({ origin: true }));
  app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));
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

  return app;
}

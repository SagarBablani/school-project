import { runReminderEngine } from "./reminders.js";
import { resolveReminderNotifications, sendNotifications } from "./notify.js";
import { CronJob } from "cron";

let intervalId = null;
let cronJob = null;

export function startScheduler(app, { intervalMs = 1000 * 60 * 5, cronSchedule = process.env.SCHEDULER_CRON } = {}) {
  if (intervalId || cronJob) return;
  const runOnce = async () => {
    try {
      const { store, broadcast } = app.locals;
      let notifications = [];
      await store.mutate((data) => {
        const emitted = runReminderEngine(data, { actorId: "system", correlationId: `sched_${Date.now()}`, force: false, at: new Date() });
        data.scheduler = data.scheduler || { lastRunAt: null };
        data.scheduler.lastRunAt = new Date().toISOString();
        notifications = resolveReminderNotifications(data, emitted);
        return emitted;
      });
      await sendNotifications(app.locals.telegram, notifications);
      for (const school of await app.locals.store.read((d) => d.schools)) app.locals.broadcast(school.id);
    } catch (err) {
      console.error("Scheduler error", err);
    }
  };

  if (cronSchedule && String(cronSchedule).trim()) {
    cronJob = new CronJob(cronSchedule, runOnce, null, true, "Etc/UTC");
    runOnce();
    process.on("exit", () => cronJob?.stop());
  } else {
    runOnce();
    intervalId = setInterval(runOnce, intervalMs);
    process.on("exit", () => clearInterval(intervalId));
  }
}

export function stopScheduler() {
  if (intervalId) clearInterval(intervalId);
  if (cronJob) cronJob.stop();
  intervalId = null;
  cronJob = null;
}

import { runReminderEngine } from "../reminders.js";
import { resolveReminderNotifications, sendNotifications } from "../notify.js";
import { requireRole } from "./http.js";

export async function runReminders(req, res) {
  const { store, broadcast } = req.app.locals;
  requireRole(req.user, ["admin", "teacher"]);
  let notifications = [];
  const reminders = await store.mutate((data) => {
    const emitted = runReminderEngine(data, { actorId: req.user.id, correlationId: req.correlationId, force: Boolean(req.body?.force) });
    notifications = resolveReminderNotifications(data, emitted);
    return emitted;
  });
  await sendNotifications(req.app.locals.telegram, notifications);
  broadcast(req.user.schoolId);
  res.status(200).json({ reminders });
}

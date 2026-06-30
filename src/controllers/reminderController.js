import { runReminderEngine } from "../reminders.js";
import { requireRole } from "./http.js";

export async function runReminders(req, res) {
  const { store, broadcast } = req.app.locals;
  requireRole(req.user, ["admin", "teacher"]);
  const reminders = await store.mutate((data) => runReminderEngine(data, { actorId: req.user.id, correlationId: req.correlationId, force: Boolean(req.body?.force) }));
  broadcast(req.user.schoolId);
  res.status(200).json({ reminders });
}

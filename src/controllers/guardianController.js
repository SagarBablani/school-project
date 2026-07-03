import { addAudit } from "../models/store.js";
import { requireRole } from "./http.js";

export async function setGuardianOptIn(req, res) {
  const { store, broadcast } = req.app.locals;
  requireRole(req.user, ["guardian"]);
  const optedIn = Boolean(req.body?.optedIn);
  await store.mutate((data) => {
    const guardian = data.users.find((item) => item.id === req.user.id);
    guardian.optedIn = optedIn;
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "user", resourceId: req.user.id, action: optedIn ? "guardian.opted_in" : "guardian.opted_out" });
  });
  broadcast(req.user.schoolId);
  res.status(200).json({ ok: true, optedIn });
}

export async function requestGuardianDigest(req, res) {
  const { store } = req.app.locals;
  requireRole(req.user, ["guardian"]);
  const digest = await store.mutate((data) => {
    const studentIds = req.user.studentIds || [];
    const submissions = data.submissions.filter((item) => studentIds.includes(item.studentId));
    const summary = {
      blocked: submissions.filter((item) => item.status === "blocked").length,
      submitted: submissions.filter((item) => ["submitted", "completed"].includes(item.status)).length,
      inProgress: submissions.filter((item) => item.status === "in_progress").length,
      notStarted: submissions.filter((item) => item.status === "not_started").length
    };
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "user", resourceId: req.user.id, action: "guardian.digest_requested", details: summary });
    return summary;
  });
  res.status(200).json({ digest });
}

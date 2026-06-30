import { canReadAssignment } from "../auth.js";
import { identifyIntent } from "../parser.js";
import { addAudit, makeId } from "../models/store.js";
import { httpError } from "./http.js";

export async function handleMessage(req, res) {
  const { store, broadcast } = req.app.locals;
  const body = req.body || {};
  const assignmentId = body.assignmentId;
  const text = String(body.text || "");
  const result = await store.mutate((data) => {
    const intent = identifyIntent(text);
    const assignment = data.assignments.find((item) => item.id === assignmentId && item.schoolId === req.user.schoolId);
    if (assignmentId && !canReadAssignment(req.user, assignment)) {
      addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "assignment", resourceId: assignmentId, action: "access.denied", outcome: "denied", details: { intent: intent.intent } });
      throw httpError(403, "That assignment is outside your scope.");
    }
    let submission = null;
    if (["student", "teacher"].includes(req.user.role) && assignment) {
      const studentId = req.user.role === "student" ? req.user.id : body.studentId;
      if (req.user.role === "teacher" && !assignment.targetStudentIds.includes(studentId)) throw httpError(403, "That student is outside this assignment.");
      submission = data.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === studentId);
      if (!submission) {
        submission = { id: makeId("sub"), schoolId: req.user.schoolId, assignmentId: assignment.id, studentId, status: "not_started", history: [] };
        data.submissions.push(submission);
      }
      if (intent.intent === "blocked_help_request") submission.status = "blocked";
      if (intent.intent === "progress_update") submission.status = "in_progress";
      if (intent.intent === "submission") submission.status = "submitted";
      if (intent.intent === "teacher_feedback") submission.status = body.complete ? "completed" : "revision_requested";
      submission.history.unshift({ at: new Date().toISOString(), actorId: req.user.id, intent: intent.intent, text });
    }
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "message", resourceId: submission?.id, action: `intent.${intent.intent}`, outcome: intent.unsafe ? "denied" : "ok", details: { confidence: intent.confidence } });
    return { intent, submission };
  });
  broadcast(req.user.schoolId);
  res.status(200).json(result);
}

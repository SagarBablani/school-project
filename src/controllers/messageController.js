import { canReadAssignment } from "../auth.js";
import { identifyIntent } from "../parser.js";
import { addAudit, makeId } from "../models/store.js";
import { httpError } from "./http.js";

const GUARDIAN_INTENTS = new Set(["parent_opt_in", "escalation_acknowledgement", "parent_digest_request"]);

export async function handleMessage(req, res) {
  const { store, broadcast } = req.app.locals;
  const body = req.body || {};
  const assignmentId = body.assignmentId;
  const text = String(body.text || "");
  const result = await store.mutate((data) => {
    const intent = identifyIntent(text);

    if (req.user.role === "guardian" && GUARDIAN_INTENTS.has(intent.intent)) {
      const outcome = applyGuardianIntent(data, req, intent);
      addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "user", resourceId: req.user.id, action: `intent.${intent.intent}`, details: outcome });
      return { intent, ...outcome };
    }

    const assignment = data.assignments.find((item) => item.id === assignmentId && item.schoolId === req.user.schoolId);
    if (assignmentId && !canReadAssignment(req.user, assignment)) {
      addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "assignment", resourceId: assignmentId, action: "access.denied", outcome: "denied", details: { intent: intent.intent } });
      throw httpError(403, "That assignment is outside your scope.");
    }
    if (["update_assignment", "cancel_assignment"].includes(intent.intent) && assignment) {
      addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "assignment", resourceId: assignment.id, action: `intent.${intent.intent}`, details: { note: "Chat text is classified only; use the assignment dashboard action to apply the change." } });
      return { intent, submission: null };
    }
    let submission = null;
    let effectiveIntent = intent.intent;
    if (["student", "teacher"].includes(req.user.role) && assignment) {
      const studentId = req.user.role === "student" ? req.user.id : body.studentId;
      if (req.user.role === "teacher" && !assignment.targetStudentIds.includes(studentId)) {
        addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "assignment", resourceId: assignment.id, action: "access.denied", outcome: "denied", details: { intent: intent.intent, studentId } });
        throw httpError(403, "That student is outside this assignment.");
      }
      submission = data.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === studentId);
      if (!submission) {
        submission = { id: makeId("sub"), schoolId: req.user.schoolId, assignmentId: assignment.id, studentId, status: "not_started", history: [] };
        data.submissions.push(submission);
      }
      if (effectiveIntent === "submission" && ["revision_requested", "blocked"].includes(submission.status)) effectiveIntent = "resubmission";
      if (effectiveIntent === "blocked_help_request") submission.status = "blocked";
      if (effectiveIntent === "progress_update") submission.status = "in_progress";
      if (effectiveIntent === "submission" || effectiveIntent === "resubmission") submission.status = "submitted";
      if (effectiveIntent === "revision_request") submission.status = "revision_requested";
      if (effectiveIntent === "completion_decision") submission.status = "completed";
      submission.history.unshift({ at: new Date().toISOString(), actorId: req.user.id, intent: effectiveIntent, text, quickAction: Boolean(body.quickAction) });
    }
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "message", resourceId: submission?.id, action: `intent.${effectiveIntent}`, outcome: intent.unsafe ? "denied" : "ok", details: { confidence: intent.confidence } });
    return { intent: { ...intent, intent: effectiveIntent }, submission };
  });
  broadcast(req.user.schoolId);
  res.status(200).json(result);
}

function applyGuardianIntent(data, req, intent) {
  const guardian = data.users.find((item) => item.id === req.user.id);
  if (intent.intent === "parent_opt_in") {
    guardian.optedIn = true;
    return { optedIn: true };
  }
  if (intent.intent === "escalation_acknowledgement") {
    return { acknowledged: true };
  }
  const studentIds = guardian.studentIds || [];
  const submissions = data.submissions.filter((item) => studentIds.includes(item.studentId));
  return {
    digest: {
      blocked: submissions.filter((item) => item.status === "blocked").length,
      submitted: submissions.filter((item) => ["submitted", "completed"].includes(item.status)).length,
      inProgress: submissions.filter((item) => item.status === "in_progress").length,
      notStarted: submissions.filter((item) => item.status === "not_started").length
    }
  };
}

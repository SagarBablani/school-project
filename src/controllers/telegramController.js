import { addAudit, makeId } from "../models/store.js";
import { identifyIntent } from "../parser.js";
import { canReadAssignment } from "../auth.js";

function safeFindAssignment(data, user, preferredAssignmentId) {
  if (preferredAssignmentId) return data.assignments.find((a) => a.id === preferredAssignmentId && a.schoolId === user.schoolId);
  // prefer assignment targeting the user
  let asg = data.assignments.find((a) => a.schoolId === user.schoolId && a.targetStudentIds.includes(user.id));
  if (asg) return asg;
  // fallback: any recent assigned
  return data.assignments.find((a) => a.schoolId === user.schoolId && a.status === "assigned");
}

// Public webhook endpoint for Telegram messages
export async function handleTelegramWebhook(req, res) {
  const { store } = req.app.locals;
  const body = req.body || {};
  const message = body.message || body;
  const chatId = message?.chat?.id || message?.chatId;
  const text = String(message?.text || "").trim();
  if (!chatId) return res.status(200).json({ ok: true });

  await store.mutate((data) => {
    const binding = data.chatBindings.find((b) => b.provider === "telegram" && b.chatId === String(chatId));
    if (!binding) {
      // create a placeholder binding so operator can link it
      data.chatBindings.push({ id: makeId("cb"), provider: "telegram", chatId: String(chatId), schoolId: null, userId: null, createdAt: new Date().toISOString() });
      addAudit(data, { correlationId: req.correlationId, actorId: "system", schoolId: null, resourceType: "chatBinding", resourceId: null, action: "chat.unlinked", details: { provider: "telegram", chatId } });
      return;
    }
    const intent = identifyIntent(text || "");
    // if binding is linked to a user, try to apply the intent as an action (submission/progress/blocked/feedback)
    if (binding.userId) {
      const user = data.users.find((u) => u.id === binding.userId);
      if (user) {
        const preferredAssignmentId = body.assignmentId || binding.assignmentId;
        const assignment = safeFindAssignment(data, user, preferredAssignmentId);
        let submission = null;
        if (["student", "teacher"].includes(user.role) && assignment) {
          const studentId = user.role === "student" ? user.id : (body.studentId || user.id);
          if (user.role === "teacher" && !assignment.targetStudentIds.includes(studentId)) {
            addAudit(data, { correlationId: req.correlationId, actorId: user.id, schoolId: user.schoolId, resourceType: "assignment", resourceId: assignment.id, action: "access.denied", outcome: "denied", details: { intent: intent.intent } });
          } else {
            submission = data.submissions.find((s) => s.assignmentId === assignment.id && s.studentId === studentId);
            if (!submission) {
              submission = { id: makeId("sub"), schoolId: user.schoolId, assignmentId: assignment.id, studentId, status: "not_started", history: [] };
              data.submissions.push(submission);
            }
            if (intent.intent === "blocked_help_request") submission.status = "blocked";
            if (intent.intent === "progress_update") submission.status = "in_progress";
            if (intent.intent === "submission") submission.status = "submitted";
            if (intent.intent === "teacher_feedback") submission.status = body.complete ? "completed" : "revision_requested";
            submission.history.unshift({ at: new Date().toISOString(), actorId: user.id, intent: intent.intent, text });
          }
        }
        addAudit(data, { correlationId: req.correlationId, actorId: user.id, schoolId: user.schoolId, resourceType: "message", resourceId: submission?.id, action: `incoming.telegram.${intent.intent}`, outcome: intent.unsafe ? "denied" : "ok", details: { chatId: String(chatId), confidence: intent.confidence } });
      }
    } else {
      addAudit(data, { correlationId: req.correlationId, actorId: "system", schoolId: binding.schoolId, resourceType: "message", resourceId: null, action: `incoming.telegram.${intent.intent}`, details: { chatId: String(chatId), text, intent: intent.intent, confidence: intent.confidence } });
    }
    return;
  });

  res.status(200).json({ ok: true });
}

// Authenticated route to bind a Telegram chat id to the logged-in user
export async function bindTelegram(req, res) {
  const { store } = req.app.locals;
  const body = req.body || {};
  const chatId = String(body.chatId || "");
  if (!chatId) return res.status(400).json({ error: "chatId is required" });

  const result = await store.mutate((data) => {
    let binding = data.chatBindings.find((b) => b.provider === "telegram" && b.chatId === chatId);
    if (!binding) {
      binding = { id: makeId("cb"), provider: "telegram", chatId, schoolId: req.user.schoolId, userId: req.user.id, createdAt: new Date().toISOString() };
      data.chatBindings.push(binding);
    } else {
      binding.userId = req.user.id;
      binding.schoolId = req.user.schoolId;
    }
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "chatBinding", resourceId: binding.id, action: "chat.binding.created", details: { provider: "telegram", chatId } });
    return binding;
  });

  res.status(200).json({ binding: result });
}

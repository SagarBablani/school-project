import { addAudit, makeId } from "../models/store.js";
import { identifyIntent } from "../parser.js";
import { canReadAssignment } from "../auth.js";

const PROVIDER_CONFIG = {
  telegram: {
    getMessage: (body) => body.message || body,
    getChatId: (message) => message?.chat?.id || message?.chatId || message?.from?.id,
    getText: (message) => message?.text || message?.caption || "",
    getSenderId: (message) => message?.from?.id || message?.from?.user_id || message?.senderId,
    getAssignmentId: (body, message) => body.assignmentId || message?.assignmentId,
    getStudentId: (body, message) => body.studentId || message?.studentId
  },
  whatsapp: {
    getMessage: (body) => body.message || body,
    getChatId: (message) => message?.chatId || message?.from || message?.sender || message?.chat?.id,
    getText: (message) => message?.text || message?.body || "",
    getSenderId: (message) => message?.from || message?.sender || message?.userId,
    getAssignmentId: (body, message) => body.assignmentId || message?.assignmentId,
    getStudentId: (body, message) => body.studentId || message?.studentId
  }
};

export function normalizeChatPayload(provider, body) {
  const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.whatsapp;
  const message = config.getMessage(body);
  const chatId = String(config.getChatId(message) || body.chatId || body.chat?.id || "");
  return {
    provider,
    chatId,
    messageId: String(message?.message_id || message?.id || message?.messageId || ""),
    senderId: String(config.getSenderId(message) || ""),
    text: String(config.getText(message) || "").trim(),
    assignmentId: config.getAssignmentId(body, message) || null,
    studentId: config.getStudentId(body, message) || null,
    raw: body
  };
}

export async function processChatWebhook(req, res, provider) {
  const { store } = req.app.locals;
  const normalized = normalizeChatPayload(provider, req.body || {});
  if (!normalized.chatId) return res.status(200).json({ ok: true });

  await store.mutate((data) => {
    if (normalized.messageId) {
      const key = `${provider}:${normalized.chatId}:${normalized.messageId}`;
      if (data.idempotencyKeys.includes(key)) return;
      data.idempotencyKeys.push(key);
      if (data.idempotencyKeys.length > 1000) data.idempotencyKeys.shift();
    }

    let binding = data.chatBindings.find((b) => b.provider === provider && b.chatId === normalized.chatId);
    if (!binding) {
      binding = {
        id: makeId("cb"),
        provider,
        chatId: normalized.chatId,
        schoolId: null,
        userId: null,
        createdAt: new Date().toISOString(),
        metadata: { messageId: normalized.messageId }
      };
      data.chatBindings.push(binding);
      addAudit(data, {
        correlationId: req.correlationId,
        actorId: "system",
        schoolId: null,
        resourceType: "chatBinding",
        resourceId: binding.id,
        action: "chat.unlinked",
        details: { provider, chatId: normalized.chatId }
      });
      return;
    }

    const intent = identifyIntent(normalized.text);
    if (binding.userId) {
      const user = data.users.find((u) => u.id === binding.userId);
      if (user) {
        const assignment = safeFindAssignment(data, user, normalized.assignmentId);
        const entry = applyIntentToAssignment(data, req, user, assignment, normalized, intent);
        addAudit(data, {
          correlationId: req.correlationId,
          actorId: user.id,
          schoolId: user.schoolId,
          resourceType: "message",
          resourceId: entry?.id || null,
          action: `incoming.${provider}.${intent.intent}`,
          outcome: intent.unsafe ? "denied" : "ok",
          details: { chatId: normalized.chatId, confidence: intent.confidence }
        });
      }
    } else {
      addAudit(data, {
        correlationId: req.correlationId,
        actorId: "system",
        schoolId: binding.schoolId,
        resourceType: "message",
        resourceId: null,
        action: `incoming.${provider}.${intent.intent}`,
        details: { chatId: normalized.chatId, text: normalized.text, intent: intent.intent, confidence: intent.confidence }
      });
    }
  });

  res.status(200).json({ ok: true, message: "received" });
}

export async function bindChat(req, res, provider) {
  const { store } = req.app.locals;
  const body = req.body || {};
  const chatId = String(body.chatId || "");
  if (!chatId) return res.status(400).json({ error: "chatId is required" });

  const result = await store.mutate((data) => {
    let binding = data.chatBindings.find((b) => b.provider === provider && b.chatId === chatId);
    if (!binding) {
      binding = {
        id: makeId("cb"),
        provider,
        chatId,
        schoolId: req.user.schoolId,
        userId: req.user.id,
        createdAt: new Date().toISOString()
      };
      data.chatBindings.push(binding);
    } else {
      binding.userId = req.user.id;
      binding.schoolId = req.user.schoolId;
    }
    addAudit(data, {
      correlationId: req.correlationId,
      actorId: req.user.id,
      schoolId: req.user.schoolId,
      resourceType: "chatBinding",
      resourceId: binding.id,
      action: "chat.binding.created",
      details: { provider, chatId }
    });
    return binding;
  });

  res.status(200).json({ binding: result });
}

function safeFindAssignment(data, user, preferredAssignmentId) {
  if (preferredAssignmentId) {
    return data.assignments.find((a) => a.id === preferredAssignmentId && a.schoolId === user.schoolId);
  }
  let asg = data.assignments.find((a) => a.schoolId === user.schoolId && a.targetStudentIds.includes(user.id));
  if (asg) return asg;
  return data.assignments.find((a) => a.schoolId === user.schoolId && a.status === "assigned");
}

function applyIntentToAssignment(data, req, user, assignment, normalized, intent) {
  if (!assignment || !["student", "teacher"].includes(user.role)) return null;
  if (!canReadAssignment(user, assignment)) {
    addAudit(data, {
      correlationId: req.correlationId,
      actorId: user.id,
      schoolId: user.schoolId,
      resourceType: "assignment",
      resourceId: assignment.id,
      action: "access.denied",
      outcome: "denied",
      details: { intent: intent.intent }
    });
    return null;
  }
  const studentId = user.role === "student" ? user.id : (normalized.studentId || user.id);
  if (user.role === "teacher" && !assignment.targetStudentIds.includes(studentId)) {
    addAudit(data, {
      correlationId: req.correlationId,
      actorId: user.id,
      schoolId: user.schoolId,
      resourceType: "assignment",
      resourceId: assignment.id,
      action: "access.denied",
      outcome: "denied",
      details: { intent: intent.intent }
    });
    return null;
  }
  let submission = data.submissions.find((s) => s.assignmentId === assignment.id && s.studentId === studentId);
  if (!submission) {
    submission = { id: makeId("sub"), schoolId: user.schoolId, assignmentId: assignment.id, studentId, status: "not_started", history: [] };
    data.submissions.push(submission);
  }
  if (intent.intent === "blocked_help_request") submission.status = "blocked";
  if (intent.intent === "progress_update") submission.status = "in_progress";
  if (intent.intent === "submission") submission.status = "submitted";
  if (intent.intent === "teacher_feedback") submission.status = normalized.raw.complete ? "completed" : "revision_requested";
  submission.history.unshift({ at: new Date().toISOString(), actorId: user.id, intent: intent.intent, text: normalized.text });
  return submission;
}

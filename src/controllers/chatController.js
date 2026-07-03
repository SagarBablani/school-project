import { addAudit, makeId } from "../models/store.js";
import { identifyIntent } from "../parser.js";
import { canReadAssignment } from "../auth.js";

const GUARDIAN_INTENTS = new Set(["parent_opt_in", "escalation_acknowledgement", "parent_digest_request"]);

function applyGuardianIntent(data, guardian, intent) {
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
      submitted: submissions.filter((item) => ["submitted", "completed"].includes(item.status)).length
    }
  };
}

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

// Shared by the HTTP webhook route and the Telegram long-polling client so
// both entry points apply exactly the same idempotency, binding, and intent
// rules. Returns a hint for the caller: a `reply` string to send back to the
// chat (only the polling client actually sends it; the webhook route stays
// side-effect-free so it's safe to hit in tests).
export function applyIncomingMessage(data, normalized, correlationId) {
  const { provider } = normalized;
  if (normalized.messageId) {
    const key = `${provider}:${normalized.chatId}:${normalized.messageId}`;
    if (data.idempotencyKeys.includes(key)) return { reply: null };
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
      correlationId,
      actorId: "system",
      schoolId: null,
      resourceType: "chatBinding",
      resourceId: binding.id,
      action: "chat.unlinked",
      details: { provider, chatId: normalized.chatId }
    });
    return { reply: `This chat isn't linked to a school account yet. Open the app, go to the Chat tab, and enter this Chat ID to link it: ${normalized.chatId}` };
  }

  const intent = identifyIntent(normalized.text);
  if (binding.userId) {
    const user = data.users.find((u) => u.id === binding.userId);
    if (user) {
      if (user.role === "guardian" && GUARDIAN_INTENTS.has(intent.intent)) {
        const outcome = applyGuardianIntent(data, user, intent);
        addAudit(data, {
          correlationId,
          actorId: user.id,
          schoolId: user.schoolId,
          resourceType: "user",
          resourceId: user.id,
          action: `incoming.${provider}.${intent.intent}`,
          details: { chatId: normalized.chatId, ...outcome }
        });
        return { reply: replyFor(intent.intent, outcome) };
      }
      const assignment = safeFindAssignment(data, user, normalized.assignmentId);
      const entry = applyIntentToAssignment(data, { correlationId }, user, assignment, normalized, intent);
      addAudit(data, {
        correlationId,
        actorId: user.id,
        schoolId: user.schoolId,
        resourceType: "message",
        resourceId: entry?.id || null,
        action: `incoming.${provider}.${intent.intent}`,
        outcome: intent.unsafe ? "denied" : "ok",
        details: { chatId: normalized.chatId, confidence: intent.confidence }
      });
      return { reply: replyFor(intent.intent, entry ? { status: entry.status } : null) };
    }
  }
  addAudit(data, {
    correlationId,
    actorId: "system",
    schoolId: binding.schoolId,
    resourceType: "message",
    resourceId: null,
    action: `incoming.${provider}.${intent.intent}`,
    details: { chatId: normalized.chatId, text: normalized.text, intent: intent.intent, confidence: intent.confidence }
  });
  return { reply: null };
}

function replyFor(intent, outcome) {
  if (intent === "unsafe") return "That message couldn't be processed for safety reasons.";
  if (intent === "parent_opt_in") return "You're opted in to updates and escalation messages.";
  if (intent === "escalation_acknowledgement") return "Thanks, noted.";
  if (intent === "parent_digest_request" && outcome?.digest) {
    const { blocked, submitted } = outcome.digest;
    return `Digest: ${blocked} blocked, ${submitted} submitted.`;
  }
  if (outcome?.status) return `Got it — status updated to "${outcome.status.replace(/_/g, " ")}".`;
  return "Got it.";
}

export async function processChatWebhook(req, res, provider) {
  const { store } = req.app.locals;
  const normalized = normalizeChatPayload(provider, req.body || {});
  if (!normalized.chatId) return res.status(200).json({ ok: true });

  await store.mutate((data) => applyIncomingMessage(data, normalized, req.correlationId));

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
  if (["update_assignment", "cancel_assignment"].includes(intent.intent)) return null;
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
  let effectiveIntent = intent.intent;
  if (effectiveIntent === "submission" && ["revision_requested", "blocked"].includes(submission.status)) effectiveIntent = "resubmission";
  if (effectiveIntent === "blocked_help_request") submission.status = "blocked";
  if (effectiveIntent === "progress_update") submission.status = "in_progress";
  if (effectiveIntent === "submission" || effectiveIntent === "resubmission") submission.status = "submitted";
  if (effectiveIntent === "revision_request") submission.status = "revision_requested";
  if (effectiveIntent === "completion_decision") submission.status = "completed";
  submission.history.unshift({ at: new Date().toISOString(), actorId: user.id, intent: effectiveIntent, text: normalized.text });
  intent.intent = effectiveIntent;
  return submission;
}

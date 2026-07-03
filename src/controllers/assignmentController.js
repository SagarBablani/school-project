import { canReadAssignment } from "../auth.js";
import { addAudit } from "../models/store.js";
import { httpError, requireRole } from "./http.js";

export async function updateAssignment(req, res) {
  const { store, broadcast } = req.app.locals;
  requireRole(req.user, ["admin", "teacher"]);
  const body = req.body || {};
  const updated = await store.mutate((data) => {
    const assignment = data.assignments.find((item) => item.id === req.params.assignmentId && item.schoolId === req.user.schoolId);
    if (!assignment) throw httpError(404, "Assignment not found.");
    if (!canReadAssignment(req.user, assignment)) {
      addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "assignment", resourceId: assignment.id, action: "access.denied", outcome: "denied", details: { attempted: "assignment.update" } });
      throw httpError(403, "That assignment is outside your scope.");
    }
    if (assignment.status === "cancelled") throw httpError(400, "Cancelled assignments cannot be updated.");
    const changes = {};
    if (body.title !== undefined && String(body.title).trim()) {
      changes.title = { from: assignment.title, to: body.title };
      assignment.title = String(body.title).trim();
    }
    if (body.dueDate !== undefined) {
      changes.dueDate = { from: assignment.dueDate, to: body.dueDate };
      assignment.dueDate = body.dueDate;
    }
    if (body.instructions !== undefined) {
      changes.instructions = { from: assignment.instructions, to: body.instructions };
      assignment.instructions = body.instructions;
    }
    if (!Object.keys(changes).length) throw httpError(400, "No updatable fields were provided.");
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "assignment", resourceId: assignment.id, action: "assignment.updated", details: changes });
    return assignment;
  });
  broadcast(req.user.schoolId);
  res.status(200).json({ assignment: updated });
}

export async function cancelAssignment(req, res) {
  const { store, broadcast } = req.app.locals;
  requireRole(req.user, ["admin", "teacher"]);
  const updated = await store.mutate((data) => {
    const assignment = data.assignments.find((item) => item.id === req.params.assignmentId && item.schoolId === req.user.schoolId);
    if (!assignment) throw httpError(404, "Assignment not found.");
    if (!canReadAssignment(req.user, assignment)) {
      addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "assignment", resourceId: assignment.id, action: "access.denied", outcome: "denied", details: { attempted: "assignment.cancel" } });
      throw httpError(403, "That assignment is outside your scope.");
    }
    if (assignment.status === "cancelled") throw httpError(400, "Assignment is already cancelled.");
    assignment.status = "cancelled";
    assignment.cancelledAt = new Date().toISOString();
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "assignment", resourceId: assignment.id, action: "assignment.cancelled", details: { reason: req.body?.reason || null } });
    return assignment;
  });
  broadcast(req.user.schoolId);
  res.status(200).json({ assignment: updated });
}

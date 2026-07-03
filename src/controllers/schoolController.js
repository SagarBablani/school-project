import { addAudit, makeId, publicUser } from "../models/store.js";
import { snapshotFor } from "../models/schoolOpsModel.js";
import { httpError, requireRole } from "./http.js";

export async function currentUserSnapshot(req, res) {
  res.status(200).json(await snapshotFor(req.app.locals.store, req.user));
}

export async function createClass(req, res) {
  const { store, broadcast } = req.app.locals;
  requireRole(req.user, ["admin"]);
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const grade = String(body.grade || "").trim();
  if (!name || !grade) return res.status(400).json({ error: "Name and grade are required." });
  const klass = await store.mutate((data) => {
    const existing = data.classes.find((item) => item.schoolId === req.user.schoolId && item.name.toLowerCase() === name.toLowerCase());
    if (existing) throw httpError(409, "A class with this name already exists in this school.");
    const item = { id: makeId("cls"), schoolId: req.user.schoolId, name, grade };
    data.classes.push(item);
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "class", resourceId: item.id, action: "class.created", details: { name, grade } });
    return item;
  });
  broadcast(req.user.schoolId);
  res.status(201).json({ class: klass });
}

export async function createInvite(req, res) {
  const { store, broadcast } = req.app.locals;
  requireRole(req.user, ["admin"]);
  const body = req.body || {};
  const role = String(body.role || "");
  if (!["teacher", "student", "guardian"].includes(role)) return res.status(400).json({ error: "Invalid role." });
  const invite = await store.mutate((data) => {
    const item = {
      id: makeId("inv"),
      code: Math.random().toString(36).slice(2, 10).toUpperCase(),
      schoolId: req.user.schoolId,
      role,
      classIds: body.classIds || [],
      studentIds: body.studentIds || [],
      email: String(body.email || "").trim().toLowerCase(),
      name: String(body.name || "").trim(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      usedBy: null
    };
    data.invites.push(item);
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "invite", resourceId: item.id, action: "invite.created", details: { role, code: item.code } });
    return item;
  });
  broadcast(req.user.schoolId);
  res.status(201).json({ invite });
}

export async function acceptInvite(req, res) {
  const { store, broadcast } = req.app.locals;
  const code = String(req.body?.code || "").trim().toUpperCase();
  const updated = await store.mutate((data) => {
    const invite = data.invites.find((item) => item.code === code && item.schoolId === req.user.schoolId);
    if (!invite || invite.usedBy || new Date(invite.expiresAt) < new Date()) throw httpError(400, "Invite is invalid or expired.");
    req.user.role = invite.role;
    req.user.classIds = invite.classIds;
    req.user.studentIds = invite.studentIds;
    if (invite.name && !req.user.name) req.user.name = invite.name;
    invite.usedBy = req.user.id;
    if (invite.role === "teacher") {
      for (const classId of invite.classIds) data.teacherClasses.push({ teacherId: req.user.id, classId });
    }
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, resourceType: "invite", resourceId: invite.id, action: "invite.accepted" });
    return publicUser(req.user);
  });
  broadcast(req.user.schoolId);
  res.status(200).json({ user: updated });
}

export async function seedDemo(req, res) {
  const { store, broadcast } = req.app.locals;
  requireRole(req.user, ["admin"]);
  await store.mutate((data) => {
    const existing = data.classes.filter((item) => item.schoolId === req.user.schoolId);
    if (!existing.some((item) => item.name === "Grade 6A")) data.classes.push({ id: makeId("cls"), schoolId: req.user.schoolId, name: "Grade 6A", grade: "6" });
    if (!existing.some((item) => item.name === "Grade 6B")) data.classes.push({ id: makeId("cls"), schoolId: req.user.schoolId, name: "Grade 6B", grade: "6" });
    addAudit(data, { correlationId: req.correlationId, actorId: req.user.id, schoolId: req.user.schoolId, action: "demo.seeded", details: { classes: 2 } });
  });
  broadcast(req.user.schoolId);
  res.status(200).json(await snapshotFor(store, req.user));
}

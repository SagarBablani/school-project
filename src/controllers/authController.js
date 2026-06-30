import { clearSessionCookie, createSession, hashPassword, sessionCookie, verifyPassword } from "../auth.js";
import { addAudit, makeId } from "../models/store.js";
import { snapshotFor } from "../models/schoolOpsModel.js";
import { httpError } from "./http.js";

export async function register(req, res) {
  const { store, secret, broadcast } = req.app.locals;
  const body = req.body || {};
  const schoolName = String(body.schoolName || "").trim();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!schoolName || !name || !email || !body.password) return res.status(400).json({ error: "School, name, email, and password are required." });
  const result = await store.mutate((data) => {
    if (data.users.some((item) => item.email === email)) throw httpError(409, "Email already exists.");
    const school = { id: makeId("sch"), name: schoolName, policy: { start: "21:00", end: "07:00" }, createdAt: new Date().toISOString() };
    const admin = { id: makeId("usr"), schoolId: school.id, role: "admin", name, email, passwordHash: hashPassword(body.password), classIds: [], studentIds: [] };
    data.schools.push(school);
    data.users.push(admin);
    addAudit(data, { correlationId: req.correlationId, actorId: admin.id, schoolId: school.id, resourceType: "school", resourceId: school.id, action: "school.registered" });
    return { school, admin };
  });
  res.setHeader("Set-Cookie", sessionCookie(createSession(result.admin.id, secret)));
  broadcast(result.school.id);
  res.status(201).json(await snapshotFor(store, result.admin));
}

export async function login(req, res) {
  const { store, secret } = req.app.locals;
  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const user = await store.read((data) => data.users.find((item) => item.email === email));
  if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) return res.status(401).json({ error: "Invalid email or password." });
  await store.mutate((data) => addAudit(data, { correlationId: req.correlationId, actorId: user.id, schoolId: user.schoolId, action: "auth.login", resourceType: "user", resourceId: user.id }));
  res.setHeader("Set-Cookie", sessionCookie(createSession(user.id, secret)));
  res.status(200).json(await snapshotFor(store, user));
}

export async function joinWithInvite(req, res) {
  const { store, secret, broadcast } = req.app.locals;
  const body = req.body || {};
  const code = String(body.code || "").trim().toUpperCase();
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  if (!code || !email || !name || !body.password) return res.status(400).json({ error: "Code, name, email, and password are required." });
  const user = await store.mutate((data) => {
    const invite = data.invites.find((item) => item.code === code);
    if (!invite || invite.usedBy || new Date(invite.expiresAt) < new Date()) throw httpError(400, "Invite is invalid or expired.");
    if (data.users.some((item) => item.email === email)) throw httpError(409, "Email already exists.");
    const created = {
      id: makeId("usr"),
      schoolId: invite.schoolId,
      role: invite.role,
      name,
      email,
      passwordHash: hashPassword(body.password),
      classIds: invite.classIds,
      studentIds: invite.studentIds
    };
    data.users.push(created);
    invite.usedBy = created.id;
    if (invite.role === "teacher") {
      for (const classId of invite.classIds) data.teacherClasses.push({ teacherId: created.id, classId });
    }
    addAudit(data, { correlationId: req.correlationId, actorId: created.id, schoolId: invite.schoolId, resourceType: "invite", resourceId: invite.id, action: "invite.joined", details: { role: invite.role } });
    return created;
  });
  res.setHeader("Set-Cookie", sessionCookie(createSession(user.id, secret)));
  broadcast(user.schoolId);
  res.status(201).json(await snapshotFor(store, user));
}

export function logout(req, res) {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.status(200).json({ ok: true });
}

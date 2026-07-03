import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password, encoded) {
  const [salt, key] = encoded.split(":");
  const candidate = Buffer.from(hashPassword(password, salt).split(":")[1], "hex");
  const expected = Buffer.from(key, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createSession(userId, secret) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readSession(cookieHeader, secret) {
  const cookies = Object.fromEntries(
    String(cookieHeader || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2)
  );
  if (!cookies.session) return null;
  const [payload, signature] = cookies.session.split(".");
  if (!payload || !signature || sign(payload, secret) !== signature) return null;
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return parsed.exp > Date.now() ? parsed : null;
}

export function sessionCookie(token) {
  return `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearSessionCookie() {
  return "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

export function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function correlationId() {
  return `corr_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

export function canReadAssignment(user, assignment) {
  if (!user || !assignment || user.schoolId !== assignment.schoolId) return false;
  if (user.role === "admin") return true;
  if (user.role === "teacher") return assignment.classIds.some((id) => user.classIds.includes(id));
  if (user.role === "student") return assignment.targetStudentIds.includes(user.id);
  if (user.role === "guardian") return assignment.targetStudentIds.some((id) => user.studentIds.includes(id));
  return false;
}

export function canReadStudent(user, student) {
  if (!user || !student || user.schoolId !== student.schoolId) return false;
  if (user.role === "admin") return true;
  if (user.role === "teacher") return (student.classIds || []).some((id) => user.classIds.includes(id));
  if (user.role === "student") return user.id === student.id;
  if (user.role === "guardian") return user.studentIds.includes(student.id);
  return false;
}

export function canAccessDocument(user, document) {
  if (!user || !document || user.schoolId !== document.schoolId) return false;
  if (user.role === "admin") return true;
  if (user.role === "teacher") {
    if (document.actorId === user.id) return true;
    const classIds = document.parsed?.fields?.classIds || [];
    if (classIds.length > 0 && classIds.some((id) => user.classIds.includes(id))) return true;
    if (document.type === "roster" && document.parsed?.fields?.rows) {
      return document.parsed.fields.rows.some((row) => row.classId && user.classIds.includes(row.classId));
    }
    if (!classIds.length && (!document.parsed?.fields?.rows || !document.parsed.fields.rows.length)) return true;
  }
  return false;
}


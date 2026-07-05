import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { stopScheduler } from "../src/scheduler.js";

async function withServer(fn) {
  const dir = await mkdtemp(join(tmpdir(), "sop-test-"));
  const app = createApp({ dataFile: join(dir, "data.json"), uploadDir: join(dir, "uploads"), secret: "test-secret" });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    stopScheduler();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await rm(dir, { recursive: true, force: true });
  }
}

function client(base) {
  let cookie = "";
  return async function call(path, { method = "GET", body } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(`${base}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
}

test("assignment lifecycle: create, update, cancel, wrong-context denial, and reminder exclusion", async () => {
  await withServer(async (base) => {
    const admin = client(base);
    const reg = await admin("/api/register", { method: "POST", body: { schoolName: "Test School", name: "Admin", email: "admin@test.local", password: "demo1234" } });
    assert.equal(reg.status, 201);

    const klass = await admin("/api/classes", { method: "POST", body: { name: "Grade 1A", grade: "1" } });
    const classId = klass.json.class.id;

    const inviteTeacher = await admin("/api/invites", { method: "POST", body: { role: "teacher", classIds: [classId] } });
    const teacher = client(base);
    const joinTeacher = await teacher("/api/join", { method: "POST", body: { code: inviteTeacher.json.invite.code, name: "Teacher A", email: "teacher@test.local", password: "demo1234" } });
    assert.equal(joinTeacher.status, 201);

    const inviteTeacher2 = await admin("/api/invites", { method: "POST", body: { role: "teacher", classIds: [] } });
    const teacher2 = client(base);
    await teacher2("/api/join", { method: "POST", body: { code: inviteTeacher2.json.invite.code, name: "Teacher B", email: "teacher2@test.local", password: "demo1234" } });

    const inviteStudent = await admin("/api/invites", { method: "POST", body: { role: "student", classIds: [classId] } });
    const student = client(base);
    await student("/api/join", { method: "POST", body: { code: inviteStudent.json.invite.code, name: "Student A", email: "student@test.local", password: "demo1234" } });

    const doc = await admin("/api/documents", {
      method: "POST",
      body: { type: "assignment", text: "Title: Cell Lab\nSubject: Science\nClass: Grade 1A\nDue: 2026-08-01\nDo the reflection." }
    });
    assert.equal(doc.status, 201);
    const approve = await admin(`/api/documents/${doc.json.document.id}/approve`, { method: "POST", body: {} });
    assert.equal(approve.status, 200);
    const assignmentId = approve.json.assignment.id;

    const wrongContext = await teacher2(`/api/assignments/${assignmentId}/cancel`, { method: "POST", body: {} });
    assert.equal(wrongContext.status, 403);

    const update = await teacher(`/api/assignments/${assignmentId}`, { method: "PATCH", body: { dueDate: new Date("2026-09-01").toISOString() } });
    assert.equal(update.status, 200);
    assert.equal(update.json.assignment.dueDate, new Date("2026-09-01").toISOString());

    const cancel = await teacher(`/api/assignments/${assignmentId}/cancel`, { method: "POST", body: {} });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.json.assignment.status, "cancelled");

    const cancelAgain = await teacher(`/api/assignments/${assignmentId}/cancel`, { method: "POST", body: {} });
    assert.equal(cancelAgain.status, 400);

    const reminders = await admin("/api/reminders/run", { method: "POST", body: { force: true } });
    assert.equal(reminders.json.reminders.length, 0);

    const snapshot = await admin("/api/me");
    assert.ok(snapshot.json.auditEvents.some((event) => event.action === "access.denied"));
    assert.ok(snapshot.json.auditEvents.some((event) => event.action === "assignment.cancelled"));
    assert.ok(snapshot.json.auditEvents.some((event) => event.action === "assignment.updated"));
  });
});

test("a teacher referencing a student outside the assignment is denied and audited", async () => {
  await withServer(async (base) => {
    const admin = client(base);
    await admin("/api/register", { method: "POST", body: { schoolName: "Test School", name: "Admin", email: "admin@test.local", password: "demo1234" } });

    const klassA = await admin("/api/classes", { method: "POST", body: { name: "Grade 1A", grade: "1" } });
    const klassB = await admin("/api/classes", { method: "POST", body: { name: "Grade 2B", grade: "2" } });

    const inviteTeacher = await admin("/api/invites", { method: "POST", body: { role: "teacher", classIds: [klassA.json.class.id] } });
    const teacher = client(base);
    await teacher("/api/join", { method: "POST", body: { code: inviteTeacher.json.invite.code, name: "Teacher A", email: "teacher@test.local", password: "demo1234" } });

    const inviteStudentA = await admin("/api/invites", { method: "POST", body: { role: "student", classIds: [klassA.json.class.id] } });
    const studentA = client(base);
    await studentA("/api/join", { method: "POST", body: { code: inviteStudentA.json.invite.code, name: "Student A", email: "studentA@test.local", password: "demo1234" } });

    const inviteStudentB = await admin("/api/invites", { method: "POST", body: { role: "student", classIds: [klassB.json.class.id] } });
    const studentB = client(base);
    const joinB = await studentB("/api/join", { method: "POST", body: { code: inviteStudentB.json.invite.code, name: "Student B", email: "studentB@test.local", password: "demo1234" } });
    const studentBId = joinB.json.user.id;

    const doc = await admin("/api/documents", { method: "POST", body: { type: "assignment", text: "Title: Lab\nSubject: Science\nClass: Grade 1A\nDue: 2026-08-01\nDo it." } });
    const approve = await admin(`/api/documents/${doc.json.document.id}/approve`, { method: "POST", body: {} });
    assert.ok(!approve.json.assignment.targetStudentIds.includes(studentBId));

    const denied = await teacher("/api/messages", { method: "POST", body: { assignmentId: approve.json.assignment.id, studentId: studentBId, text: "please revise the diagram" } });
    assert.equal(denied.status, 403);

    const snapshot = await admin("/api/me");
    const deniedEvent = snapshot.json.auditEvents.find((event) => event.action === "access.denied" && event.details?.studentId === studentBId);
    assert.ok(deniedEvent, "expected an access.denied audit event referencing the out-of-scope student");
  });
});

test("guardian opt-in and digest request are scoped to linked students", async () => {
  await withServer(async (base) => {
    const admin = client(base);
    await admin("/api/register", { method: "POST", body: { schoolName: "Test School", name: "Admin", email: "admin@test.local", password: "demo1234" } });
    const inviteGuardian = await admin("/api/invites", { method: "POST", body: { role: "guardian", studentIds: [] } });

    const guardian = client(base);
    const join = await guardian("/api/join", { method: "POST", body: { code: inviteGuardian.json.invite.code, name: "Guardian A", email: "guardian@test.local", password: "demo1234" } });
    assert.equal(join.json.user.optedIn, false);

    const optIn = await guardian("/api/guardian/opt-in", { method: "POST", body: { optedIn: true } });
    assert.equal(optIn.json.optedIn, true);

    const digest = await guardian("/api/guardian/digest", { method: "POST", body: {} });
    assert.deepEqual(digest.json.digest, { blocked: 0, submitted: 0, inProgress: 0, notStarted: 0 });
  });
});

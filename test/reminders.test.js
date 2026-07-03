import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyData } from "../src/store.js";
import { isQuietTime, runReminderEngine } from "../src/reminders.js";

test("quiet hours can cross midnight", () => {
  assert.equal(isQuietTime(new Date("2026-07-01T22:00:00"), { start: "21:00", end: "07:00" }), true);
  assert.equal(isQuietTime(new Date("2026-07-01T12:00:00"), { start: "21:00", end: "07:00" }), false);
});

test("reminder engine is idempotent per assignment student day", () => {
  const data = createEmptyData();
  data.schools.push({ id: "sch_1", policy: { start: "21:00", end: "07:00" } });
  data.assignments.push({ id: "asg_1", schoolId: "sch_1", status: "assigned", targetStudentIds: ["stu_1"] });
  const at = new Date("2026-07-01T12:00:00Z");
  assert.equal(runReminderEngine(data, { at }).length, 1);
  assert.equal(runReminderEngine(data, { at }).length, 0);
});

test("blocked students are escalated while submitted students are skipped", () => {
  const data = createEmptyData();
  data.schools.push({ id: "sch_1", policy: { start: "21:00", end: "07:00" } });
  data.assignments.push({ id: "asg_1", schoolId: "sch_1", status: "assigned", targetStudentIds: ["stu_1", "stu_2"] });
  data.submissions.push({ assignmentId: "asg_1", studentId: "stu_1", status: "blocked" });
  data.submissions.push({ assignmentId: "asg_1", studentId: "stu_2", status: "submitted" });
  const actions = runReminderEngine(data, { at: new Date("2026-07-01T12:00:00Z") }).map((item) => item.action).sort();
  assert.deepEqual(actions, ["escalate_blocked", "skip_submitted"]);
});

test("cancelled assignments are excluded from reminders", () => {
  const data = createEmptyData();
  data.schools.push({ id: "sch_1", policy: { start: "21:00", end: "07:00" } });
  data.assignments.push({ id: "asg_1", schoolId: "sch_1", status: "cancelled", targetStudentIds: ["stu_1"] });
  const emitted = runReminderEngine(data, { at: new Date("2026-07-01T12:00:00Z") });
  assert.deepEqual(emitted, []);
});

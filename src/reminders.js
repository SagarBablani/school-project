import { addAudit, makeId, now } from "./store.js";

export function isQuietTime(date, policy) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = toMinutes(policy.start);
  const end = toMinutes(policy.end);
  if (start > end) return minutes >= start || minutes < end;
  return minutes >= start && minutes < end;
}

export function runReminderEngine(data, { actorId = "system", correlationId, force = false, at = new Date() } = {}) {
  const emitted = [];
  for (const assignment of data.assignments.filter((item) => item.status === "assigned")) {
    const school = data.schools.find((item) => item.id === assignment.schoolId);
    const policy = school?.policy || { start: "21:00", end: "07:00" };
    const quiet = isQuietTime(at, policy);
    for (const studentId of assignment.targetStudentIds) {
      const key = `${assignment.id}:${studentId}:${at.toISOString().slice(0, 10)}`;
      if (data.reminders.some((item) => item.key === key)) continue;
      const submission = data.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === studentId);
      let action = "nudge";
      if (submission?.status === "submitted" || submission?.status === "completed") action = "skip_submitted";
      if (submission?.status === "blocked") action = "escalate_blocked";
      if (quiet && !force) action = "defer_quiet_hours";
      const reminder = { id: makeId("rem"), key, schoolId: assignment.schoolId, assignmentId: assignment.id, studentId, action, createdAt: now() };
      data.reminders.unshift(reminder);
      addAudit(data, {
        correlationId,
        actorId,
        schoolId: assignment.schoolId,
        resourceType: "assignment",
        resourceId: assignment.id,
        action: `reminder.${action}`,
        details: { studentId, quiet, force }
      });
      emitted.push(reminder);
    }
  }
  return emitted;
}

function toMinutes(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

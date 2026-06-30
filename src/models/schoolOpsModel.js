import { canReadAssignment } from "../auth.js";
import { hashPassword } from "../auth.js";
import { addAudit, makeId, publicUser } from "./store.js";

export async function snapshotFor(store, user) {
  return store.read((data) => {
    const school = data.schools.find((item) => item.id === user.schoolId);
    const classes = data.classes.filter((item) => item.schoolId === user.schoolId);
    const assignments = data.assignments.filter((item) => canReadAssignment(user, item));
    const visibleAssignmentIds = new Set(assignments.map((item) => item.id));
    const visibleStudentIds = new Set(assignments.flatMap((item) => item.targetStudentIds));
    const users = visibleUsers(data, user, visibleStudentIds).map(publicUser);
    const canOperate = ["admin", "teacher"].includes(user.role);
    return {
      user: publicUser(user),
      school,
      classes,
      users,
      invites: user.role === "admin" ? data.invites.filter((item) => item.schoolId === user.schoolId) : [],
      documents: canOperate ? data.documents.filter((item) => item.schoolId === user.schoolId) : [],
      assignments,
      submissions: data.submissions.filter((item) => item.schoolId === user.schoolId && visibleAssignmentIds.has(item.assignmentId)),
      reminders: data.reminders.filter((item) => item.schoolId === user.schoolId && visibleAssignmentIds.has(item.assignmentId)),
      auditEvents: visibleAuditEvents(data, user, visibleAssignmentIds).slice(0, 80)
    };
  });
}

export function schoolContext(data, schoolId) {
  return {
    classes: data.classes.filter((item) => item.schoolId === schoolId),
    students: data.users.filter((item) => item.schoolId === schoolId && item.role === "student")
  };
}

export function createAssignmentFromDocument(data, doc, user, correlation) {
  const fields = doc.parsed.fields;
  const classStudentIds = data.users
    .filter((item) => item.schoolId === user.schoolId && item.role === "student" && item.classIds.some((id) => fields.classIds?.includes(id)))
    .map((item) => item.id);
  const targetStudentIds = Array.from(new Set([...(fields.targetStudentIds || []), ...classStudentIds]));
  if (!targetStudentIds.length) throw httpError(400, "No target students were resolved.");
  const assignment = {
    id: makeId("asg"),
    schoolId: user.schoolId,
    documentId: doc.id,
    createdBy: user.id,
    title: fields.title,
    subject: fields.subject,
    instructions: fields.instructions,
    dueDate: fields.dueDate,
    classIds: fields.classIds || [],
    targetStudentIds,
    status: "assigned",
    createdAt: new Date().toISOString()
  };
  data.assignments.unshift(assignment);
  for (const studentId of targetStudentIds) {
    data.submissions.push({ id: makeId("sub"), schoolId: user.schoolId, assignmentId: assignment.id, studentId, status: "not_started", history: [] });
  }
  addAudit(data, { correlationId: correlation, actorId: user.id, schoolId: user.schoolId, resourceType: "assignment", resourceId: assignment.id, action: "assignment.created", details: { title: assignment.title, targets: targetStudentIds.length } });
  return { document: doc, assignment };
}

export function applyRoster(data, doc, user, correlation) {
  const created = [];
  for (const row of doc.parsed.fields.rows || []) {
    if (!row.classId) continue;
    let student = data.users.find((item) => item.schoolId === user.schoolId && item.role === "student" && item.name.toLowerCase() === row.studentName.toLowerCase());
    if (!student) {
      student = { id: makeId("usr"), schoolId: user.schoolId, role: "student", name: row.studentName, email: `${row.studentName.toLowerCase().replace(/\s+/g, ".")}@demo.local`, passwordHash: hashPassword("demo1234"), classIds: [row.classId], studentIds: [] };
      data.users.push(student);
      created.push(student.id);
    }
    let guardian = data.users.find((item) => item.schoolId === user.schoolId && item.role === "guardian" && item.email === row.guardianContact.toLowerCase());
    if (!guardian && row.guardianContact.includes("@")) {
      guardian = { id: makeId("usr"), schoolId: user.schoolId, role: "guardian", name: `${row.studentName} Guardian`, email: row.guardianContact.toLowerCase(), passwordHash: hashPassword("demo1234"), classIds: [], studentIds: [student.id] };
      data.users.push(guardian);
      created.push(guardian.id);
    } else if (guardian && !guardian.studentIds.includes(student.id)) guardian.studentIds.push(student.id);
  }
  addAudit(data, { correlationId: correlation, actorId: user.id, schoolId: user.schoolId, resourceType: "document", resourceId: doc.id, action: "roster.imported", details: { created: created.length } });
  return { document: doc, created };
}

function visibleUsers(data, user, visibleStudentIds) {
  const schoolUsers = data.users.filter((item) => item.schoolId === user.schoolId);
  if (user.role === "admin") return schoolUsers;
  if (user.role === "teacher") {
    return schoolUsers.filter((item) => item.id === user.id || item.role === "admin" || item.classIds?.some((id) => user.classIds.includes(id)) || visibleStudentIds.has(item.id));
  }
  if (user.role === "student") {
    return schoolUsers.filter((item) => item.id === user.id || item.role === "teacher" && item.classIds?.some((id) => user.classIds.includes(id)));
  }
  if (user.role === "guardian") {
    return schoolUsers.filter((item) => item.id === user.id || user.studentIds.includes(item.id));
  }
  return [user];
}

function visibleAuditEvents(data, user, visibleAssignmentIds) {
  const schoolEvents = data.auditEvents.filter((item) => item.schoolId === user.schoolId);
  if (["admin", "teacher"].includes(user.role)) return schoolEvents;
  return schoolEvents.filter((item) => item.actorId === user.id || visibleAssignmentIds.has(item.resourceId) || user.studentIds?.includes(item.details?.studentId));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

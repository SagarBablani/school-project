import test from "node:test";
import assert from "node:assert/strict";
import { canReadAssignment, hashPassword, verifyPassword, canAccessDocument, canReadStudent } from "../src/auth.js";

test("password hashing verifies correct secret only", () => {
  const hash = hashPassword("demo1234");
  assert.equal(verifyPassword("demo1234", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
});

test("assignment authorization respects school and role scope", () => {
  const assignment = { schoolId: "sch_1", classIds: ["cls_1"], targetStudentIds: ["stu_1"] };
  assert.equal(canReadAssignment({ role: "admin", schoolId: "sch_1" }, assignment), true);
  assert.equal(canReadAssignment({ role: "teacher", schoolId: "sch_1", classIds: ["cls_1"] }, assignment), true);
  assert.equal(canReadAssignment({ role: "teacher", schoolId: "sch_1", classIds: ["cls_2"] }, assignment), false);
  assert.equal(canReadAssignment({ role: "student", schoolId: "sch_1", id: "stu_1" }, assignment), true);
  assert.equal(canReadAssignment({ role: "guardian", schoolId: "sch_1", studentIds: ["stu_2"] }, assignment), false);
  assert.equal(canReadAssignment({ role: "admin", schoolId: "other" }, assignment), false);
});

test("document authorization respects uploader and class scope", () => {
  const document = {
    schoolId: "sch_1",
    actorId: "teach_1",
    type: "assignment",
    parsed: { fields: { classIds: ["cls_1"] } }
  };
  assert.equal(canAccessDocument({ role: "admin", schoolId: "sch_1" }, document), true);
  assert.equal(canAccessDocument({ role: "teacher", id: "teach_1", schoolId: "sch_1", classIds: [] }, document), true); // uploader
  assert.equal(canAccessDocument({ role: "teacher", id: "teach_2", schoolId: "sch_1", classIds: ["cls_1"] }, document), true); // matches class
  assert.equal(canAccessDocument({ role: "teacher", id: "teach_2", schoolId: "sch_1", classIds: ["cls_2"] }, document), false); // different class
  assert.equal(canAccessDocument({ role: "student", schoolId: "sch_1" }, document), false); // student blocked
});

test("student authorization respects school, class, and identity scope", () => {
  const student = { id: "stu_1", schoolId: "sch_1", classIds: ["cls_1"] };
  assert.equal(canReadStudent({ role: "admin", schoolId: "sch_1" }, student), true);
  assert.equal(canReadStudent({ role: "teacher", schoolId: "sch_1", classIds: ["cls_1"] }, student), true);
  assert.equal(canReadStudent({ role: "teacher", schoolId: "sch_1", classIds: ["cls_2"] }, student), false);
  assert.equal(canReadStudent({ role: "student", schoolId: "sch_1", id: "stu_1" }, student), true);
  assert.equal(canReadStudent({ role: "student", schoolId: "sch_1", id: "stu_2" }, student), false);
  assert.equal(canReadStudent({ role: "guardian", schoolId: "sch_1", studentIds: ["stu_1"] }, student), true);
  assert.equal(canReadStudent({ role: "guardian", schoolId: "sch_1", studentIds: ["stu_9"] }, student), false);
  assert.equal(canReadStudent({ role: "admin", schoolId: "other" }, student), false);
});


import test from "node:test";
import assert from "node:assert/strict";
import { canReadAssignment, hashPassword, verifyPassword } from "../src/auth.js";

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

import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyData } from "../src/store.js";
import { resolveReminderNotifications, sendNotifications } from "../src/notify.js";

function baseData() {
  const data = createEmptyData();
  data.schools.push({ id: "sch_1", policy: { start: "21:00", end: "07:00" } });
  data.assignments.push({ id: "asg_1", schoolId: "sch_1", title: "Cell Lab", dueDate: "2026-08-01T00:00:00.000Z", targetStudentIds: ["stu_1"], status: "assigned" });
  data.users.push({ id: "stu_1", schoolId: "sch_1", role: "student", classIds: [] });
  return data;
}

test("resolveReminderNotifications notifies a linked student on nudge/escalation but not on skip/defer", () => {
  const data = baseData();
  data.chatBindings.push({ id: "cb_1", provider: "telegram", chatId: "111", schoolId: "sch_1", userId: "stu_1" });

  const nudged = resolveReminderNotifications(data, [{ action: "nudge", assignmentId: "asg_1", studentId: "stu_1" }]);
  assert.equal(nudged.length, 1);
  assert.equal(nudged[0].chatId, "111");
  assert.match(nudged[0].text, /Cell Lab/);

  const skipped = resolveReminderNotifications(data, [{ action: "skip_submitted", assignmentId: "asg_1", studentId: "stu_1" }]);
  assert.equal(skipped.length, 0);

  const deferred = resolveReminderNotifications(data, [{ action: "defer_quiet_hours", assignmentId: "asg_1", studentId: "stu_1" }]);
  assert.equal(deferred.length, 0);
});

test("resolveReminderNotifications includes an opted-in linked guardian but not an opted-out one", () => {
  const data = baseData();
  data.users.push({ id: "grd_1", schoolId: "sch_1", role: "guardian", studentIds: ["stu_1"], optedIn: true });
  data.users.push({ id: "grd_2", schoolId: "sch_1", role: "guardian", studentIds: ["stu_1"], optedIn: false });
  data.chatBindings.push({ id: "cb_2", provider: "telegram", chatId: "222", schoolId: "sch_1", userId: "grd_1" });
  data.chatBindings.push({ id: "cb_3", provider: "telegram", chatId: "333", schoolId: "sch_1", userId: "grd_2" });

  const notifications = resolveReminderNotifications(data, [{ action: "escalate_blocked", assignmentId: "asg_1", studentId: "stu_1" }]);
  const chatIds = notifications.map((item) => item.chatId).sort();
  assert.deepEqual(chatIds, ["222"]);
  assert.match(notifications.find((n) => n.chatId === "222").text, /block/i);
});

test("sendNotifications is a no-op without a client and tolerates individual send failures", async () => {
  await sendNotifications(null, [{ chatId: "1", text: "hi" }]); // should not throw

  const sent = [];
  const flaky = {
    async sendMessage(chatId, text) {
      if (chatId === "bad") throw new Error("boom");
      sent.push({ chatId, text });
    }
  };
  await sendNotifications(flaky, [{ chatId: "bad", text: "x" }, { chatId: "good", text: "y" }]);
  assert.deepEqual(sent, [{ chatId: "good", text: "y" }]);
});

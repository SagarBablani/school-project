// Turns emitted reminders into outbound Telegram notifications when a
// student or an opted-in guardian has linked their chat. Resolution (who
// gets notified, with what text) is pure data lookup and stays inside the
// same store.mutate() transaction as the reminder engine; the actual network
// send happens afterward so a Telegram API failure can never abort a save.
export function resolveReminderNotifications(data, emitted) {
  const notifications = [];
  for (const reminder of emitted) {
    if (!["nudge", "escalate_blocked"].includes(reminder.action)) continue;
    const assignment = data.assignments.find((item) => item.id === reminder.assignmentId);
    if (!assignment) continue;

    const recipientIds = new Set([reminder.studentId]);
    for (const guardian of data.users) {
      if (guardian.role === "guardian" && guardian.optedIn && guardian.studentIds?.includes(reminder.studentId)) {
        recipientIds.add(guardian.id);
      }
    }

    const text = messageFor(reminder, assignment);
    for (const binding of data.chatBindings) {
      if (binding.provider === "telegram" && recipientIds.has(binding.userId)) {
        notifications.push({ chatId: binding.chatId, text });
      }
    }
  }
  return notifications;
}

export async function sendNotifications(telegramClient, notifications) {
  if (!telegramClient) return;
  for (const note of notifications) {
    try {
      await telegramClient.sendMessage(note.chatId, note.text);
    } catch (error) {
      console.error("Telegram reminder send failed", error.message);
    }
  }
}

function messageFor(reminder, assignment) {
  const due = assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : "no date set";
  if (reminder.action === "escalate_blocked") {
    return `Heads up: there's a reported block on "${assignment.title}" (due ${due}). Please check in.`;
  }
  return `Reminder: "${assignment.title}" is due ${due}.`;
}

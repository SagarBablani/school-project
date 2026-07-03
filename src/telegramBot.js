import { applyIncomingMessage, normalizeChatPayload } from "./controllers/chatController.js";

const API_BASE = "https://api.telegram.org";

export function createTelegramClient(token) {
  return {
    async getUpdates(offset) {
      const url = `${API_BASE}/bot${token}/getUpdates?timeout=25&offset=${offset}`;
      const response = await fetch(url);
      const body = await response.json();
      if (!body.ok) throw new Error(body.description || "Telegram getUpdates failed");
      return body.result;
    },
    async sendMessage(chatId, text) {
      const response = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text })
      });
      const body = await response.json();
      if (!body.ok) console.error("Telegram sendMessage failed", body.description);
      return body;
    }
  };
}

let polling = false;

// Telegram's long-polling `getUpdates` needs no public URL (unlike a real
// webhook), which is what makes this practical to demo without deploying
// anywhere. Duplicate updates after a restart are safe: `applyIncomingMessage`
// dedupes by the same idempotency key used by the HTTP webhook route, so the
// offset itself doesn't need to survive a restart.
export function startTelegramPolling(app, token) {
  if (polling) return;
  polling = true;
  const client = createTelegramClient(token);
  app.locals.telegram = client;
  let offset = 0;

  (async function loop() {
    while (polling) {
      try {
        const updates = await client.getUpdates(offset);
        for (const update of updates) {
          offset = update.update_id + 1;
          await handleUpdate(app, client, update);
        }
      } catch (error) {
        console.error("Telegram polling error", error.message);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  })();
}

export function stopTelegramPolling() {
  polling = false;
}

async function handleUpdate(app, client, update) {
  const normalized = normalizeChatPayload("telegram", { message: update.message });
  if (!normalized.chatId) return;
  const { store } = app.locals;
  const outcome = await store.mutate((data) => applyIncomingMessage(data, normalized, `tg_${update.update_id}`));
  if (outcome?.reply) await client.sendMessage(normalized.chatId, outcome.reply);
}

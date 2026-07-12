// Telegram bot integration.
//
// Uses the Bot API over long-polling (getUpdates), so it needs no public URL
// and runs fine locally. The whole integration is disabled cleanly when
// TELEGRAM_BOT_TOKEN is unset. Account linking works by having the user press
// "Start" on a t.me/<bot>?start=<code> deep link; the bot ties their Telegram
// id to the Journey account that generated the code.

const API_BASE = "https://api.telegram.org";
const LINK_CODE_TTL_MS = 1000 * 60 * 15; // 15 minutes

export function createTelegram({ db }) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  let botUsername = null;
  let polling = false;

  async function callApi(method, params) {
    if (!token) throw new Error("Telegram is not configured.");
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params ?? {}),
    });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(`Telegram ${method} failed: ${data.description}`);
    }
    return data.result;
  }

  async function sendMessage(chatId, text) {
    if (!token) return;
    try {
      await callApi("sendMessage", { chat_id: chatId, text });
    } catch (err) {
      console.warn("[telegram] sendMessage failed:", err.message);
    }
  }

  // Link a Telegram user to a Journey account using a one-time code.
  // Pure DB logic (no network) so it is unit-testable offline.
  function linkWithCode(code, tgUser) {
    const row = db
      .prepare("SELECT user_id, created_at FROM telegram_link_codes WHERE code = ?")
      .get(code);
    if (!row) {
      return {
        ok: false,
        reply: "That link code is invalid. Generate a new one in Journey.",
      };
    }
    if (Date.now() - row.created_at > LINK_CODE_TTL_MS) {
      db.prepare("DELETE FROM telegram_link_codes WHERE code = ?").run(code);
      return {
        ok: false,
        reply: "That link code has expired. Generate a new one in Journey.",
      };
    }
    const name =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null;
    db.prepare(
      `INSERT INTO telegram_links (user_id, telegram_user_id, telegram_username, telegram_name, linked_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         telegram_user_id = excluded.telegram_user_id,
         telegram_username = excluded.telegram_username,
         telegram_name = excluded.telegram_name,
         linked_at = excluded.linked_at`,
    ).run(
      row.user_id,
      String(tgUser.id),
      tgUser.username ?? null,
      name,
      Date.now(),
    );
    // Consume the code and any other pending codes for this user.
    db.prepare("DELETE FROM telegram_link_codes WHERE user_id = ?").run(
      row.user_id,
    );
    return {
      ok: true,
      reply:
        "✅ Your Telegram is now connected to Journey. Forward messages here to import them.",
    };
  }

  // Process a single Telegram update. Exposed for tests.
  async function handleUpdate(update) {
    const msg = update.message;
    if (!msg || !msg.from) return;
    const text = typeof msg.text === "string" ? msg.text.trim() : "";
    if (text.startsWith("/start")) {
      const code = text.slice("/start".length).trim();
      if (!code) {
        await sendMessage(
          msg.chat.id,
          "Open Journey → Connect Telegram, and use the button there to link your account.",
        );
        return;
      }
      const { reply } = linkWithCode(code, msg.from);
      await sendMessage(msg.chat.id, reply);
      return;
    }
    // Forwarded-media import is handled in a later step.
  }

  function getOffset() {
    const row = db
      .prepare("SELECT value FROM telegram_state WHERE key = 'updates_offset'")
      .get();
    return row ? Number(row.value) : 0;
  }
  function setOffset(offset) {
    db.prepare(
      `INSERT INTO telegram_state (key, value) VALUES ('updates_offset', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(offset));
  }

  async function pollLoop() {
    while (polling) {
      try {
        const updates = await callApi("getUpdates", {
          offset: getOffset(),
          timeout: 30,
        });
        for (const u of updates) {
          try {
            await handleUpdate(u);
          } catch (err) {
            console.warn("[telegram] update error:", err.message);
          }
          setOffset(u.update_id + 1);
        }
      } catch (err) {
        if (polling) {
          console.warn("[telegram] poll error:", err.message);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }
  }

  async function start() {
    if (!token) {
      console.log("[telegram] disabled (set TELEGRAM_BOT_TOKEN to enable)");
      return;
    }
    try {
      const me = await callApi("getMe");
      botUsername = me.username;
      console.log(`[telegram] connected as @${botUsername}`);
      polling = true;
      pollLoop();
    } catch (err) {
      console.warn("[telegram] failed to start:", err.message);
    }
  }

  function stop() {
    polling = false;
  }

  return {
    enabled: !!token,
    getBotUsername: () => botUsername,
    start,
    stop,
    handleUpdate,
    linkWithCode,
  };
}

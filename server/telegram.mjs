// Telegram bot integration.
//
// Uses the Bot API over long-polling (getUpdates), so it needs no public URL
// and runs fine locally. The whole integration is disabled cleanly when
// TELEGRAM_BOT_TOKEN is unset. Account linking works by having the user press
// "Start" on a t.me/<bot>?start=<code> deep link; the bot ties their Telegram
// id to the Journey account that generated the code. Once linked, any message
// the user sends or forwards to the bot is saved to their Journey inbox.

import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://api.telegram.org";
const LINK_CODE_TTL_MS = 1000 * 60 * 15; // 15 minutes

export function createTelegram({
  db,
  filesDir,
  uid,
  token = null,
  maxFileBytes = 20 * 1024 * 1024,
}) {
  const botToken = token?.trim() || null;
  let botUsername = null;
  let polling = false;

  async function callApi(method, params) {
    if (!botToken) throw new Error("Telegram is not configured.");
    const res = await fetch(`${API_BASE}/bot${botToken}/${method}`, {
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
    if (!botToken) return;
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

  // Which Journey user (if any) does this Telegram user belong to?
  function userIdForTelegram(tgUserId) {
    const row = db
      .prepare("SELECT user_id FROM telegram_links WHERE telegram_user_id = ?")
      .get(String(tgUserId));
    return row?.user_id ?? null;
  }

  // Best-effort label for where a (possibly forwarded) message came from.
  function sourceName(msg) {
    const o = msg.forward_origin;
    if (o) {
      if (o.type === "user" && o.sender_user) {
        return (
          [o.sender_user.first_name, o.sender_user.last_name]
            .filter(Boolean)
            .join(" ") ||
          o.sender_user.username ||
          null
        );
      }
      if (o.type === "hidden_user") return o.sender_user_name ?? null;
      if (o.type === "chat" && o.sender_chat) return o.sender_chat.title ?? null;
      if (o.type === "channel" && o.chat) return o.chat.title ?? null;
    }
    if (msg.forward_from) {
      return (
        [msg.forward_from.first_name, msg.forward_from.last_name]
          .filter(Boolean)
          .join(" ") || null
      );
    }
    if (msg.forward_sender_name) return msg.forward_sender_name;
    if (msg.forward_from_chat) return msg.forward_from_chat.title ?? null;
    return (
      [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") ||
      msg.from?.username ||
      null
    );
  }

  // The date the message was ORIGINALLY sent (unix seconds). For a forward this
  // is the origin's date, not when it reached the bot; falls back to msg.date.
  function originalDate(msg) {
    return (
      msg.forward_origin?.date ?? msg.forward_date ?? msg.date ?? null
    );
  }

  // Extract the single most relevant media file from a message, if any.
  function extractMedia(msg) {
    if (Array.isArray(msg.photo) && msg.photo.length) {
      const largest = msg.photo[msg.photo.length - 1];
      return {
        kind: "image",
        fileId: largest.file_id,
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        fileSize: largest.file_size ?? null,
      };
    }
    if (msg.video) {
      return {
        kind: "video",
        fileId: msg.video.file_id,
        fileName: msg.video.file_name ?? "video.mp4",
        mimeType: msg.video.mime_type ?? "video/mp4",
        fileSize: msg.video.file_size ?? null,
      };
    }
    if (msg.animation) {
      return {
        kind: "video",
        fileId: msg.animation.file_id,
        fileName: msg.animation.file_name ?? "animation.mp4",
        mimeType: msg.animation.mime_type ?? "video/mp4",
        fileSize: msg.animation.file_size ?? null,
      };
    }
    if (msg.document) {
      const mime = msg.document.mime_type ?? "application/octet-stream";
      return {
        kind: mime.startsWith("image/") ? "image" : "file",
        fileId: msg.document.file_id,
        fileName: msg.document.file_name ?? "file",
        mimeType: mime,
        fileSize: msg.document.file_size ?? null,
      };
    }
    if (msg.audio) {
      return {
        kind: "audio",
        fileId: msg.audio.file_id,
        fileName: msg.audio.file_name ?? "audio.mp3",
        mimeType: msg.audio.mime_type ?? "audio/mpeg",
        fileSize: msg.audio.file_size ?? null,
      };
    }
    if (msg.voice) {
      return {
        kind: "audio",
        fileId: msg.voice.file_id,
        fileName: "voice.ogg",
        mimeType: msg.voice.mime_type ?? "audio/ogg",
        fileSize: msg.voice.file_size ?? null,
      };
    }
    return null;
  }

  // Download a Telegram file and store it as an attachment. Returns the
  // attachment row, or null if it could not be downloaded.
  async function downloadAsAttachment(userId, media) {
    if (!filesDir || !uid) return null;
    if (media.fileSize && media.fileSize > maxFileBytes) return null;
    let file;
    try {
      file = await callApi("getFile", { file_id: media.fileId });
    } catch (err) {
      console.warn("[telegram] getFile failed:", err.message);
      return null;
    }
    if (!file?.file_path) return null;
    try {
      const res = await fetch(`${API_BASE}/file/bot${botToken}/${file.file_path}`);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxFileBytes) return null;
      const id = uid();
      fs.writeFileSync(path.join(filesDir, id), buf);
      db.prepare(
        "INSERT INTO attachments (id, user_id, name, type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(id, userId, media.fileName, media.mimeType, buf.length, Date.now());
      return { id, name: media.fileName, type: media.mimeType, size: buf.length };
    } catch (err) {
      console.warn("[telegram] file download failed:", err.message);
      return null;
    }
  }

  // Save an incoming (non-command) message to the linked user's inbox.
  async function saveToInbox(msg) {
    const userId = userIdForTelegram(msg.from.id);
    if (!userId) {
      await sendMessage(
        msg.chat.id,
        "Connect your account first: open Journey → Connect Telegram.",
      );
      return;
    }
    const text = (msg.text ?? msg.caption ?? "").trim();
    const media = extractMedia(msg);
    if (!text && !media) return; // nothing importable (e.g. a sticker)

    let attachment = null;
    let oversize = false;
    if (media) {
      if (media.fileSize && media.fileSize > maxFileBytes) {
        oversize = true;
      } else {
        attachment = await downloadAsAttachment(userId, media);
      }
    }

    db.prepare(
      `INSERT INTO telegram_inbox
         (id, user_id, source_name, text, attachment_id, media_kind, status, tg_message_id, tg_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`,
    ).run(
      uid(),
      userId,
      sourceName(msg),
      text || null,
      attachment?.id ?? null,
      media?.kind ?? null,
      msg.message_id ?? null,
      originalDate(msg),
      Date.now(),
    );

    await sendMessage(
      msg.chat.id,
      oversize
        ? "⚠️ Saved to your Journey inbox (the file was too large to import — max 20 MB)."
        : "✅ Saved to your Journey inbox.",
    );
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
    await saveToInbox(msg);
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
    if (!botToken) {
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
    enabled: !!botToken,
    getBotUsername: () => botUsername,
    start,
    stop,
    handleUpdate,
    linkWithCode,
    saveToInbox,
  };
}

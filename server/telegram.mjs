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
        thumbFileId:
          msg.video.thumbnail?.file_id ?? msg.video.thumb?.file_id ?? null,
      };
    }
    if (msg.animation) {
      return {
        kind: "video",
        fileId: msg.animation.file_id,
        fileName: msg.animation.file_name ?? "animation.mp4",
        mimeType: msg.animation.mime_type ?? "video/mp4",
        fileSize: msg.animation.file_size ?? null,
        thumbFileId:
          msg.animation.thumbnail?.file_id ??
          msg.animation.thumb?.file_id ??
          null,
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
        thumbFileId:
          msg.document.thumbnail?.file_id ??
          msg.document.thumb?.file_id ??
          null,
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

  // Download a Telegram file (by file_id) and store it as an attachment.
  async function downloadFile(userId, fileId, name, type) {
    if (!filesDir || !uid || !fileId) return null;
    let file;
    try {
      file = await callApi("getFile", { file_id: fileId });
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
      ).run(id, userId, name, type, buf.length, Date.now());
      return { id, name, type, size: buf.length };
    } catch (err) {
      console.warn("[telegram] file download failed:", err.message);
      return null;
    }
  }

  // Download a public URL (e.g. a YouTube thumbnail) and store it.
  async function downloadUrlAsAttachment(userId, url, name, type) {
    if (!filesDir || !uid) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > maxFileBytes) return null;
      const id = uid();
      fs.writeFileSync(path.join(filesDir, id), buf);
      db.prepare(
        "INSERT INTO attachments (id, user_id, name, type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(id, userId, name, type, buf.length, Date.now());
      return { id, name, type, size: buf.length };
    } catch {
      return null;
    }
  }

  // Download a message's media as an attachment (respecting the size limit).
  async function downloadAsAttachment(userId, media) {
    if (media.fileSize && media.fileSize > maxFileBytes) return null;
    return downloadFile(userId, media.fileId, media.fileName, media.mimeType);
  }

  // Insert one inbox item plus a row per attachment. Returns the inbox id.
  function insertInboxItem({
    userId,
    source,
    text,
    date,
    mediaKind,
    attachments,
    tgMessageId,
    mediaGroupId,
  }) {
    const inboxId = uid();
    db.prepare(
      `INSERT INTO telegram_inbox
         (id, user_id, source_name, text, attachment_id, media_kind, status, tg_message_id, tg_date, media_group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`,
    ).run(
      inboxId,
      userId,
      source,
      text || null,
      attachments[0]?.id ?? null,
      mediaKind ?? null,
      tgMessageId ?? null,
      date,
      mediaGroupId ?? null,
      Date.now(),
    );
    attachments.forEach((a, i) => {
      db.prepare(
        "INSERT INTO telegram_inbox_media (id, inbox_id, attachment_id, position, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(uid(), inboxId, a.id, i, Date.now());
    });
    return inboxId;
  }

  // Append attachments to an existing inbox item (after its current last one).
  function appendMediaToItem(inboxId, attachments) {
    let pos = db
      .prepare(
        "SELECT COALESCE(MAX(position), -1) AS m FROM telegram_inbox_media WHERE inbox_id = ?",
      )
      .get(inboxId).m;
    for (const a of attachments) {
      pos += 1;
      db.prepare(
        "INSERT INTO telegram_inbox_media (id, inbox_id, attachment_id, position, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(uid(), inboxId, a.id, pos, Date.now());
    }
  }

  // Download every media file on a message (usually 0 or 1). Returns
  // { attachments, oversize }. Too-large videos fall back to their thumbnail.
  async function collectMedia(userId, msg) {
    const media = extractMedia(msg);
    if (!media) return { attachments: [], oversize: false };
    const tooBig = media.fileSize && media.fileSize > maxFileBytes;
    if (!tooBig) {
      const a = await downloadAsAttachment(userId, media);
      if (a) return { attachments: [{ ...a, kind: media.kind }], oversize: false };
    }
    // Too large (or download failed): keep the thumbnail as a preview if any.
    if (media.thumbFileId) {
      const thumb = await downloadFile(
        userId,
        media.thumbFileId,
        media.kind === "video" ? "video-thumbnail.jpg" : "thumbnail.jpg",
        "image/jpeg",
      );
      if (thumb) {
        return { attachments: [{ ...thumb, kind: "image" }], oversize: tooBig };
      }
    }
    return { attachments: [], oversize: tooBig };
  }

  // Nudge an unlinked user to connect — at most once every few seconds/chat.
  const lastNudge = new Map();
  async function nudgeConnect(chatId) {
    if (Date.now() - (lastNudge.get(chatId) ?? 0) < 5000) return;
    lastNudge.set(chatId, Date.now());
    await sendMessage(
      chatId,
      "Connect your account first: open Journey → Connect Telegram.",
    );
  }

  // Bundle everything a user forwards in one burst into a single inbox item.
  // A sliding window resets on each message; 1.5s after the last one it flushes.
  const mediaBursts = new Map();
  const BURST_WINDOW_MS = 1500;

  function bufferBurst(userId, msg) {
    let entry = mediaBursts.get(userId);
    if (!entry) {
      entry = { userId, chatId: msg.chat.id, messages: [], timer: null };
      mediaBursts.set(userId, entry);
    }
    entry.messages.push(msg);
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      mediaBursts.delete(userId);
      flushBurst(entry).catch((err) =>
        console.warn("[telegram] burst flush error:", err.message),
      );
    }, BURST_WINDOW_MS);
  }

  async function flushBurst(entry) {
    const { userId, messages } = entry;
    const first = messages[0];

    // Collect distinct notes/captions across the burst.
    const captions = [];
    for (const m of messages) {
      const c = (m.caption ?? m.text ?? "").trim();
      if (c && !captions.includes(c)) captions.push(c);
    }
    const text = captions.join("\n");

    // Download every media file across the burst (in parallel to keep it fast).
    const results = await Promise.all(
      messages.map((m) => collectMedia(userId, m)),
    );
    const attachments = [];
    let oversize = false;
    for (const r of results) {
      attachments.push(...r.attachments);
      if (r.oversize) oversize = true;
    }
    const mediaKind = attachments.some((a) => a.kind === "image")
      ? "image"
      : (attachments[0]?.kind ?? null);

    // If the whole burst is one album, tag the item so any of its photos that
    // arrive outside the window still merge into the same item.
    const groupIds = new Set(
      messages.map((m) => m.media_group_id).filter(Boolean),
    );
    const mediaGroupId = groupIds.size === 1 ? [...groupIds][0] : null;
    const existing = mediaGroupId
      ? db
          .prepare(
            "SELECT id, text FROM telegram_inbox WHERE user_id = ? AND media_group_id = ? AND status = 'new' ORDER BY created_at ASC LIMIT 1",
          )
          .get(userId, mediaGroupId)
      : null;

    if (existing) {
      appendMediaToItem(existing.id, attachments);
      if (!existing.text && text) {
        db.prepare("UPDATE telegram_inbox SET text = ? WHERE id = ?").run(
          text,
          existing.id,
        );
      }
      return; // one confirmation per bundle is enough
    }

    if (attachments.length === 0 && !text) {
      if (oversize) {
        await sendMessage(
          entry.chatId,
          "⚠️ Couldn't import — the file was too large (max 20 MB).",
        );
      }
      return;
    }

    insertInboxItem({
      userId,
      source: sourceName(first),
      text,
      date: originalDate(first),
      mediaKind,
      attachments,
      tgMessageId: first.message_id,
      mediaGroupId,
    });

    const n = attachments.length;
    let reply;
    if (n > 1) reply = `✅ Bundled ${n} items into one Journey inbox item.`;
    else reply = "✅ Saved to your Journey inbox.";
    if (oversize) reply += " (Some files were too large — max 20 MB.)";
    await sendMessage(entry.chatId, reply);
  }

  // Detect an Instagram reel/post link in text and normalize it.
  function parseInstagramLink(text) {
    const m = String(text || "").match(
      /https?:\/\/(?:www\.)?instagram\.com\/(reels?|p|tv)\/([A-Za-z0-9_-]+)/i,
    );
    if (!m) return null;
    const type = m[1].toLowerCase() === "p" ? "post" : "reel";
    const path = type === "post" ? "p" : "reel";
    return {
      url: `https://www.instagram.com/${path}/${m[2]}/`,
      shortcode: m[2],
      type,
    };
  }

  // Save a shared Instagram link to its own inbox (kept separate from Telegram).
  function saveInstagramItem(userId, msg, ig) {
    const raw = (msg.text ?? msg.caption ?? "").trim();
    const note = raw
      .replace(/https?:\/\/(?:www\.)?instagram\.com\/\S+/gi, "")
      .trim();
    db.prepare(
      `INSERT INTO instagram_inbox
         (id, user_id, url, shortcode, media_type, text, status, tg_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    ).run(
      uid(),
      userId,
      ig.url,
      ig.shortcode,
      ig.type,
      note || null,
      originalDate(msg),
      Date.now(),
    );
  }

  // Detect a YouTube link and extract its video id.
  function parseYouTubeLink(text) {
    const m = String(text || "").match(
      /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
    );
    if (!m) return null;
    return { url: `https://www.youtube.com/watch?v=${m[1]}`, videoId: m[1] };
  }

  // Save a shared YouTube link with its (public) thumbnail as a preview image.
  async function saveYouTubeItem(userId, msg, yt) {
    const raw = (msg.text ?? msg.caption ?? "").trim();
    const thumb = await downloadUrlAsAttachment(
      userId,
      `https://img.youtube.com/vi/${yt.videoId}/hqdefault.jpg`,
      "youtube-thumbnail.jpg",
      "image/jpeg",
    );
    const attachments = thumb ? [{ ...thumb, kind: "image" }] : [];
    insertInboxItem({
      userId,
      source: sourceName(msg),
      text: raw || yt.url,
      date: originalDate(msg),
      mediaKind: attachments.length ? "image" : null,
      attachments,
      tgMessageId: msg.message_id,
      mediaGroupId: null,
    });
  }

  // Save an incoming (non-command) message to the linked user's inbox. Media and
  // text are bundled per burst; Instagram links go to their own inbox.
  async function saveToInbox(msg) {
    const userId = userIdForTelegram(msg.from.id);
    if (!userId) {
      await nudgeConnect(msg.chat.id);
      return;
    }
    // Instagram reel/post links go to the dedicated Instagram inbox.
    const ig = parseInstagramLink(msg.text ?? msg.caption ?? "");
    if (ig) {
      saveInstagramItem(userId, msg, ig);
      await sendMessage(msg.chat.id, "✅ Saved to your Instagram inbox.");
      return;
    }
    // YouTube links get a thumbnail preview in the Telegram inbox.
    const yt = parseYouTubeLink(msg.text ?? msg.caption ?? "");
    if (yt) {
      await saveYouTubeItem(userId, msg, yt);
      await sendMessage(msg.chat.id, "✅ Saved a YouTube video to your Journey inbox.");
      return;
    }
    // Nothing importable (e.g. a sticker with no text)?
    const hasText = Boolean((msg.text ?? msg.caption ?? "").trim());
    if (!hasText && !extractMedia(msg)) return;
    // Everything else is bundled by the sliding burst window.
    bufferBurst(userId, msg);
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

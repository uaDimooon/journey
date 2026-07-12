/** Sidebar card to connect/disconnect a Telegram account.
 *  Renders nothing unless the server has a bot configured. */

import { useEffect, useState } from "react";
import { api, type TelegramStatus } from "../../api/client";

export function TelegramConnect() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [link, setLink] = useState<{ deepLink: string | null; code: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setStatus(await api.telegramStatus());
    } catch {
      // ignore — treated as unavailable
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // While waiting for the user to press Start in Telegram, poll for the link.
  useEffect(() => {
    if (!link) return;
    const id = window.setInterval(async () => {
      const s = await api.telegramStatus().catch(() => null);
      if (!s) return;
      setStatus(s);
      if (s.connected) setLink(null);
    }, 2500);
    return () => window.clearInterval(id);
  }, [link]);

  if (!status || !status.enabled) return null;

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.telegramLinkCode();
      setLink({ deepLink: res.deepLink, code: res.code });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.telegramDisconnect();
      setLink(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs">
      <div className="mb-1.5 font-medium text-neutral-200">✈️ Telegram</div>

      {status.connected ? (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-neutral-400">
            Connected{status.username ? ` as @${status.username}` : ""}
          </span>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="shrink-0 text-neutral-500 hover:text-red-400 disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : link ? (
        <div className="flex flex-col gap-2">
          <p className="text-neutral-400">
            Open the link in Telegram and press <b>Start</b> to connect. Waiting…
          </p>
          {link.deepLink && (
            <a
              href={link.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 rounded bg-sky-600 px-2.5 py-1 font-medium text-white hover:bg-sky-500"
            >
              Open in Telegram
            </a>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-neutral-400">
            Import messages &amp; media from your chats.
          </span>
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="shrink-0 rounded bg-sky-600 px-2.5 py-1 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? "…" : "Connect"}
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-red-400">{error}</p>}
    </div>
  );
}

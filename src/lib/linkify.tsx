/** Render plain text with clickable links. Supports bare http(s) URLs and
 *  markdown-style [label](url). Only http/https URLs are linkified (guards
 *  against javascript: and other unsafe schemes). */

import type { ReactNode } from "react";

// Matches either a markdown link [label](url) or a bare http(s) URL.
const LINK_RE =
  /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;

function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    // not a valid URL
  }
  return null;
}

/** Strip common trailing punctuation from a bare URL match. */
function trimTrailing(url: string): { url: string; tail: string } {
  const m = url.match(/[.,;:!?)]+$/);
  if (m) return { url: url.slice(0, -m[0].length), tail: m[0] };
  return { url, tail: "" };
}

const LINK_CLASS = "text-sky-400 underline underline-offset-2 hover:text-sky-300";

export function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2]) {
      // Markdown link: [label](url)
      const href = safeHref(match[2]);
      nodes.push(
        href ? (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={LINK_CLASS}
          >
            {match[1]}
          </a>
        ) : (
          match[0]
        ),
      );
    } else if (match[3]) {
      // Bare URL
      const { url, tail } = trimTrailing(match[3]);
      const href = safeHref(url);
      if (href) {
        nodes.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={LINK_CLASS}
          >
            {url}
          </a>,
        );
        if (tail) nodes.push(tail);
      } else {
        nodes.push(match[0]);
      }
    }

    lastIndex = LINK_RE.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/** Plain-text version for non-HTML contexts (e.g. the canvas label):
 *  markdown [label](url) becomes just "label"; bare URLs are kept. */
export function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1");
}

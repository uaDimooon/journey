import { describe, expect, it } from "vitest";
import { stripMarkdownLinks } from "./linkify";

// stripMarkdownLinks is the pure helper the renderer uses to show label text
// without markdown link syntax. (The JSX `linkify` is covered in the component
// phase — see docs/TESTING.md.)

describe("stripMarkdownLinks", () => {
  it("replaces a markdown link with its label", () => {
    expect(stripMarkdownLinks("see [docs](https://example.com) now")).toBe(
      "see docs now",
    );
  });

  it("strips multiple links", () => {
    expect(
      stripMarkdownLinks("[a](https://a.com) and [b](https://b.com)"),
    ).toBe("a and b");
  });

  it("leaves bare URLs and plain text unchanged", () => {
    expect(stripMarkdownLinks("visit https://example.com")).toBe(
      "visit https://example.com",
    );
    expect(stripMarkdownLinks("no links here")).toBe("no links here");
  });

  it("does not strip non-http markdown-looking text", () => {
    expect(stripMarkdownLinks("[label](ftp://x)")).toBe("[label](ftp://x)");
  });
});

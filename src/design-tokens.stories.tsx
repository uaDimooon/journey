import type { Meta, StoryObj } from "@storybook/react-vite";

// Living reference for the semantic UI tokens defined in src/index.css (@theme).
// Keep this in sync with Figma Variables when refreshing the UI.
const TOKENS: Array<[label: string, cssVar: string]> = [
  ["surface", "--color-surface"],
  ["panel", "--color-panel"],
  ["field", "--color-field"],
  ["control", "--color-control"],
  ["control-hover", "--color-control-hover"],
  ["border", "--color-border"],
  ["border-subtle", "--color-border-subtle"],
  ["ink", "--color-ink"],
  ["ink-muted", "--color-ink-muted"],
  ["ink-subtle", "--color-ink-subtle"],
  ["accent", "--color-accent"],
  ["accent-strong", "--color-accent-strong"],
  ["accent-hover", "--color-accent-hover"],
  ["accent-link", "--color-accent-link"],
  ["danger", "--color-danger"],
  ["danger-muted", "--color-danger-muted"],
];

function Swatches() {
  return (
    <div
      className="grid grid-cols-2 gap-3 p-6 text-ink"
      style={{ maxWidth: 560 }}
    >
      {TOKENS.map(([label, cssVar]) => (
        <div
          key={cssVar}
          className="flex items-center gap-3 rounded-lg border border-border bg-panel p-3"
        >
          <span
            className="h-9 w-9 shrink-0 rounded border border-border-subtle"
            style={{ background: `var(${cssVar})` }}
          />
          <div className="min-w-0">
            <div className="truncate text-sm">{label}</div>
            <div className="truncate text-xs text-ink-subtle">{cssVar}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "Foundations/Design Tokens",
  component: Swatches,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Swatches>;
export default meta;

export const Colors: StoryObj<typeof meta> = {};

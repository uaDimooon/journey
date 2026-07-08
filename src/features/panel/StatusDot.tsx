/** A small dot: the goal's color inside a ring colored by its status. */

import { STATUS_HEX, STATUS_LABELS, nodeStatus } from "../../domain/status";
import type { GraphNode } from "../../domain/types";

export function StatusDot({ node }: { node: GraphNode }) {
  const status = nodeStatus(node);
  return (
    <span
      title={STATUS_LABELS[status]}
      className="grid h-4 w-4 shrink-0 place-items-center rounded-full"
      style={{ background: STATUS_HEX[status] }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: node.color }}
      />
    </span>
  );
}

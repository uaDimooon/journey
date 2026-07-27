import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TraitEditor } from "./TraitEditor";
import { useGraphStore } from "../../state/graphStore";

// Trait management (UC-8): add, remove, and toggle-done, driven through the
// store. A small harness re-reads traits from the store so the list reflects
// changes, mirroring how DetailPanel feeds this component.

function Harness({ nodeId }: { nodeId: string }) {
  const traits = useGraphStore((s) => s.graph.nodes[nodeId]?.traits ?? []);
  return <TraitEditor nodeId={nodeId} traits={traits} />;
}

let goalId: string;

beforeEach(() => {
  useGraphStore.getState().reset();
  goalId = useGraphStore.getState().addGoal({ x: 200, y: 0 }, 20)!;
});

const traitsOf = () => useGraphStore.getState().graph.nodes[goalId].traits;

describe("TraitEditor", () => {
  it("REQ-8.1: adds a trait via the input + Add button", async () => {
    render(<Harness nodeId={goalId} />);

    await userEvent.type(screen.getByPlaceholderText("Add a trait…"), "Focus");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(traitsOf().map((t) => t.name)).toEqual(["Focus"]);
    expect(screen.getByText("Focus")).toBeInTheDocument();
  });

  it("REQ-8.1: removes a trait", async () => {
    useGraphStore.getState().addTrait(goalId, "Focus");
    render(<Harness nodeId={goalId} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove Focus" }));

    expect(traitsOf()).toHaveLength(0);
  });

  it("REQ-8.3: toggles a trait done", async () => {
    useGraphStore.getState().addTrait(goalId, "Focus");
    render(<Harness nodeId={goalId} />);

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Mark Focus done" }),
    );

    expect(traitsOf()[0].done).toBe(true);
  });
});

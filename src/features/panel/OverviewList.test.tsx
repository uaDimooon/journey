import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverviewList } from "./OverviewList";
import { useGraphStore } from "../../state/graphStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useCameraStore } from "../../state/cameraStore";

// The panel's Overview shown when nothing is selected (UC-5 / REQ-5.3):
// lists the start node + top-level goals; clicking one selects and centers it.

function addGoal(name: string, x: number): string {
  const id = useGraphStore.getState().addGoal({ x, y: 0 }, 20)!;
  useGraphStore.getState().updateNode(id, { name });
  return id;
}

beforeEach(() => {
  useGraphStore.getState().reset();
  useSelectionStore.setState({ selectedId: null, linkingFrom: null, status: null });
  useCameraStore.setState({ focusOn: vi.fn() });
});

describe("OverviewList", () => {
  it("lists the start node and top-level goals", () => {
    addGoal("Health", 200);
    addGoal("Wealth", 600);
    render(<OverviewList />);

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.getByText("Wealth")).toBeInTheDocument();
  });

  it("REQ-5.3: clicking a goal selects it and centers the canvas", async () => {
    const healthId = addGoal("Health", 200);
    render(<OverviewList />);

    await userEvent.click(screen.getByText("Health"));

    expect(useSelectionStore.getState().selectedId).toBe(healthId);
    expect(useCameraStore.getState().focusOn).toHaveBeenCalledOnce();
  });
});

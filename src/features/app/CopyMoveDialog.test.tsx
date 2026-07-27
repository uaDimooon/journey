import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyMoveDialog } from "./CopyMoveDialog";
import { chooseCopyOrMove, useChooseStore } from "../../state/chooseStore";

// The shared Copy/Move chooser behind trait reassign (UC-9) and drop-to-new-goal
// (UC-10). REQ-9.1/10.1 prompt; REQ-10.3 cancel resolves null.

beforeEach(() => {
  useChooseStore.setState({ open: false, label: "", resolve: null });
});

describe("CopyMoveDialog", () => {
  it("renders nothing until a choice is requested", () => {
    render(<CopyMoveDialog />);
    expect(screen.queryByText(/move or copy/i)).not.toBeInTheDocument();
  });

  it("REQ-9.1: shows the label and Copy/Move/Cancel when asked", async () => {
    render(<CopyMoveDialog />);
    void chooseCopyOrMove('Move or copy "Focus" to "Health"?');
    expect(
      await screen.findByText('Move or copy "Focus" to "Health"?'),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it('REQ-9.2: clicking "Move" resolves the promise with "move"', async () => {
    render(<CopyMoveDialog />);
    const choice = chooseCopyOrMove("pick?");
    await screen.findByText("pick?");
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(await choice).toBe("move");
    expect(screen.queryByText("pick?")).not.toBeInTheDocument();
  });

  it('REQ-9.3: clicking "Copy" resolves with "copy"', async () => {
    render(<CopyMoveDialog />);
    const choice = chooseCopyOrMove("pick?");
    await screen.findByText("pick?");
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await choice).toBe("copy");
  });

  it("REQ-10.3: Cancel resolves null", async () => {
    render(<CopyMoveDialog />);
    const choice = chooseCopyOrMove("pick?");
    await screen.findByText("pick?");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await choice).toBeNull();
  });

  it("REQ-10.3: Escape resolves null", async () => {
    render(<CopyMoveDialog />);
    const choice = chooseCopyOrMove("pick?");
    await screen.findByText("pick?");
    await userEvent.keyboard("{Escape}");
    expect(await choice).toBeNull();
  });
});

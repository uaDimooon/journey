import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { CopyMoveDialog } from "./CopyMoveDialog";
import { useChooseStore } from "../../state/chooseStore";

/** Drives the shared chooseStore so the promise-based dialog is visible in a
 *  story (it renders null when closed). */
function OpenDialog({ label }: { label: string }) {
  useEffect(() => {
    useChooseStore.setState({ open: true, label, resolve: () => {} });
    return () =>
      useChooseStore.setState({ open: false, label: "", resolve: null });
  }, [label]);
  return <CopyMoveDialog />;
}

const meta = {
  title: "App/CopyMoveDialog",
  component: CopyMoveDialog,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CopyMoveDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const ReassignToGoal: Story = {
  render: () => <OpenDialog label={'Move or copy "Focus" to "Health"?'} />,
};

export const IntoNewGoal: Story = {
  render: () => <OpenDialog label={'Move or copy "Focus" into a new goal?'} />,
};

import { beforeEach, describe, expect, it } from "vitest";
import { useGraphStore } from "./graphStore";

// Store-level behavior behind the canvas trait drag-and-drop use cases.
// UC-4 (create goal), UC-9 (reassign trait: move/copy), UC-10 (drop -> new goal).

const store = () => useGraphStore.getState();

function firstTraitId(nodeId: string): string {
  const t = store().graph.nodes[nodeId]?.traits[0];
  if (!t) throw new Error("expected a trait");
  return t.id;
}

beforeEach(() => {
  store().reset();
});

describe("addGoal (UC-4)", () => {
  it("REQ-4.1: creates a goal at a free position and returns its id", () => {
    const id = store().addGoal({ x: 500, y: 500 }, 20);
    expect(id).toBeTruthy();
    expect(store().graph.nodes[id!].kind).toBe("goal");
  });

  it("REQ-4.1: refuses to create a goal on an occupied position", () => {
    const id = store().addGoal({ x: 500, y: 500 }, 20);
    expect(id).toBeTruthy();
    const dup = store().addGoal({ x: 500, y: 500 }, 20);
    expect(dup).toBeNull();
  });
});

describe("moveTrait (UC-9 reassign / UC-10 into new goal)", () => {
  it("REQ-9.2: moves a trait from the source goal to the target", () => {
    const a = store().addGoal({ x: 200, y: 0 }, 20)!;
    const b = store().addGoal({ x: 600, y: 0 }, 20)!;
    store().addTrait(a, "Focus");
    const traitId = firstTraitId(a);

    store().moveTrait(a, traitId, b);

    expect(store().graph.nodes[a].traits).toHaveLength(0);
    const moved = store().graph.nodes[b].traits;
    expect(moved).toHaveLength(1);
    expect(moved[0].id).toBe(traitId);
    expect(moved[0].name).toBe("Focus");
  });

  it("REQ-9.4: dropping a trait back on its own goal is a no-op", () => {
    const a = store().addGoal({ x: 200, y: 0 }, 20)!;
    store().addTrait(a, "Focus");
    const traitId = firstTraitId(a);

    store().moveTrait(a, traitId, a);

    expect(store().graph.nodes[a].traits).toHaveLength(1);
  });
});

describe("addTraitDetailed (UC-9 copy)", () => {
  it("REQ-9.3: adds an independent trait copy with its own attachments/description", () => {
    const src = store().addGoal({ x: 200, y: 0 }, 20)!;
    const dst = store().addGoal({ x: 600, y: 0 }, 20)!;
    const attachments = [{ id: "att_copy", name: "pic", type: "image/png" }];

    const newId = store().addTraitDetailed(dst, {
      name: "Discipline",
      description: "keep going",
      attachments,
      cover: attachments[0],
    });

    // Source goal is untouched; the copy lives independently on the target.
    expect(store().graph.nodes[src].traits).toHaveLength(0);
    const copy = store().graph.nodes[dst].traits[0];
    expect(copy.id).toBe(newId);
    expect(copy.name).toBe("Discipline");
    expect(copy.description).toBe("keep going");
    expect(copy.attachments).toHaveLength(1);
    expect(copy.cover?.id).toBe("att_copy");
  });
});

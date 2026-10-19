import test from "node:test";
import assert from "node:assert/strict";
import { resolveGroupTrainer } from "../src/shared/groupTrainer.js";

test("trainer resolution is deterministic when legacy data has several primaries", () => {
  const result = resolveGroupTrainer({
    group: { id: "latin" },
    trainerGroups: [
      { groupId: "latin", trainerId: "trainer-z", isPrimary: true },
      { groupId: "latin", trainerId: "trainer-a", isPrimary: true },
    ],
    trainers: [
      { id: "trainer-z", name: "Z" },
      { id: "trainer-a", name: "A" },
    ],
  });

  assert.equal(result.trainerId, "trainer-a");
});

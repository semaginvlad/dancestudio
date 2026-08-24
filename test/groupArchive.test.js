import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGroupArchivePatch,
  buildGroupArchiveRestorePatch,
  getGroupArchiveMeta,
} from "../src/shared/groupArchive.js";

test("a group is archived when any supported archive field says so", () => {
  assert.equal(getGroupArchiveMeta({ is_active: false, archived_at: null }).isArchived, true);
  assert.equal(getGroupArchiveMeta({ is_active: true, archived_at: "2026-08-24" }).isArchived, true);
  assert.equal(getGroupArchiveMeta({ is_active: true, archived_at: null }).isArchived, false);
});

test("archive and restore update every available archive field", () => {
  const meta = getGroupArchiveMeta({ is_active: true, active: true, archived_at: null });
  assert.deepEqual(buildGroupArchivePatch(meta, true, "2026-08-24T10:00:00.000Z"), {
    is_active: false,
    active: false,
    archived_at: "2026-08-24T10:00:00.000Z",
  });
  assert.deepEqual(buildGroupArchiveRestorePatch(meta), {
    is_active: true,
    active: true,
    archived_at: null,
  });
});

test("old merge operation records remain undoable", () => {
  assert.deepEqual(buildGroupArchiveRestorePatch({ mode: "is_active" }, false), { is_active: true });
});

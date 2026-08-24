const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function getGroupArchiveMeta(group = {}) {
  const availableFields = ["is_active", "active", "archived_at"].filter((key) => hasOwn(group, key));
  const values = Object.fromEntries(availableFields.map((key) => [key, group[key]]));
  const isArchived =
    (hasOwn(group, "is_active") && group.is_active === false) ||
    (hasOwn(group, "active") && group.active === false) ||
    (hasOwn(group, "archived_at") && !!group.archived_at);

  return {
    mode: availableFields[0] || null,
    availableFields,
    values,
    isArchived,
  };
}

export function buildGroupArchivePatch(metaOrMode, shouldArchive, archivedAt = new Date().toISOString()) {
  const fields = typeof metaOrMode === "string"
    ? [metaOrMode]
    : (metaOrMode?.availableFields || (metaOrMode?.mode ? [metaOrMode.mode] : []));
  const patch = {};

  if (fields.includes("is_active")) patch.is_active = !shouldArchive;
  if (fields.includes("active")) patch.active = !shouldArchive;
  if (fields.includes("archived_at")) patch.archived_at = shouldArchive ? archivedAt : null;

  return Object.keys(patch).length ? patch : null;
}

export function buildGroupArchiveRestorePatch(previousState, wasArchived = false) {
  if (previousState?.values && Object.keys(previousState.values).length) {
    return { ...previousState.values };
  }
  return buildGroupArchivePatch(previousState, wasArchived);
}

export const isGroupArchived = (group) => getGroupArchiveMeta(group).isArchived;

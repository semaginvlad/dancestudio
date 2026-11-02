const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export const normalizeGroupArchiveAliases = (group = {}) => {
  const normalized = { ...group };
  if (hasOwn(group, "archived_at") || hasOwn(group, "archivedAt")) {
    normalized.archivedAt = group.archived_at ?? group.archivedAt ?? null;
  }
  if (hasOwn(group, "is_active") || hasOwn(group, "isActive")) {
    normalized.isActive = group.is_active ?? group.isActive;
  }
  return normalized;
};

export const getGroupArchiveMeta = (group = {}) => {
  if (hasOwn(group, "is_active")) return { mode: "is_active", isArchived: group.is_active === false };
  if (hasOwn(group, "active")) return { mode: "active", isArchived: group.active === false };
  if (hasOwn(group, "archived_at")) return { mode: "archived_at", isArchived: !!group.archived_at };
  return { mode: null, isArchived: false };
};

export const buildGroupArchivePatch = (mode, shouldArchive, archiveDate) => {
  if (mode === "is_active") return { is_active: !shouldArchive };
  if (mode === "active") return { active: !shouldArchive };
  if (mode === "archived_at") return { archived_at: shouldArchive ? archiveDate : null };
  return null;
};

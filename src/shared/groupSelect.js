import { getInternalGroupLabel } from "./groupLabels.js";

export function buildGroupSelectSections(groups = [], directions = [], filterDir = "all") {
  const uniqueGroups = Array.from(new Map(groups.filter(Boolean).map((group) => [String(group.id), group])).values());
  const directionMap = new Map(directions.filter(Boolean).map((direction) => [String(direction.id), direction]));
  const sections = new Map();
  uniqueGroups.forEach((group) => {
    const directionId = String(group.directionId || "");
    if (filterDir !== "all" && directionId !== String(filterDir)) return;
    const direction = directionId ? directionMap.get(directionId) : null;
    const key = directionId || "__none__";
    const label = direction?.name || (directionId ? directionId.replaceAll("_", " ") || "Інші групи" : "Без напрямку");
    if (!sections.has(key)) sections.set(key, { id: key, name: label, groups: [] });
    sections.get(key).groups.push(group);
  });
  return [...sections.values()]
    .map((section) => ({ ...section, groups: section.groups.sort((a, b) => getInternalGroupLabel(a).localeCompare(getInternalGroupLabel(b), "uk")) }))
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));
}

const parseSchedule = (schedule) => {
  if (Array.isArray(schedule)) return schedule;
  if (typeof schedule !== 'string') return [];
  try {
    const parsed = JSON.parse(schedule);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getPublicGroupBlockers = (group = {}) => {
  const blockers = [];
  if (group.archivedAt || group.archived_at || group.isActive === false || group.is_active === false || group.active === false) blockers.push('група архівна');
  if (!String(group.publicLevel ?? group.public_level ?? '').trim()) blockers.push('немає рівня');
  if (!String(group.ageCategory ?? group.age_category ?? '').trim()) blockers.push('немає вікової категорії');
  const hasSchedule = parseSchedule(group.schedule).some((slot) => Number.isInteger(Number(slot?.day)) && String(slot?.time || '').trim());
  if (!hasSchedule) blockers.push('немає графіка');
  return blockers;
};

export const isArchivedSiteGroup = (group = {}) => getPublicGroupBlockers(group).includes('група архівна');

export const formatGroupStartDate = (value) => {
  if (!value) return 'Не вказано';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value);
};

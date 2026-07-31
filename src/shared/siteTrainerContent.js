export const SITE_TRAINER_CONTENT_FIELDS = [
  'publicName', 'roleLabel', 'mainDirectionName', 'heroLabel', 'profileEyebrow',
  'mainDirectionEyebrow', 'mainDirectionDetailEyebrow', 'profileSummary',
  'videoSummary', 'emptyPortraitSummary', 'primaryCtaLabel', 'secondaryCtaLabel',
];

export const nullableTrimmed = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
};

export const sectionKey = (title, index = 0) => {
  const normalized = nullableTrimmed(title)?.toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return normalized || `section-${index + 1}`;
};

export function normalizeProfileSections(sections) {
  if (sections == null) return null;
  if (!Array.isArray(sections)) throw new Error('Секції профілю мають бути списком.');
  const keys = new Set();
  const normalized = sections.map((section, index) => {
    const title = nullableTrimmed(section?.title);
    const body = nullableTrimmed(section?.body);
    if (!title || !body) throw new Error(`Заповніть заголовок і текст секції ${index + 1}.`);
    let key = nullableTrimmed(section?.key) || sectionKey(title, index);
    key = key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `section-${index + 1}`;
    const base = key;
    let suffix = 2;
    while (keys.has(key)) key = `${base}-${suffix++}`;
    keys.add(key);
    return { key, title, body, sort_order: (index + 1) * 10 };
  });
  return normalized.length ? normalized : null;
}

export function normalizeSiteTrainerContent(content = {}) {
  return Object.fromEntries([
    ...SITE_TRAINER_CONTENT_FIELDS.map((field) => [field, nullableTrimmed(content[field])]),
    ['profileSections', normalizeProfileSections(content.profileSections)],
  ]);
}

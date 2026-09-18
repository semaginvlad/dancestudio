import { nullableTrimmed } from './siteTrainerContent.js';

export const SITE_PAGE_CONTENT_FIELDS = {
  home: ['eyebrow', 'title', 'subtitle', 'description', 'primaryCtaLabel', 'secondaryCtaLabel', 'logo_url'],
  schedule: [
    'eyebrow', 'title', 'city', 'studioLabel', 'cityStudioLabel',
    'baseTitle', 'baseLabel', 'baseDescription',
    'mixTitle', 'mixLabel', 'mixDescription',
    'loadErrorMessage', 'emptyScheduleMessage',
  ],
  directions: ['eyebrow', 'title', 'subtitle', 'description', 'primaryCtaLabel', 'secondaryCtaLabel'],
  coaches: ['eyebrow', 'title', 'subtitle', 'description', 'primaryCtaLabel', 'secondaryCtaLabel'],
  about: ['eyebrow', 'title', 'subtitle', 'description', 'primaryCtaLabel', 'secondaryCtaLabel'],
  join: ['eyebrow', 'title', 'subtitle', 'description', 'primaryCtaLabel', 'secondaryCtaLabel'],
  directions_quiz: ['eyebrow', 'title', 'subtitle', 'description', 'primaryCtaLabel', 'secondaryCtaLabel'],
};

export const SITE_DIRECTION_CONTENT_FIELDS = [
  'eyebrow', 'title', 'subtitle', 'description', 'primaryCtaLabel', 'secondaryCtaLabel',
];

export const HOME_SECTION_ORDER = [
  'hero', 'directions', 'schedule', 'team', 'join_cta',
  'brand_metrics', 'open_groups', 'week_pulse',
];

export const HOME_SECTION_LABELS = {
  hero: 'Головний екран',
  directions: 'Напрямки',
  schedule: 'Розклад',
  team: 'Команда',
  join_cta: 'Заклик приєднатися',
  brand_metrics: 'Метрики',
  open_groups: 'Відкриті групи',
  week_pulse: 'Пульс тижня',
};

export const HOME_SECTION_FIELDS = {
  hero: ['enabled', 'eyebrow', 'title', 'description', 'primary_cta_label', 'primary_cta_page_key', 'secondary_cta_label', 'secondary_cta_page_key'],
  directions: ['enabled', 'eyebrow', 'title', 'description', 'primary_cta_label', 'primary_cta_page_key', 'featured_limit'],
  schedule: ['enabled', 'eyebrow', 'title', 'description', 'primary_cta_label', 'primary_cta_page_key', 'secondary_cta_label', 'secondary_cta_page_key'],
  team: ['enabled', 'eyebrow', 'title', 'description', 'primary_cta_label', 'primary_cta_page_key'],
  join_cta: ['enabled', 'eyebrow', 'title', 'description', 'primary_cta_label', 'primary_cta_page_key', 'secondary_cta_label', 'secondary_cta_page_key'],
  brand_metrics: ['enabled', 'title'],
  open_groups: ['enabled', 'title', 'description'],
  week_pulse: ['enabled', 'title'],
};

export const HOME_SECTION_DEFAULT_ENABLED = {
  hero: true, directions: true, schedule: true, team: true, join_cta: true,
  brand_metrics: false, open_groups: false, week_pulse: false,
};

export const SITE_CTA_PAGE_KEYS = ['schedule', 'directions', 'coaches', 'about', 'join', 'directions_quiz'];

const CTA_PAGE_KEY_FIELDS = new Set(['primary_cta_page_key', 'secondary_cta_page_key']);
const TEXT_SECTION_FIELDS = new Set(['eyebrow', 'title', 'description', 'primary_cta_label', 'secondary_cta_label']);

export function normalizeHomeSection(sectionId, content = {}) {
  const allowedFields = HOME_SECTION_FIELDS[sectionId];
  if (!allowedFields) throw new Error('Невідома секція головної сторінки.');
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error(`Секція «${HOME_SECTION_LABELS[sectionId]}» має бути об’єктом.`);

  const normalized = {};
  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(content, field)) continue;
    const value = content[field];
    if (field === 'enabled') {
      if (typeof value !== 'boolean') throw new Error('Видимість секції має бути логічним значенням.');
      normalized.enabled = value;
    } else if (field === 'featured_limit') {
      if (value === '' || value == null) continue;
      if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('Кількість напрямків має бути цілим числом від 1 до 6.');
      normalized.featured_limit = value;
    } else if (CTA_PAGE_KEY_FIELDS.has(field)) {
      const pageKey = nullableTrimmed(value);
      if (pageKey && !SITE_CTA_PAGE_KEYS.includes(pageKey)) throw new Error('Оберіть дозволену сторінку для CTA.');
      if (pageKey) normalized[field] = pageKey;
    } else if (TEXT_SECTION_FIELDS.has(field)) {
      const text = nullableTrimmed(value);
      if (text) normalized[field] = text;
    }
  }
  return normalized;
}

export function normalizeHomeSections(sections = {}) {
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) throw new Error('Секції головної сторінки мають бути об’єктом.');
  return Object.fromEntries(HOME_SECTION_ORDER.flatMap((sectionId) => {
    if (!Object.prototype.hasOwnProperty.call(sections, sectionId)) return [];
    try { return [[sectionId, normalizeHomeSection(sectionId, sections[sectionId])]]; }
    catch { return []; }
  }));
}

export function normalizeWhitelistedContent(content = {}, allowedFields = []) {
  return Object.fromEntries(allowedFields.flatMap((field) => {
    const value = nullableTrimmed(content[field]);
    return value ? [[field, value]] : [];
  }));
}

export function normalizeSitePageContent(pageKey, content = {}) {
  const allowed = SITE_PAGE_CONTENT_FIELDS[pageKey];
  if (!allowed) throw new Error('Невідомий ключ сторінки.');
  const normalized = normalizeWhitelistedContent(content, allowed);
  if (pageKey === 'home' && Object.prototype.hasOwnProperty.call(content, 'sections')) {
    normalized.sections = normalizeHomeSections(content.sections);
  }
  return normalized;
}

export function normalizeSiteDirectionContent(content = {}) {
  return normalizeWhitelistedContent(content, SITE_DIRECTION_CONTENT_FIELDS);
}

export const SITE_LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function validateSiteLogo(file) {
  if (!file || file.type !== 'image/png') throw new Error('Оберіть файл у форматі PNG.');
  if (file.size > SITE_LOGO_MAX_BYTES) throw new Error('Розмір логотипа не може перевищувати 2 МБ.');
  return file;
}

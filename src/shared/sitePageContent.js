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

export function normalizeWhitelistedContent(content = {}, allowedFields = []) {
  return Object.fromEntries(allowedFields.flatMap((field) => {
    const value = nullableTrimmed(content[field]);
    return value ? [[field, value]] : [];
  }));
}

export function normalizeSitePageContent(pageKey, content = {}) {
  const allowed = SITE_PAGE_CONTENT_FIELDS[pageKey];
  if (!allowed) throw new Error('Невідомий ключ сторінки.');
  return normalizeWhitelistedContent(content, allowed);
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

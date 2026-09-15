import { nullableTrimmed } from './siteTrainerContent.js';

export const SITE_PAGE_CONTENT_FIELDS = {
  home: ['eyebrow', 'title', 'subtitle', 'description', 'primaryCtaLabel', 'secondaryCtaLabel'],
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

export const SITE_INQUIRY_STATUSES = [
  "new",
  "in_progress",
  "converted_to_reserve",
  "converted_to_trial",
  "converted_to_student",
  "closed",
  "spam",
];

export const SITE_INQUIRY_EDITABLE_STATUSES = ["new", "in_progress", "closed", "spam"];

export const SITE_INQUIRY_STATUS_LABELS = {
  new: "Новий",
  in_progress: "В роботі",
  converted_to_reserve: "У резерві",
  converted_to_trial: "Записано на пробне",
  converted_to_student: "Створено ученицю",
  closed: "Закрито",
  spam: "Спам",
};

const clean = (value) => String(value || "").trim();

export const mapSiteInquiry = (row = {}) => ({
  id: row.id,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  status: SITE_INQUIRY_STATUSES.includes(row.status) ? row.status : "new",
  statusChangedAt: row.status_changed_at || null,
  name: clean(row.name),
  phone: clean(row.phone),
  phoneNormalized: clean(row.phone_normalized),
  telegram: clean(row.telegram),
  telegramNormalized: clean(row.telegram_normalized),
  instagram: clean(row.instagram),
  instagramNormalized: clean(row.instagram_normalized),
  email: clean(row.email),
  emailNormalized: clean(row.email_normalized),
  preferredContact: row.preferred_contact || "any",
  directionId: row.direction_id || null,
  directionName: clean(row.direction_name_snapshot),
  groupId: row.group_id || null,
  groupName: clean(row.group_name_snapshot),
  trainerId: row.trainer_id || null,
  trainerName: clean(row.trainer_name_snapshot),
  comment: clean(row.comment),
  source: clean(row.source) || "public_site",
  sourcePage: clean(row.source_page),
  referrer: clean(row.referrer),
  utmData: row.utm_data && typeof row.utm_data === "object" ? row.utm_data : {},
  privacyConsentAt: row.privacy_consent_at || null,
  submissionCount: Math.max(1, Number(row.submission_count) || 1),
  lastSubmittedAt: row.last_submitted_at || null,
  adminNote: clean(row.admin_note),
  processedBy: row.processed_by || null,
  convertedWaitlistId: row.converted_waitlist_id || null,
  convertedTrialBookingId: row.converted_trial_booking_id || null,
  convertedStudentId: row.converted_student_id || null,
  convertedAt: row.converted_at || null,
  possibleDuplicateOfId: row.possible_duplicate_of_id || null,
});

export const canEditSiteInquiry = (inquiry = {}) =>
  SITE_INQUIRY_EDITABLE_STATUSES.includes(inquiry.status);

export const filterSiteInquiries = (rows = [], { status = "all", search = "" } = {}) => {
  const needle = clean(search).toLocaleLowerCase("uk-UA");
  return rows.filter((row) => {
    if (status !== "all" && row.status !== status) return false;
    if (!needle) return true;
    return [row.name, row.phone, row.telegram, row.instagram, row.email, row.directionName, row.groupName, row.comment]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("uk-UA")
      .includes(needle);
  });
};

export const validateSiteInquiryModel = (input = {}) => {
  const errors = [];
  const name = clean(input.name);
  if (!name) errors.push("name_required");
  if (name.length > 160) errors.push("name_too_long");
  if (![input.phone, input.telegram, input.instagram, input.email].some((value) => clean(value))) {
    errors.push("contact_required");
  }
  if (!SITE_INQUIRY_STATUSES.includes(input.status || "new")) errors.push("invalid_status");
  const conversionIds = [input.convertedWaitlistId, input.convertedTrialBookingId, input.convertedStudentId].filter(Boolean);
  if (conversionIds.length > 1) errors.push("multiple_conversions");
  const expectedConversion = {
    converted_to_reserve: input.convertedWaitlistId,
    converted_to_trial: input.convertedTrialBookingId,
    converted_to_student: input.convertedStudentId,
  }[input.status];
  if (String(input.status || "").startsWith("converted_") && !expectedConversion) errors.push("conversion_id_required");
  if (!String(input.status || "").startsWith("converted_") && conversionIds.length) errors.push("conversion_status_required");
  return { valid: errors.length === 0, errors };
};

export const getSiteInquiryContactLinks = (inquiry = {}) => {
  const phone = clean(inquiry.phoneNormalized || inquiry.phone);
  const email = clean(inquiry.emailNormalized || inquiry.email);
  const telegram = clean(inquiry.telegramNormalized || inquiry.telegram).replace(/^@/, "");
  const instagram = clean(inquiry.instagramNormalized || inquiry.instagram)
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/$/, "");
  return {
    phone: phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : null,
    email: email ? `mailto:${email}` : null,
    telegram: telegram ? `https://t.me/${encodeURIComponent(telegram)}` : null,
    instagram: instagram ? `https://instagram.com/${encodeURIComponent(instagram)}` : null,
  };
};

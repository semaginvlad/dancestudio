export const CONTACT_TYPES = ["student", "lead", "trainer", "other"];
export const CRM_STAGES = ["potential_lead", "waitlist_ready"];
export const LEAD_STATUSES = ["new_lead", "contacted", "interested", "waitlist", "student", "closed_inactive"];
export const PIPELINE_STATUSES = ["new", "contacted", "interested", "thinking", "reminder_needed", "waitlist", "booked", "closed"];

export const normalizeContactType = (value, fallback = "other") => {
  const next = String(value || "").trim().toLowerCase();
  return CONTACT_TYPES.includes(next) ? next : fallback;
};

export const normalizeCrmStage = (value) => {
  const next = String(value || "").trim().toLowerCase();
  return CRM_STAGES.includes(next) ? next : "";
};

export const normalizeLeadStatus = (value, fallback = "") => {
  const next = String(value || "").trim().toLowerCase();
  return LEAD_STATUSES.includes(next) ? next : fallback;
};

export const normalizePipelineStatus = (value, fallback = "") => {
  const next = String(value || "").trim().toLowerCase();
  return PIPELINE_STATUSES.includes(next) ? next : fallback;
};

export const buildUnifiedContact = ({
  id,
  channel,
  name = "",
  phone = "",
  telegram = "",
  instagram = "",
  linkedStudentId = "",
  contactType = "other",
  crmStage = "",
  leadStatus = "",
  source = "",
  preferredDirection = "",
  preferredGroup = "",
  formatPreference = "",
  waitlistStatus = "",
  pipelineStatus = "",
  nextAction = "",
  followUpAt = "",
  followUpReason = "",
  followUpState = "",
  shortTag = "",
}) => ({
  id: String(id || ""),
  channel: String(channel || "telegram"),
  name: String(name || "").trim(),
  phone: String(phone || "").trim(),
  telegram: String(telegram || "").trim(),
  instagram: String(instagram || "").trim(),
  linkedStudentId: linkedStudentId ? String(linkedStudentId) : "",
  contactType: normalizeContactType(contactType),
  crmStage: normalizeCrmStage(crmStage),
  leadStatus: normalizeLeadStatus(leadStatus),
  source: String(source || "").trim(),
  preferredDirection: String(preferredDirection || "").trim(),
  preferredGroup: String(preferredGroup || "").trim(),
  formatPreference: String(formatPreference || "").trim(),
  waitlistStatus: String(waitlistStatus || "").trim(),
  pipelineStatus: normalizePipelineStatus(pipelineStatus),
  nextAction: String(nextAction || "").trim(),
  followUpAt: String(followUpAt || "").trim(),
  followUpReason: String(followUpReason || "").trim(),
  followUpState: String(followUpState || "").trim(),
  shortTag: String(shortTag || "").trim(),
});

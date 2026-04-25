export const CONTACT_TYPES = ["student", "lead", "trainer", "other"];
export const CRM_STAGES = ["potential_lead", "waitlist_ready"];

export const normalizeContactType = (value, fallback = "other") => {
  const next = String(value || "").trim().toLowerCase();
  return CONTACT_TYPES.includes(next) ? next : fallback;
};

export const normalizeCrmStage = (value) => {
  const next = String(value || "").trim().toLowerCase();
  return CRM_STAGES.includes(next) ? next : "";
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
  shortTag: String(shortTag || "").trim(),
});

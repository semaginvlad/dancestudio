export const normalizeEntityId = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

export const getTrainerDisplayName = (trainer) => {
  if (!trainer) return "";
  return (
    trainer.name ||
    [trainer.firstName, trainer.lastName].filter(Boolean).join(" ") ||
    trainer.full_name ||
    trainer.email ||
    trainer.id ||
    ""
  );
};

export const getGroupDirectTrainerId = (group = {}) => {
  const candidates = [
    group.trainerId,
    group.trainer_id,
    group.coachId,
    group.coach_id,
    group.trainer_id_fk,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeEntityId(candidate);
    if (normalized) return normalized;
  }
  if (group.trainer && typeof group.trainer !== "object") return normalizeEntityId(group.trainer);
  if (group.trainer && typeof group.trainer === "object") {
    return normalizeEntityId(group.trainer.id || group.trainer.trainerId || group.trainer.trainer_id);
  }
  return "";
};

export const resolveGroupTrainer = ({ group, trainerGroups = [], trainers = [] } = {}) => {
  const groupId = normalizeEntityId(group?.id);
  const groupRows = groupId
    ? trainerGroups.filter((row) => normalizeEntityId(row.groupId ?? row.group_id) === groupId)
    : [];
  const primary = groupRows.find((row) => row.isPrimary || row.is_primary) || groupRows[0];
  const relationTrainerId = normalizeEntityId(primary?.trainerId ?? primary?.trainer_id);
  const directTrainerId = getGroupDirectTrainerId(group);
  const trainerId = relationTrainerId || directTrainerId;
  const trainer = trainerId
    ? trainers.find((item) => normalizeEntityId(item.id) === trainerId) || null
    : null;
  return {
    trainerId,
    trainer,
    trainerName: getTrainerDisplayName(trainer) || (typeof group?.trainer === "string" ? group.trainer : ""),
    source: relationTrainerId ? "trainer_groups" : directTrainerId ? "groups" : "none",
  };
};

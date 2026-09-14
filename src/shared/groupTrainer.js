import { parseGroupSchedule } from "./groupSchedule.js";

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

export const getGroupTrainerIds = (group = {}, trainerGroups = []) => {
  const groupId = normalizeEntityId(group.id);
  const trainerIds = new Set();
  const addTrainerId = (value) => {
    const id = normalizeEntityId(value);
    if (id) trainerIds.add(id);
  };

  trainerGroups.forEach((row) => {
    if (normalizeEntityId(row.groupId ?? row.group_id) === groupId) {
      // Both primary and non-primary relations grant the trainer access to the group.
      addTrainerId(row.trainerId ?? row.trainer_id);
    }
  });
  addTrainerId(getGroupDirectTrainerId(group));

  parseGroupSchedule(group.schedule).forEach((slot) => addTrainerId(slot?.trainerId ?? slot?.trainer_id));

  return trainerIds;
};

export const groupsShareTrainer = (left, right, trainerGroups = []) => {
  const leftTrainerIds = getGroupTrainerIds(left, trainerGroups);
  const rightTrainerIds = getGroupTrainerIds(right, trainerGroups);
  return Array.from(leftTrainerIds).some((trainerId) => rightTrainerIds.has(trainerId));
};

export const getTransferTargetGroups = ({ groups = [], fromGroup, trainerGroups = [] } = {}) => (
  groups.filter((group) => (
    normalizeEntityId(group.id) !== normalizeEntityId(fromGroup?.id) &&
    // The DB's archival marker is authoritative. mapGroup exposes its camelCase alias.
    (group.archived_at ?? group.archivedAt ?? null) === null &&
    groupsShareTrainer(fromGroup, group, trainerGroups)
  ))
);

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

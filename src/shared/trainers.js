export const isTrainerArchived = (trainer = {}) => Boolean(
  trainer.archivedAt || trainer.archived_at ||
  trainer.accessDisabledAt || trainer.access_disabled_at ||
  trainer.archived === true || trainer.isArchived === true || trainer.is_archived === true ||
  trainer.isActive === false || trainer.is_active === false || trainer.active === false
);

export const getOperationalTrainers = (trainers = [], selectedValues = []) => {
  const selected = new Set((Array.isArray(selectedValues) ? selectedValues : [selectedValues])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(String));

  return (Array.isArray(trainers) ? trainers : []).filter((trainer) =>
    trainer && (!isTrainerArchived(trainer) || [trainer.id, trainer.authUserId, trainer.auth_user_id]
      .filter(Boolean)
      .some((value) => selected.has(String(value))))
  );
};

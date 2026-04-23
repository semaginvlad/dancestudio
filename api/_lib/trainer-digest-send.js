import { withTelegramClient } from "./telegram-user-client.js";

export const ADMIN_LOG_CHAT_ID = process.env.TELEGRAM_ADMIN_LOG_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID || "";

export const renderAdminLogMessage = ({
  status = "sent",
  chatId,
  chatTitle,
  groupNames = [],
  studentsCount = 0,
  triggerType = "manual",
  sentAtIso = new Date().toISOString(),
}) => {
  const groupsLine = Array.isArray(groupNames) && groupNames.length ? groupNames.join(", ") : "—";
  const safeTitle = chatTitle || chatId || "unknown";
  return [
    "trainer_digest_log",
    `status: ${status}`,
    `trigger: ${triggerType}`,
    `to: ${safeTitle} (${chatId || "no_chat_id"})`,
    `groups: ${groupsLine}`,
    `students: ${Number(studentsCount || 0)}`,
    `at: ${sentAtIso}`,
  ].join("\n");
};

export const sendTrainerDigestWithAdminLog = async ({
  peer,
  message,
  chatTitle = "",
  groupNames = [],
  studentsCount = 0,
  triggerType = "manual",
}) => {
  const sentAtIso = new Date().toISOString();
  await withTelegramClient(async (client) => {
    await client.sendMessage(peer, { message });
  });

  let adminLogStatus = "skipped";
  if (ADMIN_LOG_CHAT_ID) {
    try {
      await withTelegramClient(async (client) => {
        await client.sendMessage(ADMIN_LOG_CHAT_ID, {
          message: renderAdminLogMessage({
            status: "sent",
            chatId: String(peer),
            chatTitle,
            groupNames,
            studentsCount,
            triggerType,
            sentAtIso,
          }),
        });
      });
      adminLogStatus = "sent";
    } catch (adminError) {
      adminLogStatus = "failed";
      console.error("trainer digest admin-log error:", adminError);
    }
  }

  return { sentAtIso, adminLogStatus };
};

export const reportTrainerDigestFailureToAdmin = async ({
  peer,
  chatTitle = "",
  groupNames = [],
  studentsCount = 0,
  triggerType = "manual",
}) => {
  if (!ADMIN_LOG_CHAT_ID) return "skipped";
  const sentAtIso = new Date().toISOString();
  try {
    await withTelegramClient(async (client) => {
      await client.sendMessage(ADMIN_LOG_CHAT_ID, {
        message: renderAdminLogMessage({
          status: "failed",
          chatId: String(peer),
          chatTitle,
          groupNames,
          studentsCount,
          triggerType,
          sentAtIso,
        }),
      });
    });
    return "sent";
  } catch (adminError) {
    console.error("trainer digest admin-log failure-report error:", adminError);
    return "failed";
  }
};

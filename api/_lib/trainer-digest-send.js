import { resolveTelegramPeer, withTelegramClient } from "./telegram-user-client.js";

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
  username = "",
  message,
  chatTitle = "",
  groupNames = [],
  studentsCount = 0,
  triggerType = "manual",
  sendToAdminOnly = false,
}) => {
  const sentAtIso = new Date().toISOString();
  if (!sendToAdminOnly) {
    await withTelegramClient(async (client) => {
      const targetEntity = await resolveTelegramPeer(client, {
        chatId: peer,
        username,
        context: "send-trainer-digest:target",
      });
      await client.sendMessage(targetEntity, { message });
    });
  }

  let adminLogStatus = "skipped";
  if (ADMIN_LOG_CHAT_ID) {
    try {
      await withTelegramClient(async (client) => {
        const adminEntity = await resolveTelegramPeer(client, {
          chatId: ADMIN_LOG_CHAT_ID,
          context: "send-trainer-digest:admin-log",
        });
        const header = renderAdminLogMessage({
          status: sendToAdminOnly ? "test" : "sent",
          chatId: String(peer),
          chatTitle,
          groupNames,
          studentsCount,
          triggerType,
          sentAtIso,
        });
        await client.sendMessage(adminEntity, {
          message: `${header}\n\n--- full message ---\n${message}`,
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
      const adminEntity = await resolveTelegramPeer(client, {
        chatId: ADMIN_LOG_CHAT_ID,
        context: "send-trainer-digest:failure-report",
      });
      await client.sendMessage(adminEntity, {
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

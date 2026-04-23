import { withTelegramClient } from "./_lib/telegram-user-client.js";

const ADMIN_LOG_CHAT_ID = process.env.TELEGRAM_ADMIN_LOG_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID || "";

const renderAdminLogMessage = ({
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
    `trainer_digest_log`,
    `status: ${status}`,
    `trigger: ${triggerType}`,
    `to: ${safeTitle} (${chatId || "no_chat_id"})`,
    `groups: ${groupsLine}`,
    `students: ${Number(studentsCount || 0)}`,
    `at: ${sentAtIso}`,
  ].join("\n");
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    chatId,
    username,
    message,
    chatTitle = "",
    groupNames = [],
    studentsCount = 0,
    triggerType = "manual",
  } = req.body || {};
  const peer = chatId || username;
  const sentAtIso = new Date().toISOString();

  if (!peer || !message) {
    return res.status(400).json({ error: "chatId|username and message are required" });
  }

  try {
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

    return res.status(200).json({
      success: true,
      status: "sent",
      adminLogStatus,
      sentAt: sentAtIso,
    });
  } catch (error) {
    console.error("send-trainer-digest error:", error);

    if (ADMIN_LOG_CHAT_ID) {
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
      } catch (adminError) {
        console.error("trainer digest admin-log failure-report error:", adminError);
      }
    }

    return res.status(500).json({
      error: "Failed to send trainer digest",
      details: String(error?.message || error),
      status: "failed",
      sentAt: sentAtIso,
    });
  }
}

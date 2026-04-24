import { ADMIN_LOG_CHAT_ID, reportTrainerDigestFailureToAdmin, sendTrainerDigestWithAdminLog } from "./_lib/trainer-digest-send.js";

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
    sendToAdminOnly = false,
  } = req.body || {};
  const peer = chatId || username;

  if (!peer || !message) {
    return res.status(400).json({ error: "chatId|username and message are required" });
  }

  try {
    const { adminLogStatus, sentAtIso } = await sendTrainerDigestWithAdminLog({
      peer,
      username,
      message,
      chatTitle,
      groupNames,
      studentsCount,
      triggerType,
      sendToAdminOnly: !!sendToAdminOnly,
    });

    return res.status(200).json({
      success: true,
      status: "sent",
      adminLogStatus,
      adminLogReason: ADMIN_LOG_CHAT_ID ? adminLogStatus : "missing_admin_log_env",
      sentAt: sentAtIso,
    });
  } catch (error) {
    console.error("send-trainer-digest error:", error);
    const sentAtIso = new Date().toISOString();
    await reportTrainerDigestFailureToAdmin({
      peer,
      chatTitle,
      groupNames,
      studentsCount,
      triggerType,
    });

    return res.status(500).json({
      error: "Failed to send trainer digest",
      details: String(error?.message || error),
      status: "failed",
      sentAt: sentAtIso,
    });
  }
}

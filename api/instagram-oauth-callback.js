const APP_REDIRECT_DEFAULT = "/?instagram_oauth=1";

const toStringSafe = (value) => String(value || "").trim();

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#039;");

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const code = toStringSafe(req.query?.code);
  const error = toStringSafe(req.query?.error);
  const errorReason = toStringSafe(req.query?.error_reason);
  const errorDescription = toStringSafe(req.query?.error_description);
  const mode = toStringSafe(req.query?.mode);

  if (mode === "json") {
    if (error) {
      return res.status(200).json({
        success: false,
        error,
        errorReason,
        errorDescription,
      });
    }
    return res.status(200).json({ success: !!code, code: code || "" });
  }

  const appRedirectBase = toStringSafe(process.env.INSTAGRAM_APP_REDIRECT_URI) || APP_REDIRECT_DEFAULT;
  const redirect = new URL(appRedirectBase, "http://local.app");

  if (code) {
    redirect.searchParams.set("ig_oauth_code", code);
    redirect.searchParams.set("ig_oauth_status", "success");
  } else {
    redirect.searchParams.set("ig_oauth_status", "error");
    if (error) redirect.searchParams.set("ig_oauth_error", error);
    if (errorReason) redirect.searchParams.set("ig_oauth_error_reason", errorReason);
    if (errorDescription) redirect.searchParams.set("ig_oauth_error_description", errorDescription);
  }

  const location = `${redirect.pathname}${redirect.search}`;

  if (mode === "html") {
    return res.status(200).send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Instagram OAuth callback</title></head>
  <body style="font-family: Inter, Arial, sans-serif; padding: 24px;">
    <h2>Instagram OAuth callback received</h2>
    <p>Status: <strong>${code ? "success" : "error"}</strong></p>
    ${code ? `<p>Code: <code>${escapeHtml(code)}</code></p>` : `<p>Error: ${escapeHtml(error || "unknown")}</p>`}
    <p>Redirect target: <code>${escapeHtml(location)}</code></p>
  </body>
</html>`);
  }

  return res.redirect(302, location);
}

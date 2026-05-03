export default async function facebookOauthCallback(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const bridgeEndpoint = "/api/facebook-oauth?op=exchange";
  const page = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Facebook OAuth callback</title></head>
  <body style="font-family: Inter, Arial, sans-serif; padding: 24px;">
    <h2>Facebook OAuth callback</h2>
    <p id="status">Processing token fragment…</p>
    <pre id="details" style="white-space: pre-wrap;"></pre>
    <script>
      (async function () {
        var statusEl = document.getElementById("status");
        var detailsEl = document.getElementById("details");
        try {
          var hash = window.location.hash || "";
          var params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
          var accessToken = params.get("access_token") || "";
          var expiresIn = params.get("expires_in") || "";
          var error = params.get("error") || params.get("error_reason") || "";
          var errorDescription = params.get("error_description") || "";
          if (!accessToken) {
            statusEl.textContent = "OAuth failed";
            detailsEl.textContent = JSON.stringify({ error: error || "missing_access_token", error_description: errorDescription }, null, 2);
            return;
          }
          statusEl.textContent = "Token received. Saving connection…";
          var response = await fetch(${JSON.stringify(bridgeEndpoint)}, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: accessToken, expires_in: expiresIn }),
          });
          var payload = await response.json();
          if (!response.ok) throw new Error(payload && (payload.details || payload.error) || "exchange_failed");
          statusEl.textContent = "Facebook connection saved successfully";
          detailsEl.textContent = JSON.stringify(payload, null, 2);
        } catch (err) {
          statusEl.textContent = "Callback processing failed";
          detailsEl.textContent = String(err && (err.message || err));
        }
      })();
    </script>
  </body>
</html>`;

  return res.status(200).send(page);
}

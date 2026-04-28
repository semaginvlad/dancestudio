import handler from "./facebook-oauth.js";

export default async function facebookOauthCallback(req, res) {
  req.query = { ...(req.query || {}), op: "exchange" };
  return handler(req, res);
}

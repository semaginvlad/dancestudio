const BASE = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;

async function ig(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

async function getInsights(id, metrics) {
  try {
    const data = await ig(`/${id}/insights?metric=${metrics}&access_token=${TOKEN}`);
    const obj = {};
    (data.data || []).forEach(m => {
      obj[m.name] = m.values?.[0]?.value ?? m.value ?? 0;
    });
    return obj;
  } catch (e) {
    return { _error: e.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const account = await ig(
      `/${ACCOUNT_ID}?fields=name,username,followers_count,media_count&access_token=${TOKEN}`
    );

    // Fetch media with all available basic fields
    const mediaList = await ig(
      `/${ACCOUNT_ID}/media?fields=id,media_type,caption,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${TOKEN}`
    );

    const media = await Promise.all((mediaList.data || []).map(async (item) => {
      const type = item.media_type; // VIDEO, IMAGE, CAROUSEL_ALBUM, STORY

      let ins = {};

      if (type === "STORY") {
        ins = await getInsights(item.id, "reach,impressions,exits,replies,taps_forward,taps_back");
      } else if (type === "VIDEO") {
        // Try VIDEO metrics — Instagram uses video_views not plays for older videos
        ins = await getInsights(item.id, "impressions,reach,saved,shares,video_views,total_interactions");
        // If that failed, try alternative
        if (ins._error) {
          ins = await getInsights(item.id, "impressions,reach,saved,shares");
        }
      } else if (type === "CAROUSEL_ALBUM") {
        ins = await getInsights(item.id, "impressions,reach,saved,shares,total_interactions");
      } else {
        // IMAGE
        ins = await getInsights(item.id, "impressions,reach,saved,shares,total_interactions");
      }

      return {
        id: item.id,
        media_type: type,
        caption: item.caption || "",
        thumbnail_url: item.thumbnail_url || item.media_url || "",
        permalink: item.permalink || "",
        timestamp: item.timestamp || "",
        // Basic fields (may be 0 if hidden)
        likes: item.like_count || 0,
        comments: item.comments_count || 0,
        // Insights
        impressions: ins.impressions || 0,
        reach: ins.reach || 0,
        saved: ins.saved || 0,
        shares: ins.shares || 0,
        plays: ins.video_views || ins.plays || 0,
        exits: ins.exits || 0,
        replies: ins.replies || 0,
        taps_forward: ins.taps_forward || 0,
        taps_back: ins.taps_back || 0,
        total_interactions: ins.total_interactions || 0,
        _insightsError: ins._error || null,
      };
    }));

    // Daily account insights
    const until = Math.floor(Date.now() / 1000);
    const since = until - 30 * 86400;
    let daily = {};

    try {
      const dailyIns = await ig(
        `/${ACCOUNT_ID}/insights?metric=reach,impressions,profile_views,website_clicks&period=day&since=${since}&until=${until}&access_token=${TOKEN}`
      );
      (dailyIns.data || []).forEach(m => {
        daily[m.name] = (m.values || []).map(v => ({
          date: v.end_time?.slice(0, 10) || "",
          value: v.value || 0,
        }));
      });
    } catch (e) {
      daily._error = e.message;
    }

    // Check first item's insights error for debugging
    const firstError = media[0]?._insightsError;

    res.status(200).json({
      account,
      media,
      daily,
      debug: {
        mediaCount: media.length,
        firstInsightsError: firstError,
        firstItemLikes: media[0]?.likes,
        firstItemReach: media[0]?.reach,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

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

    // Витягуємо базові дані (вони доступні ЗАВЖДИ, навіть для старих постів)
    const mediaList = await ig(
      `/${ACCOUNT_ID}/media?fields=id,media_type,caption,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${TOKEN}`
    );

    const media = await Promise.all((mediaList.data || []).map(async (item) => {
      const type = item.media_type;

      let ins = {};

      // Спроба отримати глибокі Insights
      if (type === "STORY") {
        ins = await getInsights(item.id, "reach,impressions,exits,replies,taps_forward,taps_back");
      } else if (type === "VIDEO") {
        ins = await getInsights(item.id, "impressions,reach,saved,shares,video_views,total_interactions");
        if (ins._error) {
          ins = await getInsights(item.id, "impressions,reach,saved,shares");
        }
      } else {
        ins = await getInsights(item.id, "impressions,reach,saved,shares,total_interactions");
      }

      return {
        id: item.id,
        media_type: type,
        caption: item.caption || "",
        thumbnail_url: item.thumbnail_url || item.media_url || "",
        permalink: item.permalink || "",
        timestamp: item.timestamp || "",
        // Гарантовано забираємо лайки та коменти з базового запиту
        likes: item.like_count || 0,
        comments: item.comments_count || 0,
        // Insights (можуть бути 0 для старих постів)
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

    res.status(200).json({
      account,
      media,
      daily
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

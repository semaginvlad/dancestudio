const BASE = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;

async function ig(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    // 1. Account info
    const account = await ig(`/${ACCOUNT_ID}?fields=name,username,followers_count,media_count,profile_picture_url&access_token=${TOKEN}`);

    // 2. Media list (last 50)
    const mediaList = await ig(`/${ACCOUNT_ID}/media?fields=id,media_type,caption,thumbnail_url,media_url,permalink,timestamp&limit=50&access_token=${TOKEN}`);

    // 3. Insights per post
    const media = await Promise.all((mediaList.data || []).map(async (item) => {
      try {
        const isStory = item.media_type === "STORY";
        const isReel = item.media_type === "REELS" || item.media_type === "VIDEO";

        let metrics;
        if (isStory) {
          metrics = "reach,impressions,exits,replies,taps_forward,taps_back";
        } else if (isReel) {
          metrics = "reach,impressions,saved,shares,likes,comments,plays";
        } else {
          metrics = "reach,impressions,saved,shares,likes,comments";
        }

        const ins = await ig(`/${item.id}/insights?metric=${metrics}&access_token=${TOKEN}`);
        const insObj = {};
        (ins.data || []).forEach(m => { insObj[m.name] = m.values?.[0]?.value ?? m.value ?? 0; });

        return { ...item, ...insObj };
      } catch {
        return item;
      }
    }));

    // 4. Account daily insights (last 30 days)
    const until = Math.floor(Date.now() / 1000);
    const since = until - 30 * 86400;
    const dailyMetrics = "reach,impressions,profile_views,website_clicks,follower_count";

    let daily = {};
    try {
      const dailyIns = await ig(`/${ACCOUNT_ID}/insights?metric=${dailyMetrics}&period=day&since=${since}&until=${until}&access_token=${TOKEN}`);
      (dailyIns.data || []).forEach(m => {
        daily[m.name] = (m.values || []).map(v => ({
          date: v.end_time?.slice(0, 10) || "",
          value: v.value || 0,
        }));
      });
    } catch (e) {
      console.error("Daily insights error:", e.message);
    }

    res.status(200).json({ account, media, daily });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

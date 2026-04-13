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
    // 1. Account info
    const account = await ig(
      `/${ACCOUNT_ID}?fields=name,username,followers_count,media_count,biography,website&access_token=${TOKEN}`
    );

    // 2. Media list
    const mediaList = await ig(
      `/${ACCOUNT_ID}/media?fields=id,media_type,caption,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${TOKEN}`
    );

    // 3. Insights per post
    const media = await Promise.all((mediaList.data || []).map(async (item) => {
      const type = item.media_type;
      let ins = {};

      if (type === "STORY") {
        ins = await getInsights(item.id, "reach,exits,replies,taps_forward,taps_back");
      } else {
        ins = await getInsights(item.id, "reach,saved,shares,likes,comments,total_interactions");
        if (ins._error) {
          ins = await getInsights(item.id, "reach,saved,shares");
        }
      }

      return {
        id: item.id,
        media_type: type,
        caption: item.caption || "",
        thumbnail_url: item.thumbnail_url || item.media_url || "",
        permalink: item.permalink || "",
        timestamp: item.timestamp || "",
        likes: ins.likes ?? item.like_count ?? 0,
        comments: ins.comments ?? item.comments_count ?? 0,
        reach: ins.reach || 0,
        saved: ins.saved || 0,
        shares: ins.shares || 0,
        total_interactions: ins.total_interactions || 0,
        exits: ins.exits || 0,
        replies: ins.replies || 0,
        taps_forward: ins.taps_forward || 0,
        taps_back: ins.taps_back || 0,
      };
    }));

    // 4. Daily account insights (30 days)
    const until = Math.floor(Date.now() / 1000);
    const since = until - 30 * 86400;
    let daily = {};

    try {
      const dailyIns = await ig(
        `/${ACCOUNT_ID}/insights?metric=reach,profile_views,website_clicks&period=day&since=${since}&until=${until}&access_token=${TOKEN}`
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

    // 5. Follower count daily
    try {
      const fc = await ig(
        `/${ACCOUNT_ID}/insights?metric=follower_count&period=day&since=${since}&until=${until}&access_token=${TOKEN}`
      );
      const fcData = fc.data?.find(m => m.name === "follower_count");
      if (fcData) {
        daily.follower_count = (fcData.values || []).map(v => ({
          date: v.end_time?.slice(0, 10) || "",
          value: v.value || 0,
        }));
      }
    } catch (e) {}

    // 6. Demographics — age/gender/country breakdown
    let demographics = {};
    try {
      const demoRes = await ig(
        `/${ACCOUNT_ID}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age,gender,country&access_token=${TOKEN}`
      );
      const demoData = demoRes.data?.[0]?.total_value?.breakdowns || [];
      
      demoData.forEach(breakdown => {
        const dim = breakdown.dimension_keys?.[0];
        if (!dim) return;
        demographics[dim] = {};
        (breakdown.results || []).forEach(r => {
          const key = r.dimension_values?.[0];
          if (key) demographics[dim][key] = r.value;
        });
      });
    } catch (e) {
      demographics._error = e.message;
    }

    // 7. Reached audience demographics
    try {
      const reachedRes = await ig(
        `/${ACCOUNT_ID}/insights?metric=reached_audience_demographics&period=lifetime&metric_type=total_value&breakdown=age,gender,country&since=${since}&until=${until}&access_token=${TOKEN}`
      );
      const reachedData = reachedRes.data?.[0]?.total_value?.breakdowns || [];
      demographics.reached = {};
      reachedData.forEach(breakdown => {
        const dim = breakdown.dimension_keys?.[0];
        if (!dim) return;
        demographics.reached[dim] = {};
        (breakdown.results || []).forEach(r => {
          const key = r.dimension_values?.[0];
          if (key) demographics.reached[dim][key] = r.value;
        });
      });
    } catch (e) {}

    res.status(200).json({ account, media, daily, demographics });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

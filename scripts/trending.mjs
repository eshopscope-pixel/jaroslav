// What is working right now on big Instagram accounts (official Business Discovery API, public data only)
//   node scripts/trending.mjs [account ...]      default: accounts from data/watchlist.json
// For every account: recent posts ranked by how far each beat that account's own median (likes + 3 x comments).
// Prints the top posts across all accounts with caption, type, date and link, so the topic and format can be adapted.
import fs from "node:fs";
import { env, loadDotEnv } from "./lib.mjs";

loadDotEnv();
const GRAPH = `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || "v23.0"}`;
const args = process.argv.slice(2);
const accounts = args.length ? args : JSON.parse(fs.readFileSync("data/watchlist.json", "utf8")).accounts;
const DAYS = +(process.env.TRENDING_DAYS || 45);

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const rows = [];
for (const username of accounts) {
  const fields = `business_discovery.username(${username}){username,followers_count,media.limit(40){caption,media_type,like_count,comments_count,timestamp,permalink}}`;
  const url = `${GRAPH}/${env("IG_USER_ID")}?fields=${encodeURIComponent(fields)}&access_token=${env("IG_ACCESS_TOKEN")}`;
  const j = await (await fetch(url)).json();
  if (j.error) { console.error(`${username}: ${j.error.message}`); continue; }
  const b = j.business_discovery;
  const media = (b.media?.data || []).filter(m => m.like_count != null);
  const score = m => (m.like_count || 0) + 3 * (m.comments_count || 0);
  const med = median(media.map(score)) || 1;
  const since = Date.now() - DAYS * 864e5;
  for (const m of media) {
    if (new Date(m.timestamp) < since) continue;
    rows.push({
      account: b.username, followers: b.followers_count, type: m.media_type,
      likes: m.like_count, comments: m.comments_count, vsMedian: +(score(m) / med).toFixed(2),
      date: m.timestamp.slice(0, 10), link: m.permalink,
      caption: (m.caption || "").replace(/\s+/g, " ").slice(0, 280),
    });
  }
}
rows.sort((a, b) => b.vsMedian - a.vsMedian || b.likes - a.likes);
console.log(JSON.stringify(rows.slice(0, +(process.env.TRENDING_TOP || 25)), null, 2));

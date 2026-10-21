// Publish carousels to Instagram through the Graph API
//   node scripts/publish.mjs --due              publish every previewed post whose review window passed without STOP
//   node scripts/publish.mjs posts/<id> [--now] publish one post (--now skips the review window)
//   add --dry-run to print what would happen without calling Instagram
//
// Instagram downloads the slides from PUBLIC_BASE_URL, so the slides must be pushed first.
import fs from "node:fs";
import path from "node:path";
import { env, loadDotEnv, readPost, writePost, slideFiles, appendHistory, sleep } from "./lib.mjs";
import { stopped, say } from "./telegram.mjs";

loadDotEnv();
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const NOW = args.includes("--now");
const REVIEW_MIN = +(process.env.REVIEW_MINUTES || 60);
const GRAPH = `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || "v23.0"}`;

async function graph(p, params, method = "POST") {
  const q = new URLSearchParams({ ...params, access_token: env("IG_ACCESS_TOKEN") });
  const res = await fetch(method === "GET" ? `${GRAPH}/${p}?${q}` : `${GRAPH}/${p}`, method === "GET" ? {} : { method, body: q });
  const j = await res.json();
  if (j.error) throw new Error(`Graph ${p}: ${j.error.message}`);
  return j;
}

async function waitReady(id) {
  for (let i = 0; i < 30; i++) {
    const { status_code } = await graph(id, { fields: "status_code" }, "GET");
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`container ${id} ${status_code}`);
    await sleep(4000);
  }
  throw new Error(`container ${id} not ready in time`);
}

async function publish(dir) {
  const post = readPost(dir);
  const base = env("PUBLIC_BASE_URL").replace(/\/$/, "");
  const urls = slideFiles(dir).slice(0, 10).map(f => `${base}/${path.relative(process.cwd(), f).split(path.sep).join("/")}`);
  if (urls.length < 2) throw new Error("a carousel needs 2-10 slides");

  if (DRY) { console.log(`[dry-run] ${post.id}: ${urls.length} slides\n  ${urls.join("\n  ")}\n  caption ${(post.caption || "").length} chars`); return; }

  // every slide URL must already be reachable, or Instagram rejects the container
  for (const u of urls) if (!(await fetch(u, { method: "HEAD" })).ok) throw new Error(`slide not public yet: ${u}`);

  const user = env("IG_USER_ID");
  const children = [];
  for (const [i, u] of urls.entries()) {
    const params = { image_url: u, is_carousel_item: "true" };
    if (i === 0 && post.alt) params.alt_text = post.alt;
    let c;
    try { c = await graph(`${user}/media`, params); }
    catch (e) { if (!params.alt_text) throw e; delete params.alt_text; c = await graph(`${user}/media`, params); }
    children.push(c.id);
  }
  for (const id of children) await waitReady(id);

  const carousel = await graph(`${user}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption || "" });
  await waitReady(carousel.id);
  const { id } = await graph(`${user}/media_publish`, { creation_id: carousel.id });
  const { permalink } = await graph(id, { fields: "permalink" }, "GET");

  Object.assign(post, { status: "published", publishedAt: new Date().toISOString(), mediaId: id, permalink });
  writePost(dir, post);
  appendHistory({ id: post.id, topic: post.topic, pillar: post.pillar, template: post.template, palette: post.palette, publishedAt: post.publishedAt, permalink });
  await say(`Zveřejněno: ${post.topic}\n${permalink}`);
  console.log("published", post.id, permalink);
}

async function due() {
  const root = path.resolve("posts");
  // oldest preview first, and at most one post goes live per run
  const queue = fs.readdirSync(root)
    .map(d => path.join("posts", d))
    .filter(dir => fs.existsSync(path.join(dir, "post.json")))
    .map(dir => ({ dir, post: readPost(dir) }))
    .filter(x => x.post.status === "previewed")
    .sort((a, b) => a.post.previewAt - b.post.previewAt);
  for (const { dir, post } of queue) {
    const age = (Date.now() / 1000 - post.previewAt) / 60;
    if (age < REVIEW_MIN - 5) { console.log(`wait ${post.id}: ${Math.round(age)} of ${REVIEW_MIN} min`); continue; }
    if (await stopped(post)) {
      post.status = "stopped"; writePost(dir, post);
      await say(`Zrušeno, nezveřejním: ${post.topic}`);
      console.log("stopped", post.id);
      continue;
    }
    try { await publish(dir); return; }
    catch (e) {
      post.status = "failed"; post.error = e.message; writePost(dir, post);
      await say(`Zveřejnění selhalo: ${post.topic}\n${e.message}`).catch(() => {});
      console.error("failed", post.id, e.message);
    }
  }
}

if (args.includes("--due")) await due();
else {
  const dir = args.find(a => !a.startsWith("--"));
  if (!dir) { console.error("usage: publish.mjs --due | posts/<id> [--now] [--dry-run]"); process.exit(1); }
  const post = readPost(dir);
  if (!NOW && !DRY && post.status !== "previewed") throw new Error("post was not previewed; use --now to skip review");
  await publish(dir);
}

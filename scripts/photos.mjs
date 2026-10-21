// Find candidate photos through the official Pexels / Unsplash APIs (free keys) and build a contact sheet to pick from.
//   node scripts/photos.mjs "web design aesthetic"            -> assets/photos/cand/<slug>/1..8.jpg + sheet.jpg
//   node scripts/photos.mjs --take "<slug>" 3 <name>           -> copies candidate 3 to assets/photos/<name>.jpg
// The query must always end with "aesthetic" (CONTENT.md, section 8).
import fs from "node:fs";
import path from "node:path";
import { loadDotEnv } from "./lib.mjs";

loadDotEnv();
const args = process.argv.slice(2);
const slugify = q => q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

if (args[0] === "--take") {
  const [, slug, n, name] = args;
  const src = path.join("assets/photos/cand", slug, `${n}.jpg`);
  const credits = JSON.parse(fs.readFileSync(path.join("assets/photos/cand", slug, "credits.json"), "utf8"));
  fs.copyFileSync(src, path.join("assets/photos", `${name}.jpg`));
  fs.writeFileSync(path.join("assets/photos", `${name}.json`), JSON.stringify(credits[+n - 1], null, 2));
  console.log(`assets/photos/${name}.jpg`);
  process.exit(0);
}

let q = args.join(" ").trim();
if (!q) { console.error('usage: photos.mjs "<topic> aesthetic"'); process.exit(1); }
if (!/aesthetic$/i.test(q)) q += " aesthetic";

async function pexels() {
  if (!process.env.PEXELS_API_KEY) return [];
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=8`, { headers: { Authorization: process.env.PEXELS_API_KEY } });
  const j = await r.json();
  return (j.photos || []).map(p => ({ url: `${p.src.original}?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1350`, source: "pexels", page: p.url, author: p.photographer }));
}
async function unsplash() {
  if (!process.env.UNSPLASH_ACCESS_KEY) return [];
  const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=portrait&per_page=8&content_filter=high`, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } });
  if (r.status === 401 || r.status === 403) {
    // key revoked or blocked: tell Petr through Jaroslav so we can switch the photo source together
    const { say } = await import("./telegram.mjs");
    await say(`Jaroslav: Unsplash mi zablokoval přístup k fotkám (HTTP ${r.status}). Dnešní příspěvky vytvořím z knihovny, ale prosím, domluvme se na jiném zdroji fotek.`).catch(() => {});
    return [];
  }
  const j = await r.json();
  return (j.results || []).filter(p => !p.premium && !p.plus).map(p => ({ url: `${p.urls.raw}&w=1080&h=1350&fit=crop&crop=entropy&q=82&fm=jpg`, source: "unsplash", page: p.links.html, author: p.user?.name, download: p.links.download_location }));
}

const found = [...await unsplash(), ...await pexels()].slice(0, 8);
if (!found.length) { console.error("no results (set UNSPLASH_ACCESS_KEY or PEXELS_API_KEY)"); process.exit(1); }

const dir = path.join("assets/photos/cand", slugify(q));
fs.mkdirSync(dir, { recursive: true });
for (const [i, p] of found.entries()) {
  const buf = Buffer.from(await (await fetch(p.url)).arrayBuffer());
  fs.writeFileSync(path.join(dir, `${i + 1}.jpg`), buf);
  // Unsplash API guidelines ask to ping the download endpoint when a photo is used
  if (p.download) fetch(`${p.download}&client_id=${process.env.UNSPLASH_ACCESS_KEY}`).catch(() => {});
}
fs.writeFileSync(path.join(dir, "credits.json"), JSON.stringify(found, null, 2));

// contact sheet so the agent can look at all candidates in one image
const { default: puppeteer } = await import("puppeteer");
const browser = await puppeteer.launch({ args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1240, height: 820 });
const cells = found.map((_, i) => `<div style="position:relative"><img src="file://${path.resolve(dir, `${i + 1}.jpg`)}" style="width:300px;height:375px;object-fit:cover;display:block"><b style="position:absolute;left:8px;top:6px;background:#000;color:#fff;font:700 28px sans-serif;padding:2px 10px">${i + 1}</b></div>`).join("");
const sheetHtml = path.resolve(dir, "sheet.html");
fs.writeFileSync(sheetHtml, `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(4,300px);gap:10px;padding:10px">${cells}</body>`);
await page.goto(`file://${sheetHtml}`, { waitUntil: "load" });
await page.screenshot({ path: path.join(dir, "sheet.jpg"), type: "jpeg", quality: 80, fullPage: true });
await browser.close();
console.log(path.join(dir, "sheet.jpg"));

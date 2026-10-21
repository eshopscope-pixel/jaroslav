// Render posts/<id>/post.json into posts/<id>/slides/01.jpg … NN.jpg (1080x1350, JPEG for the Instagram API)
// usage: node scripts/render.mjs posts/<id>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const dir = process.argv[2];
if (!dir) { console.error("usage: node scripts/render.mjs posts/<id>"); process.exit(1); }
const post = JSON.parse(fs.readFileSync(path.join(dir, "post.json"), "utf8"));
const out = path.join(dir, "slides");
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  args: ["--allow-file-access-from-files", "--no-sandbox", "--hide-scrollbars"],
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = await browser.newPage();
page.on("pageerror", e => console.error("page error:", e.message));
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(p => { window.POST = p; }, post);

const tpl = pathToFileURL(path.resolve(`templates/${post.template || "carousel"}.html`)).href;
for (let i = 1; i <= post.slides.length; i++) {
  await page.goto(`${tpl}?s=${i}`, { waitUntil: "load" });
  await page.waitForSelector("body[data-ready]");
  await page.waitForNetworkIdle({ idleTime: 300 });
  const file = path.join(out, String(i).padStart(2, "0") + ".jpg");
  await page.screenshot({ path: file, type: "jpeg", quality: 92 });
  console.log("rendered", file);
}
await browser.close();

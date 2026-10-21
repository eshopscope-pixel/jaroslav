// Telegram preview + STOP check
//   node scripts/telegram.mjs preview posts/<id>   send slides + caption, start the review window
//   node scripts/telegram.mjs check posts/<id>     print "stopped" or "ok"
//   node scripts/telegram.mjs say "text"           plain message
import fs from "node:fs";
import path from "node:path";
import { env, loadDotEnv, readPost, writePost, slideFiles } from "./lib.mjs";

loadDotEnv();
const api = method => `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`;
const CHAT = () => env("TELEGRAM_CHAT_ID");
const REVIEW_MIN = +(process.env.REVIEW_MINUTES || 60);

async function call(method, body) {
  const res = await fetch(api(method), body instanceof FormData ? { method: "POST", body } : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}

export const say = text => call("sendMessage", { chat_id: CHAT(), text, disable_web_page_preview: true });

export async function preview(dir) {
  const post = readPost(dir);
  const files = slideFiles(dir).slice(0, 10);
  const form = new FormData();
  form.append("chat_id", CHAT());
  form.append("media", JSON.stringify(files.map((f, i) => ({ type: "photo", media: `attach://p${i}` }))));
  files.forEach((f, i) => form.append(`p${i}`, new Blob([fs.readFileSync(f)], { type: "image/jpeg" }), path.basename(f)));
  await call("sendMediaGroup", form);

  const at = new Date(Date.now() + REVIEW_MIN * 60e3).toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });
  await say(`Nový příspěvek: ${post.topic}\n\n${post.caption || "(bez popisku)"}\n\n— — —\nZveřejní se kolem ${at}. Když ho nechceš, odpověz STOP.`);

  post.status = "previewed";
  post.previewAt = Math.floor(Date.now() / 1000);
  writePost(dir, post);
}

// any "STOP" message in the chat after the preview cancels the post
export async function stopped(post) {
  const updates = await call("getUpdates", { allowed_updates: ["message"], timeout: 0 });
  return updates.some(u => u.message && String(u.message.chat.id) === String(CHAT())
    && u.message.date >= post.previewAt && /^\s*stop\b/i.test(u.message.text || ""));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "preview") await preview(arg);
  else if (cmd === "check") console.log((await stopped(readPost(arg))) ? "stopped" : "ok");
  else if (cmd === "say") await say(arg);
  else { console.error("usage: telegram.mjs preview|check <dir> | say <text>"); process.exit(1); }
}

// Shared helpers: env, post.json state, history
import fs from "node:fs";
import path from "node:path";

export function env(name, { optional = false } = {}) {
  const v = process.env[name];
  if (!v && !optional) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

// local runs can keep secrets in .env; the cloud environment sets real env vars
export function loadDotEnv() {
  const f = path.resolve(".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const readPost = dir => JSON.parse(fs.readFileSync(path.join(dir, "post.json"), "utf8"));
export const writePost = (dir, post) => fs.writeFileSync(path.join(dir, "post.json"), JSON.stringify(post, null, 2) + "\n");

export function slideFiles(dir) {
  const d = path.join(dir, "slides");
  return fs.readdirSync(d).filter(f => /^\d+\.jpg$/.test(f)).sort().map(f => path.join(d, f));
}

const HISTORY = path.resolve("posts/history.json");
export const readHistory = () => (fs.existsSync(HISTORY) ? JSON.parse(fs.readFileSync(HISTORY, "utf8")) : []);
export function appendHistory(entry) {
  const h = readHistory();
  h.push(entry);
  fs.writeFileSync(HISTORY, JSON.stringify(h, null, 2) + "\n");
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

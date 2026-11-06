// Scarica notizie e curiosità da fonti pubbliche e scrive data/news.json
import { writeFile } from "node:fs/promises";

// Per aggiungere una fonte: una riga con ambito, nome e indirizzo del feed RSS.
const FEEDS = [
  { topic: "Mondo", source: "ANSA", url: "https://www.ansa.it/sito/ansait_rss.xml" },
  { topic: "Mondo", source: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { topic: "Scienza", source: "ANSA Scienza", url: "https://www.ansa.it/sito/notizie/scienza/scienza_rss.xml" },
  { topic: "Scienza", source: "ScienceDaily", url: "https://www.sciencedaily.com/rss/all.xml" },
  { topic: "Tecnologia", source: "ANSA Tecnologia", url: "https://www.ansa.it/sito/notizie/tecnologia/tecnologia_rss.xml" },
  { topic: "Tecnologia", source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { topic: "Elettronica", source: "Hackaday", url: "https://hackaday.com/blog/feed/" },
  { topic: "Elettronica", source: "IEEE Spectrum", url: "https://spectrum.ieee.org/feeds/feed.rss" },
  { topic: "Spazio", source: "NASA", url: "https://www.nasa.gov/news-release/feed/" },
  { topic: "Spazio", source: "Space.com", url: "https://www.space.com/feeds/all" },
  { topic: "Economia", source: "ANSA Economia", url: "https://www.ansa.it/sito/notizie/economia/economia_rss.xml" },
  { topic: "Economia", source: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { topic: "Salute", source: "ANSA Salute", url: "https://www.ansa.it/sito/notizie/salute/salute_rss.xml" },
  { topic: "Salute", source: "BBC Health", url: "https://feeds.bbci.co.uk/news/health/rss.xml" },
  { topic: "Storia", source: "Smithsonian", url: "https://www.smithsonianmag.com/rss/history/" },
  { topic: "Natura", source: "Smithsonian", url: "https://www.smithsonianmag.com/rss/science-nature/" },
  { topic: "Arte e cultura", source: "ANSA Cultura", url: "https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml" },
  { topic: "Sport", source: "ANSA Sport", url: "https://www.ansa.it/sito/notizie/sport/sport_rss.xml" },
  { topic: "Musica", source: "Pitchfork", url: "https://pitchfork.com/feed/feed-news/rss" },
];

const UA = { "User-Agent": "Mozilla/5.0 (compatible; MondoOggi/1.0)" };
const get = async (url) => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r;
};

const ent = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const cdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
const text = (s = "") => ent(ent(cdata(s)).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (b, n) => (b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, "i")) || [])[1] || "";
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + "…");

function parseFeed(xml, f) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) || [];
  return blocks.slice(0, 10).map((b) => {
    const title = text(tag(b, "title"));
    const link = text(tag(b, "link")) || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const body = text(tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content"));
    const d = new Date(text(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date")));
    return {
      topic: f.topic, type: "notizia", source: f.source, url: link, title,
      summary: cut(body || title, 200), detail: cut(body, 700) || title,
      date: isNaN(d) ? new Date().toISOString() : d.toISOString(),
    };
  }).filter((i) => i.title && i.url);
}

async function wikipedia() {
  const d = new Date();
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), dd = String(d.getUTCDate()).padStart(2, "0");
  const j = await (await get(`https://it.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${dd}`)).json();
  const now = new Date().toISOString(), out = [];
  if (j.tfa) out.push({ topic: "Sapere", type: "curiosità", source: "Wikipedia", url: j.tfa.content_urls.desktop.page,
    title: j.tfa.titles.normalized, summary: cut(j.tfa.extract, 200), detail: cut(j.tfa.extract, 900), date: now });
  (j.onthisday || []).filter((_, i) => i % 3 === 0).slice(0, 6).forEach((e) => {
    const p = e.pages && e.pages[0];
    if (p) out.push({ topic: "Storia", type: "curiosità", source: "Wikipedia · Accadde oggi", url: p.content_urls.desktop.page,
      title: `${e.year}: ${cut(e.text, 90)}`, summary: e.text, detail: `${e.text} — ${p.extract || ""}`.trim(), date: now });
  });
  return out;
}

async function apod() {
  const a = await (await get("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY")).json();
  return [{ topic: "Spazio", type: "curiosità", source: "NASA · Foto del giorno", url: "https://apod.nasa.gov/apod/astropix.html",
    title: a.title, summary: cut(a.explanation, 200), detail: cut(a.explanation, 900), date: new Date().toISOString() }];
}

const jobs = [
  ...FEEDS.map((f) => get(f.url).then((r) => r.text()).then((x) => parseFeed(x, f))),
  wikipedia(), apod(),
];
const res = await Promise.allSettled(jobs);
const names = [...FEEDS.map((f) => f.source + " (" + f.topic + ")"), "Wikipedia", "NASA APOD"];
let items = [];
res.forEach((r, i) => {
  if (r.status === "fulfilled") items.push(...r.value);
  else console.warn("Fonte non raggiungibile:", names[i], "-", r.reason && r.reason.message);
});
if (!items.length) { console.error("Nessuna fonte raggiungibile: lascio il file com'è."); process.exit(1); }

const seen = new Set();
items = items.filter((i) => !seen.has(i.url) && seen.add(i.url))
  .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 400);
await writeFile("data/news.json", JSON.stringify({ updated: new Date().toISOString(), items }, null, 1));
console.log(`Scritte ${items.length} schede.`);

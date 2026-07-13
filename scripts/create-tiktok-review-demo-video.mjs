import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";

const requireFromRotravel = createRequire("/home/server/Trevoro/package.json");
const puppeteer = requireFromRotravel("puppeteer");
const ffmpegPath = requireFromRotravel("ffmpeg-static");

const OUT_DIR = "/home/server/Nexora/utile/tiktok-demo";
const FRAME_DIR = path.join(OUT_DIR, "frames");
const HTML_PATH = path.join(OUT_DIR, "trevoro-tiktok-review-demo.html");
const VIDEO_PATH = path.join(OUT_DIR, "trevoro-tiktok-review-demo.mp4");

fs.mkdirSync(FRAME_DIR, { recursive: true });
for (const file of fs.readdirSync(FRAME_DIR)) fs.unlinkSync(path.join(FRAME_DIR, file));

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Trevoro TikTok Integration Demo</title>
  <style>
    :root {
      --teal:#0f766e; --dark:#14211f; --coral:#f36f56; --muted:#64748b;
      --line:#dbe5ea; --bg:#f6faf9; --panel:#ffffff;
    }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, Arial, sans-serif; background:var(--bg); color:var(--dark); }
    .stage { width:1280px; height:720px; position:relative; overflow:hidden; background:linear-gradient(135deg,#f7fbfa,#eef7f5); }
    .topbar { height:64px; display:flex; align-items:center; justify-content:space-between; padding:0 48px; background:#fff; border-bottom:1px solid var(--line); }
    .brand { display:flex; align-items:center; gap:12px; font-weight:900; }
    .logo { width:42px; height:42px; border-radius:8px; display:grid; place-items:center; background:var(--teal); color:#fff; box-shadow:0 12px 26px rgba(15,118,110,.25); }
    .nav { display:flex; gap:18px; color:#475569; font-size:14px; font-weight:800; }
    .slide { position:absolute; inset:64px 0 0 0; padding:44px 64px; opacity:0; transform:translateY(16px); transition:opacity .35s ease, transform .35s ease; }
    .slide.active { opacity:1; transform:translateY(0); }
    h1 { font-size:48px; line-height:1.04; margin:0; letter-spacing:0; }
    h2 { margin:0; font-size:30px; }
    p { font-size:18px; line-height:1.55; color:#475569; margin:14px 0 0; }
    .grid { display:grid; gap:24px; }
    .cols { grid-template-columns:1.05fr .95fr; align-items:stretch; }
    .card { background:#fff; border:1px solid var(--line); border-radius:8px; padding:24px; box-shadow:0 20px 50px rgba(15,23,42,.08); }
    .hero-img { min-height:410px; border-radius:8px; overflow:hidden; background:
      linear-gradient(90deg, rgba(8,28,30,.86), rgba(8,28,30,.28)),
      url('https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=1600&q=85') center/cover; padding:54px; color:#fff; display:flex; flex-direction:column; justify-content:center; }
    .hero-img p { color:rgba(255,255,255,.9); max-width:620px; }
    .pill { display:inline-flex; align-items:center; gap:8px; min-height:32px; width:max-content; border-radius:999px; padding:7px 12px; background:#e7f8f5; color:var(--teal); font-size:13px; font-weight:900; }
    .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:44px; border-radius:8px; padding:0 16px; font-size:14px; font-weight:900; border:1px solid var(--line); background:#fff; color:var(--dark); }
    .btn.primary { border:0; background:var(--teal); color:#fff; }
    .btn.coral { border:0; background:var(--coral); color:#fff; }
    .sidebar { width:240px; background:#0f172a; color:#cbd5e1; padding:22px; border-radius:8px; }
    .menu { display:grid; gap:8px; margin-top:18px; }
    .menu div { padding:11px 12px; border-radius:8px; font-size:14px; font-weight:800; }
    .menu .active { background:#14b8a6; color:#042f2e; }
    .app { display:grid; grid-template-columns:240px 1fr; gap:18px; }
    .table { width:100%; border-collapse:collapse; font-size:13px; margin-top:16px; }
    th { color:#64748b; text-align:left; font-size:11px; text-transform:uppercase; padding:10px; border-bottom:1px solid var(--line); }
    td { padding:12px 10px; border-bottom:1px solid #edf2f7; vertical-align:top; font-weight:700; }
    .status { display:inline-flex; border-radius:999px; padding:5px 10px; font-size:12px; font-weight:900; }
    .ready { background:#ecfdf5; color:#047857; }
    .manual { background:#fff7ed; color:#c2410c; }
    .oauth { width:480px; margin:20px auto 0; border:1px solid var(--line); border-radius:10px; background:#fff; box-shadow:0 22px 80px rgba(15,23,42,.18); padding:28px; }
    .phone { width:260px; height:462px; border-radius:28px; background:#101010; padding:14px; margin:auto; box-shadow:0 28px 80px rgba(15,23,42,.32); }
    .phone-screen { height:100%; border-radius:20px; background:linear-gradient(180deg,#0f766e,#111827); color:#fff; padding:22px; display:flex; flex-direction:column; justify-content:flex-end; }
    .caption { background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.18); border-radius:8px; padding:14px; font-size:14px; line-height:1.45; }
    .footer-note { position:absolute; left:64px; right:64px; bottom:26px; color:#64748b; font-size:13px; font-weight:800; }
  </style>
</head>
<body>
  <div class="stage">
    <div class="topbar">
      <div class="brand"><span class="logo">TR</span><span>Trevoro</span></div>
      <div class="nav"><span>www.trevoro.ro</span><span>Terms</span><span>Privacy</span><span>Nexora Travel</span></div>
    </div>

    <section class="slide active" data-title="Public website">
      <div class="grid cols">
        <div class="hero-img">
          <span class="pill">Summer travel in Romania</span>
          <h1 style="margin-top:20px">Search verified stays in Romania.</h1>
          <p>Trevoro lists hotels, guesthouses, cabins and short-stay apartments. Properties are managed in Nexora Travel.</p>
          <div style="margin-top:24px;display:flex;gap:12px"><span class="btn primary">Search stays</span><span class="btn">List property</span></div>
        </div>
        <div class="card">
          <span class="pill">Verified domain</span>
          <h2 style="margin-top:16px">Website used for the TikTok app</h2>
          <p>Terms of Service and Privacy Policy are public on the same verified domain.</p>
          <div style="margin-top:22px;display:grid;gap:12px">
            <div class="card" style="padding:14px">https://www.trevoro.ro/terms</div>
            <div class="card" style="padding:14px">https://www.trevoro.ro/privacy</div>
          </div>
        </div>
      </div>
      <div class="footer-note">Step 1: public website and verified legal pages.</div>
    </section>

    <section class="slide">
      <div class="app">
        <aside class="sidebar"><div class="brand"><span class="logo">NX</span><span>Nexora</span></div><div class="menu"><div>Travel Dashboard</div><div>Properties</div><div>Content Factory</div><div class="active">Social Posts</div><div>Campaigns</div></div></aside>
        <div class="card">
          <div style="display:flex;justify-content:space-between;gap:20px;align-items:center">
            <div><span class="pill">Nexora Travel</span><h1 style="font-size:38px;margin-top:12px">Social Posts</h1><p>Drafts, review queue and connected social accounts for Trevoro Romania.</p></div>
            <span class="btn primary">Connect TikTok</span>
          </div>
          <div class="grid cols" style="margin-top:24px">
            <div class="card"><h2>TikTok account</h2><p>@trevororomania · draft/manual mode until Direct Post approval</p><div style="margin-top:16px"><span class="status manual">setup_required</span></div></div>
            <div class="card"><h2>Facebook account</h2><p>Trevoro Romania · Meta Graph API after Page token approval</p><div style="margin-top:16px"><span class="status manual">setup_required</span></div></div>
          </div>
        </div>
      </div>
      <div class="footer-note">Step 2: admin opens Travel > Social Posts and starts TikTok connection.</div>
    </section>

    <section class="slide">
      <div class="oauth">
        <div style="text-align:center"><span class="pill">TikTok OAuth sandbox</span><h1 style="font-size:34px;margin-top:14px">Authorize Trevoro Nexora</h1><p>Connect @trevororomania so Nexora Travel can prepare and publish approved travel content.</p></div>
        <div class="card" style="margin-top:20px;padding:16px">
          <b>Requested scopes</b>
          <p style="font-size:15px;margin-top:8px">Login Kit, Content Posting API / Direct Post for approved posts only.</p>
        </div>
        <div style="display:flex;gap:12px;margin-top:20px"><span class="btn" style="flex:1">Cancel</span><span class="btn coral" style="flex:1">Authorize</span></div>
      </div>
      <div class="footer-note">Step 3: account owner authorizes TikTok access through OAuth.</div>
    </section>

    <section class="slide">
      <div class="app">
        <aside class="sidebar"><div class="brand"><span class="logo">NX</span><span>Nexora</span></div><div class="menu"><div>Properties</div><div>Content Factory</div><div class="active">Social Posts</div><div>Publishing Queue</div></div></aside>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center"><div><span class="pill">Review before posting</span><h1 style="font-size:36px;margin-top:12px">TikTok post for Casa la Nea Gica</h1></div><span class="status ready">ready</span></div>
          <table class="table">
            <thead><tr><th>Platform</th><th>Content</th><th>Property</th><th>Caption / Script</th><th>Hashtags</th></tr></thead>
            <tbody><tr><td>TikTok</td><td>TikTok script</td><td>Casa la Nea Gica<br><span style="color:#64748b">Prahova</span></td><td>Weekend de vara la Casa la Nea Gica. Cadru 1: curtea. Cadru 2: camera pregatita. Voiceover: salveaza aceasta cazare pe Trevoro.</td><td>#Trevoro #VacanteRomania #CazareRomania</td></tr></tbody>
          </table>
          <div style="display:flex;gap:12px;margin-top:22px"><span class="btn">Copy caption</span><span class="btn">Open TikTok</span><span class="btn primary">Schedule / Publish</span></div>
        </div>
      </div>
      <div class="footer-note">Step 4: the admin reviews the generated script, caption and hashtags before publishing.</div>
    </section>

    <section class="slide">
      <div class="grid cols">
        <div class="phone"><div class="phone-screen"><div class="caption"><b>Draft video preview</b><br/>Weekend de vara la Casa la Nea Gica. Daca vrei o escapada linistita in Romania, salveaza aceasta cazare pe Trevoro.<br/><br/>#Trevoro #VacanteRomania</div></div></div>
        <div class="card">
          <span class="pill">Publishing status</span>
          <h1 style="font-size:38px;margin-top:14px">Manual required until Direct Post approval</h1>
          <p>Before TikTok approves Direct Post, Nexora keeps TikTok items in a manual assisted queue. After approval, the same reviewed post can be published through the official API.</p>
          <div style="margin-top:22px"><span class="status manual">manual_required</span></div>
        </div>
      </div>
      <div class="footer-note">Step 5: demo shows the current safe state and the intended Direct Post transition.</div>
    </section>

    <section class="slide">
      <div class="card" style="max-width:860px;margin:42px auto;text-align:center">
        <span class="pill">End-to-end flow complete</span>
        <h1 style="margin-top:20px">Trevoro uses TikTok only for approved travel content.</h1>
        <p>The integration does not collect unrelated user data. Posts are generated in Nexora Travel, reviewed by an admin, then published manually or through Direct Post after TikTok approval.</p>
        <div style="margin-top:24px;display:flex;justify-content:center;gap:12px"><span class="btn primary">Login Kit</span><span class="btn coral">Content Posting API</span><span class="btn">Direct Post</span></div>
      </div>
      <div class="footer-note">Step 6: requested capabilities and privacy intent are clearly summarized.</div>
    </section>
  </div>
  <script>
    window.showSlide = function(index) {
      document.querySelectorAll('.slide').forEach((slide, i) => slide.classList.toggle('active', i === index));
    };
  </script>
</body>
</html>`;

fs.writeFileSync(HTML_PATH, html);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto(`file://${HTML_PATH}`, { waitUntil: "networkidle0" });

let frame = 0;
for (let slide = 0; slide < 6; slide += 1) {
  await page.evaluate((index) => window.showSlide(index), slide);
  await new Promise((resolve) => setTimeout(resolve, 350));
  for (let hold = 0; hold < 120; hold += 1) {
    const name = `frame-${String(frame).padStart(4, "0")}.png`;
    await page.screenshot({ path: path.join(FRAME_DIR, name) });
    frame += 1;
  }
}
await browser.close();

const ffmpeg = spawnSync(ffmpegPath, [
  "-y",
  "-framerate", "24",
  "-i", path.join(FRAME_DIR, "frame-%04d.png"),
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  VIDEO_PATH,
], { stdio: "inherit" });

if (ffmpeg.status !== 0) process.exit(ffmpeg.status || 1);

console.log(JSON.stringify({ ok: true, video: VIDEO_PATH, html: HTML_PATH, frames: frame }, null, 2));

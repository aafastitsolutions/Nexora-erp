import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";

const requireFromTrevoro = createRequire("/home/server/Trevoro/package.json");
const puppeteer = requireFromTrevoro("puppeteer");
const ffmpegPath = requireFromTrevoro("ffmpeg-static");

const OUT_DIR = "/home/server/Nexora/utile/trevoro-real-social-video";
const CAPTURE_DIR = path.join(OUT_DIR, "captures");
const FRAME_DIR = path.join(OUT_DIR, "frames");
const HTML_PATH = path.join(OUT_DIR, "trevoro-real-social-video.html");
const VIDEO_PATH = path.join(OUT_DIR, "trevoro-real-social-video.mp4");
const SITE_URL = "https://trevoro.ro/";

function resetDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(dir)) fs.rmSync(path.join(dir, file), { recursive: true, force: true });
}

function fileUrl(filePath) {
  return `file://${filePath}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

resetDir(CAPTURE_DIR);
resetDir(FRAME_DIR);

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
await page.goto(SITE_URL, { waitUntil: "networkidle0", timeout: 45000 });

async function capture(name, scrollTarget) {
  if (typeof scrollTarget === "number") {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), scrollTarget);
  } else if (scrollTarget) {
    await page.evaluate((selector) => {
      document.querySelector(selector)?.scrollIntoView({ block: "start", behavior: "instant" });
    }, scrollTarget);
  } else {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
  const capturePath = path.join(CAPTURE_DIR, `${name}.png`);
  await page.screenshot({ path: capturePath, fullPage: false });
  return capturePath;
}

const captures = {
  hero: await capture("01-hero", 0),
  benefits: await capture("02-benefits", "#beneficii"),
  steps: await capture("03-steps", "#cum-functioneaza"),
  founders: await capture("04-founders", 2736),
  form: await capture("05-form", "#formular")
};

await browser.close();

const scenes = [
  {
    image: captures.hero,
    kicker: "Trevoro România",
    title: "Ai cazare în România?",
    subtitle: "Pensiune, hotel, cabană, vilă sau apartament în regim hotelier.",
    footer: "Înscrie proprietatea pe trevoro.ro"
  },
  {
    image: captures.hero,
    kicker: "Sezon de vară 2026",
    title: "Umple sezonul fără comisioane pe rezervări.",
    subtitle: "Alegi planul potrivit: Basic, Premium sau Business.",
    footer: "trevoro.ro/proprietari"
  },
  {
    image: captures.benefits,
    kicker: "Pentru proprietari",
    title: "Cost fix. 0% comision.",
    subtitle: "Fără procent din fiecare rezervare. Știi costul dinainte.",
    footer: "Planuri de la 99 lei/lună"
  },
  {
    image: captures.steps,
    kicker: "Cum funcționează",
    title: "Completezi formularul. Noi pregătim listarea.",
    subtitle: "Validăm datele și pregătim promovarea Trevoro.",
    footer: "Simplu, rapid, în limba română"
  },
  {
    image: captures.founders,
    kicker: "Planuri Trevoro",
    title: "Basic, Premium sau Business.",
    subtitle: "Prețuri afișate, listare clară și 0% comision pe rezervări.",
    footer: "Alege abonamentul înainte de publicare"
  },
  {
    image: captures.form,
    kicker: "Înscriere",
    title: "Intră pe trevoro.ro și înscrie proprietatea.",
    subtitle: "Formularul durează mai puțin de un minut.",
    footer: "trevoro.ro/proprietari"
  }
];

const sceneHtml = scenes.map((scene, index) => `
  <section class="scene ${index === 0 ? "active" : ""}">
    <div class="backdrop" style="background-image:url('${fileUrl(scene.image)}')"></div>
    <img class="capture" src="${fileUrl(scene.image)}" alt="">
    <div class="shade"></div>
    <div class="copy">
      <div class="kicker">${escapeHtml(scene.kicker)}</div>
      <h1>${escapeHtml(scene.title)}</h1>
      <p>${escapeHtml(scene.subtitle)}</p>
    </div>
    <div class="footer">${escapeHtml(scene.footer)}</div>
  </section>
`).join("\n");

const html = `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Trevoro - video social real</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #071512; font-family: Arial, Helvetica, sans-serif; }
    .stage { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #071512; color: #fff; }
    .scene { position: absolute; inset: 0; opacity: 0; transform: scale(1.025); transition: opacity 240ms ease, transform 500ms ease; }
    .scene.active { opacity: 1; transform: scale(1); }
    .backdrop { position: absolute; inset: -48px; background-size: cover; background-position: center; filter: blur(32px) saturate(1.05); opacity: .42; }
    .capture { position: absolute; top: 54px; left: 106px; width: 868px; height: 1476px; object-fit: cover; object-position: top center; border-radius: 28px; box-shadow: 0 34px 100px rgba(0,0,0,.42); }
    .shade { position: absolute; inset: 0; background:
      linear-gradient(180deg, rgba(7,21,18,.08) 0%, rgba(7,21,18,.16) 34%, rgba(7,21,18,.88) 60%, #071512 72%, #071512 100%),
      linear-gradient(90deg, rgba(7,21,18,.72), rgba(7,21,18,.05) 48%, rgba(7,21,18,.72)); }
    .copy { position: absolute; left: 72px; right: 72px; bottom: 236px; }
    .kicker { display: inline-flex; align-items: center; min-height: 42px; padding: 0 20px; border-radius: 999px; background: #ffe783; color: #351600; font-size: 28px; font-weight: 900; text-transform: uppercase; }
    h1 { margin: 28px 0 0; font-size: 78px; line-height: 1; letter-spacing: 0; font-weight: 950; text-wrap: balance; }
    p { margin: 24px 0 0; font-size: 36px; line-height: 1.18; color: rgba(255,255,255,.9); max-width: 900px; font-weight: 700; }
    .footer { position: absolute; left: 72px; right: 72px; bottom: 72px; min-height: 72px; border-radius: 18px; background: #0f766e; color: #fff; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 26px; font-size: 34px; font-weight: 950; box-shadow: 0 20px 70px rgba(15,118,110,.35); }
  </style>
</head>
<body>
  <div class="stage">
    ${sceneHtml}
  </div>
  <script>
    window.showScene = function(index) {
      document.querySelectorAll('.scene').forEach((scene, sceneIndex) => {
        scene.classList.toggle('active', sceneIndex === index);
      });
    };
  </script>
</body>
</html>`;

fs.writeFileSync(HTML_PATH, html, "utf8");

const renderBrowser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const renderPage = await renderBrowser.newPage();
await renderPage.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await renderPage.goto(fileUrl(HTML_PATH), { waitUntil: "networkidle0" });

let frame = 0;
const framesPerScene = 84;
for (let scene = 0; scene < scenes.length; scene += 1) {
  await renderPage.evaluate((index) => window.showScene(index), scene);
  await new Promise((resolve) => setTimeout(resolve, 260));
  for (let hold = 0; hold < framesPerScene; hold += 1) {
    await renderPage.screenshot({ path: path.join(FRAME_DIR, `frame-${String(frame).padStart(4, "0")}.png`) });
    frame += 1;
  }
}

await renderBrowser.close();

const ffmpeg = spawnSync(ffmpegPath, [
  "-y",
  "-framerate", "24",
  "-i", path.join(FRAME_DIR, "frame-%04d.png"),
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  VIDEO_PATH
], { stdio: "inherit" });

if (ffmpeg.status !== 0) process.exit(ffmpeg.status || 1);

console.log(JSON.stringify({
  ok: true,
  video: VIDEO_PATH,
  html: HTML_PATH,
  captures,
  frames: frame,
  duration_seconds: frame / 24
}, null, 2));

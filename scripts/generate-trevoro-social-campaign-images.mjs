#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const OUT_DIR = path.join(
  process.cwd(),
  "utile",
  "social-media",
  "assets",
  "campanie-14-zile"
);

const cards = [
  {
    day: "Ziua 1",
    category: "Pentru turisti",
    title: "Cazari in Romania pe Trevoro",
    subtitle: "Alege tara, oras, judet sau regiune si trimite cerere direct catre proprietar.",
    cta: "trevoro.ro/cazare",
    palette: ["#006b5f", "#f7d66b", "#ffffff"],
    motif: "destinations",
    filename: "trevoro-day-01-cazari-romania.png"
  },
  {
    day: "Ziua 2",
    category: "Pentru proprietari",
    title: "Cost predictibil",
    subtitle: "Program de lansare pentru proprietari si cereri directe.",
    cta: "trevoro.ro/proprietari",
    palette: ["#0b3d4a", "#ff735c", "#ffffff"],
    motif: "owner",
    filename: "trevoro-day-02-cost-predictibil.png"
  },
  {
    day: "Ziua 3",
    category: "Ghid litoral",
    title: "Cum alegi cazarea la mare",
    subtitle: "Locatie, parcare, aer conditionat si confirmare clara inainte de rezervare.",
    cta: "Ghid pe trevoro.ro/blog",
    palette: ["#0c7b93", "#ffd166", "#f7fbff"],
    motif: "sea",
    filename: "trevoro-day-03-ghid-litoral.png"
  },
  {
    day: "Ziua 4",
    category: "Comunitate",
    title: "Unde mergi vara asta?",
    subtitle: "Litoral, munte, Delta, city break sau cabana cu prietenii?",
    cta: "Raspunde si cauta pe Trevoro",
    palette: ["#17494d", "#9bd7d1", "#fff7ed"],
    motif: "poll",
    filename: "trevoro-day-04-intrebare-comunitate.png"
  },
  {
    day: "Ziua 5",
    category: "Cabane",
    title: "Cabane cu jacuzzi",
    subtitle: "Verifica accesul, parcarea, intimitatea si ce este inclus in pret.",
    cta: "Ghid pe trevoro.ro/blog",
    palette: ["#214d36", "#d8a94b", "#f7f3e8"],
    motif: "mountain",
    filename: "trevoro-day-05-cabane-jacuzzi.png"
  },
  {
    day: "Ziua 6",
    category: "Proprietate",
    title: "Cazare aproape de mare",
    subtitle: "Vila Roxana, 2 Mai - pagina de proprietate disponibila pe Trevoro.",
    cta: "Vezi pe trevoro.ro",
    palette: ["#126e82", "#f8b86a", "#ffffff"],
    motif: "property",
    filename: "trevoro-day-06-vila-roxana-2-mai.png"
  },
  {
    day: "Ziua 7",
    category: "Recap ghiduri",
    title: "Ghiduri Trevoro pentru vacanta",
    subtitle: "Litoral, cabane, Delta Dunarii, Turcia si administrarea proprietatilor.",
    cta: "trevoro.ro/blog",
    palette: ["#2d3f50", "#43b5a0", "#fffdf6"],
    motif: "blog",
    filename: "trevoro-day-07-ghiduri-trevoro.png"
  },
  {
    day: "Ziua 8",
    category: "Delta Dunarii",
    title: "Cazare in Delta Dunarii",
    subtitle: "Intreaba despre transfer cu barca, mese, excursii si ora de sosire.",
    cta: "Ghid pe trevoro.ro/blog",
    palette: ["#1f6f5b", "#7ec8a5", "#f3fbf7"],
    motif: "delta",
    filename: "trevoro-day-08-delta-dunarii.png"
  },
  {
    day: "Ziua 9",
    category: "Destinatii",
    title: "Cauta dupa oras sau judet",
    subtitle: "Bucuresti, Hateg, 2 Mai, Bran, Eforie Nord, Sibiu, Timisoara si altele.",
    cta: "trevoro.ro/cazare",
    palette: ["#263b59", "#e9b44c", "#ffffff"],
    motif: "map",
    filename: "trevoro-day-09-orase-disponibile.png"
  },
  {
    day: "Ziua 10",
    category: "Pentru proprietari",
    title: "Mai putin risc de overbooking",
    subtitle: "Calendar sincronizat si integrari pentru disponibilitate mai clara.",
    cta: "Citeste ghidul Trevoro",
    palette: ["#075f63", "#ff9f8a", "#f7fffd"],
    motif: "calendar",
    filename: "trevoro-day-10-calendar-overbooking.png"
  },
  {
    day: "Ziua 11",
    category: "Turcia",
    title: "Turcia intra pe lista Trevoro",
    subtitle: "Antalya, Istanbul, litoral si city break-uri, cu informatii clare.",
    cta: "Ghid pe trevoro.ro/blog",
    palette: ["#9b1c31", "#f2c14e", "#fff8f0"],
    motif: "turkey",
    filename: "trevoro-day-11-turcia.png"
  },
  {
    day: "Ziua 12",
    category: "Recomandari",
    title: "Cunosti un proprietar?",
    subtitle: "Recomanda Trevoro pentru pensiuni, cabane, vile sau apartamente turistice.",
    cta: "trevoro.ro/proprietari",
    palette: ["#314d3e", "#9cd67a", "#f8fff4"],
    motif: "recommend",
    filename: "trevoro-day-12-recomanda-proprietar.png"
  },
  {
    day: "Ziua 13",
    category: "Zona Bran",
    title: "Cazare la munte",
    subtitle: "Proprietati listate pe Trevoro pentru destinatii montane in crestere.",
    cta: "Vezi zona Bran pe Trevoro",
    palette: ["#243f2f", "#c98c4a", "#fffaf2"],
    motif: "bran",
    filename: "trevoro-day-13-bran-munte.png"
  },
  {
    day: "Ziua 14",
    category: "Recap",
    title: "Trevoro creste pas cu pas",
    subtitle: "Proprietati active, destinatii, ghiduri de calatorie si instrumente pentru proprietari.",
    cta: "trevoro.ro",
    palette: ["#073b3a", "#ff735c", "#ffffff"],
    motif: "recap",
    filename: "trevoro-day-14-recap.png"
  }
];

function motifMarkup(motif) {
  const commonPins = `
    <span class="pin p1"></span>
    <span class="pin p2"></span>
    <span class="pin p3"></span>
  `;
  const mapLines = `
    <span class="line l1"></span>
    <span class="line l2"></span>
    <span class="line l3"></span>
  `;
  const variants = {
    destinations: `<div class="motif map-motif">${mapLines}${commonPins}</div>`,
    owner: `<div class="motif owner-motif"><span class="house roof"></span><span class="house body"></span><span class="key"></span></div>`,
    sea: `<div class="motif sea-motif"><span></span><span></span><span></span><i></i></div>`,
    poll: `<div class="motif poll-motif"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>`,
    mountain: `<div class="motif mountain-motif"><span class="m1"></span><span class="m2"></span><span class="sun"></span></div>`,
    property: `<div class="motif property-motif"><span class="roof"></span><span class="body"></span><span class="window w1"></span><span class="window w2"></span></div>`,
    blog: `<div class="motif blog-motif"><span></span><span></span><span></span><span></span></div>`,
    delta: `<div class="motif delta-motif"><span class="river r1"></span><span class="river r2"></span><span class="reed a"></span><span class="reed b"></span></div>`,
    map: `<div class="motif map-motif">${mapLines}${commonPins}<span class="route-dot"></span></div>`,
    calendar: `<div class="motif calendar-motif"><span class="top"></span><span class="cell c1"></span><span class="cell c2"></span><span class="cell c3"></span><span class="check"></span></div>`,
    turkey: `<div class="motif turkey-motif"><span class="dome"></span><span class="tower t1"></span><span class="tower t2"></span><span class="water"></span></div>`,
    recommend: `<div class="motif recommend-motif"><span class="person a"></span><span class="person b"></span><span class="arrow"></span></div>`,
    bran: `<div class="motif mountain-motif"><span class="m1"></span><span class="m2"></span><span class="cabin"></span></div>`,
    recap: `<div class="motif recap-motif"><span></span><span></span><span></span><span></span></div>`
  };
  return variants[motif] || variants.destinations;
}

function cardHtml(card, index) {
  const [primary, accent, paper] = card.palette;
  return `
    <article class="card" style="--primary:${primary};--accent:${accent};--paper:${paper}">
      <div class="brand"><span class="mark">T</span><span>Trevoro</span></div>
      <div class="day">${card.day}</div>
      <div class="content">
        <p class="category">${card.category}</p>
        <h1>${card.title}</h1>
        <p class="subtitle">${card.subtitle}</p>
      </div>
      ${motifMarkup(card.motif)}
      <div class="cta">${card.cta}</div>
      <div class="footer">Cazari, destinatii si proprietari directi</div>
      <div class="index">${String(index + 1).padStart(2, "0")}/14</div>
    </article>
  `;
}

function htmlDocument(card, index) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1080px; height: 1080px; overflow: hidden; }
    body {
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #eaf3f3;
    }
    .card {
      position: relative;
      width: 1080px;
      height: 1080px;
      overflow: hidden;
      color: #ffffff;
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--primary), #000 7%) 0%, var(--primary) 54%, color-mix(in srgb, var(--accent), #000 4%) 100%);
      isolation: isolate;
    }
    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(100deg, rgba(255,255,255,.09), rgba(255,255,255,0) 35%),
        repeating-linear-gradient(135deg, rgba(255,255,255,.08) 0 2px, transparent 2px 34px);
      opacity: .65;
      z-index: -2;
    }
    .card::after {
      content: "";
      position: absolute;
      right: -180px;
      top: 0;
      width: 540px;
      height: 1180px;
      background: rgba(255,255,255,.14);
      transform: skewX(-14deg);
      z-index: -1;
    }
    .brand {
      position: absolute;
      left: 64px;
      top: 58px;
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 27px;
      font-weight: 900;
      letter-spacing: 0;
    }
    .mark {
      display: grid;
      place-items: center;
      width: 58px;
      height: 58px;
      border-radius: 16px;
      background: rgba(255,255,255,.94);
      color: var(--primary);
      box-shadow: 0 18px 40px rgba(0,0,0,.15);
    }
    .day {
      position: absolute;
      right: 64px;
      top: 68px;
      min-width: 144px;
      padding: 13px 20px;
      border: 1px solid rgba(255,255,255,.42);
      border-radius: 999px;
      text-align: center;
      font-weight: 900;
      font-size: 22px;
      background: rgba(0,0,0,.14);
      backdrop-filter: blur(10px);
    }
    .content {
      position: absolute;
      left: 70px;
      top: 198px;
      width: 690px;
      z-index: 2;
    }
    .category {
      display: inline-block;
      margin: 0 0 24px;
      padding: 13px 18px;
      border-radius: 999px;
      background: var(--accent);
      color: #142326;
      font-weight: 950;
      font-size: 22px;
      text-transform: uppercase;
      letter-spacing: .09em;
    }
    h1 {
      margin: 0;
      font-size: 76px;
      line-height: .98;
      letter-spacing: 0;
      max-width: 700px;
      text-wrap: balance;
      text-shadow: 0 10px 36px rgba(0,0,0,.2);
    }
    .subtitle {
      margin: 34px 0 0;
      width: 650px;
      font-size: 33px;
      line-height: 1.24;
      font-weight: 650;
      color: rgba(255,255,255,.9);
      text-wrap: balance;
    }
    .cta {
      position: absolute;
      left: 70px;
      bottom: 122px;
      max-width: 770px;
      padding: 22px 28px;
      border-radius: 24px;
      background: rgba(255,255,255,.95);
      color: var(--primary);
      font-size: 31px;
      font-weight: 950;
      box-shadow: 0 20px 48px rgba(0,0,0,.16);
    }
    .footer {
      position: absolute;
      left: 72px;
      bottom: 64px;
      color: rgba(255,255,255,.78);
      font-size: 22px;
      font-weight: 700;
    }
    .index {
      position: absolute;
      right: 70px;
      bottom: 60px;
      color: rgba(255,255,255,.82);
      font-size: 24px;
      font-weight: 900;
    }
    .motif {
      position: absolute;
      right: 78px;
      bottom: 210px;
      width: 330px;
      height: 330px;
      opacity: .96;
    }
    .pin {
      position: absolute;
      width: 64px;
      height: 64px;
      border-radius: 50% 50% 50% 8px;
      background: var(--paper);
      transform: rotate(-45deg);
      box-shadow: 0 22px 42px rgba(0,0,0,.15);
    }
    .pin::after {
      content: "";
      position: absolute;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--accent);
      left: 19px;
      top: 19px;
    }
    .p1 { left: 60px; top: 70px; }
    .p2 { left: 190px; top: 125px; transform: rotate(-45deg) scale(.8); }
    .p3 { left: 130px; top: 215px; transform: rotate(-45deg) scale(.62); }
    .line {
      position: absolute;
      height: 7px;
      border-radius: 999px;
      background: rgba(255,255,255,.46);
      transform: rotate(-16deg);
    }
    .l1 { width: 240px; left: 35px; top: 135px; }
    .l2 { width: 195px; left: 65px; top: 205px; transform: rotate(20deg); }
    .l3 { width: 210px; left: 40px; top: 265px; }
    .owner-motif .roof, .property-motif .roof {
      position:absolute; left:58px; top:72px; width:214px; height:214px;
      background: var(--paper); transform: rotate(45deg); border-radius: 20px;
    }
    .owner-motif .body, .property-motif .body {
      position:absolute; left:72px; top:150px; width:236px; height:150px;
      background: var(--paper); border-radius: 22px;
    }
    .owner-motif .key {
      position:absolute; left:132px; top:186px; width:88px; height:88px;
      border: 20px solid var(--accent); border-radius: 50%;
    }
    .owner-motif .key::after { content:""; position:absolute; width:95px; height:20px; background:var(--accent); left:60px; top:34px; border-radius:999px; }
    .sea-motif span {
      position:absolute; left:10px; width:300px; height:42px; border-radius:999px;
      background: rgba(255,255,255,.78);
    }
    .sea-motif span:nth-child(1){ top:104px; }
    .sea-motif span:nth-child(2){ top:176px; left:58px; width:250px; }
    .sea-motif span:nth-child(3){ top:248px; width:220px; }
    .sea-motif i { position:absolute; left:170px; top:24px; width:86px; height:86px; border-radius:50%; background:var(--accent); }
    .poll-motif { display:flex; flex-direction:column; gap:17px; justify-content:center; }
    .poll-motif span {
      display:block; width:310px; padding:14px 22px; border-radius:20px;
      background:rgba(255,255,255,.88); color:var(--primary); font-size:34px; font-weight:950;
    }
    .mountain-motif .m1, .mountain-motif .m2 {
      position:absolute; bottom:18px; width:0; height:0; border-left:150px solid transparent; border-right:150px solid transparent; border-bottom:260px solid var(--paper);
    }
    .mountain-motif .m2 { left:90px; bottom:20px; transform:scale(.78); border-bottom-color:rgba(255,255,255,.72); }
    .mountain-motif .sun { position:absolute; right:32px; top:28px; width:78px; height:78px; border-radius:50%; background:var(--accent); }
    .mountain-motif .cabin { position:absolute; left:118px; bottom:34px; width:110px; height:76px; border-radius:16px; background:var(--accent); }
    .property-motif .window { position:absolute; width:48px; height:48px; background:var(--accent); border-radius:10px; top:190px; }
    .property-motif .w1 { left:116px; }
    .property-motif .w2 { left:216px; }
    .blog-motif, .recap-motif { display:grid; grid-template-columns:1fr 1fr; gap:18px; align-content:center; }
    .blog-motif span, .recap-motif span {
      display:block; height:142px; border-radius:24px; background:rgba(255,255,255,.86);
      box-shadow: inset 0 -32px 0 var(--accent);
    }
    .delta-motif .river {
      position:absolute; left:20px; width:300px; height:82px; border:20px solid rgba(255,255,255,.82);
      border-left:0; border-right:0; border-radius:50%; transform:rotate(-22deg);
    }
    .delta-motif .r1 { top:90px; }
    .delta-motif .r2 { top:178px; left:60px; width:230px; }
    .delta-motif .reed { position:absolute; bottom:20px; width:12px; height:170px; border-radius:999px; background:var(--accent); transform:rotate(-10deg); }
    .delta-motif .reed.a { left:70px; }
    .delta-motif .reed.b { left:104px; height:130px; transform:rotate(12deg); }
    .calendar-motif {
      border-radius:28px; background:rgba(255,255,255,.9); box-shadow:0 22px 42px rgba(0,0,0,.16);
    }
    .calendar-motif .top { position:absolute; inset:0 0 auto 0; height:74px; background:var(--accent); border-radius:28px 28px 0 0; }
    .calendar-motif .cell { position:absolute; width:62px; height:62px; background:var(--primary); opacity:.84; border-radius:14px; top:116px; }
    .calendar-motif .c1 { left:56px; }
    .calendar-motif .c2 { left:138px; }
    .calendar-motif .c3 { left:220px; }
    .calendar-motif .check { position:absolute; left:92px; top:214px; width:150px; height:70px; border-left:22px solid var(--accent); border-bottom:22px solid var(--accent); transform:rotate(-45deg); }
    .turkey-motif .dome { position:absolute; left:70px; top:116px; width:190px; height:160px; background:var(--paper); border-radius:130px 130px 20px 20px; }
    .turkey-motif .tower { position:absolute; top:58px; width:42px; height:236px; background:var(--paper); border-radius:999px 999px 12px 12px; }
    .turkey-motif .t1 { left:36px; }
    .turkey-motif .t2 { right:36px; }
    .turkey-motif .water { position:absolute; left:30px; bottom:16px; width:270px; height:34px; background:var(--accent); border-radius:999px; }
    .recommend-motif .person { position:absolute; top:72px; width:118px; height:118px; background:var(--paper); border-radius:50%; }
    .recommend-motif .person::after { content:""; position:absolute; left:-25px; top:132px; width:170px; height:120px; background:var(--paper); border-radius:70px 70px 20px 20px; }
    .recommend-motif .a { left:42px; }
    .recommend-motif .b { right:42px; transform:scale(.86); opacity:.82; }
    .recommend-motif .arrow { position:absolute; left:130px; top:190px; width:120px; height:22px; background:var(--accent); border-radius:999px; }
    .recommend-motif .arrow::after { content:""; position:absolute; right:-4px; top:-18px; width:58px; height:58px; border-right:22px solid var(--accent); border-top:22px solid var(--accent); transform:rotate(45deg); }
  </style>
</head>
<body>${cardHtml(card, index)}</body>
</html>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });

  for (const [index, card] of cards.entries()) {
    await page.setContent(htmlDocument(card, index), { waitUntil: "networkidle" });
    const outPath = path.join(OUT_DIR, card.filename);
    await page.screenshot({ path: outPath, fullPage: false, type: "png" });
    console.log(outPath);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

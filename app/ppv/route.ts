// Public PPV explainer, served as its original standalone HTML document.
// Do not use the authenticated GwapOS /app/ppv route or mount the website shell.
export const dynamic = "force-static";

const html = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="light dark" />
<link rel="icon" href="/logos/gwap-agent.png" />
<meta name="description" content="Explore Private Proof Vault: separate proof, agreement, and escrow layers designed to protect the integrity of deals. In development, not a public launch." />
<link rel="canonical" href="https://www.gwapspot.com/ppv" />
<meta property="og:title" content="PPV — Private Proof Vault | Proof. Terms. Money." />
<meta property="og:description" content="One name. Three jobs: proof, terms, and money, separated by design." />
<title>PPV — Private Proof Vault | Proof. Terms. Money.</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --green:#13DD13;
    --green-dim:#0fb80f;
    --purple:#B04DFF;
    --purple-deep:#7C1DFF;
    --orange:#FF7A1A;
    --orange-deep:#E85D00;
    --electric:#2EA8FF;

    --bg:#060706;
    --bg-2:#0B0C0B;
    --surface:#101210;
    --surface-2:#161816;
    --line:rgba(255,255,255,.10);
    --line-strong:rgba(255,255,255,.18);
    --text:#F4F5F3;
    --muted:#A8ADA8;
    --muted-2:#7E847E;
    --vault-bg:#050505;
    --shadow:0 20px 50px rgba(0,0,0,.45);
  }
  @media (prefers-color-scheme: light){
    :root{
      --bg:#EDEEEA;
      --bg-2:#E4E6E1;
      --surface:#FFFFFF;
      --surface-2:#F3F4F1;
      --line:rgba(10,15,10,.12);
      --line-strong:rgba(10,15,10,.22);
      --text:#0C0E0C;
      --muted:#4A504A;
      --muted-2:#6B726B;
      --shadow:0 20px 40px rgba(0,0,0,.12);
    }
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--text);font-family:"Archivo",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  a{color:inherit}
  button, [role="button"], select, summary, input:not([type="checkbox"],[type="radio"]){min-height:2.25rem}
  .wrap{max-width:1180px;margin:0 auto;padding:0 20px}
  @media(min-width:768px){.wrap{padding:0 32px}}

  /* ---------- HERO / VAULT ---------- */
  .vault{background:var(--vault-bg);color:#F4F5F3;position:relative;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.08)}
  .vault::before{content:"";position:absolute;inset:0;background:
    radial-gradient(700px 420px at 12% 88%, rgba(19,221,19,.16), transparent 62%),
    radial-gradient(640px 420px at 50% 92%, rgba(124,29,255,.18), transparent 62%),
    radial-gradient(700px 420px at 88% 88%, rgba(255,122,26,.16), transparent 62%);
    pointer-events:none}
  .vault-inner{position:relative;z-index:1;padding:28px 0 0}
  .top-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
  @media(max-width:640px){
    .mantra{display:none}
    .top-row{justify-content:center}
    .vault-sub{letter-spacing:.22em;font-size:10px}
    .status-pill{font-size:11px;text-align:center}
  }
  .mantra{font-family:"Oswald",sans-serif;font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:11px;line-height:1.7;color:#8A918A}
  .mantra.right{text-align:right}
  .brand-center{text-align:center;flex:1;min-width:0}
  .crown{width:44px;height:28px;margin:0 auto 2px;display:block}
  .ppv-mark{font-family:"Oswald",sans-serif;font-weight:700;font-size:clamp(44px,8vw,72px);letter-spacing:.02em;line-height:.95;color:#fff}
  .ppv-mark span{color:var(--green)}
  .vault-sub{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#C9CCC9;margin-top:6px}
  .status-pill{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:7px 12px;border:1px solid rgba(19,221,19,.45);border-radius:999px;background:rgba(19,221,19,.08);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#D8FFD8}
  .status-dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(19,221,19,.18)}
  .hero-head{ text-align:center; max-width:860px; margin:34px auto 0; padding:0 6px}
  .hero-head h1{font-family:"Oswald",sans-serif;font-weight:700;text-transform:uppercase;line-height:.98;letter-spacing:.01em;font-size:clamp(40px,7.2vw,76px);margin:0;color:#fff}
  .hero-head h1 .brush{color:var(--green);display:block;font-size:1.08em;letter-spacing:0;transform:rotate(-1deg)}
  .hero-ptm{font-family:"Oswald",sans-serif;font-weight:600;letter-spacing:.18em;text-transform:uppercase;font-size:clamp(15px,2.6vw,22px);color:#fff;margin-top:14px}
  .hero-ptm i{font-style:normal;color:var(--green);padding:0 .35em}
  .hero-ptm .p{color:var(--purple)} .hero-ptm .o{color:var(--orange)}
  .hero-copy{max-width:640px;margin:16px auto 0;color:#B9BEB9;font-size:16.5px;line-height:1.65}
  .hero-copy strong{color:#fff}
  .hero-ctas{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:22px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 20px;border-radius:10px;font-weight:800;font-size:14px;letter-spacing:.02em;text-decoration:none;border:1px solid transparent;cursor:pointer}
  .btn-green{background:var(--green);color:#041604}
  .btn-ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.28)}
  .btn-ghost:hover{border-color:#fff}

  /* Monoliths */
  .monoliths{display:grid;grid-template-columns:1fr;gap:14px;max-width:980px;margin:36px auto 0;padding:0 4px}
  @media(min-width:760px){.monoliths{grid-template-columns:repeat(3,1fr);gap:16px}}
  .mono{position:relative;border-radius:14px 14px 0 0;padding:22px 20px 26px;text-align:center;color:#fff;overflow:hidden;border:1px solid;min-height:280px;display:flex;flex-direction:column;align-items:center}
  .mono::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.06),transparent 38%);pointer-events:none}
  .mono-green{background:linear-gradient(180deg,#0E1A0E 0%,#071007 55%,#0A1F0A 100%);border-color:rgba(19,221,19,.65);box-shadow:0 0 0 1px rgba(19,221,19,.12), 0 18px 44px rgba(19,221,19,.14)}
  .mono-purple{background:linear-gradient(180deg,#1B0F2E 0%,#12071F 55%,#1E0B38 100%);border-color:rgba(176,77,255,.65);box-shadow:0 0 0 1px rgba(176,77,255,.12), 0 18px 44px rgba(124,29,255,.20)}
  .mono-orange{background:linear-gradient(180deg,#241206 0%,#170B03 55%,#2A1200 100%);border-color:rgba(255,122,26,.65);box-shadow:0 0 0 1px rgba(255,122,26,.12), 0 18px 44px rgba(255,122,26,.16)}
  .mono-kicker{font-family:"Oswald",sans-serif;font-weight:600;letter-spacing:.22em;text-transform:uppercase;font-size:13px;opacity:.95}
  .mono-icon{width:62px;height:62px;margin:16px auto 10px;display:grid;place-items:center;border-radius:12px;border:1.5px solid currentColor}
  .mono-green .mono-icon{color:var(--green)} .mono-purple .mono-icon{color:#C77DFF} .mono-orange .mono-icon{color:#FF9A4D}
  .mono-title{font-family:"Oswald",sans-serif;font-weight:700;font-size:28px;letter-spacing:.06em;text-transform:uppercase;line-height:1}
  .mono-list{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:4px;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#D6D9D6}
  .mono-desc{margin-top:14px;font-size:14px;line-height:1.55;color:#B9BEB9;max-width:28ch}
  .rockline{position:relative;text-align:center;padding:18px 16px 30px;background:linear-gradient(180deg,transparent, rgba(0,0,0,.35));border-top:1px solid rgba(255,255,255,.06)}
  .rock-ppv{font-family:"Oswald",sans-serif;font-weight:700;font-size:34px;letter-spacing:.28em;color:transparent;-webkit-text-stroke:1.2px rgba(255,255,255,.55);text-stroke:1.2px rgba(255,255,255,.55)}
  .rock-line{font-family:"Oswald",sans-serif;font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:15px;color:#fff;margin-top:6px}
  .rock-line span{color:var(--green)}

  /* ---------- SECTIONS ---------- */
  section.block{padding:64px 0}
  section.block.alt{background:var(--bg-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  .eyebrow{font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--green-dim);display:flex;align-items:center;gap:10px}
  .eyebrow::before{content:"";width:28px;height:2px;background:var(--green);display:inline-block}
  @media(prefers-color-scheme: dark){.eyebrow{color:var(--green)}}
  h2{font-family:"Oswald",sans-serif;font-weight:700;text-transform:uppercase;line-height:1.02;letter-spacing:.01em;font-size:clamp(30px,4.6vw,46px);margin:12px 0 0}
  h2 em{font-style:normal;color:var(--green)}
  .lead{margin-top:14px;font-size:17px;line-height:1.65;color:var(--muted);max-width:68ch}
  .lead strong{color:var(--text)}

  /* Acronym strip */
  .acronyms{display:grid;grid-template-columns:1fr;gap:12px;margin-top:28px}
  @media(min-width:820px){.acronyms{grid-template-columns:repeat(3,1fr)}}
  .acro{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px}
  .acro-top{display:flex;justify-content:space-between;align-items:center;gap:12px}
  .acro-letters{font-family:"Oswald",sans-serif;font-weight:700;font-size:22px;letter-spacing:.08em}
  .acro-tag{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:6px 8px;border-radius:999px;border:1px solid var(--line-strong);color:var(--muted)}
  .acro-words{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .acro-words span{font-weight:800;font-size:14px;padding:8px 10px;border-radius:8px;background:var(--surface-2);border:1px solid var(--line)}
  .acro p{margin:12px 0 0;color:var(--muted);font-size:14.5px;line-height:1.6}

  /* Pillar selector */
  .pillar-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:28px}
  .ptab{appearance:none;border:1px solid var(--line-strong);background:var(--surface);color:var(--text);border-radius:12px;padding:14px 10px;cursor:pointer;text-align:center;font-family:inherit;min-height:64px}
  .ptab small{display:block;font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
  .ptab strong{font-family:"Oswald",sans-serif;font-size:18px;letter-spacing:.06em;text-transform:uppercase}
  .ptab[aria-selected="true"]{border-width:2px}
  .ptab[data-pillar="core"][aria-selected="true"]{border-color:var(--green);box-shadow:0 0 0 3px rgba(19,221,19,.15)}
  .ptab[data-pillar="commerce"][aria-selected="true"]{border-color:var(--purple);box-shadow:0 0 0 3px rgba(176,77,255,.16)}
  .ptab[data-pillar="escrow"][aria-selected="true"]{border-color:var(--orange);box-shadow:0 0 0 3px rgba(255,122,26,.16)}
  .pillar-panel{margin-top:14px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:var(--shadow)}
  @media(min-width:860px){.pillar-panel{padding:30px}}
  .panel-grid{display:grid;grid-template-columns:1fr;gap:24px}
  @media(min-width:860px){.panel-grid{grid-template-columns:1.15fr .85fr}}
  .panel-badge{display:inline-flex;align-items:center;gap:8px;font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;padding:7px 10px;border-radius:999px;border:1px solid var(--line-strong)}
  .panel-badge i{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}
  .c-green{color:var(--green-dim)} @media(prefers-color-scheme: dark){.c-green{color:var(--green)}}
  .c-purple{color:#8B2FE0} @media(prefers-color-scheme: dark){.c-purple{color:#C77DFF}}
  .c-orange{color:#C65300} @media(prefers-color-scheme: dark){.c-orange{color:#FF9A4D}}
  .panel-title{font-family:"Oswald",sans-serif;font-size:clamp(28px,4vw,38px);font-weight:700;text-transform:uppercase;line-height:1;margin-top:14px}
  .panel-one{font-size:18px;font-weight:700;line-height:1.45;margin-top:10px}
  .panel-body{color:var(--muted);font-size:15.5px;line-height:1.7;margin-top:10px}
  .owns{background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:18px}
  .owns h4{margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase}
  .owns ul{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:10px}
  .owns li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;font-weight:600;line-height:1.45}
  .owns li::before{content:"✓";font-weight:900;margin-top:1px}
  .never{margin-top:14px;border-radius:12px;padding:16px 18px;border:1px dashed var(--line-strong);background:transparent}
  .never h4{margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
  .never p{margin:8px 0 0;font-size:14.5px;line-height:1.6;color:var(--muted)}
  .never p strong{color:var(--text)}

  /* Why separate */
  .why-grid{display:grid;grid-template-columns:1fr;gap:14px;margin-top:28px}
  @media(min-width:860px){.why-grid{grid-template-columns:repeat(3,1fr)}}
  .why-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px}
  .why-num{font-family:"JetBrains Mono",monospace;font-size:12px;font-weight:700;letter-spacing:.18em;color:var(--muted)}
  .why-card h3{font-family:"Oswald",sans-serif;font-size:21px;text-transform:uppercase;letter-spacing:.03em;margin:10px 0 0;line-height:1.1}
  .why-card p{color:var(--muted);font-size:14.5px;line-height:1.65;margin:10px 0 0}
  .compare{margin-top:14px;display:grid;grid-template-columns:1fr;gap:14px}
  @media(min-width:860px){.compare{grid-template-columns:1fr 1fr}}
  .compare-box{border-radius:14px;padding:22px;border:1px solid var(--line)}
  .compare-box.bad{background:color-mix(in srgb, #FF3B30 6%, var(--surface));border-color:color-mix(in srgb, #FF3B30 28%, var(--line))}
  .compare-box.good{background:color-mix(in srgb, var(--green) 7%, var(--surface));border-color:color-mix(in srgb, var(--green) 32%, var(--line))}
  .compare-box h3{margin:0;font-family:"Oswald",sans-serif;text-transform:uppercase;font-size:19px;letter-spacing:.03em}
  .compare-box ul{margin:12px 0 0;padding-left:18px;color:var(--muted);font-size:14.5px;line-height:1.7}
  .compare-box li strong{color:var(--text)}

  /* Flow */
  .flow-steps{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}
  .fstep{flex:1 1 150px;appearance:none;border:1px solid var(--line-strong);background:var(--surface);color:var(--text);border-radius:12px;padding:14px 12px;cursor:pointer;text-align:left;font-family:inherit;min-height:72px}
  .fstep small{display:block;font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:5px}
  .fstep strong{font-size:14px;line-height:1.3;display:block}
  .fstep[aria-current="true"]{border-color:var(--green);box-shadow:0 0 0 3px rgba(19,221,19,.14);border-width:2px}
  .flow-panel{margin-top:14px;border-radius:16px;padding:24px;border:1px solid rgba(255,255,255,.12);background:#0A0B0A;color:#EFF1EF}
  .flow-panel h3{font-family:"Oswald",sans-serif;text-transform:uppercase;font-size:24px;margin:0;line-height:1.1}
  .flow-panel p{color:#B9BEB9;line-height:1.7;font-size:15.5px;margin:10px 0 0;max-width:68ch}
  .flow-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
  .chip{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.22);color:#E6E8E6}
  .chip.green{border-color:rgba(19,221,19,.6);color:#B9FFB9;background:rgba(19,221,19,.10)}
  .chip.purple{border-color:rgba(176,77,255,.6);color:#E3C2FF;background:rgba(176,77,255,.12)}
  .chip.orange{border-color:rgba(255,122,26,.6);color:#FFD2AD;background:rgba(255,122,26,.12)}
  .flow-nav{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
  .flow-nav button{appearance:none;border-radius:10px;padding:12px 16px;font-weight:800;font-size:14px;cursor:pointer;min-height:48px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff}
  .flow-nav button.primary{background:var(--green);color:#041604;border-color:var(--green)}
  .flow-nav button:disabled{opacity:.45;cursor:not-allowed}

  /* Table -> cards on mobile */
  .glance{margin-top:26px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface)}
  .g-row{display:grid;grid-template-columns:1fr;border-bottom:1px solid var(--line)}
  .g-row:last-child{border-bottom:none}
  @media(min-width:820px){.g-row{grid-template-columns:180px 1fr 1fr 1fr}}
  .g-cell{padding:16px 18px;font-size:14.5px;line-height:1.55}
  .g-cell + .g-cell{border-top:1px solid var(--line)}
  @media(min-width:820px){.g-cell + .g-cell{border-top:none;border-left:1px solid var(--line)}}
  .g-head{background:var(--surface-2);font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
  .g-pillar{font-family:"Oswald",sans-serif;font-weight:700;text-transform:uppercase;font-size:17px;letter-spacing:.04em}
  .g-cell small{display:block;font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
  @media(min-width:820px){.g-cell small{display:none} .g-head small{display:block}}

  /* Poster + closing */
  .closing{display:grid;grid-template-columns:1fr;gap:24px;align-items:start}
  @media(min-width:900px){.closing{grid-template-columns:.92fr 1.08fr;gap:36px}}
  .poster-frame{border-radius:16px;overflow:hidden;border:1px solid var(--line-strong);box-shadow:var(--shadow);background:#000}
  .poster-frame img{display:block;width:100%;height:auto}
  .poster-cap{padding:12px 14px;font-size:12.5px;color:var(--muted);background:var(--surface);border-top:1px solid var(--line);line-height:1.5}
  .faq{margin-top:22px;display:grid;gap:10px}
  details{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:4px 18px}
  summary{cursor:pointer;font-weight:800;font-size:15px;padding:12px 0;min-height:44px;display:flex;align-items:center}
  details p{margin:0 0 16px;color:var(--muted);font-size:14.5px;line-height:1.65}
  .principles{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:12px}
  .principles li{display:flex;gap:12px;align-items:flex-start;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}
  .principles .n{font-family:"Oswald",sans-serif;font-weight:700;font-size:20px;line-height:1;color:var(--green-dim);min-width:28px}
  @media(prefers-color-scheme: dark){.principles .n{color:var(--green)}}
  .principles strong{display:block;font-size:15px}
  .principles span{color:var(--muted);font-size:14px;line-height:1.55}

  footer{border-top:1px solid var(--line);padding:34px 0 44px;background:var(--bg-2)}
  .foot-grid{display:flex;flex-wrap:wrap;gap:18px;justify-content:space-between;align-items:flex-start}
  .foot-brand{font-family:"Oswald",sans-serif;font-weight:700;font-size:24px;letter-spacing:.06em}
  .foot-brand span{color:var(--green)}
  .foot-small{color:var(--muted);font-size:13px;line-height:1.6;max-width:52ch;margin-top:8px}
  .foot-links{display:flex;flex-wrap:wrap;gap:8px}
  .foot-links a{display:inline-flex;align-items:center;min-height:40px;padding:8px 12px;border:1px solid var(--line-strong);border-radius:999px;text-decoration:none;font-size:13px;font-weight:700}
  .disclaimer{margin-top:22px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted-2);font-size:12.5px;line-height:1.6}
</style>
</head>
<body>

<!-- ============ VAULT HERO ============ -->
<header class="vault">
  <div class="wrap vault-inner">
    <div class="top-row">
      <div class="mantra">People<br>Pay<br>Value</div>
      <div class="brand-center">
        <svg class="crown" viewBox="0 0 48 30" fill="none" aria-hidden="true"><path d="M4 24 L8 8 L18 16 L24 4 L30 16 L40 8 L44 24 Z" stroke="#13DD13" stroke-width="2.4" stroke-linejoin="round"/><path d="M6 27 H42" stroke="#13DD13" stroke-width="2.4" stroke-linecap="round"/></svg>
        <div class="ppv-mark">P<span>P</span>V</div>
        <div class="vault-sub">Private Proof Vault</div>
        <div><span class="status-pill"><span class="status-dot"></span> In development — not a public launch</span></div>
      </div>
      <div class="mantra right">Build<br>Own<br>Earn<br>Repeat</div>
    </div>

    <div class="hero-head">
      <h1>PPV isn’t one protocol. <span class="brush">It’s three.</span></h1>
      <div class="hero-ptm">Proof <i>·</i> <span class="p">Terms</span> <i>·</i> <span class="o">Money</span></div>
      <p class="hero-copy">Most deals break because the <strong>facts</strong>, the <strong>agreement</strong>, and the <strong>money</strong> all live in the same messy place — chats, screenshots, and trust. PPV splits them into three separate systems that check each other. <strong>That separation is the product.</strong></p>
      <div class="hero-ctas">
        <a class="btn btn-green" href="#pillars">See the three pillars ↓</a>
        <a class="btn btn-ghost" href="#flow">Walk through a deal</a>
      </div>
    </div>

    <div class="monoliths" aria-label="The three pillars of PPV">
      <article class="mono mono-green">
        <div class="mono-kicker">Core</div>
        <div class="mono-icon" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M6 2.5h8L19 7.5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5A1 1 0 0 1 6 2.5Z" stroke="currentColor" stroke-width="1.8"/><path d="M13.5 2.5V8H19" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 12h7M8.5 15.5h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <div class="mono-title">Proof</div>
        <ul class="mono-list"><li>Facts</li><li>Evidence</li><li>Timestamps</li></ul>
        <p class="mono-desc">What actually happened — locked in, in order, so nobody can rewrite it later.</p>
      </article>

      <article class="mono mono-purple">
        <div class="mono-kicker">Commerce</div>
        <div class="mono-icon" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M6 2.5h8L19 7.5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5A1 1 0 0 1 6 2.5Z" stroke="currentColor" stroke-width="1.8"/><path d="M13.5 2.5V8H19" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 12h7M8.5 15.5h4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <div class="mono-title">Terms</div>
        <ul class="mono-list"><li>Agreements</li><li>Signatures</li><li>Versions</li></ul>
        <p class="mono-desc">What everybody agreed to — signed, versioned, and impossible to quietly edit.</p>
      </article>

      <article class="mono mono-orange">
        <div class="mono-kicker">Escrow</div>
        <div class="mono-icon" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M17 9.2v1.6M17 13.2v2.2M17 15.4h1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <div class="mono-title">Money</div>
        <ul class="mono-list"><li>Custody</li><li>Execution</li><li>Settlements</li></ul>
        <p class="mono-desc">Where the money sits and when it moves — only when Proof and Terms say so.</p>
      </article>
    </div>

    <div class="rockline">
      <div class="rock-ppv">PPV</div>
      <div class="rock-line">Built separately. <span>On purpose.</span></div>
    </div>
  </div>
</header>

<!-- ============ WHAT PPV MEANS ============ -->
<section class="block">
  <div class="wrap">
    <div class="eyebrow">Start here</div>
    <h2>One name. <em>Three jobs.</em></h2>
    <p class="lead">PPV is <strong>Private Proof Vault</strong> — a vault for the record of a deal, not just the money in it. The letters carry the rest of the philosophy too. If you remember nothing else, remember this: <strong>proof comes before payment.</strong></p>

    <div class="acronyms">
      <article class="acro">
        <div class="acro-top"><div class="acro-letters">PPV</div><span class="acro-tag">The system</span></div>
        <div class="acro-words"><span>Private</span><span>Proof</span><span>Vault</span></div>
        <p>Private by default. Proof before claims. A vault — meaning the record is sealed, ordered, and built to be checked later, not just stored.</p>
      </article>
      <article class="acro">
        <div class="acro-top"><div class="acro-letters">PPV</div><span class="acro-tag">The deal</span></div>
        <div class="acro-words"><span>People</span><span>Pay</span><span>Value</span></div>
        <p>The left side of the poster. Money should follow real value between real people — not hype, not pressure, not a screenshot and a promise.</p>
      </article>
      <article class="acro">
        <div class="acro-top"><div class="acro-letters">BOER</div><span class="acro-tag">The loop</span></div>
        <div class="acro-words"><span>Build</span><span>Own</span><span>Earn</span><span>Repeat</span></div>
        <p>The right side of the poster. Do the work, own the record of it, earn from it, then run it again. PPV is the infrastructure under that loop.</p>
      </article>
    </div>
  </div>
</section>

<!-- ============ PILLARS DEEP DIVE ============ -->
<section class="block alt" id="pillars">
  <div class="wrap">
    <div class="eyebrow">The three pillars</div>
    <h2>Tap a pillar. <em>See what it owns — and what it never touches.</em></h2>
    <p class="lead">Each pillar has one job and hard edges. The limits matter as much as the features: <strong>a pillar that can do everything can also break everything.</strong></p>

    <div class="pillar-tabs" role="tablist" aria-label="Choose a pillar">
      <button class="ptab" role="tab" data-pillar="core" aria-selected="true"><small>01 — Core</small><strong>Proof</strong></button>
      <button class="ptab" role="tab" data-pillar="commerce" aria-selected="false"><small>02 — Commerce</small><strong>Terms</strong></button>
      <button class="ptab" role="tab" data-pillar="escrow" aria-selected="false"><small>03 — Escrow</small><strong>Money</strong></button>
    </div>

    <div class="pillar-panel" id="pillarPanel" role="tabpanel" aria-live="polite"></div>
  </div>
</section>

<!-- ============ WHY SEPARATE ============ -->
<section class="block">
  <div class="wrap">
    <div class="eyebrow">Why separate?</div>
    <h2>Built separately. <em>On purpose.</em></h2>
    <p class="lead">One giant system that holds the evidence, writes the contract, <em>and</em> controls the money is a single point of failure — and a single point of temptation. PPV splits the power so each part has to answer to the other two.</p>

    <div class="why-grid">
      <article class="why-card">
        <div class="why-num">REASON — 01</div>
        <h3>No rewriting history</h3>
        <p>If the system holding the money could also edit the evidence, a dispute would be unwinnable. Proof lives apart, so the record of what happened can’t be adjusted to fit who’s holding the funds.</p>
      </article>
      <article class="why-card">
        <div class="why-num">REASON — 02</div>
        <h3>No moving goalposts</h3>
        <p>Terms are signed and versioned in Commerce. When the deal changes, it becomes a new version — the old one stays readable. Nobody “remembers” a different price, deadline, or deliverable.</p>
      </article>
      <article class="why-card">
        <div class="why-num">REASON — 03</div>
        <h3>No money on vibes</h3>
        <p>Escrow doesn’t release funds because someone asked nicely. It executes against Terms, checked against Proof. Custody, execution, and settlement stay mechanical — on purpose.</p>
      </article>
    </div>

    <div class="compare">
      <div class="compare-box bad">
        <h3>✕ &nbsp;One protocol does everything</h3>
        <ul>
          <li><strong>One breach, total loss</strong> — evidence, agreement, and funds in one blast radius.</li>
          <li><strong>Disputes turn into opinions</strong> — whoever controls the system controls the story.</li>
          <li><strong>Every fix risks everything</strong> — change the money logic, risk the record.</li>
        </ul>
      </div>
      <div class="compare-box good">
        <h3>✓ &nbsp;Three pillars, hard edges</h3>
        <ul>
          <li><strong>Contained failure</strong> — a problem in one pillar doesn’t hand over the other two.</li>
          <li><strong>Disputes turn into checks</strong> — compare Proof against Terms, then settle.</li>
          <li><strong>Each part can evolve alone</strong> — upgrade one pillar without rebuilding the vault.</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<!-- ============ FLOW ============ -->
<section class="block alt" id="flow">
  <div class="wrap">
    <div class="eyebrow">How a deal moves</div>
    <h2>From handshake <em>to settlement.</em></h2>
    <p class="lead">A counterparty deal, end to end. Step through it — notice that <strong>money moves last</strong>, and only after the other two pillars agree.</p>

    <div class="flow-steps" id="flowSteps" role="list"></div>
    <div class="flow-panel" id="flowPanel"></div>
  </div>
</section>

<!-- ============ AT A GLANCE ============ -->
<section class="block">
  <div class="wrap">
    <div class="eyebrow">At a glance</div>
    <h2>The whole system <em>on one screen.</em></h2>

    <div class="glance" role="table" aria-label="PPV pillars at a glance">
      <div class="g-row" role="row">
        <div class="g-cell g-head">Pillar</div>
        <div class="g-cell g-head">Owns</div>
        <div class="g-cell g-head">Answers</div>
        <div class="g-cell g-head">Never does</div>
      </div>
      <div class="g-row" role="row">
        <div class="g-cell g-pillar" style="color:var(--green-dim)"><small>Pillar</small>Core — Proof</div>
        <div class="g-cell"><small>Owns</small>Facts · Evidence · Timestamps</div>
        <div class="g-cell"><small>Answers</small>“What actually happened, and when?”</div>
        <div class="g-cell"><small>Never does</small>Hold or move money. Rewrite a term.</div>
      </div>
      <div class="g-row" role="row">
        <div class="g-cell g-pillar" style="color:#8B2FE0"><small>Pillar</small>Commerce — Terms</div>
        <div class="g-cell"><small>Owns</small>Agreements · Signatures · Versions</div>
        <div class="g-cell"><small>Answers</small>“What did everyone agree to?”</div>
        <div class="g-cell"><small>Never does</small>Invent evidence. Release funds on its own.</div>
      </div>
      <div class="g-row" role="row">
        <div class="g-cell g-pillar" style="color:#C65300"><small>Pillar</small>Escrow — Money</div>
        <div class="g-cell"><small>Owns</small>Custody · Execution · Settlements</div>
        <div class="g-cell"><small>Answers</small>“Where is the money, and when does it move?”</div>
        <div class="g-cell"><small>Never does</small>Change the deal. Edit the record.</div>
      </div>
    </div>
    <p class="lead" style="font-size:14.5px;margin-top:16px">In dark mode the pillar names glow green, purple, and orange — same as the monoliths on the poster.</p>
  </div>
</section>

<!-- ============ POSTER + PRINCIPLES ============ -->
<section class="block alt">
  <div class="wrap">
    <div class="closing">
      <div>
        <div class="poster-frame">
          <img src="/brand/ppv/ppv-explainer-poster.jpg" alt="Original PPV poster: three glowing monoliths on black rock — green Core for Proof, purple Commerce for Terms, orange Escrow for Money — under the headline ‘PPV isn’t one protocol. It’s three.’" loading="lazy" />
          <div class="poster-cap">The original poster this page explains. Left: People · Pay · Value. Right: Build · Own · Earn · Repeat. Bottom: Grind With A Purpose.</div>
        </div>
      </div>
      <div>
        <div class="eyebrow">The principles</div>
        <h2 style="font-size:clamp(28px,4vw,40px)">What PPV <em>refuses</em> to do</h2>
        <ul class="principles">
          <li><span class="n">01</span><div><strong>Refuses the screenshot economy</strong><span>A screenshot is a claim, not proof. PPV wants the fact, the evidence, and the timestamp — sealed when it happened.</span></div></li>
          <li><span class="n">02</span><div><strong>Refuses the quiet edit</strong><span>Changed terms become a new signed version. The history of the deal stays visible to the people in the deal.</span></div></li>
          <li><span class="n">03</span><div><strong>Refuses custody without conditions</strong><span>Holding money means holding it against written terms — not holding it hostage, and not releasing it early.</span></div></li>
          <li><span class="n">04</span><div><strong>Refuses to be one thing</strong><span>Proof, Terms, and Money stay separate systems. That friction is the security model, not a bug in it.</span></div></li>
        </ul>

        <div class="faq">
          <details>
            <summary>Is PPV live right now?</summary>
            <p>No — PPV is in development inside the GWAP ecosystem, including PPV Commerce work in devnet mode with a counterparty inbox. This page explains the architecture and the thinking. It is not a launch announcement, and there is nothing to buy, connect, or deposit here.</p>
          </details>
          <details>
            <summary>Is PPV a wallet or a token?</summary>
            <p>Neither, as described on the poster. PPV is a structure for deals: a proof layer (Core), a terms layer (Commerce), and a money layer (Escrow). Wallets and payment rails plug into the Escrow side — they aren’t the vault itself.</p>
          </details>
          <details>
            <summary>What kind of deal is this for?</summary>
            <p>Any deal where two sides don’t fully trust each other yet and the stakes are real: commissioned work, private sales, milestone-based projects, collaborations — anywhere “he said / she said” plus money on the line is the current system.</p>
          </details>
          <details>
            <summary>Why “Private”?</summary>
            <p>The record of your deal is yours. Proof doesn’t have to mean public. The vault is built so a deal can be verified by the people who need to verify it — without broadcasting the deal to everyone else.</p>
          </details>
        </div>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <div class="foot-brand">P<span>P</span>V — PRIVATE PROOF VAULT</div>
        <p class="foot-small">A GWAP ecosystem project. Grind With A Purpose. Proof. Terms. Money — built separately, on purpose.</p>
      </div>
      <nav class="foot-links" aria-label="Page sections">
        <a href="/">← Back to GWAP</a>
        <a href="/ecosystem/private-proof-vault">PPV in the ecosystem</a>
        <a href="#pillars">The pillars</a>
        <a href="#flow">How a deal moves</a>
        <a href="https://www.instagram.com/_gwapspot" target="_blank" rel="noopener">@_gwapspot on Instagram ↗</a>
      </nav>
    </div>
    <p class="disclaimer">Explainer only. PPV is in development and is not a public production product; nothing on this page is a financial offer, a custody service, or a request to send funds anywhere. Details describe the architecture presented in the original PPV poster and GWAP’s stated design direction.</p>
  </div>
</footer>

<script>
(function(){
  "use strict";

  /* ---------- Pillar deep-dive ---------- */
  var PILLARS = {
    core: {
      badge: "01 · Core", cls: "c-green", dot: "#13DD13",
      title: "Proof",
      one: "The record of what actually happened.",
      body: "Core is the memory of the deal. Deliverables, messages, files, milestones — captured as facts with evidence and timestamps, in the order they happened. When a dispute starts, nobody argues from memory or screenshots. You open Core and read the record. Core doesn't judge the deal and it doesn't touch the money. It just makes sure the truth of the deal survives the deal.",
      owns: ["Facts — what was said, sent, and delivered", "Evidence — the files and records behind each fact", "Timestamps — when it happened, in sequence"],
      neverTitle: "Core never…",
      never: "…holds funds, releases payments, or edits an agreement. <strong>A witness that can also pay itself isn't a witness.</strong>"
    },
    commerce: {
      badge: "02 · Commerce", cls: "c-purple", dot: "#B04DFF",
      title: "Terms",
      one: "The agreement, signed and versioned.",
      body: "Commerce is where a handshake becomes a deal. Price, scope, deadlines, deliverables, and what happens if things go sideways — written down, signed by both sides, and locked as a version. Need to change something mid-deal? That's a new version, signed again. The old version never disappears, so the history of the agreement is as provable as the agreement itself.",
      owns: ["Agreements — price, scope, deadlines, deliverables", "Signatures — both sides, bound to the exact version", "Versions — every change, kept and readable"],
      neverTitle: "Commerce never…",
      never: "…creates evidence or moves money. <strong>It defines the rules — it doesn't get to play referee and banker too.</strong>"
    },
    escrow: {
      badge: "03 · Escrow", cls: "c-orange", dot: "#FF7A1A",
      title: "Money",
      one: "Custody with conditions, not custody with trust.",
      body: "Escrow is where funds wait. Money goes in against signed Terms and comes out when Proof shows the Terms were met — that's execution and settlement. Escrow doesn't negotiate, doesn't reinterpret the deal, and doesn't improvise. Its whole job is mechanical: hold it safely, check the conditions, move it exactly as agreed. Boring on purpose.",
      owns: ["Custody — funds held against the signed terms", "Execution — releases triggered by conditions, not requests", "Settlements — final movement, matched to the record"],
      neverTitle: "Escrow never…",
      never: "…rewrites terms or edits proof to justify a release. <strong>If the money could change the story, the story would always fit the money.</strong>"
    }
  };

  var panel = document.getElementById("pillarPanel");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".ptab"));

  function renderPillar(key){
    var p = PILLARS[key];
    var ownsHtml = p.owns.map(function(o){ return "<li>" + o + "</li>"; }).join("");
    panel.innerHTML =
      '<div class="panel-grid">' +
        '<div>' +
          '<span class="panel-badge ' + p.cls + '"><i style="background:' + p.dot + '"></i>' + p.badge + '</span>' +
          '<div class="panel-title">' + p.title + '</div>' +
          '<p class="panel-one">' + p.one + '</p>' +
          '<p class="panel-body">' + p.body + '</p>' +
        '</div>' +
        '<div>' +
          '<div class="owns"><h4 class="' + p.cls + '">What it owns</h4><ul>' + ownsHtml + '</ul></div>' +
          '<div class="never"><h4>' + p.neverTitle + '</h4><p>' + p.never + '</p></div>' +
        '</div>' +
      '</div>';
    tabs.forEach(function(t){ t.setAttribute("aria-selected", t.getAttribute("data-pillar") === key ? "true" : "false"); });
  }
  tabs.forEach(function(t){
    t.addEventListener("click", function(){ renderPillar(t.getAttribute("data-pillar")); });
  });
  renderPillar("core");

  /* ---------- Deal flow stepper ---------- */
  var FLOW = [
    {
      label: "Agree", title: "1 — Terms are written & signed",
      body: "Both sides meet in the counterparty inbox and draft the deal in Commerce: price, scope, deadline, deliverables. Both sign. That signed version is now the only version of the truth about the deal.",
      chips: [{t:"Commerce · Terms", c:"purple"}]
    },
    {
      label: "Fund", title: "2 — Money enters escrow",
      body: "The buyer funds Escrow against those exact signed terms. The money is now held — not sent. The seller can see it's real and locked; the buyer knows it can't move early.",
      chips: [{t:"Escrow · Custody", c:"orange"}, {t:"Checked against Terms", c:"purple"}]
    },
    {
      label: "Build", title: "3 — Work happens, proof accumulates",
      body: "As the work gets done, Core captures it: deliverables, milestones, sign-offs — each one timestamped as evidence. No end-of-deal scramble to reconstruct what happened. The record builds itself while the deal is alive.",
      chips: [{t:"Core · Proof", c:"green"}]
    },
    {
      label: "Verify", title: "4 — Proof is checked against Terms",
      body: "Delivery time. The evidence in Core is compared to the signed version in Commerce. Did what happened match what was agreed? This is the moment screenshots and arguments used to decide — now it's a check.",
      chips: [{t:"Core · Proof", c:"green"}, {t:"Commerce · Terms", c:"purple"}]
    },
    {
      label: "Settle", title: "5 — Escrow executes the settlement",
      body: "Conditions met, Escrow releases the funds exactly as the terms say. If the proof doesn't match the terms, the money doesn't move on a promise — the record shows both sides why. Deal closed, record sealed.",
      chips: [{t:"Escrow · Settlement", c:"orange"}, {t:"Record sealed in Core", c:"green"}]
    }
  ];

  var stepsWrap = document.getElementById("flowSteps");
  var flowPanel = document.getElementById("flowPanel");
  var current = 0;

  FLOW.forEach(function(s, i){
    var b = document.createElement("button");
    b.className = "fstep";
    b.type = "button";
    b.setAttribute("role", "listitem");
    b.innerHTML = "<small>Step " + (i+1) + " of " + FLOW.length + "</small><strong>" + s.label + "</strong>";
    b.addEventListener("click", function(){ renderFlow(i); });
    stepsWrap.appendChild(b);
  });
  var stepBtns = Array.prototype.slice.call(stepsWrap.children);

  function renderFlow(i){
    current = i;
    var s = FLOW[i];
    stepBtns.forEach(function(b, j){ b.setAttribute("aria-current", j === i ? "true" : "false"); });
    var chips = s.chips.map(function(c){ return '<span class="chip ' + c.c + '">' + c.t + '</span>'; }).join("");
    flowPanel.innerHTML =
      '<h3>' + s.title + '</h3>' +
      '<p>' + s.body + '</p>' +
      '<div class="flow-meta">' + chips + '</div>' +
      '<div class="flow-nav">' +
        '<button type="button" id="flowPrev"' + (i === 0 ? " disabled" : "") + '>← Back</button>' +
        '<button type="button" id="flowNext" class="primary"' + (i === FLOW.length - 1 ? " disabled" : "") + '>' + (i === FLOW.length - 2 ? "Final step →" : "Next step →") + '</button>' +
      '</div>';
    var prev = document.getElementById("flowPrev");
    var next = document.getElementById("flowNext");
    if (prev) prev.addEventListener("click", function(){ if (current > 0) renderFlow(current - 1); });
    if (next) next.addEventListener("click", function(){ if (current < FLOW.length - 1) renderFlow(current + 1); });
  }
  renderFlow(0);
})();
</script>
</body>
</html>`;

export function GET() {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

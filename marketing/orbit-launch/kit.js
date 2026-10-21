/* Unifesto Orbit launch kit: pieces shared by orbit.html (videos) and stills.html.
   Everything is a pure function of its inputs (and of t for the sky), so any frame can be rendered on its own.
   Orbit pieces are ported from websites/web/src/components/visuals/Orbit.tsx and websites/web/src/lib/site.ts. */
(function () {
  const U_PATH = "M 27.55 1.63 C 22.5 1.63 18.13 0.74 14.44 -1.03 C 10.75 -2.8 7.91 -5.34 5.94 -8.64 C 3.96 -11.94 2.97 -15.84 2.97 -20.34 L 2.97 -46.08 L 19.44 -46.08 L 19.44 -22.05 C 19.44 -17.79 20.75 -14.45 23.39 -12.05 C 26.04 -9.65 29.73 -8.45 34.47 -8.45 C 40.16 -8.45 44.62 -9.92 47.83 -12.86 C 51.05 -15.8 52.66 -19.92 52.66 -25.2 L 52.66 -46.08 L 69.03 -46.08 L 69.03 0 L 54.72 0 L 53.02 -11.44 L 52.92 -11.44 C 50.82 -7.41 47.56 -4.23 43.16 -1.89 C 38.75 0.45 33.55 1.63 27.55 1.63 Z";
  const BRAND = "../brand-2026/svg/";

  const STEPS = [
    ["Map", "Make a list of every club on your campus."],
    ["Onboard", "Each club creates its Space on Unifesto and joins your campus."],
    ["Activate", "The club publishes its first event. That makes it an active club."],
    ["Support", "Be the first help for organisers on your campus."],
  ];
  const TIERS = [
    ["Lead", "Pass the first 30 days", ["Orbit certificate", "Orbit badge", "The Lead welcome kit"]],
    ["Bronze", "5 active clubs", ["Letter of recommendation signed by the founder", "A feature on Unifesto's socials"]],
    ["Silver", "10 active clubs and 1 paid event", ["Free Pro plan for your own club", "A limited-edition hoodie every quarter"]],
    ["Gold", "15 active clubs, or bring your fest onto Unifesto", ["Fast-track interview for a paid internship", "A shot at Orbit Lead of the Year"]],
  ];
  const RINGS = [
    { r: .36, secs: 26, bodies: [["Coding club", 30], ["Music", 210]] },
    { r: .68, secs: 40, bodies: [["Dance crew", 120], ["E-Cell", 300]] },
    { r: 1, secs: 58, bodies: [["TEDx", 70], ["Fest committee", 180], ["Robotics", 315]] },
  ];

  // ---------- small helpers ----------
  const html = s => { const t = document.createElement("template"); t.innerHTML = s.trim(); return t.content.firstElementChild; };
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function erfc(x) { const z = Math.abs(x), t = 1 / (1 + .3275911 * z);
    const y = t * (.254829592 + t * (-.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z); return x >= 0 ? y : 2 - y; }

  // ---------- sky: starfield + planet horizon, drawn per pixel and dithered so dark gradients never band ----------
  // planet: { top, rx, ry } in stage px (its limb touches y = top at the centre).
  function sky(canvas, W, H, planet, seed = 20261021) {
    const DPR = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    const ctx = canvas.getContext("2d"); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const rnd = mulberry32(seed);
    const stars = Array.from({ length: Math.round(W * H / 9000) }, () => {
      const d = Math.pow(rnd(), 2.2);
      return { x: rnd() * W, y: rnd() * H, z: .15 + .85 * d, r: .5 + 1.2 * d + .25 * rnd(), a: .2 + .5 * d + .25 * rnd(), f: .2 + rnd() * .8, p: rnd() * 6.283 };
    });
    const layers = {};
    if (planet) {
      const PL = { cx: W / 2, cy: planet.top + planet.ry, rx: planet.rx, ry: planet.ry };
      const y0 = Math.max(0, planet.top - 260), hh = Math.round((H - y0) * DPR), w = canvas.width;
      const sd = (x, y, up) => { const X = (x - PL.cx) / PL.rx, Y = (y - PL.cy + up) / PL.ry, e = Math.sqrt(X * X + Y * Y) || 1e-9;
        return (e - 1) / (Math.sqrt(X * X / (PL.rx * PL.rx) + Y * Y / (PL.ry * PL.ry)) / e); };
      const cov = d => d < -.5 ? 1 : d > .5 ? 0 : .5 - d, blur = (d, s) => .5 * erfc(d / (s * 1.41421356));
      const mk = () => { const c = document.createElement("canvas"); c.width = w; c.height = hh; return c; };
      const base = mk(), lit = mk(), bi = base.getContext("2d").createImageData(w, hh), li = lit.getContext("2d").createImageData(w, hh), bp = bi.data, lp = li.data;
      const rn = mulberry32(1500);
      for (let j = 0, i = 0; j < hh; j++) {
        const y = y0 + (j + .5) / DPR;
        for (let k = 0; k < w; k++, i += 4) {
          const x = (k + .5) / DPR, d0 = sd(x, y, 0), body = cov(d0);
          if (d0 > 420) { bp[i + 3] = 0; lp[i + 3] = 255; continue; }                  // far above the limb: nothing to draw
          const t = Math.min(1, Math.hypot((x - PL.cx) / (PL.rx * 1.4), (y - planet.top) / (PL.ry * 2.8)) / .6);
          const light = 1 - (1 - .22 * cov(sd(x, y, 2))) * (1 - .08 * blur(sd(x, y, 40), 60));
          const a = body + (1 - body) * light, u = rn();
          if (a > 0) { const cr = (body * 26 * (1 - t) + (1 - body) * light * 255) / a, cb = (body * 29 * (1 - t) + (1 - body) * light * 255) / a;
            bp[i] = bp[i + 1] = Math.min(255, Math.floor(cr + u)); bp[i + 2] = Math.min(255, Math.floor(cb + u)); bp[i + 3] = Math.min(255, Math.floor(a * 255 + rn())); }
          if (body < 1) {            // sunrise / pulse layer: brighter rim and two wider glows, added on top
            const fv = (1 - (1 - .9 * cov(sd(x, y, 3))) * (1 - .34 * blur(sd(x, y, 30), 45)) * (1 - .16 * blur(sd(x, y, 80), 110))) * (1 - body) * 255;
            lp[i] = lp[i + 1] = lp[i + 2] = Math.min(255, Math.floor(fv + rn()));
          }
          lp[i + 3] = 255;
        }
      }
      base.getContext("2d").putImageData(bi, 0, 0); lit.getContext("2d").putImageData(li, 0, 0);
      Object.assign(layers, { base, lit, y0 });
    }
    // draw(t, { glow 0..1, shine 0..1, drift px/s })
    return function draw(t, o = {}) {
      ctx.clearRect(0, 0, W, H);
      const dx = (o.drift ?? 6) * t, dy = (o.drift ?? 6) * .6 * t;
      ctx.fillStyle = "#fff";
      for (const s of stars) {
        const x = ((s.x - dx * s.z) % W + W) % W, y = ((s.y + dy * s.z) % H + H) % H;
        ctx.globalAlpha = Math.min(1, s.a * (.8 + .2 * Math.sin(6.283 * s.f * t + s.p)) * (1 + .8 * (o.shine || 0)));
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (layers.base) {
        ctx.drawImage(layers.base, 0, layers.y0, W, H - layers.y0);
        if ((o.glow || 0) > .002) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, o.glow);
          ctx.drawImage(layers.lit, 0, layers.y0, W, H - layers.y0); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
      }
    };
  }

  // ---------- Orbit badge (OrbitBadge in Orbit.tsx) ----------
  const METAL = { Lead: ["#8fa8ff", "#cdd8ff"], Bronze: ["#b9825a", "#e4b48c"], Silver: ["#b8bdc9", "#eef0f5"], Gold: ["#d6ac4e", "#f6dc94"] };
  let badgeN = 0;
  function badge(tier, size) {
    const [ring, core] = METAL[tier], id = "ob" + badgeN++;
    return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" class="badge"><defs>
      <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${core}"/><stop offset="55%" stop-color="${ring}"/><stop offset="100%" stop-color="${core}"/></linearGradient>
      <path id="${id}t" d="M 18 60 A 42 42 0 0 1 102 60" fill="none"/><path id="${id}b" d="M 15 60 A 45 45 0 0 0 105 60" fill="none"/></defs>
      <circle cx="60" cy="60" r="57" fill="#0b0c10" stroke="${ring}" stroke-width="2"/>
      <circle cx="60" cy="60" r="34" fill="none" stroke="${ring}" stroke-opacity=".3" stroke-width="1" stroke-dasharray="2 4"/>
      <text fill="${ring}" font-size="9" letter-spacing="3.2" font-weight="600" font-family="Hanken Grotesk"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">UNIFESTO</textPath></text>
      <text fill="${ring}" font-size="9" letter-spacing="3.2" font-weight="600" font-family="Hanken Grotesk" dominant-baseline="hanging"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">ORBIT</textPath></text>
      <circle cx="12" cy="60" r="1.8" fill="${ring}"/><circle cx="108" cy="60" r="1.8" fill="${ring}"/>
      <ellipse cx="60" cy="60" rx="30" ry="8" fill="none" stroke="${ring}" stroke-opacity=".45" stroke-width="1" transform="rotate(-18 60 60)"/>
      <path d="${U_PATH}" fill="url(#${id}m)" transform="translate(42 72) scale(0.5)"/><circle cx="82" cy="48" r="3" fill="${core}"/></svg>`;
  }

  // ---------- the Orbit Lead ID card, front and back (OrbitIdCard). k = scale (1 = the site's 384px card) ----------
  const ringsSvg = (cls, style) => `<svg class="rings ${cls}" style="${style}" viewBox="0 0 200 200"><g fill="none" stroke="#fff" stroke-width="1" transform="rotate(-18 100 100)"><ellipse cx="100" cy="100" rx="95" ry="30"/><ellipse cx="100" cy="100" rx="70" ry="22"/></g></svg>`;
  function idCard(k) {
    const rows = [["Name", "Ananya R."], ["Campus", "MRU"], ["City", "Hyderabad, Telangana"], ["Batch", "2023-27"], ["Blood group", "B+"]];
    const bars = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2].map(w => `<i style="width:${w}em"></i>`).join("");
    return html(`<div class="idc" style="font-size:${k}px"><div class="flip">
      <div class="face front">${ringsSvg("", "right:-64em;bottom:-80em;width:256em;height:256em")}
        <div class="slot"><i></i></div>
        <div class="band"><svg viewBox="0 0 64 40" style="width:40em;height:24em"><ellipse cx="32" cy="22" rx="27" ry="7" fill="none" stroke="rgb(255 255 255 / .45)" stroke-width="1.2" transform="rotate(-18 32 22)"/><path d="${U_PATH}" fill="#fff" transform="translate(18.5 32) scale(0.38)"/><circle cx="55" cy="13" r="2" fill="#fff"/></svg><span>Orbit Lead</span></div>
        <div class="holo"></div>
        <div class="body"><div class="photo"><b>AR</b></div><div class="rows">${rows.map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join("")}</div></div>
        <div class="foot"><small>Represents Unifesto, not the college.</small><span class="bars">${bars}</span></div>
      </div>
      <div class="face back">${ringsSvg("", "left:50%;top:50%;width:288em;height:288em;margin:-144em 0 0 -144em;opacity:.06")}
        <div class="slot"><i></i></div>
        <div class="mid"><img src="${BRAND}wordmark-silver.svg" alt=""><span>Orbit • Campus programme</span></div>
        <div class="holo" style="opacity:.4"></div>
        <div class="foot"><small>If found, please return to orbit@unifesto.app</small><small style="opacity:.8">Valid while an Orbit Lead</small></div>
      </div></div></div>`);
  }

  // ---------- campus as a solar system (OrbitSystem). size = outer ring diameter; place(el, t) moves the clubs ----------
  function orbitSystem(size, font = 20) {
    const el = html(`<div class="osys" style="width:${size}px;height:${size}px;font-size:${font}px"></div>`);
    const bodies = [];
    RINGS.forEach(r => {
      const d = size * r.r;
      el.appendChild(html(`<div class="ring" style="left:${(size - d) / 2}px;top:${(size - d) / 2}px;width:${d}px;height:${d}px"></div>`));
      r.bodies.forEach(([label, at]) => {
        const b = html(`<div class="body"><div class="chip"><i></i>${label}</div></div>`); el.appendChild(b);
        bodies.push({ b, r: d / 2, at, secs: r.secs });
      });
    });
    const c = size * .24;
    el.appendChild(html(`<div class="core" style="left:${(size - c) / 2}px;top:${(size - c) / 2}px;width:${c}px;height:${c}px"><span style="font-size:${c * .13}px">Unifesto</span></div>`));
    el.place = t => bodies.forEach(o => {
      const a = (o.at + 360 * t / o.secs - 90) * Math.PI / 180;
      o.b.style.transform = `translate(${(size / 2 + o.r * Math.cos(a)).toFixed(2)}px,${(size / 2 + o.r * Math.sin(a)).toFixed(2)}px)`;
    });
    el.place(0);
    return el;
  }

  const stops = () => STEPS.map(([h, p], i) => `<div class="stop"><span class="dot"></span><span class="n">Stop ${i + 1}</span><h3>${h}</h3><p>${p}</p></div>`).join("");
  const tiers = (bs = 96) => TIERS.map(([n, bar, rw]) => `<div class="tier card">${badge(n, bs)}<h3>${n}</h3><div class="bar">${bar}</div><ul>${rw.map(r => `<li>${r}</li>`).join("")}</ul></div>`).join("");
  const cert = () => `<div class="cert card"><div class="in2">
    <p class="k">Unifesto Orbit</p><p class="t">Certificate of Recognition</p><p class="s">This certifies that</p><p class="nm">Ananya R.</p>
    <p class="p">served as Orbit Lead for MRU, Hyderabad, brought 7 clubs onto Unifesto and reached the Bronze tier.</p>
    <div class="sig"><span><svg width="120" height="32" viewBox="0 0 96 26"><path d="M2 18c8-12 14-12 12 0s8-14 14-6 4 8 10-2 10-4 12 4 10-2 16-6 12 2 16 0" fill="none" stroke="rgb(255 255 255 / .7)" stroke-width="1.4" stroke-linecap="round"/></svg><div>Founder, Unifesto</div></span>${badge("Bronze", 80)}</div>
    <p class="v">Sample certificate · Verify at unifesto.app/verify</p></div></div>`;
  const startPanel = () => `<div class="panel card"><div class="ph"><i></i>My start period</div><div class="pb">
    <div class="top"><b class="day">Day 1 of 30</b><span class="cnt">0 of 2 clubs onboarded</span></div><div class="bar"><i></i></div>
    <div class="club c1"><span>Coding Club</span><span>Joined campus</span></div><div class="club c2"><span>Dance Crew</span><span>Joined campus</span></div></div></div>`;

  const fonts = () => Promise.all(['400 40px "Michroma"', '300 40px "Hanken Grotesk"', '400 40px "Hanken Grotesk"', '500 40px "Hanken Grotesk"', '600 40px "Hanken Grotesk"']
    .map(f => document.fonts.load(f))).then(() => document.fonts.ready)
    .then(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));

  window.Kit = { U_PATH, BRAND, html, sky, badge, idCard, orbitSystem, stops, tiers, cert, startPanel, fonts, mulberry32 };
})();

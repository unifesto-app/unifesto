// Shared helpers for the templates. A template calls Kit.run(DEFAULTS, build): build(data) returns the HTML of
// one or more <section class="page"> elements. render.py injects window.DATA (from a piece's JSON) before load;
// opening a template straight in a browser shows its DEFAULTS.
const Kit = {
  WORDMARK: "../brand-2026/svg/wordmark-silver.svg",
  warnings: [],

  esc: (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]),
  // copy fields allow *word* for a dimmed run and a line break on "\n"; everything else is escaped
  rich: (s) => Kit.esc(s).replace(/\*(.+?)\*/g, '<span class="dim">$1</span>').replace(/\n/g, "<br>"),

  page(w, h, cls, inner, style = "") {
    return `<section class="page ${cls}" style="width:${w}px;height:${h}px;--u:${Math.max(w, h) / 100}px;${style}">${inner}</section>`;
  },

  // The cosmos backdrop. opts: { horizon: "88%" | false, planet: false, scrim: "22% 45%" | false, ground: true }
  sky(o = {}) {
    const [sx, sy] = (o.scrim || "22% 45%").split(" ");
    return `<div class="sky" style="${o.horizon ? `--horizon:${o.horizon};` : ""}--scrim-x:${sx};--scrim-y:${sy};${o.style || ""}">
      ${o.horizon && o.ground !== false ? '<div class="ground"></div>' : ""}
      <div class="stars-far"></div><div class="stars"></div>
      <div class="orbit orbit-a"></div><div class="orbit orbit-b"></div>
      ${o.planet === false ? "" : '<div class="planet"></div>'}
      <div class="frame"></div>
      ${o.horizon ? '<div class="horizon"></div>' : ""}
      ${o.scrim === false ? "" : '<div class="scrim"></div>'}
    </div>`;
  },

  wordmark: (h, style = "") => `<img class="wm" src="${Kit.WORDMARK}" alt="Unifesto" style="height:${h}px;${style}">`,

  // A screenshot in a device frame, `width` px wide (the screen, not the bezel).
  // spec: "path.jpg" or { src, frame: "phone" | "browser", crop: [x, y, w, h] in source px, url: "space.unifesto.app" }.
  // frame defaults to "phone" when the file name contains "mobile". Shown above native size = a warning.
  shot(spec, width, style = "") {
    const s = typeof spec === "string" ? { src: spec } : spec;
    const frame = s.frame || (/mobile/.test(s.src) ? "phone" : "browser");
    const c = s.crop;
    const box = c ? `height:${(width * c[3]) / c[2]}px` : "";
    const img = `<div class="shot" style="width:${width}px;${box}" ${c ? `data-crop="${c.join(",")}"` : ""}><img src="${Kit.esc(s.src)}" data-w="${width}" alt=""></div>`;
    if (frame === "phone") return `<div class="phone" style="${style}">${img}</div>`;
    return `<div class="browser" style="${style}"><div class="bar"><i></i><i></i><i></i><span>${Kit.esc(s.url || "space.unifesto.app")}</span></div>${img}</div>`;
  },

  async run(defaults, build) {
    const data = window.DATA || defaults;
    document.body.innerHTML = build(data);
    await document.fonts.ready;
    for (const img of document.images) {
      try { await img.decode(); } catch { Kit.warnings.push(`image failed to load: ${img.getAttribute("src")}`); continue; }
      const box = img.closest(".shot");
      if (!box) continue;
      const w = +img.dataset.w, c = box.dataset.crop?.split(",").map(Number);
      const srcW = c ? c[2] : img.naturalWidth;
      if (w > srcW + 0.5) Kit.warnings.push(`${img.getAttribute("src")} shown at ${w}px but only ${srcW}px wide (upscaled, will look soft)`);
      if (c) {
        const k = w / c[2];
        Object.assign(img.style, { width: `${img.naturalWidth * k}px`, left: `${-c[0] * k}px`, top: `${-c[1] * k}px` });
      }
    }
    window.ready = true;
  },
};

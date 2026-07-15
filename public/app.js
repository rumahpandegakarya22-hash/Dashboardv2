/* =========================================================================
   Kost Tiga Dara — Management Dashboard  (Figma → Code)
   Vanilla JS. Login + 5 role dashboards, charts, data tables.
   Data mirrors the Google Spreadsheets (Database Penghuni, Input Transaksi,
   Log Sales/Marketing). Auth handled by the Express backend (/api/*).
   ========================================================================= */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ utils */
  // esc(): escape HTML supaya data dari spreadsheet/registrasi tidak bisa meng-inject
  // markup/script saat dirender via innerHTML. safeUrl(): hanya izinkan http(s)/mailto/tel
  // (blokir javascript:, data:, dll) untuk href tombol/link.
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => { const s = String(u == null ? "" : u).trim(); return /^(https?:\/\/|mailto:|tel:)/i.test(s) ? s : "#"; };
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const initials = (name) => (name || "?").split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const slug = (s) => String(s || "").toLowerCase().replace(/[()]/g, "").trim().replace(/\s+/g, "-");
  // normalisasi nomor HP Indonesia → format wa.me (62…): buang non-digit, 0→62, 8xx→62, +62/62 tetap
  const digits = (s) => {
    let d = String(s || "").replace(/[^0-9]/g, "");
    if (!d) return "";
    if (d.startsWith("62")) return d;
    if (d.startsWith("0")) return "62" + d.slice(1);
    if (d.startsWith("8")) return "62" + d;     // nomor tanpa 0 di depan (mis. 895329656137)
    return d;
  };
  // tampilan No HP rapi: pakai 0 di depan (08xx), buang keterangan seperti "(kakak)"
  const fmtHP = (s) => { const d = digits(s); return d ? (d.startsWith("62") ? "0" + d.slice(2) : d) : "—"; };
  // format angka dengan pemisah ribuan (id-ID) + satuan opsional → callout & axis
  const fmtNum = (n, unit) => { const x = Number(n); const s = isNaN(x) ? String(n) : x.toLocaleString("id-ID"); return unit ? s + " " + unit : s; };
  // tick sumbu Y dinamis: count label dari 0..max (dibulatkan), untuk grafik apa pun
  const niceTicks = (max, count, unit) => {
    count = count || 4; const top = Math.max(1, Math.ceil(Number(max) || 0));
    return Array.from({ length: count }, (_, i) => fmtNum(Math.round((top / (count - 1)) * i), unit));
  };
  // sparkline asli dari array data (mengganti ornamen gelombang di scorecard)
  const sparkline = (series, color) => {
    const s = (Array.isArray(series) && series.length > 1) ? series.map(Number) : [0, 0];
    const w = 120, h = 34, max = Math.max(...s), min = Math.min(...s), rng = (max - min) || 1;
    const X = (i) => (i / (s.length - 1)) * w, Y = (v) => h - 3 - ((v - min) / rng) * (h - 6);
    const pts = s.map((v, i) => [X(i), Y(v)]);
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0,y0]=pts[Math.max(0,i-1)],[x1,y1]=pts[i],[x2,y2]=pts[i+1],[x3,y3]=pts[Math.min(pts.length-1,i+2)];
      const cp1x=x1+(x2-x0)/6,cp1y=y1+(y2-y0)/6,cp2x=x2-(x3-x1)/6,cp2y=y2-(y3-y1)/6;
      d += ` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${color || "rgba(255,255,255,.65)"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  // hitung jumlah baris per bulan (untuk sparkline metrik berbasis tanggal)
  const monthlyCount = (rows, dateKey) => { const m = Array(12).fill(0); (rows || []).forEach((r) => { const d = parseDate(r && r[dateKey]); if (d) m[d.getMonth()]++; }); return m; };

  // === Satuan uang OTOMATIS: pilih rb/Jt/M sesuai besaran (hindari "ribu" saat sudah jutaan) ===
  const moneyScale = (max) => { const m = Math.abs(Number(max) || 0); if (m >= 1e9) return { div: 1e9, unit: "M" }; if (m >= 1e6) return { div: 1e6, unit: "Jt" }; if (m >= 1e3) return { div: 1e3, unit: "rb" }; return { div: 1, unit: "" }; };
  const scaleVals = (arr, sc) => (arr || []).map(v => Math.round((Number(v) / sc.div) * 10) / 10);
  // === Badge tren scorecard dihitung dari DERET data (sparkline). Hijau = naik, Merah = turun. ===
  const trendBadge = (series) => {
    const s = (Array.isArray(series) ? series : []).map(Number).filter(v => !isNaN(v));
    const nz = s.filter(v => v !== 0);
    if (s.length < 2 || nz.length < 1) return { badge: "0%", dir: "up", pct: 0 };
    const last = s[s.length - 1];
    let base = 0; for (let i = s.length - 2; i >= 0; i--) { if (s[i] !== 0) { base = s[i]; break; } }
    if (!base) base = nz[0];
    const pct = base ? Math.round(((last - base) / Math.abs(base)) * 100) : 0;
    return { badge: Math.abs(pct) + "%", dir: pct >= 0 ? "up" : "down", pct };
  };

  /* ---------------------------------------------------------------- icons */
  const I = {
    home:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>',
    sun:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
    bell:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    sidebar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>',
    expand:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    menu:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    plus:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    filter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>',
    sort:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3"/></svg>',
    cal:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
    caret: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    arrowR:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    arrowL:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    up:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 6-6 6 6"/></svg>',
    down:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 10 6 6 6-6"/></svg>',
    logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>',
    lock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    wa:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.2 1.2-1.7 1.2-.4 0-1 .1-3.3-.9-2.7-1.2-4.4-4-4.5-4.2-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.6-.3h.5c.2 0 .4 0 .6.5l.7 1.8c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.1.3.7 1.1 1.4 1.8 1 .8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.7.8c.2.1.4.2.4.3.1.2.1.8-.1 1.4z"/></svg>',
    link:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>',
  };

  /* --------------------------------------------------------- chart helpers */
  function wave(seed) {
    const w = 300, h = 46, n = 7;
    const rnd = (i) => { const v = Math.sin((seed + i) * 1.3) * 0.5 + Math.cos((seed * 0.7 + i) * 2.1) * 0.3; return 12 + (v + 1) * 11; };
    const pts = Array.from({ length: n }, (_, i) => [i * (w / (n - 1)), h - rnd(i)]);
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const cx = (x0 + x1) / 2; d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`; }
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d + ` L ${w} ${h} L 0 ${h} Z`}" fill="rgba(255,255,255,.22)"/><path d="${d}" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2"/></svg>`;
  }

  function donut(segments, center) {
    const size = 160, r = 60, cx = size / 2, cy = size / 2, sw = 22, C = 2 * Math.PI * r;
    // Kaidah viz: butt-cap (tanpa cap bulat yang mendistorsi proporsi) + celah seragam kecil
    const segs = (segments || []).filter(s => Number(s.value) > 0);
    const total = segs.reduce((s, x) => s + Number(x.value), 0) || 1;
    const gap = segs.length > 1 ? 2 : 0; // celah konstan (px keliling), bukan per-segmen
    let offset = 0;
    const rings = segs.map((s) => {
      const frac = Number(s.value) / total, len = frac * C, pct = Math.round(frac * 100);
      const draw = Math.max(0.5, len - gap);
      const ring = `<circle class="donut__seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="butt" stroke-dasharray="${draw} ${C - draw}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" data-tip-label="${esc(s.label || "")}" data-tip-value="${esc((s.disp != null ? s.disp : s.value) + " · " + pct + "%")}" data-tip-color="${s.color}"/>`;
      offset += len; return ring;
    }).join("");
    const ctr = center ? `<div class="donut__center"><small>${esc(center.label)}</small><b>${esc(center.value)}</b></div>` : "";
    return `<div class="donut__chart"><svg viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--rail)" stroke-width="${sw}" opacity=".3"/>${rings}</svg>${ctr}</div>`;
  }

  // bar chart WITH data labels on top of each bar.
  // Sumbu Y dihitung DINAMIS dari data (param ke-5 yLabels lama diabaikan demi kompatibilitas);
  // unit (opsional) menambah satuan pada label nilai & axis (mis. "rb").
  function barChart(cats, vals, gradId, gradStops, _legacyY, unit) {
    const w = 320, h = 178, padL = 38, padB = 30, padT = 16;
    const cw = w - padL, ch = h - padB - padT;
    const rawMax = Math.max(1, ...vals.map(Number));
    const max = rawMax * 1.18;
    const bw = (cw / cats.length) * 0.42, gap = cw / cats.length;
    const ticks = niceTicks(rawMax, 4, unit); // [0 .. max] dinamis
    const grid = ticks.map((lab, i) => { const y = padT + ch - (i / (ticks.length - 1)) * ch; return `<line x1="${padL}" y1="${y}" x2="${w}" y2="${y}" stroke="var(--rail)" stroke-width="1" opacity=".5"/><text class="chart-axis" x="${padL - 6}" y="${y + 3}" text-anchor="end">${esc(lab)}</text>`; }).join("");
    const bars = vals.map((v, i) => {
      const bh = (Number(v) / max) * ch, x = padL + gap * i + gap / 2 - bw / 2, y = padT + ch - bh;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${bw / 2}" fill="url(#${gradId})"/>
        <text class="chart-val" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle">${esc(fmtNum(v, unit))}</text>
        <text class="chart-cat" x="${x + bw / 2}" y="${h - 8}" text-anchor="middle">${esc(cats[i])}</text>`;
    }).join("");
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">${gradStops}</linearGradient></defs>${grid}${bars}</svg></div>`;
  }

  // multi-line chart (2–3 seri) dgn marker. seriesList: array seri; sumbu Y dinamis
  // (mendukung nilai negatif untuk Laba Rugi); callout berformat pemisah ribuan + unit.
  const LINE_COLORS = ["var(--teal)", "var(--text-2)", "#e0a13a"];
  function lineChart(seriesList, xLabels, names, unit) {
    const w = 460, h = 200, padL = 48, padB = 24, padT = 14;
    const cw = w - padL - 6, ch = h - padB - padT;
    const series = (Array.isArray(seriesList) ? seriesList : [seriesList]).filter((s) => Array.isArray(s) && s.length);
    const nm = names || ["Pendapatan Kotor", "Beban Operasional", "Laba Rugi"];
    const all = series.flat().map(Number);
    const rawMax = Math.max(1, ...all), rawMin = Math.min(0, ...all), span = (rawMax - rawMin) || 1;
    const X = (i, len) => padL + (i / Math.max(1, len - 1)) * cw, Y = (v) => padT + ch - ((Number(v) - rawMin) / span) * ch;
    const path = (s) => { if (!s.length) return ""; const pts = s.map((v, i) => [X(i, s.length), Y(v)]); let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`; for (let i = 0; i < pts.length - 1; i++) { const [x0,y0]=pts[Math.max(0,i-1)],[x1,y1]=pts[i],[x2,y2]=pts[i+1],[x3,y3]=pts[Math.min(pts.length-1,i+2)]; const cp1x=x1+(x2-x0)/6,cp1y=y1+(y2-y0)/6,cp2x=x2-(x3-x1)/6,cp2y=y2-(y3-y1)/6; d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`; } return d; };
    const dots = (s, color, name) => s.map((v, i) => {
      const x = X(i, s.length), y = Y(v);
      return `<circle cx="${x}" cy="${y}" r="10" fill="transparent" class="line-hit" data-tip-label="${esc(name + " · " + (xLabels[i] || ""))}" data-tip-value="${esc(fmtNum(v, unit))}" data-tip-color="${color}"/><circle cx="${x}" cy="${y}" r="3" fill="var(--card)" stroke="${color}" stroke-width="2"/>`;
    }).join("");
    const ticks = Array.from({ length: 4 }, (_, i) => fmtNum(Math.round(rawMin + (span / 3) * i), unit));
    const grid = ticks.map((lab, i) => { const y = padT + ch - (i / 3) * ch; return `<line x1="${padL}" y1="${y}" x2="${w - 6}" y2="${y}" stroke="var(--rail)" stroke-width="1" opacity=".45"/><text class="chart-axis" x="${padL - 8}" y="${y + 3}" text-anchor="end">${esc(lab)}</text>`; }).join("");
    const xlab = xLabels.map((lab, i) => `<text class="chart-cat" x="${X(i, xLabels.length)}" y="${h - 6}" text-anchor="middle">${esc(lab)}</text>`).join("");
    const area = series[0] ? `<path d="${path(series[0])} L ${X(series[0].length - 1, series[0].length)} ${padT + ch} L ${padL} ${padT + ch} Z" fill="url(#lcArea)"/>` : "";
    const lines = series.map((s, i) => `<path d="${path(s)}" fill="none" stroke="${LINE_COLORS[i] || "var(--teal)"}" stroke-width="${i === 0 ? 2.2 : 2}" ${i === 1 ? 'stroke-dasharray="5 5"' : ""} stroke-linecap="round"/>`).join("");
    const allDots = series.map((s, i) => dots(s, LINE_COLORS[i] || "var(--teal)", nm[i] || ("Seri " + (i + 1)))).join("");
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}"><defs><linearGradient id="lcArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--teal)" stop-opacity=".28"/><stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/></linearGradient></defs>
      ${grid}${xlab}${area}${lines}${allDots}</svg></div>`;
  }

  function funnel(stages) {
    const w = 220, h = 150, max = stages[0].value, seg = h / stages.length;
    const colors = ["#7a6f63", "#9a8a78", "#b8a890", "#d8c8b0"];
    const parts = stages.map((s, i) => {
      const topW = (s.value / max) * w, botW = i < stages.length - 1 ? (stages[i + 1].value / max) * w : topW * 0.7;
      const y = i * seg, x0 = (w - topW) / 2, x1 = (w - botW) / 2;
      return `<polygon points="${x0},${y} ${x0 + topW},${y} ${x1 + botW},${y + seg - 4} ${x1},${y + seg - 4}" fill="${colors[i % colors.length]}"/>`;
    }).join("");
    return `<div class="funnel"><svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${parts}</svg></div>`;
  }

  const chartLegend = (items) => `<div class="chart-legend">${items.map(i => `<span class="legend-item"><i style="background:${i.c}"></i>${esc(i.t)}</span>`).join("")}</div>`;
  const chartCard = (title, inner, legendItems) => `<div class="card"><div class="card__title">${title}</div>${inner}${legendItems ? chartLegend(legendItems) : ""}</div>`;
  // Empty-state: tampilkan placeholder, BUKAN data dummy, saat periode tak punya data
  const emptyChart = (msg) => `<div class="chart-empty">${esc(msg || "Tidak ada data pada periode ini")}</div>`;
  const emptyCard = (title, msg) => `<div class="card"><div class="card__title">${esc(title)}</div>${emptyChart(msg)}</div>`;
  // Deret waktu dari kumpulan baris (adaptif harian≤62h / bulanan); null bila kosong pada periode
  function seriesByDate(sets, range) {
    const within = (d) => d && (!range.from || d >= range.from) && (!range.to || d <= range.to);
    const times = [];
    sets.forEach(s => (s.rows || []).forEach(r => { const d = parseDate(r[s.dateKey]); if (within(d)) times.push(d.getTime()); }));
    if (!times.length) return null;
    const minT = Math.min(...times), maxT = Math.max(...times);
    const daily = (Math.round((maxT - minT) / 86400000) + 1) <= 62;
    const keyOf = daily ? (d) => d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate() : (d) => d.getFullYear() + "-" + d.getMonth();
    const labOf = daily ? (d) => d.getDate() + " " + MONTH_ID3[d.getMonth()] : (d) => MONTH_ID3[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
    const order = [], repT = {}, labMap = {};
    const ensure = (d) => { const k = keyOf(d); if (repT[k] == null) { repT[k] = d.getTime(); order.push(k); labMap[k] = labOf(d); } return k; };
    const counts = sets.map(() => ({}));
    sets.forEach((s, si) => (s.rows || []).forEach(r => { const d = parseDate(r[s.dateKey]); if (!within(d)) return; const k = ensure(d); counts[si][k] = (counts[si][k] || 0) + 1; }));
    order.sort((a, b) => repT[a] - repT[b]);
    return { labels: order.map(k => labMap[k]), seriesList: counts.map(c => order.map(k => c[k] || 0)), names: sets.map(s => s.name), daily };
  }
  // donut block with title + legend that matches the segments
  function donutBlock(label, segs, opt) {
    opt = opt || {};
    // Kaidah viz: urut besar→kecil, grup slice kecil jadi "Lainnya", center = TOTAL (the whole)
    let arr = (segs || []).filter(s => Number(s.value) > 0).slice().sort((a, b) => Number(b.value) - Number(a.value));
    if (!arr.length) return emptyCard(label); // periode kosong → jangan tampilkan donut palsu
    if (arr.length > 6) { const head = arr.slice(0, 5), tail = arr.slice(5); const sum = tail.reduce((s, x) => s + Number(x.value), 0); head.push({ t: "Lainnya", value: sum, c: "var(--text-3)" }); arr = head; }
    const sum = arr.reduce((s, x) => s + Number(x.value), 0);
    const total = sum || 1;
    const fmtV = opt.money ? (v) => fmtRpShort(v) : (v) => fmtNum(v, opt.unit || "");
    const segObjs = arr.map(s => ({ value: Number(s.value), color: s.c, label: s.t, disp: fmtV(Number(s.value)) }));
    const center = opt.center === false ? null : { label: opt.centerLabel || "Total", value: fmtV(sum) };
    const legend = `<div class="chart-legend chart-legend--detailed">${arr.map(s => {
      const pct = Math.round(Number(s.value) / total * 100);
      return `<span class="legend-item"><i style="background:${s.c}"></i><span class="lg-t">${esc(s.t)}</span><span class="lg-v">${esc(fmtV(Number(s.value)))} · ${pct}%</span></span>`;
    }).join("")}</div>`;
    return `<div class="card"><div class="card__title" style="text-align:center;margin-bottom:8px">${esc(label)}</div><div class="donut">${donut(segObjs, center)}${legend}</div></div>`;
  }

  /* ===================================================================== */
  /* ===============  REAL DATA (mirrors Google Spreadsheets)  ============ */
  /* ===================================================================== */
  const PRICE = { Eco: "Rp850.000", Classic: "Rp1.200.000", Comfy: "Rp1.600.000" };
  const ROOM_TYPE = (no) => (no >= 29 ? "Comfy" : no >= 17 && no <= 19 ? "Classic" : "Eco");

  // Database Penghuni Tiga Dara
  const PENGHUNI_RAW = [
    [1,"KTD-1","Syifa Zuhro Alwana","Syifa",1,"Imogiri, Bantul","Mahasiswi","UGM",1,"25 Mei 2026","25 Jun 2026","Booking (DP)","085226059450","Ibu Rati","syifazuhro07@gmail.com"],
    [2,"KTD-2","Delinda Vivia Angela","Delinda",2,"Samarinda","Mahasiswi","UGM",2,"22 Apr 2026","22 Agu 2026","Aktif","085705026847","Siwi Utami","delindavva@gmail.com"],
    [3,"KTD-3","Putri Hazna Nabilla","Putri",3,"Boyolali","Mahasiswi","UGM",2,"22 Apr 2026","22 Agu 2026","Aktif","081377949070","Difa Rifaul (kakak)","putrihazn61@gmail.com"],
    [4,"KTD-4","Grisella Aurelia Disanda","Sella",4,"Solo","Mahasiswi","UGM",3,"31 Mar 2026","30 Jun 2026","Aktif","089520320246","Ezra","aureliadisanda@gmail.com"],
    [5,"KTD-5","Khalisa Ardhi Dhayinta","Lisa",5,"Sragen","Mahasiswi","UGM",1,"1 Jun 2026","6 Sep 2026","Booking (DP)","082265574191","Mama","lisadhayinta@gmail.com"],
    [6,"KTD-6","Fika Zahra Fauziah","Fika",6,"Klaten","Mahasiswi","UGM",1,"28 Mei 2026","30 Jun 2026","Booking (DP)","087834706598","Kakak Hafidz","fikazahraf@gmail.com"],
    [7,"KTD-7","Nathania Keiza Yusivana","Keiza",7,"Wonogiri","Mahasiswi","UGM",1,"1 Jul 2026","15 Jul 2026","Booking (DP)","081329777418","Yulistina (Mama)","nathaniakeiza06@gmail.com"],
    [8,"KTD-8","Christya Dewi Anugraheni","Christy",8,"Ambarawa","Mahasiswi","UGM",1,"1 Jul 2026","1 Agu 2026","Booking (DP)","895329656137","Ibu","christyadewi@mail.ugm.ac.id"],
    [9,"KTD-9","Nurul Rizki Isnaeni","Isna",9,"Tegal","Mahasiswi","UGM",1,"15 Agu 2026","30 Apr 2026","Tunggakan","082314709339","Barkah","isnaeninurulrizki@gmail.com"],
    [10,"KTD-10","Sukma Tri Wahyuningrum","Sukma",10,"Blora","Mahasiswi","UGM",1,"27 Jun 2026","27 Jul 2026","Booking (DP)","082243745330","Sri Indarti (Ibu)","sukmawahyuningrum3@gmail.com"],
    [11,"KTD-11","Mutiara Balqis Aqidatulizah","Balqis",11,"Serang, Banten","Mahasiswi","UGM",1,"20 Jul 2026","20 Agu 2026","Booking (DP)","087871081355","Amrullah (ortu)","baalqismutiara@gmail.com"],
    [12,"KTD-12","Dewi Anisa Tsany Kurniadi","Dewi",12,"Batu","Mahasiswi","UGM",2,"2 Mei 2026","2 Agu 2026","Aktif","08223214178","Ibu Wiwit","dewiaanisatsy@gmail.com"],
    [13,"KTD-13","Fadhila Rahmah Wijaya","Fadhila",13,"Cilacap","Mahasiswi","UGM",2,"30 Apr 2026","30 Jun 2026","Lunas","085747757645","Yuniarti","fadhlaw1574@gmail.com"],
    [14,"KTD-14","Nisrina Nadhira","Nadhira",14,"Kebumen","Mahasiswi","UGM",2,"30 Apr 2026","30 Jun 2026","Aktif","085253981857","Fadhila","nisrinadhira2580@gmail.com"],
    [15,"KTD-15","Rheina Meuthia Ashari","Nana",15,"Solo","Karyawati","Aksoro",2,"16 Mei 2026","14 Jun 2026","Booking (DP)","081392251532","Dinie (kakak)","rheinameuthiaa@gmail.com"],
    [16,"KTD-16","Isna Laela Ramadani","Isna",16,"Brebes","Mahasiswi","UGM",1,"22 Mei 2026","24 Jun 2026","Booking (DP)","081226718169","Jessica","isnaramadani596@gmail.com"],
    [17,"KTD-17","Raudina Yasmine","Yasmine",17,"Wonosobo","Mahasiswi","UGM",23,"1 Agu 2024","1 Agu 2026","Aktif","081327244527","Ibu","raudinayasmine2@gmail.com"],
    [18,"KTD-18","Anindya Farah","Anin",18,"Yogyakarta","Mahasiswi","UGM",30,"1 Jan 2024","1 Agu 2026","Lunas","-","-","anindyafarah@gmail.com"],
    [19,"KTD-19","Bunga Aya Lalangsa","Bunga",19,"Aceh","Mahasiswi","UGM",1,"1 Jun 2026","1 Agu 2026","Booking (DP)","081351317280","Ibu Rini & Ayah","bungaayalalangsa@gmail.com"],
    [20,"KTD-20","Nadya Zhafira Cahya Putri","Chaca",20,"Yogyakarta","Mahasiswi","UGM",23,"1 Agu 2024","1 Agu 2026","Aktif","085726261601","Bunda Titik Ambar","nadyazhafira32@gmail.com"],
    [21,"KTD-21","Nafisah Khairul Syifa","Nepp",21,"Semarang","Mahasiswi","UNY",1,"5 Jun 2026","3 Sep 2026","Belum Lunas","089689449091","Dwi Rahayu","nafisahkhairull@gmail.com"],
    [22,"KTD-22","Yumna Putri Damayanti","Yumna",22,"Purwodadi","Mahasiswi","UGM",23,"1 Agu 2024","1 Agu 2026","Aktif","0895424005496","Yumna","yumna8261@gmail.com"],
    [23,"KTD-23","Najwa Athaya","Najwa",23,"Yogyakarta","Mahasiswi","UGM",9,"1 Okt 2025","1 Agu 2026","Aktif","-","-","najwaathaya@gmail.com"],
    [24,"KTD-24","Jessica Putri Masyayu","Jessica",24,"Depok","Mahasiswi","UGM",3,"6 Apr 2026","15 Jun 2026","Masa Sewa Berakhir","081220596038","Ibu","jesicatrimas@gmail.com"],
    [25,"KTD-25","Ulum Orizhasativa Widianti","Tiva",25,"Kutai Barat","Mahasiswi","UNY",1,"1 Jul 2026","1 Agu 2026","Booking (DP)","081350885880","Mamah","tifapulum@gmail.com"],
    [26,"KTD-26","Qonita Rahma Farahdila","Farah",26,"Jawa Timur","Mahasiswi","UGM",1,"1 Jul 2026","1 Agu 2026","Booking (DP)","085815416968","Faiza (ortu)","qonitarahma@gmail.com"],
    [27,"KTD-27","Talitha Palupi Putri Anindita","Talitha",27,"Surabaya","Mahasiswi","UGM",1,"1 Jul 2026","1 Agu 2026","Booking (DP)","08175170997","Eva","talithapalupi1805@gmail.com"],
    [28,"KTD-29","Tiffani Budiarjo","Tiffani",29,"Semarang","Mahasiswi","UGM",1,"15 Jul 2026","15 Okt 2026","Booking (DP)","089506676405","Diah (Mama)","fanenocent@gmail.com"],
    [29,"KTD-31","Najwa Fauzia","Najwa",31,"Purworejo","Mahasiswi","UGM",26,"27 Apr 2024","27 Jul 2026","Aktif","-","-","freelanceariansyah@gmail.com"],
  ];
  // status penghuni (dari spreadsheet) → kelas warna
  const KOST_CLASS = {
    "Aktif":"k-aktif", "Booking (DP)":"k-booking", "Lunas":"k-lunas",
    "Belum Lunas":"k-belum", "Tunggakan":"k-tunggak", "Masa Sewa Berakhir":"k-habis", "Kosong":"k-kosong",
  };

  // PENGHUNI & struktur turunannya — `let` agar bisa dihidrasi data live (lihat loadLiveData)
  let PENGHUNI = PENGHUNI_RAW.map(r => ({
    no:r[0], id:r[1], nama:r[2], panggil:r[3], kamar:r[4], jenis:ROOM_TYPE(r[4]),
    asal:r[5], kerja:r[6], instansi:r[7], durasi:r[8], masuk:r[9], tempo:r[10],
    status:r[11], kontak:r[12], kontakNama:r[13], email:r[14],
    hp:r[12], wa:r[12], // fallback offline (snapshot tak punya No HP Penghuni) — live diisi dari sheet
  }));
  let OCC_BY_ROOM = {}, ROOMS = [], PEMBAYARAN = [];
  let LOGBOOK = [];
  let STATS = {}; // metrik turunan (okupansi, kontrak, jatuh tempo) dihitung dari data live
  let FINANCE = null; // ringkasan keuangan dari kolom "Dampak Laba" di 3_KEUANGAN
  let TX_ROWS = null; // baris mentah TRANSAKSI (untuk hitung ulang keuangan per periode tanggal)
  let TIKET = null, BOOKING = null; // tiket (maintenance) & booking dari tab live
  let DOKUMEN = null; // dokumen dari tab 14_DOKUMEN (per role)
  let KAMAR = null;   // master 30 kamar (tab KAMAR: No Kamar/Tipe/Harga/Status) → sumber okupansi akurat
  let RETENTION = null; // {rate, churn, total, churned, avgTenure} dari sheet Historical Customer
  const LOG_DIVISI_BY_ROLE = {
    owner:       null,
    admin:       ['Admin', 'Keuangan'],
    marketing:   ['Marketing'],
    sales:       ['Sales'],
    operasional: ['Kebersihan', 'Inspeksi', 'Maintenance'],
  };
  function logbookForRole(role) {
    const allowed = LOG_DIVISI_BY_ROLE[role];
    if (!allowed || !LOGBOOK.length) return null;
    return LOGBOOK.filter(r => allowed.includes(r.divisi));
  }
  function recomputeFromPenghuni() {
    OCC_BY_ROOM = Object.fromEntries(PENGHUNI.map(p => [p.kamar, p]));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const DAY = 86400000;
    // status kamar dinormalkan dari teks sheet KAMAR + data penghuni
    const normRoomStatus = (raw, occ) => {
      const s = String(raw || "").toLowerCase();
      if (/maint|perbaik|rusak/.test(s)) return "Maintenance";
      if (/booking|dp/.test(s)) return "Booking";
      if (/kosong|available|tersedia|empty/.test(s)) return "Kosong";
      if (/isi|terisi|huni|penuh|occupied|aktif|lunas|belum|tunggak|sewa/.test(s)) return "Terisi";
      if (occ) return /booking/i.test(occ.status || "") ? "Booking" : "Terisi"; // fallback dari penghuni
      return s ? "Terisi" : "Kosong";
    };
    const fmtRpHarga = (h) => { const n = +String(h).replace(/[^0-9]/g, ""); return n ? "Rp" + n.toLocaleString("id-ID") : ""; };
    // ---- Data Kamar: pakai master KAMAR (akurat: Kosong/Maintenance), else turunkan dari PENGHUNI ----
    if (KAMAR && KAMAR.length) {
      ROOMS = KAMAR.map(k => {
        const occ = OCC_BY_ROOM[k.kamar];
        return {
          no: String(k.kamar).padStart(2, "0"), _n: +k.kamar,
          jenis: k.tipe || (occ ? occ.jenis : ROOM_TYPE(+k.kamar)),
          penghuni: (occ ? occ.nama : "") || k.nama || "",
          wa: occ ? (occ.hp || occ.kontak) : "", harga: fmtRpHarga(k.harga) || PRICE[k.tipe] || "",
          status: normRoomStatus(k.status, occ),
        };
      }).sort((a, b) => a._n - b._n);
    } else {
      ROOMS = PENGHUNI.map(p => ({
        no: String(p.kamar).padStart(2, "0"), _n: +p.kamar, jenis: p.jenis,
        penghuni: p.nama, wa: p.hp, harga: PRICE[p.jenis] || "",
        status: /booking/i.test(p.status || "") ? "Booking" : "Terisi",
      })).sort((a, b) => a._n - b._n);
    }
    // ---- Metrik turunan: jatuh tempo pakai Sisa Hari (ambang 7, sesuai PARAMETER) ----
    let aktif = 0, booking = 0, tunggakan = 0, jatuhTempo = 0;
    PENGHUNI.forEach(p => {
      if (/booking/i.test(p.status || "")) booking++; else aktif++;
      let sisa = p.sisa;
      if (sisa == null) { const d = parseDate(p.tempo); if (d) sisa = Math.round((d - today) / DAY); }
      if (sisa != null) { if (sisa < 0) tunggakan++; else if (sisa <= 7) jatuhTempo++; }
    });
    let kapasitas, occupied, kosong;
    if (KAMAR && KAMAR.length) {
      const cnt = (re) => ROOMS.filter(r => re.test(r.status)).length;
      kapasitas = KAMAR.length; kosong = cnt(/kosong/i);
      occupied = cnt(/terisi/i) + cnt(/booking/i);
    } else {
      kapasitas = PENGHUNI.length; occupied = PENGHUNI.length; kosong = 0;
    }
    STATS = {
      aktif, booking, tunggakan, jatuhTempo, kapasitas, occupied, kosong,
      okupansi: kapasitas ? Math.round((occupied / kapasitas) * 100) : 0,
    };
    // CATATAN: Data Pembayaran TIDAK lagi dibuat dari PENGHUNI (dulu fallback ini
    // MENIMPA data jurnal live karena recompute dipanggil ulang saat hidrasi KAMAR,
    // dan menampilkan "pembayaran" fiktif dari Tgl Masuk penghuni). PEMBAYARAN kini
    // HANYA diisi dari jurnal TRANSAKSI (3_KEUANGAN); kosong = tampil "Tidak ada data".
  }
  // NB: recomputeFromPenghuni() memanggil parseDate (butuh MONTHS_ID, dideklarasikan
  // di bawah). Panggilan awal dipindah ke setelah parseDate siap (cari INIT_RECOMPUTE).

  // Daftar Survey / Prospek (Log Survey/Booking) + kolom Pertimbangan + aksi WA
  const PERTIMBANGAN = ["Harga sedikit mahal", "Kamar mandi luar", "Lokasi strategis", "Fasilitas lengkap", "Masih bandingkan"];
  let SURVEY = [
    { tanggal:"11 Jan 2026", nama:"Dewi Kusuma",  wa:"085678901234", asal:"Referral",  kamar:"3, 1" },
    { tanggal:"12 Jan 2026", nama:"Rian Pratama", wa:"087654321098", asal:"Instagram", kamar:"2" },
    { tanggal:"14 Jan 2026", nama:"Ahmad Fauzi",  wa:"082345678901", asal:"Google",    kamar:"3" },
    { tanggal:"15 Jan 2026", nama:"Budi Santoso", wa:"081234567890", asal:"Referral",  kamar:"1" },
    { tanggal:"16 Jan 2026", nama:"Siti Rahma",   wa:"085678901234", asal:"Instagram", kamar:"2" },
  ].map((s, i) => ({ ...s, pertimbangan: PERTIMBANGAN[i % PERTIMBANGAN.length] }));

  // Daftar Leads
  const LEAD_STATUS = [{t:"Leads",c:"s-leads"},{t:"Follow Up",c:"s-followup"}];
  let LEADS = SURVEY.map((s, i) => ({ ...s, id:"LD-"+String(i+1).padStart(3,"0"), status: LEAD_STATUS[i % 2] }));

  // Daftar Vendor — Hasil dropdown + WA
  let VENDOR = [
    { id:"VD-001", nama:"CV Bersih Sejahtera", kategori:"Kebersihan", kontak:"0812-3456-7890", hasil:"Paling Baik" },
    { id:"VD-002", nama:"Toko Listrik Jaya",   kategori:"Elektrikal", kontak:"0813-2233-4455", hasil:"Baik" },
    { id:"VD-003", nama:"Air Bersih Tirta",    kategori:"Sanitasi",  kontak:"0857-1122-3344", hasil:"Cukup" },
    { id:"VD-004", nama:"Mebel Karya Indah",   kategori:"Furniture", kontak:"0821-9988-7766", hasil:"Kurang" },
  ].map(v => ({ ...v, wa: v.kontak }));

  // Logbook — template seragam (Logbook Admin): Tanggal, Task, Divisi, Deadline, Status
  const LOG_STATUS = ["Complete", "In Progress", "Pending", "Incomplete"];
  const PETUGAS = { admin:"Rina Admin", keuangan:"Sari Keuangan", marketing:"Dimas Marketing", operasional:"Joko Operasional", sales:"Putri Sales" };
  function logbookRows(div, n) {
    const tasks = {
      admin:["Verifikasi kontrak baru","Rekap data penghuni","Arsip dokumen","Update database"],
      keuangan:["Input transaksi harian","Rekonsiliasi bank","Tagih jatuh tempo","Laporan kas"],
      marketing:["Posting konten IG","Balas leads WA","Jadwal survey","Evaluasi promosi"],
      operasional:["Inspeksi kamar","Perbaikan keran","Perawatan AC","Cek CCTV"],
      sales:["Follow up prospek","Konfirmasi booking","Kirim penawaran","Closing kontrak"],
    }[div] || ["Tugas harian"];
    const D = ["2 Jun 2026","3 Jun 2026","4 Jun 2026","5 Jun 2026"], DL = ["10 Jun 2026","11 Jun 2026","12 Jun 2026","13 Jun 2026"];
    return Array.from({ length: n }, (_, i) => ({
      tanggal: D[i % 4], pic: PETUGAS[div], divisi: div.charAt(0).toUpperCase() + div.slice(1),
      deadline: DL[i % 4], name: tasks[i % tasks.length], logStatus: LOG_STATUS[i % LOG_STATUS.length],
    }));
  }
  // Logbook Operasional (khusus, sesuai Logbook Operasional.png): 3 tabel
  const PILL = { "In Progress":{t:"In Progress",c:"s-progress"}, "Complete":{t:"Complete",c:"s-complete"}, "Pending":{t:"Pending",c:"s-pending"}, "Approved":{t:"Approved",c:"s-approved"} };
  const PILLSEQ = [PILL["In Progress"], PILL["Complete"], PILL["Pending"], PILL["Approved"]];
  const D4 = ["Just now","1 minute ago","1 hour ago","Yesterday"];
  function logInspeksiRows(n) {
    const item = ["AC Kamar 17","Keran Wastafel","Lampu Koridor","CCTV Lobi"];
    const lok = ["Lantai 2","Kamar Mandi L2","Koridor L1","Lobi"];
    return Array.from({ length: n }, (_, i) => ({ nama: PETUGAS.operasional, item: item[i%4], lokasi: lok[i%4], kategori: D4[i%4], status: PILLSEQ[i%4] }));
  }
  function logPerbaikanRows(n) {
    const proj = ["Servis AC","Ganti selang bidet","Perbaikan keran","Cat ulang dinding"];
    const lok = ["Kamar 17","Kamar Mandi L2","Kamar 09","Koridor L1"];
    const prio = ["Tinggi","Sedang","Rendah","Sedang"];
    const biaya = ["Rp350.000","Rp120.000","Rp80.000","Rp250.000"];
    return Array.from({ length: n }, (_, i) => ({ id:"#CM98"+String(i+1).padStart(2,"0"), nama: PETUGAS.operasional, project: proj[i%4], lokasi: lok[i%4], prioritas: prio[i%4], biaya: biaya[i%4], status: PILLSEQ[i%4] }));
  }

  // Dokumen — kolom Link → tombol OPEN (buka file di Google Drive)
  const DRIVE_FOLDER = {
    owner:"https://drive.google.com/drive/my-drive", admin:"https://drive.google.com/drive/my-drive",
    marketing:"https://drive.google.com/drive/my-drive", operasional:"https://drive.google.com/drive/my-drive", sales:"https://drive.google.com/drive/my-drive",
  };
  const DIVISI_LABEL = { owner:"Owner", admin:"Admin & Keuangan", keuangan:"Keuangan", marketing:"Marketing", operasional:"Operasional", sales:"Sales" };
  const divLabel = (r) => DIVISI_LABEL[String(r || "").toLowerCase()] || (r ? String(r) : "—");
  function dokumenRows(role, n) {
    const rl = String(role).toLowerCase();
    // Data live dari 14_DOKUMEN: owner lihat semua (+ kolom Divisi), role lain hanya miliknya
    if (DOKUMEN && DOKUMEN.length) {
      const list = rl === "owner" ? DOKUMEN : DOKUMEN.filter(d => (d.role || "").toLowerCase() === rl);
      return list.map(d => ({ id: d.id, nama: d.name, link: d.link, divisi: divLabel(d.role) }));
    }
    const names = ["Kontrak Sewa","Bukti Pembayaran","Surat Perjanjian","SOP Divisi","Laporan Bulanan","Berita Acara"];
    const divs = ["Admin & Keuangan","Marketing","Sales","Operasional","Admin & Keuangan","Marketing"];
    return Array.from({ length: n }, (_, i) => ({
      id:"#CM98"+String(i+1).padStart(2,"0"), nama: names[i % names.length],
      link: DRIVE_FOLDER[rl] || "https://drive.google.com/drive/my-drive", divisi: divs[i % divs.length],
    }));
  }
  // Tiket Operasional
  function tiketRows(n) {
    const jen = ["Preventif","Korektif","Preventif","Preventif"], pek = ["Servis AC","Perbaikan keran","Cek listrik","Cat ulang"];
    const st = [{t:"Complete",c:"s-complete"},{t:"In Progress",c:"s-progress"},{t:"Pending",c:"s-pending"},{t:"Complete",c:"s-complete"}];
    return Array.from({ length: n }, (_, i) => ({
      id:"TK-"+String(i+1).padStart(3,"0"), pekerjaan: pek[i%4], jenis: jen[i%4],
      lokasi:["Kamar 09","Kamar Mandi","Lobi","Kamar 17"][i%4], tanggal:["2 Jun 2026","3 Jun 2026","4 Jun 2026","5 Jun 2026"][i%4], status: st[i%4],
    }));
  }

  /* --------------------------------------------------------- components */
  // Liquid glass scorecard: PERTAHANKAN warna gradien, hanya turunkan alpha → mesh tembus.
  const glassify = (grad, a) => String(grad).replace(/#([0-9a-fA-F]{6})/g, (m, h) => {
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  });
  function statCard(c) {
    const dark = c.onDark ? " on-dark" : "";
    // Tren dihitung dari DERET data (sparkline). Bila tak ada deret, pakai badge manual bila ada.
    const hasSeries = Array.isArray(c.spark) && c.spark.length > 1;
    const t = hasSeries ? trendBadge(c.spark) : (c.badge ? { badge: c.badge, dir: c.dir || "up" } : null);
    let badge = "";
    if (t) {
      const up = t.dir !== "down";
      const col = up ? "#13a05f" : "#e23d3d";   // KONSISTEN: hijau = kenaikan, merah = penurunan
      const arrow = up ? "▲" : "▼";
      // pill % di kanan-tengah + panah naik/turun (warna sesuai arah perubahan)
      badge = `<span class="stat-card__badge" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:3px;color:${col};background:var(--badge-bg,rgba(255,255,255,.22));padding:3px 8px;border-radius:999px;font-weight:700;font-size:11px;line-height:1">${arrow} ${esc(t.badge)}</span>`;
    }
    // garis dalam scorecard = sparkline DATA asli (bukan ornamen)
    const spark = sparkline(c.spark, c.onDark ? "rgba(255,255,255,.7)" : "rgba(20,40,60,.45)");
    return `<article class="stat-card${dark}" style="background:${glassify(c.bg, 0.58)};position:relative">
      <span class="stat-card__label">${esc(c.label)}</span><span class="stat-card__value">${esc(c.value)}</span>
      ${badge}
      <span class="stat-card__wave">${spark}</span></article>`;
  }
  const statGrid = (cards, cols) => `<section class="stat-grid" style="--cols:${cols}">${cards.map(statCard).join("")}</section>`;

  // satu search bar mewakili semua kolom; sort via klik header. (filter per-kolom dihapus)
  const toolbar = () => `<div class="table-toolbar">
      <button class="tool-btn" data-act="add" aria-label="Tambah dokumen" title="Tambah dokumen baru">${I.plus}</button>
      <label class="search"><span>${I.search}</span><input type="text" placeholder="Cari semua kolom…" data-act="tsearch"></label>
    </div>`;

  // dropdowns — kind: log | hasil
  function dropdown(kind, value) {
    const opts = { log: LOG_STATUS, hasil: ["Paling Baik","Baik","Cukup","Kurang"] }[kind];
    return `<select class="cell-select sel-${kind}" data-v="${slug(value)}">${opts.map(o => `<option value="${o}"${o === value ? " selected" : ""}>${o}</option>`).join("")}</select>`;
  }
  // action buttons
  const waBtn = (num, label) => `<a class="cell-btn cell-btn--wa" href="https://wa.me/${digits(num)}" target="_blank" rel="noopener">${I.wa}${label || "WhatsApp"}</a>`;
  const openBtn = (url) => `<a class="cell-btn cell-btn--open" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${I.link} OPEN</a>`;
  const tagihanBtn = (num) => `<a class="cell-btn cell-btn--wa" href="https://wa.me/${digits(num)}?text=Halo,%20berikut%20tagihan%20kost%20Anda." target="_blank" rel="noopener">${I.wa} Kirim</a>`;

  /* ---- parsing tanggal Indonesia + rentang periode (filter sidebar) ---- */
  const MONTHS_ID = {
    jan:0, januari:0, feb:1, februari:1, mar:2, maret:2, apr:3, april:3, mei:4,
    jun:5, juni:5, jul:6, juli:6, agu:7, agt:7, agustus:7, sep:8, september:8,
    okt:9, oktober:9, nov:10, november:10, des:11, desember:11,
  };
  function parseDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);            // ISO: 2026-06-15
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);      // 25 Mei 2026 / 2 Jun 2026
    if (m) { const mon = MONTHS_ID[m[2].toLowerCase()]; if (mon != null) return new Date(+m[3], mon, +m[1]); }
    m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);   // 15/06/2026 (dd/mm/yyyy — hasil IMPORTRANGE)
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    // Angka serial Google Sheets (IMPORTRANGE membawa NILAI tanggal, bukan teks): 46188 → 15 Jun 2026.
    // Epoch spreadsheet = 30 Des 1899. Rentang 25000–60000 ≈ tahun 1968–2064 (hindari salah tangkap nominal).
    if (/^\d{5}(\.\d+)?$/.test(s)) { const n = Math.floor(+s); if (n >= 25000 && n <= 60000) { const d = new Date(1899, 11, 30); d.setDate(d.getDate() + n); return d; } }
    return null;
  }
  // tampilkan tanggal apa pun formatnya (teks/serial/dd-mm) sebagai "6 Jul 2026"
  function fmtDateID(str) {
    const d = parseDate(str);
    return d ? d.getDate() + " " + MONTH_ID3[d.getMonth()] + " " + d.getFullYear() : String(str || "");
  }
  // seperti parseDate, tapi menangkap jam:menit bila ada (untuk hitung Response Time satuan jam)
  function parseDateTime(str) {
    const base = parseDate(str); if (!base) return null;
    const tm = String(str).match(/(\d{1,2}):(\d{2})/);
    if (tm) base.setHours(+tm[1], +tm[2], 0, 0);
    return base;
  }
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay   = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  function periodRange() {
    const now = new Date();
    switch (cur.period) {
      case "Hari ini":   return { from: startOfDay(now), to: endOfDay(now) };
      case "Minggu ini": { const dow = (now.getDay() + 6) % 7; const mon = new Date(now); mon.setDate(now.getDate() - dow); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { from: startOfDay(mon), to: endOfDay(sun) }; }
      case "Bulan ini":  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
      case "Tahun ini":  return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(new Date(now.getFullYear(), 11, 31)) };
      case "Custom":     return { from: cur.from ? startOfDay(new Date(cur.from)) : null, to: cur.to ? endOfDay(new Date(cur.to)) : null };
      default:           return { from: null, to: null };
    }
  }
  // saring baris berdasarkan kolom tanggal; baris tanpa tanggal valid tetap ditampilkan
  function filterByPeriod(data, dateKey) {
    if (!dateKey) return data;
    const { from, to } = periodRange();
    if (!from && !to) return data;
    return data.filter(r => {
      const d = parseDate(r[dateKey]);
      if (!d) return true;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  // INIT_RECOMPUTE: panggilan awal — di sini parseDate & MONTHS_ID sudah terdefinisi
  recomputeFromPenghuni();

  const DATE_KEYS = new Set(["tanggal","masuk","tempo","deadline","kategori"]);
  const FUNNEL_ICO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.6 3h12.8L9.2 9.1v3.4l-2.4 1.2V9.1z" fill="currentColor"/></svg>';
  const NO_FILTER_COLS = new Set(["check", "aksi", "open", "tagihan"]);
  function table(cfg) {
    const { title, cols, paginate, titleRight } = cfg;
    const dateKey = cfg.dateKey || (cols.some(c => c.key === "tanggal") ? "tanggal" : null);
    const data = filterByPeriod(cfg.data, dateKey);
    const heads = cols.map((c, i) => {
      const funnel = NO_FILTER_COLS.has(c.key) ? "" : `<button type="button" class="col-filter-btn" data-fcol="${i}" aria-label="Filter ${esc(c.label || "kolom")}" title="Filter kolom">${FUNNEL_ICO}</button>`;
      return `<th data-col="${i}" class="th-sort">${esc(c.label || "")}<span class="sort-ind" aria-hidden="true"></span>${funnel}</th>`;
    }).join("");
    const body = data.map(r => {
      const tds = cols.map(col => {
        const k = col.key, v = r[k];
        if (DATE_KEYS.has(k)) return `<td><span class="cell-date">${I.cal}${esc(fmtDateID(v))}</span></td>`;
        switch (k) {
          case "check":     return `<td><span class="cbox ${r.sel ? "on" : ""}"></span></td>`;
          case "name":      return `<td><span class="cell-name"><span class="avatar">${esc(initials(r.nama || r.name || v))}</span>${esc(r.nama || r.name || v)}</span></td>`;
          case "kostStatus":return `<td><span class="status ${KOST_CLASS[r.status] || ""}">${esc(r.status)}</span></td>`;
          case "status":
          case "jenisTx":
          case "prioritas": return v && v.t ? `<td><span class="status ${esc(v.c)}">${esc(v.t)}</span></td>` : `<td>${esc(v ?? "")}</td>`;
          case "logStatus": { const lc = { "Complete":"s-complete", "In Progress":"s-progress", "Pending":"s-pending", "Incomplete":"s-pending", "Approved":"s-approved" }; const txt = v && v.t ? v.t : v; return `<td><span class="status ${lc[txt] || "s-pending"}">${esc(txt ?? "")}</span></td>`; }
          case "hasil":     return `<td>${dropdown("hasil", v)}</td>`;
          case "aksi":      return `<td>${waBtn(r.wa, "Chat")}</td>`;
          case "open":      return `<td>${openBtn(r.link)}</td>`;
          case "tagihan":   return `<td>${tagihanBtn(r.wa)}</td>`;
          case "kontak":    return `<td>${esc(fmtHP(v))}</td>`;
          case "wa":        return `<td>${esc(fmtHP(v))}</td>`;
          case "hp":        return `<td>${esc(fmtHP(v))}</td>`;
          case "id":        return `<td class="cell-id">${esc(v ?? "")}</td>`;
          default:          return `<td>${esc(v ?? "")}</td>`;
        }
      }).join("");
      return `<tr class="${r.sel ? "is-selected" : ""}">${tds}</tr>`;
    }).join("") || `<tr class="tbl-empty"><td colspan="${cols.length}">Tidak ada data pada periode <b>${cur.period}</b>.</td></tr>`;
    const pager = (paginate && data.length) ? `<nav class="pager">${[1,2,3,4,5].map(p => `<button class="${p===1?"is-active":""}">${p}</button>`).join("")}
      <button aria-label="Sebelumnya">${I.arrowL}</button><button aria-label="Berikutnya">${I.arrowR}</button></nav>` : "";
    return `<section class="table-block">
      ${title ? `<h2 class="section-title ${titleRight ? "right" : ""}">${title}</h2>` : ""}
      ${toolbar()}
      <div class="card" style="padding:4px 2px"><div class="tbl-wrap"><table class="tbl">
        <thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table></div></div>
      ${pager}</section>`;
  }

  /* ------- column sets ------- */
  const COLS = {
    penghuni: [
      {key:"no",label:"No"},{key:"id",label:"ID"},{key:"name",label:"Nama Lengkap"},{key:"panggil",label:"Panggilan"},
      {key:"kamar",label:"No Kamar"},{key:"jenis",label:"Jenis Kamar"},{key:"asal",label:"Asal Daerah"},{key:"kerja",label:"Pekerjaan"},
      {key:"instansi",label:"Instansi"},{key:"durasi",label:"Durasi (Bln)"},{key:"masuk",label:"Tanggal Masuk"},{key:"tempo",label:"Jatuh Tempo"},
      {key:"kostStatus",label:"Status"},{key:"hp",label:"No HP Penghuni"},{key:"aksi",label:"WhatsApp"},
      {key:"kontak",label:"Kontak Darurat"},{key:"kontakNama",label:"Nama Kontak"},{key:"email",label:"Email"},
    ],
    penghuniSales: [{key:"kamar",label:"No Kamar"},{key:"jenis",label:"Jenis Kamar"},{key:"tempo",label:"Tanggal Jatuh Tempo"},{key:"hp",label:"No HP Penghuni"},{key:"aksi",label:"WhatsApp"}],
    pembayaran: [
      {key:"check",label:""},{key:"tanggal",label:"Tanggal"},{key:"jenisTx",label:"Jenis Transaksi"},
      {key:"namaTx",label:"Nama Transaksi"},{key:"jumlah",label:"Jumlah"},{key:"keterangan",label:"Keterangan"},
    ],
    dokumen: [{key:"id",label:"ID Docs"},{key:"name",label:"Judul"},{key:"open",label:"Link"}],
    dokumenOwner: [{key:"id",label:"ID Docs"},{key:"name",label:"Judul"},{key:"divisi",label:"Divisi"},{key:"open",label:"Link"}],
    logbook: [{key:"tanggal",label:"Tanggal"},{key:"name",label:"Task"},{key:"pic",label:"PIC"},{key:"divisi",label:"Divisi"},{key:"deadline",label:"Deadline"},{key:"logStatus",label:"Status"}],
    jatuhTempo: [{key:"name",label:"Nama"},{key:"wa",label:"Nomor WA"},{key:"tempo",label:"Jatuh Tempo"},{key:"sisa",label:"Sisa Hari"},{key:"tagihan",label:"Tagihan"}],
    vendor: [{key:"name",label:"Nama Vendor"},{key:"kategori",label:"Kategori"},{key:"kontak",label:"Nomor Telepon"},{key:"hasil",label:"Hasil"}],
    vendorOps: [{key:"name",label:"Nama Vendor"},{key:"kategori",label:"Kategori"},{key:"kontak",label:"Nomor Telepon"},{key:"hasil",label:"Hasil"},{key:"aksi",label:"WhatsApp"}],
    leads:  [{key:"check",label:""},{key:"id",label:"ID"},{key:"name",label:"Nama"},{key:"wa",label:"Nomor WA"},{key:"asal",label:"Asal"},{key:"tanggal",label:"Tanggal"},{key:"status",label:"Status"}],
    tiket:  [{key:"check",label:""},{key:"id",label:"ID"},{key:"pekerjaan",label:"Pekerjaan"},{key:"jenis",label:"Jenis"},{key:"lokasi",label:"Lokasi"},{key:"tanggal",label:"Tanggal"},{key:"status",label:"Status"}],
    // Logbook Operasional (sesuai desain)
    logInspeksi: [{key:"name",label:"Tanggal"},{key:"item",label:"Item"},{key:"lokasi",label:"Lokasi"},{key:"kategori",label:"Kategori"},{key:"status",label:"Prioritas"}],
    logPerbaikan: [{key:"id",label:"ID"},{key:"name",label:"PIC"},{key:"project",label:"Project"},{key:"prioritas",label:"Prioritas"},{key:"biaya",label:"Biaya"},{key:"status",label:"Status"}],
  };
  // Daftar Prospek/Survey — Nomor WA (teks) + kolom Pertimbangan + Aksi (tombol WA)
  COLS.prospek = [
    {key:"check",label:""},{key:"name",label:"Nama"},{key:"wa",label:"Nomor WA"},{key:"pertimbangan",label:"Pertimbangan"},
    {key:"asal",label:"Asal"},{key:"tanggal",label:"Tanggal"},{key:"aksi",label:"Aksi"},
  ];

  const dataPenghuni = () => PENGHUNI;
  const surveyRows = () => SURVEY;

  /* -------- shared page renderers -------- */
  const pagePenghuni   = () => table({ title:"DAFTAR PENGHUNI", cols:COLS.penghuni, data:dataPenghuni(), paginate:true });
  const pagePenghuniSales = () => table({ title:"DAFTAR PENGHUNI", cols:COLS.penghuniSales, data:PENGHUNI });
  const pagePembayaran = () => table({ title:"DATA PEMBAYARAN", cols:COLS.pembayaran, data:PEMBAYARAN });
  const pageDokumen    = (role) => table({ title:"DOKUMEN " + role.toUpperCase(), cols:(String(role).toLowerCase() === "owner" ? COLS.dokumenOwner : COLS.dokumen), data:dokumenRows(role, 6) });
  const stackTables    = (...blocks) => `<div class="view">${blocks.join("")}</div>`;

  // Logbook Operasional page (3 tabel)
  const logbookOpsPage = () => stackTables(
    table({ title:"Logbook Inspeksi", titleRight:true, cols:COLS.logInspeksi, data:logInspeksiRows(4) }),
    table({ title:"Logbook Perbaikan", titleRight:true, cols:COLS.logPerbaikan, data:logPerbaikanRows(4) }),
    table({ title:"Logbook Perawatan", titleRight:true, cols:COLS.logPerbaikan, data:logPerbaikanRows(4) }),
  );

  /* room scorecards (+ filter status kamar) */
  const ROOM_BADGE = { Terisi:"badge-full", Kosong:"badge-empty", Booking:"badge-soon", Maintenance:"badge-maint" };
  const ROOM_FILTERS = ["Semua","Terisi","Kosong","Booking","Maintenance"];
  function rooms(variant) {
    const isOps = variant === "ops";
    const cards = ROOMS.map(r => `<article class="room" data-status="${r.status}">
      <div class="room__top"><span class="room__no">${r.no}</span><span class="room__badge ${ROOM_BADGE[r.status]}">${r.status}</span></div>
      <div class="room__type">${r.jenis}</div>
      <div class="room__occupant">Penghuni<br><b>${r.penghuni || "-"}</b></div>
      ${isOps
        ? `<div class="room__foot room__foot--wa">${digits(r.wa) ? waBtn(r.wa, "Hubungi") : `<span class="muted">Tidak ada kontak</span>`}</div>`
        : `<div class="room__foot"><span class="price">${r.harga}</span><span>/bln</span></div>`}
    </article>`).join("");
    const chips = `<div class="room-filter">${ROOM_FILTERS.map((f, i) => `<button class="chip ${i===0?"is-active":""}" data-roomfilter="${f}">${f}</button>`).join("")}</div>`;
    return `<section class="view"><h2 class="section-title">DATA KAMAR</h2>${chips}<div class="rooms rooms-30">${cards}</div></section>`;
  }

  /* gradient backgrounds (scorecards) */
  const G = {
    adminGreen:"linear-gradient(150deg,#cfe9a8,#3fae84)", adminCyan:"linear-gradient(150deg,#aee6df,#3aa0c4)",
    adminOlive:"linear-gradient(150deg,#cfe08a,#7c8a3a)", adminDarkO:"linear-gradient(150deg,#8c9a52,#3f4a2a)", adminDarkG:"linear-gradient(150deg,#6fae8a,#2f4a3a)",
    mkLeads:"linear-gradient(150deg,#f1a896,#e26d6d)", mkSurvey:"linear-gradient(150deg,#c9a98f,#7a5f4f)", mkConv:"linear-gradient(150deg,#e88ab0,#c0397a)",
    mkUnit:"linear-gradient(150deg,#ecd07a,#c79a2a)", mkCac:"linear-gradient(150deg,#d8c4ee,#a98fd0)",
    opRed:"linear-gradient(150deg,#e8806f,#c0473a)", opOrange:"linear-gradient(150deg,#ec8a5f,#c75f2a)", opTeal:"linear-gradient(150deg,#7fd6c7,#2f8f9a)",
    opAmber:"linear-gradient(150deg,#ecc27a,#c7872a)", opGreen:"linear-gradient(150deg,#9ad68a,#4a8a3a)", opYellow:"linear-gradient(150deg,#ecd87a,#c7a02a)", opTeal2:"linear-gradient(150deg,#7fd6b7,#2f9a7a)",
    ownPrimary:"linear-gradient(135deg,#3A3635 0%,#CF7B72 65%,#F2D5CF 100%)", // charcoal→rose→blush
    ownRose:   "linear-gradient(150deg,#3A3635,#CF7B72)",                      // charcoal→dusty rose
    ownGray:   "linear-gradient(150deg,#3A3635,#8E8B87)",                      // charcoal→warm gray
    salePink:"linear-gradient(150deg,#f3cdd0,#e89aa0)", saleRed:"linear-gradient(150deg,#f0a0a8,#d0506a)", saleGold:"linear-gradient(150deg,#ecc99a,#c79a5a)", salePeach:"linear-gradient(150deg,#f0b89a,#d07a5a)",
  };
  const barStopsGreen = '<stop offset="0%" stop-color="#8ce0a0"/><stop offset="100%" stop-color="#2f8f7a"/>';
  const barStopsWarm  = '<stop offset="0%" stop-color="#e58a6f"/><stop offset="100%" stop-color="#7a5fae"/>';
  const barStopsCool  = '<stop offset="0%" stop-color="#6fb1e5"/><stop offset="100%" stop-color="#8a6fae"/>';
  // Bar Owner: palet brand (dusty rose → charcoal), bukan biru
  const barStopsOwner = '<stop offset="0%" stop-color="#CF7B72"/><stop offset="100%" stop-color="#3A3635"/>';
  const OWN_BAR = "#CF7B72"; // warna legenda bar owner

  /* division donut palettes (sesuai colour guideline tiap halaman) */
  const PAL = {
    admin:["#6ad17f","#4ed7c7","#c7d86a"],
    marketing:["#e26d6d","#c0397a","#ecd07a","#a98fd0"],
    operasional:["#c0473a","#ec8a5f","#2f8f9a"],
    owner:["#CF7B72","#F2D5CF","#8E8B87","#C92D31"], // dusty rose, blush, warm gray, crimson (prioritas brand)
    sales:["#e89aa0","#d0506a","#c79a5a"],
  };

  /* ============================ DASHBOARDS ============================== */
  function adminOverview() {
    const F = TX_ROWS ? computeFinance(TX_ROWS, periodRange()) : null;
    const hasFin = F && F.nBuckets >= 1;
    const moveIn = monthlyCount(filterByPeriod(PENGHUNI, "masuk"), "masuk"), tempoSpark = monthlyCount(filterByPeriod(PENGHUNI, "tempo"), "tempo");
    const cards = [
      { label:"Pendapatan", value:fmtRpShort(F ? F.pendapatanKotor : 0), spark:F ? F.cashSeries : [], bg:G.adminGreen },
      { label:"Kontrak Aktif", value:String(STATS.aktif ?? 0), spark:moveIn, bg:G.adminCyan },
      { label:"Kamar Kosong", value:String(STATS.kosong ?? 0), spark:moveIn, bg:G.adminOlive, onDark:true },
      { label:"Tunggakan", value:String(STATS.tunggakan ?? 0), spark:tempoSpark, bg:G.adminDarkO, onDark:true },
      { label:"Jatuh Tempo", value:String(STATS.jatuhTempo ?? 0), spark:tempoSpark, bg:G.adminDarkG, onDark:true },
    ];
    // Daftar Jatuh Tempo: SELURUH penghuni dgn Sisa Hari ≤ 7 (ambang dari PARAMETER).
    // Flag Tagih di sheet tidak konsisten → pakai Sisa Hari (akurat). Fallback hitung dari Tgl Jatuh Tempo.
    const today0 = startOfDay(new Date());
    const sisaOf = (p) => { if (p.sisa != null) return p.sisa; const d = parseDate(p.tempo); return d ? Math.round((d - today0) / 86400000) : null; };
    const overdue = PENGHUNI.map(p => ({ p, s: sisaOf(p) }))
      .filter(x => x.s != null && x.s <= 7)
      .sort((a, b) => a.s - b.s);
    const jatuh = overdue.map(({ p, s }) => ({
      nama:p.nama, name:p.nama, wa:p.hp, tempo:p.tempo,
      sisa: s < 0 ? "Telat " + (-s) + " hr" : s === 0 ? "Hari ini" : s + " hr lagi",
    }));
    const kontrakDonut = [{t:"Aktif",value:STATS.aktif||0,c:PAL.admin[0]},{t:"Booking",value:STATS.booking||0,c:PAL.admin[1]}];
    // OPEX bar — data real; kosong → empty state
    const obars = F ? topEntries(F.opexBy,4) : [];
    let opexCard;
    if (obars.length) { const bsc = moneyScale(Math.max(1,...obars.map(e=>e[1]))); opexCard = chartCard("OPEX", barChart(obars.map(e=>shortAcct(e[0])),scaleVals(obars.map(e=>e[1]),bsc),"gAdm2",barStopsGreen,null,bsc.unit), [{t:"Beban"+(bsc.unit?" ("+bsc.unit+")":""),c:"#3fae84"}]); }
    else opexCard = emptyCard("OPEX");
    // Line keuangan — data real; kosong → empty state
    let lineCard;
    if (hasFin) {
      const lsc = moneyScale(Math.max(1,...F.cashSeries,...F.expSeries,...F.labaSeries.map(Math.abs)));
      const U = lsc.unit ? " ("+lsc.unit+")" : "";
      lineCard = chartCard("Pendapatan Kotor vs Beban vs Laba Rugi", lineChart([scaleVals(F.cashSeries,lsc),scaleVals(F.expSeries,lsc),scaleVals(F.labaSeries,lsc)],F.labels,["Pendapatan Kotor","Beban Operasional","Laba Rugi"],lsc.unit), [{t:"Pendapatan Kotor"+U,c:"var(--teal)"},{t:"Beban Operasional"+U,c:"var(--text-2)"},{t:"Laba Rugi"+U,c:"#e0a13a"}]);
    } else lineCard = emptyCard("Pendapatan Kotor vs Beban vs Laba Rugi");
    return `<div class="view">${statGrid(cards,5)}
      <div class="grid row-3 mt">
        ${donutBlock("Komposisi Kontrak", kontrakDonut, {centerLabel:"Total Kontrak"})}
        ${chartCard("Status Kontrak", barChart(["Aktif","Booking"],[STATS.aktif||0,STATS.booking||0],"gAdm1",barStopsGreen), [{t:"Jumlah Kontrak",c:"#3fae84"}])}
        ${opexCard}
      </div>
      <div class="grid row-2-3 mt">
        ${lineCard}
        ${table({ title:"DAFTAR JATUH TEMPO", titleRight:true, cols:COLS.jatuhTempo, data:jatuh, dateKey:null })}
      </div></div>`;
  }

  function marketingOverview() {
    const leadsP = filterByPeriod(LEADS, "tanggal"), surveyP = filterByPeriod(SURVEY, "tanggal");
    const nLeads = leadsP.length, nSurvey = surveyP.length;
    const konv = nLeads ? Math.round((nSurvey / nLeads) * 100) : 0;
    const leadSpark = monthlyCount(leadsP, "tanggal"), survSpark = monthlyCount(surveyP, "tanggal"), moveIn = monthlyCount(filterByPeriod(PENGHUNI, "masuk"), "masuk");
    const cards = [
      { label:"Leads", value:String(nLeads), spark:leadSpark, bg:G.mkLeads },
      { label:"Survey", value:String(nSurvey), spark:survSpark, bg:G.mkSurvey, onDark:true },
      { label:"Konversi Leads-Survey", value:konv+" %", spark:survSpark, bg:G.mkConv },
      { label:"Unit Tersewa", value:String(STATS.occupied ?? 0), spark:moveIn, bg:G.mkUnit },
      { label:"CAC", value:"—", spark:leadSpark, bg:G.mkCac }, // butuh data biaya marketing → belum ada
    ];
    // Komposisi channel dari kolom Asal/Sumber leads (periode)
    const chMap = {}; leadsP.forEach(l => { const a = l.asal || "Lainnya"; chMap[a] = (chMap[a] || 0) + 1; });
    const chTop = Object.entries(chMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const channelDonut = chTop.map((e,i)=>({t:e[0],value:e[1],c:PAL.marketing[i%4]}));
    // Tren Leads & Survey sepanjang periode
    const ts = seriesByDate([{name:"Leads",rows:LEADS,dateKey:"tanggal"},{name:"Survey",rows:SURVEY,dateKey:"tanggal"}], periodRange());
    const trendCard = ts ? chartCard("Tren Leads & Survey", lineChart(ts.seriesList, ts.labels, ts.names), [{t:"Leads",c:"var(--teal)"},{t:"Survey",c:"var(--text-2)"}]) : emptyCard("Tren Leads & Survey");
    const funnelCard = (nLeads || nSurvey)
      ? chartCard("Funnel Penjualan", `<div class="funnel-wrap">${funnel([{value:nLeads||1},{value:nSurvey||1},{value:Math.max(1,Math.round(nSurvey*0.6))}])}<div class="funnel-stats"><div><span>Leads masuk</span><b>${nLeads}</b></div><div><span>Survey / Viewing</span><b>${nSurvey}</b></div></div></div>`, [{t:"Leads",c:"#9a8a78"},{t:"Survey",c:"#d8c8b0"}])
      : emptyCard("Funnel Penjualan");
    const channelBar = chTop.length ? chartCard("Leads Channel", barChart(chTop.map(e=>e[0]),chTop.map(e=>e[1]),"gMk1",barStopsWarm), [{t:"Jumlah Leads",c:"#e26d6d"}]) : emptyCard("Leads Channel");
    return `<div class="view">${statGrid(cards,5)}
      <div class="grid row-2 mt">${trendCard}${donutBlock("Komposisi Leads Channel", channelDonut)}</div>
      <div class="grid row-2 mt">${funnelCard}${channelBar}</div>
      ${table({ title:"DAFTAR FOLLOW UP", cols:COLS.leads, data:leadsP.slice(0,4) })}</div>`;
  }

  function opsOverview() {
    const tP = filterByPeriod(TIKET || [], "tanggal");
    const nPrev = tP.filter(x=>x.jenis==="Preventif").length;
    const nKor = tP.filter(x=>x.jenis==="Korektif").length;
    const totalTiket = nPrev + nKor;
    const cost = tP.reduce((s,x)=>s+(x._biaya||0),0);
    const defect = totalTiket ? Math.round((nKor/totalTiket)*100) : 0;
    const tikSpark = monthlyCount(tP, "tanggal");
    const korSpark = monthlyCount(tP.filter(x=>x.jenis==="Korektif"), "tanggal");
    const prevSpark = monthlyCount(tP.filter(x=>x.jenis==="Preventif"), "tanggal");
    // Metrik tanpa sumber data (jam respon/resolusi/SLA belum ada di sheet) → "—", bukan dummy
    const top = [
      { label:"Tiket Preventif", value:String(nPrev), spark:prevSpark, bg:G.opRed, onDark:true },
      { label:"Tiket Korektif", value:String(nKor), spark:korSpark, bg:G.opOrange, onDark:true },
      { label:"Defect Rate", value:defect+" %", spark:korSpark, bg:G.opTeal },
      { label:"Total Tiket", value:String(totalTiket), spark:tikSpark, bg:G.opAmber },
      { label:"Biaya Perbaikan", value:fmtRpShort(cost), spark:tikSpark, bg:G.opGreen },
    ];
    // Response Time (jam) = Tgl Lapor − Tgl Kerusakan; Resolution Time (hari) = Tgl Selesai − Tgl Kerusakan.
    // Dihitung sendiri per tiket di hidrasi (_respJam/_resolHari); di sini rata-rata pada periode.
    const respArr = tP.map(x=>x._respJam).filter(v=>v!=null);
    const resolArr = tP.map(x=>x._resolHari).filter(v=>v!=null);
    const avg = a => a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;
    const fmtDur = n => (Math.round(n*10)/10).toLocaleString("id-ID");
    const avgResp = avg(respArr), avgResol = avg(resolArr);
    const mid = [
      { label:"Response Time", value: avgResp!=null ? fmtDur(avgResp)+" jam" : "—", spark: respArr, bg:G.opOrange, onDark:true },
      { label:"Resolution Time", value: avgResol!=null ? fmtDur(avgResol)+" hari" : "—", spark: resolArr, bg:G.opRed, onDark:true },
    ];
    const nInspeksi = filterByPeriod(LOGBOOK, "tanggal").filter(r=>r.divisi==="Inspeksi").length;
    const tiketDonut = [{t:"Preventif",value:nPrev,c:PAL.operasional[0]},{t:"Korektif",value:nKor,c:PAL.operasional[1]},{t:"Inspeksi",value:nInspeksi,c:PAL.operasional[2]}];
    // Expense Category dari keuangan periode — empty state bila kosong
    const Fop = TX_ROWS ? computeFinance(TX_ROWS, periodRange()) : null;
    const ebars = Fop ? topEntries(Fop.opexBy,4) : [];
    let expCard;
    if (ebars.length) { const es = moneyScale(Math.max(1,...ebars.map(e=>e[1]))); expCard = chartCard("Expense Category", barChart(ebars.map(e=>shortAcct(e[0])),scaleVals(ebars.map(e=>e[1]),es),"gOp1",barStopsWarm,null,es.unit), [{t:"Beban"+(es.unit?" ("+es.unit+")":""),c:"#e58a6f"}]); }
    else expCard = emptyCard("Expense Category");
    // Tren tiket (Preventif vs Korektif) sepanjang periode
    const ts = seriesByDate([{name:"Preventif",rows:(TIKET||[]).filter(x=>x.jenis==="Preventif"),dateKey:"tanggal"},{name:"Korektif",rows:(TIKET||[]).filter(x=>x.jenis==="Korektif"),dateKey:"tanggal"}], periodRange());
    const trendCard = ts ? chartCard("Tren Tiket Maintenance", lineChart(ts.seriesList, ts.labels, ts.names), [{t:"Preventif",c:"var(--teal)"},{t:"Korektif",c:"var(--text-2)"}]) : emptyCard("Tren Tiket Maintenance");
    return `<div class="view">${statGrid(top,5)}
      <div class="grid row-3 mt" style="grid-template-columns:minmax(0,1.4fr) repeat(2,minmax(0,1fr))">
        ${expCard}
        ${statCard(mid[0])}${statCard(mid[1])}
      </div>
      <div class="grid row-2 mt">${trendCard}${donutBlock("Komposisi Kategori Tiket", tiketDonut)}</div>
      ${table({ title:"STATUS TIKET", cols:COLS.tiket, data:(TIKET || []) })}</div>`;
  }

  function ownerOverview() {
    // Keuangan dihitung ULANG untuk periode tanggal yang dipilih (line/scorecard/donut ikut berubah)
    const F = TX_ROWS ? computeFinance(TX_ROWS, periodRange()) : null;
    const hasFin = F && F.nBuckets >= 1;
    const moveIn = monthlyCount(filterByPeriod(PENGHUNI, "masuk"), "masuk");
    const cards = [
      { label:"Pendapatan Kotor", value:fmtRpShort(F ? F.pendapatanKotor : 0), spark:F ? F.cashSeries : [], bg:G.ownPrimary, onDark:true },
      { label:"Laba Bersih", value:fmtRpShort(F ? F.labaBersih : 0), spark:F ? F.labaSeries : [], bg:G.ownPrimary, onDark:true },
      { label:"Okupansi", value:(STATS.okupansi ?? 0)+" %", spark:moveIn, bg:G.ownRose, onDark:true },
      { label:"OPEX", value:fmtRpShort(F ? F.beban : 0), spark:F ? F.expSeries : [], bg:G.ownGray, onDark:true },
      { label:"Kamar Kosong", value:String(STATS.kosong ?? 0), spark:moveIn, bg:G.ownGray, onDark:true },
      { label:"Kamar Isi", value:String(STATS.occupied ?? 0), spark:moveIn, bg:G.ownRose, onDark:true },
    ];
    const opex = F ? topEntries(F.opexBy,6).map((e,i)=>({t:shortAcct(e[0]),value:e[1],c:PAL.owner[i%4]})) : [];
    const income = F ? topEntries(F.incomeBy,6).map((e,i)=>({t:shortAcct(e[0]),value:e[1],c:PAL.owner[i%4]})) : [];
    const kamar = [{t:"Terisi",value:STATS.aktif||0,c:PAL.owner[0]},{t:"Booking",value:STATS.booking||0,c:PAL.owner[1]},{t:"Kosong",value:STATS.kosong||0,c:PAL.owner[2]}];
    // Line keuangan — data real; kosong → empty state
    let lineCard;
    if (hasFin) {
      const lsc = moneyScale(Math.max(1,...F.cashSeries,...F.expSeries,...F.labaSeries.map(Math.abs)));
      const U = lsc.unit ? " ("+lsc.unit+")" : "";
      lineCard = chartCard("Pendapatan Kotor vs Beban Operasional vs Laba Rugi", lineChart([scaleVals(F.cashSeries,lsc),scaleVals(F.expSeries,lsc),scaleVals(F.labaSeries,lsc)],F.labels,["Pendapatan Kotor","Beban Operasional","Laba Rugi"],lsc.unit), [{t:"Pendapatan Kotor"+U,c:"var(--teal)"},{t:"Beban Operasional"+U,c:"var(--text-2)"},{t:"Laba Rugi"+U,c:"#e0a13a"}]);
    } else lineCard = emptyCard("Pendapatan Kotor vs Beban Operasional vs Laba Rugi");
    // Bar Beban Operasional — data real; kosong → empty state
    const obars = F ? topEntries(F.opexBy,5) : [];
    let barCard;
    if (obars.length) { const bsc = moneyScale(Math.max(1,...obars.map(e=>e[1]))); barCard = chartCard("Beban Operasional", barChart(obars.map(e=>shortAcct(e[0])),scaleVals(obars.map(e=>e[1]),bsc),"gOwn1",barStopsOwner,null,bsc.unit), [{t:"Beban"+(bsc.unit?" ("+bsc.unit+")":""),c:OWN_BAR}]); }
    else barCard = emptyCard("Beban Operasional");
    return `<div class="view">${statGrid(cards,6)}
      <div class="grid row-2 mt">
        ${lineCard}
        ${barCard}
      </div>
      <div class="grid row-3 mt">${donutBlock("Komposisi OPEX",opex,{money:true,centerLabel:"Total OPEX"})}${donutBlock("Komposisi Income",income,{money:true,centerLabel:"Total Income"})}${donutBlock("Komposisi Status Kamar",kamar,{centerLabel:"Total Kamar"})}</div></div>`;
  }

  function salesOverview() {
    // Scorecard Sales = metrik current/agregat → TANPA filter periode (data booking/leads bisa lintas tahun).
    // Hanya grafik tren (time-series) yang ikut periode.
    const allBooking = BOOKING || [];
    const nLeads = LEADS.length, nSurvey = SURVEY.length, nBooking = allBooking.length;
    const nCancel = allBooking.filter(x=>/batal|cancel/i.test(x.status || "")).length;
    const cancelRate = nBooking ? Math.round((nCancel / nBooking) * 100) : 0;
    const convRate = nLeads ? ((nBooking / nLeads) * 100).toFixed(1).replace(".", ",") : "0";
    // AVG Durasi Sewa (Opsi B): lama tinggal aktual dari sheet Historical Customer (keluar − masuk)
    const avgDurTxt = (RETENTION && RETENTION.avgTenure != null) ? RETENTION.avgTenure + " bln" : "—";
    const bookSpark = monthlyCount(allBooking, "tanggal"), survSpark = monthlyCount(SURVEY, "tanggal");
    const cards = [
      { label:"Booking", value:String(nBooking), spark:bookSpark, bg:G.salePink },
      { label:"Cancellation Rate", value:cancelRate+" %", spark:bookSpark, bg:G.saleRed },
      { label:"Conversion Rate", value:convRate+" %", spark:survSpark, bg:G.saleGold },
      { label:"Retention Rate", value:RETENTION ? RETENTION.rate+" %" : "—", spark:[], bg:G.salePeach }, // sheet Historical Customer
      { label:"AVG Durasi Sewa", value:avgDurTxt, spark:[], bg:G.salePink },                              // sheet Historical Customer
      { label:"Kamar Isi", value:String(STATS.occupied ?? 0), spark:[], bg:G.saleGold },                  // snapshot
    ];
    const prospekDonut = [{t:"Leads",value:nLeads,c:PAL.sales[0]},{t:"Booking",value:nBooking,c:PAL.sales[1]},{t:"Cancel",value:nCancel,c:PAL.sales[2]}];
    const kontrak = STATS.occupied || 0;
    // Tren Booking & Survey → satu-satunya viz time-series, IKUT filter periode
    const ts = seriesByDate([{name:"Booking",rows:allBooking,dateKey:"tanggal"},{name:"Survey",rows:SURVEY,dateKey:"tanggal"}], periodRange());
    const trendCard = ts ? chartCard("Tren Booking & Survey", lineChart(ts.seriesList, ts.labels, ts.names), [{t:"Booking",c:"var(--teal)"},{t:"Survey",c:"var(--text-2)"}]) : emptyCard("Tren Booking & Survey");
    // Kategori prospek dari kolom Asal survey (agregat, tanpa periode)
    const spMap = {}; SURVEY.forEach(s => { const a = s.asal || "Lainnya"; spMap[a] = (spMap[a] || 0) + 1; });
    const spTop = Object.entries(spMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const kategoriCard = spTop.length ? chartCard("Kategori Prospek", barChart(spTop.map(e=>e[0]),spTop.map(e=>e[1]),"gSale1",barStopsWarm), [{t:"Jumlah Prospek",c:"#e58a6f"}]) : emptyCard("Kategori Prospek");
    const funnelCard = (nLeads || nSurvey || nBooking)
      ? chartCard("Funnel Penjualan", `<div class="funnel-wrap">${funnel([{value:nLeads||1},{value:nSurvey||1},{value:nBooking||1},{value:kontrak||1}])}<div class="funnel-stats"><div><span>Leads masuk</span><b>${nLeads}</b></div><div><span>Survey</span><b>${nSurvey}</b></div><div><span>Booking</span><b>${nBooking}</b></div><div><span>Kontrak</span><b>${kontrak}</b></div></div></div>`, [{t:"Leads",c:"#7a6f63"},{t:"Survey",c:"#9a8a78"},{t:"Booking",c:"#b8a890"},{t:"Kontrak",c:"#d8c8b0"}])
      : emptyCard("Funnel Penjualan");
    return `<div class="view">${statGrid(cards,6)}
      <div class="grid row-2 mt">${trendCard}${donutBlock("Komposisi Prospek", prospekDonut)}</div>
      <div class="grid row-2 mt">${funnelCard}${kategoriCard}</div>
      ${table({ title:"DAFTAR PROSPEK", cols:COLS.prospek, data:surveyRows() })}</div>`;
  }

  /* ----------------------------------------------------- ROLE CONFIG */
  const ROLES = {
    admin: {
      label:"Admin & Keuangan", sidebarName:"Admin & Keuangan",
      pages: [
        { id:"overview", label:"Overview", group:"dash", crumb:"Admin", render: adminOverview },
        { id:"penghuni", label:"Daftar Penghuni", group:"page", crumb:"Daftar Penghuni", render: pagePenghuni },
        { id:"pembayaran", label:"Data Pembayaran", group:"page", crumb:"Data Pembayaran", render: pagePembayaran },
        { id:"vendor", label:"Daftar Vendor", group:"page", crumb:"Daftar Vendor", render: () => table({ title:"DAFTAR VENDOR", cols:COLS.vendor, data:VENDOR }) },
        { id:"dokumen", label:"Dokumen", group:"page", crumb:"Dokumen", render: () => pageDokumen("Admin") },
        { id:"logbook", label:"Logbook", group:"page", crumb:"Logbook", render: () => table({ title:"LOGBOOK ADMIN & KEUANGAN", titleRight:true, cols:COLS.logbook, data:logbookForRole("admin") || logbookRows("admin",6) }) },
      ],
    },
    marketing: {
      label:"Marketing", sidebarName:"Marketing",
      pages: [
        { id:"overview", label:"Overview", group:"dash", crumb:"Marketing", render: marketingOverview },
        { id:"leads", label:"Leads dan Survey", group:"page", crumb:"Leads dan Survey", render: () => stackTables(
            table({ title:"DAFTAR LEADS", cols:COLS.leads, data:LEADS }),
            table({ title:"DAFTAR SURVEY", cols:COLS.prospek, data:surveyRows() }),
          ) },
        { id:"dokumen", label:"Dokumen", group:"page", crumb:"Dokumen", render: () => pageDokumen("Marketing") },
        { id:"logbook", label:"Logbook", group:"page", crumb:"Logbook", render: () => table({ title:"LOGBOOK MARKETING", titleRight:true, cols:COLS.logbook, data:logbookForRole("marketing") || logbookRows("marketing",6) }) },
      ],
    },
    operasional: {
      label:"Operasional", sidebarName:"Operasional",
      pages: [
        { id:"overview", label:"Overview", group:"dash", crumb:"Operasional", render: opsOverview },
        { id:"tiket", label:"Daftar Tiket", group:"page", crumb:"Daftar Tiket", render: () => table({ title:"DAFTAR TIKET", cols:COLS.tiket, data:(TIKET && TIKET.length ? TIKET : tiketRows(6)) }) },
        { id:"vendor", label:"Daftar Vendor", group:"page", crumb:"Daftar Vendor", render: () => table({ title:"DAFTAR VENDOR", cols:COLS.vendorOps, data:VENDOR }) },
        { id:"kamar", label:"Data Kamar", group:"page", crumb:"Data Kamar", render: () => rooms("ops") },
        { id:"dokumen", label:"Dokumen", group:"page", crumb:"Dokumen", render: () => pageDokumen("Operasional") },
        { id:"logbook", label:"Logbook", group:"page", crumb:"Logbook", render: () => {
            const live = logbookForRole("operasional");
            if (live) return stackTables(
              table({ title:"Logbook Inspeksi",    titleRight:true, cols:COLS.logbook, data:live.filter(r => r.divisi==="Inspeksi") }),
              table({ title:"Logbook Maintenance", titleRight:true, cols:COLS.logbook, data:live.filter(r => r.divisi==="Maintenance") }),
              table({ title:"Logbook Kebersihan",  titleRight:true, cols:COLS.logbook, data:live.filter(r => r.divisi==="Kebersihan") }),
            );
            return logbookOpsPage();
          } },
      ],
    },
    sales: {
      label:"Sales", sidebarName:"Sales",
      pages: [
        { id:"overview", label:"Overview", group:"dash", crumb:"Sales", render: salesOverview },
        { id:"prospek", label:"Daftar Prospek", group:"page", crumb:"Daftar Prospek", render: () => table({ title:"DAFTAR PROSPEK", cols:COLS.prospek, data:surveyRows() }) },
        { id:"penghuni", label:"Daftar Penghuni", group:"page", crumb:"Daftar Penghuni", render: pagePenghuniSales },
        { id:"kamar", label:"Data Kamar", group:"page", crumb:"Data Kamar", render: () => rooms() },
        { id:"dokumen", label:"Dokumen", group:"page", crumb:"Dokumen", render: () => pageDokumen("Sales") },
        { id:"logbook", label:"Logbook", group:"page", crumb:"Logbook", render: () => table({ title:"LOGBOOK SALES", titleRight:true, cols:COLS.logbook, data:logbookForRole("sales") || logbookRows("sales",6) }) },
      ],
    },
    owner: {
      label:"Owner", sidebarName:"Owner",
      pages: [
        { id:"overview", label:"Overview", group:"dash", crumb:"Owner", render: ownerOverview },
        { id:"sales", label:"Sales", group:"dash", crumb:"Sales", render: salesOverview },
        { id:"marketing", label:"Marketing", group:"dash", crumb:"Marketing", render: marketingOverview },
        { id:"admin", label:"Admin & Keuangan", group:"dash", crumb:"Admin", render: adminOverview },
        { id:"operasional", label:"Operasional", group:"dash", crumb:"Operasional", render: opsOverview },
        { id:"penghuni", label:"Daftar Penghuni", group:"page", crumb:"Daftar Penghuni", render: pagePenghuni },
        { id:"kamar", label:"Data Kamar", group:"page", crumb:"Data Kamar", render: () => rooms() },
        { id:"pembayaran", label:"Data Pembayaran", group:"page", crumb:"Data Pembayaran", render: pagePembayaran },
        { id:"dokumen", label:"Dokumen", group:"page", crumb:"Dokumen", render: () => pageDokumen("Owner") },
        { id:"logbook", label:"Logbook", group:"page", crumb:"Logbook", render: () => table({ title:"LOGBOOK · SEMUA DIVISI", titleRight:true, cols:COLS.logbook,
            data:LOGBOOK.length ? LOGBOOK : ["admin","keuangan","marketing","operasional","sales"].flatMap(d => logbookRows(d,2)) }) },
      ],
    },
  };

  /* ----------------------------------------------------- state */
  const PERIODS = ["Hari ini","Minggu ini","Bulan ini","Tahun ini","Custom"];
  let cur = { auth:false, role:"owner", page:"overview", period:"Tahun ini", from:"", to:"", user:null,
              authView:"login", tfaEnabled:false,
              theme: localStorage.getItem("ktd-theme") || "dark", sidebar: true };
  let clerk = null; // instance Clerk (auth) — diinisialisasi di init()

  // Pesan error Clerk yang manusiawi; fallback ke teks default kalau bukan ClerkAPIResponseError.
  const clerkErr = (err, fallback) => {
    const first = err && err.errors && err.errors[0];
    return (first && (first.longMessage || first.message)) || (err && err.message) || fallback;
  };
  // QR code 2FA di-generate 100% di browser (secret TOTP TIDAK PERNAH dikirim ke pihak ketiga).
  const qrDataUrl = (text) => {
    if (!window.QRCodeGen) return null;
    const q = window.QRCodeGen(0, "M"); q.addData(text); q.make();
    return q.createDataURL(5, 8);
  };

  /* ----------------------------------------------------- LOGIN */
  const loginBrand = `<div class="login-brand"><span class="brand__logo">${I.home}</span><div><b>Kost Tiga Dara</b><small>Management Dashboard</small></div></div>`;

  function loginScreen(errorMsg, okMsg) {
    return `<div class="login">
      <form class="login-card" id="loginForm" autocomplete="on">
        ${loginBrand}
        <h1 class="login-title">Masuk ke Dashboard</h1>
        <p class="login-sub">Owner mengakses semua divisi. Role lain hanya divisinya.</p>
        <div class="login-field"><label for="luser">Username</label>
          <input class="login-input" id="luser" name="username" type="text" autocomplete="username" placeholder="Username" required></div>
        <div class="login-field"><label for="lpass">Password</label>
          <input class="login-input" id="lpass" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required></div>
        <p class="login-error" id="loginError"${errorMsg ? "" : " hidden"}>${errorMsg || ""}</p>
        <p class="login-ok" id="loginOk"${okMsg ? "" : " hidden"}>${okMsg || ""}</p>
        <button type="submit" class="login-btn" id="loginSubmit">${I.lock} Masuk</button>
        <p class="login-hint"><a href="#" id="toForgot">Lupa password?</a></p>
        <p class="login-hint">Belum punya akun? <a href="#" id="toRegister">Daftar di sini</a></p>
      </form></div>`;
  }

  function registerScreen(errorMsg, okMsg) {
    return `<div class="login">
      <form class="login-card" id="registerForm" autocomplete="on">
        ${loginBrand}
        <h1 class="login-title">Daftar Akun Baru</h1>
        <p class="login-sub">Akun baru perlu disetujui Owner sebelum bisa digunakan.</p>
        <div class="login-field"><label for="rname">Nama Lengkap</label>
          <input class="login-input" id="rname" name="name" type="text" autocomplete="name" placeholder="cth. Budi Santoso" required></div>
        <div class="login-field"><label for="ruser">Username</label>
          <input class="login-input" id="ruser" name="username" type="text" autocomplete="username" placeholder="min. 3 karakter" required></div>
        <div class="login-field"><label for="remail">Email</label>
          <input class="login-input" id="remail" name="email" type="email" autocomplete="email" placeholder="email@contoh.com" required></div>
        <div class="login-field"><label for="rpass">Password</label>
          <input class="login-input" id="rpass" name="password" type="password" autocomplete="new-password" placeholder="min. 8 karakter" required></div>
        <p class="login-error" id="regError"${errorMsg ? "" : " hidden"}>${errorMsg || ""}</p>
        <p class="login-ok" id="regOk"${okMsg ? "" : " hidden"}>${okMsg || ""}</p>
        <button type="submit" class="login-btn" id="regSubmit">${I.lock} Daftar</button>
        <p class="login-hint">Sudah punya akun? <a href="#" id="toLogin">Masuk</a></p>
      </form></div>`;
  }

  function otpScreen(errorMsg) {
    return `<div class="login">
      <form class="login-card" id="otpForm" autocomplete="off">
        ${loginBrand}
        <h1 class="login-title">Verifikasi 2FA</h1>
        <p class="login-sub">Masukkan 6 digit kode dari aplikasi authenticator Anda.</p>
        <div class="login-field"><label for="otpCode">Kode OTP</label>
          <input class="login-input login-otp" id="otpCode" name="otp" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" required></div>
        <p class="login-error" id="otpError"${errorMsg ? "" : " hidden"}>${errorMsg || ""}</p>
        <button type="submit" class="login-btn" id="otpSubmit">${I.lock} Verifikasi</button>
        <p class="login-hint"><a href="#" id="otpBack">← Kembali ke login</a></p>
      </form></div>`;
  }

  // Verifikasi OTP email saat PENDAFTARAN akun baru
  function regVerifyScreen(errorMsg, okMsg) {
    return `<div class="login">
      <form class="login-card" id="regVerifyForm" autocomplete="off">
        ${loginBrand}
        <h1 class="login-title">Verifikasi Email</h1>
        <p class="login-sub">Kami mengirim 6 digit kode ke email Anda. Masukkan untuk menyelesaikan pendaftaran.</p>
        <div class="login-field"><label for="rvCode">Kode OTP</label>
          <input class="login-input login-otp" id="rvCode" name="otp" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" required></div>
        <p class="login-error" id="rvError"${errorMsg ? "" : " hidden"}>${errorMsg || ""}</p>
        <p class="login-ok" id="rvOk"${okMsg ? "" : " hidden"}>${okMsg || ""}</p>
        <button type="submit" class="login-btn" id="rvSubmit">${I.lock} Verifikasi & Daftar</button>
        <p class="login-hint"><a href="#" id="rvResend">Kirim ulang kode</a> · <a href="#" id="rvBack">← Batal</a></p>
      </form></div>`;
  }

  // Lupa password — langkah 1: minta username. Kode OTP dikirim ke email yang
  // sudah terdaftar pada akun tsb (Clerk yang tahu email-nya, tak perlu diulang di sini).
  function forgotScreen(errorMsg) {
    return `<div class="login">
      <form class="login-card" id="forgotForm" autocomplete="on">
        ${loginBrand}
        <h1 class="login-title">Lupa Password</h1>
        <p class="login-sub">Masukkan username Anda. Kode OTP akan dikirim ke email terdaftar pada akun tersebut.</p>
        <div class="login-field"><label for="fuser">Username</label>
          <input class="login-input" id="fuser" name="username" type="text" autocomplete="username" placeholder="Username" required></div>
        <p class="login-error" id="fError"${errorMsg ? "" : " hidden"}>${errorMsg || ""}</p>
        <button type="submit" class="login-btn" id="fSubmit">${I.lock} Kirim OTP</button>
        <p class="login-hint"><a href="#" id="fBack">← Kembali ke login</a></p>
      </form></div>`;
  }

  // Lupa password — langkah 2: OTP + password baru
  function resetScreen(errorMsg) {
    return `<div class="login">
      <form class="login-card" id="resetForm" autocomplete="off">
        ${loginBrand}
        <h1 class="login-title">Reset Password</h1>
        <p class="login-sub">Masukkan kode OTP yang dikirim ke email terdaftar & password baru Anda.</p>
        <div class="login-field"><label for="rsCode">Kode OTP</label>
          <input class="login-input login-otp" id="rsCode" name="otp" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" required></div>
        <div class="login-field"><label for="rsPass">Password Baru</label>
          <input class="login-input" id="rsPass" name="newPassword" type="password" autocomplete="new-password" placeholder="min. 8 karakter" required></div>
        <p class="login-error" id="rsError"${errorMsg ? "" : " hidden"}>${errorMsg || ""}</p>
        <button type="submit" class="login-btn" id="rsSubmit">${I.lock} Simpan Password</button>
        <p class="login-hint"><a href="#" id="rsBack">← Kembali ke login</a></p>
      </form></div>`;
  }

  /* ----------------------------------------------------- SHELL */
  function periodFilter() {
    const items = PERIODS.map(p => `<button type="button" class="period-opt ${p===cur.period?"is-active":""}" data-period="${p}">${p}</button>`).join("");
    const custom = cur.period === "Custom" ? `<div class="period-custom"><input type="date" id="pFrom" value="${cur.from}"><span>–</span><input type="date" id="pTo" value="${cur.to}"></div>` : "";
    return `<div class="side-section side-period">
      <div class="side-section__title">Filter Periode</div>
      <button type="button" class="period-toggle" id="periodToggle">${I.cal}<span>${cur.period}</span>${I.caret}</button>
      <div class="period-menu" id="periodMenu" hidden>${items}</div>${custom}</div>`;
  }

  function buildSidebar(role) {
    const r = ROLES[role];
    const dashItems = r.pages.filter(p => p.group === "dash");
    const pageItems = r.pages.filter(p => p.group === "page");
    const navItem = (p) => `<a href="#" class="nav-link ${p.id===cur.page?"is-active":""}" data-page="${p.id}">${p.group==="dash" ? `<span class="ico round"></span>` : `<span class="caret">${I.caret}</span>`}${p.label}</a>`;
    return `<aside class="sidebar">
      <div class="brand"><span class="brand__logo">${I.home}</span><span class="brand__name">${r.sidebarName}</span></div>
      ${periodFilter()}
      <div class="side-section"><div class="side-section__title">Dashboards</div>${dashItems.map(navItem).join("")}</div>
      <div class="side-section"><div class="side-section__title">Pages</div>${pageItems.map(navItem).join("")}</div>
      <div class="side-user">
        <span class="avatar">${esc(initials(cur.user || r.label))}</span>
        <div class="side-user__meta"><b>${esc(cur.user || r.label)}</b><small>Masuk sebagai ${esc(role)}${cur.tfaEnabled ? " · 2FA" : ""}</small></div>
        <button class="side-logout" id="securityBtn" aria-label="Akun & Keamanan" title="Akun & Keamanan">${I.lock}</button>
        <button class="side-logout" id="logoutBtn" aria-label="Keluar" title="Keluar">${I.logout}</button>
      </div></aside>`;
  }

  function buildTopbar(page) {
    return `<header class="topbar">
      <button class="topbar__icon menu-toggle" id="menuToggle" aria-label="Menu">${I.menu}</button>
      <button class="topbar__icon" id="sidebarToggle" aria-label="Sembunyikan sidebar" title="Sembunyikan/Tampilkan sidebar">${I.sidebar}</button>
      <nav class="crumbs"><span>Dashboards</span><span class="sep">/</span><span class="cur">${page.crumb}</span></nav>
      <div class="topbar__right">
        <label class="search"><span>${I.search}</span><input type="text" id="globalSearch" placeholder="Search"><kbd>⌘ /</kbd></label>
        <button class="topbar__icon" id="themeToggle" aria-label="Tema" title="Mode gelap/terang">${cur.theme === "light" ? I.moon : I.sun}</button>
        <button class="topbar__icon" id="refreshBtn" aria-label="Refresh" title="Muat ulang data">${I.refresh}</button>
        <button class="topbar__icon topbar__bell" aria-label="Notifikasi" title="Notifikasi">${I.bell}</button>
        <button class="topbar__icon" id="fullscreenBtn" aria-label="Layar penuh" title="Layar penuh">${I.expand}</button>
      </div></header>`;
  }

  const pageHead = (page) => page.group === "dash"
    ? `<div class="page-head"><div class="seg"><button class="is-active">Overview</button></div><button class="seg-pill">${cur.period} ${I.caret}</button></div>` : "";

  /* ----------------------------------------------------- render */
  function applyTheme() { document.body.classList.toggle("theme-light", cur.theme === "light"); document.body.dataset.role = cur.auth ? (cur.role || "") : ""; }

  function render() {
    const root = document.getElementById("app");
    applyTheme();
    if (!cur.auth) {
      root.className = "app app--login";
      if (cur.authView === "register") { root.innerHTML = registerScreen(); }
      else if (cur.authView === "regverify") { root.innerHTML = regVerifyScreen(); }
      else if (cur.authView === "forgot") { root.innerHTML = forgotScreen(); }
      else if (cur.authView === "reset") { root.innerHTML = resetScreen(); }
      else if (cur.authView === "otp") { root.innerHTML = otpScreen(); }
      else { const m = cur.flash; cur.flash = null; root.innerHTML = loginScreen(null, m); }
      bindAuth(root); return;
    }
    const role = ROLES[cur.role];
    const page = role.pages.find(p => p.id === cur.page) || role.pages[0];
    root.className = "app" + (cur.sidebar ? "" : " sidebar-collapsed");
    root.innerHTML = `
      ${buildSidebar(cur.role)}
      <div class="main">
        ${buildTopbar(page)}
        <div class="content">
          ${pageHead(page)}
          ${page.render()}
          <footer class="foot"><span>© 2026 Kost Tiga Dara</span><span><a href="#">About</a><a href="#">Support</a><a href="#">Contact Us</a></span></footer>
        </div>
      </div>
      <div class="scrim" id="scrim"></div>`;
    bind(root);
    root.querySelector(".content").scrollTo({ top: 0 });
  }

  // Dipanggil setiap kali Clerk session baru aktif (setelah setActive()) ATAU saat
  // page load bila sesi Clerk sudah ada. Sumber kebenaran role/status TETAP backend kita
  // (/api/me → Clerk publicMetadata) — sesi Clerk saja TIDAK cukup utk dianggap "login"
  // (akun pending/disabled ditolak backend; akun ber-2FA aktif WAJIB juga cookie step-up
  // dari POST /api/totp/verify — lihat requireAuth di server.js).
  async function restoreSession() {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const u = await res.json();
        cur.auth = true; cur.role = u.role; cur.user = u.name; cur.tfaEnabled = !!u.tfaEnabled;
        cur.authView = "login"; cur.page = ROLES[cur.role].pages[0].id;
        await loadLiveData();
      } else {
        const d = await res.json().catch(() => ({}));
        if (d.totpRequired) { cur.authView = "otp"; render(); return; } // password OK, 2FA kustom belum diverifikasi
        cur.auth = false; cur.flash = d.error || null;
      }
    } catch { cur.auth = false; }
    render();
  }

  function bindAuth(root) {
    const goto = (v) => { cur.authView = v; render(); };
    root.querySelector("#toRegister")?.addEventListener("click", (e) => { e.preventDefault(); goto("register"); });
    root.querySelector("#toLogin")?.addEventListener("click", (e) => { e.preventDefault(); goto("login"); });
    root.querySelector("#otpBack")?.addEventListener("click", (e) => { e.preventDefault(); goto("login"); });
    root.querySelector("#toForgot")?.addEventListener("click", (e) => { e.preventDefault(); goto("forgot"); });
    root.querySelector("#rvBack")?.addEventListener("click", (e) => { e.preventDefault(); goto("login"); });
    root.querySelector("#fBack")?.addEventListener("click", (e) => { e.preventDefault(); goto("login"); });
    root.querySelector("#rsBack")?.addEventListener("click", (e) => { e.preventDefault(); goto("login"); });

    // --- LOGIN (password via Clerk). 2FA (kalau aktif) adalah lapisan KUSTOM kita
    // sendiri di belakang Clerk — restoreSession() yang mendeteksi & mengarahkan ke
    // layar OTP (backend membalas totpRequired:true bila akun ber-2FA belum step-up). ---
    root.querySelector("#loginForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = root.querySelector("#loginSubmit"), errEl = root.querySelector("#loginError");
      const username = root.querySelector("#luser").value.trim(), password = root.querySelector("#lpass").value;
      btn.disabled = true; btn.classList.add("is-loading");
      try {
        const si = await clerk.client.signIn.create({ identifier: username, password, strategy: "password" });
        if (si.status !== "complete") throw new Error("Login gagal, coba lagi.");
        await clerk.setActive({ session: si.createdSessionId }); await restoreSession();
      } catch (err) {
        errEl.textContent = clerkErr(err, "Username atau password salah"); errEl.hidden = false;
        btn.disabled = false; btn.classList.remove("is-loading");
      }
    });

    // --- LOGIN (step 2: kode Google Authenticator) — diverifikasi backend KITA, bukan Clerk ---
    root.querySelector("#otpForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = root.querySelector("#otpSubmit"), errEl = root.querySelector("#otpError");
      const code = root.querySelector("#otpCode").value.trim();
      btn.disabled = true; btn.classList.add("is-loading");
      try {
        const r = await fetch("/api/totp/verify", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ code }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Verifikasi gagal");
        await restoreSession();
      } catch (err) {
        errEl.textContent = err.message; errEl.hidden = false;
        btn.disabled = false; btn.classList.remove("is-loading");
      }
    });

    // --- REGISTER (step 1: buat sign-up + kirim kode verifikasi email) — Clerk ---
    root.querySelector("#registerForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = root.querySelector("#regSubmit"), errEl = root.querySelector("#regError"), okEl = root.querySelector("#regOk");
      const name = root.querySelector("#rname").value.trim(), username = root.querySelector("#ruser").value.trim(), email = root.querySelector("#remail").value.trim(), password = root.querySelector("#rpass").value;
      errEl.hidden = true; okEl.hidden = true; btn.disabled = true; btn.classList.add("is-loading");
      try {
        await clerk.client.signUp.create({ username, emailAddress: email, password, unsafeMetadata: { name } });
        await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        goto("regverify");
      } catch (err) {
        errEl.textContent = clerkErr(err, "Gagal mendaftar"); errEl.hidden = false;
        btn.disabled = false; btn.classList.remove("is-loading");
      }
    });

    // --- REGISTER (step 2: verifikasi kode email → akun dibuat) ---
    // SENGAJA TIDAK setActive() di sini — akun baru harus menunggu persetujuan Owner
    // (webhook Clerk otomatis men-set status "pending" + ban sampai di-ACC, lihat server.js).
    root.querySelector("#regVerifyForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = root.querySelector("#rvSubmit"), errEl = root.querySelector("#rvError");
      const code = root.querySelector("#rvCode").value.trim();
      errEl.hidden = true; btn.disabled = true; btn.classList.add("is-loading");
      try {
        const su = await clerk.client.signUp.attemptEmailAddressVerification({ code });
        if (su.status !== "complete") throw new Error("Verifikasi gagal");
        cur.flash = "Email terverifikasi. Akun dibuat — menunggu persetujuan Owner sebelum bisa login.";
        goto("login");
      } catch (err) {
        errEl.textContent = clerkErr(err, "Verifikasi gagal"); errEl.hidden = false;
        btn.disabled = false; btn.classList.remove("is-loading");
      }
    });
    root.querySelector("#rvResend")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const okEl = root.querySelector("#rvOk"), errEl = root.querySelector("#rvError");
      errEl.hidden = true; okEl.hidden = true;
      try {
        await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        okEl.textContent = "OTP baru dikirim."; okEl.hidden = false;
      } catch (err) { errEl.textContent = clerkErr(err, "Gagal mengirim ulang"); errEl.hidden = false; }
    });

    // --- LUPA PASSWORD (step 1: minta kode) ---
    // Respons SELALU membawa ke layar OTP tanpa membocorkan apakah username ada
    // (sama seperti sebelumnya) — kalau akun tak ada, langkah verifikasi kode nanti yang gagal.
    root.querySelector("#forgotForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = root.querySelector("#fSubmit");
      const username = root.querySelector("#fuser").value.trim();
      btn.disabled = true; btn.classList.add("is-loading");
      try { await clerk.client.signIn.create({ identifier: username, strategy: "reset_password_email_code" }); }
      catch (_) { /* diam-diam abaikan — jangan bocorkan keberadaan akun */ }
      goto("reset");
    });

    // --- LUPA PASSWORD (step 2: kode + password baru) ---
    root.querySelector("#resetForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = root.querySelector("#rsSubmit"), errEl = root.querySelector("#rsError");
      const code = root.querySelector("#rsCode").value.trim(), newPassword = root.querySelector("#rsPass").value;
      errEl.hidden = true; btn.disabled = true; btn.classList.add("is-loading");
      try {
        const si1 = await clerk.client.signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code });
        if (si1.status !== "needs_new_password") throw new Error("Kode OTP salah atau kedaluwarsa");
        const si2 = await si1.resetPassword({ password: newPassword, signOutOfOtherSessions: true });
        if (si2.status === "complete") { await clerk.setActive({ session: si2.createdSessionId }); await restoreSession(); return; }
        cur.flash = "Password berhasil diubah. Silakan login."; goto("login");
      } catch (err) {
        errEl.textContent = clerkErr(err, "Kode OTP salah atau kedaluwarsa"); errEl.hidden = false;
        btn.disabled = false; btn.classList.remove("is-loading");
      }
    });
  }

  /* "+" → buat dokumen/spreadsheet baru di folder Drive role (server) */
  async function addDocument() {
    try {
      const res = await fetch("/api/documents", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ type:"sheet" }) });
      const data = await res.json();
      if (res.ok && data.url) { window.open(data.url, "_blank", "noopener"); return; }
      if (data.setup) { window.open("https://sheets.new", "_blank", "noopener"); alert("Google Drive belum dikonfigurasi di server — membuka Google Sheets baru. Lihat README untuk mengaktifkan integrasi penuh."); return; }
      alert(data.error || "Gagal membuat dokumen.");
    } catch { window.open("https://sheets.new", "_blank", "noopener"); }
  }

  /* ---- Akun & Keamanan: modal 2FA + (owner) persetujuan akun ---- */
  function openSecurityModal() {
    document.querySelector(".sec-overlay")?.remove();
    const overlay = el(`<div class="sec-overlay"><div class="sec-modal" role="dialog" aria-modal="true">
      <div class="sec-modal__head"><b>Akun & Keamanan</b><button class="sec-close" aria-label="Tutup">✕</button></div>
      <div class="sec-modal__body" id="secBody"></div>
    </div></div>`);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".sec-close").addEventListener("click", close);
    const body = overlay.querySelector("#secBody");

    function renderTfa() {
      const on = cur.tfaEnabled;
      return `<section class="sec-card">
        <h3>Autentikasi Dua Faktor (2FA)</h3>
        <p class="sec-status">${on ? '<span class="status s-complete">Aktif</span>' : '<span class="status s-pending">Nonaktif</span>'} — gunakan Google Authenticator / Authy.</p>
        <div id="tfaArea">
          ${on
            ? `<div class="login-field"><label>Kode OTP untuk menonaktifkan</label><input class="login-input" id="tfaOff" inputmode="numeric" maxlength="6" placeholder="000000"></div>
               <button class="login-btn login-btn--sm" id="tfaDisableBtn">Nonaktifkan 2FA</button>`
            : `<button class="login-btn login-btn--sm" id="tfaSetupBtn">Aktifkan 2FA</button>`}
        </div>
        <p class="sec-msg" id="tfaMsg" hidden></p>
      </section>`;
    }

    function renderPassword() {
      return `<section class="sec-card">
        <h3>Ganti Password</h3>
        <div class="login-field"><label>Password lama</label><input class="login-input" id="pwOld" type="password" autocomplete="current-password" placeholder="••••••••"></div>
        <div class="login-field"><label>Password baru (min. 8 karakter)</label><input class="login-input" id="pwNew" type="password" autocomplete="new-password" placeholder="••••••••"></div>
        <button class="login-btn login-btn--sm" id="pwBtn">Simpan Password</button>
        <p class="sec-msg" id="pwMsg" hidden></p>
      </section>`;
    }

    async function renderOwnerUsers() {
      if (cur.role !== "owner") return "";
      let users = [];
      try { const r = await fetch("/api/users"); if (r.ok) users = await r.json(); } catch {}
      const badge = (s) => `<span class="status ${s==="active"?"s-complete":s==="pending"?"s-pending":"s-progress"}">${s}</span>`;
      const rows = users.map(u => `<tr data-u="${esc(u.username)}">
        <td>${esc(u.name)}</td><td class="cell-id">${esc(u.username)}</td><td>${esc(u.role || "-")}</td><td>${badge(u.status)}</td>
        <td>${u.status==="pending"
          ? `<select class="cell-select sec-role"><option value="sales">sales</option><option value="operasional">operasional</option><option value="marketing">marketing</option><option value="admin">admin</option><option value="owner">owner</option></select>
             <button class="cell-btn sec-approve">Setujui</button>`
          : (u.status==="active" ? `<button class="cell-btn sec-disable">Nonaktifkan</button>` : `<select class="cell-select sec-role"><option value="sales">sales</option><option value="operasional">operasional</option><option value="marketing">marketing</option><option value="admin">admin</option></select><button class="cell-btn sec-approve">Aktifkan</button>`)}
        </td></tr>`).join("");
      return `<section class="sec-card">
        <h3>Kelola Akun <small>(Owner)</small></h3>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody id="secUserRows">${rows || `<tr><td colspan="5">Belum ada akun lain.</td></tr>`}</tbody></table></div>
      </section>`;
    }

    async function paint() {
      body.innerHTML = renderTfa() + renderPassword() + (await renderOwnerUsers());
      // ganti password — langsung ke Clerk (server tidak pernah menyentuh password)
      body.querySelector("#pwBtn")?.addEventListener("click", async () => {
        const msg = body.querySelector("#pwMsg");
        const oldPassword = body.querySelector("#pwOld").value, newPassword = body.querySelector("#pwNew").value;
        msg.hidden = true; msg.style.color = "";
        try {
          await clerk.user.updatePassword({ currentPassword: oldPassword, newPassword, signOutOfOtherSessions: true });
          msg.textContent = "Password berhasil diganti."; msg.style.color = "var(--green)"; msg.hidden = false;
          body.querySelector("#pwOld").value = ""; body.querySelector("#pwNew").value = "";
        } catch (err) { msg.textContent = clerkErr(err, "Gagal mengganti password"); msg.hidden = false; }
      });
      // 2FA: setup — TOTP kustom (bukan Clerk, MFA Clerk berbayar). Secret disimpan di
      // Clerk privateMetadata lewat backend kita; QR di-generate di browser dari uri-nya.
      body.querySelector("#tfaSetupBtn")?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        const msg = body.querySelector("#tfaMsg");
        try {
          const r = await fetch("/api/totp/setup", { method:"POST" });
          const totp = await r.json();
          if (!r.ok) throw new Error(totp.error || "Gagal memulai 2FA");
          const qr = totp.uri ? qrDataUrl(totp.uri) : null;
          body.querySelector("#tfaArea").innerHTML =
            `${qr ? `<img class="tfa-qr" src="${qr}" alt="QR 2FA" width="168" height="168">` : ""}
             <p class="sec-secret">Atau masukkan kode ini manual: <code>${esc(totp.secret || "")}</code></p>
             <div class="login-field"><label>Masukkan kode OTP dari aplikasi</label><input class="login-input" id="tfaOn" inputmode="numeric" maxlength="6" placeholder="000000"></div>
             <button class="login-btn login-btn--sm" id="tfaEnableBtn">Verifikasi & Aktifkan</button>`;
          body.querySelector("#tfaEnableBtn").addEventListener("click", async () => {
            try {
              const rr = await fetch("/api/totp/enable", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ code: body.querySelector("#tfaOn").value.trim() }) });
              const dd = await rr.json();
              if (!rr.ok) throw new Error(dd.error || "Kode OTP salah");
              cur.tfaEnabled = true; paint(); render();
            } catch (err) { msg.textContent = err.message; msg.hidden = false; }
          });
        } catch (err) { msg.textContent = err.message; msg.hidden = false; e.target.disabled = false; }
      });
      // 2FA: disable
      body.querySelector("#tfaDisableBtn")?.addEventListener("click", async () => {
        const msg = body.querySelector("#tfaMsg");
        const code = body.querySelector("#tfaOff").value.trim();
        if (!code) { msg.textContent = "Masukkan kode OTP dari aplikasi Anda"; msg.hidden = false; return; }
        try {
          const r = await fetch("/api/totp/disable", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ code }) });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Gagal");
          cur.tfaEnabled = false; paint(); render();
        } catch (err) { msg.textContent = err.message; msg.hidden = false; }
      });
      // owner approve / disable
      body.querySelectorAll(".sec-approve").forEach(b => b.addEventListener("click", async () => {
        const tr = b.closest("tr"), username = tr.dataset.u, role = tr.querySelector(".sec-role").value;
        const r = await fetch("/api/users/approve", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ username, role }) });
        if (r.ok) paint();
      }));
      body.querySelectorAll(".sec-disable").forEach(b => b.addEventListener("click", async () => {
        const username = b.closest("tr").dataset.u;
        const r = await fetch("/api/users/disable", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ username }) });
        if (r.ok) paint();
      }));
    }
    paint();
  }

  /* table interaction: search global + dropdown filter per-kolom (corong) + sort + add */
  function wireTable(block) {
    const tbody = block.querySelector("tbody"); if (!tbody) return;
    const dataRows = () => [...tbody.querySelectorAll("tr")].filter(tr => !tr.classList.contains("tbl-empty"));
    const heads = [...block.querySelectorAll("thead tr:first-child th")];
    const cellText = (tr, i) => {
      const cell = tr.cells[i]; if (!cell) return "";
      const nameEl = cell.querySelector(".cell-name"); // abaikan inisial avatar pada kolom Nama
      if (nameEl) { const av = nameEl.querySelector(".avatar"); return nameEl.textContent.replace(av ? av.textContent : "", "").trim(); }
      return (cell.textContent || "").trim();
    };
    const active = new Map(); // colIndex -> Set(nilai terpilih, lowercase). Tak ada entri = tampilkan semua.

    // Search global + filter kolom aktif digabung (AND)
    const search = block.querySelector('[data-act="tsearch"]');
    const applyFilters = () => {
      const gq = (search?.value || "").toLowerCase();
      dataRows().forEach(tr => {
        let ok = !gq || tr.textContent.toLowerCase().includes(gq);
        if (ok) for (const [i, set] of active) { if (!set.has(cellText(tr, i).toLowerCase())) { ok = false; break; } }
        tr.style.display = ok ? "" : "none";
      });
    };
    search?.addEventListener("input", applyFilters);

    // ---- dropdown filter per kolom (corong, AutoFilter) ----
    let menu = null;
    const onDocClick = (e) => { if (menu && !menu.contains(e.target) && !e.target.closest(".col-filter-btn")) closeMenu(); };
    const onKey = (e) => { if (e.key === "Escape") closeMenu(); };
    function closeMenu() { if (!menu) return; menu.remove(); menu = null; document.removeEventListener("mousedown", onDocClick, true); document.removeEventListener("keydown", onKey); }
    function openMenu(btn, i) {
      closeMenu();
      const values = [...new Set(dataRows().map(tr => cellText(tr, i)).filter(v => v !== ""))].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
      const sel = active.get(i);
      const isChecked = (v) => !sel || sel.has(v.toLowerCase());
      menu = document.createElement("div");
      menu.className = "colfilter-menu";
      menu.innerHTML =
        `<input type="text" class="cfm-q" placeholder="Cari nilai…">` +
        `<label class="cfm-item cfm-all"><input type="checkbox" class="cfm-allbox"><span>Pilih semua</span></label>` +
        `<div class="cfm-list">${values.length ? values.map(v => `<label class="cfm-item"><input type="checkbox" class="cfm-box" value="${esc(v)}" ${isChecked(v) ? "checked" : ""}><span>${esc(v)}</span></label>`).join("") : `<div class="cfm-empty">Tidak ada nilai</div>`}</div>` +
        `<div class="cfm-foot"><button type="button" class="cfm-reset">Reset</button><button type="button" class="cfm-apply">Terapkan</button></div>`;
      document.body.appendChild(menu);
      const r = btn.getBoundingClientRect();
      menu.style.top = Math.round(r.bottom + 6) + "px";
      menu.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 236))) + "px";
      const boxes = () => [...menu.querySelectorAll(".cfm-box")];
      const visBoxes = () => boxes().filter(b => b.closest(".cfm-item").style.display !== "none");
      const allbox = menu.querySelector(".cfm-allbox");
      const syncAll = () => { const bs = visBoxes(); allbox.checked = bs.length > 0 && bs.every(b => b.checked); allbox.indeterminate = bs.some(b => b.checked) && !allbox.checked; };
      syncAll();
      allbox.addEventListener("change", () => { visBoxes().forEach(b => b.checked = allbox.checked); });
      boxes().forEach(b => b.addEventListener("change", syncAll));
      menu.querySelector(".cfm-q").addEventListener("input", (e) => { const q = e.target.value.toLowerCase(); boxes().forEach(b => b.closest(".cfm-item").style.display = b.value.toLowerCase().includes(q) ? "" : "none"); syncAll(); });
      menu.querySelector(".cfm-apply").addEventListener("click", () => {
        const checked = boxes().filter(b => b.checked).map(b => b.value.toLowerCase());
        if (checked.length === values.length) active.delete(i); else active.set(i, new Set(checked));
        btn.classList.toggle("is-active", active.has(i));
        applyFilters(); closeMenu();
      });
      menu.querySelector(".cfm-reset").addEventListener("click", () => { active.delete(i); btn.classList.remove("is-active"); applyFilters(); closeMenu(); });
      setTimeout(() => { document.addEventListener("mousedown", onDocClick, true); document.addEventListener("keydown", onKey); menu.querySelector(".cfm-q").focus(); }, 0);
    }
    block.querySelectorAll(".col-filter-btn").forEach(btn => btn.addEventListener("click", (e) => { e.stopPropagation(); openMenu(btn, +btn.dataset.fcol); }));

    // sort per kolom: klik header (abaikan klik corong) → toggle asc/desc, indikator ▲/▼
    heads.forEach((th, i) => {
      th.style.cursor = "pointer"; th.title = "Klik untuk urutkan";
      th.addEventListener("click", (e) => {
        if (e.target.closest(".col-filter-btn")) return;
        const dir = th.dataset.dir === "asc" ? "desc" : "asc";
        heads.forEach(h => { h.removeAttribute("data-dir"); const ind = h.querySelector(".sort-ind"); if (ind) ind.textContent = ""; });
        th.dataset.dir = dir;
        const ind = th.querySelector(".sort-ind"); if (ind) ind.textContent = dir === "asc" ? " ▲" : " ▼";
        const rs = dataRows();
        rs.sort((a, b) => { const ta = cellText(a, i), tb = cellText(b, i); return dir === "asc" ? ta.localeCompare(tb, "id", { numeric: true }) : tb.localeCompare(ta, "id", { numeric: true }); });
        rs.forEach(r => tbody.appendChild(r));
      });
    });

    block.querySelector('[data-act="add"]')?.addEventListener("click", addDocument);
  }

  function bind(root) {
    root.querySelectorAll("[data-page]").forEach(a => a.addEventListener("click", (e) => { e.preventDefault(); cur.page = a.dataset.page; render(); }));
    root.querySelector("#logoutBtn")?.addEventListener("click", async () => { try { await clerk.signOut(); } catch {} cur.auth = false; cur.user = null; cur.authView = "login"; render(); });
    root.querySelector("#securityBtn")?.addEventListener("click", openSecurityModal);

    // mobile nav + hide sidebar
    const menu = root.querySelector("#menuToggle"), scrim = root.querySelector("#scrim");
    menu?.addEventListener("click", () => root.classList.toggle("nav-open"));
    scrim?.addEventListener("click", () => root.classList.remove("nav-open"));
    root.querySelector("#sidebarToggle")?.addEventListener("click", () => { cur.sidebar = !cur.sidebar; root.classList.toggle("sidebar-collapsed", !cur.sidebar); });

    // theme / refresh / fullscreen
    root.querySelector("#themeToggle")?.addEventListener("click", () => { cur.theme = cur.theme === "light" ? "dark" : "light"; localStorage.setItem("ktd-theme", cur.theme); render(); });
    // Refresh = tarik ULANG data dari /api/sheets (bukan sekadar render ulang)
    root.querySelector("#refreshBtn")?.addEventListener("click", async (e) => {
      const b = e.currentTarget; b.classList.add("spin");
      try { await loadLiveData(); } catch {}
      render();
    });
    root.querySelector("#fullscreenBtn")?.addEventListener("click", () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.();
    });

    // global search → filter every table on the page
    const gs = root.querySelector("#globalSearch");
    gs?.addEventListener("input", () => {
      const q = gs.value.toLowerCase();
      root.querySelectorAll(".tbl tbody tr").forEach(tr => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none"; });
    });

    // period filter
    const tgl = root.querySelector("#periodToggle"), menuEl = root.querySelector("#periodMenu");
    tgl?.addEventListener("click", () => menuEl.toggleAttribute("hidden"));
    root.querySelectorAll("[data-period]").forEach(b => b.addEventListener("click", () => { cur.period = b.dataset.period; render(); }));
    root.querySelector("#pFrom")?.addEventListener("change", (e) => { cur.from = e.target.value; render(); });
    root.querySelector("#pTo")?.addEventListener("change", (e) => { cur.to = e.target.value; render(); });

    // room status filter
    root.querySelectorAll("[data-roomfilter]").forEach(b => b.addEventListener("click", () => {
      const f = b.dataset.roomfilter;
      root.querySelectorAll(".chip").forEach(c => c.classList.toggle("is-active", c === b));
      root.querySelectorAll(".room").forEach(rm => { rm.style.display = (f === "Semua" || rm.dataset.status === f) ? "" : "none"; });
    }));

    // per-table search/sort/filter/add
    root.querySelectorAll(".table-block").forEach(wireTable);

    // checkbox toggling
    root.querySelectorAll(".cbox").forEach(c => c.addEventListener("click", () => { c.classList.toggle("on"); c.closest("tr")?.classList.toggle("is-selected"); }));
    // dropdown recolor
    root.querySelectorAll(".cell-select").forEach(s => s.addEventListener("change", () => { s.dataset.v = slug(s.value); }));
  }

  /* hover callout for donut segments + line-chart points (set up once) */
  function setupChartTooltip() {
    const tip = document.createElement("div");
    tip.className = "chart-tip"; tip.hidden = true; document.body.appendChild(tip);
    let active = null;
    const tipFor = (t) => `<span class="chart-tip__dot" style="background:${t.getAttribute("data-tip-color")}"></span><span class="chart-tip__lab">${t.getAttribute("data-tip-label")}</span><b>${t.getAttribute("data-tip-value")}</b>`;
    document.addEventListener("mouseover", (e) => {
      const t = e.target.closest && e.target.closest("[data-tip-label]");
      if (!t) return;
      active = t; tip.innerHTML = tipFor(t); tip.hidden = false;
    });
    document.addEventListener("mousemove", (e) => {
      if (tip.hidden) return;
      const pad = 14, tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = e.clientX + pad, y = e.clientY + pad;
      if (x + tw > innerWidth) x = e.clientX - tw - pad;
      if (y + th > innerHeight) y = e.clientY - th - pad;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    });
    document.addEventListener("mouseout", (e) => {
      const t = e.target.closest && e.target.closest("[data-tip-label]");
      if (t && t === active) { tip.hidden = true; active = null; }
    });
  }

  /* hidrasi data live dari Google Spreadsheet (Rumah_Pandega_LIVE_v2) bila
     server dikonfigurasi; jika tidak, snapshot bawaan tetap dipakai (fallback). */
  async function loadLiveData() {
    try {
      const res = await fetch("/api/sheets");
      if (!res.ok) return;
      const { configured, sheets } = await res.json();
      if (!configured || !sheets) return;
      const key = Object.keys(sheets).find(k => /penghuni/i.test(k));
      const rows = key && sheets[key];
      if (!Array.isArray(rows) || rows.length < 2) return;
      const header = rows[0].map(h => String(h).toLowerCase());
      const col = (...names) => { for (const n of names) { const i = header.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };
      const ci = {
        no: col("no"), id: col("id"), nama: col("nama lengkap","nama"), panggil: col("panggil"),
        kamar: col("no kamar","kamar"), jenis: col("jenis"), asal: col("asal"), kerja: col("pekerjaan"),
        instansi: col("instansi"), durasi: col("lama tinggal","durasi"), masuk: col("tgl masuk","masuk"),
        tempo: col("jatuh tempo","tempo"), status: col("status"), kontak: col("kontak darurat","kontak"),
        kontakNama: col("nama kontak"), email: col("email"),
        sisa: col("sisa hari","sisa"), flag: col("flag tagih","flag"), hp: col("no hp penghuni","no hp","hp penghuni"),
      };
      const get = (r, i, d="") => (i >= 0 && r[i] != null ? r[i] : d);
      const data = rows.slice(1).filter(r => get(r, ci.nama)).map((r, i) => {
        const kamar = +(String(get(r, ci.kamar, "0")).replace(/[^0-9]/g, "") || 0);
        const sisaRaw = String(get(r, ci.sisa)).replace(/[^0-9-]/g, "");
        return {
          no: ci.no >= 0 ? get(r, ci.no, i + 1) : i + 1, id: get(r, ci.id), nama: get(r, ci.nama), panggil: get(r, ci.panggil),
          kamar, jenis: get(r, ci.jenis) || ROOM_TYPE(kamar), asal: get(r, ci.asal), kerja: get(r, ci.kerja),
          instansi: get(r, ci.instansi), durasi: get(r, ci.durasi), masuk: get(r, ci.masuk), tempo: get(r, ci.tempo),
          status: get(r, ci.status), kontak: get(r, ci.kontak), kontakNama: get(r, ci.kontakNama), email: get(r, ci.email),
          sisa: sisaRaw === "" ? null : +sisaRaw, flag: get(r, ci.flag),
          hp: get(r, ci.hp) || get(r, ci.kontak), wa: get(r, ci.hp) || get(r, ci.kontak), // No HP Penghuni → tombol WA
        };
      });
      if (data.length) { PENGHUNI = data; recomputeFromPenghuni(); }

      // Hydrate LOGBOOK dari tab 13_LOGBOOK
      const lbKey = Object.keys(sheets).find(k => /logbook/i.test(k));
      const lbRows = lbKey && sheets[lbKey];
      if (Array.isArray(lbRows) && lbRows.length >= 2) {
        const lbHead = lbRows[0].map(h => String(h).toLowerCase());
        const lc = (...names) => { for (const n of names) { const i = lbHead.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };
        const lci = { tanggal: lc("tanggal"), name: lc("task","deskripsi"), pic: lc("pic","petugas"), divisi: lc("divisi"), deadline: lc("deadline"), logStatus: lc("status") };
        const lg = (r, i, d="") => (i >= 0 && r[i] != null ? String(r[i]) : d);
        const lbData = lbRows.slice(1).filter(r => lg(r, lci.tanggal)).map(r => ({
          tanggal: lg(r, lci.tanggal), name: lg(r, lci.name), pic: lg(r, lci.pic),
          divisi: lg(r, lci.divisi), deadline: lg(r, lci.deadline), logStatus: lg(r, lci.logStatus),
        }));
        if (lbData.length) LOGBOOK = lbData;
      }

      // Hydrate Data Pembayaran dari tab TRANSAKSI (deteksi via header Akun Debit/Kredit)
      const txKey = Object.keys(sheets).find(k => {
        const r = sheets[k];
        if (!Array.isArray(r) || !r.length) return false;
        const h = r[0].map(x => String(x).toLowerCase());
        return h.some(x => x.includes("debit")) && h.some(x => x.includes("kredit"));
      });
      const txRows = txKey && sheets[txKey];
      if (Array.isArray(txRows) && txRows.length >= 2) {
        const tx = buildPembayaranFromTransaksi(txRows);
        if (tx.length) PEMBAYARAN = tx;
        TX_ROWS = txRows; // simpan mentah → keuangan dihitung ulang per periode tanggal
        const fin = buildFinanceFromTransaksi(txRows);
        if (fin) FINANCE = fin;
      }

      // ---- Marketing / Sales / Operasional: baca tab log live (deteksi via header) ----
      const findTab = (pred) => {
        for (const k of Object.keys(sheets)) {
          const r = sheets[k];
          if (Array.isArray(r) && r.length >= 2) { const h = r[0].map(x => String(x).toLowerCase()); if (pred(h)) return r; }
        }
        return null;
      };
      const has = (h, s) => h.some(x => x.includes(s));
      const objs = (rows, colMap) => {
        const h = rows[0].map(x => String(x).toLowerCase());
        const ix = (names) => { for (const n of names) { const i = h.findIndex(x => x.includes(n)); if (i >= 0) return i; } return -1; };
        const ci = {}; for (const k in colMap) ci[k] = ix(colMap[k]);
        const g = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
        return rows.slice(1).map(r => { const o = {}; for (const k in ci) o[k] = g(r, ci[k]); return o; });
      };
      const pad3 = (n) => String(n).padStart(3, "0");
      const num = (s) => { const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10); return isNaN(n) ? 0 : n; };

      // Leads (Marketing)
      const leadsRows = findTab(h => has(h, "nama leads") && has(h, "status leads"));
      if (leadsRows) {
        const o = objs(leadsRows, { name:["nama leads"], wa:["no hp","no. hp","wa"], asal:["sumber leads","sumber"], platform:["platform"], tanggal:["tanggal"], status:["status leads"] });
        const pill = s => { const t = s.toLowerCase(); if (t.includes("follow")) return { t:"Follow Up", c:"s-followup" }; if (t.includes("survey")) return { t:"Survey", c:"s-progress" }; if (t.includes("booking") || t.includes("closing")) return { t:"Closing", c:"s-complete" }; return { t: s || "Baru", c:"s-leads" }; };
        const L = o.filter(x => x.name).map((x, i) => ({ check:false, id:"LD-"+pad3(i+1), name:x.name, wa:x.wa, asal:x.asal || x.platform, tanggal:x.tanggal, status: pill(x.status) }));
        if (L.length) LEADS = L;
      }
      // Survey / Prospek (Marketing & Sales)
      const surveyTab = findTab(h => has(h, "tanggal survey") && has(h, "hasil survey"));
      if (surveyTab) {
        const o = objs(surveyTab, { name:["nama calon","nama"], wa:["no. hp","no hp","hp"], asal:["dari mana","sumber"], pertimbangan:["keberatan","kendala"], hasil:["hasil survey"], tanggal:["tanggal survey","tanggal"] });
        const S = o.filter(x => x.name).map(x => ({ check:false, nama:x.name, wa:x.wa, asal:x.asal, pertimbangan:x.pertimbangan || x.hasil, tanggal:x.tanggal }));
        if (S.length) SURVEY = S;
      }
      // Booking (Sales)
      const bookingTab = findTab(h => has(h, "status booking") || has(h, "no. booking") || has(h, "no booking"));
      if (bookingTab) {
        const o = objs(bookingTab, { nama:["nama penyewa","nama"], kamar:["kamar"], status:["status booking","status"], durasi:["durasi"], harga:["harga"], tanggal:["tanggal booking","tanggal"], cancel:["alasan cancel"] });
        const B = o.filter(x => x.nama);
        if (B.length) BOOKING = B;
      }
      // Tiket = Preventive + Corrective maintenance (Operasional) — struktur baru:
      //   Korektif punya kolom "Tanggal kerusakan"; Preventif tidak.
      //   Response Time = Tgl Lapor − Tgl Kerusakan (jam); Resolution Time = Tgl Selesai − Tgl Kerusakan (hari).
      const tiketMap = {
        lokasi:["lokasi / item rusak","item rusak","lokasi"], desk:["deskripsi kerusakan","deskripsi","kategori"],
        prioritas:["prioritas"], biaya:["biaya"], status:["status"],
        tgl:["tanggal lapor","tgl lapor","tanggal"], idTiket:["id tiket"], durasiHari:["durasi perbaikan"],
        tglKerusakan:["tanggal kerusakan","tgl kerusakan"], tglLapor:["tanggal lapor","tgl lapor"], tglSelesai:["tanggal selesai","tgl selesai"],
      };
      const tpill = s => { const t = s.toLowerCase(); if (t.includes("selesai") || t.includes("complete")) return { t:"Complete", c:"s-complete" }; if (t.includes("proses") || t.includes("progress")) return { t:"In Progress", c:"s-progress" }; return { t: s || "Pending", c:"s-pending" }; };
      const mapTiket = (rows, jenis) => objs(rows, tiketMap).filter(x => x.lokasi || x.desk).map((x, i) => {
        const tK = parseDateTime(x.tglKerusakan), tL = parseDateTime(x.tglLapor || x.tgl), tS = parseDateTime(x.tglSelesai);
        const _respJam = (tK && tL && tL >= tK) ? (tL - tK) / 3600000 : null;          // hitung sendiri (jam)
        const _resolHari = (tK && tS && tS >= tK) ? (tS - tK) / 86400000 : null;        // hitung sendiri (hari)
        return { check:false, id: x.idTiket || ("TK-"+jenis[0]+pad3(i+1)), pekerjaan:x.desk || x.lokasi, jenis, lokasi:x.lokasi,
          tanggal:x.tglLapor || x.tgl, status: tpill(x.status), _biaya: num(x.biaya), _respJam, _resolHari };
      });
      // Deteksi tab via kolom baru: keduanya punya "item rusak"; pembeda = ada "tanggal kerusakan" (Korektif)
      const corrTab = findTab(h => has(h, "item rusak") && has(h, "tanggal kerusakan"));
      const prevTab = findTab(h => has(h, "item rusak") && !has(h, "tanggal kerusakan"));
      let tk = [];
      if (prevTab) tk = tk.concat(mapTiket(prevTab, "Preventif"));
      if (corrTab) tk = tk.concat(mapTiket(corrTab, "Korektif"));
      if (tk.length) TIKET = tk;

      // Vendor (12_VENDOR)
      const vendorTab = findTab(h => has(h, "nama vendor"));
      if (vendorTab) {
        const o = objs(vendorTab, { nama:["nama vendor"], kategori:["kategori"], kontak:["nomor telp","telp","kontak"], hasil:["hasil"] });
        const V = o.filter(x => x.nama).map((x, i) => ({ id:"VD-"+pad3(i+1), nama:x.nama, kategori:x.kategori, kontak:x.kontak, hasil:x.hasil || "-", wa:x.kontak }));
        if (V.length) VENDOR = V;
      }
      // Master KAMAR (tab KAMAR: ID | No Kamar | Nama | Tipe | Harga | Status) → okupansi akurat
      const kamarTab = findTab(h => has(h, "no kamar") && has(h, "tipe") && has(h, "harga") && has(h, "status"));
      if (kamarTab) {
        const o = objs(kamarTab, { id:["id"], kamar:["no kamar"], nama:["nama"], tipe:["tipe"], harga:["harga"], status:["status"] });
        const K = o.filter(x => String(x.kamar).replace(/[^0-9]/g, "")).map(x => ({
          id:x.id, kamar:+String(x.kamar).replace(/[^0-9]/g, ""), nama:x.nama, tipe:x.tipe, harga:x.harga, status:x.status,
        }));
        if (K.length) { KAMAR = K; recomputeFromPenghuni(); } // hitung ulang ROOMS/STATS dgn master kamar
      }
      // Historical Customer → Retention Rate (ID | Nama Lengkap | Tanggal Masuk | Tanggal Keluar)
      const histTab = findTab(h => has(h, "nama lengkap") && has(h, "tanggal masuk") && has(h, "tanggal keluar"));
      if (histTab) {
        const o = objs(histTab, { nama:["nama lengkap","nama"], masuk:["tanggal masuk"], keluar:["tanggal keluar"] });
        const recs = o.filter(x => x.nama);
        const hasKeluar = (v) => { const t = String(v || "").trim(); return t && t !== "-"; };
        const churnedRecs = recs.filter(x => hasKeluar(x.keluar));
        const total = recs.length, churned = churnedRecs.length;
        // Rata-rata lama tinggal (bln) SEMUA pelanggan: yang sudah keluar = keluar−masuk;
        // yang masih tinggal (belum ada Tgl Keluar) = tanggal sistem sekarang − masuk.
        const MONTH_MS = 2629800000, now = new Date();
        const tenures = recs.map(x => {
          const a = parseDate(x.masuk); if (!a) return null;
          const b = hasKeluar(x.keluar) ? parseDate(x.keluar) : now;
          return b ? (b - a) / MONTH_MS : null;
        }).filter(v => v != null && v >= 0);
        const avgTenure = tenures.length ? Math.round(tenures.reduce((s, v) => s + v, 0) / tenures.length) : null;
        if (total) RETENTION = { total, churned, rate: Math.round(((total - churned) / total) * 100), churn: Math.round((churned / total) * 100), avgTenure };
      }
      // Dokumen (14_DOKUMEN)
      const dokTab = findTab(h => has(h, "judul") && (has(h, "role") || has(h, "link drive")));
      if (dokTab) {
        const o = objs(dokTab, { id:["id"], name:["judul","nama"], role:["role"], kategori:["kategori"], tanggal:["tanggal"], link:["link drive","link"] });
        const D = o.filter(x => x.name).map((x, i) => ({ id:x.id || "DOC-"+pad3(i+1), name:x.name, role:x.role, kategori:x.kategori, tanggal:x.tanggal, link:x.link || "https://drive.google.com/drive/my-drive" }));
        if (D.length) DOKUMEN = D;
      }
    } catch {}
  }

  // Akun kas/bank (dari COA) — penentu arah pemasukan/pengeluaran
  const KAS_ACCOUNTS = ["uang kas", "aset bank", "rekening ops", "rekening profit"];
  function buildPembayaranFromTransaksi(rows) {
    const head = rows[0].map(h => String(h).toLowerCase());
    const idx = (...names) => { for (const n of names) { const i = head.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };
    const ci = { tgl: idx("tanggal"), debit: idx("akun debit", "debit"), kredit: idx("akun kredit", "kredit"), nominal: idx("nominal"), ket: idx("keterangan") };
    if (ci.tgl < 0 || ci.nominal < 0 || ci.debit < 0 || ci.kredit < 0) return [];
    const isKas = (s) => KAS_ACCOUNTS.includes(String(s || "").trim().toLowerCase());
    // Akun pendapatan (termasuk "Pendapatan Diterima di Muka") → sisi pemasukan
    const isPendapatan = (s) => { const t = String(s || "").trim().toLowerCase(); return t.startsWith("pendapatan") || t === "denda" || t === "tambahan listrik" || t.includes("laba penjualan"); };
    const isBeban = (s) => { const t = String(s || "").trim().toLowerCase(); return t.startsWith("beban") || t.startsWith("utilitas"); };
    const toNum = (s) => { const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10); return isNaN(n) ? 0 : n; };
    const out = [];
    // Format akuntansi (double-entry): tampilkan SEMUA entri jurnal, klasifikasi per baris.
    rows.slice(1).forEach(r => {
      const tgl = String(r[ci.tgl] || "").trim();
      const nominal = toNum(r[ci.nominal]);
      if (!tgl || !nominal) return;
      const debit = r[ci.debit], kredit = r[ci.kredit];
      const ket = String(r[ci.ket] || "").trim();
      let jenis = null;
      if (isPendapatan(kredit)) jenis = "Pemasukan";                 // akun pendapatan dikredit → pemasukan
      else if (isBeban(debit)) jenis = "Pengeluaran";                // akun beban didebit → pengeluaran
      else if (isKas(debit) && !isKas(kredit)) jenis = "Pemasukan";  // fallback: kas masuk
      else if (isKas(kredit) && !isKas(debit)) jenis = "Pengeluaran";// fallback: kas keluar
      else return; // mutasi neraca murni (mis. kas↔deposit) → bukan pemasukan/pengeluaran
      const namaTx = ket || (jenis === "Pemasukan" ? String(kredit) : String(debit));
      // enrich keterangan: nomor kamar + DP/Pelunasan/Sewa untuk pendapatan sewa
      let extra = "";
      if (jenis === "Pemasukan") {
        const p = PENGHUNI.find(p => {
          const toks = [p.panggil, (p.nama || "").split(" ")[0]].filter(Boolean).map(t => String(t).toLowerCase());
          return toks.some(t => t.length > 2 && ket.toLowerCase().includes(t));
        });
        if (p) {
          const tag = /sewa/i.test(ket) ? (p.status === "Booking (DP)" ? "DP" : "Pelunasan") : "";
          extra = "Kamar " + p.kamar + (tag ? " · " + tag : "");
        }
      }
      out.push({
        tanggal: fmtDateID(tgl), // normalisasi tampilan (serial/dd-mm → "6 Jul 2026")
        jenisTx: jenis === "Pemasukan" ? { t: "Pemasukan", c: "s-complete" } : { t: "Pengeluaran", c: "s-pending" },
        namaTx, jumlah: "Rp" + nominal.toLocaleString("id-ID"), keterangan: extra,
      });
    });
    // Urutkan kronologis berdasarkan tanggal (entri lama → baru)
    out.sort((a, b) => {
      const da = parseDate(a.tanggal), db = parseDate(b.tanggal);
      return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
    });
    return out;
  }

  /* Ringkasan keuangan dari kolom "Dampak Laba" (basis laba-rugi, anti double-entry):
     Dampak Laba > 0 = pendapatan diakui; (xxx)/negatif = beban; "-" = transfer kas/akrual (diabaikan). */
  const MONTH_ID3 = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const fmtRpShort = (n) => { n = Math.round(n || 0); if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " Jt"; if (n >= 1e3) return Math.round(n / 1e3) + " rb"; return "Rp" + n; };
  const topEntries = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
  const shortAcct = (s) => String(s).replace(/^Beban\s+/i, "").replace(/^Pendapatan\s+/i, "").trim().slice(0, 14);
  function buildFinanceFromTransaksi(rows) {
    const head = rows[0].map(h => String(h).toLowerCase());
    const idx = (...names) => { for (const n of names) { const i = head.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };
    const ci = { tgl: idx("tanggal"), debit: idx("akun debit", "debit"), kredit: idx("akun kredit", "kredit"), dampak: idx("dampak laba"), arus: idx("arus kas") };
    if (ci.dampak < 0) return null;
    const toSigned = (s) => { const t = String(s == null ? "" : s).trim(); if (!t || t === "-") return 0; const neg = /^\(.*\)$/.test(t) || t.startsWith("-"); const n = parseInt(t.replace(/[^0-9]/g, ""), 10) || 0; return neg ? -n : n; };
    let pendapatanKotor = 0, beban = 0, maxMonth = -1;
    const incomeBy = {}, opexBy = {};
    const monthlyInc = Array(12).fill(0), monthlyExp = Array(12).fill(0); // basis akrual (Dampak Laba)
    const monthlyCashIn = Array(12).fill(0); // basis kas (Arus Kas masuk) → Pendapatan Kotor cashflow
    rows.slice(1).forEach(r => {
      const d = parseDate(String(r[ci.tgl] || "").trim());
      const m = d ? d.getMonth() : null;
      // Pendapatan Kotor basis CASHFLOW: kas masuk dari kolom Arus Kas (positif)
      if (ci.arus >= 0 && m != null) { const cf = toSigned(r[ci.arus]); if (cf > 0) { monthlyCashIn[m] += cf; if (m > maxMonth) maxMonth = m; } }
      // Laba Rugi basis AKUNTANSI: kolom Dampak Laba (+ pendapatan, − beban)
      const dl = toSigned(r[ci.dampak]);
      if (!dl) return;
      if (dl > 0) {
        pendapatanKotor += dl; const k = String(r[ci.kredit] || "Pendapatan").trim();
        incomeBy[k] = (incomeBy[k] || 0) + dl; if (m != null) { monthlyInc[m] += dl; if (m > maxMonth) maxMonth = m; }
      } else {
        const v = -dl; beban += v; const k = String(r[ci.debit] || "Beban").trim();
        opexBy[k] = (opexBy[k] || 0) + v; if (m != null) { monthlyExp[m] += v; if (m > maxMonth) maxMonth = m; }
      }
    });
    if (pendapatanKotor === 0 && beban === 0) return null;
    // laba rugi per bulan (akrual) = pendapatan diakui − beban diakui
    const monthlyLaba = monthlyInc.map((v, i) => v - monthlyExp[i]);
    return { pendapatanKotor, beban, labaBersih: pendapatanKotor - beban, incomeBy, opexBy, monthlyInc, monthlyExp, monthlyCashIn, monthlyLaba, maxMonth };
  }

  /* Keuangan DINAMIS per rentang tanggal: saring TRANSAKSI ke [from,to] lalu bucket otomatis.
     Granularitas adaptif: rentang ≤ 62 hari → harian; selain itu → bulanan.
     Output: totals + breakdown (untuk donut) + deret (labels/cash/inc/exp/laba untuk line & sparkline). */
  function computeFinance(rows, range) {
    if (!Array.isArray(rows) || rows.length < 2) return null;
    const head = rows[0].map(h => String(h).toLowerCase());
    const idx = (...names) => { for (const n of names) { const i = head.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };
    const ci = { tgl: idx("tanggal"), debit: idx("akun debit", "debit"), kredit: idx("akun kredit", "kredit"), dampak: idx("dampak laba"), arus: idx("arus kas") };
    if (ci.dampak < 0) return null;
    const toSigned = (s) => { const t = String(s == null ? "" : s).trim(); if (!t || t === "-") return 0; const neg = /^\(.*\)$/.test(t) || t.startsWith("-"); const n = parseInt(t.replace(/[^0-9]/g, ""), 10) || 0; return neg ? -n : n; };
    const from = range && range.from, to = range && range.to;
    const recs = [];
    rows.slice(1).forEach(r => {
      const d = parseDate(String(r[ci.tgl] || "").trim());
      if (!d) return;
      if (from && d < from) return;
      if (to && d > to) return;
      recs.push({ d, arus: ci.arus >= 0 ? toSigned(r[ci.arus]) : 0, dl: toSigned(r[ci.dampak]), kredit: String(r[ci.kredit] || "Pendapatan").trim(), debit: String(r[ci.debit] || "Beban").trim() });
    });
    if (!recs.length) return null;
    let pendapatanKotor = 0, beban = 0; const incomeBy = {}, opexBy = {};
    recs.forEach(x => { if (x.dl > 0) { pendapatanKotor += x.dl; incomeBy[x.kredit] = (incomeBy[x.kredit] || 0) + x.dl; } else if (x.dl < 0) { const v = -x.dl; beban += v; opexBy[x.debit] = (opexBy[x.debit] || 0) + v; } });
    const minT = Math.min(...recs.map(x => x.d.getTime())), maxT = Math.max(...recs.map(x => x.d.getTime()));
    const spanDays = Math.round((maxT - minT) / 86400000) + 1;
    const daily = spanDays <= 62;
    const keyOf = daily ? (d) => d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate() : (d) => d.getFullYear() + "-" + d.getMonth();
    const labOf = daily ? (d) => d.getDate() + " " + MONTH_ID3[d.getMonth()] : (d) => MONTH_ID3[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
    const buckets = new Map(); const order = []; const repT = {};
    recs.forEach(x => { const k = keyOf(x.d); if (!buckets.has(k)) { buckets.set(k, { label: labOf(x.d), cash: 0, inc: 0, exp: 0 }); order.push(k); repT[k] = x.d.getTime(); } const b = buckets.get(k); if (x.arus > 0) b.cash += x.arus; if (x.dl > 0) b.inc += x.dl; else if (x.dl < 0) b.exp += -x.dl; });
    order.sort((a, b) => repT[a] - repT[b]);
    const labels = order.map(k => buckets.get(k).label);
    const cashSeries = order.map(k => buckets.get(k).cash);
    const incSeries = order.map(k => buckets.get(k).inc);
    const expSeries = order.map(k => buckets.get(k).exp);
    const labaSeries = order.map(k => { const b = buckets.get(k); return b.inc - b.exp; });
    return { pendapatanKotor, beban, labaBersih: pendapatanKotor - beban, incomeBy, opexBy, labels, cashSeries, incSeries, expSeries, labaSeries, daily, nBuckets: order.length };
  }

  /* muat Clerk + pulihkan sesi (bila ada) saat halaman dibuka */
  async function init() {
    setupChartTooltip();
    try {
      const cfgRes = await fetch("/api/config");
      const cfg = await cfgRes.json();
      if (cfg.clerkPublishableKey && window.Clerk) {
        clerk = new window.Clerk(cfg.clerkPublishableKey);
        await clerk.load();
        if (clerk.session) { await restoreSession(); render(); startAutoRefresh(); return; }
      } else if (!cfg.clerkPublishableKey) {
        console.warn("[auth] CLERK_PUBLISHABLE_KEY belum di-set di server — login tidak akan berfungsi.");
      }
    } catch (e) { console.warn("[auth] Gagal memuat Clerk:", e); }
    render();
    startAutoRefresh();
  }

  /* Auto-refresh data live tiap 10 menit (instruksi: update per 10 menit).
     Tarik ulang dari /api/sheets lalu render ulang halaman aktif tanpa reload. */
  let refreshTimer = null;
  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(async () => {
      if (!cur.auth) return;
      await loadLiveData();
      render();
    }, 10 * 60 * 1000);
  }
  document.addEventListener("DOMContentLoaded", init);
})();

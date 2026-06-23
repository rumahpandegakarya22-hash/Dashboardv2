/* =========================================================================
   Kost Tiga Dara — Management Dashboard  (Figma → Code)
   Vanilla JS. Login + 5 role dashboards, charts, data tables.
   Data mirrors the Google Spreadsheets (Database Penghuni, Input Transaksi,
   Log Sales/Marketing). Auth handled by the Express backend (/api/*).
   ========================================================================= */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ utils */
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const initials = (name) => (name || "?").split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const slug = (s) => String(s || "").toLowerCase().replace(/[()]/g, "").trim().replace(/\s+/g, "-");
  const digits = (s) => String(s || "").replace(/[^0-9]/g, "").replace(/^0/, "62");

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
    const size = 150, r = 56, cx = size / 2, cy = size / 2, sw = 22, C = 2 * Math.PI * r;
    const total = segments.reduce((s, x) => s + x.value, 0);
    let offset = 0;
    const rings = segments.map((s) => {
      const len = (s.value / total) * C, pct = Math.round((s.value / total) * 100);
      const ring = `<circle class="donut__seg" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${len - 4} ${C - len + 4}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" data-tip-label="${s.label || ""}" data-tip-value="${s.value} (${pct}%)" data-tip-color="${s.color}"/>`;
      offset += len; return ring;
    }).join("");
    const ctr = center ? `<div class="donut__center"><small>${center.label}</small><b>${center.value}</b></div>` : "";
    return `<div class="donut__chart"><svg viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--rail)" stroke-width="${sw}"/>${rings}</svg>${ctr}</div>`;
  }

  // bar chart WITH data labels on top of each bar
  function barChart(cats, vals, gradId, gradStops, yLabels) {
    const w = 320, h = 178, padL = 30, padB = 30, padT = 16;
    const cw = w - padL, ch = h - padB - padT;
    const max = Math.max(...vals) * 1.18;
    const bw = (cw / cats.length) * 0.42, gap = cw / cats.length;
    const grid = (yLabels || []).map((lab, i) => { const y = padT + ch - (i / (yLabels.length - 1)) * ch; return `<line x1="${padL}" y1="${y}" x2="${w}" y2="${y}" stroke="var(--rail)" stroke-width="1" opacity=".5"/><text class="chart-axis" x="${padL - 6}" y="${y + 3}" text-anchor="end">${lab}</text>`; }).join("");
    const bars = vals.map((v, i) => {
      const bh = (v / max) * ch, x = padL + gap * i + gap / 2 - bw / 2, y = padT + ch - bh;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="${bw / 2}" fill="url(#${gradId})"/>
        <text class="chart-val" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle">${v}</text>
        <text class="chart-cat" x="${x + bw / 2}" y="${h - 8}" text-anchor="middle">${cats[i]}</text>`;
    }).join("");
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">${gradStops}</linearGradient></defs>${grid}${bars}</svg></div>`;
  }

  // dual line chart WITH point markers
  function lineChart(seriesA, seriesB, xLabels, yLabels, names) {
    const w = 460, h = 200, padL = 34, padB = 24, padT = 14;
    const cw = w - padL - 6, ch = h - padB - padT;
    const nm = names || ["Pendapatan Kotor", "Beban Operasional"];
    const max = Math.max(...seriesA, ...seriesB) * 1.15;
    const X = (i, len) => padL + (i / (len - 1)) * cw, Y = (v) => padT + ch - (v / max) * ch;
    const path = (s) => { let d = ""; s.forEach((v, i) => { const x = X(i, s.length), y = Y(v); if (i === 0) { d += `M ${x} ${y}`; return; } const px = X(i - 1, s.length), py = Y(s[i - 1]), mx = (px + x) / 2; d += ` C ${mx} ${py}, ${mx} ${y}, ${x} ${y}`; }); return d; };
    const dots = (s, color, name) => s.map((v, i) => {
      const x = X(i, s.length), y = Y(v);
      return `<circle cx="${x}" cy="${y}" r="10" fill="transparent" class="line-hit" data-tip-label="${name} · ${xLabels[i] || ""}" data-tip-value="${v}" data-tip-color="${color}"/><circle cx="${x}" cy="${y}" r="3" fill="var(--card)" stroke="${color}" stroke-width="2"/>`;
    }).join("");
    const pa = path(seriesA);
    const grid = yLabels.map((lab, i) => { const y = padT + ch - (i / (yLabels.length - 1)) * ch; return `<line x1="${padL}" y1="${y}" x2="${w - 6}" y2="${y}" stroke="var(--rail)" stroke-width="1" opacity=".45"/><text class="chart-axis" x="${padL - 8}" y="${y + 3}" text-anchor="end">${lab}</text>`; }).join("");
    const xlab = xLabels.map((lab, i) => `<text class="chart-cat" x="${X(i, xLabels.length)}" y="${h - 6}" text-anchor="middle">${lab}</text>`).join("");
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}"><defs><linearGradient id="lcArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--teal)" stop-opacity=".28"/><stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/></linearGradient></defs>
      ${grid}${xlab}
      <path d="${pa} L ${X(seriesA.length - 1, seriesA.length)} ${padT + ch} L ${padL} ${padT + ch} Z" fill="url(#lcArea)"/>
      <path d="${path(seriesB)}" fill="none" stroke="var(--text-2)" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round"/>
      <path d="${pa}" fill="none" stroke="var(--teal)" stroke-width="2.2" stroke-linecap="round"/>
      ${dots(seriesB, "var(--text-2)", nm[1])}${dots(seriesA, "var(--teal)", nm[0])}</svg></div>`;
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

  const chartLegend = (items) => `<div class="chart-legend">${items.map(i => `<span class="legend-item"><i style="background:${i.c}"></i>${i.t}</span>`).join("")}</div>`;
  const chartCard = (title, inner, legendItems) => `<div class="card"><div class="card__title">${title}</div>${inner}${legendItems ? chartLegend(legendItems) : ""}</div>`;
  // donut block with title + legend that matches the segments
  function donutBlock(label, segs, centerLabel) {
    const total = segs.reduce((s, x) => s + x.value, 0);
    const pct = Math.round((segs[0].value / total) * 100) + "%";
    return `<div class="card"><div class="card__title" style="text-align:center;margin-bottom:8px">${label}</div><div class="donut">
      ${donut(segs.map(s => ({ value: s.value, color: s.c, label: s.t })), { label: centerLabel || "Total", value: pct })}
      ${chartLegend(segs.map(s => ({ t: s.t, c: s.c })))}</div></div>`;
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
  }));
  let OCC_BY_ROOM = {}, ROOMS = [], PEMBAYARAN = [];
  let LOGBOOK = [];
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
    // 30 scorecards — Data Kamar
    ROOMS = Array.from({ length: 30 }, (_, i) => {
      const no = i + 1, jenis = ROOM_TYPE(no), occ = OCC_BY_ROOM[no];
      let status = occ ? (occ.status === "Booking (DP)" ? "Booking" : "Terisi") : "Kosong";
      if (no === 9) status = "Maintenance";
      if (no === 28 || no === 30) status = "Kosong";
      return { no: String(no).padStart(2, "0"), jenis, penghuni: occ ? occ.nama : "", wa: occ ? occ.kontak : "", harga: PRICE[jenis], status };
    });
    // Data Pembayaran (fallback dari PENGHUNI bila TRANSAKSI belum live) —
    // struktur baru: Tanggal | Jenis Transaksi | Nama Transaksi | Jumlah | Keterangan
    PEMBAYARAN = PENGHUNI.slice(0, 14).map((p) => {
      const isDP = p.status === "Booking (DP)";
      return {
        tanggal: p.masuk,
        jenisTx: { t:"Pemasukan", c:"s-complete" },
        namaTx: "Pembayaran Sewa " + (p.panggil || p.nama),
        jumlah: "Rp" + (PRICE[p.jenis] || 0).toLocaleString("id-ID"),
        keterangan: "Kamar " + p.kamar + " · " + (isDP ? "DP" : "Pelunasan"),
      };
    });
  }
  recomputeFromPenghuni();

  // Daftar Survey / Prospek (Log Survey/Booking) + kolom Pertimbangan + aksi WA
  const PERTIMBANGAN = ["Harga sedikit mahal", "Kamar mandi luar", "Lokasi strategis", "Fasilitas lengkap", "Masih bandingkan"];
  const SURVEY = [
    { tanggal:"11 Jan 2026", nama:"Dewi Kusuma",  wa:"085678901234", asal:"Referral",  kamar:"3, 1" },
    { tanggal:"12 Jan 2026", nama:"Rian Pratama", wa:"087654321098", asal:"Instagram", kamar:"2" },
    { tanggal:"14 Jan 2026", nama:"Ahmad Fauzi",  wa:"082345678901", asal:"Google",    kamar:"3" },
    { tanggal:"15 Jan 2026", nama:"Budi Santoso", wa:"081234567890", asal:"Referral",  kamar:"1" },
    { tanggal:"16 Jan 2026", nama:"Siti Rahma",   wa:"085678901234", asal:"Instagram", kamar:"2" },
  ].map((s, i) => ({ ...s, pertimbangan: PERTIMBANGAN[i % PERTIMBANGAN.length] }));

  // Daftar Leads
  const LEAD_STATUS = [{t:"Leads",c:"s-leads"},{t:"Follow Up",c:"s-followup"}];
  const LEADS = SURVEY.map((s, i) => ({ ...s, id:"LD-"+String(i+1).padStart(3,"0"), status: LEAD_STATUS[i % 2] }));

  // Daftar Vendor — Hasil dropdown + WA
  const VENDOR = [
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
  function dokumenRows(role, n) {
    const names = ["Kontrak Sewa","Bukti Pembayaran","Surat Perjanjian","SOP Divisi","Laporan Bulanan","Berita Acara"];
    return Array.from({ length: n }, (_, i) => ({
      id:"#CM98"+String(i+1).padStart(2,"0"), nama: names[i % names.length],
      link: DRIVE_FOLDER[role.toLowerCase()] || "https://drive.google.com/drive/my-drive",
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
  function statCard(c) {
    const dark = c.onDark ? " on-dark" : "";
    const dir = c.dir === "down" ? I.down : I.up;
    return `<article class="stat-card${dark}" style="background:${c.bg}">
      <span class="stat-card__label">${c.label}</span><span class="stat-card__value">${c.value}</span>
      ${c.badge ? `<span class="stat-card__badge">${dir}${c.badge}</span>` : ""}
      <span class="stat-card__wave">${wave(c.seed || 1)}</span></article>`;
  }
  const statGrid = (cards, cols) => `<section class="stat-grid" style="--cols:${cols}">${cards.map(statCard).join("")}</section>`;

  const toolbar = () => `<div class="table-toolbar">
      <button class="tool-btn" data-act="add" aria-label="Tambah dokumen" title="Tambah dokumen baru">${I.plus}</button>
      <button class="tool-btn" data-act="filter" aria-label="Filter" title="Filter">${I.filter}</button>
      <button class="tool-btn" data-act="sort" aria-label="Urutkan" title="Urutkan">${I.sort}</button>
      <label class="search"><span>${I.search}</span><input type="text" placeholder="Search" data-act="tsearch"></label>
    </div>`;

  // dropdowns — kind: log | hasil
  function dropdown(kind, value) {
    const opts = { log: LOG_STATUS, hasil: ["Paling Baik","Baik","Cukup","Kurang"] }[kind];
    return `<select class="cell-select sel-${kind}" data-v="${slug(value)}">${opts.map(o => `<option value="${o}"${o === value ? " selected" : ""}>${o}</option>`).join("")}</select>`;
  }
  // action buttons
  const waBtn = (num, label) => `<a class="cell-btn cell-btn--wa" href="https://wa.me/${digits(num)}" target="_blank" rel="noopener">${I.wa}${label || "WhatsApp"}</a>`;
  const openBtn = (url) => `<a class="cell-btn cell-btn--open" href="${url || "#"}" target="_blank" rel="noopener">${I.link} OPEN</a>`;
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
    return null;
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

  const DATE_KEYS = new Set(["tanggal","masuk","tempo","deadline","kategori"]);
  function table(cfg) {
    const { title, cols, paginate, titleRight } = cfg;
    const dateKey = cfg.dateKey || (cols.some(c => c.key === "tanggal") ? "tanggal" : null);
    const data = filterByPeriod(cfg.data, dateKey);
    const heads = cols.map(c => `<th>${c.label}</th>`).join("");
    const body = data.map(r => {
      const tds = cols.map(col => {
        const k = col.key, v = r[k];
        if (DATE_KEYS.has(k)) return `<td><span class="cell-date">${I.cal}${v ?? ""}</span></td>`;
        switch (k) {
          case "check":     return `<td><span class="cbox ${r.sel ? "on" : ""}"></span></td>`;
          case "name":      return `<td><span class="cell-name"><span class="avatar">${initials(r.nama || r.name || v)}</span>${r.nama || r.name || v}</span></td>`;
          case "kostStatus":return `<td><span class="status ${KOST_CLASS[r.status] || ""}">${r.status}</span></td>`;
          case "status":
          case "jenisTx":
          case "prioritas": return v && v.t ? `<td><span class="status ${v.c}">${v.t}</span></td>` : `<td>${v ?? ""}</td>`;
          case "logStatus": return `<td>${dropdown("log", v)}</td>`;
          case "hasil":     return `<td>${dropdown("hasil", v)}</td>`;
          case "aksi":      return `<td>${waBtn(r.wa, "Chat")}</td>`;
          case "open":      return `<td>${openBtn(r.link)}</td>`;
          case "tagihan":   return `<td>${tagihanBtn(r.wa)}</td>`;
          case "id":        return `<td class="cell-id">${v ?? ""}</td>`;
          default:          return `<td>${v ?? ""}</td>`;
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
      {key:"kostStatus",label:"Status"},{key:"kontak",label:"Kontak Darurat"},{key:"kontakNama",label:"Nama Kontak"},{key:"email",label:"Email"},
    ],
    penghuniSales: [{key:"kamar",label:"No Kamar"},{key:"jenis",label:"Jenis Kamar"},{key:"tempo",label:"Tanggal Jatuh Tempo"}],
    pembayaran: [
      {key:"check",label:""},{key:"tanggal",label:"Tanggal"},{key:"jenisTx",label:"Jenis Transaksi"},
      {key:"namaTx",label:"Nama Transaksi"},{key:"jumlah",label:"Jumlah"},{key:"keterangan",label:"Keterangan"},
    ],
    dokumen: [{key:"id",label:"ID Docs"},{key:"name",label:"Judul"},{key:"open",label:"Link"}],
    logbook: [{key:"tanggal",label:"Tanggal"},{key:"name",label:"Task"},{key:"pic",label:"PIC"},{key:"divisi",label:"Divisi"},{key:"deadline",label:"Deadline"},{key:"logStatus",label:"Status"}],
    jatuhTempo: [{key:"name",label:"Nama"},{key:"wa",label:"Nomor WA"},{key:"tempo",label:"Tanggal"},{key:"tagihan",label:"Tagihan"}],
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
  const pageDokumen    = (role) => table({ title:"DOKUMEN " + role.toUpperCase(), cols:COLS.dokumen, data:dokumenRows(role, 6) });
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
        ? `<div class="room__foot room__foot--wa">${r.wa ? waBtn(r.wa, "Hubungi") : `<span class="muted">Tidak ada kontak</span>`}</div>`
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
    ownCyan:"linear-gradient(150deg,#2fd0e0,#1f8fc4)",
    salePink:"linear-gradient(150deg,#f3cdd0,#e89aa0)", saleRed:"linear-gradient(150deg,#f0a0a8,#d0506a)", saleGold:"linear-gradient(150deg,#ecc99a,#c79a5a)", salePeach:"linear-gradient(150deg,#f0b89a,#d07a5a)",
  };
  const barStopsGreen = '<stop offset="0%" stop-color="#8ce0a0"/><stop offset="100%" stop-color="#2f8f7a"/>';
  const barStopsWarm  = '<stop offset="0%" stop-color="#e58a6f"/><stop offset="100%" stop-color="#7a5fae"/>';
  const barStopsCool  = '<stop offset="0%" stop-color="#6fb1e5"/><stop offset="100%" stop-color="#8a6fae"/>';

  /* division donut palettes (sesuai colour guideline tiap halaman) */
  const PAL = {
    admin:["#6ad17f","#4ed7c7","#c7d86a"],
    marketing:["#e26d6d","#c0397a","#ecd07a","#a98fd0"],
    operasional:["#c0473a","#ec8a5f","#2f8f9a"],
    owner:["#2fd0e0","#1f8fc4","#6fb1e5","#1f6f9a"],
    sales:["#e89aa0","#d0506a","#c79a5a"],
  };

  /* ============================ DASHBOARDS ============================== */
  function adminOverview() {
    const cards = [
      { label:"Pendapatan", value:"150 Jt", badge:"70%", dir:"down", bg:G.adminGreen, seed:1 },
      { label:"Kontrak Aktif", value:"29", bg:G.adminCyan, seed:2 },
      { label:"Kamar Kosong", value:"2", bg:G.adminOlive, seed:3, onDark:true },
      { label:"Tunggakan", value:"1", bg:G.adminDarkO, seed:4, onDark:true },
      { label:"Jatuh Tempo", value:"3", bg:G.adminDarkG, seed:5, onDark:true },
    ];
    const jatuh = PENGHUNI.slice(0, 5).map(p => ({ nama:p.nama, name:p.nama, wa:p.kontak, tempo:p.tempo }));
    const kontrakDonut = [{t:"Aktif",value:20,c:PAL.admin[0]},{t:"Booking",value:6,c:PAL.admin[1]},{t:"Selesai",value:3,c:PAL.admin[2]}];
    return `<div class="view">${statGrid(cards,5)}
      <div class="grid row-3 mt">
        ${donutBlock("Komposisi Kontrak", kontrakDonut, "Total Kontrak")}
        ${chartCard("Status Kontrak", barChart(["Aktif","Booking","Selesai","Habis"],[20,6,2,1],"gAdm1",barStopsGreen,["0","10","20"]), [{t:"Jumlah Kontrak",c:"#3fae84"}])}
        ${chartCard("OPEX", barChart(["Internet","Listrik","Gaji","Marketing"],[7,18,11,24],"gAdm2",barStopsCool,["0","10K","20K","30K"]), [{t:"Beban (Rp)",c:"#6fb1e5"}])}
      </div>
      <div class="grid row-2-3 mt">
        ${chartCard("Pendapatan Kotor vs Beban Operasional", lineChart([8,12,10,18,15,24,20],[12,9,14,11,17,13,22],["Jan","Feb","Mar","Apr","Mei","Jun","Jul"],["10K","20K","30K"]), [{t:"Pendapatan Kotor",c:"var(--teal)"},{t:"Beban Operasional",c:"var(--text-2)"}])}
        ${table({ title:"DAFTAR JATUH TEMPO", titleRight:true, cols:COLS.jatuhTempo, data:jatuh, dateKey:"tempo" })}
      </div></div>`;
  }

  function marketingOverview() {
    const cards = [
      { label:"Leads", value:"1000", badge:"15%", dir:"down", bg:G.mkLeads, seed:1 },
      { label:"Survey", value:"800", badge:"15%", dir:"down", bg:G.mkSurvey, seed:2, onDark:true },
      { label:"Konversi Leads-Survey", value:"80 %", badge:"15%", dir:"down", bg:G.mkConv, seed:3 },
      { label:"Unit Tersewa", value:"29", badge:"15%", dir:"down", bg:G.mkUnit, seed:4 },
      { label:"CAC", value:"500 rb", badge:"15%", dir:"up", bg:G.mkCac, seed:5 },
    ];
    const channelDonut = [{t:"Instagram",value:30,c:PAL.marketing[0]},{t:"Tiktok",value:25,c:PAL.marketing[1]},{t:"WhatsApp",value:28,c:PAL.marketing[2]},{t:"Referral",value:17,c:PAL.marketing[3]}];
    return `<div class="view">${statGrid(cards,5)}
      <div class="grid row-3 mt">
        ${chartCard("Funnel Penjualan", `<div class="funnel-wrap">${funnel([{value:140},{value:86},{value:50}])}<div class="funnel-stats"><div><span>Leads masuk</span><b>140</b></div><div><span>Survey / Viewing</span><b>86</b></div></div></div>`, [{t:"Leads",c:"#9a8a78"},{t:"Survey",c:"#d8c8b0"}])}
        ${donutBlock("Komposisi Leads Channel", channelDonut, "Total Leads")}
        ${chartCard("Leads Channel", barChart(["Instagram","Tiktok","WhatsApp","Referral"],[12,16,22,18],"gMk1",barStopsWarm,["0","10K","20K"]), [{t:"Jumlah Leads",c:"#e26d6d"}])}
      </div>
      ${table({ title:"DAFTAR FOLLOW UP", cols:COLS.leads, data:LEADS.slice(0,4) })}</div>`;
  }

  function opsOverview() {
    const top = [
      { label:"Tiket Preventif", value:"20", badge:"15%", dir:"down", bg:G.opRed, seed:1, onDark:true },
      { label:"Tiket Korektif", value:"5", badge:"15%", dir:"down", bg:G.opOrange, seed:2, onDark:true },
      { label:"Defect Rate", value:"5 %", badge:"15%", dir:"down", bg:G.opTeal, seed:3 },
      { label:"Downtime", value:"1 h", badge:"15%", dir:"down", bg:G.opAmber, seed:4 },
      { label:"Cost", value:"159.2 Jt", badge:"15%", dir:"down", bg:G.opGreen, seed:5 },
    ];
    const mid = [
      { label:"Response Time", value:"30 min", badge:"15%", dir:"down", bg:G.opOrange, seed:6, onDark:true },
      { label:"Resolution Time", value:"10 h", badge:"15%", dir:"down", bg:G.opRed, seed:7, onDark:true },
    ];
    const tiketDonut = [{t:"Preventif",value:20,c:PAL.operasional[0]},{t:"Korektif",value:5,c:PAL.operasional[1]},{t:"Inspeksi",value:8,c:PAL.operasional[2]}];
    return `<div class="view">${statGrid(top,5)}
      <div class="grid row-3 mt" style="grid-template-columns:minmax(0,1.4fr) repeat(2,minmax(0,1fr))">
        ${chartCard("Expense Category", barChart(["Listrik","Air","Perbaikan","Perawatan"],[15,22,18,12],"gOp1",barStopsWarm,["0","10K","20K","30K"]), [{t:"Beban (Rp)",c:"#e58a6f"}])}
        ${statCard(mid[0])}${statCard(mid[1])}
      </div>
      <div class="grid row-3 mt">
        ${statCard({ label:"MTTR", value:"50 days", badge:"15%", dir:"down", bg:G.opYellow, seed:8 })}
        ${statCard({ label:"SLA", value:"99 %", badge:"15%", dir:"down", bg:G.opTeal2, seed:9 })}
        ${donutBlock("Komposisi Kategori Tiket", tiketDonut, "Total Tiket")}
      </div>
      ${table({ title:"STATUS TIKET", cols:COLS.tiket, data:tiketRows(4) })}</div>`;
  }

  function ownerOverview() {
    const cards = [
      { label:"Pendapatan Kotor", value:"25,6 Jt", badge:"11.01%", dir:"up", bg:G.ownCyan, seed:1, onDark:true },
      { label:"Laba Bersih", value:"15,5 Jt", badge:"11.01%", dir:"up", bg:G.ownCyan, seed:2, onDark:true },
      { label:"Okupansi", value:"96 %", badge:"11.01%", dir:"up", bg:G.ownCyan, seed:3, onDark:true },
      { label:"OPEX", value:"10,3 Jt", badge:"11.01%", dir:"up", bg:G.ownCyan, seed:4, onDark:true },
      { label:"Kamar Kosong", value:"2", badge:"01%", dir:"up", bg:G.ownCyan, seed:5, onDark:true },
      { label:"Kamar Isi", value:"28", badge:"01%", dir:"up", bg:G.ownCyan, seed:6, onDark:true },
    ];
    const opex = [{t:"Listrik",value:35,c:PAL.owner[0]},{t:"Gaji",value:30,c:PAL.owner[1]},{t:"Perawatan",value:20,c:PAL.owner[2]},{t:"Marketing",value:15,c:PAL.owner[3]}];
    const income = [{t:"Sewa",value:80,c:PAL.owner[0]},{t:"Denda",value:8,c:PAL.owner[1]},{t:"Listrik",value:12,c:PAL.owner[2]}];
    const kamar = [{t:"Terisi",value:26,c:PAL.owner[0]},{t:"Booking",value:2,c:PAL.owner[1]},{t:"Kosong",value:1,c:PAL.owner[2]},{t:"Maintenance",value:1,c:PAL.owner[3]}];
    return `<div class="view">${statGrid(cards,6)}
      <div class="grid row-2 mt">
        ${chartCard("Pendapatan Kotor vs Beban Operasional", lineChart([8,12,10,18,15,24,20],[12,9,14,11,17,13,22],["Jan","Feb","Mar","Apr","Mei","Jun","Jul"],["10K","20K","30K"]), [{t:"Pendapatan Kotor",c:"var(--teal)"},{t:"Beban Operasional",c:"var(--text-2)"}])}
        ${chartCard("Beban Operasional", barChart(["Internet","Listrik","Perawatan","Gaji","Marketing"],[10,22,14,26,12],"gOwn1",barStopsCool,["0","10K","20K","30K"]), [{t:"Beban (Rp)",c:"#6fb1e5"}])}
      </div>
      <div class="grid row-3 mt">${donutBlock("Komposisi OPEX",opex,"OPEX")}${donutBlock("Komposisi Income",income,"Income")}${donutBlock("Komposisi Status Kamar",kamar,"30 Kamar")}</div></div>`;
  }

  function salesOverview() {
    const cards = [
      { label:"Booking", value:"25", badge:"15%", dir:"down", bg:G.salePink, seed:1 },
      { label:"Cancellation Rate", value:"5 %", badge:"15%", dir:"down", bg:G.saleRed, seed:2 },
      { label:"Conversion Rate", value:"2,5 %", badge:"15%", dir:"down", bg:G.saleGold, seed:3 },
      { label:"Retention Rate", value:"98 %", badge:"15%", dir:"down", bg:G.salePeach, seed:4 },
      { label:"AVG Durasi Sewa", value:"9 bln", badge:"15%", dir:"down", bg:G.salePink, seed:5 },
      { label:"Kamar Isi", value:"28", badge:"15%", dir:"down", bg:G.saleGold, seed:6 },
    ];
    const prospekDonut = [{t:"Leads",value:140,c:PAL.sales[0]},{t:"Booking",value:41,c:PAL.sales[1]},{t:"Cancel",value:14,c:PAL.sales[2]}];
    return `<div class="view">${statGrid(cards,6)}
      <div class="grid row-3 mt">
        ${chartCard("Funnel Penjualan", `<div class="funnel-wrap">${funnel([{value:140},{value:86},{value:41},{value:28}])}<div class="funnel-stats"><div><span>Leads masuk</span><b>140</b></div><div><span>Survey</span><b>86</b></div><div><span>Booking</span><b>41</b></div><div><span>Kontrak</span><b>28</b></div></div></div>`, [{t:"Leads",c:"#7a6f63"},{t:"Survey",c:"#9a8a78"},{t:"Booking",c:"#b8a890"},{t:"Kontrak",c:"#d8c8b0"}])}
        ${donutBlock("Komposisi Prospek", prospekDonut, "Total Prospek")}
        ${chartCard("Kategori Prospek", barChart(["Instagram","TikTok","WhatsApp","Referral","Walk-in"],[14,20,24,16,8],"gSale1",barStopsWarm,["0","10","20","30"]), [{t:"Jumlah Prospek",c:"#e58a6f"}])}
      </div>
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
        { id:"tiket", label:"Daftar Tiket", group:"page", crumb:"Daftar Tiket", render: () => table({ title:"DAFTAR TIKET", cols:COLS.tiket, data:tiketRows(6) }) },
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
              authView:"login", tfaTicket:null, tfaEnabled:false,
              theme: localStorage.getItem("ktd-theme") || "dark", sidebar: true };

  /* ----------------------------------------------------- LOGIN */
  const loginBrand = `<div class="login-brand"><span class="brand__logo">${I.home}</span><div><b>Kost Tiga Dara</b><small>Management Dashboard</small></div></div>`;

  function loginScreen(errorMsg) {
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
        <button type="submit" class="login-btn" id="loginSubmit">${I.lock} Masuk</button>
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
        <span class="avatar">${initials(cur.user || r.label)}</span>
        <div class="side-user__meta"><b>${cur.user || r.label}</b><small>Masuk sebagai ${role}${cur.tfaEnabled ? " · 2FA" : ""}</small></div>
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
        <button class="topbar__icon" aria-label="Notifikasi" title="Notifikasi">${I.bell}</button>
        <button class="topbar__icon" id="fullscreenBtn" aria-label="Layar penuh" title="Layar penuh">${I.expand}</button>
      </div></header>`;
  }

  const pageHead = (page) => page.group === "dash"
    ? `<div class="page-head"><div class="seg"><button class="is-active">Overview</button></div><button class="seg-pill">${cur.period} ${I.caret}</button></div>` : "";

  /* ----------------------------------------------------- render */
  function applyTheme() { document.body.classList.toggle("theme-light", cur.theme === "light"); }

  function render() {
    const root = document.getElementById("app");
    applyTheme();
    if (!cur.auth) {
      root.className = "app app--login";
      if (cur.authView === "register") { root.innerHTML = registerScreen(); }
      else if (cur.authView === "otp") { root.innerHTML = otpScreen(); }
      else { root.innerHTML = loginScreen(); }
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

  function enterSession(data) {
    cur.auth = true; cur.role = data.role; cur.user = data.name; cur.tfaEnabled = !!data.tfaEnabled;
    cur.authView = "login"; cur.tfaTicket = null;
    cur.page = ROLES[cur.role].pages[0].id;
    render();
  }

  function bindAuth(root) {
    const goto = (v) => { cur.authView = v; render(); };
    root.querySelector("#toRegister")?.addEventListener("click", (e) => { e.preventDefault(); goto("register"); });
    root.querySelector("#toLogin")?.addEventListener("click", (e) => { e.preventDefault(); goto("login"); });
    root.querySelector("#otpBack")?.addEventListener("click", (e) => { e.preventDefault(); cur.tfaTicket = null; goto("login"); });

    // --- LOGIN (step 1) ---
    root.querySelector("#loginForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = root.querySelector("#loginSubmit"), errEl = root.querySelector("#loginError");
      const username = root.querySelector("#luser").value.trim(), password = root.querySelector("#lpass").value;
      btn.disabled = true; btn.classList.add("is-loading");
      try {
        const res = await fetch("/api/login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal login");
        if (data.tfaRequired) { cur.tfaTicket = data.ticket; goto("otp"); return; }
        enterSession(data);
      } catch (err) {
        errEl.textContent = err.message; errEl.hidden = false;
        btn.disabled = false; btn.classList.remove("is-loading");
      }
    });

    // --- LOGIN (step 2: OTP) ---
    root.querySelector("#otpForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = root.querySelector("#otpSubmit"), errEl = root.querySelector("#otpError");
      const token = root.querySelector("#otpCode").value.trim();
      btn.disabled = true; btn.classList.add("is-loading");
      try {
        const res = await fetch("/api/login/tfa", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ ticket: cur.tfaTicket, token }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Verifikasi gagal");
        enterSession(data);
      } catch (err) {
        errEl.textContent = err.message; errEl.hidden = false;
        btn.disabled = false; btn.classList.remove("is-loading");
      }
    });

    // --- REGISTER ---
    root.querySelector("#registerForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = root.querySelector("#regSubmit"), errEl = root.querySelector("#regError"), okEl = root.querySelector("#regOk");
      const name = root.querySelector("#rname").value.trim(), username = root.querySelector("#ruser").value.trim(), password = root.querySelector("#rpass").value;
      errEl.hidden = true; okEl.hidden = true; btn.disabled = true; btn.classList.add("is-loading");
      try {
        const res = await fetch("/api/register", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name, username, password }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal mendaftar");
        okEl.textContent = data.message || "Akun dibuat. Menunggu persetujuan Owner."; okEl.hidden = false;
        root.querySelector("#registerForm").reset();
      } catch (err) {
        errEl.textContent = err.message; errEl.hidden = false;
      } finally {
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
      const rows = users.map(u => `<tr data-u="${u.username}">
        <td>${u.name}</td><td class="cell-id">${u.username}</td><td>${u.role || "-"}</td><td>${badge(u.status)}</td>
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
      // ganti password
      body.querySelector("#pwBtn")?.addEventListener("click", async () => {
        const msg = body.querySelector("#pwMsg");
        const oldPassword = body.querySelector("#pwOld").value, newPassword = body.querySelector("#pwNew").value;
        msg.hidden = true; msg.style.color = "";
        const r = await fetch("/api/password", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ oldPassword, newPassword }) });
        const d = await r.json();
        if (!r.ok) { msg.textContent = d.error || "Gagal"; msg.hidden = false; return; }
        msg.textContent = "Password berhasil diganti."; msg.style.color = "var(--green)"; msg.hidden = false;
        body.querySelector("#pwOld").value = ""; body.querySelector("#pwNew").value = "";
      });
      // 2FA: setup
      body.querySelector("#tfaSetupBtn")?.addEventListener("click", async (e) => {
        e.target.disabled = true;
        const msg = body.querySelector("#tfaMsg");
        try {
          const r = await fetch("/api/tfa/setup", { method:"POST" });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Gagal memulai 2FA");
          body.querySelector("#tfaArea").innerHTML =
            `${d.qr ? `<img class="tfa-qr" src="${d.qr}" alt="QR 2FA" width="168" height="168">` : ""}
             <p class="sec-secret">Atau masukkan kode ini manual: <code>${d.secret}</code></p>
             <div class="login-field"><label>Masukkan kode OTP dari aplikasi</label><input class="login-input" id="tfaOn" inputmode="numeric" maxlength="6" placeholder="000000"></div>
             <button class="login-btn login-btn--sm" id="tfaEnableBtn">Verifikasi & Aktifkan</button>`;
          body.querySelector("#tfaEnableBtn").addEventListener("click", async () => {
            const token = body.querySelector("#tfaOn").value.trim();
            const rr = await fetch("/api/tfa/enable", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ token }) });
            const dd = await rr.json();
            if (!rr.ok) { msg.textContent = dd.error || "Gagal"; msg.hidden = false; return; }
            cur.tfaEnabled = true; paint(); render();
          });
        } catch (err) { msg.textContent = err.message; msg.hidden = false; e.target.disabled = false; }
      });
      // 2FA: disable
      body.querySelector("#tfaDisableBtn")?.addEventListener("click", async () => {
        const msg = body.querySelector("#tfaMsg");
        const token = body.querySelector("#tfaOff").value.trim();
        const r = await fetch("/api/tfa/disable", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ token }) });
        const d = await r.json();
        if (!r.ok) { msg.textContent = d.error || "Gagal"; msg.hidden = false; return; }
        cur.tfaEnabled = false; paint(); render();
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

  /* table interaction: search, sort, filter, add */
  function wireTable(block) {
    const tbody = block.querySelector("tbody"); if (!tbody) return;
    const allRows = () => [...tbody.querySelectorAll("tr")];
    const heads = [...block.querySelectorAll("thead th")];
    const firstCol = heads.findIndex(th => th.textContent.trim() !== "");
    const sortIdx = firstCol < 0 ? 0 : firstCol;
    const lastIdx = heads.length - 1;

    const search = block.querySelector('[data-act="tsearch"]');
    search?.addEventListener("input", () => {
      const q = search.value.toLowerCase();
      allRows().forEach(tr => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none"; });
    });

    let asc = true;
    block.querySelector('[data-act="sort"]')?.addEventListener("click", () => {
      const rs = allRows();
      rs.sort((a, b) => {
        const ta = a.cells[sortIdx]?.textContent.trim() || "", tb = b.cells[sortIdx]?.textContent.trim() || "";
        return asc ? ta.localeCompare(tb, "id", { numeric:true }) : tb.localeCompare(ta, "id", { numeric:true });
      });
      asc = !asc; rs.forEach(r => tbody.appendChild(r));
    });

    const filterBtn = block.querySelector('[data-act="filter"]');
    filterBtn?.addEventListener("click", () => {
      block.querySelector(".filter-menu")?.remove();
      const vals = [...new Set(allRows().map(tr => (tr.cells[lastIdx]?.querySelector(".status,.cell-select,option:checked")?.textContent || tr.cells[lastIdx]?.textContent || "").trim()).filter(Boolean))];
      if (!vals.length) return;
      const menu = el(`<div class="filter-menu"><button data-f="__all">Semua</button>${vals.map(v => `<button data-f="${v}">${v}</button>`).join("")}</div>`);
      filterBtn.parentElement.style.position = "relative"; filterBtn.parentElement.appendChild(menu);
      menu.addEventListener("click", (e) => {
        const f = e.target.dataset.f; if (!f) return;
        allRows().forEach(tr => {
          const cell = (tr.cells[lastIdx]?.querySelector(".status,.cell-select,option:checked")?.textContent || tr.cells[lastIdx]?.textContent || "").trim();
          tr.style.display = (f === "__all" || cell === f) ? "" : "none";
        });
        menu.remove();
      });
      document.addEventListener("click", function close(ev){ if (!menu.contains(ev.target) && ev.target !== filterBtn) { menu.remove(); document.removeEventListener("click", close); } });
    });

    block.querySelector('[data-act="add"]')?.addEventListener("click", addDocument);
  }

  function bind(root) {
    root.querySelectorAll("[data-page]").forEach(a => a.addEventListener("click", (e) => { e.preventDefault(); cur.page = a.dataset.page; render(); }));
    root.querySelector("#logoutBtn")?.addEventListener("click", async () => { try { await fetch("/api/logout", { method:"POST" }); } catch {} cur.auth = false; cur.user = null; cur.authView = "login"; render(); });
    root.querySelector("#securityBtn")?.addEventListener("click", openSecurityModal);

    // mobile nav + hide sidebar
    const menu = root.querySelector("#menuToggle"), scrim = root.querySelector("#scrim");
    menu?.addEventListener("click", () => root.classList.toggle("nav-open"));
    scrim?.addEventListener("click", () => root.classList.remove("nav-open"));
    root.querySelector("#sidebarToggle")?.addEventListener("click", () => { cur.sidebar = !cur.sidebar; root.classList.toggle("sidebar-collapsed", !cur.sidebar); });

    // theme / refresh / fullscreen
    root.querySelector("#themeToggle")?.addEventListener("click", () => { cur.theme = cur.theme === "light" ? "dark" : "light"; localStorage.setItem("ktd-theme", cur.theme); render(); });
    root.querySelector("#refreshBtn")?.addEventListener("click", (e) => { const b = e.currentTarget; b.classList.add("spin"); setTimeout(render, 350); });
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
      };
      const get = (r, i, d="") => (i >= 0 && r[i] != null ? r[i] : d);
      const data = rows.slice(1).filter(r => get(r, ci.nama)).map((r, i) => {
        const kamar = +(String(get(r, ci.kamar, "0")).replace(/[^0-9]/g, "") || 0);
        return {
          no: ci.no >= 0 ? get(r, ci.no, i + 1) : i + 1, id: get(r, ci.id), nama: get(r, ci.nama), panggil: get(r, ci.panggil),
          kamar, jenis: get(r, ci.jenis) || ROOM_TYPE(kamar), asal: get(r, ci.asal), kerja: get(r, ci.kerja),
          instansi: get(r, ci.instansi), durasi: get(r, ci.durasi), masuk: get(r, ci.masuk), tempo: get(r, ci.tempo),
          status: get(r, ci.status), kontak: get(r, ci.kontak), kontakNama: get(r, ci.kontakNama), email: get(r, ci.email),
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
        tanggal: tgl,
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

  /* restore session on load */
  async function init() {
    setupChartTooltip();
    try {
      const res = await fetch("/api/me");
      if (res.ok) { const u = await res.json(); cur.auth = true; cur.role = u.role; cur.user = u.name; cur.tfaEnabled = !!u.tfaEnabled; cur.page = ROLES[cur.role].pages[0].id; await loadLiveData(); }
    } catch {}
    render();
  }
  document.addEventListener("DOMContentLoaded", init);
})();

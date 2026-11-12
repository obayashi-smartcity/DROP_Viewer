(() => {
  "use strict";
  const config = window.VIEWER_CONFIG || {};
  const PAGE = config.pageSize || 60;
  const $ = (id) => document.getElementById(id);
  const el = {
    tenant: $("tenant"), query: $("query"), sort: $("sort"), count: $("result-count"),
    grid: $("grid"), empty: $("empty"), sentinel: $("sentinel"),
    views: { gallery: $("view-gallery"), map: $("view-map") },
    tabs: [...document.querySelectorAll(".tab")],
    mapNote: $("map-note"),
    modal: $("modal"), mImage: $("modal-image"), mFallback: $("modal-fallback"),
    mPhrases: $("modal-phrases"), mAccount: $("modal-account"), mTime: $("modal-time"),
    mTenants: $("modal-tenants"), mToMap: $("modal-to-map"), mOriginal: $("modal-original"),
    mPosition: $("modal-position"), mPrev: $("modal-prev"), mNext: $("modal-next"), mClose: $("modal-close"),
  };

  const state = { view: "gallery", tenant: "", query: "", sort: "new" };
  let drops = [];      // 全件（新しい順）
  let filtered = [];   // 現在の絞り込み結果
  let terms = [];      // 検索語（正規化済み）
  let rendered = 0;
  let modalIndex = -1;
  const mapState = { map: null, layer: null, renderer: null, dirty: true, pending: null };

  const numberFormat = new Intl.NumberFormat("ja-JP");
  const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

  // 全角/半角・大文字小文字・カタカナ/ひらがなの違いを吸収して検索する
  const normalize = (text) => String(text || "").normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const tenantLabel = (id) => (config.tenantLabels && config.tenantLabels[id]) || id;
  const safeUrl = (value) => {
    try { const url = new URL(value, location.href); return url.protocol === "https:" || url.origin === location.origin ? url.href : ""; }
    catch { return ""; }
  };

  /* ---------- URL (hash) <-> state ---------- */
  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    state.view = params.get("view") === "map" ? "map" : "gallery";
    state.tenant = params.get("tenant") || "";
    state.query = params.get("q") || "";
    state.sort = params.get("sort") === "old" ? "old" : "new";
  }
  function writeHash() {
    const params = new URLSearchParams();
    if (state.tenant) params.set("tenant", state.tenant);
    if (state.query) params.set("q", state.query);
    if (state.sort !== "new") params.set("sort", state.sort);
    if (state.view !== "gallery") params.set("view", state.view);
    const hash = params.toString();
    history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
  }

  /* ---------- filtering ---------- */
  function applyFilters() {
    terms = normalize(state.query).split(/\s+/).filter(Boolean);
    filtered = drops.filter((d) =>
      (!state.tenant || d.tenants.includes(state.tenant)) && terms.every((t) => d._search.includes(t)));
    if (state.sort === "old") filtered.reverse();
    el.count.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = numberFormat.format(filtered.length);
    el.count.append(strong, `件 / ${numberFormat.format(drops.length)}件`);
    renderGallery();
    mapState.dirty = true;
    if (state.view === "map") renderMap();
  }

  // 検索語に一致した部分を <mark> で強調（正規化で文字数が変わらない前提で位置を対応させる）
  function appendHighlighted(parent, text) {
    if (!terms.length) { parent.textContent = text; return; }
    const norm = normalize(text);
    if (norm.length !== text.length) { parent.textContent = text; return; }
    const hit = new Array(text.length).fill(false);
    terms.forEach((t) => {
      for (let i = norm.indexOf(t); i !== -1; i = norm.indexOf(t, i + 1)) hit.fill(true, i, i + t.length);
    });
    let i = 0;
    while (i < text.length) {
      let j = i;
      while (j < text.length && hit[j] === hit[i]) j++;
      const chunk = text.slice(i, j);
      if (hit[i]) { const mark = document.createElement("mark"); mark.textContent = chunk; parent.append(mark); }
      else parent.append(chunk);
      i = j;
    }
  }
  function phraseBlock(drop, className) {
    const box = document.createElement("div");
    box.className = className;
    if (!drop.phrases.length) {
      const none = document.createElement("span");
      none.className = "no-phrase";
      none.textContent = "（フレーズなし）";
      box.append(none);
    }
    drop.phrases.forEach((p) => { const line = document.createElement("span"); appendHighlighted(line, p); box.append(line); });
    return box;
  }

  /* ---------- gallery ---------- */
  function createCard(drop, index) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    const media = document.createElement("span");
    media.className = "card-media";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    img.src = safeUrl(drop.thumb);
    img.addEventListener("error", () => {
      const full = safeUrl(drop.image);
      if (full && img.src !== full) { img.src = full; return; }  // サムネイルが無ければ元画像で代替
      const fallback = document.createElement("span");
      fallback.className = "image-fallback";
      fallback.textContent = "画像なし";
      img.replaceWith(fallback);
    });
    media.append(img);
    const body = document.createElement("span");
    body.className = "card-body";
    const meta = document.createElement("span");
    meta.className = "card-meta";
    const name = document.createElement("b");
    appendHighlighted(name, drop.account || "—");
    const time = document.createElement("time");
    time.dateTime = drop.posted_at;
    time.textContent = dateFormat.format(new Date(drop.posted_at));
    meta.append(name, time);
    body.append(phraseBlock(drop, "phrases"), meta);
    card.append(media, body);
    card.addEventListener("click", () => openModal(index));
    return card;
  }
  function renderMore() {
    if (rendered >= filtered.length) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(rendered + PAGE, filtered.length);
    for (let i = rendered; i < end; i++) fragment.append(createCard(filtered[i], i));
    rendered = end;
    el.grid.append(fragment);
  }
  function renderGallery() {
    rendered = 0;
    el.grid.replaceChildren();
    el.empty.hidden = filtered.length > 0;
    renderMore();
    if (state.view === "gallery") window.scrollTo(0, 0);
  }
  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && state.view === "gallery") renderMore();
  }, { rootMargin: "1200px" }).observe(el.sentinel);

  /* ---------- modal ---------- */
  function showModalDrop() {
    const drop = filtered[modalIndex];
    if (!drop) return;
    el.mFallback.hidden = true;
    el.mImage.hidden = false;
    el.mImage.removeAttribute("src");
    el.mImage.dataset.fallback = safeUrl(drop.thumb);
    el.mImage.alt = drop.phrases.join(" ") || "投稿画像";
    el.mImage.src = safeUrl(drop.image) || safeUrl(drop.thumb);
    el.mPhrases.replaceWith(el.mPhrases = phraseBlock(drop, "modal-phrases"));
    el.mAccount.textContent = drop.account || "—";
    el.mTime.dateTime = drop.posted_at;
    el.mTime.textContent = dateTimeFormat.format(new Date(drop.posted_at));
    el.mTenants.replaceChildren(...drop.tenants.map((t) => {
      const chip = document.createElement("span"); chip.className = "chip"; chip.textContent = tenantLabel(t); return chip;
    }));
    el.mToMap.hidden = drop.lat == null;
    el.mOriginal.href = safeUrl(drop.image);
    el.mOriginal.hidden = !el.mOriginal.href;
    el.mPosition.textContent = `${numberFormat.format(modalIndex + 1)} / ${numberFormat.format(filtered.length)}`;
    el.mPrev.disabled = modalIndex <= 0;
    el.mNext.disabled = modalIndex >= filtered.length - 1;
  }
  function openModal(index) {
    modalIndex = index;
    showModalDrop();
    if (!el.modal.open) el.modal.showModal();
  }
  function stepModal(delta) {
    const next = modalIndex + delta;
    if (next < 0 || next >= filtered.length) return;
    modalIndex = next;
    showModalDrop();
  }
  el.mImage.addEventListener("error", () => {
    const fallback = el.mImage.dataset.fallback;
    if (fallback && el.mImage.src !== fallback) { el.mImage.src = fallback; return; }
    el.mImage.hidden = true;
    el.mFallback.hidden = false;
  });
  el.mClose.addEventListener("click", () => el.modal.close());
  el.mPrev.addEventListener("click", () => stepModal(-1));
  el.mNext.addEventListener("click", () => stepModal(1));
  el.modal.addEventListener("click", (e) => { if (e.target === el.modal) el.modal.close(); });
  el.modal.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") stepModal(-1);
    if (e.key === "ArrowRight") stepModal(1);
  });
  el.mToMap.addEventListener("click", () => {
    const drop = filtered[modalIndex];
    el.modal.close();
    mapState.pending = drop;
    setView("map");
  });

  /* ---------- map ---------- */
  function initMap() {
    if (mapState.map || typeof L === "undefined") return;
    const settings = config.map || {};
    mapState.map = L.map("map", { zoomControl: true, preferCanvas: true })
      .setView(settings.center || [34.6905, 135.5023], settings.zoom || 14);
    const tile = settings.tile || "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    const tileUrl = settings.cartoApiKey ? `${tile}?key=${encodeURIComponent(settings.cartoApiKey)}` : tile;
    L.tileLayer(tileUrl, { attribution: settings.attribution || "© OpenStreetMap © CARTO", maxZoom: 19 }).addTo(mapState.map);
    mapState.renderer = L.canvas({ padding: 0.5, tolerance: 6 });
    mapState.layer = L.layerGroup().addTo(mapState.map);
  }
  function tooltipContent(drop) {
    const box = document.createElement("div");
    box.className = "pin-tip";
    const thumb = safeUrl(drop.thumb);
    if (thumb) {
      const img = document.createElement("img");
      img.src = thumb; img.alt = "";
      img.addEventListener("error", () => img.remove());
      box.append(img);
    }
    const text = document.createElement("div");
    text.className = "pin-tip-text";
    const account = document.createElement("span");
    account.className = "pin-tip-account";
    account.textContent = drop.account || "";
    text.append(phraseBlock(drop, "phrases"), account);
    box.append(text);
    return box;
  }
  // 外れ値（遠方の1〜2件）で全国表示にならないよう、緯度経度の2〜98%範囲に合わせる
  function robustBounds(points) {
    const pick = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      const cut = points.length >= 50 ? Math.floor(sorted.length * 0.02) : 0;
      return [sorted[cut], sorted[sorted.length - 1 - cut]];
    };
    const [south, north] = pick(points.map((p) => p.lat));
    const [west, east] = pick(points.map((p) => p.lng));
    return [[south, west], [north, east]];
  }
  function renderMap() {
    initMap();
    if (!mapState.map) { el.mapNote.textContent = "地図ライブラリを読み込めませんでした"; return; }
    mapState.map.invalidateSize();
    if (mapState.dirty) {
      mapState.dirty = false;
      mapState.layer.clearLayers();
      const points = [];
      filtered.forEach((drop, index) => {
        if (drop.lat == null) return;
        L.circleMarker([drop.lat, drop.lng], {
          renderer: mapState.renderer, radius: 7, color: "#ffffff", weight: 2, fillColor: "#c45b42", fillOpacity: 0.9,
        }).bindTooltip(() => tooltipContent(drop), { direction: "top", offset: [0, -6] })
          .on("click", () => openModal(index))
          .addTo(mapState.layer);
        points.push(drop);
      });
      if (points.length && !mapState.pending) mapState.map.fitBounds(robustBounds(points), { padding: [30, 30], maxZoom: 17 });
      el.mapNote.textContent = points.length
        ? `${numberFormat.format(points.length)}件の投稿地点（ピンをクリックで詳細）`
        : "条件に一致する位置情報付きの投稿はありません";
    }
    if (mapState.pending) {
      const drop = mapState.pending;
      mapState.pending = null;
      mapState.map.setView([drop.lat, drop.lng], Math.max(mapState.map.getZoom(), 17));
      const ring = L.circleMarker([drop.lat, drop.lng], { radius: 16, color: "#167457", weight: 3, fill: false, interactive: false }).addTo(mapState.map);
      setTimeout(() => ring.remove(), 4000);
    }
  }

  /* ---------- view switching ---------- */
  function setView(view) {
    state.view = view;
    Object.entries(el.views).forEach(([name, node]) => { node.hidden = name !== view; });
    el.tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.view === view)));
    writeHash();
    if (view === "map") renderMap();
  }
  el.tabs.forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));

  /* ---------- controls ---------- */
  el.tenant.addEventListener("change", () => { state.tenant = el.tenant.value; writeHash(); applyFilters(); });
  el.sort.addEventListener("change", () => { state.sort = el.sort.value; writeHash(); applyFilters(); });
  let timer = 0;
  el.query.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.query = el.query.value.trim(); writeHash(); applyFilters(); }, 200);
  });

  /* ---------- boot ---------- */
  async function boot() {
    readHash();
    try {
      const response = await fetch(config.dataUrl || "data/drops.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.drops)) throw new Error("JSONの形式が想定と異なります");
      drops = data.drops;
      drops.forEach((d) => { d._search = normalize(`${d.phrases.join("\n")}\n${d.account}`); });

      const all = document.createElement("option");
      all.value = "";
      all.textContent = `すべてのテナント（${numberFormat.format(drops.length)}）`;
      el.tenant.append(all, ...data.meta.tenants.map((t) => {
        const option = document.createElement("option");
        option.value = t.id;
        option.textContent = `${tenantLabel(t.id)}（${numberFormat.format(t.count)}）`;
        return option;
      }));
      if (!data.meta.tenants.some((t) => t.id === state.tenant)) state.tenant = "";
      el.tenant.value = state.tenant;
      el.query.value = state.query;
      el.sort.value = state.sort;
      applyFilters();
      setView(state.view);
    } catch (error) {
      el.count.textContent = "";
      el.empty.hidden = false;
      el.empty.textContent = `データを読み込めませんでした（${error.message}）。file:// で開いている場合はローカルサーバー経由で開いてください。`;
    }
  }
  boot();
})();

/* Shared Mobile Phone Browser Recognition & Adaptive Touch Layout (Hub + All 16 Players)
 *
 * Automatically recognizes mobile phone browsers (iPhone, Android Mobile, narrow touch screens,
 * and phone-sized viewports) and upgrades the experience without altering desktop layouts:
 * - Adds `is-mobile-phone`, `is-ios` / `is-android`, and `is-touch-device` classes on <html>
 * - On all 16 players: adds a native-feeling Catalog / Album view switcher so phone users
 *   never have to scroll past a giant sidebar to see album art, tracks, and liner notes
 * - Preserves exact Catalog scroll position when jumping back and forth between Album and Catalog
 * - Auto-selects List View on mouse-wheel 3D stages (Relapse, Metal Blade, Napalm) on phones
 * - Converts dense header button rows & hub filter bars into smooth single-line touch carousels
 * - Enforces >= 44px touch targets, 16px input font size (prevents iOS auto-zoom), safe-area
 *   insets for iPhone notch/home bar, and hides desktop-only hover loupes & keyboard hints
 */
(function () {
  "use strict";
  if (window.__BC_MOBILE_ADAPT_INIT__) return;
  window.__BC_MOBILE_ADAPT_INIT__ = true;

  const ua = navigator.userAgent || "";
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isTouchDevice =
    "ontouchstart" in window ||
    (navigator.maxTouchPoints || 0) > 0 ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  const isPhoneUA =
    Boolean(navigator.userAgentData && navigator.userAgentData.mobile) ||
    /iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|Opera Mini|Mobile Safari|BlackBerry|webOS/i.test(ua);

  const isIndexPage =
    /(?:^|\/)index\.html$/i.test(window.location.pathname) ||
    window.location.pathname === "/" ||
    Boolean(document.getElementById("player-grid"));

  function detectMobilePhone() {
    const w = window.innerWidth || document.documentElement.clientWidth || 1024;
    if (isPhoneUA && w <= 920) return true;
    if (isTouchDevice && w <= 768) return true;
    if (w <= 680) return true;
    return false;
  }

  const root = document.documentElement;
  if (isIOS) root.classList.add("is-ios");
  if (isAndroid) root.classList.add("is-android");
  if (isTouchDevice) root.classList.add("is-touch-device");

  let mobileActive = detectMobilePhone();
  root.classList.toggle("is-mobile-phone", mobileActive);

  let activeTab = "catalog"; // "catalog" | "album"
  let savedCatalogScrollY = 0;
  let tabsEl = null;
  let catalogTabBtn = null;
  let albumTabBtn = null;
  let albumTabTitleEl = null;
  let browsePane = null;
  let detailPane = null;
  let autoSwitchReady = false;
  let lastTapAt = 0;
  let lastDetailSig = "";
  let listAutoSwitched = false;

  function cleanText(el) {
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  function readSelectedTitle() {
    if (!detailPane) return "";
    const el =
      detailPane.querySelector(".booth-album") ||
      detailPane.querySelector(".hero-title") ||
      detailPane.querySelector(".detail-title") ||
      detailPane.querySelector("h1") ||
      detailPane.querySelector("h2");
    return cleanText(el);
  }

  function readDetailSignature() {
    if (!detailPane) return "";
    const title = readSelectedTitle();
    const img = detailPane.querySelector("img[src*='bcbits.com']");
    const src = img ? img.getAttribute("src") || "" : "";
    return title + "|" + src;
  }

  function updateAlbumTabLabel() {
    if (!albumTabTitleEl) return;
    const t = readSelectedTitle();
    albumTabTitleEl.textContent = t ? t : "Album";
  }

  function setTab(nextTab, opts) {
    const options = opts || {};
    if (nextTab !== "catalog" && nextTab !== "album") return;

    if (activeTab === "catalog" && nextTab === "album") {
      savedCatalogScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    }

    activeTab = nextTab;
    root.setAttribute("data-mob-tab", activeTab);

    if (catalogTabBtn && albumTabBtn) {
      const isCat = activeTab === "catalog";
      catalogTabBtn.classList.toggle("active", isCat);
      catalogTabBtn.setAttribute("aria-selected", String(isCat));
      albumTabBtn.classList.toggle("active", !isCat);
      albumTabBtn.setAttribute("aria-selected", String(!isCat));
    }

    if (!options.skipScroll && mobileActive) {
      if (activeTab === "album") {
        window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
      } else {
        window.scrollTo({ top: savedCatalogScrollY, behavior: "auto" });
      }
    }
  }

  window.__BC_MOBILE__ = {
    isMobile: () => mobileActive,
    isIOS,
    isAndroid,
    isTouch: isTouchDevice,
    getTab: () => activeTab,
    setTab
  };

  function injectStyles() {
    if (document.getElementById("bc-mobile-adapt-styles")) return;
    const style = document.createElement("style");
    style.id = "bc-mobile-adapt-styles";
    style.textContent = `
      /* Ensure touch devices never show stuck hover-loupe tooltips */
      html.is-touch-device .hover-zoom {
        display: none !important;
      }

      /* Mobile segmented tab bar hidden on desktop */
      .bc-mob-tabs {
        display: none;
      }

      /* =====================================================================
       * MOBILE PHONE BROWSER EXPERIENCE (html.is-mobile-phone)
       * Scoped strictly so desktop viewports remain 100% unchanged.
       * ===================================================================== */
      html.is-mobile-phone {
        -webkit-text-size-adjust: 100%;
        overflow-x: hidden;
      }

      html.is-mobile-phone body {
        height: auto !important;
        min-height: 100dvh !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        padding-top: env(safe-area-inset-top, 0px);
      }

      /* Prevent iOS Safari viewport zoom when tapping inputs or selects */
      html.is-mobile-phone input,
      html.is-mobile-phone select,
      html.is-mobile-phone textarea {
        font-size: 16px !important;
      }

      /* Keep scrolling smooth and battery-friendly on phones */
      html.is-mobile-phone .collage-bg .collage-grid,
      html.is-mobile-phone .collage-bg {
        animation: none !important;
      }

      /* ---------------------------------------------------------------------
       * HUB PAGE (index.html) MOBILE ADAPTATIONS
       * --------------------------------------------------------------------- */
      html.is-mobile-phone .page-shell {
        padding: 14px 14px calc(36px + env(safe-area-inset-bottom, 0px)) !important;
      }

      html.is-mobile-phone .masthead-bar {
        flex-wrap: wrap;
        gap: 10px;
        padding-bottom: 12px;
      }

      html.is-mobile-phone .masthead-meta {
        font-size: 11px;
        gap: 6px;
      }

      html.is-mobile-phone .random-tape-btn {
        min-height: 44px;
        padding: 10px 14px;
        width: 100%;
        text-align: center;
      }

      html.is-mobile-phone .hero {
        grid-template-columns: 1fr !important;
        gap: 14px !important;
        padding: 18px 0 18px !important;
      }

      html.is-mobile-phone .hero h1 {
        font-size: clamp(2rem, 9.5vw, 2.75rem) !important;
      }

      html.is-mobile-phone .crate-toolbar {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
        padding: 14px 0 16px;
      }

      html.is-mobile-phone .divider-tabs {
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 2px;
        gap: 8px;
      }
      html.is-mobile-phone .divider-tabs::-webkit-scrollbar { display: none; }

      html.is-mobile-phone .crate-tab {
        min-height: 44px !important;
        padding: 10px 14px !important;
        font-size: 12px !important;
      }

      html.is-mobile-phone .view-switch {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      html.is-mobile-phone .view-btn {
        min-height: 44px !important;
      }

      html.is-mobile-phone .crate-grid {
        grid-template-columns: 1fr !important;
        gap: 16px !important;
      }

      html.is-mobile-phone .sleeve-card:hover {
        transform: none;
      }
      html.is-mobile-phone .vinyl-peek {
        display: none !important;
      }

      /* ---------------------------------------------------------------------
       * PLAYER PAGES: COMPACT HEADER + SCROLLABLE ACTION ROW
       * --------------------------------------------------------------------- */
      html.is-mobile-phone header.header,
      html.is-mobile-phone header.top-header {
        padding: 10px 12px !important;
        gap: 10px !important;
        flex-direction: column !important;
        align-items: stretch !important;
        position: relative !important;
      }

      html.is-mobile-phone .header-bursts {
        opacity: 0.35;
      }

      html.is-mobile-phone .brand-wrap,
      html.is-mobile-phone .brand-zone,
      html.is-mobile-phone .header-left {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        min-width: 0 !important;
      }

      html.is-mobile-phone .brand-star,
      html.is-mobile-phone .tape-crest,
      html.is-mobile-phone .deco-crest,
      html.is-mobile-phone .blade-crest,
      html.is-mobile-phone .hex-crest,
      html.is-mobile-phone .label-crest,
      html.is-mobile-phone .van-porthole,
      html.is-mobile-phone .specimen-crest,
      html.is-mobile-phone .triptych-crest,
      html.is-mobile-phone .woodcut-mark,
      html.is-mobile-phone .etid-mark,
      html.is-mobile-phone .brand-sigil {
        width: 38px !important;
        height: 38px !important;
        flex-shrink: 0 !important;
      }

      html.is-mobile-phone .brand,
      html.is-mobile-phone .brand-title,
      html.is-mobile-phone .brand h1 {
        font-size: clamp(17px, 5vw, 22px) !important;
        line-height: 1.12 !important;
      }

      html.is-mobile-phone .subbrand,
      html.is-mobile-phone .brand-sub,
      html.is-mobile-phone .brand-subtitle {
        font-size: 11px !important;
        line-height: 1.3 !important;
      }

      /* Single-row horizontally scrollable action buttons on phones */
      html.is-mobile-phone .header-actions {
        display: flex !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        gap: 8px !important;
        width: 100% !important;
        padding-bottom: 2px;
        justify-content: flex-start !important;
      }
      html.is-mobile-phone .header-actions::-webkit-scrollbar { display: none; }

      html.is-mobile-phone .header-actions > button,
      html.is-mobile-phone .header-actions > a,
      html.is-mobile-phone .header-actions .hdr-btn,
      html.is-mobile-phone .header-actions .btn,
      html.is-mobile-phone .header-actions .action-btn {
        min-height: 40px !important;
        padding: 8px 12px !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
        font-size: 12px !important;
      }

      /* ---------------------------------------------------------------------
       * MOBILE CATALOG / ALBUM SEGMENTED TAB SWITCHER
       * --------------------------------------------------------------------- */
      html.is-mobile-phone .bc-mob-tabs {
        display: grid;
        grid-template-columns: 1fr 1.25fr;
        gap: 6px;
        position: sticky;
        top: 0;
        z-index: 45;
        padding: 8px 12px;
        background: var(--bc-np-bar-bg, rgba(14, 16, 20, 0.96));
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--bc-np-border-strong, rgba(255, 255, 255, 0.2));
      }

      html.is-mobile-phone .bc-mob-tab {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        min-height: 44px;
        padding: 8px 12px;
        min-width: 0;
        border: 1px solid var(--bc-np-border, rgba(255, 255, 255, 0.16));
        border-radius: 3px;
        background: var(--bc-np-btn-bg, rgba(255, 255, 255, 0.06));
        color: var(--bc-np-ink-mid, #c7c0b0);
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }

      html.is-mobile-phone .bc-mob-tab .bc-mob-tab-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      html.is-mobile-phone .bc-mob-tab.active {
        background: var(--bc-np-accent, #e0a94d);
        border-color: var(--bc-np-accent, #e0a94d);
        color: var(--bc-np-accent-ink, #090c0e);
      }

      html.is-mobile-phone .bc-mob-tab:focus-visible {
        outline: 2px solid var(--bc-np-accent, #e0a94d);
        outline-offset: 2px;
      }

      /* ---------------------------------------------------------------------
       * SINGLE-PANE SWITCHING ON MOBILE PHONES (Catalog vs Album)
       * --------------------------------------------------------------------- */
      html.is-mobile-phone .app,
      html.is-mobile-phone .workspace,
      html.is-mobile-phone .workbench {
        display: block !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
      }

      html.is-mobile-phone .app-shell {
        padding: 0 0 12px !important;
      }

      html.is-mobile-phone[data-mob-tab="catalog"] #detail {
        display: none !important;
      }

      html.is-mobile-phone[data-mob-tab="album"] aside.sidebar,
      html.is-mobile-phone[data-mob-tab="album"] aside.chart,
      html.is-mobile-phone[data-mob-tab="album"] section#archiveZone,
      html.is-mobile-phone[data-mob-tab="album"] section#monolithZone,
      html.is-mobile-phone[data-mob-tab="album"] section#mirrorZone,
      html.is-mobile-phone[data-mob-tab="album"] section#crateZone,
      html.is-mobile-phone[data-mob-tab="album"] section#rackZone,
      html.is-mobile-phone[data-mob-tab="album"] section.catalog-stage,
      html.is-mobile-phone[data-mob-tab="album"] section#boardStage,
      html.is-mobile-phone[data-mob-tab="album"] section.press-strip,
      html.is-mobile-phone[data-mob-tab="album"] section.controls-bar,
      html.is-mobile-phone[data-mob-tab="album"] section.campaign-hud,
      html.is-mobile-phone[data-mob-tab="album"] section.filter-strip {
        display: none !important;
      }

      /* Make Browse Pane full-width & naturally scrollable on phone */
      html.is-mobile-phone aside.sidebar,
      html.is-mobile-phone aside.chart,
      html.is-mobile-phone section#archiveZone,
      html.is-mobile-phone section#monolithZone,
      html.is-mobile-phone section#mirrorZone,
      html.is-mobile-phone section#crateZone,
      html.is-mobile-phone section#rackZone,
      html.is-mobile-phone section.catalog-stage,
      html.is-mobile-phone section#boardStage {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: none !important;
        border-right: none !important;
        overflow: visible !important;
      }

      html.is-mobile-phone .sidebar .list,
      html.is-mobile-phone .sidebar #list,
      html.is-mobile-phone .chart #list,
      html.is-mobile-phone .list-wrap,
      html.is-mobile-phone .list-scroll,
      html.is-mobile-phone .catalog-scroll,
      html.is-mobile-phone .stage-body {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }

      /* Hide slim vertical A-Z desktop mouse rails that eat horizontal width on narrow phones */
      html.is-mobile-phone .alpha-rail,
      html.is-mobile-phone .az-rail {
        display: none !important;
      }

      /* Ensure 44px+ touch targets on list rows & filter controls */
      html.is-mobile-phone .row,
      html.is-mobile-phone .list-row,
      html.is-mobile-phone .ledger-row {
        min-height: 56px !important;
      }

      html.is-mobile-phone .fav-star,
      html.is-mobile-phone .fav-btn {
        min-width: 40px !important;
        min-height: 40px !important;
      }

      /* Make Detail Pane full-width, crisp & readable on phones */
      html.is-mobile-phone #detail {
        width: 100% !important;
        max-width: 100% !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        padding: 16px 14px 28px !important;
        border-left: none !important;
      }

      html.is-mobile-phone .detail-inner,
      html.is-mobile-phone .detail-stage {
        max-width: 100% !important;
        padding: 0 !important;
      }

      /* Stack two-column album headers cleanly on small phone widths */
      html.is-mobile-phone .booth-top,
      html.is-mobile-phone .detail-hero,
      html.is-mobile-phone .hero-card-top,
      html.is-mobile-phone .hero-grid,
      html.is-mobile-phone .detail-meta-grid {
        grid-template-columns: 1fr !important;
        gap: 14px !important;
      }

      html.is-mobile-phone .booth-cover-btn,
      html.is-mobile-phone .detail-cover,
      html.is-mobile-phone .hero-art {
        max-width: 240px !important;
        width: 100% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* Responsive Poster / Card / Wall grids on phone */
      html.is-mobile-phone .poster-grid,
      html.is-mobile-phone .cabinet-grid,
      html.is-mobile-phone .rack-grid,
      html.is-mobile-phone .card-board-grid,
      html.is-mobile-phone .grid-list {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
        padding: 10px 12px !important;
      }

      html.is-mobile-phone .wall-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
        padding: 12px !important;
      }

      /* Heavy Psych & Red Fang top control strips neatly padded on phone */
      html.is-mobile-phone .press-strip,
      html.is-mobile-phone .controls-bar,
      html.is-mobile-phone .campaign-hud,
      html.is-mobile-phone .filter-strip {
        margin-left: 12px !important;
        margin-right: 12px !important;
        padding: 12px !important;
      }

      /* Telemetry / Van Dashboard / Toolbar adjustments on narrow phones */
      html.is-mobile-phone .telemetry-strip,
      html.is-mobile-phone .dash-strip {
        grid-template-columns: 1fr !important;
        gap: 8px !important;
        padding: 8px 12px !important;
      }

      html.is-mobile-phone .toolbar-row,
      html.is-mobile-phone .sidebar-controls,
      html.is-mobile-phone .controls-grid {
        padding-left: 12px !important;
        padding-right: 12px !important;
      }

      /* Hide desktop keyboard shortcut hint footers on phones */
      html.is-mobile-phone .campaign-footer > span:first-child,
      html.is-mobile-phone .kbd-hint,
      html.is-mobile-phone .keys-hint {
        display: none !important;
      }

      /* Lightbox padding & large tap close button on phones */
      html.is-mobile-phone .lightbox {
        padding: 14px !important;
      }
      html.is-mobile-phone .lightbox-close,
      html.is-mobile-phone .wall-close,
      html.is-mobile-phone #closeWallBtn,
      html.is-mobile-phone #wallCloseBtn {
        min-height: 44px !important;
        min-width: 44px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function buildMobileTabs() {
    if (isIndexPage || tabsEl) return;

    detailPane = document.getElementById("detail");
    browsePane = document.querySelector(
      "aside.sidebar, aside.chart, section#archiveZone, section#monolithZone, section#mirrorZone, section#crateZone, section#rackZone, section.catalog-stage, section#boardStage"
    );
    if (!detailPane || !browsePane) return;

    const headerEl =
      document.querySelector("header.header") ||
      document.querySelector("header.top-header");

    tabsEl = document.createElement("nav");
    tabsEl.id = "bcMobTabs";
    tabsEl.className = "bc-mob-tabs";
    tabsEl.setAttribute("role", "tablist");
    tabsEl.setAttribute("aria-label", "Switch between Catalog and Selected Album");

    const LIST_ICO =
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
        '<path d="M2.5 4h11M2.5 8h11M2.5 12h7.5"/>' +
      '</svg>';

    const DISC_ICO =
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' +
        '<circle cx="8" cy="8" r="5.8"/>' +
        '<circle cx="8" cy="8" r="1.8"/>' +
      '</svg>';

    tabsEl.innerHTML =
      '<button type="button" class="bc-mob-tab active" data-mob-target="catalog" role="tab" aria-selected="true">' +
        LIST_ICO +
        '<span class="bc-mob-tab-label">Catalog</span>' +
      '</button>' +
      '<button type="button" class="bc-mob-tab" data-mob-target="album" role="tab" aria-selected="false">' +
        DISC_ICO +
        '<span class="bc-mob-tab-label" id="bcMobAlbumTabLabel">Album</span>' +
      '</button>';

    if (headerEl && headerEl.parentNode) {
      headerEl.insertAdjacentElement("afterend", tabsEl);
    } else if (browsePane.parentNode) {
      browsePane.parentNode.insertAdjacentElement("beforebegin", tabsEl);
    }

    catalogTabBtn = tabsEl.querySelector('[data-mob-target="catalog"]');
    albumTabBtn = tabsEl.querySelector('[data-mob-target="album"]');
    albumTabTitleEl = tabsEl.querySelector("#bcMobAlbumTabLabel");

    catalogTabBtn.addEventListener("click", () => setTab("catalog"));
    albumTabBtn.addEventListener("click", () => setTab("album"));

    setTab("catalog", { skipScroll: true });
    updateAlbumTabLabel();
    lastDetailSig = readDetailSignature();

    bindSmartAutoSwitch();
  }

  function isInteractiveExclusion(target) {
    if (!target || !target.closest) return true;
    return Boolean(
      target.closest(
        ".fav-star, .fav-btn, input, select, textarea, .sidebar-controls, .controls-bar, .filter-strip, .toolbar-row, .monolith-toolbar, .mirror-toolbar, .crate-toolbar, .scope-row, .sidebar-tools, .bc-np-bar"
      )
    );
  }

  function isAlbumItemTarget(target) {
    if (!target || !target.closest) return false;
    return Boolean(
      target.closest(
        ".row, .list-row, .ledger-row, .grid-card, .poster-card, .quest-card, .specimen-card, .rack-card, .cabinet-card, .card[data-id], .card[data-idx], .card[data-key], [data-rank], .wall-card, .wall-tile"
      )
    );
  }

  function bindSmartAutoSwitch() {
    setTimeout(() => {
      autoSwitchReady = true;
      lastDetailSig = readDetailSignature();
      updateAlbumTabLabel();
    }, 500);

    // Track intentional taps on album items, Random/Archive/D20 buttons, or Cover Wall tiles
    document.addEventListener("click", e => {
      if (!mobileActive) return;
      const target = e.target;
      if (!target || !target.closest) return;

      // Ignore clicks inside our own mobile tabs or bottom Now-Playing Bar
      if (target.closest("#bcMobTabs") || target.closest("#bcNowPlayingBar")) return;

      // Tapping an album card/row inside the browse pane or Cover Wall
      if (!isInteractiveExclusion(target) && isAlbumItemTarget(target)) {
        lastTapAt = Date.now();
        setTimeout(() => {
          updateAlbumTabLabel();
          setTab("album");
        }, 40);
        return;
      }

      // Tapping Random / Archive / D20 Roll buttons in header or campaign HUD
      const btn = target.closest("button");
      if (btn) {
        const idAndText = ((btn.id || "") + " " + cleanText(btn)).toLowerCase();
        if (/(random|archive|d20|roll|lucky|pull|shuffle)/.test(idAndText)) {
          lastTapAt = Date.now();
        }
      }
    }, true);

    // Watch #detail updates to refresh Album tab label & switch on Random/Archive actions
    if (typeof MutationObserver !== "undefined" && detailPane) {
      const obs = new MutationObserver(() => {
        updateAlbumTabLabel();
        const sig = readDetailSignature();
        const changed = sig && sig !== lastDetailSig;
        if (changed) lastDetailSig = sig;

        if (
          mobileActive &&
          autoSwitchReady &&
          activeTab === "catalog" &&
          changed &&
          Date.now() - lastTapAt < 1200
        ) {
          setTab("album");
        }
      });
      obs.observe(detailPane, { childList: true, subtree: true });
    }
  }

  function autoSelectTouchListMode() {
    if (!mobileActive || listAutoSwitched || isIndexPage) return;
    // On the 3 desktop mouse-wheel 3D stage players (Relapse, Metal Blade, Napalm),
    // start mobile phones in their built-in List View for immediate thumb scrolling.
    const is3DStagePlayer = Boolean(
      document.getElementById("crateZone") ||
      document.getElementById("monolithZone") ||
      document.getElementById("mirrorZone")
    );
    if (!is3DStagePlayer) return;

    const listBtn = document.getElementById("viewListBtn");
    if (listBtn && !listBtn.classList.contains("active")) {
      listAutoSwitched = true;
      setTimeout(() => {
        if (mobileActive && !listBtn.classList.contains("active")) {
          listBtn.click();
        }
      }, 60);
    }
  }

  function adaptIndexFooter() {
    if (!isIndexPage) return;
    const footerSpans = document.querySelectorAll("footer span");
    if (footerSpans.length >= 2) {
      const hint = footerSpans[1];
      if (!hint.dataset.desktopText) {
        hint.dataset.desktopText = hint.textContent;
      }
      hint.textContent = mobileActive
        ? "Tap any crate to listen · Open albums in Bandcamp for phone background play"
        : hint.dataset.desktopText;
    }
  }

  function syncResponsiveState() {
    const next = detectMobilePhone();
    if (next !== mobileActive) {
      mobileActive = next;
      root.classList.toggle("is-mobile-phone", mobileActive);
      window.dispatchEvent(new CustomEvent("bc-mobile-mode-changed", { detail: { isMobile: mobileActive } }));
    }
    adaptIndexFooter();
    autoSelectTouchListMode();
  }

  function init() {
    injectStyles();
    buildMobileTabs();
    adaptIndexFooter();
    autoSelectTouchListMode();

    window.addEventListener("resize", syncResponsiveState, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(syncResponsiveState, 120), { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

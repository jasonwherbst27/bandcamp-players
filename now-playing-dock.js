/* Shared Persistent Vertically Resizable Now-Playing Bar (All 16 Players)
 *
 * Streamlined UX:
 * - While idle (nothing playing yet), clicking any album immediately loads it
 *   into the bottom Now-Playing Bar — zero extra "Load" clicks required.
 * - The moment you click inside the Bandcamp player to press Play, playback
 *   protection automatically engages so browsing or clicking other albums never
 *   cuts off your music.
 * - While protected, viewing any other album shows a clean one-click "Play This Album"
 *   button (both in the detail pane and on the bottom bar) to switch whenever you want,
 *   plus a quick Lock/Auto toggle on the bar for manual control.
 * - Drag the top edge of the bar vertically to resize smoothly from compact (120px)
 *   up to full tracklist height, persisted in localStorage.
 */
(function () {
  "use strict";
  if (window.__BC_NOW_PLAYING_DOCK_INIT__) return;
  window.__BC_NOW_PLAYING_DOCK_INIT__ = true;

  const isIndexPage =
    /(?:^|\/)index\.html$/i.test(window.location.pathname) ||
    window.location.pathname === "/" ||
    Boolean(document.getElementById("player-grid"));
  if (isIndexPage) return;

  const PLAY_ICON =
    '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
      '<path d="M3.5 2.2L13.5 8L3.5 13.8V2.2Z"/>' +
    '</svg>';

  const CHEVRON_UP =
    '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">' +
      '<path d="M3.5 10.5L8 6L12.5 10.5"/>' +
    '</svg>';

  const CHEVRON_DOWN =
    '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">' +
      '<path d="M3.5 6L8 10.5L12.5 6"/>' +
    '</svg>';

  const STOP_ICON =
    '<svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">' +
      '<rect x="2.5" y="2.5" width="9" height="9"/>' +
    '</svg>';

  const LOCK_ICON =
    '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<rect x="3" y="7.2" width="10" height="7" rx="1"/>' +
      '<path d="M5.2 7.2V5a2.8 2.8 0 0 1 5.6 0v2.2"/>' +
    '</svg>';

  const UNLOCK_ICON =
    '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<rect x="3" y="7.2" width="10" height="7" rx="1"/>' +
      '<path d="M5.2 7.2V5a2.8 2.8 0 0 1 5.3-1.2"/>' +
    '</svg>';

  const HEIGHT_STORAGE_KEY = "bc_np_bar_height_v1";
  const MIN_PLAYER_HEIGHT = 120;
  const DEFAULT_EXPANDED_HEIGHT = 340;

  function isMobilePhone() {
    return (
      document.documentElement.classList.contains("is-mobile-phone") ||
      (window.innerWidth || 1024) <= 680
    );
  }

  function getMaxPlayerHeight() {
    if (isMobilePhone()) {
      return Math.max(200, Math.min(420, Math.round(window.innerHeight * 0.55)));
    }
    return Math.max(240, Math.min(620, window.innerHeight - 140));
  }

  function loadSavedHeight() {
    try {
      const raw = parseInt(localStorage.getItem(HEIGHT_STORAGE_KEY) || "", 10);
      if (Number.isFinite(raw) && raw >= MIN_PLAYER_HEIGHT) {
        return Math.min(raw, getMaxPlayerHeight());
      }
    } catch {
      /* ignore storage errors */
    }
    return MIN_PLAYER_HEIGHT;
  }

  function saveHeight(h) {
    try {
      localStorage.setItem(HEIGHT_STORAGE_KEY, String(Math.round(h)));
    } catch {
      /* ignore storage errors */
    }
  }

  const initialHeight = loadSavedHeight();

  const state = {
    playing: null,            // { embedSrc, key, isTrack, artist, title, cover, thumb, meta, url, collection }
    viewed: null,             // Currently browsed album inside #detail
    playbackActive: false,    // True once user clicks inside the Bandcamp player (protects audio while browsing)
    manualLock: false,        // Optional explicit lock toggle
    expanded: initialHeight > 165,
    playerHeight: initialHeight,
    lastExpandedHeight: initialHeight > 165 ? initialHeight : DEFAULT_EXPANDED_HEIGHT,
    mobileMinimized: false,
    isResizing: false,
    detailContainer: null
  };

  function isProtected() {
    return Boolean(state.playing && (state.playbackActive || state.manualLock));
  }

  let barEl = null;
  let resizeHandleEl = null;
  let coverEl = null;
  let kickerEl = null;
  let titleEl = null;
  let subBtnsEl = null;
  let iframeMountEl = null;
  let idlePromptEl = null;
  let persistentIframe = null;

  function cleanText(el) {
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function upgradeArtUrl(src) {
    if (!src) return "";
    return src.replace(/(f4\.bcbits\.com\/img\/a\d+_)(\d+)(\.jpg)/i, "$110$3");
  }

  function extractEmbedKey(src) {
    if (!src) return "";
    const m = src.match(/(album|track)=(\d+)/i);
    return m ? (m[1].toLowerCase() + "=" + m[2]) : src;
  }

  function normalizeEmbedSrc(src) {
    if (!src) return "";
    const isTrack = /\/track=\d+/i.test(src);
    let out = src;

    if (/artwork=[a-z]+/i.test(out)) {
      out = out.replace(/artwork=[a-z]+/gi, "artwork=none");
    } else {
      out = out.replace(/transparent=true\/?$/i, "artwork=none/transparent=true/");
    }

    if (!isTrack) {
      if (/tracklist=[a-z]+/i.test(out)) {
        out = out.replace(/tracklist=[a-z]+/gi, "tracklist=true");
      } else {
        out = out.replace(/artwork=none/i, "tracklist=true/artwork=none");
      }
    }
    return out;
  }

  function parseRgb(colorStr) {
    if (!colorStr) return null;
    const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
  }

  function relativeLuminance(rgb) {
    if (!rgb) return 0.08;
    const [r, g, b] = rgb.map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function readCssVar(styles, names) {
    for (const n of names) {
      const val = (styles.getPropertyValue(n) || "").trim();
      if (val) return val;
    }
    return "";
  }

  function computeThemeTokens() {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const lum = relativeLuminance(parseRgb(bodyStyle.backgroundColor));
    const isLight = lum > 0.45;

    const accent =
      readCssVar(rootStyle, [
        "--brass-lit", "--brass", "--ochre-hi", "--ochre", "--accent", "--accent-hi",
        "--gold", "--cyan", "--orange", "--amber", "--pink", "--frog", "--lamp-color", "--rust", "--crimson"
      ]) || (isLight ? "#235472" : "#e0a94d");

    const monoFont =
      readCssVar(rootStyle, ["--font-mono"]) ||
      "'IBM Plex Mono', 'Share Tech Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

    if (isLight) {
      return {
        barBg: "rgba(247, 244, 238, 0.98)",
        cardBg: "rgba(255, 255, 255, 0.85)",
        slotBg: "#f2eee6",
        ink: "#1a1d20",
        inkMid: "#444c54",
        inkMuted: "#68727c",
        border: "rgba(26, 29, 32, 0.18)",
        borderStrong: "rgba(26, 29, 32, 0.32)",
        accent,
        accentInk: "#ffffff",
        btnBg: "rgba(26, 29, 32, 0.06)",
        btnHoverBg: "rgba(26, 29, 32, 0.13)",
        shadow: "0 -8px 28px rgba(18, 22, 26, 0.14)",
        monoFont
      };
    }

    return {
      barBg: "rgba(10, 14, 17, 0.98)",
      cardBg: "rgba(15, 21, 25, 0.72)",
      slotBg: "#070b0d",
      ink: "#f2ede2",
      inkMid: "#c7c0b0",
      inkMuted: "#8d9699",
      border: "rgba(255, 255, 255, 0.15)",
      borderStrong: "rgba(255, 255, 255, 0.28)",
      accent,
      accentInk: "#090c0e",
      btnBg: "rgba(255, 255, 255, 0.07)",
      btnHoverBg: "rgba(255, 255, 255, 0.15)",
      shadow: "0 -10px 34px rgba(0, 0, 0, 0.68)",
      monoFont
    };
  }

  function applyThemeVars() {
    const t = computeThemeTokens();
    const vars = {
      "--bc-np-bar-bg": t.barBg,
      "--bc-np-card-bg": t.cardBg,
      "--bc-np-slot-bg": t.slotBg,
      "--bc-np-ink": t.ink,
      "--bc-np-ink-mid": t.inkMid,
      "--bc-np-ink-muted": t.inkMuted,
      "--bc-np-border": t.border,
      "--bc-np-border-strong": t.borderStrong,
      "--bc-np-accent": t.accent,
      "--bc-np-accent-ink": t.accentInk,
      "--bc-np-btn-bg": t.btnBg,
      "--bc-np-btn-hover": t.btnHoverBg,
      "--bc-np-shadow": t.shadow,
      "--bc-np-mono": t.monoFont
    };
    Object.keys(vars).forEach(k => document.documentElement.style.setProperty(k, vars[k]));
  }

  function injectStyles() {
    if (document.getElementById("bc-np-styles")) return;
    const style = document.createElement("style");
    style.id = "bc-np-styles";
    style.textContent = `
      body.bc-np-active {
        padding-bottom: var(--bc-np-body-pad, 148px) !important;
      }

      /* Enlarged photo lightboxes & hover loupes always sit above the bottom Now-Playing Bar */
      body.bc-np-active .lightbox,
      body.bc-np-active .lightbox.open,
      body.bc-np-active .hover-zoom {
        z-index: 220 !important;
      }

      /* Streamlined Single-Row Inline Bar inside #detail */
      .bc-np-inline-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding: 10px 13px;
        background: var(--bc-np-card-bg);
        border: 1px solid var(--bc-np-border);
        border-radius: 2px;
        color: var(--bc-np-ink);
      }

      .bc-np-inline-card.is-switch {
        border-color: var(--bc-np-border-strong);
      }

      .bc-np-inline-status {
        min-width: 0;
        flex: 1 1 160px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .bc-np-inline-label {
        font-family: var(--bc-np-mono);
        font-size: 11px;
        color: var(--bc-np-accent);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bc-np-inline-sub {
        font-size: 12px;
        color: var(--bc-np-ink-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bc-np-inline-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        flex-shrink: 0;
      }

      /* Shared Flat Geometric Buttons */
      .bc-np-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 7px 13px;
        min-height: 34px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.015em;
        color: var(--bc-np-ink);
        background: var(--bc-np-btn-bg);
        border: 1px solid var(--bc-np-border-strong);
        border-radius: 2px;
        cursor: pointer;
        text-decoration: none;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background-color 0.14s ease, border-color 0.14s ease, transform 0.12s ease, filter 0.14s ease;
      }
      .bc-np-btn:hover {
        background: var(--bc-np-btn-hover);
        border-color: var(--bc-np-accent);
      }
      .bc-np-btn:active { transform: translateY(1px); }
      .bc-np-btn:focus-visible {
        outline: 2px solid var(--bc-np-accent);
        outline-offset: 2px;
      }

      .bc-np-btn.primary {
        background: var(--bc-np-accent);
        border-color: var(--bc-np-accent);
        color: var(--bc-np-accent-ink);
      }
      .bc-np-btn.primary:hover {
        filter: brightness(1.08);
        color: var(--bc-np-accent-ink);
      }

      .bc-np-btn.sm {
        padding: 4px 8px;
        min-height: 28px;
        font-size: 11px;
        font-weight: 500;
      }

      .bc-np-btn.switch-pill {
        max-width: 190px;
      }
      .bc-np-btn.switch-pill span {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ALWAYS-VISIBLE PERSISTENT BOTTOM NOW-PLAYING BAR */
      .bc-np-bar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 84;
        background: var(--bc-np-bar-bg);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border-top: 2px solid var(--bc-np-accent);
        box-shadow: var(--bc-np-shadow);
        color: var(--bc-np-ink);
        padding: 13px 18px 8px;
        transition: box-shadow 0.25s ease;
      }

      /* Vertical Drag Resize Handle along top edge of Now-Playing Bar */
      .bc-np-resize-handle {
        position: absolute;
        left: 0;
        right: 0;
        top: -5px;
        height: 16px;
        cursor: ns-resize;
        touch-action: none;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 5;
      }
      .bc-np-resize-handle:focus-visible {
        outline: 2px solid var(--bc-np-accent);
        outline-offset: -2px;
      }
      .bc-np-resize-grip {
        width: 52px;
        height: 4px;
        border-radius: 1px;
        background: var(--bc-np-border-strong);
        transition: background-color 0.14s ease, width 0.14s ease;
      }
      .bc-np-resize-handle:hover .bc-np-resize-grip,
      body.bc-np-resizing .bc-np-resize-grip {
        background: var(--bc-np-accent);
        width: 76px;
      }

      body.bc-np-resizing {
        cursor: ns-resize !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }
      body.bc-np-resizing iframe {
        pointer-events: none !important;
      }
      body.bc-np-resizing .bc-np-iframe,
      body.bc-np-resizing .bc-np-idle-prompt {
        transition: none !important;
      }

      .bc-np-bar.flash {
        box-shadow: 0 0 0 2px var(--bc-np-accent), 0 -10px 36px rgba(0, 0, 0, 0.75);
      }

      .bc-np-bar-inner {
        max-width: 1560px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: minmax(250px, 360px) minmax(0, 1fr);
        align-items: start;
        gap: 16px;
      }

      .bc-np-meta-col {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
        padding-top: 4px;
      }

      .bc-np-cover {
        width: 72px;
        height: 72px;
        flex-shrink: 0;
        border: 1px solid var(--bc-np-border-strong);
        background: var(--bc-np-slot-bg);
        display: grid;
        place-items: center;
        overflow: hidden;
        color: var(--bc-np-accent);
      }
      .bc-np-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .bc-np-info {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .bc-np-kicker {
        font-family: var(--bc-np-mono);
        font-size: 10.5px;
        letter-spacing: 0.04em;
        color: var(--bc-np-accent);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bc-np-title {
        font-size: 14px;
        font-weight: 600;
        line-height: 1.25;
        color: var(--bc-np-ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .bc-np-bar-btns {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 2px;
      }

      .bc-np-player-col {
        min-width: 0;
        background: var(--bc-np-slot-bg);
        border: 1px solid var(--bc-np-border);
        border-radius: 2px;
        overflow: hidden;
      }

      .bc-np-iframe-mount {
        width: 100%;
      }

      .bc-np-iframe {
        display: block;
        width: 100%;
        height: var(--bc-np-player-h, 120px);
        border: 0;
        background: transparent;
        transition: height 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .bc-np-iframe.is-track {
        height: 120px;
      }

      .bc-np-idle-prompt {
        height: var(--bc-np-player-h, 120px);
        min-height: 120px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 0 18px;
        font-size: 13.5px;
        color: var(--bc-np-ink-mid);
        transition: height 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @media (max-width: 860px) {
        body.bc-np-active { padding-bottom: var(--bc-np-body-pad, 214px) !important; }
        .bc-np-bar {
          padding: 10px 12px calc(8px + env(safe-area-inset-bottom, 0px));
        }
        .bc-np-bar-inner {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .bc-np-meta-col { padding-top: 0; }
        .bc-np-cover { width: 48px; height: 48px; }
      }

      /* Mobile Phone Compact & Collapsible Mini-Dock */
      html.is-mobile-phone .bc-np-bar {
        padding: 10px 12px calc(8px + env(safe-area-inset-bottom, 0px));
      }
      html.is-mobile-phone .bc-np-resize-handle {
        top: -8px;
        height: 24px;
      }
      html.is-mobile-phone .bc-np-resize-grip {
        width: 44px;
        height: 4px;
      }
      html.is-mobile-phone .bc-np-bar-inner {
        grid-template-columns: 1fr;
        gap: 7px;
      }
      html.is-mobile-phone .bc-np-meta-col {
        padding-top: 2px;
        align-items: center;
        gap: 10px;
      }
      html.is-mobile-phone .bc-np-cover {
        width: 44px;
        height: 44px;
      }
      html.is-mobile-phone .bc-np-title {
        font-size: 13px;
      }
      html.is-mobile-phone .bc-np-kicker {
        font-size: 10px;
      }
      html.is-mobile-phone .bc-np-bar-btns {
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        gap: 6px;
        margin-top: 3px;
        padding-bottom: 1px;
      }
      html.is-mobile-phone .bc-np-bar-btns::-webkit-scrollbar { display: none; }
      html.is-mobile-phone .bc-np-btn.sm {
        min-height: 34px;
        padding: 5px 10px;
        font-size: 11.5px;
      }

      /* Minimized Phone Mini-Strip: visually hides embed WITHOUT removing/pausing audio */
      html.is-mobile-phone .bc-np-bar.mobile-minimized {
        padding: 7px 12px calc(7px + env(safe-area-inset-bottom, 0px));
      }
      html.is-mobile-phone .bc-np-bar.mobile-minimized .bc-np-bar-inner {
        gap: 0;
      }
      html.is-mobile-phone .bc-np-bar.mobile-minimized .bc-np-resize-handle {
        display: none;
      }
      html.is-mobile-phone .bc-np-bar.mobile-minimized .bc-np-player-col {
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        border-width: 0 !important;
        opacity: 0;
        pointer-events: none;
        overflow: hidden;
      }

      @media (prefers-reduced-motion: reduce) {
        .bc-np-iframe, .bc-np-btn, .bc-np-bar { transition-duration: 0.01ms !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildBarDom() {
    if (barEl) return;
    document.body.classList.add("bc-np-active");

    barEl = document.createElement("div");
    barEl.id = "bcNowPlayingBar";
    barEl.className = "bc-np-bar";
    barEl.setAttribute("role", "region");
    barEl.setAttribute("aria-label", "Persistent Now Playing bar");

    barEl.innerHTML =
      '<div class="bc-np-resize-handle" id="bcNpResizeHandle" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Drag vertically to resize Now Playing bar" aria-valuemin="' + MIN_PLAYER_HEIGHT + '" aria-valuemax="' + getMaxPlayerHeight() + '" aria-valuenow="' + state.playerHeight + '" title="Drag up or down to resize · Double-click to toggle Tracklist">' +
        '<span class="bc-np-resize-grip" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="bc-np-bar-inner">' +
        '<div class="bc-np-meta-col">' +
          '<div class="bc-np-cover" id="bcNpCover" aria-hidden="true">' + PLAY_ICON + '</div>' +
          '<div class="bc-np-info">' +
            '<div class="bc-np-kicker" id="bcNpKicker">Player · Ready</div>' +
            '<div class="bc-np-title" id="bcNpTitle">Select any album to play</div>' +
            '<div class="bc-np-bar-btns" id="bcNpSubBtns"></div>' +
          '</div>' +
        '</div>' +
        '<div class="bc-np-player-col" id="bcNpPlayerCol">' +
          '<div class="bc-np-iframe-mount" id="bcNpIframeMount"></div>' +
          '<div class="bc-np-idle-prompt" id="bcNpIdlePrompt" style="display:none;"></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(barEl);

    resizeHandleEl = document.getElementById("bcNpResizeHandle");
    coverEl = document.getElementById("bcNpCover");
    kickerEl = document.getElementById("bcNpKicker");
    titleEl = document.getElementById("bcNpTitle");
    subBtnsEl = document.getElementById("bcNpSubBtns");
    iframeMountEl = document.getElementById("bcNpIframeMount");
    idlePromptEl = document.getElementById("bcNpIdlePrompt");

    applyPlayerHeight(state.playerHeight, false);
    bindResizeHandle();

    [coverEl, titleEl].forEach(el => {
      if (!el) return;
      el.addEventListener("click", () => {
        if (isMobilePhone() && state.mobileMinimized) {
          setMobileMinimized(false);
        }
      });
    });
  }

  function syncBodyPadding() {
    let pad = state.playerHeight + 28;
    if (isMobilePhone()) {
      pad = state.mobileMinimized ? 86 : (state.playerHeight + 104);
    } else if ((window.innerWidth || 1024) <= 860) {
      pad = state.playerHeight + 100;
    }
    document.documentElement.style.setProperty("--bc-np-body-pad", pad + "px");
  }

  function setMobileMinimized(min) {
    state.mobileMinimized = Boolean(min);
    if (barEl) barEl.classList.toggle("mobile-minimized", state.mobileMinimized && isMobilePhone());
    syncBodyPadding();
    renderBarMeta();
  }

  function applyPlayerHeight(heightPx, persist) {
    const maxH = getMaxPlayerHeight();
    const clamped = Math.max(MIN_PLAYER_HEIGHT, Math.min(maxH, Math.round(heightPx)));
    state.playerHeight = clamped;
    const isExp = clamped > 165;
    state.expanded = isExp;
    if (isExp) state.lastExpandedHeight = clamped;

    document.documentElement.style.setProperty("--bc-np-player-h", clamped + "px");
    syncBodyPadding();
    if (barEl) {
      barEl.classList.toggle("expanded", isExp);
      barEl.classList.toggle("mobile-minimized", state.mobileMinimized && isMobilePhone());
    }
    if (resizeHandleEl) {
      resizeHandleEl.setAttribute("aria-valuemax", String(maxH));
      resizeHandleEl.setAttribute("aria-valuenow", String(clamped));
    }
    if (persist) saveHeight(clamped);
  }

  function bindResizeHandle() {
    if (!resizeHandleEl) return;
    let startY = 0;
    let startH = MIN_PLAYER_HEIGHT;
    let moved = false;

    resizeHandleEl.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      e.preventDefault();
      state.isResizing = true;
      moved = false;
      startY = e.clientY;
      startH = state.playerHeight;
      document.body.classList.add("bc-np-resizing");
      try { resizeHandleEl.setPointerCapture(e.pointerId); } catch {}
    });

    resizeHandleEl.addEventListener("pointermove", e => {
      if (!state.isResizing) return;
      const deltaY = startY - e.clientY;
      if (Math.abs(deltaY) > 2) moved = true;
      applyPlayerHeight(startH + deltaY, false);
    });

    const finishDrag = () => {
      if (!state.isResizing) return;
      state.isResizing = false;
      document.body.classList.remove("bc-np-resizing");
      saveHeight(state.playerHeight);
      if (moved) {
        renderBarMeta();
        refreshInlineCard();
      }
    };

    resizeHandleEl.addEventListener("pointerup", finishDrag);
    resizeHandleEl.addEventListener("pointercancel", finishDrag);

    resizeHandleEl.addEventListener("dblclick", e => {
      e.preventDefault();
      setExpanded(!state.expanded);
    });

    resizeHandleEl.addEventListener("keydown", e => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        applyPlayerHeight(state.playerHeight + 28, true);
        renderBarMeta();
        refreshInlineCard();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        applyPlayerHeight(state.playerHeight - 28, true);
        renderBarMeta();
        refreshInlineCard();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setExpanded(!state.expanded);
      } else if (e.key === "Home") {
        e.preventDefault();
        applyPlayerHeight(MIN_PLAYER_HEIGHT, true);
        renderBarMeta();
        refreshInlineCard();
      } else if (e.key === "End") {
        e.preventDefault();
        applyPlayerHeight(getMaxPlayerHeight(), true);
        renderBarMeta();
        refreshInlineCard();
      }
    });

    window.addEventListener("resize", () => {
      if (state.playerHeight > getMaxPlayerHeight()) {
        applyPlayerHeight(getMaxPlayerHeight(), false);
      }
    });
  }

  function readViewedMetadata(detailRoot, iframeSrc) {
    const brandEl =
      document.querySelector(".brand-title") ||
      document.querySelector(".brand") ||
      document.querySelector(".masthead-brand");
    const collection = cleanText(brandEl) || document.title.split("·")[0].split("—")[0].trim() || "Bandcamp Archive";

    let coverSrc = "";
    const imgCandidates = [
      detailRoot.querySelector(".booth-cover-btn img"),
      detailRoot.querySelector(".hero-art img"),
      detailRoot.querySelector("img.hero-art"),
      detailRoot.querySelector(".cover-frame img"),
      detailRoot.querySelector(".detail-cover img"),
      detailRoot.querySelector("article img"),
      detailRoot.querySelector("img[src*='bcbits.com']")
    ].filter(Boolean);
    for (const img of imgCandidates) {
      if (img.src && !img.closest(".strip-grid") && !img.closest(".history-strip") && !img.closest(".mini-strip") && !img.closest(".bc-np-inline-card")) {
        coverSrc = img.src;
        break;
      }
    }

    let artist = "";
    let title = "";
    const boothArtist = detailRoot.querySelector(".booth-artist");
    const boothAlbum = detailRoot.querySelector(".booth-album");
    const heroTitle = detailRoot.querySelector(".hero-title, .detail-title, h1");
    const heroSub = detailRoot.querySelector(".hero-artist, .artist-credit, .hero-sub, .detail-artist, h2");

    if (boothArtist && boothAlbum) {
      artist = cleanText(boothArtist);
      title = cleanText(boothAlbum);
    } else if (heroTitle) {
      title = cleanText(heroTitle);
      if (heroSub && !heroSub.closest(".shelf-section")) {
        artist = cleanText(heroSub);
      }
    }

    if (!artist) artist = collection;
    if (!title) title = collection;

    const metaEl =
      detailRoot.querySelector(".meta-line") ||
      detailRoot.querySelector(".hero-meta-line") ||
      detailRoot.querySelector(".hero-meta") ||
      detailRoot.querySelector(".booth-loc");
    const meta = metaEl ? cleanText(metaEl) : "";

    let bcUrl = "";
    const links = detailRoot.querySelectorAll('a[href*="bandcamp.com"]');
    for (const a of links) {
      if (!a.closest(".bc-np-inline-card")) {
        bcUrl = a.href;
        break;
      }
    }

    const normalized = normalizeEmbedSrc(iframeSrc);
    const isTrack = /\/track=\d+/i.test(normalized);
    return {
      embedSrc: normalized,
      key: extractEmbedKey(normalized),
      isTrack,
      artist,
      title,
      collection,
      meta,
      url: bcUrl,
      cover: upgradeArtUrl(coverSrc),
      thumb: coverSrc
    };
  }

  function broadcastNowPlaying() {
    if (state.playing) {
      window.__BC_NOW_PLAYING__ = {
        collection: state.playing.collection,
        artist: state.playing.artist,
        title: state.playing.title,
        meta: state.playing.meta,
        cover: state.playing.cover,
        thumb: state.playing.thumb
      };
    } else {
      window.__BC_NOW_PLAYING__ = null;
    }
    window.dispatchEvent(new CustomEvent("bc-now-playing-changed", { detail: state.playing }));
  }

  function setExpanded(exp) {
    if (!state.playing || state.playing.isTrack) {
      applyPlayerHeight(MIN_PLAYER_HEIGHT, false);
    } else if (exp) {
      const targetH = state.lastExpandedHeight > 165 ? state.lastExpandedHeight : DEFAULT_EXPANDED_HEIGHT;
      applyPlayerHeight(targetH, true);
    } else {
      applyPlayerHeight(MIN_PLAYER_HEIGHT, true);
    }
    renderBarMeta();
    refreshInlineCard();
  }

  function flashBar() {
    if (!barEl) return;
    barEl.classList.add("flash");
    clearTimeout(flashBar._t);
    flashBar._t = setTimeout(() => barEl.classList.remove("flash"), 750);
  }

  function loadIntoBar(item, opts) {
    const options = opts || {};
    if (!item || !item.embedSrc) return;
    const sameRelease = state.playing && state.playing.key === item.key;

    state.playing = Object.assign({}, item);

    if (!sameRelease || !persistentIframe) {
      // Fresh album loaded: auto-follow remains active until user clicks Play inside Bandcamp
      state.playbackActive = false;
      if (options.clearManualLock) state.manualLock = false;

      if (persistentIframe && document.activeElement === persistentIframe) {
        try { persistentIframe.blur(); } catch {}
      }

      iframeMountEl.innerHTML = "";
      persistentIframe = document.createElement("iframe");
      persistentIframe.id = "bcPersistentIframe";
      persistentIframe.className = "bc-np-iframe" + (item.isTrack ? " is-track" : "");
      persistentIframe.setAttribute("seamless", "");
      persistentIframe.setAttribute("allow", "autoplay");
      persistentIframe.title = item.artist + " — " + item.title + " Bandcamp Player";
      persistentIframe.src = item.embedSrc;
      iframeMountEl.appendChild(persistentIframe);
    }

    iframeMountEl.style.display = "block";
    idlePromptEl.style.display = "none";

    if (item.isTrack) {
      barEl.classList.remove("expanded");
    } else if (options.expandTracklist) {
      applyPlayerHeight(state.lastExpandedHeight > 165 ? state.lastExpandedHeight : DEFAULT_EXPANDED_HEIGHT, true);
    } else {
      applyPlayerHeight(state.playerHeight, false);
    }

    broadcastNowPlaying();
    renderBarMeta();
    refreshInlineCard();
    if (options.flash) flashBar();
  }

  function stopAndUnload() {
    state.playing = null;
    state.playbackActive = false;
    state.manualLock = false;
    if (persistentIframe) {
      persistentIframe.src = "about:blank";
      persistentIframe.remove();
      persistentIframe = null;
    }
    iframeMountEl.innerHTML = "";
    iframeMountEl.style.display = "none";
    idlePromptEl.style.display = "flex";
    broadcastNowPlaying();
    renderBarMeta();
    refreshInlineCard();
  }

  function toggleProtectionLock() {
    if (!state.playing) return;
    if (isProtected()) {
      // Unlock: allow clicking albums to immediately follow again
      state.playbackActive = false;
      state.manualLock = false;
      if (state.viewed && state.viewed.key !== state.playing.key) {
        loadIntoBar(state.viewed, { flash: true });
        return;
      }
    } else {
      state.manualLock = true;
    }
    renderBarMeta();
    refreshInlineCard();
  }

  function renderBarMeta() {
    if (!barEl) return;
    applyThemeVars();

    if (!state.playing) {
      coverEl.innerHTML = PLAY_ICON;
      kickerEl.textContent = "Player · Stopped";
      titleEl.textContent = "Click any album to play";
      titleEl.title = "";
      subBtnsEl.innerHTML = "";

      idlePromptEl.innerHTML = "";
      const txt = document.createElement("span");
      txt.textContent = state.viewed
        ? "Stopped · Click any album or play " + state.viewed.title + "."
        : "Stopped · Click any album to start listening.";
      idlePromptEl.appendChild(txt);

      if (state.viewed) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bc-np-btn primary";
        btn.innerHTML = PLAY_ICON + "<span>Play " + escapeHtml(state.viewed.title) + "</span>";
        btn.addEventListener("click", () => loadIntoBar(state.viewed, { flash: true }));
        idlePromptEl.appendChild(btn);
      }
      return;
    }

    const p = state.playing;
    const locked = isProtected();
    const isViewingOther = Boolean(state.viewed && state.viewed.key !== p.key);
    const displayName = p.artist === p.title ? p.title : (p.artist + " — " + p.title);

    if (p.thumb) {
      coverEl.innerHTML = '<img src="' + escapeHtml(p.thumb) + '" alt="" referrerpolicy="no-referrer">';
    } else {
      coverEl.innerHTML = PLAY_ICON;
    }

    if (locked && isViewingOther) {
      kickerEl.textContent = "Now Playing · Protected while browsing";
    } else if (locked) {
      kickerEl.textContent = "Now Playing · " + (p.isTrack ? "Single" : "Album");
    } else {
      kickerEl.textContent = "Ready to Play · Auto-follows clicks";
    }

    titleEl.textContent = displayName;
    titleEl.title = displayName;

    subBtnsEl.innerHTML = "";

    const mobile = isMobilePhone();

    // Mobile Hide/Show toggle keeps audio running while reclaiming screen space
    if (mobile) {
      const minBtn = document.createElement("button");
      minBtn.type = "button";
      minBtn.className = "bc-np-btn sm" + (state.mobileMinimized ? " primary" : "");
      minBtn.title = state.mobileMinimized
        ? "Show player controls"
        : "Minimize bar while keeping music playing";
      minBtn.innerHTML = state.mobileMinimized
        ? (CHEVRON_UP + "<span>Show</span>")
        : (CHEVRON_DOWN + "<span>Hide</span>");
      minBtn.addEventListener("click", () => setMobileMinimized(!state.mobileMinimized));
      subBtnsEl.appendChild(minBtn);
    }

    // Quick-switch shortcut right on the bar when browsing a different album
    if (isViewingOther && state.viewed) {
      const swBtn = document.createElement("button");
      swBtn.type = "button";
      swBtn.className = "bc-np-btn sm primary switch-pill";
      swBtn.title = "Switch bottom player to " + state.viewed.title;
      swBtn.innerHTML = PLAY_ICON + "<span>Switch: " + escapeHtml(state.viewed.title) + "</span>";
      swBtn.addEventListener("click", () => {
        if (state.mobileMinimized) setMobileMinimized(false);
        loadIntoBar(state.viewed, { flash: true, clearManualLock: true });
      });
      subBtnsEl.appendChild(swBtn);
    }

    if (!p.isTrack) {
      const trkBtn = document.createElement("button");
      trkBtn.type = "button";
      trkBtn.className = "bc-np-btn sm" + (state.expanded ? " primary" : "");
      trkBtn.title = "Expand or collapse full tracklist (P)";
      trkBtn.innerHTML =
        (state.expanded ? CHEVRON_DOWN + "<span>Compact</span>" : CHEVRON_UP + "<span>Tracklist</span>");
      trkBtn.addEventListener("click", () => setExpanded(!state.expanded));
      subBtnsEl.appendChild(trkBtn);
    }

    const lockBtn = document.createElement("button");
    lockBtn.type = "button";
    lockBtn.className = "bc-np-btn sm";
    lockBtn.title = locked
      ? "Audio is protected while you browse. Click to unlock auto-follow."
      : "Lock current album so clicking other albums won't replace it.";
    lockBtn.innerHTML = locked
      ? (LOCK_ICON + "<span>Locked</span>")
      : (UNLOCK_ICON + "<span>Auto</span>");
    lockBtn.addEventListener("click", toggleProtectionLock);
    subBtnsEl.appendChild(lockBtn);

    if (p.url) {
      const link = document.createElement("a");
      link.className = "bc-np-btn sm";
      link.href = p.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.title = mobile
        ? "Open in the Bandcamp app for background & lock-screen playback"
        : "Open release on Bandcamp";
      link.textContent = mobile ? "Bandcamp App ↗" : "Bandcamp ↗";
      subBtnsEl.appendChild(link);
    }

    const stopBtn = document.createElement("button");
    stopBtn.type = "button";
    stopBtn.className = "bc-np-btn sm";
    stopBtn.title = "Stop player";
    stopBtn.innerHTML = STOP_ICON + "<span>Stop</span>";
    stopBtn.addEventListener("click", stopAndUnload);
    subBtnsEl.appendChild(stopBtn);
  }

  function buildInlineCard(item) {
    const card = document.createElement("div");
    card.className = "bc-np-inline-card";
    card.dataset.bcNpKey = item.key;

    const kindWord = item.isTrack ? "Single" : "Album";
    const isPlayingThis = Boolean(state.playing && state.playing.key === item.key);
    const isPlayingOther = Boolean(state.playing && state.playing.key !== item.key);

    // Case 1: This album is ALREADY in the bottom player — ultra-clean 1-line strip!
    if (isPlayingThis) {
      const statusLabel = isProtected()
        ? "Playing in bar below"
        : "Ready in player below · Press Play";

      card.innerHTML =
        '<div class="bc-np-inline-status">' +
          '<div class="bc-np-inline-label">' + statusLabel + '</div>' +
        '</div>' +
        '<div class="bc-np-inline-actions">' +
          (!item.isTrack
            ? '<button type="button" class="bc-np-btn sm" data-act="tracklist">' +
                (state.expanded ? CHEVRON_DOWN + '<span>Compact</span>' : CHEVRON_UP + '<span>Tracklist</span>') +
              '</button>'
            : '') +
        '</div>';

      const trk = card.querySelector('[data-act="tracklist"]');
      if (trk) trk.addEventListener("click", () => setExpanded(!state.expanded));
      return card;
    }

    // Case 2: Music is actively playing on ANOTHER album — clean one-click "Play This Album" switch!
    if (isPlayingOther) {
      const p = state.playing;
      const pName = p.artist === p.title ? p.title : (p.artist + " — " + p.title);
      card.classList.add("is-switch");
      card.innerHTML =
        '<div class="bc-np-inline-status">' +
          '<div class="bc-np-inline-label">Keep listening · ' + escapeHtml(pName) + '</div>' +
          '<div class="bc-np-inline-sub">Browsing will not stop your music</div>' +
        '</div>' +
        '<div class="bc-np-inline-actions">' +
          '<button type="button" class="bc-np-btn primary" data-act="switch">' +
            PLAY_ICON + '<span>Play This ' + kindWord + '</span>' +
          '</button>' +
        '</div>';

      card.querySelector('[data-act="switch"]').addEventListener("click", () => {
        loadIntoBar(item, { flash: true, clearManualLock: true });
      });
      return card;
    }

    // Case 3: Player was explicitly stopped — one-click Play button
    card.classList.add("is-switch");
    card.innerHTML =
      '<div class="bc-np-inline-status">' +
        '<div class="bc-np-inline-label">Player stopped</div>' +
      '</div>' +
      '<div class="bc-np-inline-actions">' +
        '<button type="button" class="bc-np-btn primary" data-act="load">' +
          PLAY_ICON + '<span>Play This ' + kindWord + '</span>' +
        '</button>' +
      '</div>';

    card.querySelector('[data-act="load"]').addEventListener("click", () => {
      loadIntoBar(item, { flash: true, clearManualLock: true });
    });
    return card;
  }

  function refreshInlineCard() {
    const detailRoot = state.detailContainer;
    if (!detailRoot || !state.viewed) return;
    const existing = detailRoot.querySelector(".bc-np-inline-card");
    if (!existing) return;
    existing.replaceWith(buildInlineCard(state.viewed));
  }

  function interceptDetailIframes() {
    const detailRoot = state.detailContainer;
    if (!detailRoot) return;
    const iframes = detailRoot.querySelectorAll('iframe[src*="bandcamp.com/EmbeddedPlayer"]');
    if (!iframes.length) return;

    applyThemeVars();

    iframes.forEach(iframe => {
      if (iframe.id === "bcPersistentIframe") return;
      const src = iframe.getAttribute("src") || "";
      if (!src || src === "about:blank") return;

      const info = readViewedMetadata(detailRoot, src);
      state.viewed = info;

      /* Streamlined Auto-Follow:
       * If nothing is actively playing (and user hasn't manually locked the bar),
       * immediately load the clicked album into the bottom player!
       * If music IS actively playing, leave it uninterrupted so the user can browse freely.
       */
      if (!isProtected()) {
        loadIntoBar(info, { flash: false });
      }

      iframe.setAttribute("src", "about:blank");
      iframe.replaceWith(buildInlineCard(info));
    });

    renderBarMeta();
  }

  /* Detect when the user clicks inside the Bandcamp iframe (e.g., to press Play)
   * and automatically lock playback so subsequent browsing never stops their audio.
   */
  function bindIframePlaybackDetection() {
    window.addEventListener("blur", () => {
      if (document.visibilityState !== "visible") return;
      setTimeout(() => {
        if (
          persistentIframe &&
          state.playing &&
          document.activeElement === persistentIframe &&
          !state.playbackActive
        ) {
          state.playbackActive = true;
          renderBarMeta();
          refreshInlineCard();
        }
      }, 0);
    });
  }

  function init() {
    const detailRoot =
      document.getElementById("detail") ||
      document.querySelector("main.detail") ||
      document.querySelector("main");
    if (!detailRoot) return;

    state.detailContainer = detailRoot;
    injectStyles();
    buildBarDom();
    applyThemeVars();
    bindIframePlaybackDetection();

    interceptDetailIframes();
    renderBarMeta();

    if (typeof MutationObserver !== "undefined") {
      const obs = new MutationObserver(() => interceptDetailIframes());
      obs.observe(detailRoot, { childList: true, subtree: true });

      const themeObs = new MutationObserver(() => applyThemeVars());
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-ink"] });
      themeObs.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "data-ink"] });
    }

    window.addEventListener("bc-mobile-mode-changed", () => {
      if (!isMobilePhone() && state.mobileMinimized) {
        state.mobileMinimized = false;
      }
      applyPlayerHeight(state.playerHeight, false);
      renderBarMeta();
    });

    document.addEventListener("keydown", e => {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (inInput || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === "p" || e.key === "P") && state.playing && !state.playing.isTrack) {
        e.preventDefault();
        setExpanded(!state.expanded);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

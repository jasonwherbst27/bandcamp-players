/* Shared Desktop Chrome Cast Guide, Media Session Sync & Living-Room TV Stage
 * Works cleanly across all standalone Bandcamp players without reloading or interrupting Bandcamp iframes.
 */
(function () {
  "use strict";
  if (window.__BC_CHROME_CAST_INIT__) return;
  window.__BC_CHROME_CAST_INIT__ = true;

  const CAST_ICON_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>' +
      '<path d="M2 12a9 9 0 0 1 8 8"/>' +
      '<path d="M2 16a5 5 0 0 1 4 4"/>' +
      '<line x1="2" y1="20" x2="2.01" y2="20"/>' +
    '</svg>';

  const isIndexPage =
    /(?:^|\/)index\.html$/i.test(window.location.pathname) ||
    window.location.pathname === "/" ||
    Boolean(document.getElementById("player-grid"));

  function detectBrowser() {
    const ua = navigator.userAgent || "";
    const isEdge = /Edg\//.test(ua);
    const isOpera = /OPR\//.test(ua);
    const isFirefox = /Firefox\//.test(ua);
    const isSafari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
    const isChrome = (/Chrome\//.test(ua) || /Chromium\//.test(ua)) && !isEdge && !isOpera;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    return { isChrome, isEdge, isOpera, isFirefox, isSafari, isMobile };
  }

  function upgradeArtUrl(src) {
    if (!src) return "";
    // Upgrade Bandcamp thumbnail sizes (_2, _5, _9, _16) to high-res 1200x1200 (_10) for TV display
    return src.replace(/(f4\.bcbits\.com\/img\/a\d+_)(\d+)(\.jpg)/i, "$110$3");
  }

  function cleanText(el) {
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  function readNowPlaying() {
    if (window.__BC_NOW_PLAYING__ && window.__BC_NOW_PLAYING__.title) {
      return Object.assign({}, window.__BC_NOW_PLAYING__);
    }
    const brandEl =
      document.querySelector(".brand") ||
      document.querySelector(".brand-title") ||
      document.querySelector(".masthead-brand");
    const collection = cleanText(brandEl) || document.title.split("—")[0].trim() || "Bandcamp Archive";

    const detailRoot =
      document.getElementById("detail") ||
      document.querySelector("main.detail") ||
      document.querySelector("main") ||
      document.body;

    // Locate the active album's primary cover image inside the detail pane
    let coverSrc = "";
    if (detailRoot) {
      const candidates = [
        detailRoot.querySelector(".booth-cover-btn img"),
        detailRoot.querySelector(".hero-art img"),
        detailRoot.querySelector("img.hero-art"),
        detailRoot.querySelector(".cover-frame img"),
        detailRoot.querySelector(".detail-cover img"),
        detailRoot.querySelector("article img"),
        detailRoot.querySelector("img[src*='bcbits.com']")
      ].filter(Boolean);
      for (const img of candidates) {
        if (img.src && !img.closest(".strip-grid") && !img.closest(".history-strip")) {
          coverSrc = img.src;
          break;
        }
      }
    }

    // Extract artist & album title across all 12 player layouts
    let title = "";
    let artist = "";
    let meta = "";

    const boothArtist = detailRoot && detailRoot.querySelector(".booth-artist");
    const boothAlbum = detailRoot && detailRoot.querySelector(".booth-album");
    const heroTitle = detailRoot && detailRoot.querySelector(".hero-title, .detail-title, h1");
    const heroSub = detailRoot && detailRoot.querySelector(".hero-artist, .artist-credit, .hero-sub, .detail-artist, h2");

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
      detailRoot &&
      (detailRoot.querySelector(".meta-line") ||
        detailRoot.querySelector(".hero-meta-line") ||
        detailRoot.querySelector(".hero-meta") ||
        detailRoot.querySelector(".booth-loc"));
    if (metaEl) meta = cleanText(metaEl);

    return {
      collection,
      artist,
      title,
      meta,
      cover: upgradeArtUrl(coverSrc),
      thumb: coverSrc
    };
  }

  function updateMediaSession(info) {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    try {
      const artwork = [];
      if (info.thumb) artwork.push({ src: info.thumb, sizes: "350x350", type: "image/jpeg" });
      if (info.cover) artwork.push({ src: info.cover, sizes: "1200x1200", type: "image/jpeg" });
      navigator.mediaSession.metadata = new MediaMetadata({
        title: info.title || info.collection,
        artist: info.artist || info.collection,
        album: info.collection,
        artwork
      });
    } catch (_) {}
  }

  /* Inject self-contained scoped styles */
  function injectStyles() {
    if (document.getElementById("bc-cast-styles")) return;
    const style = document.createElement("style");
    style.id = "bc-cast-styles";
    style.textContent = `
      .bc-cast-trigger {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      }
      .bc-cast-trigger svg { flex-shrink: 0; }

      .bc-cast-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9980;
        background: rgba(6, 7, 10, 0.78);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .bc-cast-backdrop.open { display: flex; }

      .bc-cast-dialog {
        width: 100%;
        max-width: 520px;
        background: #14151a;
        color: #f0f1f4;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 6px;
        box-shadow: 0 28px 72px rgba(0, 0, 0, 0.72);
        overflow: hidden;
      }

      .bc-cast-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.02);
      }
      .bc-cast-head-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 16px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .bc-cast-head-title svg { color: #f5b942; }

      .bc-cast-x {
        width: 32px;
        height: 32px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 4px;
        background: transparent;
        color: #b4b8c2;
        font-size: 16px;
        cursor: pointer;
        display: grid;
        place-items: center;
      }
      .bc-cast-x:hover { color: #fff; border-color: rgba(255, 255, 255, 0.36); }

      .bc-cast-body {
        padding: 18px 20px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        font-size: 13.5px;
        line-height: 1.55;
        color: #c6cbd4;
      }

      .bc-cast-browser-note {
        padding: 10px 12px;
        border-radius: 4px;
        background: rgba(245, 185, 66, 0.10);
        border: 1px solid rgba(245, 185, 66, 0.28);
        color: #f3d796;
        font-size: 12.5px;
      }
      .bc-cast-browser-note.ok {
        background: rgba(94, 211, 148, 0.10);
        border-color: rgba(94, 211, 148, 0.28);
        color: #b5ecd0;
      }

      .bc-cast-steps {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 9px;
        margin: 0;
        padding: 0;
      }
      .bc-cast-steps li {
        display: grid;
        grid-template-columns: 24px 1fr;
        gap: 10px;
        align-items: start;
      }
      .bc-cast-step-num {
        width: 24px;
        height: 24px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: #fff;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        font-weight: 600;
        display: grid;
        place-items: center;
        margin-top: 1px;
      }
      .bc-cast-steps strong { color: #fff; font-weight: 600; }
      .bc-cast-kbd {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.10);
        border: 1px solid rgba(255, 255, 255, 0.16);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11.5px;
        color: #fff;
      }

      .bc-cast-why {
        font-size: 12px;
        color: #8f96a3;
        border-top: 1px solid rgba(255, 255, 255, 0.09);
        padding-top: 11px;
      }

      .bc-cast-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding-top: 4px;
      }
      .bc-cast-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 9px 14px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.20);
        background: #20232b;
        color: #f0f1f4;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.14s ease, border-color 0.14s ease;
      }
      .bc-cast-btn:hover { background: #2a2e38; border-color: rgba(255, 255, 255, 0.42); }
      .bc-cast-btn.primary {
        background: #f5b942;
        border-color: #f5b942;
        color: #14110a;
        font-weight: 600;
      }
      .bc-cast-btn.primary:hover { background: #ffca5c; border-color: #ffca5c; }

      /* Living-Room TV / Cast Stage Overlay (leaves Bandcamp iframe completely untouched underneath!) */
      .bc-tv-stage {
        position: fixed;
        inset: 0;
        z-index: 9990;
        background: #08090c;
        color: #f4f5f7;
        display: none;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: clamp(28px, 5vw, 72px);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .bc-tv-stage.open { display: flex; }

      .bc-tv-bg {
        position: absolute;
        inset: -10%;
        background-size: cover;
        background-position: center;
        filter: blur(72px) saturate(0.85) brightness(0.36);
        transform: scale(1.12);
        transition: background-image 0.9s ease;
        pointer-events: none;
      }
      .bc-tv-vignette {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 38% 50%, rgba(8, 9, 12, 0.22) 0%, rgba(8, 9, 12, 0.86) 82%);
        pointer-events: none;
      }

      .bc-tv-content {
        position: relative;
        z-index: 2;
        width: 100%;
        max-width: 1260px;
        display: grid;
        grid-template-columns: minmax(260px, 44vh) minmax(0, 1fr);
        gap: clamp(28px, 4.5vw, 68px);
        align-items: center;
      }

      .bc-tv-art-wrap {
        width: 100%;
        aspect-ratio: 1 / 1;
        border-radius: 4px;
        overflow: hidden;
        background: #101218;
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 36px 90px rgba(0, 0, 0, 0.78);
      }
      .bc-tv-art-wrap img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .bc-tv-info {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .bc-tv-kicker {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: clamp(11px, 1.1vw, 14px);
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #f5b942;
      }
      .bc-tv-artist {
        font-size: clamp(2rem, 4.2vw, 4.1rem);
        font-weight: 700;
        line-height: 1.04;
        letter-spacing: -0.015em;
        color: #ffffff;
        text-wrap: balance;
      }
      .bc-tv-album {
        font-size: clamp(1.25rem, 2.2vw, 2.1rem);
        font-weight: 400;
        line-height: 1.28;
        color: rgba(244, 245, 247, 0.82);
        text-wrap: balance;
      }
      .bc-tv-meta {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: clamp(12px, 1.1vw, 14px);
        color: rgba(244, 245, 247, 0.56);
        margin-top: 6px;
      }

      .bc-tv-bar {
        position: fixed;
        left: 50%;
        bottom: 26px;
        transform: translateX(-50%);
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        background: rgba(14, 15, 20, 0.86);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        transition: opacity 0.35s ease, transform 0.35s ease;
      }
      .bc-tv-stage.idle .bc-tv-bar {
        opacity: 0;
        transform: translate(-50%, 10px);
        pointer-events: none;
      }

      @media (max-width: 820px) {
        .bc-tv-content {
          grid-template-columns: 1fr;
          text-align: center;
          max-width: 460px;
        }
        .bc-tv-art-wrap { max-width: 280px; margin: 0 auto; }
      }
    `;
    document.head.appendChild(style);
  }

  let modalEl = null;
  let tvEl = null;
  let tvIdleTimer = null;

  function ensureUI() {
    if (modalEl) return;
    injectStyles();

    const browser = detectBrowser();
    const statusHtml = browser.isChrome
      ? '<div class="bc-cast-browser-note ok"><strong>Google Chrome detected.</strong> You can cast Bandcamp audio + this screen directly to any Chromecast TV, Google TV, or Nest speaker via Chrome\'s built-in Cast Tab.</div>'
      : browser.isEdge
        ? '<div class="bc-cast-browser-note ok"><strong>Microsoft Edge detected.</strong> Right-click anywhere and choose <strong>Cast media to device</strong> (or open in Google Chrome) to cast tab audio + display.</div>'
        : '<div class="bc-cast-browser-note"><strong>Open in Desktop Google Chrome</strong> to cast tab audio and visuals directly to Chromecast, Google TV, or Google Nest speakers.</div>';

    modalEl = document.createElement("div");
    modalEl.className = "bc-cast-backdrop";
    modalEl.id = "bcCastModal";
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-label", "Cast from Google Chrome");
    modalEl.innerHTML =
      '<div class="bc-cast-dialog">' +
        '<div class="bc-cast-head">' +
          '<div class="bc-cast-head-title">' + CAST_ICON_SVG + '<span>Cast from Desktop Chrome</span></div>' +
          '<button type="button" class="bc-cast-x" id="bcCastCloseX" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="bc-cast-body">' +
          statusHtml +
          '<ol class="bc-cast-steps">' +
            '<li><span class="bc-cast-step-num">1</span><div>Hit <strong>Play</strong> inside the Bandcamp player first so audio is active in this tab.</div></li>' +
            '<li><span class="bc-cast-step-num">2</span><div><strong>Right-click anywhere on this page → Cast…</strong> (or click Chrome\'s <span class="bc-cast-kbd">⋮</span> menu → <strong>Cast, save, and share → Cast…</strong>).</div></li>' +
            '<li><span class="bc-cast-step-num">3</span><div>Choose your <strong>Chromecast TV, Google TV, or Nest speaker</strong>. Chrome automatically uses <strong>Cast tab</strong> to stream both the live Bandcamp audio and visuals.</div></li>' +
          '</ol>' +
          '<div class="bc-cast-actions">' +
            (!isIndexPage
              ? '<button type="button" class="bc-cast-btn primary" id="bcLaunchTvFsBtn">' + CAST_ICON_SVG + '<span>TV Stage + Fullscreen</span></button>' +
                '<button type="button" class="bc-cast-btn" id="bcLaunchTvBtn">TV Stage (Window)</button>'
              : '<button type="button" class="bc-cast-btn primary" id="bcFsIndexBtn">Fullscreen Shelf</button>') +
            '<button type="button" class="bc-cast-btn" id="bcCopyCastUrlBtn">Copy Link</button>' +
            '<button type="button" class="bc-cast-btn" id="bcCastDoneBtn">Close</button>' +
          '</div>' +
          '<div class="bc-cast-why">Why Cast Tab? Bandcamp streams audio inside a protected cross-origin player, so Chrome\'s native <strong>Cast tab</strong> is the cleanest, uninterrupted way to stream Bandcamp audio to Chromecast and Google speakers from a computer.</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modalEl);

    modalEl.addEventListener("click", e => {
      if (e.target === modalEl) closeCastModal();
    });
    modalEl.querySelector("#bcCastCloseX").addEventListener("click", closeCastModal);
    modalEl.querySelector("#bcCastDoneBtn").addEventListener("click", closeCastModal);
    modalEl.querySelector("#bcCopyCastUrlBtn").addEventListener("click", () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(window.location.href).then(() => {
          const b = modalEl.querySelector("#bcCopyCastUrlBtn");
          b.textContent = "Link Copied ✓";
          setTimeout(() => { b.textContent = "Copy Link"; }, 1600);
        }).catch(() => {});
      }
    });

    if (!isIndexPage) {
      modalEl.querySelector("#bcLaunchTvBtn").addEventListener("click", () => {
        closeCastModal();
        openTvStage(false);
      });
      modalEl.querySelector("#bcLaunchTvFsBtn").addEventListener("click", () => {
        closeCastModal();
        openTvStage(true);
      });
    } else {
      modalEl.querySelector("#bcFsIndexBtn").addEventListener("click", () => {
        closeCastModal();
        toggleFullscreen();
      });
    }

    if (!isIndexPage) {
      tvEl = document.createElement("section");
      tvEl.className = "bc-tv-stage";
      tvEl.id = "bcTvStage";
      tvEl.setAttribute("aria-label", "Living-room TV Cast Display");
      tvEl.innerHTML =
        '<div class="bc-tv-bg" id="bcTvBg" aria-hidden="true"></div>' +
        '<div class="bc-tv-vignette" aria-hidden="true"></div>' +
        '<div class="bc-tv-content">' +
          '<div class="bc-tv-art-wrap"><img id="bcTvArt" src="" alt="" referrerpolicy="no-referrer"></div>' +
          '<div class="bc-tv-info">' +
            '<div class="bc-tv-kicker" id="bcTvKicker"></div>' +
            '<div class="bc-tv-artist" id="bcTvArtist"></div>' +
            '<div class="bc-tv-album" id="bcTvAlbum"></div>' +
            '<div class="bc-tv-meta" id="bcTvMeta"></div>' +
          '</div>' +
        '</div>' +
        '<div class="bc-tv-bar">' +
          '<button type="button" class="bc-cast-btn" id="bcTvRandBtn" title="Pull another release">Random</button>' +
          '<button type="button" class="bc-cast-btn" id="bcTvFsBtn" title="Toggle Fullscreen">Fullscreen</button>' +
          '<button type="button" class="bc-cast-btn primary" id="bcTvExitBtn" title="Return to Bandcamp Deck (Esc)">Back to Deck (Esc)</button>' +
        '</div>';

      document.body.appendChild(tvEl);

      tvEl.addEventListener("pointermove", wakeTvControls);
      tvEl.addEventListener("pointerdown", wakeTvControls);
      tvEl.querySelector("#bcTvExitBtn").addEventListener("click", closeTvStage);
      tvEl.querySelector("#bcTvFsBtn").addEventListener("click", toggleFullscreen);
      tvEl.querySelector("#bcTvRandBtn").addEventListener("click", () => {
        const rand = document.getElementById("randomBtn");
        if (rand) rand.click();
        setTimeout(syncNowPlaying, 120);
      });
    }
  }

  function wakeTvControls() {
    if (!tvEl) return;
    tvEl.classList.remove("idle");
    clearTimeout(tvIdleTimer);
    tvIdleTimer = setTimeout(() => {
      if (tvEl && tvEl.classList.contains("open")) tvEl.classList.add("idle");
    }, 3400);
  }

  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (_) {}
  }

  function syncNowPlaying() {
    if (isIndexPage) return;
    const info = readNowPlaying();
    updateMediaSession(info);
    if (!tvEl) return;
    const bg = tvEl.querySelector("#bcTvBg");
    const art = tvEl.querySelector("#bcTvArt");
    if (info.cover) {
      bg.style.backgroundImage = "url('" + info.cover + "')";
      if (art.src !== info.cover) {
        art.src = info.cover;
        art.alt = info.artist + " - " + info.title;
      }
    }
    tvEl.querySelector("#bcTvKicker").textContent = info.collection + " · Cast Display";
    tvEl.querySelector("#bcTvArtist").textContent = info.artist;
    tvEl.querySelector("#bcTvAlbum").textContent =
      info.title && info.title !== info.artist ? info.title : "";
    tvEl.querySelector("#bcTvMeta").textContent = info.meta || "Playing via Chrome Cast Tab · Move mouse for controls";
  }

  function openCastModal() {
    ensureUI();
    syncNowPlaying();
    modalEl.classList.add("open");
  }

  function closeCastModal() {
    if (modalEl) modalEl.classList.remove("open");
  }

  function openTvStage(goFullscreen) {
    if (isIndexPage) return;
    ensureUI();
    syncNowPlaying();
    tvEl.classList.add("open");
    wakeTvControls();
    if (goFullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  function closeTvStage() {
    if (tvEl) tvEl.classList.remove("open");
    clearTimeout(tvIdleTimer);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  /* Mount a seamless theme-matched Cast button into the header */
  function mountCastButton() {
    if (document.getElementById("bcCastHeaderBtn")) return;
    injectStyles();

    const headerActions = document.querySelector(".header-actions");
    if (headerActions) {
      // Detect sibling button class so the Cast button matches each player's native styling automatically
      const siblingBtn =
        headerActions.querySelector("button:not(.primary)") ||
        headerActions.querySelector("a:not(.back-link)");
      const baseClass = siblingBtn ? siblingBtn.className.replace(/\bactive\b/g, "").trim() : "";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "bcCastHeaderBtn";
      btn.className = (baseClass ? baseClass + " " : "") + "bc-cast-trigger";
      btn.title = "Cast from Chrome / TV Stage (Shift+T)";
      btn.setAttribute("aria-label", "Cast from Chrome");
      btn.innerHTML = CAST_ICON_SVG + "<span>Cast</span>";
      btn.addEventListener("click", openCastModal);

      // Insert just before the final external Bandcamp link if present
      const bcLink = [...headerActions.querySelectorAll("a")].find(a =>
        /bandcamp\.com/i.test(a.getAttribute("href") || "")
      );
      if (bcLink) headerActions.insertBefore(btn, bcLink);
      else headerActions.appendChild(btn);
      return;
    }

    // Fallback for index.html main shelf masthead
    const mastRight = document.querySelector(".masthead-right") || document.querySelector(".view-toggle");
    if (mastRight) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "bcCastHeaderBtn";
      btn.className = "random-btn bc-cast-trigger";
      btn.title = "Cast from Desktop Chrome";
      btn.innerHTML = CAST_ICON_SVG + "<span>Cast</span>";
      btn.addEventListener("click", openCastModal);
      mastRight.appendChild(btn);
    }
  }

  function init() {
    mountCastButton();
    if (!isIndexPage) {
      syncNowPlaying();
      const target =
        document.getElementById("detail") ||
        document.querySelector("main.detail") ||
        document.querySelector("main");
      if (target && typeof MutationObserver !== "undefined") {
        let timer = null;
        const obs = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(syncNowPlaying, 90);
        });
        obs.observe(target, { childList: true, subtree: true });
      }
      window.addEventListener("bc-now-playing-changed", () => syncNowPlaying());
    }

    document.addEventListener("keydown", e => {
      const tag = (e.target && e.target.tagName) || "";
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        if (tvEl && tvEl.classList.contains("open")) {
          e.stopPropagation();
          closeTvStage();
          return;
        }
        if (modalEl && modalEl.classList.contains("open")) {
          e.stopPropagation();
          closeCastModal();
          return;
        }
      }
      if (inInput) return;
      if (e.shiftKey && (e.key === "T" || e.key === "t") && !isIndexPage) {
        e.preventDefault();
        if (tvEl && tvEl.classList.contains("open")) closeTvStage();
        else openTvStage(false);
      }
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

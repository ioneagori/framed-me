/* =========================================
   Framed Me — "No Share Sheet" Capture
   - iOS에서도 navigator.share 사용 안 함
   - 무조건 a.download / blob URL로 "다운로드" 시도
   - iOS에서 다운로드가 막히면: (완전 무팝업 저장은 불가)
     -> 최소한의 안내 alert만 (원하면 alert도 제거 가능)
========================================= */

let cam;

let currentFrame = 1;
let currentCrowd = 1;

const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

const TARGET_FPS_MOBILE = 30;
const TARGET_FPS_DESKTOP = 60;

const CROWD_H_VH = 45;
const BARRIER_H_VH = 16;
const BORDER_THIN_FACTOR = 0.90;

// ===== Audio (lazy) =====
let bgm = null, talk = null;
let audioReady = false;
let audioStarted = false;
let desiredMuted = false;
const BGM_VOLUME  = 0.30;
const TALK_VOLUME = 0.65;

// ===== Asset caches =====
const frameCache = {};
const crowdCache = {};
let barrierImg = null;

let frame = null;
let crowdImg = null;

// ===== Offscreen layers =====
let frameLayer;
let bottomLayer;
let needsFrameRedraw = true;
let needsBottomRedraw = true;

// ===== Loading UI =====
let essentialReady = false;
let essentialTotal = 0;
let essentialDone = 0;

let statusText = "";
let resizeTimer = null;

function safeMasterVolume(v) {
  try { if (typeof masterVolume === "function") masterVolume(v); } catch (e) {}
}

function preload() {
  essentialTotal = 10;
  essentialDone = 0;

  loadFrameSetEssential(1);

  crowdImg = loadImgCounted(`crowd_1.png`);
  crowdCache[1] = crowdImg;

  barrierImg = loadImgCounted(`barrier.png`);
}

function loadImgCounted(path) {
  return loadImage(
    path,
    () => { essentialDone++; },
    (err) => { console.error("❌ FAILED:", path, err); essentialDone++; }
  );
}

function loadFrameSetEssential(n) {
  const base = `frame_${n}_`;
  frameCache[n] = {
    tl: loadImgCounted(base + "tl.png"),
    t:  loadImgCounted(base + "t.png"),
    tr: loadImgCounted(base + "tr.png"),
    l:  loadImgCounted(base + "l.png"),
    r:  loadImgCounted(base + "r.png"),
    bl: loadImgCounted(base + "bl.png"),
    b:  loadImgCounted(base + "b.png"),
    br: loadImgCounted(base + "br.png"),
    loading: false,
    ready: false
  };
  frame = frameCache[n];
}

function setup() {
  pixelDensity(IS_MOBILE ? 1 : Math.min(2, window.devicePixelRatio || 1));
  frameRate(IS_MOBILE ? TARGET_FPS_MOBILE : TARGET_FPS_DESKTOP);

  const c = createCanvas(windowWidth, getVH());
  c.parent("stage");

  const camW = IS_MOBILE ? 640 : 1280;
  const camH = IS_MOBILE ? 480 : 720;

  cam = createCapture(
    {
      video: {
        facingMode: "user",
        width:  { ideal: camW },
        height: { ideal: camH }
      },
      audio: false
    }
  );
  cam.size(camW, camH);
  cam.hide();

  frameLayer = createGraphics(width, height);
  bottomLayer = createGraphics(width, height);
  needsFrameRedraw = true;
  needsBottomRedraw = true;

  hookUI();

  const firstGesture = () => {
    startAudioLazyLoad();
    startAudioIfReady();
  };
  document.addEventListener("pointerdown", firstGesture, { once: true });
  document.addEventListener("touchstart",  firstGesture, { once: true, passive: true });

  applyMuteUI();
}

function draw() {
  if (!essentialReady && essentialDone >= essentialTotal) {
    essentialReady = true;
    markFrameReadyIfPossible(1);
    needsFrameRedraw = true;
    needsBottomRedraw = true;
  }

  background(0);

  if (isCamReady()) drawVideoCoverSafe(cam, 0, 0, width, height, true);
  else drawWaitingText();

  if (needsFrameRedraw) redrawFrameLayer();
  image(frameLayer, 0, 0);

  if (needsBottomRedraw) redrawBottomLayer();
  image(bottomLayer, 0, 0);

  if (!essentialReady) drawLoadingOverlay();
  if (statusText) drawStatusText(statusText);
}

function windowResized() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeCanvas(windowWidth, getVH());
    frameLayer = createGraphics(width, height);
    bottomLayer = createGraphics(width, height);
    needsFrameRedraw = true;
    needsBottomRedraw = true;
  }, 120);
}

function getVH() {
  return window.innerHeight || windowHeight;
}

function hookUI() {
  const bindTap = (el, fn) => {
    if (!el) return;
    let lastFire = 0;
    const fireOnce = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastFire < 350) return;
      lastFire = now;
      fn();
    };
    el.addEventListener("pointerdown", fireOnce, { passive: false });
    el.addEventListener("touchstart", fireOnce, { passive: false });
  };

  document.querySelectorAll(".circle-btn").forEach(btn => {
    bindTap(btn, () => {
      startAudioLazyLoad();
      startAudioIfReady();

      const type = btn.dataset.type;
      const id = Number(btn.dataset.id);

      document
        .querySelectorAll(`.circle-btn[data-type="${type}"]`)
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (type === "frame") setFrame(id);
      else if (type === "crowd") setCrowd(id);
    });
  });

  bindTap(document.getElementById("cameraBtn"), () => {
    startAudioLazyLoad();
    startAudioIfReady();
    captureDownloadNoShareSheet();
  });

  bindTap(document.getElementById("muteBtn"), () => {
    desiredMuted = !desiredMuted;
    applyMuteUI();
    startAudioLazyLoad();
    startAudioIfReady();
    applyMuteToAudio(true);
  });
}

function setFrame(n) {
  currentFrame = n;

  if (frameCache[n] && frameCache[n].ready) {
    frame = frameCache[n];
    needsFrameRedraw = true;
    statusText = "";
    return;
  }

  if (!frameCache[n]) {
    frameCache[n] = {
      tl: null, t: null, tr: null, l: null, r: null, bl: null, b: null, br: null,
      loading: false, ready: false
    };
  }

  if (frameCache[n].loading) {
    statusText = "FRAME 로딩중…";
    return;
  }

  statusText = "FRAME 로딩중…";
  lazyLoadFrameSet(n, () => {
    frame = frameCache[n];
    needsFrameRedraw = true;
    statusText = "";
  });
}

function setCrowd(n) {
  currentCrowd = n;

  if (crowdCache[n] && crowdCache[n].width > 0) {
    crowdImg = crowdCache[n];
    needsBottomRedraw = true;
    statusText = "";
    return;
  }

  statusText = "VISITOR 로딩중…";
  lazyLoadCrowd(n, (img) => {
    crowdCache[n] = img;
    crowdImg = img;
    needsBottomRedraw = true;
    statusText = "";
  });
}

function lazyLoadCrowd(n, onDone) {
  const path = `crowd_${n}.png`;
  loadImage(
    path,
    (img) => onDone(img),
    (err) => { console.error("❌ FAILED:", path, err); statusText = ""; }
  );
}

function lazyLoadFrameSet(n, onDone) {
  const base = `frame_${n}_`;
  const f = frameCache[n];
  f.loading = true;

  let loaded = 0;
  const need = 8;

  const one = (key, filename) => {
    loadImage(
      filename,
      (img) => {
        f[key] = img;
        loaded++;
        if (loaded >= need) {
          f.loading = false;
          f.ready = true;
          onDone();
        }
      },
      (err) => {
        console.error("❌ FAILED:", filename, err);
        f.loading = false;
        statusText = "";
      }
    );
  };

  one("tl", base + "tl.png");
  one("t",  base + "t.png");
  one("tr", base + "tr.png");
  one("l",  base + "l.png");
  one("r",  base + "r.png");
  one("bl", base + "bl.png");
  one("b",  base + "b.png");
  one("br", base + "br.png");
}

function markFrameReadyIfPossible(n) {
  const f = frameCache[n];
  if (!f) return;
  f.ready = isFrameReady(f);
}

function startAudioLazyLoad() {
  if (audioReady || bgm || talk) return;

  loadSound("exhibition.mp3", (s) => { bgm = s; checkAudioReady(); },
    (e) => console.error("❌ AUDIO LOAD FAILED: exhibition.mp3", e));

  loadSound("talk.mp3", (s) => { talk = s; checkAudioReady(); },
    (e) => console.error("❌ AUDIO LOAD FAILED: talk.mp3", e));
}

function checkAudioReady() {
  if (bgm && talk && !audioReady) {
    audioReady = true;
    applyMuteToAudio(false);
  }
}

function startAudioIfReady() {
  if (!audioReady || audioStarted) return;

  userStartAudio();

  bgm.setLoop(true);
  talk.setLoop(true);

  if (desiredMuted) {
    bgm.setVolume(0);
    talk.setVolume(0);
    safeMasterVolume(0);
  } else {
    bgm.setVolume(BGM_VOLUME);
    talk.setVolume(TALK_VOLUME);
    safeMasterVolume(1);
  }

  bgm.play();
  talk.play();
  audioStarted = true;
}

function applyMuteUI() {
  const btn = document.getElementById("muteBtn");
  if (!btn) return;
  btn.classList.toggle("muted", desiredMuted);
}

function applyMuteToAudio(force = false) {
  if (!audioReady) return;

  if (desiredMuted) {
    bgm.setVolume(0);
    talk.setVolume(0);
    safeMasterVolume(0);
  } else {
    if (audioStarted) {
      if (!bgm.isPlaying()) bgm.play();
      if (!talk.isPlaying()) talk.play();
    }
    bgm.setVolume(BGM_VOLUME);
    talk.setVolume(TALK_VOLUME);
    safeMasterVolume(1);
  }

  if (force) {
    setTimeout(() => {
      if (!audioReady) return;
      if (desiredMuted) {
        bgm.setVolume(0); talk.setVolume(0); safeMasterVolume(0);
      } else {
        bgm.setVolume(BGM_VOLUME); talk.setVolume(TALK_VOLUME); safeMasterVolume(1);
      }
    }, 70);
  }
}

function isCamReady() {
  return cam && cam.elt && cam.elt.videoWidth > 0 && cam.elt.videoHeight > 0;
}

function drawWaitingText() {
  push();
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(16);
  text("카메라 로딩중… (권한 허용 후 잠시만)", width / 2, height / 2);
  pop();
}

function drawVideoCoverSafe(video, x, y, w, h, mirror = true) {
  const vw = video.elt.videoWidth;
  const vh = video.elt.videoHeight;
  if (vw <= 0 || vh <= 0) return;

  const coverFactor = Math.max(w / vw, h / vh);
  const sw = w / coverFactor;
  const sh = h / coverFactor;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;

  push();
  if (mirror) {
    translate(x + w, y);
    scale(-1, 1);
    image(video, 0, 0, w, h, sx, sy, sw, sh);
  } else {
    image(video, x, y, w, h, sx, sy, sw, sh);
  }
  pop();
}

function isFrameReady(f) {
  return f && ["tl","t","tr","l","r","bl","b","br"].every(k => f[k] && f[k].width > 0);
}

function clampVal(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function calcBorderSize() {
  const minSide = Math.min(width, height);
  const maxByScreen = minSide * 0.18;
  const minByScreen = minSide * 0.06;
  let border = clampVal(minSide * 0.12, minByScreen, maxByScreen);
  border *= BORDER_THIN_FACTOR;
  return Math.max(28, Math.floor(border));
}

function redrawFrameLayer() {
  frameLayer.clear();
  if (!frame || !isFrameReady(frame)) return;

  const f = frame;
  const border = calcBorderSize();
  const innerW = Math.max(0, width - border * 2);
  const innerH = Math.max(0, height - border * 2);

  frameLayer.image(f.tl, 0, 0, border, border);
  frameLayer.image(f.tr, width - border, 0, border, border);
  frameLayer.image(f.bl, 0, height - border, border, border);
  frameLayer.image(f.br, width - border, height - border, border, border);

  frameLayer.image(f.t, border, 0, innerW, border);
  frameLayer.image(f.b, border, height - border, innerW, border);

  frameLayer.image(f.l, 0, border, border, innerH);
  frameLayer.image(f.r, width - border, border, border, innerH);

  needsFrameRedraw = false;
}

function redrawBottomLayer() {
  bottomLayer.clear();

  const crowdH = height * (CROWD_H_VH / 100);
  const crowdY = height - crowdH;

  if (crowdImg && crowdImg.width > 0) {
    drawTopCoverOnLayer(bottomLayer, crowdImg, 0, crowdY, width, crowdH);
  }

  const barrierH = height * (BARRIER_H_VH / 100);
  const barrierY = height - barrierH;

  if (barrierImg && barrierImg.width > 0) {
    drawCenterCoverOnLayer(bottomLayer, barrierImg, 0, barrierY, width, barrierH);
  }

  needsBottomRedraw = false;
}

function drawTopCoverOnLayer(g, img, dx, dy, dw, dh) {
  const coverFactor = Math.max(dw / img.width, dh / img.height);
  const sw = dw / coverFactor;
  const sh = dh / coverFactor;
  const sx = (img.width - sw) / 2;
  const sy = 0;
  g.image(img, dx, dy, dw, dh, sx, sy, sw, sh);
}

function drawCenterCoverOnLayer(g, img, dx, dy, dw, dh) {
  const coverFactor = Math.max(dw / img.width, dh / img.height);
  const sw = dw / coverFactor;
  const sh = dh / coverFactor;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  g.image(img, dx, dy, dw, dh, sx, sy, sw, sh);
}

/* =========================================
   Capture: NO share sheet, try direct download only
   - On iOS: may still show browser download UI or do nothing (policy)
   - We do NOT open a new tab/window.
========================================= */
function captureDownloadNoShareSheet() {
  const ui = document.getElementById("ui");
  ui.style.opacity = "0";
  ui.style.pointerEvents = "none";

  setTimeout(async () => {
    try {
      const canvasEl = document.querySelector("canvas");

      const blob = await new Promise((resolve) => {
        canvasEl.toBlob((b) => resolve(b), "image/png", 1.0);
      });

      const filename = `framedme_f${currentFrame}_v${currentCrowd}_${Date.now()}.png`;
      const url = URL.createObjectURL(blob);

      // direct download attempt
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 800);

      // NOTE: iOS Safari may ignore a.download; can't force silent save.
      // If you truly want zero UI on iOS, the web can't do it.
    } catch (e) {
      console.error("❌ CAPTURE FAILED:", e);
      alert("iPhone/iPad는 웹에서 자동 저장이 제한될 수 있어요. (브라우저 정책)\n가능하면 PC/안드로이드에서 다운로드가 더 확실해요.");
    } finally {
      ui.style.opacity = "1";
      ui.style.pointerEvents = "auto";
    }
  }, 80);
}

function drawLoadingOverlay() {
  const p = essentialTotal > 0 ? Math.min(1, essentialDone / essentialTotal) : 0;

  push();
  noStroke();
  fill(0, 170);
  rect(0, 0, width, height);

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(14);
  text("로딩중…", width / 2, height / 2 - 18);

  const bw = Math.min(260, width * 0.7);
  const bh = 8;
  const bx = width / 2 - bw / 2;
  const by = height / 2 + 6;

  fill(255, 60);
  rect(bx, by, bw, bh, 999);

  fill(255);
  rect(bx, by, bw * p, bh, 999);

  fill(255, 180);
  textSize(12);
  text(`${Math.round(p * 100)}%`, width / 2, by + 22);

  pop();
}

function drawStatusText(msg) {
  push();
  noStroke();
  fill(0, 140);
  rect(12, 12, 160, 32, 12);
  fill(255);
  textAlign(LEFT, CENTER);
  textSize(12);
  text(msg, 22, 28);
  pop();
}

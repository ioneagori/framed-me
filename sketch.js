/* =========================================
   Framed Me — Mobile Optimized
   - pixelDensity(1) on mobile
   - frameRate(30 mobile, 60 desktop)
   - offscreen caching for frame/bottom
   - debounced resize to avoid thrash
   - minimal per-frame work
========================================= */

let cam;

let currentFrame = 1;
let currentCrowd = 1;

const frameCache = {};
let frame = null;

let crowdImg = null;
let barrierImg = null;

// ===== Layout =====
const CROWD_H_VH = 45;
const BARRIER_H_VH = 16;
const BORDER_THIN_FACTOR = 0.90;

// ===== Flash =====
let flashAlpha = 0;

// ===== Audio =====
let bgm, talk;
let audioReady = false;
let audioStarted = false;

let desiredMuted = false;

const BGM_VOLUME  = 0.30;
const TALK_VOLUME = 0.65;

let audioLoadCount = 0;

// ===== Caches =====
let frameLayer;
let bottomLayer;
let needsFrameRedraw = true;
let needsBottomRedraw = true;

// ===== Perf flags =====
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const TARGET_FPS_MOBILE = 30;     // 더 부드럽게: 30 / 더 가볍게: 24
const TARGET_FPS_DESKTOP = 60;

// ===== Resize debounce =====
let resizeTimer = null;

/* ✅ 안전 마스터볼륨 */
function safeMasterVolume(v) {
  try {
    if (typeof masterVolume === "function") masterVolume(v);
  } catch (e) {}
}

function preload() {
  loadFrameSet(currentFrame);
  crowdImg = loadImg(`crowd_${currentCrowd}.png`);
  barrierImg = loadImg(`barrier.png`);

  bgm  = loadSound("exhibition.mp3", onAudioLoaded, onAudioError);
  talk = loadSound("talk.mp3",       onAudioLoaded, onAudioError);
}

function setup() {
  // ✅ 모바일은 무조건 1 (레티나 과부하 방지)
  pixelDensity(IS_MOBILE ? 1 : Math.min(2, window.devicePixelRatio || 1));
  frameRate(IS_MOBILE ? TARGET_FPS_MOBILE : TARGET_FPS_DESKTOP);

  const c = createCanvas(windowWidth, getVH());
  c.parent("stage");

  // ✅ 모바일은 카메라 해상도 욕심 내지 말기
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

  // Offscreen layers (cached)
  frameLayer = createGraphics(width, height);
  bottomLayer = createGraphics(width, height);
  needsFrameRedraw = true;
  needsBottomRedraw = true;

  hookUI();

  // 오디오 시작은 사용자 제스처에서만
  document.addEventListener("pointerdown", () => startAudioIfNeeded(), { once: true });
  document.addEventListener("touchstart",  () => startAudioIfNeeded(), { once: true, passive: true });

  applyMuteUI();
}

function draw() {
  // ✅ draw에서 할 일 최소화
  background(0);

  if (isCamReady()) {
    drawVideoCoverSafe(cam, 0, 0, width, height, true);
  } else {
    drawWaitingText();
  }

  if (needsFrameRedraw) redrawFrameLayer();
  image(frameLayer, 0, 0);

  if (needsBottomRedraw) redrawBottomLayer();
  image(bottomLayer, 0, 0);

  drawFlashOverlay();
}

function windowResized() {
  // ✅ 회전/리사이즈 연속 호출 디바운스 (모바일에서 가장 중요)
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

/* =========================
   Assets
========================= */
function loadImg(path) {
  return loadImage(
    path,
    () => {},
    (err) => console.error("❌ FAILED:", path, err)
  );
}

function loadFrameSet(n) {
  if (frameCache[n]) {
    frame = frameCache[n];
    return;
  }
  const base = `frame_${n}_`;
  frameCache[n] = {
    tl: loadImg(base + "tl.png"),
    t:  loadImg(base + "t.png"),
    tr: loadImg(base + "tr.png"),
    l:  loadImg(base + "l.png"),
    r:  loadImg(base + "r.png"),
    bl: loadImg(base + "bl.png"),
    b:  loadImg(base + "b.png"),
    br: loadImg(base + "br.png"),
  };
  frame = frameCache[n];
}

function isFrameReady(f) {
  return f && Object.values(f).every(img => img && img.width > 0);
}

/* =========================
   UI events (중복 토글 방지)
========================= */
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
      startAudioIfNeeded();

      const type = btn.dataset.type;
      const id = Number(btn.dataset.id);

      document
        .querySelectorAll(`.circle-btn[data-type="${type}"]`)
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (type === "frame") {
        currentFrame = id;
        loadFrameSet(id);
        needsFrameRedraw = true; // ✅ 프레임만 갱신
      } else if (type === "crowd") {
        currentCrowd = id;
        crowdImg = loadImg(`crowd_${id}.png`);
        needsBottomRedraw = true; // ✅ 하단만 갱신
      }
    });
  });

  bindTap(document.getElementById("cameraBtn"), () => {
    startAudioIfNeeded();
    captureWithFlash();
  });

  bindTap(document.getElementById("muteBtn"), () => {
    desiredMuted = !desiredMuted;
    applyMuteUI();
    startAudioIfNeeded();
    applyMuteToAudio(true);
  });
}

/* =========================
   Audio
========================= */
function onAudioLoaded() {
  audioLoadCount++;
  if (audioLoadCount === 2) {
    audioReady = true;
    applyMuteToAudio(false);
  }
}
function onAudioError(e) {
  console.error("❌ AUDIO LOAD FAILED", e);
}

function startAudioIfNeeded() {
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

/* =========================
   Camera cover (fast)
========================= */
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

/* =========================
   Layers (cached)
========================= */
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
  if (!isFrameReady(frame)) return;

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
  const sy = 0; // ✅ 상단 고정 (얼굴 안 잘림)
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

/* =========================
   Capture (avoid heavy ops)
========================= */
function captureWithFlash() {
  const ui = document.getElementById("ui");
  flashAlpha = 150;

  ui.style.opacity = "0";
  ui.style.pointerEvents = "none";

  setTimeout(() => {
    const canvasEl = document.querySelector("canvas");
    const dataURL = canvasEl.toDataURL("image/png");

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isIOS) {
      const win = window.open("");
      if (win) {
        win.document.write(`
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <title>Captured</title>
          <style>
            body{ margin:0; background:#000; display:flex; align-items:center; justify-content:center; min-height:100dvh; }
            img{ width:100%; height:auto; max-width:100vw; }
          </style>
          <img src="${dataURL}" alt="capture" />
        `);
      } else {
        alert("팝업이 차단되어 캡처 이미지를 열 수 없어요. 팝업 허용 후 다시 시도해줘!");
      }
    } else {
      const a = document.createElement("a");
      a.href = dataURL;
      a.download = `framedme_f${currentFrame}_v${currentCrowd}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    ui.style.opacity = "1";
    ui.style.pointerEvents = "auto";
  }, 120);
}

/* =========================
   Flash
========================= */
function drawFlashOverlay() {
  if (flashAlpha <= 0) return;
  noStroke();
  fill(255, flashAlpha);
  rect(0, 0, width, height);
  flashAlpha -= 22;
}

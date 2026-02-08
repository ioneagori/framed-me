/* =========================================
   Framed Me — Mobile Optimized + Safe UI
   - frame/crowd/barrier 캐싱으로 모바일 버벅임 개선
   - safe viewport height 대응(window.innerHeight)
========================================= */

let cam;

let currentFrame = 1;
let currentCrowd = 1;

const frameCache = {};
let frame = null;

let crowdImg = null;
let barrierImg = null;

// ===== Layout tuning =====
const CROWD_H_VH = 40;       // ✅ 너가 요청한 40%
const BARRIER_H_VH = 16;
const BORDER_THIN_FACTOR = 0.60;

// ===== Flash =====
let flashAlpha = 0;

// ===== AUDIO (2 tracks) =====
let bgm, talk;
let audioReady = false;
let audioStarted = false;
let audioMuted = false;

const BGM_VOLUME  = 0.30;
const TALK_VOLUME = 0.65;

let audioLoadCount = 0;

// ===== Performance caches =====
let frameLayer;     // createGraphics for frame overlay
let bottomLayer;    // createGraphics for crowd+barrier
let needsFrameRedraw = true;
let needsBottomRedraw = true;

function preload() {
  loadFrameSet(currentFrame);
  crowdImg = loadImg(`crowd_${currentCrowd}.png`);
  barrierImg = loadImg(`barrier.png`);

  bgm = loadSound("exhibition.mp3", onAudioLoaded, onAudioError);
  talk = loadSound("talk.mp3", onAudioLoaded, onAudioError);
}

function setup() {
  // ✅ 모바일 성능 세팅
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  pixelDensity(isMobile ? 1 : Math.min(2, window.devicePixelRatio || 1));
  frameRate(isMobile ? 30 : 60);

  const c = createCanvas(windowWidth, getVH());
  c.parent("stage");

  // 카메라도 모바일에서는 너무 큰 해상도 무리하지 않게
  const camW = isMobile ? 640 : 1280;
  const camH = isMobile ? 480 : 720;

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

  // 캐시 레이어 생성
  frameLayer = createGraphics(width, height);
  bottomLayer = createGraphics(width, height);
  needsFrameRedraw = true;
  needsBottomRedraw = true;

  hookUI();

  // 프리뷰/iframe에서도 첫 입력 잡기
  document.addEventListener("pointerdown", startAudioIfNeeded, { once: true });
}

function draw() {
  background(0);

  // 1) camera cover (mirror)
  if (isCamReady()) {
    drawVideoCoverSafe(cam, 0, 0, width, height, true);
  } else {
    drawWaitingText();
  }

  // 2) frame cached
  if (needsFrameRedraw) redrawFrameLayer();
  image(frameLayer, 0, 0);

  // 3) bottom cached (crowd + barrier)
  if (needsBottomRedraw) redrawBottomLayer();
  image(bottomLayer, 0, 0);

  // 4) flash overlay
  drawFlashOverlay();
}

function windowResized() {
  resizeCanvas(windowWidth, getVH());

  // 레이어도 크기 변경
  frameLayer = createGraphics(width, height);
  bottomLayer = createGraphics(width, height);
  needsFrameRedraw = true;
  needsBottomRedraw = true;
}

// ✅ 모바일에서 100vh 꼬임 방지용
function getVH() {
  return window.innerHeight || windowHeight;
}

/* =========================
   Loader helpers
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
    tl: loadImg(base + 'tl.png'),
    t:  loadImg(base + 't.png'),
    tr: loadImg(base + 'tr.png'),
    l:  loadImg(base + 'l.png'),
    r:  loadImg(base + 'r.png'),
    bl: loadImg(base + 'bl.png'),
    b:  loadImg(base + 'b.png'),
    br: loadImg(base + 'br.png'),
  };
  frame = frameCache[n];
}

function isFrameReady(f) {
  return f && Object.values(f).every(img => img && img.width > 0);
}

/* =========================
   UI events
========================= */
function hookUI() {
  document.querySelectorAll(".circle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      startAudioIfNeeded();

      const type = btn.dataset.type;
      const id = Number(btn.dataset.id);

      document
        .querySelectorAll(`.circle-btn[data-type="${type}"]`)
        .forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (type === "frame") {
        currentFrame = id;
        loadFrameSet(currentFrame);
        needsFrameRedraw = true;
      }

      if (type === "crowd") {
        currentCrowd = id;
        crowdImg = loadImg(`crowd_${currentCrowd}.png`);
        needsBottomRedraw = true;
      }
    });
  });

  document.getElementById("cameraBtn").addEventListener("click", () => {
    startAudioIfNeeded();
    captureWithFlash();
  });

  document.getElementById("muteBtn").addEventListener("click", () => {
    startAudioIfNeeded();
    toggleMute();
  });
}

/* =========================
   AUDIO
========================= */
function onAudioLoaded() {
  audioLoadCount++;
  if (audioLoadCount === 2) audioReady = true;
}
function onAudioError(e) {
  console.error("❌ AUDIO LOAD FAILED", e);
}

function startAudioIfNeeded() {
  if (!audioReady || audioStarted) return;

  userStartAudio();

  bgm.setLoop(true);
  talk.setLoop(true);

  bgm.setVolume(BGM_VOLUME);
  talk.setVolume(TALK_VOLUME);

  bgm.play();
  talk.play();

  audioStarted = true;
}

function toggleMute() {
  const btn = document.getElementById("muteBtn");
  audioMuted = !audioMuted;

  if (audioMuted) {
    bgm.setVolume(0);
    talk.setVolume(0);
    btn.classList.add("muted");
  } else {
    if (audioStarted) {
      if (!bgm.isPlaying()) bgm.play();
      if (!talk.isPlaying()) talk.play();
    }
    bgm.setVolume(BGM_VOLUME);
    talk.setVolume(TALK_VOLUME);
    btn.classList.remove("muted");
  }
}

function mousePressed() { startAudioIfNeeded(); }
function touchStarted() { startAudioIfNeeded(); return false; }

/* =========================
   Camera cover (safe)
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
   Cached layers
========================= */
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

function clampVal(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* =========================
   Capture + Flash
========================= */
function captureWithFlash() {
  const ui = document.getElementById("ui");

  flashAlpha = 150;

  ui.style.opacity = "0";
  ui.style.pointerEvents = "none";

  setTimeout(() => {
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
      ts.getFullYear() +
      pad(ts.getMonth() + 1) +
      pad(ts.getDate()) + '-' +
      pad(ts.getHours()) +
      pad(ts.getMinutes()) +
      pad(ts.getSeconds());

    saveCanvas(`framedme_f${currentFrame}_c${currentCrowd}_${stamp}`, "png");

    ui.style.opacity = "1";
    ui.style.pointerEvents = "auto";
  }, 120);
}

function drawFlashOverlay() {
  if (flashAlpha <= 0) return;
  noStroke();
  fill(255, flashAlpha);
  rect(0, 0, width, height);
  flashAlpha -= 22;
}

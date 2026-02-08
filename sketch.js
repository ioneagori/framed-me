/* =========================================
   Framed Me — Dual Audio Version
   - exhibition.mp3 + talk.mp3 동시 재생
   - mute 버튼 하나로 둘 다 제어
========================================= */

let cam;

// 선택 상태
let currentFrame = 1;
let currentCrowd = 1;

// 프레임 캐시
const frameCache = {};
let frame = null;

// 이미지
let crowdImg, barrierImg;

// 레이아웃
const CROWD_H_VH = 45;
const BARRIER_H_VH = 16;
const BORDER_THIN_FACTOR = 0.90;

// 플래시
let flashAlpha = 0;

// ===== AUDIO =====
let bgm, talk;
let audioReady = false;
let audioStarted = false;
let audioMuted = false;

const BGM_VOLUME  = 0.30;
const TALK_VOLUME = 0.65;

function preload() {
  loadFrameSet(currentFrame);
  crowdImg = loadImage(`crowd_${currentCrowd}.png`);
  barrierImg = loadImage(`barrier.png`);

  bgm = loadSound("exhibition.mp3", onAudioLoaded, onAudioError);
  talk = loadSound("talk.mp3", onAudioLoaded, onAudioError);
}

let audioLoadCount = 0;
function onAudioLoaded() {
  audioLoadCount++;
  if (audioLoadCount === 2) audioReady = true;
}
function onAudioError(e) {
  console.error("❌ AUDIO LOAD FAILED", e);
}

function setup() {
  pixelDensity(1);
  const c = createCanvas(windowWidth, windowHeight);
  c.parent("stage");

  cam = createCapture(
    {
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    }
  );
  cam.size(1280, 720);
  cam.hide();

  hookUI();

  // iframe / 프리뷰 대비
  document.addEventListener("pointerdown", startAudioIfNeeded, { once: true });
}

function draw() {
  background(0);

  if (isCamReady()) {
    drawVideoCover(cam, 0, 0, width, height);
  } else {
    drawWaitingText();
  }

  if (frame && isFrameReady(frame)) {
    drawFrame(frame);
  }

  drawCrowdAndBarrier();
  drawFlash();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (cam) cam.size(1280, 720);
}

/* =========================
   UI
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
        loadFrameSet(id);
      }
      if (type === "crowd") {
        currentCrowd = id;
        crowdImg = loadImage(`crowd_${id}.png`);
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
   AUDIO CONTROL
========================= */
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
    bgm.setVolume(BGM_VOLUME);
    talk.setVolume(TALK_VOLUME);
    btn.classList.remove("muted");
  }
}

function mousePressed() { startAudioIfNeeded(); }
function touchStarted() { startAudioIfNeeded(); return false; }

/* =========================
   CAMERA
========================= */
function isCamReady() {
  return cam && cam.elt && cam.elt.videoWidth > 0;
}

function drawVideoCover(video, x, y, w, h) {
  const vw = video.elt.videoWidth;
  const vh = video.elt.videoHeight;
  if (vw <= 0 || vh <= 0) return;

  const scaleFactor = Math.max(w / vw, h / vh);
  const sw = w / scaleFactor;
  const sh = h / scaleFactor;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;

  push();
  translate(x + w, y);
  scale(-1, 1);
  image(video, 0, 0, w, h, sx, sy, sw, sh);
  pop();
}

function drawWaitingText() {
  push();
  fill(255);
  textAlign(CENTER, CENTER);
  text("카메라 로딩중…", width / 2, height / 2);
  pop();
}

/* =========================
   FRAME
========================= */
function loadFrameSet(n) {
  if (frameCache[n]) {
    frame = frameCache[n];
    return;
  }
  const p = `frame_${n}_`;
  frameCache[n] = {
    tl: loadImage(p + "tl.png"),
    t:  loadImage(p + "t.png"),
    tr: loadImage(p + "tr.png"),
    l:  loadImage(p + "l.png"),
    r:  loadImage(p + "r.png"),
    bl: loadImage(p + "bl.png"),
    b:  loadImage(p + "b.png"),
    br: loadImage(p + "br.png"),
  };
  frame = frameCache[n];
}

function isFrameReady(f) {
  return Object.values(f).every(img => img && img.width > 0);
}

function drawFrame(f) {
  const border = Math.max(32, Math.floor(Math.min(width, height) * 0.12 * BORDER_THIN_FACTOR));
  const iw = width - border * 2;
  const ih = height - border * 2;

  image(f.tl, 0, 0, border, border);
  image(f.tr, width - border, 0, border, border);
  image(f.bl, 0, height - border, border, border);
  image(f.br, width - border, height - border, border, border);

  image(f.t, border, 0, iw, border);
  image(f.b, border, height - border, iw, border);
  image(f.l, 0, border, border, ih);
  image(f.r, width - border, border, border, ih);
}

/* =========================
   CROWD + BARRIER
========================= */
function drawCrowdAndBarrier() {
  const ch = height * (CROWD_H_VH / 100);
  const bh = height * (BARRIER_H_VH / 100);

  if (crowdImg) drawTopCover(crowdImg, 0, height - ch, width, ch);
  if (barrierImg) drawCenterCover(barrierImg, 0, height - bh, width, bh);
}

function drawTopCover(img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  image(img, x, y, w, h, (img.width - w / s) / 2, 0, w / s, h / s);
}

function drawCenterCover(img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  image(img, x, y, w, h, (img.width - w / s) / 2, (img.height - h / s) / 2, w / s, h / s);
}

/* =========================
   CAPTURE
========================= */
function captureWithFlash() {
  const ui = document.getElementById("ui");

  flashAlpha = 150;
  ui.style.opacity = "0";
  ui.style.pointerEvents = "none";

  setTimeout(() => {
    saveCanvas(`framedme_${Date.now()}`, "png");
    ui.style.opacity = "1";
    ui.style.pointerEvents = "auto";
  }, 120);
}

function drawFlash() {
  if (flashAlpha <= 0) return;
  noStroke();
  fill(255, flashAlpha);
  rect(0, 0, width, height);
  flashAlpha -= 20;
}

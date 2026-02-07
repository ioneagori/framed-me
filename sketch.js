/* =====================================
   FRAMED ME — v6 (진짜 최종)
   - 시작부터 프레임/대중은 1/1로 렌더(무조건 보임)
   - 버튼은 처음엔 미클릭처럼(active 없음)
   - 클릭 시: 선택한 버튼만 active (FRAME 1개, CROWD 1개 각각)
===================================== */

let cam;

const frames = {};
const crowds = {};

let renderFrame = 1;   // 화면에 그려지는 값(기본 1)
let renderCrowd = 1;   // 화면에 그려지는 값(기본 1)

let uiFrame = 0;       // UI 하이라이트 값(처음엔 0 = 미클릭)
let uiCrowd = 0;       // UI 하이라이트 값(처음엔 0 = 미클릭)

let frameBtns = [];
let crowdBtns = [];
let captureBtn;

const BASE_BORDER = 512;
let flashAlpha = 0;

const CROWD_EXT = "png"; // crowd_1.png ... crowd_4.png

function preload() {
  // frames: frame_1_tl.png ... frame_4_br.png
  for (let i = 1; i <= 4; i++) {
    frames[i] = {
      tl: safeLoad(`frame_${i}_tl.png`),
      t:  safeLoad(`frame_${i}_t.png`),
      tr: safeLoad(`frame_${i}_tr.png`),
      l:  safeLoad(`frame_${i}_l.png`),
      r:  safeLoad(`frame_${i}_r.png`),
      bl: safeLoad(`frame_${i}_bl.png`),
      b:  safeLoad(`frame_${i}_b.png`),
      br: safeLoad(`frame_${i}_br.png`),
    };
  }

  // crowds: crowd_1.png ... crowd_4.png
  for (let i = 1; i <= 4; i++) {
    crowds[i] = safeLoad(`crowd_${i}.${CROWD_EXT}`);
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  cam = createCapture(VIDEO);
  cam.size(640, 480);
  cam.hide();

  buildUI();
  updateUIState(); // 처음엔 active 없음
}

function draw() {
  background(0);

  if (!isCamReady()) {
    drawWaitingText();
  } else {
    drawVideoCover(cam, 0, 0, width, height, true);
  }

  drawNineSliceFrame(renderFrame);
  drawCrowdBottomCover(renderCrowd);

  drawFlashOverlay();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

/* =========================
   UI
========================= */
function buildUI() {
  const bar = createDiv("");
  bar.addClass("bottombar");

  // FRAME
  const frameGroup = createDiv("");
  frameGroup.addClass("group");
  frameGroup.parent(bar);

  const frameLabel = createDiv("FRAME");
  frameLabel.addClass("label");
  frameLabel.parent(frameGroup);

  const frameRow = createDiv("");
  frameRow.addClass("row");
  frameRow.parent(frameGroup);

  for (let i = 1; i <= 4; i++) {
    const b = createButton(String(i));
    b.addClass("circle");
    b.parent(frameRow);
    b.mousePressed(() => {
      renderFrame = i;
      uiFrame = i;         // ✅ UI는 클릭한 것만 활성
      updateUIState();
    });
    frameBtns.push(b);
  }

  // spacer
  const s1 = createDiv("");
  s1.addClass("spacer");
  s1.parent(bar);

  // CROWD
  const crowdGroup = createDiv("");
  crowdGroup.addClass("group");
  crowdGroup.parent(bar);

  const crowdLabel = createDiv("CROWD");
  crowdLabel.addClass("label");
  crowdLabel.parent(crowdGroup);

  const crowdRow = createDiv("");
  crowdRow.addClass("row");
  crowdRow.parent(crowdGroup);

  for (let i = 1; i <= 4; i++) {
    const b = createButton(String(i));
    b.addClass("circle");
    b.parent(crowdRow);
    b.mousePressed(() => {
      renderCrowd = i;
      uiCrowd = i;        // ✅ UI는 클릭한 것만 활성
      updateUIState();
    });
    crowdBtns.push(b);
  }

  // spacer
  const s2 = createDiv("");
  s2.addClass("spacer");
  s2.parent(bar);

  // Camera icon
  const capWrap = createDiv("");
  capWrap.addClass("capwrap");
  capWrap.parent(bar);

  captureBtn = createButton("");
  captureBtn.addClass("camIconOnly");
  captureBtn.parent(capWrap);
  captureBtn.html(getCameraSVGWhite());
  captureBtn.mousePressed(() => {
    flashOnce();
    saveCanvas(`framed_me_${Date.now()}`, "png");
  });
}

function updateUIState() {
  // ✅ “선택된 버튼만 active”
  for (let i = 0; i < frameBtns.length; i++) {
    frameBtns[i].removeClass("active");
    if (uiFrame === i + 1) frameBtns[i].addClass("active");
  }
  for (let i = 0; i < crowdBtns.length; i++) {
    crowdBtns[i].removeClass("active");
    if (uiCrowd === i + 1) crowdBtns[i].addClass("active");
  }
}

/* =========================
   Helpers
========================= */
function safeLoad(filename) {
  return loadImage(
    filename,
    () => {},
    () => console.error("❌ 이미지 로드 실패:", filename)
  );
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
  text("카메라 로딩중…", width / 2, height / 2);
  pop();
}

function drawVideoCover(video, x, y, w, h, mirror = true) {
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
    window.scale(-1, 1);
    image(video, 0, 0, w, h, sx, sy, sw, sh);
  } else {
    image(video, x, y, w, h, sx, sy, sw, sh);
  }
  pop();
}

/* =========================
   Frame 9-slice
========================= */
function drawNineSliceFrame(frameIndex) {
  const f = frames[frameIndex];
  if (!f) return;

  const border = calcBorderSize();
  const innerW = Math.max(0, width - border * 2);
  const innerH = Math.max(0, height - border * 2);

  image(f.tl, 0, 0, border, border);
  image(f.tr, width - border, 0, border, border);
  image(f.bl, 0, height - border, border, border);
  image(f.br, width - border, height - border, border, border);

  image(f.t, border, 0, innerW, border);
  image(f.b, border, height - border, innerW, border);

  image(f.l, 0, border, border, innerH);
  image(f.r, width - border, border, border, innerH);
}

function calcBorderSize() {
  const minSide = Math.min(width, height);
  const maxByScreen = minSide * 0.22;
  const minByScreen = minSide * 0.12;
  const border = clampVal(BASE_BORDER, minByScreen, maxByScreen);
  return Math.max(64, Math.floor(border));
}

function clampVal(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* =========================
   Crowd bottom cover (바닥 고정)
========================= */
function drawCrowdBottomCover(crowdIndex) {
  const img = crowds[crowdIndex];
  if (!img) return;

  const areaH = Math.max(320, Math.floor(height * 0.45));
  const yBottom = height;

  const s = Math.max(width / img.width, areaH / img.height);
  const dw = img.width * s;
  const dh = img.height * s;

  const dx = (width - dw) / 2;
  const dy = yBottom - dh;

  image(img, dx, dy, dw, dh);
}

/* =========================
   Flash
========================= */
function flashOnce() {
  flashAlpha = 220;
}
function drawFlashOverlay() {
  if (flashAlpha <= 0) return;
  noStroke();
  fill(255, flashAlpha);
  rect(0, 0, width, height);
  flashAlpha -= 35;
}

/* =========================
   SVG
========================= */
function getCameraSVGWhite() {
  return `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
       xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M7 7l1.2-2h7.6L17 7h2.5A2.5 2.5 0 0 1 22 9.5v9A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5v-9A2.5 2.5 0 0 1 4.5 7H7z"
          stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
    <path d="M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"
          stroke="currentColor" stroke-width="1.9"/>
  </svg>`;
}

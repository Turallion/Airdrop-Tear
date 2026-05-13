const canvas = document.getElementById("tear-canvas");
const ctx = canvas.getContext("2d");
const loading = document.getElementById("loading");
const finalScreen = document.getElementById("final-screen");
const finalScreenImage = document.getElementById("final-screen-image");
const resetButton = document.getElementById("reset-button");

let baseW = 1672;
let baseH = 941;
const COLS = 38;
const ROWS = 22;
const ITERATIONS = 4;
const GRAVITY = 0.055;
const FRICTION = 0.984;
const PULL_RADIUS = 116;
const CUT_RADIUS = 30;
const CUT_SPEED = 6.5;
const TEAR_STRETCH = 3.05;
const ADVANCE_ALIVE_RATIO = 0.45;
const ADVANCE_ISLAND_RATIO = 0.55;
const ADVANCE_DAMAGE_RATIO = 0.22;
const ADVANCE_DELAY = 540;
const H_CONSTRAINT_COUNT = (ROWS + 1) * COLS;

const MOBILE_QUERY = "(max-width: 720px)";

const assetSets = {
  desktop: {
    width: 1672,
    height: 941,
    stages: [
      "./assets/layer-4.png",
      "./assets/layer-2.png",
      "./assets/layer-3.png",
      "./assets/layer-1.png",
      "./assets/final.png",
    ],
    final: "./assets/final-end.png",
  },
  mobile: {
    width: 941,
    height: 1672,
    stages: [
      "./assets/mobile/layer-4.png",
      "./assets/mobile/layer-2.png",
      "./assets/mobile/layer-3.png",
      "./assets/mobile/layer-1.png",
      "./assets/mobile/final.png",
    ],
    final: "./assets/mobile/final-end.png",
  },
};

let activeAssetKey = "";

let dpr = 1;
let viewW = 0;
let viewH = 0;
let page = { x: 0, y: 0, w: 0, h: 0 };
let points = [];
let constraints = [];
let cells = [];
let stageIndex = 0;
let stageImages = [];
let finalImage = null;
let transitioning = false;
let activeFrames = 0;
let tearScore = 0;

const pointer = {
  down: false,
  x: 0,
  y: 0,
  px: 0,
  py: 0,
  lastAt: 0,
  button: 0,
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function pointIndex(x, y) {
  return y * (COLS + 1) + x;
}

function setupCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const ratio = baseW / baseH;
  let w = viewW;
  let h = w / ratio;
  if (h < viewH) {
    h = viewH;
    w = h * ratio;
  }

  page = {
    x: (viewW - w) / 2,
    y: (viewH - h) / 2,
    w,
    h,
  };

  buildCloth();
}

function makePoint(x, y, pinned) {
  return { x, y, oldX: x, oldY: y, pinned };
}

function buildCloth() {
  points = [];
  constraints = [];
  cells = [];
  tearScore = 0;

  for (let y = 0; y <= ROWS; y += 1) {
    for (let x = 0; x <= COLS; x += 1) {
      const px = page.x + (x / COLS) * page.w;
      const py = page.y + (y / ROWS) * page.h;
      const pinned = y === 0 || y === ROWS || x === 0 || x === COLS;
      points.push(makePoint(px, py, pinned));
    }
  }

  const addConstraint = (a, b) => {
    const pa = points[a];
    const pb = points[b];
    constraints.push({
      a,
      b,
      rest: Math.hypot(pa.x - pb.x, pa.y - pb.y),
      alive: true,
    });
  };

  for (let y = 0; y <= ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      addConstraint(pointIndex(x, y), pointIndex(x + 1, y));
    }
  }

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x <= COLS; x += 1) {
      addConstraint(pointIndex(x, y), pointIndex(x, y + 1));
    }
  }

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      cells.push({ x, y, alive: true });
    }
  }
}

function killCell(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  cells[y * COLS + x].alive = false;
}

function killConstraint(constraint) {
  if (!constraint.alive) return;
  constraint.alive = false;
  tearScore += 1;

  const ax = constraint.a % (COLS + 1);
  const ay = Math.floor(constraint.a / (COLS + 1));
  const bx = constraint.b % (COLS + 1);
  const by = Math.floor(constraint.b / (COLS + 1));
  const cx = Math.min(ax, bx);
  const cy = Math.min(ay, by);

  if (ay === by) {
    killCell(cx, ay - 1);
    killCell(cx, ay);
  } else {
    killCell(ax - 1, cy);
    killCell(ax, cy);
  }
}

function aliveRatio() {
  let alive = 0;
  for (const cell of cells) {
    if (cell.alive) alive += 1;
  }
  return alive / cells.length;
}

function tearDamageRatio() {
  return constraints.length ? tearScore / constraints.length : 0;
}

function canMoveBetweenCells(x, y, nx, ny) {
  if (nx === x + 1 && ny === y) {
    return constraints[H_CONSTRAINT_COUNT + y * (COLS + 1) + x + 1]?.alive;
  }
  if (nx === x - 1 && ny === y) {
    return constraints[H_CONSTRAINT_COUNT + y * (COLS + 1) + x]?.alive;
  }
  if (nx === x && ny === y + 1) {
    return constraints[(y + 1) * COLS + x]?.alive;
  }
  if (nx === x && ny === y - 1) {
    return constraints[y * COLS + x]?.alive;
  }
  return false;
}

function largestAliveIslandRatio() {
  const visited = new Uint8Array(cells.length);
  let largest = 0;

  for (let i = 0; i < cells.length; i += 1) {
    if (visited[i] || !cells[i].alive) continue;

    let size = 0;
    const queue = [i];
    visited[i] = 1;

    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const x = current % COLS;
      const y = Math.floor(current / COLS);
      size += 1;

      const neighbors = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];

      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const nextIndex = ny * COLS + nx;
        if (visited[nextIndex] || !cells[nextIndex].alive) continue;
        if (!canMoveBetweenCells(x, y, nx, ny)) continue;
        visited[nextIndex] = 1;
        queue.push(nextIndex);
      }
    }

    largest = Math.max(largest, size);
  }

  return largest / cells.length;
}

function tearAround(x, y, radius) {
  const r2 = radius * radius;
  for (const constraint of constraints) {
    if (!constraint.alive) continue;
    const a = points[constraint.a];
    const b = points[constraint.b];
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    if ((mx - x) ** 2 + (my - y) ** 2 < r2) {
      killConstraint(constraint);
    }
  }
}

function tearLine(x1, y1, x2, y2, radius) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(dist / 16));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    tearAround(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, radius);
  }
}

function unpinAll() {
  for (const point of points) {
    point.pinned = false;
  }
}

function stepPhysics() {
  for (const point of points) {
    if (point.pinned) continue;

    let x = point.x;
    let y = point.y;

    if (pointer.down) {
      const dx = x - pointer.x;
      const dy = y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < PULL_RADIUS) {
        const force = (1 - distance / PULL_RADIUS) ** 1.7;
        x += (pointer.x - pointer.px) * force * 1.24;
        y += (pointer.y - pointer.py) * force * 1.24;
      }
    }

    const vx = (x - point.oldX) * FRICTION;
    const vy = (y - point.oldY) * FRICTION;
    point.oldX = x;
    point.oldY = y;
    point.x = x + vx;
    point.y = y + vy + GRAVITY;
  }

  if (pointer.down) {
    const speed = Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py);
    if (speed > CUT_SPEED || pointer.button === 2) {
      tearLine(pointer.px, pointer.py, pointer.x, pointer.y, pointer.button === 2 ? CUT_RADIUS * 1.8 : CUT_RADIUS);
    }
  }

  for (let i = 0; i < ITERATIONS; i += 1) {
    for (const constraint of constraints) {
      if (!constraint.alive) continue;
      const a = points[constraint.a];
      const b = points[constraint.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);

      if (distance > constraint.rest * TEAR_STRETCH) {
        killConstraint(constraint);
        continue;
      }
      if (distance === 0) continue;

      const diff = (distance - constraint.rest) / distance;
      const offsetX = dx * diff * 0.5;
      const offsetY = dy * diff * 0.5;

      if (!a.pinned) {
        a.x += offsetX;
        a.y += offsetY;
      }
      if (!b.pinned) {
        b.x -= offsetX;
        b.y -= offsetY;
      }
    }
  }
}

function maybeAdvance() {
  if (transitioning || finalScreen.classList.contains("is-visible")) return;
  const enoughMissing = aliveRatio() <= ADVANCE_ALIVE_RATIO;
  const enoughSeparated = largestAliveIslandRatio() <= ADVANCE_ISLAND_RATIO;
  const enoughDamaged = tearDamageRatio() >= ADVANCE_DAMAGE_RATIO;
  if (!enoughMissing && !enoughSeparated && !enoughDamaged) return;

  transitioning = true;
  unpinAll();

  setTimeout(() => {
    stageIndex += 1;
    if (stageIndex >= stageImages.length) {
      showFinal();
      return;
    }

    buildCloth();
    wake(60);
    transitioning = false;
  }, ADVANCE_DELAY);
}

function coverDraw(image) {
  ctx.drawImage(image, page.x, page.y, page.w, page.h);
}

function triangleMap(g, source, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
  const denom = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (Math.abs(denom) < 0.0001) return;

  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denom;
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denom;
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denom;
  const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denom;
  const e = (dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0)) / denom;
  const f = (dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0)) / denom;

  g.save();
  g.beginPath();
  g.moveTo(dx0, dy0);
  g.lineTo(dx1, dy1);
  g.lineTo(dx2, dy2);
  g.closePath();
  g.clip();
  g.transform(a, b, c, d, e, f);
  g.drawImage(source, 0, 0);
  g.restore();
}

function drawCell(cell) {
  if (!cell.alive) return;
  const tl = points[pointIndex(cell.x, cell.y)];
  const tr = points[pointIndex(cell.x + 1, cell.y)];
  const bl = points[pointIndex(cell.x, cell.y + 1)];
  const br = points[pointIndex(cell.x + 1, cell.y + 1)];

  const sx = (cell.x / COLS) * baseW;
  const sy = (cell.y / ROWS) * baseH;
  const sx2 = ((cell.x + 1) / COLS) * baseW;
  const sy2 = ((cell.y + 1) / ROWS) * baseH;

  const texture = stageImages[stageIndex];
  triangleMap(ctx, texture, sx, sy, sx2, sy, sx, sy2, tl.x, tl.y, tr.x, tr.y, bl.x, bl.y);
  triangleMap(ctx, texture, sx2, sy, sx2, sy2, sx, sy2, tr.x, tr.y, br.x, br.y, bl.x, bl.y);
}

function drawScene() {
  ctx.clearRect(0, 0, viewW, viewH);
  const backing = stageImages[stageIndex + 1] || finalImage;
  if (backing) coverDraw(backing);

  for (const cell of cells) {
    drawCell(cell);
  }
}

function showFinal() {
  canvas.style.pointerEvents = "none";
  finalScreen.classList.add("is-visible");
  transitioning = false;
}

function resetExperience() {
  finalScreen.classList.remove("is-visible");
  canvas.style.pointerEvents = "auto";
  stageIndex = 0;
  transitioning = false;
  pointer.down = false;
  buildCloth();
  drawScene();
  wake(30);
}

function wake(frames = 80) {
  activeFrames = Math.max(activeFrames, frames);
}

function frame() {
  if (pointer.down && performance.now() - pointer.lastAt > 1800) {
    pointer.down = false;
  }

  if (!finalScreen.classList.contains("is-visible")) {
    if (pointer.down || transitioning || activeFrames > 0) {
      stepPhysics();
      maybeAdvance();
      drawScene();
      activeFrames = Math.max(0, activeFrames - 1);
    }
  }

  requestAnimationFrame(frame);
}

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.x = event.clientX - rect.left;
  pointer.y = event.clientY - rect.top;
}

canvas.addEventListener("pointerdown", (event) => {
  setPointer(event);
  pointer.down = true;
  pointer.button = event.button;
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.lastAt = performance.now();
  tearAround(pointer.x, pointer.y, CUT_RADIUS * 0.45);
  wake(70);
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointer.down) {
    setPointer(event);
    return;
  }

  setPointer(event);
  pointer.lastAt = performance.now();
  wake(80);
  event.preventDefault();
});

canvas.addEventListener("pointerup", (event) => {
  pointer.down = false;
  pointer.lastAt = performance.now();
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch (_) {
    // The browser may already release capture if the pointer leaves the tab.
  }
});

canvas.addEventListener("pointercancel", () => {
  pointer.down = false;
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());
resetButton.addEventListener("click", resetExperience);

window.addEventListener("resize", async () => {
  if (getAssetKey() !== activeAssetKey) {
    loading.classList.remove("is-hidden");
    await loadAssetSet();
    setupCanvas();
    resetExperience();
    loading.classList.add("is-hidden");
    return;
  }

  setupCanvas();
  drawScene();
  wake(20);
});

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r") {
    resetExperience();
  }
});

function getAssetKey() {
  return window.matchMedia(MOBILE_QUERY).matches ? "mobile" : "desktop";
}

async function loadAssetSet() {
  activeAssetKey = getAssetKey();
  const assets = assetSets[activeAssetKey];
  baseW = assets.width;
  baseH = assets.height;
  finalScreenImage.src = assets.final;
  [stageImages, finalImage] = await Promise.all([
    Promise.all(assets.stages.map(loadImage)),
    loadImage(assets.final),
  ]);
}

async function init() {
  await loadAssetSet();
  setupCanvas();
  drawScene();
  loading.classList.add("is-hidden");
  requestAnimationFrame(frame);
}

init().catch((error) => {
  loading.textContent = "Could not load images";
  console.error(error);
});

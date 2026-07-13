const canvas = document.getElementById('background-coral');
const ctx = canvas.getContext('2d');

let centerX, centerY, radius;
let seeds = [];         // ridge start points {x, y, steps} — stable across frames
let time = 0;

// Configuration
const ROTATION_OFFSET = (69 * Math.PI) / 180;
const DRIFT_RATE = 0.00335;   // matches the original's slow, gentle drift (per second)
const NOISE_SCALE = 0.025;

// Time-varying flow grid. Every ridge is re-traced every frame so the whole
// field drifts uniformly (the original look), but the per-step direction comes
// from this cheap grid instead of evaluating noise() per point — a few thousand
// trig calls per frame total, rather than millions.
const GRID = 40;                       // cells per axis
const GRID_PTS = GRID + 1;             // vertices per axis
let gridDX = new Float32Array(GRID_PTS * GRID_PTS);  // unit step vectors
let gridDY = new Float32Array(GRID_PTS * GRID_PTS);
let lastTime = 0;

ctx.lineCap = 'round';
ctx.lineJoin = 'round';

function applyStroke(c) {
    c.lineWidth = canvas.width * 0.0015;
    c.strokeStyle = 'rgba(28, 27, 24, 0.5)';
}

// Handle Resize
function resizeCanvas() {
    // We want the drawing to occupy about 90% of the smallest screen dimension
    const displaySize = Math.min(window.innerWidth, window.innerHeight) * 0.9;

    // High DPI support (Retina displays) - capped at 2x for performance
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Set internal resolution
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;

    // Set CSS display size
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;

    // Normalize coordinate system logic
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
    radius = canvas.width * 0.42;

    generateSeeds();
}

// Simplex-ish noise approximation (time-varying — this is what makes it move).
// Only ever evaluated at grid vertices, not per ridge point.
function noise(x, y, t) {
    const s = 0.015 * (800 / canvas.width);

    return Math.sin(x * s + t) * Math.cos(y * s + t * 0.8) * 100 +
           Math.sin(x * s * 2.3 + t * 0.7) * Math.cos(y * s * 1.8 + t * 0.6) * 60;
}

// Refresh the flow grid for the current time: each vertex stores the unit
// step direction the ridge tracing should follow there.
function updateFlowGrid(t) {
    const cw = canvas.width / GRID;
    const ch = canvas.height / GRID;
    let idx = 0;
    for (let j = 0; j < GRID_PTS; j++) {
        const py = j * ch;
        for (let i = 0; i < GRID_PTS; i++) {
            const angle = noise(i * cw, py, t) * NOISE_SCALE;
            gridDX[idx] = Math.cos(angle);
            gridDY[idx] = Math.sin(angle);
            idx++;
        }
    }
}

function inCircle(x, y) {
    const dx = x - centerX;
    const dy = y - centerY;
    return dx*dx + dy*dy < radius*radius;
}

// Walk one ridge, taking each step's direction from the flow grid (bilinear,
// no trig). Emits straight into the shared Path2D.
function traceRidgeInto(path, startX, startY, maxSteps) {
    let x = startX;
    let y = startY;

    const stepSize = canvas.width * 0.006;
    const sx = GRID / canvas.width;
    const sy = GRID / canvas.height;

    path.moveTo(x, y);

    for (let i = 0; i < maxSteps; i++) {
        if (!inCircle(x, y)) break;

        // Sample the flow grid at (x, y)
        let gx = x * sx;
        let gy = y * sy;
        let i0 = gx | 0;
        let j0 = gy | 0;
        if (i0 < 0) i0 = 0; else if (i0 >= GRID) i0 = GRID - 1;
        if (j0 < 0) j0 = 0; else if (j0 >= GRID) j0 = GRID - 1;
        const fx = gx - i0;
        const fy = gy - j0;

        const r0 = j0 * GRID_PTS + i0;
        const r1 = r0 + GRID_PTS;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;

        const dx = gridDX[r0] * w00 + gridDX[r0 + 1] * w10 + gridDX[r1] * w01 + gridDX[r1 + 1] * w11;
        const dy = gridDY[r0] * w00 + gridDY[r0 + 1] * w10 + gridDY[r1] * w01 + gridDY[r1 + 1] * w11;

        x += dx * stepSize;
        y += dy * stepSize;
        path.lineTo(x, y);
    }
}

function generateSeeds() {
    seeds = [];

    // 1. Concentric ridges
    for (let r = 15; r < radius; r += 12) { // Increased density: 15 -> 12
        const circumference = 2 * Math.PI * r;
        const density = Math.max(25, radius / 12); // Increased: 30 -> 25, /10 -> /12
        const numPoints = Math.floor(circumference / density);

        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2 + ROTATION_OFFSET;
            const offsetAngle = angle + (Math.random() - 0.5) * 0.6;
            const offsetR = r + (Math.random() - 0.5) * (radius * 0.05);

            const startX = centerX + Math.cos(offsetAngle) * offsetR;
            const startY = centerY + Math.sin(offsetAngle) * offsetR;

            const baseSteps = radius * 0.35;
            const stepVariation = baseSteps + Math.floor((Math.random() - 0.5) * (baseSteps * 0.4));

            seeds.push({ x: startX, y: startY, steps: stepVariation });
        }
    }

    // 2. Random fill ridges
    const fillCount = Math.floor(radius / 2); // Increased: /3 -> /2
    for (let i = 0; i < fillCount; i++) {
        const angle = Math.random() * Math.PI * 2 + ROTATION_OFFSET;
        const r = Math.random() * radius * 0.9;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        const baseSteps = radius * 0.3;
        const stepVariation = baseSteps + Math.floor((Math.random() - 0.5) * (baseSteps * 0.4));
        seeds.push({ x, y, steps: stepVariation });
    }
}

function animate(now) {
    requestAnimationFrame(animate);

    const dt = lastTime ? (now - lastTime) / 1000 : 0.016;
    lastTime = now;
    time += dt * DRIFT_RATE;

    updateFlowGrid(time);

    // Re-trace the whole field at the new time, into one path, one stroke.
    const path = new Path2D();
    for (let k = 0; k < seeds.length; k++) {
        const s = seeds[k];
        traceRidgeInto(path, s.x, s.y, s.steps);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    applyStroke(ctx);
    ctx.stroke(path);
    ctx.restore();
}

// Start
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(animate);

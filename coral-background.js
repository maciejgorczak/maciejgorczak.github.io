const canvas = document.getElementById('background-coral');
const ctx = canvas.getContext('2d');

let centerX, centerY, radius;
let startingPoints = [];
let mouseX = -1000; // Start off-screen
let mouseY = -1000;
let time = 0;

// Configuration
const ROTATION_OFFSET = (69 * Math.PI) / 180;

// Canvas setup
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// Track mouse relative to canvas
window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
});

// Handle Resize
function resizeCanvas() {
    // We want the drawing to occupy about 90% of the smallest screen dimension
    const displaySize = Math.min(window.innerWidth, window.innerHeight) * 0.9;

    // High DPI support (Retina displays)
    const dpr = window.devicePixelRatio || 1;

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

    generatePoints();
}

function generatePoints() {
    startingPoints = [];

    // 1. Concentric ridges
    for (let r = 15; r < radius; r += 15) {
        const circumference = 2 * Math.PI * r;
        const density = Math.max(30, radius / 10);
        const numPoints = Math.floor(circumference / density);

        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2 + ROTATION_OFFSET;
            const offsetAngle = angle + (Math.random() - 0.5) * 0.6;
            const offsetR = r + (Math.random() - 0.5) * (radius * 0.05);

            const startX = centerX + Math.cos(offsetAngle) * offsetR;
            const startY = centerY + Math.sin(offsetAngle) * offsetR;

            const baseSteps = radius * 0.35;
            const stepVariation = baseSteps + Math.floor((Math.random() - 0.5) * (baseSteps * 0.4));

            startingPoints.push({x: startX, y: startY, steps: stepVariation});
        }
    }

    // 2. Random fill ridges
    const fillCount = Math.floor(radius / 3);
    for (let i = 0; i < fillCount; i++) {
        const angle = Math.random() * Math.PI * 2 + ROTATION_OFFSET;
        const r = Math.random() * radius * 0.9;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        const baseSteps = radius * 0.3;
        const stepVariation = baseSteps + Math.floor((Math.random() - 0.5) * (baseSteps * 0.4));
        startingPoints.push({x, y, steps: stepVariation});
    }
}

// Simplex-ish noise approximation
function noise(x, y, t) {
    const s = 0.015 * (800 / canvas.width);

    return Math.sin(x * s + t) * Math.cos(y * s + t * 0.8) * 100 +
           Math.sin(x * s * 2.3 + t * 0.7) * Math.cos(y * s * 1.8 + t * 0.6) * 60;
}

function inCircle(x, y) {
    const dx = x - centerX;
    const dy = y - centerY;
    return dx*dx + dy*dy < radius*radius;
}

function drawRidge(startX, startY, maxSteps, t) {
    let x = startX;
    let y = startY;

    const stepSize = canvas.width * 0.006;
    const noiseScale = 0.025;

    const interactRadius = radius * 0.35;
    const interactRadiusSq = interactRadius * interactRadius;

    ctx.beginPath();
    ctx.moveTo(x, y);

    for (let i = 0; i < maxSteps; i++) {
        if (!inCircle(x, y)) break;

        let angle = noise(x, y, t) * noiseScale;

        // Mouse interaction
        const dx = x - mouseX;
        const dy = y - mouseY;
        const distSq = dx*dx + dy*dy;

        if (distSq < interactRadiusSq) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / interactRadius);
            const pushAngle = Math.atan2(dy, dx);
            angle += (pushAngle - angle) * force * 0.8;
        }

        x += Math.cos(angle) * stepSize;
        y += Math.sin(angle) * stepSize;

        ctx.lineTo(x, y);
    }

    ctx.lineWidth = canvas.width * 0.0015;
    ctx.strokeStyle = 'rgba(26, 26, 26, 0.5)';
    ctx.stroke();
}

let lastTime = performance.now();

function animate(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Clip to Circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    // Draw
    for (let point of startingPoints) {
        drawRidge(point.x, point.y, point.steps, time);
    }

    ctx.restore();

    // Animate time (keeping the same slow speed)
    time += deltaTime * 0.00335;
    requestAnimationFrame(animate);
}

// Start
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(animate);

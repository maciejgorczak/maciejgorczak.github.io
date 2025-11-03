const canvas = document.getElementById('background-coral');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.9;
    canvas.width = size;
    canvas.height = size;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let centerX = canvas.width / 2;
let centerY = canvas.height / 2;
let radius = canvas.width * 0.42;

let time = 0;

ctx.lineCap = 'round';
ctx.lineJoin = 'round';

function noise(x, y, t) {
    const s = 0.015;
    return Math.sin(x * s + t) * Math.cos(y * s + t * 0.8) * 100 +
           Math.sin(x * s * 2.3 + t * 0.7) * Math.cos(y * s * 1.8 + t * 0.6) * 60;
}

function inCircle(x, y) {
    const dx = x - centerX;
    const dy = y - centerY;
    return dx*dx + dy*dy < radius*radius;
}

function drawRidge(startX, startY, maxSteps, t) {
    ctx.beginPath();
    ctx.moveTo(startX, startY);

    let x = startX;
    let y = startY;

    for (let i = 0; i < maxSteps; i++) {
        if (!inCircle(x, y)) break;

        const angle = noise(x, y, t) * 0.025;
        x += Math.cos(angle) * 2.5;
        y += Math.sin(angle) * 2.5;

        ctx.lineTo(x, y);
    }

    ctx.stroke();
}

const startingPoints = [];
const rotationOffset = (69 * Math.PI) / 180; // 69 degrees in radians

// Concentric ridges - 20% more than before
for (let r = 15; r < radius; r += 15) {
    const circumference = 2 * Math.PI * r;
    const numPoints = Math.floor(circumference / 23);

    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2 + rotationOffset;
        const offsetAngle = angle + (Math.random() - 0.5) * 0.6;
        const offsetR = r + (Math.random() - 0.5) * 15;
        const startX = centerX + Math.cos(offsetAngle) * offsetR;
        const startY = centerY + Math.sin(offsetAngle) * offsetR;
        const stepVariation = 100 + Math.floor((Math.random() - 0.5) * 40);
        startingPoints.push({x: startX, y: startY, steps: stepVariation});
    }
}

// Random fill ridges - 20% more (was 150, now 180)
for (let i = 0; i < 180; i++) {
    const angle = Math.random() * Math.PI * 2 + rotationOffset;
    const r = Math.random() * radius * 0.9;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    const stepVariation = 80 + Math.floor((Math.random() - 0.5) * 40);
    startingPoints.push({x, y, steps: stepVariation});
}

let lastTime = performance.now();

function animate(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Create circular clipping path
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 0.9;

    // Draw all ridges with animated time parameter
    for (let point of startingPoints) {
        drawRidge(point.x, point.y, point.steps, time);
    }

    ctx.restore();

    time += deltaTime * 0.00335;
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

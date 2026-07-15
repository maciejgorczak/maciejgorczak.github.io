// Grid & Signal — home visual.
// Stacked signal traces on a grid: thin ink polylines, sum-of-sines, one
// vermilion channel, slow phase drift. Reads palette from CSS vars so it
// follows light/dark. Honors prefers-reduced-motion (renders one static frame).
(function () {
    const canvas = document.getElementById('signal');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const TRACES = 9;                 // stacked channels
    const ACCENT_TRACE = 3;           // which channel is the signal (0-indexed)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0, H = 0, ink = '#14161a', accent = '#e4380d';

    function readColors() {
        const cs = getComputedStyle(document.documentElement);
        ink = cs.getPropertyValue('--ink').trim() || ink;
        accent = cs.getPropertyValue('--accent').trim() || accent;
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        W = rect.width;
        H = rect.height;
    }

    function draw(t) {
        ctx.clearRect(0, 0, W, H);
        const pad = W * 0.1;
        const left = pad, right = W - pad;
        const top = H * 0.08, bottom = H * 0.92;
        const gap = (bottom - top) / (TRACES - 1);
        const amp = gap * 0.42;
        const step = Math.max(6, W / 90);

        for (let i = 0; i < TRACES; i++) {
            const baseY = top + i * gap;
            const isAccent = i === ACCENT_TRACE;
            const f1 = 0.9 + i * 0.18;
            const f2 = 2.3 - i * 0.11;
            const phase = t * 0.00022 * (1 + i * 0.06) + i * 1.7;

            ctx.beginPath();
            for (let x = left; x <= right; x += step) {
                const u = (x - left) / (right - left);
                const y = baseY
                    + Math.sin(u * Math.PI * 2 * f1 + phase) * amp * 0.6
                    + Math.sin(u * Math.PI * 2 * f2 + phase * 1.4) * amp * 0.4;
                x === left ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.strokeStyle = isAccent ? accent : ink;
            ctx.globalAlpha = isAccent ? 1 : 0.36;
            ctx.lineWidth = isAccent ? 1.6 : 1;
            ctx.stroke();
        }

        // Marker riding the accent trace
        const baseY = top + ACCENT_TRACE * gap;
        const u = (Math.sin(t * 0.00018) + 1) / 2;
        const x = left + u * (right - left);
        const f1 = 0.9 + ACCENT_TRACE * 0.18, f2 = 2.3 - ACCENT_TRACE * 0.11;
        const phase = t * 0.00022 * (1 + ACCENT_TRACE * 0.06) + ACCENT_TRACE * 1.7;
        const y = baseY
            + Math.sin(u * Math.PI * 2 * f1 + phase) * amp * 0.6
            + Math.sin(u * Math.PI * 2 * f2 + phase * 1.4) * amp * 0.4;
        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }

    let raf = 0;
    function loop(t) { draw(t); raf = requestAnimationFrame(loop); }

    function start() {
        readColors();
        resize();
        if (reduce) { draw(4200); return; }   // one representative static frame
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', () => { resize(); if (reduce) draw(4200); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        readColors(); if (reduce) draw(4200);
    });
    start();
})();

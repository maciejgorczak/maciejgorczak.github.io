// Grid & Signal — home visual, V1 "Instrument readout".
// Idle: stacked signal traces, as before. On hover/touch-scrub the plate
// becomes an instrument: a crosshair follows the pointer, the olive channel
// carries the career timeline (earliest on the left, latest on the right),
// the active era's segment draws heavy, and a mono readout at the foot of
// the plate names the era. Reads palette from CSS vars, honors
// prefers-reduced-motion (static traces; interaction still redraws frames).
(function () {
    const canvas = document.getElementById('signal');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const TRACES = 9;                 // stacked channels
    const ACCENT_TRACE = 3;           // which channel is the signal (0-indexed)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STATIC_T = 4200;            // representative frame under reduced motion

    // Career timeline riding the accent trace. BOUNDS are the u-positions
    // (0..1 along the line) where each era starts; blended between
    // proportional-to-time and even spacing so short eras stay hoverable.
    const CAREER = [
        { years: '2019 — 2022', role: 'BI Engineer / Consultant', org: 'Lingaro · Accenture · Swintt · Printify' },
        { years: '2022 — 2023', role: 'BI Engineer', org: 'Glitnor Group' },
        { years: '2023 — 2025', role: 'BI Product Manager', org: 'Printify' },
        { years: '2025 — 2026', role: 'Engineering Manager, Data & AI', org: 'Allegro' },
        { years: '2026 — now', role: 'Product Engineering Manager, AI Platform', org: 'Simployer' },
    ];
    const BOUNDS = [0, 0.33, 0.47, 0.695, 0.88, 1];

    let W = 0, H = 0, ink = '#14161a', accent = '#e4380d', inkMuted = '#605c48';
    let hoverP = 0;          // 0 idle → 1 fully in timeline mode
    let active = false;      // pointer currently engaged
    let pointerU = 0.5;      // pointer position along the line, 0..1
    let touchTimer = 0;

    function readColors() {
        const cs = getComputedStyle(document.documentElement);
        ink = cs.getPropertyValue('--ink').trim() || ink;
        accent = cs.getPropertyValue('--accent').trim() || accent;
        inkMuted = cs.getPropertyValue('--ink-muted').trim() || inkMuted;
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

    function eraIndex(u) {
        for (let i = CAREER.length - 1; i > 0; i--) if (u >= BOUNDS[i]) return i;
        return 0;
    }

    function traceY(i, u, t, baseY, amp) {
        const f1 = 0.9 + i * 0.18;
        const f2 = 2.3 - i * 0.11;
        const phase = t * 0.00022 * (1 + i * 0.06) + i * 1.7;
        return baseY
            + Math.sin(u * Math.PI * 2 * f1 + phase) * amp * 0.6
            + Math.sin(u * Math.PI * 2 * f2 + phase * 1.4) * amp * 0.4;
    }

    function strokeTrace(i, t, left, right, baseY, amp, step, u0, u1) {
        ctx.beginPath();
        const x0 = left + u0 * (right - left);
        const x1 = left + u1 * (right - left);
        for (let x = x0; x <= x1 + 0.001; x += step) {
            const xx = Math.min(x, x1);
            const u = (xx - left) / (right - left);
            const y = traceY(i, u, t, baseY, amp);
            xx === x0 ? ctx.moveTo(xx, y) : ctx.lineTo(xx, y);
        }
        ctx.stroke();
    }

    function draw(t) {
        ctx.clearRect(0, 0, W, H);
        const pad = W * 0.1;
        const left = pad, right = W - pad;
        const top = H * 0.08, bottom = H * 0.92;
        const gap = (bottom - top) / (TRACES - 1);
        const amp = gap * 0.42;
        const step = Math.max(6, W / 90);
        const p = hoverP;
        const idx = eraIndex(pointerU);
        const accBaseY = top + ACCENT_TRACE * gap;

        // Background channels recede while reading the timeline
        for (let i = 0; i < TRACES; i++) {
            if (i === ACCENT_TRACE) continue;
            ctx.strokeStyle = ink;
            ctx.globalAlpha = 0.36 - 0.24 * p;
            ctx.lineWidth = 1;
            strokeTrace(i, t, left, right, top + i * gap, amp, step, 0, 1);
        }

        // Accent channel: whole line, then the active era drawn heavy
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 1 - 0.6 * p;
        ctx.lineWidth = 1.6;
        strokeTrace(ACCENT_TRACE, t, left, right, accBaseY, amp, step, 0, 1);
        if (p > 0.01) {
            ctx.globalAlpha = p;
            ctx.lineWidth = 2.2;
            strokeTrace(ACCENT_TRACE, t, left, right, accBaseY, amp, step, BOUNDS[idx], BOUNDS[idx + 1]);
        }

        // Era ticks on the accent channel
        if (p > 0.01) {
            for (let i = 0; i < CAREER.length; i++) {
                const u = BOUNDS[i];
                const x = left + u * (right - left);
                const y = traceY(ACCENT_TRACE, u, t, accBaseY, amp);
                ctx.globalAlpha = p * (i === idx ? 1 : 0.55);
                ctx.fillStyle = i === idx ? accent : ink;
                const s = i === idx ? 5 : 3.5;
                ctx.fillRect(x - s / 2, y - s / 2, s, s);
            }
        }

        // Crosshair + marker riding the pointer (or drifting when idle)
        let u, mSize;
        if (p > 0.01 || active) {
            u = pointerU;
            mSize = 6;
        } else {
            u = (Math.sin(t * 0.00018) + 1) / 2;
            mSize = 5;
        }
        const mx = left + u * (right - left);
        const my = traceY(ACCENT_TRACE, u, t, accBaseY, amp);
        if (p > 0.01) {
            ctx.globalAlpha = 0.18 * p;
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(mx, top);
            ctx.lineTo(mx, bottom);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        ctx.fillRect(mx - mSize / 2, my - mSize / 2, mSize, mSize);

        // Readout at the foot of the plate
        if (p > 0.01) {
            const era = CAREER[idx];
            const rx = left;
            let ry = bottom - 34;
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            ctx.globalAlpha = p;
            ctx.fillStyle = inkMuted;
            ctx.font = '500 10px "IBM Plex Mono", monospace';
            ctx.fillText(era.years.toUpperCase() + '  ·  ' + era.org.toUpperCase(), rx, ry);
            ry += 20;
            ctx.fillStyle = ink;
            ctx.font = '500 15px "Space Grotesk", sans-serif';
            ctx.fillText(era.role, rx, ry);
        }
        ctx.globalAlpha = 1;
    }

    // --- interaction -------------------------------------------------------
    function setPointer(e) {
        const rect = canvas.getBoundingClientRect();
        const pad = rect.width * 0.1;
        const x = e.clientX - rect.left;
        pointerU = Math.min(1, Math.max(0, (x - pad) / (rect.width - 2 * pad)));
    }

    function engage(e) {
        clearTimeout(touchTimer);
        setPointer(e);
        active = true;
        if (reduce) { hoverP = 1; draw(STATIC_T); }
    }

    function release(delay) {
        clearTimeout(touchTimer);
        touchTimer = setTimeout(() => {
            active = false;
            if (reduce) { hoverP = 0; draw(STATIC_T); }
        }, delay);
    }

    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') engage(e); });
    canvas.addEventListener('pointerdown', engage);
    canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse' || active) {
            engage(e);
            if (reduce) draw(STATIC_T);
        }
    });
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') release(0); });
    canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') release(2200); });
    canvas.addEventListener('pointercancel', () => release(0));

    // --- loop --------------------------------------------------------------
    let raf = 0;
    function loop(t) {
        hoverP += ((active ? 1 : 0) - hoverP) * 0.12;
        if (hoverP < 0.005) hoverP = 0;
        if (hoverP > 0.995) hoverP = 1;
        draw(t);
        raf = requestAnimationFrame(loop);
    }

    function start() {
        readColors();
        resize();
        if (reduce) { draw(STATIC_T); return; }   // static frame; interaction redraws on demand
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', () => { resize(); if (reduce) draw(STATIC_T); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        readColors(); if (reduce) draw(STATIC_T);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (reduce) draw(STATIC_T); });
    start();
})();

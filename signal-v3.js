// Grid & Signal — home visual, V3 "Timeline takeover".
// Idle: stacked signal traces, as before. On hover/touch the plate quietly
// reorganizes: the background channels recede to a whisper, the olive
// channel settles toward a calm survey line with year ticks beneath it,
// and a large annotation in the top-left names the era under the pointer
// (earliest on the left, latest on the right). Leaving the plate lets the
// signal reassemble. Reads palette from CSS vars, honors
// prefers-reduced-motion (static traces; interaction still redraws frames).
(function () {
    const canvas = document.getElementById('signal');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const TRACES = 9;
    const ACCENT_TRACE = 3;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STATIC_T = 4200;

    const CAREER = [
        { tick: '2019', years: '2019 — 2022', role: 'BI Engineer / Consultant', org: 'Lingaro · Accenture · Swintt · Printify' },
        { tick: '2022', years: '2022 — 2023', role: 'BI Engineer', org: 'Glitnor Group' },
        { tick: '2023', years: '2023 — 2025', role: 'BI Product Manager', org: 'Printify' },
        { tick: '2025', years: '2025 — 2026', role: 'Engineering Manager, Data & AI', org: 'Allegro' },
        { tick: '2026', years: '2026 — now', role: 'Product Eng. Manager, AI Platform', org: 'Simployer' },
    ];
    const BOUNDS = [0, 0.33, 0.47, 0.695, 0.88, 1];

    let W = 0, H = 0, ink = '#14161a', accent = '#e4380d', inkMuted = '#605c48';
    let hoverP = 0, active = false, pointerU = 0.5, touchTimer = 0;

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

    // Accent trace morphs between its signal shape and a calm timeline:
    // baseY glides toward 66% height, amplitude and frequency soften.
    function accentY(u, t, geom) {
        const p = hoverP;
        const baseY = geom.accBase + (H * 0.66 - geom.accBase) * p;
        const amp = geom.amp * (1 - 0.72 * p);
        const f1 = 0.9 + ACCENT_TRACE * 0.18;
        const f2 = 2.3 - ACCENT_TRACE * 0.11;
        const phase = t * 0.00022 * (1 + ACCENT_TRACE * 0.06) + ACCENT_TRACE * 1.7;
        const wobble = Math.sin(u * Math.PI * 2 * f1 + phase) * amp * 0.6
            + Math.sin(u * Math.PI * 2 * f2 + phase * 1.4) * amp * 0.4;
        const calm = Math.sin(u * Math.PI * 2 * 0.7 + phase * 0.5) * amp * 0.5;
        return baseY + wobble * (1 - p) + calm * p;
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
        const geom = { accBase: top + ACCENT_TRACE * gap, amp };

        // Background channels recede to a whisper
        for (let i = 0; i < TRACES; i++) {
            if (i === ACCENT_TRACE) continue;
            const baseY = top + i * gap;
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
            ctx.strokeStyle = ink;
            ctx.globalAlpha = 0.36 - 0.29 * p;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Accent channel, morphing toward the survey line
        ctx.beginPath();
        for (let x = left; x <= right; x += step) {
            const u = (x - left) / (right - left);
            const y = accentY(u, t, geom);
            x === left ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.6 + 0.4 * p;
        ctx.stroke();

        // Era ticks and year labels beneath the line
        if (p > 0.01) {
            ctx.font = '500 9px "IBM Plex Mono", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            for (let i = 0; i < CAREER.length; i++) {
                const u = BOUNDS[i];
                const x = left + u * (right - left);
                const y = accentY(u, t, geom);
                const isActive = i === idx;
                ctx.globalAlpha = p * (isActive ? 1 : 0.5);
                ctx.strokeStyle = isActive ? accent : ink;
                ctx.lineWidth = isActive ? 1.6 : 1;
                ctx.beginPath();
                ctx.moveTo(x, y + 6);
                ctx.lineTo(x, y + 16);
                ctx.stroke();
                ctx.fillStyle = isActive ? ink : inkMuted;
                ctx.fillText(CAREER[i].tick, x - 1, y + 30);
            }
        }

        // Marker riding the line
        let u;
        if (p > 0.01 || active) u = pointerU;
        else u = (Math.sin(t * 0.00018) + 1) / 2;
        const mx = left + u * (right - left);
        const my = accentY(u, t, geom);
        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        const ms = 5 + 2 * p;
        ctx.fillRect(mx - ms / 2, my - ms / 2, ms, ms);

        // Era annotation, top-left, like a chart caption
        if (p > 0.01) {
            const era = CAREER[idx];
            const ax = left;
            let ay = top + 26;
            ctx.globalAlpha = p;
            ctx.textAlign = 'left';
            ctx.fillStyle = ink;
            ctx.font = '500 26px "Space Grotesk", sans-serif';
            ctx.fillText(era.years, ax, ay);
            ay += 22;
            ctx.fillStyle = ink;
            ctx.font = '500 10.5px "IBM Plex Mono", monospace';
            ctx.fillText(era.role.toUpperCase(), ax, ay);
            ay += 16;
            ctx.fillStyle = inkMuted;
            ctx.font = '500 9.5px "IBM Plex Mono", monospace';
            ctx.fillText(era.org.toUpperCase(), ax, ay);
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
        if (reduce) { draw(STATIC_T); return; }
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', () => { resize(); if (reduce) draw(STATIC_T); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        readColors(); if (reduce) draw(STATIC_T);
    });
    start();
})();

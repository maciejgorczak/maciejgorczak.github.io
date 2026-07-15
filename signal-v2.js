// Grid & Signal — home visual, V2 "Milestone nodes".
// Idle: stacked signal traces with faint milestone nodes on the olive
// channel. Hover/touch-scrub selects the nearest career era: the line
// brightens from the left edge up to the active node (career progress),
// the node grows, and a small survey-card tooltip names the era. Tooltip
// is a DOM element styled with the brand tokens. Honors
// prefers-reduced-motion (static traces; interaction still redraws frames).
(function () {
    const canvas = document.getElementById('signal');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const plate = canvas.parentElement;

    const TRACES = 9;
    const ACCENT_TRACE = 3;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STATIC_T = 4200;

    const CAREER = [
        { years: '2019 — 2022', role: 'BI Engineer / Consultant', org: 'Lingaro · Accenture · Swintt · Printify' },
        { years: '2022 — 2023', role: 'BI Engineer', org: 'Glitnor Group' },
        { years: '2023 — 2025', role: 'BI Product Manager', org: 'Printify' },
        { years: '2025 — 2026', role: 'Engineering Manager, Data & AI', org: 'Allegro' },
        { years: '2026 — now', role: 'Product Engineering Manager, AI Platform', org: 'Simployer' },
    ];
    // Node positions along the line (u, 0..1), earliest → latest
    const NODES = [0.06, 0.4, 0.575, 0.79, 0.94];

    let W = 0, H = 0, ink = '#14161a', accent = '#e4380d';
    let hoverP = 0, active = false, pointerU = 0.5, touchTimer = 0;

    // Tooltip card
    const tip = document.createElement('div');
    tip.className = 'signal-tip';
    tip.setAttribute('aria-hidden', 'true');
    tip.innerHTML = '<span class="signal-tip-years"></span><span class="signal-tip-role"></span><span class="signal-tip-org"></span>';
    if (plate) { plate.style.position = 'relative'; plate.appendChild(tip); }
    const tipYears = tip.children[0], tipRole = tip.children[1], tipOrg = tip.children[2];

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

    function nearestNode(u) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < NODES.length; i++) {
            const d = Math.abs(u - NODES[i]);
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
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

    let lastGeom = null;
    function draw(t) {
        ctx.clearRect(0, 0, W, H);
        const pad = W * 0.1;
        const left = pad, right = W - pad;
        const top = H * 0.08, bottom = H * 0.92;
        const gap = (bottom - top) / (TRACES - 1);
        const amp = gap * 0.42;
        const step = Math.max(6, W / 90);
        const p = hoverP;
        const idx = nearestNode(pointerU);
        const accBaseY = top + ACCENT_TRACE * gap;
        lastGeom = { left, right, accBaseY, amp, t, idx };

        for (let i = 0; i < TRACES; i++) {
            if (i === ACCENT_TRACE) continue;
            ctx.strokeStyle = ink;
            ctx.globalAlpha = 0.36 - 0.22 * p;
            ctx.lineWidth = 1;
            strokeTrace(i, t, left, right, top + i * gap, amp, step, 0, 1);
        }

        // Accent channel: full line thins, career-so-far draws heavy
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 1 - 0.55 * p;
        ctx.lineWidth = 1.6;
        strokeTrace(ACCENT_TRACE, t, left, right, accBaseY, amp, step, 0, 1);
        if (p > 0.01) {
            ctx.globalAlpha = p;
            ctx.lineWidth = 2.2;
            strokeTrace(ACCENT_TRACE, t, left, right, accBaseY, amp, step, 0, NODES[idx]);
        }

        // Milestone nodes: faintly present when idle, articulated on hover
        for (let i = 0; i < NODES.length; i++) {
            const u = NODES[i];
            const x = left + u * (right - left);
            const y = traceY(ACCENT_TRACE, u, t, accBaseY, amp);
            const isActive = p > 0.01 && i === idx;
            const s = isActive ? 4 + 4 * p : 4;
            ctx.globalAlpha = isActive ? 1 : 0.45 + 0.35 * p;
            ctx.fillStyle = isActive ? accent : ink;
            ctx.fillRect(x - s / 2, y - s / 2, s, s);
            if (isActive) {
                ctx.strokeStyle = accent;
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.7 * p;
                const r = s / 2 + 4;
                ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
            }
        }

        // Marker: drifts when idle, hides while a node is selected
        if (p < 0.4) {
            const u = (Math.sin(t * 0.00018) + 1) / 2;
            const x = left + u * (right - left);
            const y = traceY(ACCENT_TRACE, u, t, accBaseY, amp);
            ctx.globalAlpha = 1 - p / 0.4;
            ctx.fillStyle = accent;
            ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
        }
        ctx.globalAlpha = 1;

        positionTip();
    }

    function positionTip() {
        if (!lastGeom || hoverP < 0.05) {
            tip.style.opacity = '0';
            tip.style.visibility = 'hidden';
            return;
        }
        const { left, right, accBaseY, amp, t, idx } = lastGeom;
        const era = CAREER[idx];
        tipYears.textContent = era.years;
        tipRole.textContent = era.role;
        tipOrg.textContent = era.org;
        const u = NODES[idx];
        const x = left + u * (right - left);
        const y = traceY(ACCENT_TRACE, u, t, accBaseY, amp);
        tip.style.visibility = 'visible';
        tip.style.opacity = String(hoverP);
        // Clamp the card inside the plate; flip below the node near the top
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let tx = x - tw / 2;
        tx = Math.max(6, Math.min(W - tw - 6, tx));
        let ty = y - th - 14;
        if (ty < 6) ty = y + 14;
        tip.style.transform = 'translate(' + Math.round(tx) + 'px,' + Math.round(ty) + 'px)';
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

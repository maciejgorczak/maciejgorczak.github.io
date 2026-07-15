// Warsaw coordinates
const WARSAW_LAT = 52.2297;
const WARSAW_LON = 21.0122;

// Cloud cover threshold for "sunny" (percentage)
const CLOUD_COVER_THRESHOLD = 25;

// Minimum consecutive hours for "more than an hour"
const MIN_SUNNY_HOURS = 2;

async function fetchWeatherData() {
    // Check cache first (cache for 1 hour)
    const cacheKey = 'sunTrackerWeatherData';
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
        const parsed = JSON.parse(cachedData);
        const cacheAge = Date.now() - parsed.timestamp;
        const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

        if (cacheAge < CACHE_DURATION) {
            console.log('Using cached weather data');
            return parsed.data;
        }
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1); // Go back 1 year

    // Use archive API for historical data
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${WARSAW_LAT}&longitude=${WARSAW_LON}&hourly=cloudcover&start_date=${formatDate(startDate)}&end_date=${formatDate(endDate)}&timezone=Europe%2FWarsaw`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather data fetch failed');
        const data = await response.json();

        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));

        return data;
    } catch (error) {
        console.error('Error fetching weather data:', error);

        // If we have cached data, use it even if expired
        if (cachedData) {
            console.log('Using expired cache due to fetch error');
            return JSON.parse(cachedData).data;
        }

        throw error;
    }
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function findLastSunnyPeriod(weatherData) {
    const hourlyData = weatherData.hourly;
    const cloudCover = hourlyData.cloudcover;
    const times = hourlyData.time;

    // Search backwards from the most recent data
    let consecutiveSunnyHours = 0;
    let lastSunnyStart = null;

    for (let i = cloudCover.length - 1; i >= 0; i--) {
        if (cloudCover[i] < CLOUD_COVER_THRESHOLD) {
            consecutiveSunnyHours++;
            if (consecutiveSunnyHours >= MIN_SUNNY_HOURS) {
                // Found the start of a sunny period
                lastSunnyStart = times[i + MIN_SUNNY_HOURS - 1]; // Warsaw-local ISO string
            }
        } else {
            consecutiveSunnyHours = 0;
        }

        if (lastSunnyStart) {
            break;
        }
    }

    return lastSunnyStart;
}

function formatTimeSince(sunnyTimeStr) {
    // sunnyTimeStr is already Warsaw-local ("2026-07-15T14:00"). Diff calendar
    // dates as UTC-midnight ("YYYY-MM-DD") strings so there's no timezone drift.
    const sunnyDay = sunnyTimeStr.slice(0, 10);
    const todayDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
    const daysDiff = Math.round((Date.parse(todayDay) - Date.parse(sunnyDay)) / 86400000);

    if (daysDiff <= 0) return 'today';        // clamp any future-edge to today
    if (daysDiff === 1) return 'yesterday';
    return `${daysDiff} days ago`;
}

function formatDateTime(date) {
    return date.toLocaleString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

async function updateDisplay() {
    const timeDisplay = document.getElementById('sun-time-display');

    try {
        const weatherData = await fetchWeatherData();
        const lastSunnyPeriod = findLastSunnyPeriod(weatherData);

        if (lastSunnyPeriod) {
            const timeSince = formatTimeSince(lastSunnyPeriod);

            // Display just the time value without extra label
            timeDisplay.innerHTML = `
                <span class="time-value">${timeSince}</span>
            `;
        } else {
            timeDisplay.innerHTML = `
                <span class="time-value">No sunny period</span>
            `;
        }
    } catch (error) {
        timeDisplay.innerHTML = `
            <span class="time-value">Unable to load data</span>
        `;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    updateDisplay();
    initSunCanvas();
});


// ===================================
// SUN CANVAS VISUALIZATION
// ===================================
function initSunCanvas() {
    const canvas = document.getElementById('sun-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let centerX, centerY, radius;

    function resizeSunCanvas() {
        const container = canvas.parentElement;
        const size = Math.min(container.offsetWidth, 400);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;

        centerX = canvas.width / 2;
        centerY = canvas.height / 2;
        radius = canvas.width * 0.42;

        drawSun();
    }

    // hex (#rrggbb) -> "r, g, b"; follows the CSS palette in light and dark
    function rgbOf(varName, fallback) {
        const hex = (getComputedStyle(document.documentElement)
            .getPropertyValue(varName).trim() || fallback).replace('#', '');
        return `${parseInt(hex.slice(0,2),16)}, ${parseInt(hex.slice(2,4),16)}, ${parseInt(hex.slice(4,6),16)}`;
    }

    function drawSun() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ink = rgbOf('--ink', '14161a');
        const accent = rgbOf('--accent', 'e4380d');

        const innerRadius = radius * 0.3;
        const outerRadius = radius * 0.95;

        // Draw radiating hatch marks (rays)
        const numRays = 48;
        for (let i = 0; i < numRays; i++) {
            const angle = (i / numRays) * Math.PI * 2;

            // Vary ray lengths for organic feel
            const lengthVariation = 0.7 + Math.random() * 0.6;
            const rayLength = (outerRadius - innerRadius) * lengthVariation;

            const startX = centerX + Math.cos(angle) * innerRadius;
            const startY = centerY + Math.sin(angle) * innerRadius;
            const endX = centerX + Math.cos(angle) * (innerRadius + rayLength);
            const endY = centerY + Math.sin(angle) * (innerRadius + rayLength);

            // Main ray
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = `rgba(${ink}, 0.4)`;
            ctx.lineWidth = canvas.width * 0.003;
            ctx.stroke();

            // Add small perpendicular hatch marks on some rays
            if (i % 3 === 0) {
                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;
                const perpAngle = angle + Math.PI / 2;
                const hatchLength = canvas.width * 0.02;

                ctx.beginPath();
                ctx.moveTo(
                    midX + Math.cos(perpAngle) * hatchLength,
                    midY + Math.sin(perpAngle) * hatchLength
                );
                ctx.lineTo(
                    midX - Math.cos(perpAngle) * hatchLength,
                    midY - Math.sin(perpAngle) * hatchLength
                );
                ctx.strokeStyle = `rgba(${ink}, 0.3)`;
                ctx.lineWidth = canvas.width * 0.002;
                ctx.stroke();
            }

            // Add dot at end of every 4th ray
            if (i % 4 === 0) {
                ctx.beginPath();
                ctx.arc(endX, endY, canvas.width * 0.006, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${ink}, 0.35)`;
                ctx.fill();
            }
        }

        // Draw dashed concentric circles
        const numCircles = 6;
        for (let i = 1; i <= numCircles; i++) {
            const r = innerRadius + (outerRadius - innerRadius) * (i / numCircles);

            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);

            // Dashed pattern
            ctx.setLineDash([canvas.width * 0.015, canvas.width * 0.01]);
            ctx.strokeStyle = `rgba(${ink}, 0.25)`;
            ctx.lineWidth = canvas.width * 0.002;
            ctx.stroke();
        }

        ctx.setLineDash([]); // Reset

        // Draw central sun circle with hatching
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ink}, 0.5)`;
        ctx.lineWidth = canvas.width * 0.004;
        ctx.stroke();

        // Cross-hatching in center
        const hatchSpacing = canvas.width * 0.025;
        for (let x = centerX - innerRadius; x < centerX + innerRadius; x += hatchSpacing) {
            for (let y = centerY - innerRadius; y < centerY + innerRadius; y += hatchSpacing) {
                const dx = x - centerX;
                const dy = y - centerY;
                if (dx*dx + dy*dy < innerRadius * innerRadius) {
                    // Diagonal hatch
                    ctx.beginPath();
                    ctx.moveTo(x - 3, y - 3);
                    ctx.lineTo(x + 3, y + 3);
                    ctx.strokeStyle = `rgba(${ink}, 0.15)`;
                    ctx.lineWidth = canvas.width * 0.001;
                    ctx.stroke();
                }
            }
        }

        // Inner solid circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius * 0.4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ink}, 0.4)`;
        ctx.lineWidth = canvas.width * 0.003;
        ctx.stroke();

        // Small center dot — the single rust accent (the "needle")
        ctx.beginPath();
        ctx.arc(centerX, centerY, canvas.width * 0.004, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent}, 0.9)`;
        ctx.fill();
    }

    resizeSunCanvas();
    window.addEventListener('resize', resizeSunCanvas);
}



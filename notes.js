/* ===================================================================
   NOTES — a tiny static blog.

   To add a post:
     1. Create  notes/posts/<slug>.md   (plain Markdown, your content)
     2. Add an entry to  notes/posts.json :
          { "slug": "<slug>", "title": "...", "date": "YYYY-MM-DD",
            "summary": "one line shown on the index" }
   That's it. Newest (by date) sorts to the top automatically.
   =================================================================== */

const MANIFEST_URL = 'notes/posts.json';
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/i;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function loadManifest() {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('manifest ' + res.status);
    const posts = await res.json();
    return posts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/* ---------- Index page ---------- */
async function renderIndex() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    try {
        const posts = await loadManifest();
        if (!posts.length) {
            list.innerHTML = '<li class="entry-loading">No notes yet — check back soon.</li>';
            return;
        }
        list.innerHTML = posts.map((p) => `
            <li class="entry-item">
                <a class="entry-link" href="note.html?p=${encodeURIComponent(p.slug)}">
                    ${p.date ? `<span class="entry-date">${escapeHtml(formatDate(p.date))}</span>` : ''}
                    <span class="entry-title">${escapeHtml(p.title || p.slug)}</span>
                    ${p.summary ? `<span class="entry-summary">${escapeHtml(p.summary)}</span>` : ''}
                </a>
            </li>`).join('');
    } catch (e) {
        list.innerHTML = '<li class="entry-loading">Couldn’t load notes right now.</li>';
    }
}

/* ---------- Single post ---------- */
async function renderPost() {
    const titleEl = document.getElementById('note-title');
    const dateEl = document.getElementById('note-date');
    const contentEl = document.getElementById('note-content');
    if (!contentEl) return;

    const slug = new URLSearchParams(location.search).get('p');

    if (!slug || !SLUG_RE.test(slug)) {
        titleEl.textContent = 'Note not found';
        contentEl.innerHTML = '<p>That note doesn’t exist. <a href="/notes.html">Back to all notes</a>.</p>';
        return;
    }

    try {
        // Metadata from the manifest, content from the markdown file.
        const [posts, mdRes] = await Promise.all([
            loadManifest().catch(() => []),
            fetch(`notes/posts/${slug}.md`, { cache: 'no-cache' }),
        ]);

        if (!mdRes.ok) throw new Error('md ' + mdRes.status);

        const meta = posts.find((p) => p.slug === slug) || {};
        const md = await mdRes.text();

        const title = meta.title || slug;
        document.title = `${title} - Maciej Górczak`;
        titleEl.textContent = title;
        dateEl.textContent = formatDate(meta.date);

        contentEl.innerHTML = marked.parse(md);
    } catch (e) {
        titleEl.textContent = 'Note not found';
        contentEl.innerHTML = '<p>Couldn’t load that note. <a href="/notes.html">Back to all notes</a>.</p>';
    }
}

const page = document.body.dataset.page;
if (page === 'notes-index') renderIndex();
else if (page === 'note-post') renderPost();

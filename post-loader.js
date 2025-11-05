// Post loader for individual blog posts
// This script loads a specific blog post based on the slug parameter

const POSTS_MANIFEST = 'blog/posts.json';

function getSlugFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('slug');
}

function parseFrontmatter(markdown) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = markdown.match(frontmatterRegex);

    if (!match) {
        return { metadata: {}, content: markdown };
    }

    const frontmatterText = match[1];
    const content = match[2];

    const metadata = {};
    frontmatterText.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
            metadata[key.trim()] = valueParts.join(':').trim();
        }
    });

    return { metadata, content };
}

async function loadPost() {
    const slug = getSlugFromURL();

    if (!slug) {
        document.getElementById('post-title').textContent = 'Post Not Found';
        document.getElementById('post-date').textContent = '';
        document.getElementById('post-body').innerHTML = '<p>No post specified.</p>';
        return;
    }

    try {
        // Load the manifest to find the post
        const manifestResponse = await fetch(POSTS_MANIFEST);
        if (!manifestResponse.ok) {
            throw new Error('Failed to load posts manifest');
        }

        const posts = await manifestResponse.json();
        const post = posts.find(p => p.slug === slug);

        if (!post) {
            throw new Error('Post not found');
        }

        // Load the markdown file
        const postResponse = await fetch(`blog/${post.file}`);
        if (!postResponse.ok) {
            throw new Error('Failed to load post content');
        }

        const markdown = await postResponse.text();
        const { metadata, content } = parseFrontmatter(markdown);

        // Update page title
        const title = metadata.title || post.title;
        document.getElementById('page-title').textContent = `${title} - Maciej Górczak`;

        // Update post title
        document.getElementById('post-title').textContent = title;

        // Update post date
        const date = new Date(metadata.date || post.date);
        const formattedDate = date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const dateElement = document.getElementById('post-date');
        dateElement.textContent = formattedDate;
        dateElement.setAttribute('datetime', metadata.date || post.date);

        // Convert markdown to HTML and update post body
        const html = marked.parse(content);
        document.getElementById('post-body').innerHTML = html;

    } catch (error) {
        console.error('Error loading post:', error);
        document.getElementById('post-title').textContent = 'Error Loading Post';
        document.getElementById('post-date').textContent = '';
        document.getElementById('post-body').innerHTML = '<p>Sorry, there was an error loading this post.</p>';
    }
}

// Load post when page loads
document.addEventListener('DOMContentLoaded', loadPost);

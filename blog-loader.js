// Blog loader for the blog index page
// This script fetches all blog posts from the posts.json manifest and displays them

const POSTS_MANIFEST = 'blog/posts.json';

async function loadBlogPosts() {
    const postsContainer = document.getElementById('blog-posts');

    try {
        const response = await fetch(POSTS_MANIFEST);
        if (!response.ok) {
            throw new Error('Failed to load posts manifest');
        }

        const posts = await response.json();

        if (posts.length === 0) {
            postsContainer.innerHTML = '<p class="blog-empty">No posts yet. Check back soon!</p>';
            return;
        }

        // Sort posts by date (newest first)
        posts.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Generate HTML for each post
        const postsHTML = posts.map(post => {
            const date = new Date(post.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            return `
                <article class="blog-post-item">
                    <time class="blog-post-date" datetime="${post.date}">${formattedDate}</time>
                    <h2 class="blog-post-title">
                        <a href="post.html?slug=${post.slug}">${post.title}</a>
                    </h2>
                    <p class="blog-post-excerpt">${post.excerpt}</p>
                    <a href="post.html?slug=${post.slug}" class="blog-post-link">Read more →</a>
                </article>
            `;
        }).join('');

        postsContainer.innerHTML = postsHTML;

    } catch (error) {
        console.error('Error loading blog posts:', error);
        postsContainer.innerHTML = '<p class="blog-empty">Error loading posts. Please try again later.</p>';
    }
}

// Load posts when page loads
document.addEventListener('DOMContentLoaded', loadBlogPosts);

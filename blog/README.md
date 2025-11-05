# Blog

This folder contains all blog posts for the website.

## Adding a New Blog Post

1. **Create a new markdown file** in this folder with the naming convention:
   ```
   YYYY-MM-DD-slug.md
   ```
   Example: `2025-01-25-my-new-post.md`

2. **Add frontmatter** at the top of your markdown file:
   ```markdown
   ---
   title: Your Post Title
   date: 2025-01-25
   excerpt: A brief description of your post (1-2 sentences).
   ---

   # Your Post Title

   Your content goes here...
   ```

3. **Write your content** using standard markdown syntax

4. **Rebuild the blog** by running:
   ```bash
   python3 build-blog.py
   ```
   This will update `posts.json` with your new post.

5. **Commit and push** your changes

## Frontmatter Fields

- `title` (required): The title of your post
- `date` (required): Publication date in YYYY-MM-DD format
- `excerpt` (required): A short summary shown on the blog index page

## Markdown Support

The blog supports standard markdown features:
- Headings (h1-h6)
- Links
- Bold and italic text
- Lists (ordered and unordered)
- Blockquotes
- Code blocks and inline code
- And more

## File Naming

The filename format is: `YYYY-MM-DD-slug.md`
- The date prefix helps with chronological sorting
- The slug becomes the URL (e.g., `my-new-post`)
- Use lowercase and hyphens for slugs

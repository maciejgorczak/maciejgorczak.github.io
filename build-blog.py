#!/usr/bin/env python3
"""
Blog build script - Generates posts.json manifest from markdown files in the blog folder.

Usage:
    python build-blog.py

This script scans the blog/ directory for .md files, extracts frontmatter metadata,
and generates a posts.json manifest file that the blog loader scripts use.
"""

import os
import json
import re
from pathlib import Path
from datetime import datetime


def parse_frontmatter(content):
    """Extract frontmatter metadata from markdown content."""
    frontmatter_pattern = r'^---\s*\n(.*?)\n---\s*\n'
    match = re.match(frontmatter_pattern, content, re.DOTALL)

    if not match:
        return {}

    frontmatter_text = match.group(1)
    metadata = {}

    for line in frontmatter_text.split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            metadata[key.strip()] = value.strip()

    return metadata


def generate_slug(filename):
    """Generate a URL-friendly slug from the filename."""
    # Remove date prefix (YYYY-MM-DD-) and .md extension
    slug = re.sub(r'^\d{4}-\d{2}-\d{2}-', '', filename)
    slug = slug.replace('.md', '')
    return slug


def build_posts_manifest():
    """Build the posts.json manifest from markdown files."""
    blog_dir = Path('blog')

    if not blog_dir.exists():
        print("Error: blog/ directory not found")
        return

    posts = []

    # Scan all .md files in the blog directory
    for md_file in sorted(blog_dir.glob('*.md')):
        try:
            with open(md_file, 'r', encoding='utf-8') as f:
                content = f.read()

            metadata = parse_frontmatter(content)

            if not metadata:
                print(f"Warning: No frontmatter found in {md_file.name}, skipping")
                continue

            # Extract required fields
            title = metadata.get('title', 'Untitled')
            date = metadata.get('date', '')
            excerpt = metadata.get('excerpt', '')
            slug = generate_slug(md_file.name)

            post = {
                'slug': slug,
                'title': title,
                'date': date,
                'excerpt': excerpt,
                'file': md_file.name
            }

            posts.append(post)
            print(f"Added: {title} ({date})")

        except Exception as e:
            print(f"Error processing {md_file.name}: {e}")

    # Sort posts by date (newest first)
    posts.sort(key=lambda x: x['date'], reverse=True)

    # Write posts.json
    manifest_path = blog_dir / 'posts.json'
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(posts, f, indent=2)

    print(f"\n✓ Generated {manifest_path} with {len(posts)} posts")


if __name__ == '__main__':
    print("Building blog posts manifest...\n")
    build_posts_manifest()

/**
 * Data Transformer
 * Converts raw 4chan API data to the output schema
 * Handles HTML stripping, entity decoding, quote resolution, and image URLs
 */

import he from 'he';
import { Chan4Post, Chan4Thread, ScrapedPost } from './types.js';

/** Image CDN base URL */
const IMAGE_CDN = 'https://i.4cdn.org';

/**
 * Extract quoted post IDs from HTML content
 * Matches patterns like >>123456789 in quotelinks
 */
export function extractQuotedPostIds(html: string | undefined): number[] {
  if (!html) return [];

  const ids: number[] = [];
  
  // Match quotelink anchors: <a href="#p123456" class="quotelink">&gt;&gt;123456</a>
  // Also match raw >>123456 patterns that might appear
  const quotelinkRegex = /(?:class="quotelink"[^>]*>&gt;&gt;|>>)(\d+)/g;
  
  let match;
  while ((match = quotelinkRegex.exec(html)) !== null) {
    const postId = parseInt(match[1], 10);
    if (!isNaN(postId) && !ids.includes(postId)) {
      ids.push(postId);
    }
  }

  return ids;
}

/**
 * Build full image URL
 * Format: https://i.4cdn.org/{board}/{tim}{ext}
 */
export function buildImageUrl(board: string, tim: number | undefined, ext: string | undefined): string | null {
  if (!tim || !ext) return null;
  return `${IMAGE_CDN}/${board}/${tim}${ext}`;
}

/**
 * Build thumbnail URL
 * Format: https://i.4cdn.org/{board}/{tim}s.jpg
 */
export function buildThumbnailUrl(board: string, tim: number | undefined): string | null {
  if (!tim) return null;
  return `${IMAGE_CDN}/${board}/${tim}s.jpg`;
}

/**
 * Strip HTML tags and clean text content
 */
export function cleanHtmlContent(html: string | undefined): string {
  if (!html) return '';

  let text = html;

  // Replace <br> and <br/> with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove <wbr> tags (word break opportunities)
  text = text.replace(/<wbr>/gi, '');

  // Remove quotelinks but keep the reference text
  // e.g., <a href="#p123456" class="quotelink">&gt;&gt;123456</a> -> >>123456
  text = text.replace(/<a[^>]*class="quotelink"[^>]*>([^<]*)<\/a>/gi, '$1');

  // Remove other anchor tags but keep text
  text = text.replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1');

  // Remove greentext span tags but keep content
  text = text.replace(/<span[^>]*class="quote"[^>]*>([^<]*)<\/span>/gi, '$1');

  // Remove deadlink spans but keep content
  text = text.replace(/<span[^>]*class="deadlink"[^>]*>([^<]*)<\/span>/gi, '$1');

  // Remove any remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities (e.g., &gt; -> >, &#039; -> ', &amp; -> &)
  text = he.decode(text);

  // Normalize whitespace (but preserve intentional newlines)
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Build the author string from post data
 * Format: "name [trip] (id)"
 */
export function buildAuthorString(post: Chan4Post): string {
  const parts: string[] = [];
  
  // Name (always present, defaults to "Anonymous")
  parts.push(post.name);
  
  // Tripcode (optional)
  if (post.trip) {
    parts.push(`[${post.trip}]`);
  }
  
  // Poster ID (optional, /pol/ has this)
  if (post.id) {
    parts.push(`(${post.id})`);
  }

  return parts.join(' ');
}

/**
 * Convert UNIX timestamp to ISO date string
 */
export function timestampToISO(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Resolve quoted content from post IDs
 * Returns cleaned text of all quoted posts, concatenated with separators
 */
export function resolveQuotedContent(
  quotedIds: number[],
  postMap: Map<number, Chan4Post>
): string | null {
  if (quotedIds.length === 0) return null;

  const quotedTexts: string[] = [];

  for (const postId of quotedIds) {
    const quotedPost = postMap.get(postId);
    if (quotedPost && quotedPost.com) {
      const cleanedText = cleanHtmlContent(quotedPost.com);
      if (cleanedText) {
        // Prefix with post ID for context
        quotedTexts.push(`[>>${postId}]: ${cleanedText}`);
      }
    } else {
      // Post not found in thread (external reference or deleted)
      quotedTexts.push(`[>>${postId}]: [external/deleted]`);
    }
  }

  return quotedTexts.length > 0 ? quotedTexts.join('\n---\n') : null;
}

/**
 * Transform a single post to the output schema
 */
export function transformPost(
  post: Chan4Post,
  threadId: number,
  board: string,
  postMap: Map<number, Chan4Post>
): ScrapedPost {
  const isOP = post.resto === 0;
  const quotedPostIds = extractQuotedPostIds(post.com);
  
  return {
    post_id: post.no,
    thread_id: isOP ? post.no : threadId,
    auteur: buildAuthorString(post),
    texte: cleanHtmlContent(post.com),
    plateforme: '4chan',
    date: post.time,
    date_iso: timestampToISO(post.time),
    type: isOP ? 'post' : 'reply',
    engagement_replies: isOP ? (post.replies ?? 0) : null,
    engagement_images: isOP ? (post.images ?? 0) : null,
    engagement_unique_ips: isOP ? (post.unique_ips ?? null) : null,
    topic: isOP ? (post.sub ?? null) : null,
    country: post.country_name ?? null,
    country_code: post.country ?? null,
    has_image: !!(post.tim && post.ext),
    image_filename: post.filename ? `${post.filename}${post.ext}` : null,
    // New fields
    quoted_post_ids: quotedPostIds,
    quoted_content: resolveQuotedContent(quotedPostIds, postMap),
    image_url: buildImageUrl(board, post.tim, post.ext),
    thumbnail_url: buildThumbnailUrl(board, post.tim)
  };
}

/**
 * Transform an entire thread to output schema
 */
export function transformThread(thread: Chan4Thread, board: string): ScrapedPost[] {
  if (!thread.posts || thread.posts.length === 0) {
    return [];
  }

  // First post is the OP, use its ID as thread ID
  const threadId = thread.posts[0].no;
  
  // Build a lookup map for quote resolution
  const postMap = new Map<number, Chan4Post>();
  for (const post of thread.posts) {
    postMap.set(post.no, post);
  }
  
  return thread.posts.map(post => transformPost(post, threadId, board, postMap));
}

/**
 * Transform multiple threads
 */
export function transformThreads(threads: Map<number, Chan4Thread>, board: string): ScrapedPost[] {
  const allPosts: ScrapedPost[] = [];
  
  for (const [threadNo, thread] of threads) {
    const posts = transformThread(thread, board);
    allPosts.push(...posts);
    console.log(`[Transform] Thread ${threadNo}: ${posts.length} posts`);
  }

  console.log(`[Transform] Total: ${allPosts.length} posts from ${threads.size} threads`);
  return allPosts;
}

/**
 * Sort posts by date (oldest first)
 */
export function sortPostsByDate(posts: ScrapedPost[]): ScrapedPost[] {
  return [...posts].sort((a, b) => a.date - b.date);
}

/**
 * Filter posts that have text content
 */
export function filterPostsWithContent(posts: ScrapedPost[]): ScrapedPost[] {
  return posts.filter(post => post.texte.length > 0);
}

/**
 * Get statistics about scraped posts
 */
export function getPostStats(posts: ScrapedPost[]): {
  total: number;
  ops: number;
  replies: number;
  withImages: number;
  withContent: number;
  withQuotes: number;
  countries: Map<string, number>;
} {
  const stats = {
    total: posts.length,
    ops: 0,
    replies: 0,
    withImages: 0,
    withContent: 0,
    withQuotes: 0,
    countries: new Map<string, number>()
  };

  for (const post of posts) {
    if (post.type === 'post') stats.ops++;
    else stats.replies++;
    
    if (post.has_image) stats.withImages++;
    if (post.texte.length > 0) stats.withContent++;
    if (post.quoted_post_ids.length > 0) stats.withQuotes++;
    
    if (post.country) {
      stats.countries.set(
        post.country,
        (stats.countries.get(post.country) || 0) + 1
      );
    }
  }

  return stats;
}

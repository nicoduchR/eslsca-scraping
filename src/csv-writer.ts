/**
 * CSV Writer
 * Exports scraped posts to CSV format
 */

import { createObjectCsvWriter } from 'csv-writer';
import { ScrapedPost } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

/** CSV header configuration matching the output schema */
const CSV_HEADERS = [
  { id: 'post_id', title: 'post_id' },
  { id: 'thread_id', title: 'thread_id' },
  { id: 'auteur', title: 'auteur' },
  { id: 'texte', title: 'texte' },
  { id: 'plateforme', title: 'plateforme' },
  { id: 'date', title: 'date' },
  { id: 'date_iso', title: 'date_iso' },
  { id: 'type', title: 'type' },
  { id: 'engagement_replies', title: 'engagement_replies' },
  { id: 'engagement_images', title: 'engagement_images' },
  { id: 'engagement_unique_ips', title: 'engagement_unique_ips' },
  { id: 'topic', title: 'topic' },
  { id: 'country', title: 'country' },
  { id: 'country_code', title: 'country_code' },
  { id: 'has_image', title: 'has_image' },
  { id: 'image_filename', title: 'image_filename' },
  // New fields for quote resolution and images
  { id: 'quoted_post_ids', title: 'quoted_post_ids' },
  { id: 'quoted_content', title: 'quoted_content' },
  { id: 'image_url', title: 'image_url' },
  { id: 'thumbnail_url', title: 'thumbnail_url' }
];

/**
 * Ensure output directory exists
 */
export function ensureOutputDir(outputDir: string): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`[CSV] Created output directory: ${outputDir}`);
  }
}

/**
 * Generate a timestamped filename
 */
export function generateFilename(board: string, suffix?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const parts = [board, timestamp];
  if (suffix) parts.push(suffix);
  return parts.join('_') + '.csv';
}

/**
 * Write posts to a CSV file
 */
export async function writePostsToCsv(
  posts: ScrapedPost[],
  outputDir: string,
  filename: string
): Promise<string> {
  ensureOutputDir(outputDir);
  
  const filepath = path.join(outputDir, filename);
  
  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: CSV_HEADERS,
    encoding: 'utf8'
  });

  // Convert null values and arrays to strings for CSV compatibility
  const records = posts.map(post => ({
    ...post,
    engagement_replies: post.engagement_replies ?? '',
    engagement_images: post.engagement_images ?? '',
    engagement_unique_ips: post.engagement_unique_ips ?? '',
    topic: post.topic ?? '',
    country: post.country ?? '',
    country_code: post.country_code ?? '',
    image_filename: post.image_filename ?? '',
    // New fields
    quoted_post_ids: post.quoted_post_ids.length > 0 ? post.quoted_post_ids.join(';') : '',
    quoted_content: post.quoted_content ?? '',
    image_url: post.image_url ?? '',
    thumbnail_url: post.thumbnail_url ?? ''
  }));

  await csvWriter.writeRecords(records);
  
  console.log(`[CSV] Wrote ${posts.length} posts to ${filepath}`);
  return filepath;
}

/**
 * Append posts to an existing CSV file (for monitoring mode)
 */
export async function appendPostsToCsv(
  posts: ScrapedPost[],
  filepath: string
): Promise<void> {
  const fileExists = fs.existsSync(filepath);
  
  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: CSV_HEADERS,
    encoding: 'utf8',
    append: fileExists
  });

  // Convert null values and arrays to strings for CSV compatibility
  const records = posts.map(post => ({
    ...post,
    engagement_replies: post.engagement_replies ?? '',
    engagement_images: post.engagement_images ?? '',
    engagement_unique_ips: post.engagement_unique_ips ?? '',
    topic: post.topic ?? '',
    country: post.country ?? '',
    country_code: post.country_code ?? '',
    image_filename: post.image_filename ?? '',
    // New fields
    quoted_post_ids: post.quoted_post_ids.length > 0 ? post.quoted_post_ids.join(';') : '',
    quoted_content: post.quoted_content ?? '',
    image_url: post.image_url ?? '',
    thumbnail_url: post.thumbnail_url ?? ''
  }));

  await csvWriter.writeRecords(records);
  
  console.log(`[CSV] Appended ${posts.length} posts to ${filepath}`);
}

/**
 * Read existing post IDs from a CSV file to avoid duplicates
 */
export function readExistingPostIds(filepath: string): Set<number> {
  const ids = new Set<number>();
  
  if (!fs.existsSync(filepath)) {
    return ids;
  }

  try {
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n').slice(1); // Skip header
    
    for (const line of lines) {
      if (line.trim()) {
        const postId = parseInt(line.split(',')[0], 10);
        if (!isNaN(postId)) {
          ids.add(postId);
        }
      }
    }
    
    console.log(`[CSV] Loaded ${ids.size} existing post IDs from ${filepath}`);
  } catch (error) {
    console.error(`[CSV] Error reading existing file:`, error);
  }

  return ids;
}

/**
 * Filter out posts that already exist in the CSV
 */
export function filterNewPosts(
  posts: ScrapedPost[],
  existingIds: Set<number>
): ScrapedPost[] {
  const newPosts = posts.filter(post => !existingIds.has(post.post_id));
  console.log(`[CSV] ${newPosts.length} new posts (filtered ${posts.length - newPosts.length} duplicates)`);
  return newPosts;
}


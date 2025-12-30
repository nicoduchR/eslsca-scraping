/**
 * 4chan /pol/ Scraper
 * Main entry point
 * 
 * Usage:
 *   npm run start:snapshot  - One-time scrape of all active threads
 *   npm run start:monitor   - Continuous monitoring of new posts
 */

import { Chan4ApiClient } from './api.js';
import { transformThreads, sortPostsByDate, filterPostsWithContent, getPostStats } from './transformer.js';
import { 
  writePostsToCsv, 
  appendPostsToCsv, 
  generateFilename,
  readExistingPostIds,
  filterNewPosts,
  ensureOutputDir
} from './csv-writer.js';
import { ScraperConfig, ScrapedPost } from './types.js';
import * as path from 'path';

// Default configuration
const DEFAULT_CONFIG: ScraperConfig = {
  board: 'pol',
  mode: 'snapshot',
  outputDir: './output',
  requestDelayMs: 1100,        // Slightly over 1 second to be safe
  monitorIntervalMs: 60000,    // Check for new threads every minute
  maxRetries: 3,
  retryDelayMs: 5000
};

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<ScraperConfig> {
  const args = process.argv.slice(2);
  const config: Partial<ScraperConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--mode' && args[i + 1]) {
      const mode = args[i + 1];
      if (mode === 'snapshot' || mode === 'monitor') {
        config.mode = mode;
      }
      i++;
    } else if (arg === '--board' && args[i + 1]) {
      config.board = args[i + 1];
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      config.outputDir = args[i + 1];
      i++;
    }
  }

  return config;
}

/**
 * Print statistics about scraped data
 */
function printStats(posts: ScrapedPost[]): void {
  const stats = getPostStats(posts);
  
  console.log('\n========== SCRAPE STATISTICS ==========');
  console.log(`Total posts: ${stats.total}`);
  console.log(`  - OPs (threads): ${stats.ops}`);
  console.log(`  - Replies: ${stats.replies}`);
  console.log(`  - With images: ${stats.withImages}`);
  console.log(`  - With text content: ${stats.withContent}`);
  console.log(`  - With quotes: ${stats.withQuotes}`);
  
  // Top 10 countries
  const sortedCountries = [...stats.countries.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (sortedCountries.length > 0) {
    console.log('\nTop 10 countries:');
    for (const [country, count] of sortedCountries) {
      const percentage = ((count / stats.total) * 100).toFixed(1);
      console.log(`  - ${country}: ${count} (${percentage}%)`);
    }
  }
  
  console.log('========================================\n');
}

/**
 * Snapshot mode: Scrape all active threads once
 */
async function runSnapshotMode(config: ScraperConfig): Promise<void> {
  console.log('\n🔍 Starting SNAPSHOT mode...\n');
  
  const api = new Chan4ApiClient(config);
  const startTime = Date.now();

  try {
    // Step 1: Get all thread IDs
    console.log('Step 1: Fetching thread list...');
    const threadIds = await api.getAllThreadIds();
    
    if (threadIds.length === 0) {
      console.log('No threads found. Exiting.');
      return;
    }

    // Estimate time
    const estimatedSeconds = threadIds.length * (config.requestDelayMs / 1000);
    console.log(`Estimated time: ~${Math.ceil(estimatedSeconds / 60)} minutes for ${threadIds.length} threads\n`);

    // Step 2: Fetch all threads
    console.log('Step 2: Fetching thread contents...');
    const threads = await api.getThreads(threadIds);

    // Step 3: Transform data
    console.log('\nStep 3: Transforming data...');
    let posts = transformThreads(threads, config.board);
    posts = sortPostsByDate(posts);

    // Step 4: Filter posts with content (optional - keep all for now)
    const postsWithContent = filterPostsWithContent(posts);
    console.log(`Posts with text content: ${postsWithContent.length}/${posts.length}`);

    // Step 5: Write to CSV
    console.log('\nStep 4: Writing to CSV...');
    const filename = generateFilename(config.board, 'snapshot');
    const filepath = await writePostsToCsv(posts, config.outputDir, filename);

    // Print statistics
    printStats(posts);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`✅ Snapshot complete in ${duration.toFixed(1)} seconds`);
    console.log(`📁 Output: ${filepath}`);

  } catch (error) {
    console.error('❌ Error during snapshot:', error);
    throw error;
  }
}

/**
 * Monitor mode: Continuously check for new posts
 */
async function runMonitorMode(config: ScraperConfig): Promise<void> {
  console.log('\n👁️ Starting MONITOR mode...\n');
  console.log(`Checking for new posts every ${config.monitorIntervalMs / 1000} seconds`);
  console.log('Press Ctrl+C to stop\n');

  const api = new Chan4ApiClient(config);
  
  // Set up output file
  ensureOutputDir(config.outputDir);
  const filename = generateFilename(config.board, 'monitor');
  const filepath = path.join(config.outputDir, filename);
  
  // Track seen post IDs across iterations
  let seenPostIds = new Set<number>();
  let totalNewPosts = 0;
  let iterationCount = 0;

  // Graceful shutdown handler
  let isRunning = true;
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...');
    isRunning = false;
  });

  while (isRunning) {
    iterationCount++;
    console.log(`\n--- Iteration ${iterationCount} (${new Date().toISOString()}) ---`);

    try {
      // Fetch current thread list
      const threadIds = await api.getAllThreadIds();
      
      if (threadIds.length === 0) {
        console.log('No threads found. Waiting...');
        await sleep(config.monitorIntervalMs);
        continue;
      }

      // On first iteration, do a full scrape
      // On subsequent iterations, only fetch a sample of threads
      const threadsToFetch = iterationCount === 1 
        ? threadIds 
        : threadIds.slice(0, 50); // Fetch top 50 threads each iteration

      console.log(`Fetching ${threadsToFetch.length} threads...`);
      const threads = await api.getThreads(threadsToFetch);

      // Transform and filter new posts
      let posts = transformThreads(threads, config.board);
      posts = filterNewPosts(posts, seenPostIds);

      if (posts.length > 0) {
        // Update seen IDs
        for (const post of posts) {
          seenPostIds.add(post.post_id);
        }

        // Append to CSV
        posts = sortPostsByDate(posts);
        await appendPostsToCsv(posts, filepath);
        
        totalNewPosts += posts.length;
        console.log(`📝 Added ${posts.length} new posts (total: ${totalNewPosts})`);
      } else {
        console.log('No new posts found');
      }

      // Wait for next iteration
      if (isRunning) {
        console.log(`Waiting ${config.monitorIntervalMs / 1000} seconds...`);
        await sleep(config.monitorIntervalMs);
      }

    } catch (error) {
      console.error('Error during monitoring iteration:', error);
      // Wait and retry
      await sleep(config.retryDelayMs);
    }
  }

  console.log(`\n✅ Monitor mode stopped`);
  console.log(`📊 Total new posts collected: ${totalNewPosts}`);
  console.log(`📁 Output: ${filepath}`);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     4chan /pol/ Scraper v1.0.0         ║');
  console.log('║     ESLSCA Research Project            ║');
  console.log('╚════════════════════════════════════════╝');

  // Parse configuration
  const args = parseArgs();
  const config: ScraperConfig = { ...DEFAULT_CONFIG, ...args };

  console.log(`\nConfiguration:`);
  console.log(`  Board: /${config.board}/`);
  console.log(`  Mode: ${config.mode}`);
  console.log(`  Output: ${config.outputDir}`);
  console.log(`  Rate limit: ${config.requestDelayMs}ms between requests`);

  // Run appropriate mode
  if (config.mode === 'snapshot') {
    await runSnapshotMode(config);
  } else {
    await runMonitorMode(config);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


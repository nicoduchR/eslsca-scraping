/**
 * 4chan API Client with Rate Limiting
 * Respects the 1 request per second limit
 */

import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import PQueue from 'p-queue';
import {
  Chan4Thread,
  Chan4ThreadListPage,
  Chan4CatalogPage,
  CacheEntry,
  ScraperConfig
} from './types.js';

const BASE_URL = 'https://a.4cdn.org';

/** Sleep utility for retry delays */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class Chan4ApiClient {
  private client: AxiosInstance;
  private queue: PQueue;
  private cache: Map<string, CacheEntry>;
  private config: ScraperConfig;

  constructor(config: ScraperConfig) {
    this.config = config;
    this.cache = new Map();
    
    // Create axios instance with default headers
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ESLSCA-Research-Scraper/1.0'
      }
    });

    // Create rate-limited queue (1 request per second)
    this.queue = new PQueue({
      concurrency: 1,
      interval: this.config.requestDelayMs,
      intervalCap: 1
    });

    console.log(`[API] Initialized with ${this.config.requestDelayMs}ms delay between requests`);
  }

  /**
   * Make a rate-limited GET request with caching and retry support
   */
  private async get<T>(endpoint: string, useCache = true): Promise<{ data: T | null; notModified: boolean }> {
    return this.queue.add(async () => {
      const url = endpoint;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        const headers: Record<string, string> = {};

        // Add If-Modified-Since header if we have cached data
        if (useCache && this.cache.has(url)) {
          const cached = this.cache.get(url)!;
          headers['If-Modified-Since'] = cached.lastModified;
          if (cached.etag) {
            headers['If-None-Match'] = cached.etag;
          }
        }

        try {
          const response: AxiosResponse<T> = await this.client.get(url, { headers });
          
          // Update cache with new Last-Modified value
          if (response.headers['last-modified']) {
            this.cache.set(url, {
              lastModified: response.headers['last-modified'],
              etag: response.headers['etag']
            });
          }

          return { data: response.data, notModified: false };
        } catch (error: unknown) {
          if (axios.isAxiosError(error)) {
            const axiosErr = error as AxiosError;
            
            // 304 Not Modified - data hasn't changed (not an error)
            if (axiosErr.response?.status === 304) {
              console.log(`[API] 304 Not Modified: ${url}`);
              return { data: null, notModified: true };
            }
            
            // 404 Not Found - Thread was deleted/archived (not retryable)
            if (axiosErr.response?.status === 404) {
              console.log(`[API] 404 Not Found: ${url}`);
              return { data: null, notModified: false };
            }

            // 429 Too Many Requests - Rate limited, wait and retry
            if (axiosErr.response?.status === 429) {
              const retryAfter = parseInt(axiosErr.response.headers['retry-after'] || '60', 10);
              console.warn(`[API] 429 Rate limited. Waiting ${retryAfter}s before retry...`);
              await sleep(retryAfter * 1000);
              continue;
            }

            // 5xx Server errors - Retry with exponential backoff
            if (axiosErr.response?.status && axiosErr.response.status >= 500) {
              const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
              console.warn(`[API] ${axiosErr.response.status} Server error on ${url}. Retry ${attempt}/${this.config.maxRetries} in ${delay}ms`);
              lastError = axiosErr;
              await sleep(delay);
              continue;
            }

            // Network errors (no response) - Retry
            if (!axiosErr.response) {
              const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
              console.warn(`[API] Network error on ${url}. Retry ${attempt}/${this.config.maxRetries} in ${delay}ms`);
              lastError = axiosErr;
              await sleep(delay);
              continue;
            }
          }

          // Unknown error - don't retry
          throw error;
        }
      }

      // All retries exhausted
      console.error(`[API] All ${this.config.maxRetries} retries failed for ${url}`);
      throw lastError || new Error(`Failed to fetch ${url}`);
    }) as Promise<{ data: T | null; notModified: boolean }>;
  }

  /**
   * Fetch the thread list for a board
   */
  async getThreadList(): Promise<Chan4ThreadListPage[]> {
    console.log(`[API] Fetching thread list for /${this.config.board}/`);
    const result = await this.get<Chan4ThreadListPage[]>(`/${this.config.board}/threads.json`, false);
    return result.data || [];
  }

  /**
   * Fetch the catalog for a board
   */
  async getCatalog(): Promise<Chan4CatalogPage[]> {
    console.log(`[API] Fetching catalog for /${this.config.board}/`);
    const result = await this.get<Chan4CatalogPage[]>(`/${this.config.board}/catalog.json`, false);
    return result.data || [];
  }

  /**
   * Fetch a specific thread
   */
  async getThread(threadNo: number): Promise<Chan4Thread | null> {
    const result = await this.get<Chan4Thread>(
      `/${this.config.board}/thread/${threadNo}.json`
    );
    
    if (result.notModified) {
      console.log(`[API] Thread ${threadNo} not modified`);
      return null;
    }
    
    return result.data;
  }

  /**
   * Fetch multiple threads with progress logging
   */
  async getThreads(threadNos: number[]): Promise<Map<number, Chan4Thread>> {
    const threads = new Map<number, Chan4Thread>();
    const total = threadNos.length;
    let processed = 0;

    console.log(`[API] Fetching ${total} threads...`);

    for (const threadNo of threadNos) {
      try {
        const thread = await this.getThread(threadNo);
        if (thread) {
          threads.set(threadNo, thread);
        }
        processed++;
        
        // Log progress every 10 threads
        if (processed % 10 === 0 || processed === total) {
          console.log(`[API] Progress: ${processed}/${total} threads fetched`);
        }
      } catch (error) {
        console.error(`[API] Error fetching thread ${threadNo}:`, error);
        processed++;
      }
    }

    return threads;
  }

  /**
   * Get all thread IDs from the thread list
   */
  async getAllThreadIds(): Promise<number[]> {
    const threadList = await this.getThreadList();
    const threadIds: number[] = [];
    
    for (const page of threadList) {
      for (const thread of page.threads) {
        threadIds.push(thread.no);
      }
    }

    console.log(`[API] Found ${threadIds.length} active threads`);
    return threadIds;
  }

  /**
   * Get queue size (pending requests)
   */
  get pendingRequests(): number {
    return this.queue.size + this.queue.pending;
  }

  /**
   * Clear the request queue
   */
  clearQueue(): void {
    this.queue.clear();
  }

  /**
   * Wait for all pending requests to complete
   */
  async waitForIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}


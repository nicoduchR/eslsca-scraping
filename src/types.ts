/**
 * 4chan API Types
 * Based on https://github.com/4chan/4chan-API
 */

/** Raw post object from 4chan API */
export interface Chan4Post {
  no: number;                    // Post ID
  resto: number;                 // 0 = OP, >0 = reply to thread ID
  sticky?: number;               // 1 if stickied
  closed?: number;               // 1 if closed
  now: string;                   // Formatted date string
  time: number;                  // UNIX timestamp
  name: string;                  // Poster name (default: "Anonymous")
  trip?: string;                 // Tripcode
  id?: string;                   // Poster ID (8 chars, /pol/ has this)
  capcode?: string;              // mod, admin, etc.
  country?: string;              // ISO 3166-1 alpha-2 country code
  country_name?: string;         // Country name
  board_flag?: string;           // Board flag code
  flag_name?: string;            // Board flag name
  sub?: string;                  // Subject (OP only)
  com?: string;                  // Comment (HTML escaped)
  tim?: number;                  // Image timestamp + microtime
  filename?: string;             // Original filename
  ext?: string;                  // File extension
  fsize?: number;                // File size in bytes
  md5?: string;                  // File MD5 hash
  w?: number;                    // Image width
  h?: number;                    // Image height
  tn_w?: number;                 // Thumbnail width
  tn_h?: number;                 // Thumbnail height
  filedeleted?: number;          // 1 if file deleted
  spoiler?: number;              // 1 if spoilered
  custom_spoiler?: number;       // Custom spoiler ID
  replies?: number;              // Reply count (OP only)
  images?: number;               // Image count (OP only)
  bumplimit?: number;            // 1 if bump limit reached
  imagelimit?: number;           // 1 if image limit reached
  semantic_url?: string;         // SEO URL slug
  since4pass?: number;           // Year 4chan pass bought
  unique_ips?: number;           // Unique posters (OP only)
  m_img?: number;                // Mobile optimized image exists
  archived?: number;             // 1 if archived
  archived_on?: number;          // Archive timestamp
}

/** Thread JSON response */
export interface Chan4Thread {
  posts: Chan4Post[];
}

/** Thread list entry */
export interface Chan4ThreadListEntry {
  no: number;
  last_modified: number;
  replies: number;
}

/** Thread list page */
export interface Chan4ThreadListPage {
  page: number;
  threads: Chan4ThreadListEntry[];
}

/** Catalog thread entry (includes last_replies) */
export interface Chan4CatalogThread extends Chan4Post {
  omitted_posts?: number;
  omitted_images?: number;
  last_modified: number;
  last_replies?: Chan4Post[];
}

/** Catalog page */
export interface Chan4CatalogPage {
  page: number;
  threads: Chan4CatalogThread[];
}

/**
 * Output Schema Types
 * The transformed data structure for CSV export
 */

export interface ScrapedPost {
  post_id: number;               // Unique post ID
  thread_id: number;             // Thread this post belongs to
  auteur: string;                // Author: "name [trip] (id)"
  texte: string;                 // Cleaned text content
  plateforme: string;            // "4chan"
  date: number;                  // UNIX timestamp
  date_iso: string;              // ISO date string
  type: 'post' | 'reply';        // OP or reply
  engagement_replies: number | null;    // Reply count (OP only)
  engagement_images: number | null;     // Image count (OP only)
  engagement_unique_ips: number | null; // Unique IPs (OP only)
  topic: string | null;          // Subject (OP only)
  country: string | null;        // Poster's country
  country_code: string | null;   // ISO country code
  has_image: boolean;            // Whether post has attachment
  image_filename: string | null; // Original filename if image
  // New fields for quote resolution and images
  quoted_post_ids: number[];     // Array of post IDs this post quotes (>>NNNNNN)
  quoted_content: string | null; // Text content of quoted posts, concatenated
  image_url: string | null;      // Full image URL: https://i.4cdn.org/{board}/{tim}{ext}
  thumbnail_url: string | null;  // Thumbnail URL: https://i.4cdn.org/{board}/{tim}s.jpg
}

/** Scraper configuration */
export interface ScraperConfig {
  board: string;
  mode: 'snapshot' | 'monitor';
  outputDir: string;
  requestDelayMs: number;
  monitorIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

/** API client state for If-Modified-Since */
export interface CacheEntry {
  lastModified: string;
  etag?: string;
}


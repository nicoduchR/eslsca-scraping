# 4chan Multi-Board Scraper

A Node.js/TypeScript scraper for extracting content from any 4chan board using the official read-only API.

Supports all boards: `/pol/`, `/x/`, `/b/`, `/v/`, etc.

## Features

- **Rate-limited API client**: Respects 4chan's 1 request/second limit
- **Two scraping modes**:
  - **Snapshot**: One-time scrape of all active threads
  - **Monitor**: Continuous monitoring for new posts
- **If-Modified-Since caching**: Efficient updates with HTTP caching headers
- **Retry logic**: Exponential backoff for failed requests
- **CSV export**: Clean, structured output for analysis

## Installation

```bash
npm install
```

## Usage

### Quick Start (Predefined Boards)

```bash
# Scrape /pol/ (Politically Incorrect)
npm run scrape:pol

# Scrape /x/ (Paranormal)
npm run scrape:x

# Monitor /pol/ continuously
npm run monitor:pol

# Monitor /x/ continuously
npm run monitor:x
```

### Custom Board

Use `--board` to scrape any board:

```bash
# Snapshot any board
npm run start -- --mode snapshot --board v    # /v/ - Video Games
npm run start -- --mode snapshot --board b    # /b/ - Random
npm run start -- --mode snapshot --board biz  # /biz/ - Business

# Monitor any board
npm run start -- --mode monitor --board x
```

Press `Ctrl+C` to stop monitoring gracefully.

### All Command-line Options

```bash
npm run start -- --mode snapshot     # Snapshot mode (default)
npm run start -- --mode monitor      # Monitor mode
npm run start -- --board pol         # Specify board (default: pol)
npm run start -- --output ./data     # Output directory (default: ./output)
```

### Examples

```bash
# Scrape /x/ (Paranormal) - great for conspiracy theories
npm run start -- --mode snapshot --board x

# Scrape /biz/ (Business & Finance) - crypto discussions
npm run start -- --mode snapshot --board biz

# Monitor /pol/ and save to custom folder
npm run start -- --mode monitor --board pol --output ./data/pol
```

## Output Schema

The scraper exports data to CSV with the following fields:

| Field | Description |
|-------|-------------|
| `post_id` | Unique post ID |
| `thread_id` | Thread the post belongs to |
| `auteur` | Author: "name [tripcode] (poster_id)" |
| `texte` | Cleaned text content (HTML stripped) |
| `plateforme` | Always "4chan" |
| `date` | UNIX timestamp |
| `date_iso` | ISO 8601 date string |
| `type` | "post" (OP) or "reply" |
| `engagement_replies` | Reply count (OPs only) |
| `engagement_images` | Image count (OPs only) |
| `engagement_unique_ips` | Unique posters (OPs only) |
| `topic` | Thread subject (OPs only) |
| `country` | Poster's country name |
| `country_code` | ISO 3166-1 alpha-2 code |
| `has_image` | Whether post has attachment |
| `image_filename` | Original filename if image |
| `quoted_post_ids` | IDs of posts referenced (e.g., `524554423;524554500`) |
| `quoted_content` | Full text of quoted posts, concatenated |
| `image_url` | Full image URL (i.4cdn.org) |
| `thumbnail_url` | Thumbnail URL |

## API Rate Limits

The scraper respects 4chan's API rules:

1. **Maximum 1 request per second** (configured as 1.1s to be safe)
2. **If-Modified-Since headers** for efficient polling
3. **Retry with exponential backoff** on server errors

## Project Structure

```
├── src/
│   ├── index.ts         # Main entry point
│   ├── api.ts           # Rate-limited API client
│   ├── transformer.ts   # Data transformation (HTML cleaning)
│   ├── csv-writer.ts    # CSV export logic
│   └── types.ts         # TypeScript interfaces
├── output/              # CSV output directory
├── package.json
├── tsconfig.json
└── README.md
```

## Time Estimates

For a typical /pol/ board with ~150 active threads:

- **Snapshot mode**: ~3-4 minutes (1 req/sec for each thread + overhead)
- **Monitor mode**: Runs continuously, fetching top 50 threads per minute

## Notes

- 4chan has **no upvote/downvote system**. Engagement is measured by reply count, image count, and unique IPs.
- Posts without text content are still included (image-only posts).
- The `topic` field uses the thread subject, which is optional and set by OP only.
- For conspiracy theory classification, you'll need to implement NLP on the `texte` field.

## Legal / Ethical

This scraper is for research purposes only. Please respect:

1. 4chan's [API Terms of Service](https://github.com/4chan/4chan-API)
2. Rate limits to avoid service disruption
3. Data privacy considerations
4. Your institution's research ethics guidelines

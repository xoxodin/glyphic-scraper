# Glyphic Scraper

A Unicode & Kaomoji style scraper with a Candyland-themed GUI. Extracts special character styles from websites using Cheerio and Puppeteer.

## Features

- Animated Candyland-themed GUI with melting containers and pinstripe buttons
- Real-time scraping with progress tracking
- Unicode style extraction using Cheerio (static) and Puppeteer (dynamic)
- Automatic sitemap crawling within domain scope
- Merges results into a structured JSON database
- Kaomoji pet companion that tracks your cursor

## Installation

```bash
npm install
```

## Running the App

1. Start the backend server:
```bash
node api-server.mjs
```

2. Open `index.html` in your browser or serve it:
```bash
python -m http.server 8000
```

3. Visit `http://localhost:8000`

## Configuration

Set environment variables before running:

```bash
export SOURCE_URL="https://example.com"
export MAX_PAGES=20
export MODE="both"
```

| Variable | Default | Description |
|----------|---------|-------------|
| SOURCE_URL | https://example.com | Starting URL for the crawler |
| MAX_PAGES | 20 | Maximum pages to crawl per URL |
| MODE | both | `fetch` (static), `puppeteer` (dynamic), or `both` |

## Project Structure

```
.
|-- index.html        # Candyland-themed GUI
|-- api-server.mjs    # Express API server
|-- scraper.mjs       # Core scraping logic
|-- package.json      # Node.js dependencies
```

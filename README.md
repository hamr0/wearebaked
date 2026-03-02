# wearebaked

See who your browser is talking to. A real-time network traffic dashboard that shows every connection your browser makes.

All analysis is local. No data leaves your browser. No accounts. No tracking.

Available as a **Chrome extension** and **Firefox extension** (incl. Android).

Open the dashboard to see which domains your browser contacts, how many are third-party trackers, and what categories they fall into. Filter the live request feed by domain, category, or third-party status.

- **Privacy summary** — how many sites you visited vs. how many domains your browser talked to behind your back
- **Category breakdown** — Advertising, Analytics, Fingerprinting, Social Tracking, CDN, and 10+ more
- **Beaconing detection** — spots domains pinging on a timer
- **Redirect chains** — see when one click bounces through five tracking domains
- **Data flow** — which domains are uploading your data
- **WebSocket monitoring** — persistent connections exposed
- **Live request feed** — every request, filterable by domain, category, and third-party status

No data is collected. No data is transmitted. No accounts. No cloud. Everything runs locally in your browser.

## Install

**Chrome** — [Chrome Web Store](https://chromewebstore.google.com/) _(pending review)_

**Firefox** — [Firefox Add-ons](https://addons.mozilla.org/) _(pending review)_

Click the extension icon to open the dashboard.

### Load from source (developer mode)

**Chrome/Chromium:**
1. Open `chrome://extensions/` → enable **Developer mode**
2. Click **Load unpacked** → select `chrome-extension/`
3. Click the wearebaked icon in the toolbar to open the dashboard

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on** → select `firefox-extension/manifest.json`
3. Click the wearebaked icon in the toolbar to open the dashboard

### Manual testing checklist

After loading the extension, verify the following:

1. **Icon** — The toolbar icon and extension management page show a black camera on a white circle
2. **Dashboard loads** — Click the icon → dashboard opens with "Waiting for traffic data…" until you browse
3. **Privacy Summary** — Shows "You visited X sites. Your browser talked to Y other domains." with a color-coded risk bar
4. **Summary cards** — Total Requests, Unique Domains, Third-Party %, Trackers/Ads, 3P Domains, WebSockets
5. **Category breakdown** — Bar chart with color-coded categories
6. **Live Request Feed** — Expand the feed section:
   - Filter bar visible with search input, category dropdown, and "3rd party only" toggle
   - Type in search → filters rows by domain
   - Select a category → filters rows by that category
   - Check "3rd party only" → hides first-party rows
   - All three filters combine correctly
   - Dropdown repopulates with correct categories on each refresh
7. **Collapsible sections** — Beaconing Alerts, New Domains, Redirect Chains, Data Flow, WebSockets all toggle open/closed
8. **Tab favicon** — Browser tab shows the camera-on-white-circle icon
9. **Auto-refresh** — Data updates every 3 seconds when checkbox is checked
10. **Clear Data** — Clears all captured traffic

## What the Dashboard Shows

- **Privacy summary** — sentence summary of sites visited vs. domains contacted, with a risk breakdown bar (risky/unknown/benign) and alert line
- **Summary cards** — total requests, unique domains, third-party percentage, tracker/ad count, WebSocket connections
- **Domains of concern** (Chrome) / **Top third-party domains** (Firefox) — ranked by concern score or request count with category badges
- **Category breakdown** — visual bar chart of all request categories (Advertising, Analytics, Social Tracking, Fingerprinting, CDN, and more)
- **Active tabs** — per-tab request counts and third-party domain lists
- **Beaconing alerts** — domains sending requests at regular intervals (tracking beacons)
- **New domains** — first-seen domains this session with yellow NEW badges
- **Redirect chains** — visual A → B → C display of request redirect paths
- **Data flow** — domains ranked by upload/download volume, flags upload-heavy connections
- **WebSockets** — active persistent connections with activity status
- **Live request feed** — real-time stream of all network requests with filtering (search, category, 3rd-party toggle)

## Signals Explained

### Beaconing Detection
Identifies domains that send requests at suspiciously regular intervals. Computes the coefficient of variation (stddev/mean) of request intervals — if CV < 0.15 and interval is between 10 seconds and 5 minutes, it's flagged as a beacon with a confidence score.

### Redirect Chains
Tracks full redirect paths (HTTP 3xx chains). Common in ad tech where a click bounces through multiple tracking domains before reaching the destination.

### Data Flow
Monitors bytes sent and received per domain using Content-Length headers and request body sizes. Flags domains where upload volume exceeds 50% of download volume — a sign of data exfiltration.

### WebSockets
Detects persistent WebSocket connections and tracks their activity. Shows whether connections are active (seen in last 30s) or idle.

### New Domains
Flags domains seen for the first time in the current browsing session. Helps spot unexpected new connections.

## How Classification Works

Three-pass classification system to minimize "unknown" traffic:

1. **Domain database** — 500+ known domains mapped to categories (Advertising, Analytics, Social Tracking, Fingerprinting, Error Monitoring, A/B Testing, Chat/Support, Video/Media, Consent, Email/CRM, CDN, Fonts, Captcha, Payment, Auth, Maps)
2. **Name patterns** — regex matching on domain names for keywords like `track`, `pixel`, `beacon`, `telemetry`, `adserver`, `metrics`, `collect`, `analytics`, `fingerprint`, etc.
3. **Request heuristics** — 1x1 tracking pixel detection (image type + tiny Content-Length) and beacon POST detection (POST + empty response body)

## Permissions

| Permission | Chrome (MV3) | Firefox (MV2) | Why |
|---|---|---|---|
| `webRequest` | Yes | Yes | Monitor network traffic |
| `<all_urls>` | host_permissions | permissions | See requests to all domains |

No data is collected, transmitted, or stored outside the browser. All processing happens locally in the extension's background script.

## Project Structure

```
wearebaked/
├── chrome-extension/
│   ├── manifest.json      # MV3 manifest
│   ├── background.js      # Traffic capture + classification engine
│   ├── dashboard.html      # Dashboard page
│   ├── dashboard.js        # Dashboard rendering + feed filters
│   ├── styles.css          # Dashboard styles
│   ├── icon48.png          # Extension icon (white circle)
│   ├── icon128.png         # Extension icon large (white circle)
│   └── favicon.png         # Tab favicon
├── firefox-extension/
│   ├── manifest.json      # MV2 manifest with gecko settings
│   ├── background.js      # Firefox-adapted (browser.* APIs)
│   ├── dashboard.html      # Dashboard page
│   ├── dashboard.js        # Firefox-adapted (browser.* APIs) + feed filters
│   ├── styles.css          # Dashboard styles
│   ├── icon48.png          # Extension icon (white circle)
│   ├── icon128.png         # Extension icon large (white circle)
│   └── favicon.png         # Tab favicon
├── store_icon_128.png      # Chrome Web Store icon (128x128)
├── promo_tile.png          # Chrome Web Store promo tile (440x280)
├── screenshot1.png         # Store screenshot with text (1280x800)
├── screenshot2.png         # Store screenshot logo only (1280x800)
├── net_monitor.py          # Python CLI network monitor
└── README.md
```

## Changelog

### v0.4.0
- Added `net_monitor_poc.py` — deep network monitor POC with DNS query parsing, TLS SNI extraction, TCP state tracking, and process mapping
- Updated README with feature descriptions
- Firefox: bumped `strict_min_version` to 142.0, added `data_collection_permissions`

### v0.3.0
- Added **Privacy Summary** section (visited sites count, domain risk bar, alert line) — Chrome and Firefox
- Added **Live Feed filters** — text search by domain, category dropdown, "3rd party only" toggle
- Updated extension icons to black camera on white circle for visibility on dark backgrounds
- Added tab favicon with white circle background
- Generated Chrome Web Store assets (store icon, promo tile, screenshots)
- Firefox now matches Chrome feature parity (Privacy Summary, feed filters, PNG icon)
- Removed redundant Refresh button from Firefox

### v0.2.0
- Initial dashboard with summary cards, category breakdown, domain tracking
- Beaconing detection, redirect chains, data flow, WebSocket monitoring
- Live request feed
- Chrome (MV3) and Firefox (MV2) support

## Python CLI

`net_monitor.py` is a standalone Python network monitor. See the script for usage details.

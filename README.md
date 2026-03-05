# wearebaked

See who your browser is talking to — and who's selling your data.

A real-time network traffic dashboard and data broker detector. Every connection your browser makes — categorized, scored, and laid out in a single view. Click the icon for a quick broker verdict, or open the full dashboard to see every request, redirect chain, beacon, and data flow.

Consolidates **wearesold** (data broker detection) and **weareopen** (third-party script audit) into one extension. 550+ known domains, 84 data broker profiles, three-pass classification, beaconing detection, redirect chain mapping, and data flow analysis — all running locally in your browser.

No data is collected. No data is transmitted. No accounts. No cloud.

Available for **Chrome**, **Firefox** (incl. Android), and **Safari** (macOS).

- **Data broker popup** — click the icon to see which data brokers are active on the current page, grouped by type (Consumer Data Broker, Identity Resolution, Data Marketplace, Audience Data)
- **84 known data brokers** — detects Acxiom, Experian, LiveRamp, Oracle BlueKai, Criteo, Nielsen, and 78 more with company names, types, and descriptions
- **Privacy summary** — how many sites you visited vs. how many domains your browser talked to behind your back
- **3P Scripts card** — total third-party script requests at a glance (from weareopen)
- **Category breakdown** — Advertising, Analytics, Fingerprinting, Social Tracking, Data Broker, CDN, and 10+ more
- **Beaconing detection** — spots domains pinging on a timer
- **Redirect chains** — see when one click bounces through five tracking domains
- **Data flow** — which domains are uploading your data
- **WebSocket monitoring** — persistent connections exposed
- **Live request feed** — every request, filterable by domain, category, and third-party status

No data is collected. No data is transmitted. No accounts. No cloud. Everything runs locally in your browser.

## Try It Now

Store approval pending — install locally in under a minute:

### Chrome
1. Download this repo (Code → Download ZIP) and unzip
2. Go to `chrome://extensions` and turn on **Developer mode** (top right)
3. Click **Load unpacked** → select the `chrome-extension` folder
4. That's it — browse any site and click the extension icon

### Firefox
1. Download this repo (Code → Download ZIP) and unzip
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** → pick any file in the `firefox-extension` folder
4. That's it — browse any site and click the extension icon

> Firefox temporary add-ons reset when you close the browser — just re-load next session.

### Manual testing checklist

After loading the extension, browse a few sites (amazon.com, nytimes.com, facebook.com work well) then verify:

1. **Icon** — The toolbar icon and extension management page show a black camera on a white circle
2. **Popup** — Click the icon → popup shows current site domain, broker count verdict, and broker breakdown grouped by type
3. **Popup — no brokers** — On a clean site, shows "0" with "No data broker connections found."
4. **Popup — with brokers** — On a site with broker connections, shows company names, types, and descriptions
5. **Popup — dashboard link** — "Open Full Dashboard" link opens the full dashboard in a new tab
6. **Dashboard loads** — Dashboard shows "Waiting for traffic data…" until you browse
7. **Privacy Summary** — Shows "You visited X sites. Your browser talked to Y other domains." with a color-coded risk bar
8. **Summary cards** — Total Requests, Unique Domains, Third-Party %, Trackers/Ads, 3P Domains, **3P Scripts**, WebSockets (7 cards)
9. **Category breakdown** — Bar chart with color-coded categories including **Data Broker** (hot pink)
10. **Domains of Concern** — Shows concern-scored domains; broker domains display a pink **DATA BROKER** pill badge
11. **Data Brokers section** — Collapsible section between Active Tabs and Beaconing Alerts, groups brokers by type with company name, description, and request count
12. **Live Request Feed** — Expand the feed section:
    - Filter bar visible with search input, category dropdown, and "3rd party only" toggle
    - Type in search → filters rows by domain
    - Select a category → filters rows by that category
    - Check "3rd party only" → hides first-party rows
    - All three filters combine correctly
    - Dropdown repopulates with correct categories on each refresh
13. **Collapsible sections** — Data Brokers, Beaconing Alerts, New Domains, Redirect Chains, Data Flow, WebSockets all toggle open/closed
14. **Tab favicon** — Browser tab shows the camera-on-white-circle icon
15. **Auto-refresh** — Data updates every 3 seconds when checkbox is checked
16. **Clear Data** — Clears all captured traffic

## What You See

### Popup (click the icon)

- **Verdict** — current site domain, broker count, and severity level (clean/warn/bad)
- **Broker breakdown** — grouped by type (Consumer Data Broker, Data Marketplace, Identity Resolution, Audience Data) with company names and descriptions
- **Dashboard link** — "Open Full Dashboard" opens the full network traffic view

### Dashboard

- **Privacy summary** — sentence summary of sites visited vs. domains contacted, with a risk breakdown bar (risky/unknown/benign) and alert line
- **Summary cards** — total requests, unique domains, third-party %, tracker/ad count, 3P domains, 3P scripts, WebSocket connections
- **Domains of concern** — ranked by concern score with category badges and pink DATA BROKER pill for broker domains
- **Category breakdown** — visual bar chart of all request categories (Advertising, Analytics, Social Tracking, Fingerprinting, Data Broker, CDN, and more)
- **Active tabs** — per-tab request counts and third-party domain lists
- **Data brokers** — collapsible section showing all detected broker domains grouped by type with company name, broker sub-type, description, and request count
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

1. **Domain database** — 550+ known domains mapped to categories (Advertising, Analytics, Social Tracking, Fingerprinting, Data Broker, Error Monitoring, A/B Testing, Chat/Support, Video/Media, Consent, Email/CRM, CDN, Fonts, Captcha, Payment, Auth, Maps). Data Broker domains are enriched with company name, broker sub-type, and description from the BROKER_META database (84 entries)
2. **Name patterns** — regex matching on domain names for keywords like `track`, `pixel`, `beacon`, `telemetry`, `adserver`, `metrics`, `collect`, `analytics`, `fingerprint`, etc.
3. **Request heuristics** — 1x1 tracking pixel detection (image type + tiny Content-Length) and beacon POST detection (POST + empty response body)

## Permissions

| Permission | Chrome (MV3) | Firefox (MV2) | Safari (MV2) | Why |
|---|---|---|---|---|
| `webRequest` | Yes | Yes | Yes | Monitor network traffic |
| `<all_urls>` | host_permissions | permissions | permissions | See requests to all domains |

No data is collected, transmitted, or stored outside the browser. All processing happens locally in the extension's background script.

## Project Structure

```
wearebaked/
├── chrome-extension/
│   ├── manifest.json      # MV3 manifest
│   ├── background.js      # Traffic capture + classification engine + BROKER_META
│   ├── popup.html          # Broker popup page
│   ├── popup.js            # Popup rendering (broker verdict per tab)
│   ├── popup.css           # Popup styles
│   ├── dashboard.html      # Full dashboard page
│   ├── dashboard.js        # Dashboard rendering + feed filters + broker section
│   ├── styles.css          # Dashboard styles
│   ├── icon48.png          # Extension icon (white circle)
│   ├── icon128.png         # Extension icon large (white circle)
│   └── favicon.png         # Tab favicon
├── firefox-extension/
│   ├── manifest.json      # MV2 manifest with gecko settings
│   ├── background.js      # Firefox-adapted (browser.* APIs) + BROKER_META
│   ├── popup.html          # Broker popup page
│   ├── popup.js            # Popup rendering (browser.* APIs, Promise-based)
│   ├── popup.css           # Popup styles
│   ├── dashboard.html      # Full dashboard page
│   ├── dashboard.js        # Dashboard rendering + feed filters + broker section
│   ├── styles.css          # Dashboard styles
│   ├── icon48.png          # Extension icon (white circle)
│   ├── icon128.png         # Extension icon large (white circle)
│   └── favicon.png         # Tab favicon
├── safari-extension/
│   ├── manifest.json      # MV2 manifest (no gecko-specific settings)
│   ├── background.js      # Same as Firefox (browser.* APIs) + BROKER_META
│   ├── popup.html          # Same as Firefox
│   ├── popup.js            # Same as Firefox
│   ├── popup.css           # Same as Firefox
│   ├── dashboard.html      # Same as Firefox
│   ├── dashboard.js        # Same as Firefox
│   ├── styles.css          # Same as Firefox
│   ├── icon48.png          # Same as Firefox
│   ├── icon128.png         # Same as Firefox
│   └── favicon.png         # Same as Firefox
├── .github/workflows/
│   └── build-safari.yml   # GitHub Actions: build Safari .app on macOS runner
├── store_icon_128.png      # Chrome Web Store icon (128x128)
├── promo_tile.png          # Chrome Web Store promo tile (440x280)
├── screenshot1.png         # Store screenshot with text (1280x800)
├── screenshot2.png         # Store screenshot logo only (1280x800)
├── net_monitor.py          # Python CLI network monitor
└── README.md
```

## Building the Safari Extension

Safari Web Extensions require Xcode on macOS. A GitHub Actions workflow (`.github/workflows/build-safari.yml`) automates this on every push to `main`:

1. `xcrun safari-web-extension-converter` converts `safari-extension/` into an Xcode project
2. `xcodebuild` builds the `.app` (unsigned, for local development)
3. The `.app` is uploaded as a GitHub Actions artifact

**To build locally (macOS):**

```bash
# Convert the web extension into an Xcode project
xcrun safari-web-extension-converter ./safari-extension \
  --app-name wearebaked \
  --bundle-identifier com.wearebaked.extension \
  --no-prompt --no-open --copy-resources

# Build the Xcode project (unsigned)
cd wearebaked
xcodebuild -scheme "wearebaked (macOS)" -configuration Release \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
```

The Safari extension source is identical to Firefox (same `browser.*` API, MV2 manifest) with the `browser_specific_settings.gecko` block removed.

## Changelog

### v0.5.1
- **Firefox ETP fix** — broker domains now detected even when Firefox Enhanced Tracking Protection blocks them (early classification in `onBeforeRequest` + `onErrorOccurred`)
- **Firefox messaging fix** — popup message handler returns Promises (native Firefox pattern) instead of `sendResponse` + `return true`
- Updated popup tagline to "network monitor · broker detector"
- Updated manifest descriptions and version across all variants
- Changed Firefox gecko ID for new AMO listing

### v0.5.0
- **Folded wearesold** (data broker detector) into wearebaked — 84 broker domains with company names, types, and descriptions
- **Folded weareopen** (third-party script audit) — 3P Scripts summary card
- **Broker popup** — click the extension icon to see data broker verdict for the current page, grouped by broker type
- **Data Brokers dashboard section** — collapsible section showing all detected brokers grouped by type
- **DATA BROKER pill badge** — broker domains in "Domains of Concern" show a pink badge
- **Data Broker category** — new category (hot pink) in bar chart, RISKY_CATEGORIES, and domain classification
- Reclassified ~28 domains from Fingerprinting/Advertising/Analytics/Social Tracking to Data Broker
- Added ~54 new broker domains to TRACKER_DOMAINS
- `classifyDomain()` now enriches results with `brokerName`, `brokerType`, `brokerDesc` from BROKER_META
- Manifests updated with `default_popup` (icon click opens popup instead of dashboard)

### v0.4.1
- Added Safari extension support (macOS) — based on Firefox source (`browser.*` API, MV2)
- Added GitHub Actions workflow (`build-safari.yml`) to build Safari `.app` on macOS runner
- Updated README with Safari install, build, and developer mode instructions

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


---

## The weare____ Suite

Privacy tools that show what's happening — no cloud, no accounts, nothing leaves your browser.

| Extension | What it exposes |
|-----------|----------------|
| [wearecooked](https://github.com/hamr0/wearecooked) | Cookies, tracking pixels, and beacons |
| [wearebaked](https://github.com/hamr0/wearebaked) | Network requests, third-party scripts, and data brokers |
| [weareleaking](https://github.com/hamr0/weareleaking) | localStorage and sessionStorage tracking data |
| [wearelinked](https://github.com/hamr0/wearelinked) | Redirect chains and tracking parameters in links |
| [wearewatched](https://github.com/hamr0/wearewatched) | Browser fingerprinting and silent permission access |
| [weareplayed](https://github.com/hamr0/weareplayed) | Dark patterns: fake urgency, confirm-shaming, pre-checked boxes |
| [wearetosed](https://github.com/hamr0/wearetosed) | Toxic clauses in privacy policies and terms of service |
| [wearesilent](https://github.com/hamr0/wearesilent) | Form input exfiltration before you click submit |

All extensions run entirely on your device and work on Chrome and Firefox.

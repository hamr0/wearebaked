# Changelog

All notable changes to wearebaked will be documented in this file.

## [0.4.1] - 2026-03-03

### Added
- Safari extension support (macOS) — based on Firefox source (`browser.*` API, MV2)
- GitHub Actions workflow (`build-safari.yml`) to build Safari `.app` on macOS runner
- Safari install, build, and developer mode instructions in README

## [0.4.0] - 2026-03-02

### Added
- `net_monitor_poc.py` — deep network monitor POC with DNS query parsing, TLS SNI extraction, TCP state tracking, and process mapping

### Changed
- Updated README with feature descriptions
- Firefox: bumped `strict_min_version` to 142.0, added `data_collection_permissions`

## [0.3.0] - 2026-03-02

### Added
- Privacy Summary section (visited sites count, domain risk bar, alert line) — Chrome and Firefox
- Live Feed filters — text search by domain, category dropdown, "3rd party only" toggle
- Tab favicon with white circle background
- Chrome Web Store assets (store icon, promo tile, screenshots)

### Changed
- Updated extension icons to black camera on white circle for visibility on dark backgrounds
- Firefox now matches Chrome feature parity (Privacy Summary, feed filters, PNG icon)

### Removed
- Redundant Refresh button from Firefox

## [0.2.0] - 2026-03-02

### Added
- Initial dashboard with summary cards, category breakdown, domain tracking
- Beaconing detection, redirect chains, data flow, WebSocket monitoring
- Live request feed
- Chrome (MV3) and Firefox (MV2) support

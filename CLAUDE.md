## Dev Rules

**POC first.** Always validate logic with a ~15min proof-of-concept before building. Cover happy path + common edges. POC works → design properly → build with tests. Never ship the POC.

**Build incrementally.** Break work into small independent modules. One piece at a time, each must work on its own before integrating.

**Dependency hierarchy — follow strictly:** vanilla language → standard library → external (only when stdlib can't do it in <100 lines). External deps must be maintained, lightweight, and widely adopted. Exception: always use vetted libraries for security-critical code (crypto, auth, sanitization).

**Lightweight over complex.** Fewer moving parts, fewer deps, less config. Express over NestJS, Flask over Django, unless the project genuinely needs the framework. Simple > clever. Readable > elegant.

**Open-source only.** No vendor lock-in. Every line of code must have a purpose — no speculative code, no premature abstractions.

For full development and testing standards, see `.claude/memory/AGENT_RULES.md`.

## Project: We Are Baked

Network traffic monitor — "Wireshark for normal people."

### Architecture
- `chrome-extension/` — Chrome MV3 extension using webRequest API
- `firefox-extension/` — Firefox MV2 extension (to be built, mirrors Chrome)
- `net_monitor.py` — Standalone Linux CLI using raw sockets (sudo required)

### Patterns
- Vanilla JS, no frameworks, no build step
- Dark theme, same design system as wearecooked (CSS variables)
- DOMParser for HTML rendering (AMO compliant, no innerHTML)
- All processing local — no data leaves the browser/device
- Dual browser builds: Chrome (MV3, optional permissions) + Firefox (MV2, pre-granted)

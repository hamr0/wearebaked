# Security Research Ideas

Monitoring tools that make the invisible visible. Same philosophy as wearebaked: no frameworks, local-only, show people what their devices are actually doing.

---

## 1. WiFi Probe Requests — Where Your Phone Has Been

**What it is:** Every phone constantly broadcasts "are you there?" to WiFi networks it previously connected to. These probe requests leak the names of networks you've joined — hotels, airports, workplaces, home networks (often containing real names/addresses).

**What you can see:**
- Device manufacturer (from MAC OUI prefix)
- List of networks the device is looking for (SSID history)
- Signal strength (rough distance)
- Temporal patterns (when devices appear/disappear)

**What you need:**
- USB WiFi adapter that supports monitor mode (~$15, Alfa AWUS036ACH or similar)
- Linux with `airmon-ng` to enable monitor mode
- `scapy` (Python) or `tcpdump` to capture 802.11 management frames

**iPhone limitations:**
- iOS cannot enter WiFi monitor mode — no API, hardware locked out
- Cannot capture probe requests on an iPhone, period
- Capturing must be done from a Linux machine with a compatible adapter
- You CAN capture an iPhone's own probes from external hardware

**iPhone countermeasures (since iOS 14):**
- MAC address randomized per-network, rotated every 24 hours
- Probe request sequence numbers randomized
- Information Element fields scrambled with rotating seed
- Despite this, academic research shows devices can still be fingerprinted via IE field content, timing patterns, and multi-channel correlation

**Sample code (Python + scapy):**
```python
from scapy.all import *

def handle_probe(pkt):
    if pkt.haslayer(Dot11ProbeReq):
        ssid = pkt[Dot11Elt].info.decode('utf-8', errors='ignore')
        mac = pkt[Dot11].addr2
        rssi = pkt.dBm_AntSignal if hasattr(pkt, 'dBm_AntSignal') else '?'
        print(f'{mac} looking for: "{ssid}" (signal: {rssi}dBm)')

sniff(iface='wlan0mon', prn=handle_probe, store=0)
```

**Output this enables:**
- "Your phone is broadcasting that it was connected to 'Marriott_Guest', 'CompanyName-5G', 'FBI Surveillance Van'"
- Map of every device in range and their network history
- Timeline of when devices enter/leave the area (foot traffic analysis)

---

## 2. Clipboard Snooping — Which Apps Read Your Clipboard

**What it is:** Apps read your clipboard to snoop on what you've copied — passwords, addresses, messages, crypto wallet addresses. TikTok was famously caught doing this in 2020.

**The timeline on iOS:**
| iOS Version | Clipboard Behavior |
|---|---|
| Pre-14 | Any foreground app reads clipboard silently |
| 14 | Banner notification: "App pasted from OtherApp" (informational only) |
| 16 | Blocking dialog: "Allow App to paste?" before read |
| 16.1+ | Per-app setting: Settings > App > Paste from Other Apps (Ask/Allow/Deny) |

**What apps can STILL do without triggering the dialog (iOS 16+):**
- `UIPasteboard.hasStrings` / `hasURLs` / `hasImages` — check if clipboard contains content types. No dialog.
- `detectPatterns(for:)` — detect if clipboard matches patterns (URLs, phone numbers, emails) WITHOUT reading the actual content. No dialog.
- If user previously tapped "Allow" — silent reads forever after.

**No known bypass on stock iOS 16+.** The attack surface is now social engineering users into tapping "Allow."

**On Linux/X11 — wide open:**
X11 has zero clipboard isolation. Any process can read the clipboard at any time. Wayland improved this (only focused window gets clipboard), but XWayland apps bypass it.

**What to build (Linux):**
Monitor X11 clipboard access events — log which process reads the clipboard, when, and what was in it. Show users: "Firefox copied a password, then 3 seconds later unknown_process read it."

```python
# Concept: monitor X11 clipboard changes
import subprocess, time

last = ''
while True:
    current = subprocess.run(['xclip', '-selection', 'clipboard', '-o'],
                             capture_output=True, text=True).stdout
    if current != last:
        print(f'Clipboard changed: {current[:50]}...')
        last = current
    time.sleep(0.5)
```

**Real research angle:**
- Audit popular Linux apps for clipboard behavior
- Test which Electron apps (Slack, Discord, VS Code) read clipboard and when
- Build a clipboard firewall that intercepts and prompts before allowing reads

---

## 3. Bluetooth/BLE Scanner — Who's Around You

**What it is:** Every Bluetooth device constantly advertises its presence. Phones, headphones, fitness trackers, smart locks, cars, AirTags — all broadcasting. Most people have no idea.

**What you can see from BLE advertisements:**
- Device name (often people's real names — "Sarah's AirPods")
- Manufacturer (Apple, Samsung, etc. from manufacturer data bytes)
- Service UUIDs (reveals device type — heart rate monitor, smart lock, etc.)
- TX power + RSSI (distance estimation)
- Connectable flag (can you interact with it?)
- Raw manufacturer-specific data (often contains firmware version, battery level)

**On Linux (full access):**
```bash
# Quick scan
sudo hcitool lescan

# Detailed with bluetoothctl
bluetoothctl scan on
```

Python with `bleak`:
```python
import asyncio
from bleak import BleakScanner

async def scan():
    devices = await BleakScanner.discover(timeout=10)
    for d in devices:
        print(f'{d.address} | {d.name or "unnamed"} | RSSI: {d.rssi}dBm')
        for uuid in (d.metadata.get('uuids') or []):
            print(f'  Service: {uuid}')

asyncio.run(scan())
```

**On iPhone (via Core Bluetooth):**
- CAN scan for BLE advertisements from an app
- CAN see: device name, service UUIDs, manufacturer data, RSSI, TX power
- CANNOT see: hardware MAC address (iOS assigns an opaque UUID per peripheral)
- CANNOT see: Apple's proprietary protocols (AirDrop, Handoff use AWDL, not exposed)
- Background scanning is heavily throttled: events coalesced, intervals increased, stops when device locked

**AirTag detection:**
- AirTags broadcast BLE every 2 seconds with a rotating public key
- iOS filters the specific AirTag payload from third-party apps
- Apple's anti-stalking detection runs below the Core Bluetooth API layer
- Android has better access to raw AirTag advertisement data
- **nRootTag research (Feb 2025):** demonstrated spoofing Find My network to track arbitrary Bluetooth devices with 90% success rate. Apple patched Dec 2024.

**What to build:**
A "who's near me" dashboard. Run it in a coffee shop:
- Every BLE device in range
- Categorized: phones, headphones, wearables, IoT, unknown
- Names exposed (the privacy problem)
- Signal strength timeline (track movement)
- Manufacturer breakdown
- Flag devices advertising unusual or insecure services

---

## 4. DNS Timeline — 24-Hour Behavioral Profile

**What it is:** Already built in `net_monitor_poc.py`. Run it for 24 hours and you get a complete behavioral fingerprint of everyone on the network.

**What a 24h DNS log reveals:**
- Wake/sleep times (first and last DNS queries)
- Apps used throughout the day (domains reveal the app)
- Work patterns (Slack, Jira, GitHub domains)
- Entertainment habits (Netflix, Spotify, YouTube, gaming)
- Health data (fitness tracker cloud syncs)
- Smart home activity (Alexa, Google Home, Hue)
- When automatic updates run
- Which services phone home on a schedule (telemetry beacons)

**What to add to the existing POC:**
- Timeline view (horizontal bar chart, hour by hour)
- Domain-to-app mapping database
- "Activity periods" detection (gaps = sleep/away)
- Telemetry frequency analysis (which services ping most often)
- Export as JSON for long-term tracking

**Research angle:**
This is what your ISP sees. This is what corporate IT sees. Showing people their own DNS timeline makes the abstract concept of metadata surveillance concrete.

---

## 5. Local Network Auditor — What's On Your Network

**What it is:** Scan your own LAN, find every device, check what services they expose, and whether they're secure.

**What you can find:**
- Every device on the network (ARP scan)
- Open ports per device (TCP SYN scan)
- Service banners (what software and version)
- Devices using unencrypted protocols (HTTP, Telnet, FTP)
- IoT devices with default credentials
- Devices phoning home to unexpected destinations

**Tools (all stdlib or lightweight):**
- ARP scan: `scapy` or raw socket ARP
- Port scan: stdlib `socket.connect_ex()`
- Banner grab: `socket.recv()` after connect
- mDNS discovery: parse `224.0.0.251:5353` (already captured in POC)

**Research angle:**
Most people's home networks have devices running services they don't know about. Smart TVs with open debug ports, printers with web UIs, IoT devices with telnet enabled. A "network health check" report would be immediately useful.

---

## 6. USB Watchdog — What Just Plugged In

**What it is:** Monitor USB bus for device connections. Alert when a device claims to be something suspicious (e.g., a "flash drive" that also registers as a keyboard — classic BadUSB attack).

**On Linux:**
```python
# Monitor udev events
import pyudev

context = pyudev.Context()
monitor = pyudev.Monitor.from_netlink(context)
monitor.filter_by(subsystem='usb')

for device in iter(monitor.poll, None):
    if device.action == 'add':
        vendor = device.get('ID_VENDOR', '?')
        product = device.get('ID_MODEL', '?')
        dev_type = device.get('ID_USB_DRIVER', '?')
        print(f'USB connected: {vendor} {product} (driver: {dev_type})')
```

**What to flag:**
- Device registers as HID (keyboard/mouse) but looks like storage
- Multiple device classes simultaneously (composite device)
- Unknown vendor IDs
- Device appears briefly then disconnects (data exfiltration)

**iPhone:** Not possible. iOS doesn't expose USB bus monitoring to apps.

---

## Priority Order

| Project | Effort | Impact | Novelty |
|---------|--------|--------|---------|
| DNS 24h timeline | Low (extend POC) | High | Medium |
| BLE "who's near me" | Medium | High | Medium |
| Local network auditor | Medium | High | Low |
| WiFi probe scanner | Medium | Very high | Medium |
| Clipboard monitor (Linux) | Low | Medium | High |
| USB watchdog | Low | Medium | Medium |

## iPhone-Specific Feasibility

| Capability | Stock iPhone | Jailbroken | External hardware |
|---|---|---|---|
| WiFi probe capture | No | Partial | Yes (Linux + monitor mode adapter) |
| Clipboard monitoring | No (iOS 16+ blocks it) | Yes | N/A |
| BLE scanning | Yes (Core Bluetooth, limited) | Yes (full) | Yes (Linux has full access) |
| Network traffic monitoring | No (no raw sockets) | Yes | Yes (mitmproxy on Linux) |
| USB monitoring | No | Partial | Yes (Linux host) |

**Bottom line:** For serious security research, an iPhone is the *target*, not the tool. The research platform is Linux. Build the monitoring tools on Linux, point them at the iPhone, and see what it does.

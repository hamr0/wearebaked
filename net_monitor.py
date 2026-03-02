#!/usr/bin/env python3
"""
We Are Baked — Network Traffic Monitor (CLI companion)
Captures real network traffic using raw sockets on Linux.
Shows who's connecting to your machine beyond just browser traffic.

Usage:
    sudo python3 net_monitor.py                    # live monitor
    sudo python3 net_monitor.py -o report.html     # capture for 60s, generate report
    sudo python3 net_monitor.py -d 120 -o out.html # capture for 120s

Requires: root/sudo (raw socket access)
Optional: pip install geoip2 (for IP geolocation)
"""

import socket
import struct
import sys
import time
import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# ── Protocol numbers ──
PROTOCOLS = {1: 'ICMP', 6: 'TCP', 17: 'UDP'}

# ── Known service ports ──
SERVICE_PORTS = {
    80: 'HTTP', 443: 'HTTPS', 53: 'DNS', 22: 'SSH', 21: 'FTP',
    25: 'SMTP', 110: 'POP3', 143: 'IMAP', 993: 'IMAPS', 995: 'POP3S',
    587: 'SMTP-TLS', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt',
    3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis', 27017: 'MongoDB',
    5353: 'mDNS', 1900: 'SSDP/UPnP', 123: 'NTP', 67: 'DHCP', 68: 'DHCP',
    137: 'NetBIOS', 138: 'NetBIOS', 139: 'NetBIOS', 445: 'SMB',
    51820: 'WireGuard', 1194: 'OpenVPN', 500: 'IKE/VPN',
}

# ── Known suspicious ports ──
SUSPICIOUS_PORTS = {
    4444, 5555, 6666, 6667, 31337,  # common backdoor/IRC
    1080, 3128, 8888, 9050, 9150,   # proxy/tor
}

# ── Private IP ranges ──
def is_private(ip):
    parts = ip.split('.')
    if len(parts) != 4:
        return False
    a, b = int(parts[0]), int(parts[1])
    if a == 10: return True
    if a == 172 and 16 <= b <= 31: return True
    if a == 192 and b == 168: return True
    if a == 127: return True
    return False


def parse_ip_header(data):
    """Parse IPv4 header from raw bytes."""
    if len(data) < 20:
        return None
    ihl = (data[0] & 0x0F) * 4
    if len(data) < ihl:
        return None
    total_len, _, _, ttl, proto = struct.unpack('!HHBBH', data[2:10])
    src = socket.inet_ntoa(data[12:16])
    dst = socket.inet_ntoa(data[16:20])
    return {
        'src': src, 'dst': dst, 'proto': proto,
        'proto_name': PROTOCOLS.get(proto, str(proto)),
        'ttl': ttl, 'length': total_len, 'ihl': ihl
    }


def parse_tcp_udp(data, ihl, proto):
    """Extract source and destination ports for TCP/UDP."""
    if len(data) < ihl + 4:
        return None, None
    src_port, dst_port = struct.unpack('!HH', data[ihl:ihl+4])
    return src_port, dst_port


def get_local_ips():
    """Get local IP addresses."""
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    ips.add('127.0.0.1')
    return ips


def reverse_dns(ip, cache={}):
    """Cached reverse DNS lookup."""
    if ip in cache:
        return cache[ip]
    try:
        host = socket.gethostbyaddr(ip)[0]
        cache[ip] = host
    except Exception:
        cache[ip] = None
    return cache[ip]


class TrafficCapture:
    def __init__(self):
        self.connections = []           # raw connection log
        self.ip_stats = defaultdict(lambda: {'count': 0, 'bytes': 0, 'ports': set(), 'protos': set(), 'first': None, 'last': None, 'direction': set()})
        self.port_stats = defaultdict(int)
        self.proto_stats = defaultdict(int)
        self.local_ips = get_local_ips()
        self.start_time = time.time()
        self.total_packets = 0
        self.total_bytes = 0

    def process_packet(self, data):
        hdr = parse_ip_header(data)
        if not hdr:
            return

        self.total_packets += 1
        self.total_bytes += hdr['length']
        self.proto_stats[hdr['proto_name']] += 1

        src_port, dst_port = None, None
        if hdr['proto'] in (6, 17):  # TCP or UDP
            src_port, dst_port = parse_tcp_udp(data, hdr['ihl'], hdr['proto'])

        # Determine direction
        is_incoming = hdr['dst'] in self.local_ips
        is_outgoing = hdr['src'] in self.local_ips
        remote_ip = hdr['src'] if is_incoming else hdr['dst']
        remote_port = src_port if is_incoming else dst_port
        local_port = dst_port if is_incoming else src_port
        direction = 'in' if is_incoming else 'out' if is_outgoing else 'pass'

        # Update IP stats
        ip = self.ip_stats[remote_ip]
        ip['count'] += 1
        ip['bytes'] += hdr['length']
        if remote_port:
            ip['ports'].add(remote_port)
        ip['protos'].add(hdr['proto_name'])
        ip['direction'].add(direction)
        now = time.time()
        if not ip['first']:
            ip['first'] = now
        ip['last'] = now

        # Port stats
        if local_port:
            self.port_stats[local_port] += 1

        # Connection log (keep last 2000)
        self.connections.append({
            'ts': now,
            'src': hdr['src'], 'dst': hdr['dst'],
            'proto': hdr['proto_name'],
            'src_port': src_port, 'dst_port': dst_port,
            'length': hdr['length'], 'ttl': hdr['ttl'],
            'direction': direction
        })
        if len(self.connections) > 2000:
            self.connections.pop(0)

    def classify_ip(self, ip):
        """Classify an IP address."""
        if is_private(ip):
            return 'Local Network'
        hostname = reverse_dns(ip)
        if hostname:
            for pattern, cat in [
                ('google', 'Google'), ('facebook', 'Meta'), ('amazon', 'Amazon/AWS'),
                ('microsoft', 'Microsoft'), ('apple', 'Apple'), ('cloudflare', 'Cloudflare'),
                ('akamai', 'Akamai CDN'), ('fastly', 'Fastly CDN'),
            ]:
                if pattern in hostname.lower():
                    return cat
        return 'External'

    def generate_report(self, output_path):
        """Generate HTML report."""
        duration = time.time() - self.start_time

        # Build report data
        top_talkers = sorted(self.ip_stats.items(), key=lambda x: x[1]['count'], reverse=True)[:30]
        report_ips = []
        for ip, stats in top_talkers:
            hostname = reverse_dns(ip)
            category = self.classify_ip(ip)
            suspicious_ports = stats['ports'] & SUSPICIOUS_PORTS
            known_services = [SERVICE_PORTS.get(p, '') for p in stats['ports'] if p in SERVICE_PORTS]

            report_ips.append({
                'ip': ip,
                'hostname': hostname or '—',
                'count': stats['count'],
                'bytes': stats['bytes'],
                'ports': sorted(stats['ports'])[:10],
                'protos': list(stats['protos']),
                'direction': list(stats['direction']),
                'category': category,
                'services': [s for s in known_services if s],
                'suspicious': len(suspicious_ports) > 0,
                'private': is_private(ip)
            })

        report_data = json.dumps({
            'generated': datetime.now().isoformat(),
            'duration': round(duration),
            'total_packets': self.total_packets,
            'total_bytes': self.total_bytes,
            'unique_ips': len(self.ip_stats),
            'proto_stats': dict(self.proto_stats),
            'port_stats': dict(sorted(self.port_stats.items(), key=lambda x: x[1], reverse=True)[:20]),
            'top_talkers': report_ips,
            'external_count': sum(1 for ip in self.ip_stats if not is_private(ip)),
        })

        html = HTML_TEMPLATE.replace('__REPORT_DATA__', report_data)
        Path(output_path).write_text(html)
        print(f'\nReport saved to {output_path}')


# ── HTML Report Template ──
HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>We Are Baked — Network Report</title>
<style>
:root {
  --bg: #0f1117; --surface: #1a1d27; --surface2: #242836; --border: #2e3346;
  --text: #e2e4ea; --text2: #8b8fa3; --accent: #6c5ce7;
  --red: #e74c3c; --orange: #e67e22; --green: #2ecc71; --blue: #3498db;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; line-height: 1.5; }
h1 { font-size: 1.8rem; margin-bottom: 4px; }
.subtitle { color: var(--text2); margin-bottom: 24px; font-size: 0.9rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
.card .label { color: var(--text2); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
.card .val { font-size: 1.8rem; font-weight: 700; margin-top: 4px; }
.section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 24px; }
.section h2 { font-size: 1.15rem; margin-bottom: 16px; }
table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
th { text-align: left; padding: 10px 8px; background: var(--surface2); color: var(--text2); font-weight: 600; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.04em; }
td { padding: 8px; border-bottom: 1px solid var(--border); }
tr:hover { background: var(--surface2); }
.tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; margin: 1px 2px; }
.tag-in { background: rgba(52,152,219,0.15); color: var(--blue); }
.tag-out { background: rgba(230,126,34,0.15); color: var(--orange); }
.tag-suspicious { background: rgba(231,76,60,0.15); color: var(--red); }
.tag-local { background: rgba(46,204,113,0.15); color: var(--green); }
.tag-external { background: rgba(108,92,231,0.15); color: var(--accent); }
.footer { text-align: center; color: var(--text2); font-size: 0.78rem; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<h1>We Are Baked — Network Report</h1>
<p class="subtitle">Captured network traffic analysis</p>
<div id="app"></div>
<script>
const D = __REPORT_DATA__;
const app = document.getElementById('app');

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtBytes(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b/1024).toFixed(1) + ' KB'; return (b/1048576).toFixed(1) + ' MB'; }

let html = '<div class="cards">';
html += `<div class="card"><div class="label">Duration</div><div class="val">${D.duration}s</div></div>`;
html += `<div class="card"><div class="label">Total Packets</div><div class="val">${D.total_packets.toLocaleString()}</div></div>`;
html += `<div class="card"><div class="label">Total Data</div><div class="val">${fmtBytes(D.total_bytes)}</div></div>`;
html += `<div class="card"><div class="label">Unique IPs</div><div class="val">${D.unique_ips}</div></div>`;
html += `<div class="card"><div class="label">External IPs</div><div class="val" style="color:var(--orange)">${D.external_count}</div></div>`;
html += '</div>';

html += '<div class="section"><h2>Protocol Breakdown</h2><div class="cards">';
for (const [proto, count] of Object.entries(D.proto_stats)) {
  html += `<div class="card"><div class="label">${esc(proto)}</div><div class="val" style="color:var(--accent)">${count.toLocaleString()}</div></div>`;
}
html += '</div></div>';

html += '<div class="section"><h2>Top Connections</h2><table><thead><tr>';
html += '<th>IP</th><th>Hostname</th><th>Category</th><th>Packets</th><th>Data</th><th>Ports</th><th>Direction</th></tr></thead><tbody>';
for (const t of D.top_talkers) {
  const catTag = t.private ? '<span class="tag tag-local">Local</span>' :
                 t.suspicious ? '<span class="tag tag-suspicious">Suspicious</span>' :
                 `<span class="tag tag-external">${esc(t.category)}</span>`;
  const dirs = t.direction.map(d => `<span class="tag tag-${d}">${d}</span>`).join('');
  const ports = t.services.length > 0 ? t.services.join(', ') : t.ports.slice(0, 5).join(', ');
  html += `<tr><td>${esc(t.ip)}</td><td>${esc(t.hostname)}</td><td>${catTag}</td>`;
  html += `<td>${t.count.toLocaleString()}</td><td>${fmtBytes(t.bytes)}</td>`;
  html += `<td>${esc(ports)}</td><td>${dirs}</td></tr>`;
}
html += '</tbody></table></div>';

html += '<div class="footer">We Are Baked · Captured locally · No data sent anywhere</div>';

const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');
while (doc.body.firstChild) app.appendChild(document.adoptNode(doc.body.firstChild));
</script>
</body>
</html>'''


def live_monitor(sock, capture):
    """Print live traffic to terminal."""
    print(f'Monitoring traffic... (Ctrl+C to stop)')
    print(f'Local IPs: {", ".join(capture.local_ips)}')
    print(f'{"Time":<10} {"Direction":<5} {"Protocol":<6} {"Source":<22} {"Destination":<22} {"Service":<10} {"Size":<8}')
    print('─' * 90)

    while True:
        try:
            data = sock.recv(65535)
            capture.process_packet(data)
            conn = capture.connections[-1] if capture.connections else None
            if not conn:
                continue

            src = conn['src']
            dst = conn['dst']
            if conn['src_port']:
                src += f':{conn["src_port"]}'
            if conn['dst_port']:
                dst += f':{conn["dst_port"]}'

            port = conn['dst_port'] or conn['src_port'] or 0
            service = SERVICE_PORTS.get(port, '')

            direction = conn['direction'].upper()
            ts = datetime.fromtimestamp(conn['ts']).strftime('%H:%M:%S')

            # Color-code direction
            if conn['direction'] == 'in':
                prefix = '\033[94m'  # blue
            elif conn['direction'] == 'out':
                prefix = '\033[93m'  # yellow
            else:
                prefix = '\033[90m'  # gray
            reset = '\033[0m'

            print(f'{prefix}{ts:<10} {direction:<5} {conn["proto"]:<6} {src:<22} {dst:<22} {service:<10} {conn["length"]:<8}{reset}')

        except KeyboardInterrupt:
            break


def main():
    parser = argparse.ArgumentParser(description='We Are Baked — Network Traffic Monitor')
    parser.add_argument('-o', '--output', help='Save HTML report to file')
    parser.add_argument('-d', '--duration', type=int, default=60, help='Capture duration in seconds (default: 60)')
    parser.add_argument('--json', help='Save raw data as JSON')
    args = parser.parse_args()

    if sys.platform != 'linux':
        print('Error: Raw socket capture requires Linux. Use the browser extension on other platforms.')
        sys.exit(1)

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_TCP)
    except PermissionError:
        print('Error: Raw sockets require root. Run with: sudo python3 net_monitor.py')
        sys.exit(1)

    # Also listen for UDP and ICMP
    sock_udp = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_UDP)
    sock_icmp = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_ICMP)

    capture = TrafficCapture()

    if args.output:
        # Timed capture mode
        print(f'Capturing traffic for {args.duration}s...')
        end_time = time.time() + args.duration
        sock.settimeout(1.0)
        sock_udp.settimeout(1.0)
        sock_icmp.settimeout(1.0)

        while time.time() < end_time:
            for s in (sock, sock_udp, sock_icmp):
                try:
                    data = s.recv(65535)
                    capture.process_packet(data)
                except socket.timeout:
                    pass
            elapsed = int(time.time() - capture.start_time)
            remaining = args.duration - elapsed
            print(f'\r  {elapsed}s elapsed, {capture.total_packets} packets, {remaining}s remaining...', end='', flush=True)

        capture.generate_report(args.output)
        if args.json:
            json_data = {
                'generated': datetime.now().isoformat(),
                'duration': args.duration,
                'total_packets': capture.total_packets,
                'connections': capture.connections[-500:]
            }
            Path(args.json).write_text(json.dumps(json_data, indent=2, default=str))
            print(f'JSON saved to {args.json}')
    else:
        # Live monitor mode
        try:
            live_monitor(sock, capture)
        except KeyboardInterrupt:
            pass
        print(f'\n\nCaptured {capture.total_packets} packets from {len(capture.ip_stats)} unique IPs')
        if input('Save report? (y/N): ').strip().lower() == 'y':
            path = input('Output path (default: ~/net_report.html): ').strip() or str(Path.home() / 'net_report.html')
            capture.generate_report(path)

    sock.close()
    sock_udp.close()
    sock_icmp.close()


if __name__ == '__main__':
    main()

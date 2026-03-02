#!/usr/bin/env python3
"""
We Are Baked — Deep Network Monitor POC
Captures TCP/UDP/ICMP traffic with DNS query parsing, TLS SNI extraction,
and TCP connection state tracking. Shows what your machine is really doing.

Usage:
    sudo python3 net_monitor_poc.py                    # live monitor
    sudo python3 net_monitor_poc.py -o report.html     # capture for 60s, generate report
    sudo python3 net_monitor_poc.py -d 120 -o out.html # capture for 120s

Requires: root/sudo (raw socket access), Linux only
"""

import socket
import struct
import sys
import time
import argparse
import json
import os
import select
from collections import defaultdict
from datetime import datetime
from pathlib import Path


def real_user_home():
    """Get the real user's home dir, even under sudo."""
    sudo_user = os.environ.get('SUDO_USER')
    if sudo_user:
        return Path(f'/home/{sudo_user}')
    return Path.home()

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

# ── TCP flags ──
TCP_FIN = 0x01
TCP_SYN = 0x02
TCP_RST = 0x04
TCP_PSH = 0x08
TCP_ACK = 0x10

# ── Known telemetry / phoning-home domains ──
TELEMETRY_PATTERNS = [
    'telemetry', 'analytics', 'tracking', 'metric', 'crash', 'report',
    'diagnostic', 'usage', 'stats', 'beacon', 'collect', 'ping',
]


def is_private(ip):
    """Check if IP is in a private range."""
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
    total_len, _, _, ttl, proto = struct.unpack('!HHHBB', data[2:10])
    src = socket.inet_ntoa(data[12:16])
    dst = socket.inet_ntoa(data[16:20])
    return {
        'src': src, 'dst': dst, 'proto': proto,
        'proto_name': PROTOCOLS.get(proto, str(proto)),
        'ttl': ttl, 'length': total_len, 'ihl': ihl
    }


def parse_tcp_header(data, ihl):
    """Parse TCP header including flags."""
    if len(data) < ihl + 14:
        return None
    src_port, dst_port, seq, ack, offset_flags = struct.unpack(
        '!HHIIH', data[ihl:ihl + 14]
    )
    data_offset = (offset_flags >> 12) * 4
    flags = offset_flags & 0x3F
    return {
        'src_port': src_port, 'dst_port': dst_port,
        'seq': seq, 'ack': ack,
        'flags': flags, 'data_offset': data_offset,
        'syn': bool(flags & TCP_SYN), 'ack_flag': bool(flags & TCP_ACK),
        'fin': bool(flags & TCP_FIN), 'rst': bool(flags & TCP_RST),
        'psh': bool(flags & TCP_PSH),
    }


def parse_udp_header(data, ihl):
    """Parse UDP header."""
    if len(data) < ihl + 8:
        return None
    src_port, dst_port, length = struct.unpack('!HHH', data[ihl:ihl + 6])
    return {'src_port': src_port, 'dst_port': dst_port, 'length': length}


# ── DNS Parser ──

def parse_dns(data, ihl):
    """Parse DNS query/response from UDP payload."""
    udp_start = ihl + 8  # skip UDP header
    if len(data) < udp_start + 12:
        return None

    dns = data[udp_start:]
    if len(dns) < 12:
        return None

    txn_id, flags, qd_count, an_count = struct.unpack('!HHHH', dns[:8])
    is_response = bool(flags & 0x8000)
    rcode = flags & 0x000F

    # Parse question section
    queries = []
    offset = 12
    for _ in range(qd_count):
        name, offset = _read_dns_name(dns, offset)
        if name is None or offset + 4 > len(dns):
            break
        qtype, qclass = struct.unpack('!HH', dns[offset:offset + 4])
        offset += 4
        queries.append({'name': name, 'type': _dns_type_name(qtype)})

    # Parse answer section (for responses)
    answers = []
    if is_response:
        for _ in range(an_count):
            if offset >= len(dns):
                break
            name, offset = _read_dns_name(dns, offset)
            if name is None or offset + 10 > len(dns):
                break
            rtype, rclass, ttl, rdlength = struct.unpack('!HHIH', dns[offset:offset + 10])
            offset += 10
            rdata = None
            if rtype == 1 and rdlength == 4 and offset + 4 <= len(dns):  # A record
                rdata = socket.inet_ntoa(dns[offset:offset + 4])
            elif rtype == 5 and offset + rdlength <= len(dns):  # CNAME
                rdata, _ = _read_dns_name(dns, offset)
            offset += rdlength
            answers.append({'name': name, 'type': _dns_type_name(rtype), 'data': rdata, 'ttl': ttl})

    return {
        'is_response': is_response,
        'rcode': rcode,
        'queries': queries,
        'answers': answers,
    }


def _read_dns_name(data, offset):
    """Read a DNS name with pointer compression."""
    parts = []
    seen = set()
    while offset < len(data):
        if offset in seen:
            return None, offset  # loop detected
        seen.add(offset)
        length = data[offset]
        if length == 0:
            offset += 1
            break
        if (length & 0xC0) == 0xC0:  # pointer
            if offset + 2 > len(data):
                return None, offset
            ptr = struct.unpack('!H', data[offset:offset + 2])[0] & 0x3FFF
            offset += 2
            name, _ = _read_dns_name(data, ptr)
            if name:
                parts.append(name)
            return '.'.join(parts) if parts else None, offset
        offset += 1
        if offset + length > len(data):
            return None, offset
        try:
            parts.append(data[offset:offset + length].decode('ascii'))
        except UnicodeDecodeError:
            return None, offset
        offset += length
    return '.'.join(parts) if parts else None, offset


def _dns_type_name(qtype):
    """Map DNS record type number to name."""
    types = {1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR',
             15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 65: 'HTTPS'}
    return types.get(qtype, str(qtype))


# ── TLS SNI Parser ──

def parse_tls_sni(data, ihl, tcp_data_offset):
    """Extract SNI hostname from TLS ClientHello."""
    tls_start = ihl + tcp_data_offset
    if len(data) < tls_start + 6:
        return None

    tls = data[tls_start:]
    # TLS record: content_type(1) version(2) length(2)
    if tls[0] != 0x16:  # handshake
        return None
    if len(tls) < 5:
        return None
    record_len = struct.unpack('!H', tls[3:5])[0]
    if len(tls) < 5 + record_len:
        return None

    hs = tls[5:]
    if hs[0] != 0x01:  # ClientHello
        return None
    if len(hs) < 4:
        return None
    hs_len = struct.unpack('!I', b'\x00' + hs[1:4])[0]
    if len(hs) < 4 + hs_len:
        return None

    # Skip: version(2) + random(32) = 34
    pos = 4 + 2 + 32
    if pos >= len(hs):
        return None

    # Session ID
    sid_len = hs[pos]
    pos += 1 + sid_len
    if pos + 2 > len(hs):
        return None

    # Cipher suites
    cs_len = struct.unpack('!H', hs[pos:pos + 2])[0]
    pos += 2 + cs_len
    if pos >= len(hs):
        return None

    # Compression methods
    cm_len = hs[pos]
    pos += 1 + cm_len
    if pos + 2 > len(hs):
        return None

    # Extensions
    ext_len = struct.unpack('!H', hs[pos:pos + 2])[0]
    pos += 2
    ext_end = pos + ext_len

    while pos + 4 <= ext_end and pos + 4 <= len(hs):
        ext_type, ext_data_len = struct.unpack('!HH', hs[pos:pos + 4])
        pos += 4
        if ext_type == 0x0000:  # SNI extension
            if pos + 5 > len(hs):
                return None
            # SNI list: list_len(2) type(1) name_len(2) name
            sni_list_len = struct.unpack('!H', hs[pos:pos + 2])[0]
            sni_type = hs[pos + 2]
            sni_name_len = struct.unpack('!H', hs[pos + 3:pos + 5])[0]
            if sni_type == 0x00 and pos + 5 + sni_name_len <= len(hs):
                try:
                    return hs[pos + 5:pos + 5 + sni_name_len].decode('ascii')
                except UnicodeDecodeError:
                    return None
            return None
        pos += ext_data_len

    return None


# ── Process mapper (reads /proc/net/tcp) ──

def get_process_map():
    """Map local_addr:port -> PID/process name via /proc."""
    pmap = {}
    for proto_file in ('/proc/net/tcp', '/proc/net/udp'):
        try:
            with open(proto_file) as f:
                lines = f.readlines()[1:]  # skip header
            for line in lines:
                parts = line.split()
                if len(parts) < 10:
                    continue
                local = parts[1]
                inode = parts[9]
                ip_hex, port_hex = local.split(':')
                port = int(port_hex, 16)
                # Convert hex IP to dotted
                ip_int = int(ip_hex, 16)
                ip = f'{ip_int & 0xFF}.{(ip_int >> 8) & 0xFF}.{(ip_int >> 16) & 0xFF}.{(ip_int >> 24) & 0xFF}'
                pmap[(ip, port)] = inode
        except (OSError, ValueError):
            pass

    # Map inodes to PIDs
    inode_to_pid = {}
    try:
        proc = Path('/proc')
        for pid_dir in proc.iterdir():
            if not pid_dir.name.isdigit():
                continue
            fd_dir = pid_dir / 'fd'
            try:
                for fd in fd_dir.iterdir():
                    try:
                        link = fd.resolve(strict=False)
                        link_str = str(link)
                        if 'socket:[' in link_str:
                            inode = link_str.split('socket:[')[1].rstrip(']')
                            # Read cmdline for process name
                            cmdline = (pid_dir / 'cmdline').read_text().split('\x00')[0]
                            name = Path(cmdline).name if cmdline else pid_dir.name
                            inode_to_pid[inode] = {'pid': pid_dir.name, 'name': name}
                    except (OSError, IndexError):
                        pass
            except OSError:
                pass
    except OSError:
        pass

    # Merge: (ip, port) -> {pid, name}
    result = {}
    for key, inode in pmap.items():
        if inode in inode_to_pid:
            result[key] = inode_to_pid[inode]
    return result


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
    ips.add('127.0.0.53')  # systemd-resolved stub
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


# ── Main capture engine ──

class DeepCapture:
    def __init__(self):
        self.connections = []
        self.ip_stats = defaultdict(lambda: {
            'count': 0, 'bytes': 0, 'ports': set(), 'protos': set(),
            'first': None, 'last': None, 'direction': set()
        })
        self.port_stats = defaultdict(int)
        self.proto_stats = defaultdict(int)
        self.local_ips = get_local_ips()
        self.start_time = time.time()
        self.total_packets = 0
        self.total_bytes = 0

        # New: deep inspection data
        self.dns_queries = []        # all DNS queries seen
        self.dns_map = {}            # domain -> [resolved IPs]
        self.sni_hosts = defaultdict(lambda: {'count': 0, 'bytes': 0, 'ips': set()})
        self.tcp_sessions = {}       # (src,sport,dst,dport) -> state
        self.process_map = {}        # (ip, port) -> {pid, name}
        self.domain_stats = defaultdict(lambda: {'queries': 0, 'packets': 0, 'bytes': 0, 'first': None, 'last': None})

        # Refresh process map periodically
        self._last_pmap_refresh = 0

    def _refresh_process_map(self):
        now = time.time()
        if now - self._last_pmap_refresh > 5:  # every 5s
            self.process_map = get_process_map()
            self._last_pmap_refresh = now

    def _get_process(self, ip, port):
        """Look up process for a local ip:port."""
        if not port:
            return None
        # Try exact match
        info = self.process_map.get((ip, port))
        if info:
            return info
        # Try 0.0.0.0 (listening on all interfaces)
        return self.process_map.get(('0.0.0.0', port))

    def process_packet(self, raw_frame):
        # Strip Ethernet header (14 bytes) if using AF_PACKET
        if len(raw_frame) < 14:
            return
        eth_proto = struct.unpack('!H', raw_frame[12:14])[0]
        if eth_proto != 0x0800:  # only IPv4
            return
        data = raw_frame[14:]
        hdr = parse_ip_header(data)
        if not hdr:
            return

        self.total_packets += 1
        self.total_bytes += hdr['length']
        self.proto_stats[hdr['proto_name']] += 1
        self._refresh_process_map()

        src_port, dst_port = None, None
        extra = {}

        if hdr['proto'] == 6:  # TCP
            tcp = parse_tcp_header(data, hdr['ihl'])
            if tcp:
                src_port, dst_port = tcp['src_port'], tcp['dst_port']
                extra['tcp_flags'] = tcp['flags']
                self._track_tcp_session(hdr, tcp)

                # Try TLS SNI on SYN or first data packet to port 443
                if dst_port == 443 or src_port == 443:
                    sni = parse_tls_sni(data, hdr['ihl'], tcp['data_offset'])
                    if sni:
                        extra['sni'] = sni
                        self.sni_hosts[sni]['count'] += 1
                        self.sni_hosts[sni]['bytes'] += hdr['length']
                        self.sni_hosts[sni]['ips'].add(hdr['dst'] if dst_port == 443 else hdr['src'])
                        ds = self.domain_stats[sni]
                        ds['packets'] += 1
                        ds['bytes'] += hdr['length']
                        now = time.time()
                        if not ds['first']:
                            ds['first'] = now
                        ds['last'] = now

        elif hdr['proto'] == 17:  # UDP
            udp = parse_udp_header(data, hdr['ihl'])
            if udp:
                src_port, dst_port = udp['src_port'], udp['dst_port']

                # DNS parsing
                if src_port == 53 or dst_port == 53:
                    dns = parse_dns(data, hdr['ihl'])
                    if dns:
                        extra['dns'] = dns
                        self._process_dns(dns)

        # Direction
        is_incoming = hdr['dst'] in self.local_ips
        is_outgoing = hdr['src'] in self.local_ips
        remote_ip = hdr['src'] if is_incoming else hdr['dst']
        remote_port = src_port if is_incoming else dst_port
        local_port = dst_port if is_incoming else src_port
        direction = 'in' if is_incoming else 'out' if is_outgoing else 'pass'

        # Process lookup
        local_ip = hdr['dst'] if is_incoming else hdr['src']
        proc = self._get_process(local_ip, local_port)
        if proc:
            extra['process'] = proc

        # IP stats
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

        if local_port:
            self.port_stats[local_port] += 1

        conn = {
            'ts': now,
            'src': hdr['src'], 'dst': hdr['dst'],
            'proto': hdr['proto_name'],
            'src_port': src_port, 'dst_port': dst_port,
            'length': hdr['length'], 'ttl': hdr['ttl'],
            'direction': direction,
        }
        conn.update(extra)
        self.connections.append(conn)
        if len(self.connections) > 5000:
            self.connections.pop(0)

    def _process_dns(self, dns):
        """Track DNS queries and build domain->IP map."""
        for q in dns.get('queries', []):
            name = q['name']
            if name:
                self.dns_queries.append({
                    'ts': time.time(),
                    'domain': name,
                    'type': q['type'],
                    'is_response': dns['is_response'],
                })
                ds = self.domain_stats[name]
                ds['queries'] += 1
                now = time.time()
                if not ds['first']:
                    ds['first'] = now
                ds['last'] = now

        if dns['is_response']:
            for a in dns.get('answers', []):
                if a['data'] and a['name']:
                    if a['name'] not in self.dns_map:
                        self.dns_map[a['name']] = []
                    if a['data'] not in self.dns_map[a['name']]:
                        self.dns_map[a['name']].append(a['data'])

    def _track_tcp_session(self, hdr, tcp):
        """Track TCP connection state via flags."""
        key = (hdr['src'], tcp['src_port'], hdr['dst'], tcp['dst_port'])
        rev = (hdr['dst'], tcp['dst_port'], hdr['src'], tcp['src_port'])

        if tcp['syn'] and not tcp['ack_flag']:
            # SYN — new connection attempt
            self.tcp_sessions[key] = {
                'state': 'SYN_SENT', 'start': time.time(),
                'bytes_out': 0, 'bytes_in': 0, 'packets': 1
            }
        elif tcp['syn'] and tcp['ack_flag']:
            # SYN-ACK — connection accepted
            if rev in self.tcp_sessions:
                self.tcp_sessions[rev]['state'] = 'ESTABLISHED'
                self.tcp_sessions[rev]['packets'] += 1
        elif tcp['fin']:
            # FIN — closing
            sess = self.tcp_sessions.get(key) or self.tcp_sessions.get(rev)
            if sess:
                sess['state'] = 'CLOSING'
                sess['end'] = time.time()
                sess['packets'] += 1
        elif tcp['rst']:
            # RST — reset/rejected
            sess = self.tcp_sessions.get(key) or self.tcp_sessions.get(rev)
            if sess:
                sess['state'] = 'RESET'
                sess['end'] = time.time()
                sess['packets'] += 1
        else:
            # Data packet
            sess = self.tcp_sessions.get(key)
            if sess:
                sess['bytes_out'] += hdr['length']
                sess['packets'] += 1
            else:
                sess = self.tcp_sessions.get(rev)
                if sess:
                    sess['bytes_in'] += hdr['length']
                    sess['packets'] += 1

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
                ('mozilla', 'Mozilla'), ('ubuntu', 'Ubuntu/Canonical'),
                ('fedora', 'Fedora'), ('github', 'GitHub'), ('docker', 'Docker'),
            ]:
                if pattern in hostname.lower():
                    return cat
        return 'External'

    def _find_domain_for_ip(self, ip):
        """Reverse lookup: find DNS domain that resolved to this IP."""
        for domain, ips in self.dns_map.items():
            if ip in ips:
                return domain
        return None

    def _detect_telemetry(self, domain):
        """Check if domain looks like telemetry/tracking."""
        if not domain:
            return False
        dl = domain.lower()
        return any(p in dl for p in TELEMETRY_PATTERNS)

    def generate_report(self, output_path):
        """Generate HTML report with deep inspection data."""
        duration = time.time() - self.start_time

        # Top talkers
        top_talkers = sorted(self.ip_stats.items(), key=lambda x: x[1]['count'], reverse=True)[:30]
        report_ips = []
        for ip, stats in top_talkers:
            hostname = reverse_dns(ip)
            category = self.classify_ip(ip)
            suspicious_ports = stats['ports'] & SUSPICIOUS_PORTS
            known_services = [SERVICE_PORTS.get(p, '') for p in stats['ports'] if p in SERVICE_PORTS]
            domain = self._find_domain_for_ip(ip) or (hostname or '')

            report_ips.append({
                'ip': ip,
                'hostname': hostname or '—',
                'domain': domain,
                'count': stats['count'],
                'bytes': stats['bytes'],
                'ports': sorted(stats['ports'])[:10],
                'protos': list(stats['protos']),
                'direction': list(stats['direction']),
                'category': category,
                'services': [s for s in known_services if s],
                'suspicious': len(suspicious_ports) > 0,
                'private': is_private(ip),
                'telemetry': self._detect_telemetry(domain),
            })

        # DNS queries (unique domains, sorted by frequency)
        dns_freq = defaultdict(int)
        for q in self.dns_queries:
            if not q['is_response']:
                dns_freq[q['domain']] += 1
        dns_top = sorted(dns_freq.items(), key=lambda x: x[1], reverse=True)[:50]
        report_dns = []
        for domain, count in dns_top:
            resolved = self.dns_map.get(domain, [])
            report_dns.append({
                'domain': domain,
                'count': count,
                'resolved': resolved[:5],
                'telemetry': self._detect_telemetry(domain),
            })

        # TLS SNI hosts
        sni_top = sorted(self.sni_hosts.items(), key=lambda x: x[1]['count'], reverse=True)[:30]
        report_sni = []
        for host, stats in sni_top:
            report_sni.append({
                'host': host,
                'count': stats['count'],
                'bytes': stats['bytes'],
                'telemetry': self._detect_telemetry(host),
            })

        # TCP sessions summary
        session_states = defaultdict(int)
        for sess in self.tcp_sessions.values():
            session_states[sess['state']] += 1

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
            'dns_queries': report_dns,
            'dns_total': len(self.dns_queries),
            'sni_hosts': report_sni,
            'tcp_sessions': dict(session_states),
            'tcp_session_count': len(self.tcp_sessions),
            'telemetry_count': sum(1 for d in dns_freq if self._detect_telemetry(d)),
        })

        html = HTML_TEMPLATE.replace('__REPORT_DATA__', report_data)
        out = Path(output_path).resolve()
        out.write_text(html)
        # Fix ownership if running under sudo so the real user can open it
        sudo_user = os.environ.get('SUDO_USER')
        if sudo_user:
            import pwd
            pw = pwd.getpwnam(sudo_user)
            os.chown(out, pw.pw_uid, pw.pw_gid)
        print(f'\nReport saved to {out}')
        print(f'Open it with: xdg-open {out}')


# ── HTML Report Template ──
HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>We Are Baked — Deep Network Report</title>
<style>
:root {
  --bg: #0f1117; --surface: #1a1d27; --surface2: #242836; --border: #2e3346;
  --text: #e2e4ea; --text2: #8b8fa3; --accent: #6c5ce7;
  --red: #e74c3c; --orange: #e67e22; --green: #2ecc71; --blue: #3498db;
  --yellow: #f1c40f;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; line-height: 1.5; }
h1 { font-size: 1.8rem; margin-bottom: 4px; }
.subtitle { color: var(--text2); margin-bottom: 24px; font-size: 0.9rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 24px; }
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
.tag-telemetry { background: rgba(241,196,15,0.15); color: var(--yellow); }
.tag-local { background: rgba(46,204,113,0.15); color: var(--green); }
.tag-external { background: rgba(108,92,231,0.15); color: var(--accent); }
.footer { text-align: center; color: var(--text2); font-size: 0.78rem; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
</style>
</head>
<body>
<h1>We Are Baked — Deep Network Report</h1>
<p class="subtitle">System-wide traffic analysis with DNS + TLS inspection</p>
<div id="app"></div>
<script>
const D = __REPORT_DATA__;
const app = document.getElementById('app');

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtBytes(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b/1024).toFixed(1) + ' KB'; return (b/1048576).toFixed(1) + ' MB'; }

let html = '<div class="cards">';
html += `<div class="card"><div class="label">Duration</div><div class="val">${D.duration}s</div></div>`;
html += `<div class="card"><div class="label">Packets</div><div class="val">${D.total_packets.toLocaleString()}</div></div>`;
html += `<div class="card"><div class="label">Data</div><div class="val">${fmtBytes(D.total_bytes)}</div></div>`;
html += `<div class="card"><div class="label">Unique IPs</div><div class="val">${D.unique_ips}</div></div>`;
html += `<div class="card"><div class="label">DNS Queries</div><div class="val" style="color:var(--blue)">${D.dns_total}</div></div>`;
html += `<div class="card"><div class="label">TCP Sessions</div><div class="val" style="color:var(--accent)">${D.tcp_session_count}</div></div>`;
html += `<div class="card"><div class="label">Telemetry</div><div class="val" style="color:var(--yellow)">${D.telemetry_count}</div></div>`;
html += `<div class="card"><div class="label">External IPs</div><div class="val" style="color:var(--orange)">${D.external_count}</div></div>`;
html += '</div>';

// DNS Queries section
html += '<div class="section"><h2>DNS Queries — What Your Machine Looked Up</h2>';
html += '<table><thead><tr><th>Domain</th><th>Queries</th><th>Resolved To</th><th>Flags</th></tr></thead><tbody>';
for (const d of D.dns_queries) {
  const flags = d.telemetry ? '<span class="tag tag-telemetry">Telemetry</span>' : '';
  const resolved = d.resolved.length > 0 ? esc(d.resolved.join(', ')) : '—';
  html += `<tr><td>${esc(d.domain)}</td><td>${d.count}</td><td>${resolved}</td><td>${flags}</td></tr>`;
}
html += '</tbody></table></div>';

// TLS SNI section
if (D.sni_hosts.length > 0) {
  html += '<div class="section"><h2>TLS Connections — Encrypted Destinations</h2>';
  html += '<table><thead><tr><th>Hostname</th><th>Connections</th><th>Data</th><th>Flags</th></tr></thead><tbody>';
  for (const s of D.sni_hosts) {
    const flags = s.telemetry ? '<span class="tag tag-telemetry">Telemetry</span>' : '';
    html += `<tr><td>${esc(s.host)}</td><td>${s.count}</td><td>${fmtBytes(s.bytes)}</td><td>${flags}</td></tr>`;
  }
  html += '</tbody></table></div>';
}

// TCP Sessions summary
html += '<div class="section"><h2>TCP Session States</h2><div class="cards">';
for (const [state, count] of Object.entries(D.tcp_sessions)) {
  const color = state === 'ESTABLISHED' ? 'var(--green)' : state === 'RESET' ? 'var(--red)' : 'var(--text)';
  html += `<div class="card"><div class="label">${esc(state)}</div><div class="val" style="color:${color}">${count}</div></div>`;
}
html += '</div></div>';

// Protocol breakdown
html += '<div class="section"><h2>Protocol Breakdown</h2><div class="cards">';
for (const [proto, count] of Object.entries(D.proto_stats)) {
  html += `<div class="card"><div class="label">${esc(proto)}</div><div class="val" style="color:var(--accent)">${count.toLocaleString()}</div></div>`;
}
html += '</div></div>';

// Top connections
html += '<div class="section"><h2>Top Connections</h2><table><thead><tr>';
html += '<th>IP</th><th>Domain</th><th>Category</th><th>Packets</th><th>Data</th><th>Ports</th><th>Direction</th></tr></thead><tbody>';
for (const t of D.top_talkers) {
  let catTag = t.private ? '<span class="tag tag-local">Local</span>' :
               t.suspicious ? '<span class="tag tag-suspicious">Suspicious</span>' :
               `<span class="tag tag-external">${esc(t.category)}</span>`;
  if (t.telemetry) catTag += ' <span class="tag tag-telemetry">Telemetry</span>';
  const dirs = t.direction.map(d => `<span class="tag tag-${d}">${d}</span>`).join('');
  const ports = t.services.length > 0 ? t.services.join(', ') : t.ports.slice(0, 5).join(', ');
  const domain = t.domain || t.hostname;
  html += `<tr><td>${esc(t.ip)}</td><td>${esc(domain)}</td><td>${catTag}</td>`;
  html += `<td>${t.count.toLocaleString()}</td><td>${fmtBytes(t.bytes)}</td>`;
  html += `<td>${esc(ports)}</td><td>${dirs}</td></tr>`;
}
html += '</tbody></table></div>';

html += '<div class="footer">We Are Baked · Deep capture · All data stays local</div>';

const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');
while (doc.body.firstChild) app.appendChild(document.adoptNode(doc.body.firstChild));
</script>
</body>
</html>'''


def live_monitor(sock, capture):
    """Print live traffic with deep inspection info."""
    print('Deep monitoring... (Ctrl+C to stop)')
    print(f'Local IPs: {", ".join(capture.local_ips)}')
    print(f'{"Time":<10} {"Dir":<4} {"Proto":<5} {"Source":<22} {"Destination":<22} {"Info":<30} {"Size":<8}')
    print('─' * 105)

    while True:
        try:
            readable, _, _ = select.select([sock], [], [], 0.1)
            for s in readable:
                data = s.recv(65535)
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

                # Build info string
                info_parts = []
                if 'dns' in conn:
                    dns = conn['dns']
                    for q in dns.get('queries', []):
                        prefix = 'A' if dns['is_response'] else 'Q'
                        info_parts.append(f'DNS {prefix}: {q["name"]}')
                    for a in dns.get('answers', []):
                        if a['data']:
                            info_parts.append(f'-> {a["data"]}')
                elif 'sni' in conn:
                    info_parts.append(f'TLS: {conn["sni"]}')
                else:
                    port = conn['dst_port'] or conn['src_port'] or 0
                    service = SERVICE_PORTS.get(port, '')
                    if service:
                        info_parts.append(service)
                    if 'tcp_flags' in conn:
                        flags = conn['tcp_flags']
                        flag_str = ''
                        if flags & TCP_SYN: flag_str += 'S'
                        if flags & TCP_ACK: flag_str += 'A'
                        if flags & TCP_FIN: flag_str += 'F'
                        if flags & TCP_RST: flag_str += 'R'
                        if flags & TCP_PSH: flag_str += 'P'
                        if flag_str:
                            info_parts.append(f'[{flag_str}]')

                if 'process' in conn:
                    info_parts.append(f'({conn["process"]["name"]})')

                info = ' '.join(info_parts)[:30]

                direction = conn['direction'].upper()
                ts = datetime.fromtimestamp(conn['ts']).strftime('%H:%M:%S')

                # Color
                if 'dns' in conn:
                    prefix = '\033[96m'  # cyan
                elif 'sni' in conn:
                    prefix = '\033[95m'  # magenta
                elif conn['direction'] == 'in':
                    prefix = '\033[94m'  # blue
                elif conn['direction'] == 'out':
                    prefix = '\033[93m'  # yellow
                else:
                    prefix = '\033[90m'  # gray
                reset = '\033[0m'

                print(f'{prefix}{ts:<10} {direction:<4} {conn["proto"]:<5} {src:<22} {dst:<22} {info:<30} {conn["length"]:<8}{reset}')

        except KeyboardInterrupt:
            break


def main():
    parser = argparse.ArgumentParser(description='We Are Baked — Deep Network Monitor (POC)')
    parser.add_argument('-o', '--output', help='Save HTML report to file')
    parser.add_argument('-d', '--duration', type=int, default=60, help='Capture duration in seconds (default: 60)')
    parser.add_argument('--json', help='Save raw data as JSON')
    args = parser.parse_args()

    if sys.platform != 'linux':
        print('Error: Raw socket capture requires Linux.')
        sys.exit(1)

    # AF_PACKET captures all traffic at link layer (like Wireshark)
    # ETH_P_ALL (0x0003) = all protocols
    try:
        sock = socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.ntohs(0x0003))
    except PermissionError:
        print('Error: Raw sockets require root. Run with: sudo python3 net_monitor_poc.py')
        sys.exit(1)

    capture = DeepCapture()

    if args.output:
        print(f'Deep capture for {args.duration}s... (Ctrl+C to stop early and save)')
        end_time = time.time() + args.duration

        try:
            while time.time() < end_time:
                readable, _, _ = select.select([sock], [], [], 1.0)
                for s in readable:
                    try:
                        data = s.recv(65535)
                        capture.process_packet(data)
                    except socket.timeout:
                        pass
                elapsed = int(time.time() - capture.start_time)
                remaining = args.duration - elapsed
                dns_count = len(capture.dns_queries)
                sni_count = len(capture.sni_hosts)
                print(f'\r  {elapsed}s | {capture.total_packets} pkts | {dns_count} DNS | {sni_count} TLS hosts | {remaining}s left', end='', flush=True)
        except KeyboardInterrupt:
            print(f'\n  Stopped early after {int(time.time() - capture.start_time)}s')

        capture.generate_report(args.output)
        if args.json:
            json_data = {
                'generated': datetime.now().isoformat(),
                'duration': args.duration,
                'total_packets': capture.total_packets,
                'dns_queries': capture.dns_queries[-500:],
                'dns_map': capture.dns_map,
                'connections': capture.connections[-500:]
            }
            Path(args.json).write_text(json.dumps(json_data, indent=2, default=str))
            print(f'JSON saved to {args.json}')
    else:
        try:
            live_monitor(sock, capture)
        except KeyboardInterrupt:
            pass
        print(f'\n\nCaptured {capture.total_packets} packets from {len(capture.ip_stats)} unique IPs')
        print(f'DNS queries: {len(capture.dns_queries)} | TLS hosts: {len(capture.sni_hosts)} | TCP sessions: {len(capture.tcp_sessions)}')
        if input('Save report? (y/N): ').strip().lower() == 'y':
            default_path = real_user_home() / 'deep_report.html'
            path = input(f'Output path (default: {default_path}): ').strip() or str(default_path)
            capture.generate_report(path)

    sock.close()


if __name__ == '__main__':
    main()

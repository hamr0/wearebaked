/* ── Helpers ── */
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

function fmtBytes(n) {
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const val = n / Math.pow(1024, i);
  return val.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function fmtInterval(ms) {
  const sec = ms / 1000;
  if (sec < 60) return Math.round(sec) + 's';
  return (sec / 60).toFixed(1) + 'min';
}

const RISKY_CATEGORIES = ['Advertising', 'Analytics', 'Social Tracking', 'Fingerprinting', 'A/B Testing', 'Data Broker'];
const BENIGN_CATEGORIES = ['cdn', 'fonts', 'captcha', 'payment', 'auth', 'maps', 'Video/Media', 'Chat/Support', 'Consent', 'Email/CRM', 'Error Monitoring'];

function catClass(category) {
  const map = {
    'Advertising': 'cat-advertising',
    'Analytics': 'cat-analytics',
    'Social Tracking': 'cat-social',
    'Fingerprinting': 'cat-fingerprinting',
    'cdn': 'cat-cdn',
    'fonts': 'cat-fonts',
    'captcha': 'cat-captcha',
    'payment': 'cat-payment',
    'Error Monitoring': 'cat-error-monitoring',
    'A/B Testing': 'cat-abtesting',
    'Chat/Support': 'cat-chat',
    'Video/Media': 'cat-video',
    'Consent': 'cat-consent',
    'Email/CRM': 'cat-email',
    'auth': 'cat-auth',
    'maps': 'cat-maps',
    'Data Broker': 'cat-databroker'
  };
  return map[category] || 'cat-unknown';
}

function catColor(category) {
  const map = {
    'Advertising': 'var(--red)',
    'Analytics': 'var(--orange)',
    'Social Tracking': 'var(--yellow)',
    'Fingerprinting': '#ff6b6b',
    'cdn': 'var(--green)',
    'fonts': 'var(--blue)',
    'captcha': 'var(--text2)',
    'payment': 'var(--green)',
    'First Party': 'var(--accent)',
    'Error Monitoring': '#e056a0',
    'A/B Testing': '#9b59b6',
    'Chat/Support': '#1abc9c',
    'Video/Media': '#e74c3c',
    'Consent': '#95a5a6',
    'Email/CRM': '#d35400',
    'auth': 'var(--blue)',
    'maps': 'var(--green)',
    'Data Broker': '#e056a0',
    'unknown': 'var(--text2)'
  };
  return map[category] || 'var(--text2)';
}

function attachToggle(toggleId, wrapId) {
  const wrap = document.getElementById(wrapId);
  const toggle = document.getElementById(toggleId);
  toggle.addEventListener('click', () => {
    const visible = wrap.style.display !== 'none';
    wrap.style.display = visible ? 'none' : 'block';
    toggle.querySelector('.toggle-hint').textContent = visible ? 'Click to expand' : 'Click to collapse';
  });
}

/* ── Rendering ── */
function renderCards(data) {
  const { totals, domains, websockets } = data;
  const uniqueDomains = Object.keys(domains).length;
  const thirdPartyDomains = Object.values(domains).filter(d => d.thirdPartyOn.length > 0).length;
  const riskyDomains = Object.values(domains).filter(d => d.classification.risky).length;
  const pct = totals.count > 0 ? Math.round((totals.thirdParty / totals.count) * 100) : 0;
  const wsCount = Object.keys(websockets || {}).length;

  let tpScripts = 0;
  for (const d of Object.values(domains)) {
    if (d.thirdPartyOn.length > 0 && d.types.script) tpScripts += d.types.script;
  }

  const cards = [
    { label: 'Total Requests', val: totals.count, cls: 'accent' },
    { label: 'Unique Domains', val: uniqueDomains, cls: 'blue' },
    { label: 'Third-Party', val: `${pct}%`, cls: pct > 60 ? 'red' : pct > 30 ? 'orange' : 'green' },
    { label: 'Trackers / Ads', val: riskyDomains, cls: riskyDomains > 5 ? 'red' : riskyDomains > 0 ? 'orange' : 'green' },
    { label: '3P Domains', val: thirdPartyDomains, cls: thirdPartyDomains > 10 ? 'orange' : 'blue' },
    { label: '3P Scripts', val: tpScripts, cls: tpScripts > 50 ? 'red' : tpScripts > 20 ? 'orange' : 'green' },
    { label: 'WebSockets', val: wsCount, cls: wsCount > 0 ? 'orange' : 'green' }
  ];

  const el = document.getElementById('cards');
  el.textContent = '';
  for (const c of cards) {
    const card = document.createElement('div');
    card.className = 'card';
    const lbl = document.createElement('div');
    lbl.className = 'label';
    lbl.textContent = c.label;
    const val = document.createElement('div');
    val.className = 'val ' + c.cls;
    val.textContent = c.val;
    card.appendChild(lbl);
    card.appendChild(val);
    el.appendChild(card);
  }
}

function renderPrivacySummary(data) {
  const { domains, tabs } = data;
  const el = document.getElementById('privacy-summary');
  el.textContent = '';
  el.className = 'privacy-summary';

  // Count visited sites (unique tab domains)
  const tabDomains = new Set();
  for (const tab of Object.values(tabs)) {
    if (tab.domain) tabDomains.add(tab.domain);
  }
  const visitedCount = tabDomains.size;
  const totalUnique = Object.keys(domains).length;
  const otherCount = Math.max(0, totalUnique - visitedCount);

  // Split domains by risk
  let riskyCount = 0;
  let benignCount = 0;
  let unknownCount = 0;
  for (const d of Object.values(domains)) {
    const cat = d.classification.category;
    if (RISKY_CATEGORIES.includes(cat)) riskyCount++;
    else if (BENIGN_CATEGORIES.includes(cat)) benignCount++;
    else if (cat === 'unknown') unknownCount++;
    else benignCount++; // First Party and anything else goes benign
  }

  // Main sentence
  const sentence = document.createElement('div');
  sentence.className = 'privacy-sentence';
  const visitedStrong = document.createElement('strong');
  visitedStrong.textContent = visitedCount + ' site' + (visitedCount !== 1 ? 's' : '');
  const otherStrong = document.createElement('strong');
  otherStrong.textContent = otherCount + ' other domain' + (otherCount !== 1 ? 's' : '');
  sentence.appendChild(document.createTextNode('You visited '));
  sentence.appendChild(visitedStrong);
  sentence.appendChild(document.createTextNode('. Your browser talked to '));
  sentence.appendChild(otherStrong);
  sentence.appendChild(document.createTextNode('.'));
  el.appendChild(sentence);

  // Stacked bar
  const total = riskyCount + benignCount + unknownCount;
  if (total > 0) {
    const bar = document.createElement('div');
    bar.className = 'privacy-bar';

    if (riskyCount > 0) {
      const seg = document.createElement('div');
      seg.className = 'privacy-bar-segment risky';
      seg.style.width = (riskyCount / total * 100) + '%';
      seg.title = riskyCount + ' risky';
      if (riskyCount / total > 0.1) seg.textContent = riskyCount;
      bar.appendChild(seg);
    }
    if (unknownCount > 0) {
      const seg = document.createElement('div');
      seg.className = 'privacy-bar-segment unknown';
      seg.style.width = (unknownCount / total * 100) + '%';
      seg.title = unknownCount + ' unknown';
      if (unknownCount / total > 0.1) seg.textContent = unknownCount;
      bar.appendChild(seg);
    }
    if (benignCount > 0) {
      const seg = document.createElement('div');
      seg.className = 'privacy-bar-segment benign';
      seg.style.width = (benignCount / total * 100) + '%';
      seg.title = benignCount + ' benign';
      if (benignCount / total > 0.1) seg.textContent = benignCount;
      bar.appendChild(seg);
    }

    el.appendChild(bar);
  }

  // Alert one-liner
  const alert = document.createElement('div');
  alert.className = 'privacy-alert';
  if (riskyCount > 20) {
    alert.classList.add('alert-red');
    alert.textContent = riskyCount + ' tracking-related domains detected';
  } else if (riskyCount > 5) {
    alert.classList.add('alert-orange');
    alert.textContent = riskyCount + ' tracking-related domains detected';
  } else {
    alert.classList.add('alert-green');
    alert.textContent = riskyCount === 0
      ? 'No tracking-related domains detected'
      : riskyCount + ' tracking-related domain' + (riskyCount !== 1 ? 's' : '') + ' detected';
  }
  el.appendChild(alert);
}

function renderDomains(data) {
  const { domains } = data;

  // Filter to risky or unknown only, exclude benign
  const concerning = Object.entries(domains)
    .filter(([, v]) => v.thirdPartyOn.length > 0)
    .filter(([, v]) => {
      const cat = v.classification.category;
      return v.classification.risky || cat === 'unknown';
    });

  // Compute concern score per domain
  const scored = concerning.map(([domain, info]) => {
    const risky = info.classification.risky ? 50 : 0;
    const beacon = (info.beaconScore || 0) * 0.3;
    const uploadHeavy = (info.bytesSent > 0 && info.bytesSent > info.bytesReceived * 0.5) ? 20 : 0;
    const thirdPartySpread = (info.thirdPartyOn.length || 0) * 2;
    const score = Math.min(100, risky + beacon + uploadHeavy + thirdPartySpread);
    return [domain, info, score];
  });

  // Sort by concern score descending
  scored.sort((a, b) => b[2] - a[2]);
  const top = scored.slice(0, 20);

  const el = document.getElementById('domain-list');
  el.textContent = '';
  if (top.length === 0) {
    el.textContent = 'No domains of concern detected. Browse some sites first.';
    el.style.color = 'var(--text2)';
    el.style.fontStyle = 'italic';
    return;
  }

  for (const [domain, info, score] of top) {
    const item = document.createElement('div');
    item.className = 'domain-item';

    const name = document.createElement('span');
    name.className = 'domain-name';
    name.textContent = domain;

    const badge = document.createElement('span');
    badge.className = 'concern-badge';
    badge.textContent = Math.round(score);
    if (score >= 60) badge.classList.add('concern-high');
    else if (score >= 30) badge.classList.add('concern-med');
    else badge.classList.add('concern-low');

    const cat = document.createElement('span');
    cat.className = 'domain-cat ' + catClass(info.classification.category);
    cat.textContent = info.classification.category;

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = info.count + ' req';

    item.appendChild(name);
    item.appendChild(badge);
    item.appendChild(cat);
    if (info.classification.brokerName) {
      const broker = document.createElement('span');
      broker.className = 'pill-broker';
      broker.textContent = 'DATA BROKER';
      broker.title = info.classification.brokerName;
      item.appendChild(broker);
    }
    item.appendChild(count);
    el.appendChild(item);
  }
}

function renderBrokers(data) {
  const { domains } = data;
  const el = document.getElementById('broker-list');
  el.textContent = '';

  const brokers = Object.entries(domains)
    .filter(([, d]) => d.classification.brokerName)
    .sort((a, b) => b[1].count - a[1].count);

  if (brokers.length === 0) {
    el.textContent = 'No data broker connections detected yet.';
    el.style.color = 'var(--text2)';
    el.style.fontStyle = 'italic';
    return;
  }

  // Group by broker type
  const groups = {};
  for (const [domain, info] of brokers) {
    const type = info.classification.brokerType || 'Other';
    if (!groups[type]) groups[type] = [];
    groups[type].push([domain, info]);
  }

  const typeOrder = ['Consumer Data Broker', 'Data Marketplace', 'Identity Resolution', 'Audience Data'];
  const sortedTypes = Object.keys(groups).sort((a, b) => {
    const ai = typeOrder.indexOf(a);
    const bi = typeOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  for (const type of sortedTypes) {
    const header = document.createElement('div');
    header.className = 'broker-type-header';
    header.textContent = type + ' (' + groups[type].length + ')';
    el.appendChild(header);

    for (const [domain, info] of groups[type]) {
      const item = document.createElement('div');
      item.className = 'broker-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'domain-name';
      nameSpan.textContent = info.classification.brokerName + ' (' + domain + ')';

      const desc = document.createElement('span');
      desc.className = 'broker-desc';
      desc.textContent = info.classification.brokerDesc;

      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = info.count + ' req';

      item.appendChild(nameSpan);
      item.appendChild(desc);
      item.appendChild(count);
      el.appendChild(item);
    }
  }
}

function renderCategories(data) {
  const { domains } = data;
  const cats = {};
  for (const d of Object.values(domains)) {
    const c = d.classification.category;
    cats[c] = (cats[c] || 0) + d.count;
  }

  let firstParty = 0;
  for (const d of Object.values(domains)) {
    if (d.thirdPartyOn.length === 0) firstParty += d.count;
  }
  if (firstParty > 0) cats['First Party'] = firstParty;

  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const max = sorted.length > 0 ? sorted[0][1] : 1;

  const el = document.getElementById('cat-bars');
  el.textContent = '';
  for (const [cat, count] of sorted) {
    const row = document.createElement('div');
    row.className = 'cat-bar-row';

    const label = document.createElement('div');
    label.className = 'cat-bar-label';
    label.textContent = cat;

    const track = document.createElement('div');
    track.className = 'cat-bar-track';

    const fill = document.createElement('div');
    fill.className = 'cat-bar-fill';
    fill.style.width = Math.max(2, (count / max) * 100) + '%';
    fill.style.background = catColor(cat);
    fill.textContent = count;

    track.appendChild(fill);

    const countEl = document.createElement('div');
    countEl.className = 'cat-bar-count';
    countEl.textContent = count;

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(countEl);
    el.appendChild(row);
  }
}

function renderTabs(data) {
  const { tabs } = data;
  const el = document.getElementById('tab-list');
  el.textContent = '';

  const tabEntries = Object.entries(tabs)
    .filter(([, v]) => v.domain)
    .sort((a, b) => b[1].requests - a[1].requests);

  if (tabEntries.length === 0) {
    el.textContent = 'No active tabs tracked yet.';
    el.style.color = 'var(--text2)';
    el.style.fontStyle = 'italic';
    return;
  }

  for (const [, tab] of tabEntries) {
    const item = document.createElement('div');
    item.className = 'tab-item';

    const domain = document.createElement('div');
    domain.className = 'tab-domain';
    domain.textContent = tab.domain;

    const stats = document.createElement('div');
    stats.className = 'tab-stats';
    stats.textContent = tab.requests + ' requests';

    const third = document.createElement('div');
    third.className = 'tab-third';
    const tp = tab.thirdParties.length;
    third.textContent = tp > 0 ? tp + ' third-party domains' : 'No third-party connections';
    if (tp === 0) third.style.color = 'var(--green)';

    item.appendChild(domain);
    item.appendChild(stats);
    item.appendChild(third);
    el.appendChild(item);
  }
}

/* ── New sections ── */

function renderBeacons(data) {
  const { domains } = data;
  const el = document.getElementById('beacon-list');
  el.textContent = '';

  const beacons = Object.entries(domains)
    .filter(([, d]) => d.beaconScore > 0)
    .sort((a, b) => b[1].beaconScore - a[1].beaconScore);

  if (beacons.length === 0) {
    el.textContent = 'No beaconing detected yet. Regular-interval requests will appear here.';
    el.style.color = 'var(--text2)';
    el.style.fontStyle = 'italic';
    return;
  }

  for (const [domain, info] of beacons) {
    const item = document.createElement('div');
    item.className = 'beacon-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'domain-name';
    nameSpan.textContent = domain;

    const catSpan = document.createElement('span');
    catSpan.className = 'domain-cat cat-beacon';
    catSpan.textContent = 'BEACON';

    const details = document.createElement('span');
    details.className = 'beacon-details';
    details.textContent = 'every ' + fmtInterval(info.beaconInterval) +
      ' · score ' + info.beaconScore +
      ' · ' + Math.round(info.beaconConfidence * 100) + '% confidence';

    item.appendChild(nameSpan);
    item.appendChild(catSpan);
    item.appendChild(details);
    el.appendChild(item);
  }
}

function renderNewDomains(data) {
  const { domains } = data;
  const el = document.getElementById('new-list');
  el.textContent = '';

  const newDomains = Object.entries(domains)
    .filter(([, d]) => d.isNew)
    .filter(([, d]) => {
      const cat = d.classification.category;
      return !BENIGN_CATEGORIES.includes(cat);
    })
    .sort((a, b) => b[1].firstSeen - a[1].firstSeen)
    .slice(0, 30);

  if (newDomains.length === 0) {
    el.textContent = 'No suspicious new domains this session.';
    el.style.color = 'var(--text2)';
    el.style.fontStyle = 'italic';
    return;
  }

  for (const [domain, info] of newDomains) {
    const item = document.createElement('div');
    item.className = 'domain-item';

    const name = document.createElement('span');
    name.className = 'domain-name';
    name.textContent = domain;

    const pill = document.createElement('span');
    pill.className = 'pill-new';
    pill.textContent = 'NEW';

    const cat = document.createElement('span');
    cat.className = 'domain-cat ' + catClass(info.classification.category);
    cat.textContent = info.classification.category;

    const time = document.createElement('span');
    time.className = 'count';
    time.textContent = fmtTime(info.firstSeen);

    item.appendChild(name);
    item.appendChild(pill);
    item.appendChild(cat);
    item.appendChild(time);
    el.appendChild(item);
  }
}

function renderRedirects(data) {
  const { redirectChains } = data;
  const el = document.getElementById('redirect-list');
  el.textContent = '';

  if (!redirectChains || redirectChains.length === 0) {
    el.textContent = 'No redirect chains captured yet.';
    el.style.color = 'var(--text2)';
    el.style.fontStyle = 'italic';
    return;
  }

  // Deduplicate by chain signature
  const seen = new Set();
  const unique = [];
  for (const rc of redirectChains) {
    const sig = rc.chain.map(u => extractDomainFromUrl(u)).join('→');
    if (!seen.has(sig)) {
      seen.add(sig);
      unique.push(rc);
    }
  }

  for (const rc of unique.slice(0, 20)) {
    const chainEl = document.createElement('div');
    chainEl.className = 'redirect-chain';

    const hops = rc.chain.map(u => extractDomainFromUrl(u));
    for (let i = 0; i < hops.length; i++) {
      const hop = document.createElement('span');
      hop.className = 'redirect-hop';
      hop.textContent = hops[i];
      // Color-code: first hop normal, middle hops orange, last hop depends
      if (i === 0) hop.style.color = 'var(--accent)';
      else if (i === hops.length - 1) hop.style.color = 'var(--text)';
      else hop.style.color = 'var(--orange)';
      chainEl.appendChild(hop);

      if (i < hops.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'redirect-arrow';
        arrow.textContent = '→';
        chainEl.appendChild(arrow);
      }
    }

    const countSpan = document.createElement('span');
    countSpan.className = 'count';
    countSpan.textContent = hops.length + ' hops';
    chainEl.appendChild(countSpan);

    el.appendChild(chainEl);
  }
}

function extractDomainFromUrl(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function renderDataFlow(data) {
  const { domains } = data;
  const el = document.getElementById('dataflow-list');
  el.textContent = '';

  const withData = Object.entries(domains)
    .filter(([, d]) => d.bytesReceived > 0 || d.bytesSent > 0)
    .sort((a, b) => (b[1].bytesSent + b[1].bytesReceived) - (a[1].bytesSent + a[1].bytesReceived))
    .slice(0, 20);

  if (withData.length === 0) {
    el.textContent = 'No data flow captured yet.';
    el.style.color = 'var(--text2)';
    el.style.fontStyle = 'italic';
    return;
  }

  for (const [domain, info] of withData) {
    const item = document.createElement('div');
    item.className = 'dataflow-item';

    const name = document.createElement('span');
    name.className = 'domain-name';
    name.textContent = domain;

    const down = document.createElement('span');
    down.className = 'dataflow-down';
    down.textContent = '↓ ' + fmtBytes(info.bytesReceived);

    const up = document.createElement('span');
    up.className = 'dataflow-up';
    up.textContent = '↑ ' + fmtBytes(info.bytesSent);

    // Flag upload-heavy domains
    if (info.bytesSent > 0 && info.bytesSent > info.bytesReceived * 0.5) {
      up.classList.add('upload-heavy');
    }

    item.appendChild(name);
    item.appendChild(down);
    item.appendChild(up);
    el.appendChild(item);
  }
}

function renderWebSockets(data) {
  const { websockets } = data;
  const el = document.getElementById('ws-list');
  el.textContent = '';

  const entries = Object.entries(websockets || {});
  if (entries.length === 0) {
    el.textContent = 'No WebSocket connections detected.';
    el.style.color = 'var(--text2)';
    el.style.fontStyle = 'italic';
    return;
  }

  for (const [domain, info] of entries) {
    const item = document.createElement('div');
    item.className = 'ws-item';

    const name = document.createElement('span');
    name.className = 'domain-name';
    name.textContent = domain;

    const active = (Date.now() - info.lastSeen) < 30000;
    const status = document.createElement('span');
    status.className = active ? 'ws-active' : 'ws-inactive';
    status.textContent = active ? 'ACTIVE' : 'IDLE';

    const details = document.createElement('span');
    details.className = 'count';
    details.textContent = info.count + ' msgs · since ' + fmtTime(info.firstSeen);

    item.appendChild(name);
    item.appendChild(status);
    item.appendChild(details);
    el.appendChild(item);
  }
}

function renderFeed(data) {
  const { requests } = data;
  const el = document.getElementById('feed-body');
  el.textContent = '';

  const recent = requests.slice().reverse().slice(0, 100);
  const categories = new Set();

  for (const r of recent) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-category', r.classification.category);
    tr.setAttribute('data-third-party', r.thirdParty ? '1' : '0');

    const tdTime = document.createElement('td');
    tdTime.textContent = fmtTime(r.ts);

    const tdDomain = document.createElement('td');
    tdDomain.textContent = r.domain;
    tdDomain.style.color = r.classification.risky ? 'var(--red)' : 'var(--accent)';

    const tdType = document.createElement('td');
    tdType.textContent = r.type;

    const tdStatus = document.createElement('td');
    tdStatus.textContent = r.statusCode || '—';
    if (r.statusCode >= 400) tdStatus.style.color = 'var(--red)';

    const tdCat = document.createElement('td');
    const catSpan = document.createElement('span');
    catSpan.className = 'domain-cat ' + catClass(r.classification.category);
    catSpan.textContent = r.classification.category;
    tdCat.appendChild(catSpan);

    const tdThird = document.createElement('td');
    tdThird.textContent = r.thirdParty ? 'Yes' : 'No';
    tdThird.className = r.thirdParty ? 'third-yes' : 'third-no';

    tr.appendChild(tdTime);
    tr.appendChild(tdDomain);
    tr.appendChild(tdType);
    tr.appendChild(tdStatus);
    tr.appendChild(tdCat);
    tr.appendChild(tdThird);
    el.appendChild(tr);

    categories.add(r.classification.category);
  }

  // Populate category dropdown
  const select = document.getElementById('feed-cat-filter');
  const current = select.value;
  select.textContent = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All Categories';
  select.appendChild(allOpt);
  for (const cat of [...categories].sort()) {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  }
  select.value = current;

  filterFeed();
}

function filterFeed() {
  const search = (document.getElementById('feed-search').value || '').toLowerCase();
  const cat = document.getElementById('feed-cat-filter').value;
  const thirdOnly = document.getElementById('feed-3p-only').checked;

  const rows = document.getElementById('feed-body').querySelectorAll('tr');
  for (const row of rows) {
    const domain = (row.children[1] && row.children[1].textContent || '').toLowerCase();
    const rowCat = row.getAttribute('data-category');
    const rowTP = row.getAttribute('data-third-party') === '1';

    const matchSearch = !search || domain.includes(search);
    const matchCat = !cat || rowCat === cat;
    const matchTP = !thirdOnly || rowTP;

    row.style.display = (matchSearch && matchCat && matchTP) ? '' : 'none';
  }
}

/* ── Data fetching ── */
function fetchAndRender() {
  chrome.runtime.sendMessage({ type: 'getTraffic' }, (data) => {
    if (!data) return;
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    renderCards(data);
    renderPrivacySummary(data);
    renderDomains(data);
    renderCategories(data);
    renderTabs(data);
    renderBrokers(data);
    renderBeacons(data);
    renderNewDomains(data);
    renderRedirects(data);
    renderDataFlow(data);
    renderWebSockets(data);
    renderFeed(data);
  });
}

function startDashboard() {
  fetchAndRender();

  // Auto-refresh
  let interval = setInterval(fetchAndRender, 3000);
  const chk = document.getElementById('chk-auto');
  chk.addEventListener('change', () => {
    if (chk.checked) {
      interval = setInterval(fetchAndRender, 3000);
    } else {
      clearInterval(interval);
    }
  });

  // Clear data
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('Clear all captured traffic data?')) {
      chrome.runtime.sendMessage({ type: 'clearTraffic' }, () => fetchAndRender());
    }
  });

  // Feed filters
  document.getElementById('feed-search').addEventListener('input', filterFeed);
  document.getElementById('feed-cat-filter').addEventListener('change', filterFeed);
  document.getElementById('feed-3p-only').addEventListener('change', filterFeed);

  // Attach all toggles
  attachToggle('toggle-brokers', 'broker-wrap');
  attachToggle('toggle-beacons', 'beacon-wrap');
  attachToggle('toggle-new', 'new-wrap');
  attachToggle('toggle-redirects', 'redirect-wrap');
  attachToggle('toggle-dataflow', 'dataflow-wrap');
  attachToggle('toggle-ws', 'ws-wrap');
  attachToggle('toggle-feed', 'feed-wrap');
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  startDashboard();
});

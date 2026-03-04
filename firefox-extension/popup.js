const TYPE_ORDER = ['Consumer Data Broker', 'Data Marketplace', 'Identity Resolution', 'Audience Data'];

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('open-dashboard').addEventListener('click', () => {
    browser.tabs.create({ url: 'dashboard.html' });
  });

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return;
  const tab = tabs[0];
  let tabDomain = '';
  try { tabDomain = new URL(tab.url).hostname; } catch {}

  const data = await browser.runtime.sendMessage({ type: 'getTraffic' });
  if (!data) return render(tabDomain, {});

  // Filter domains that are brokers AND were third-party on this tab
  const brokers = {};
  for (const [domain, info] of Object.entries(data.domains)) {
    if (info.classification.brokerName && info.thirdPartyOn.includes(tabDomain)) {
      brokers[domain] = {
        name: info.classification.brokerName,
        type: info.classification.brokerType,
        desc: info.classification.brokerDesc,
        count: info.count
      };
    }
  }
  render(tabDomain, brokers);
});

function render(domain, brokers) {
  const verdictEl = document.getElementById('verdict');
  const breakdownEl = document.getElementById('breakdown');
  const emptyEl = document.getElementById('empty');

  const brokerKeys = Object.keys(brokers);
  if (brokerKeys.length === 0) {
    verdictEl.appendChild(buildVerdict(domain, 0, 0));
    emptyEl.classList.remove('hidden');
    return;
  }

  let totalRequests = 0;
  const uniqueCompanies = {};
  for (const b of Object.values(brokers)) {
    totalRequests += b.count;
    uniqueCompanies[b.name] = true;
  }
  const companyCount = Object.keys(uniqueCompanies).length;

  verdictEl.appendChild(buildVerdict(domain, companyCount, totalRequests));
  breakdownEl.classList.remove('hidden');
  buildBreakdown(breakdownEl, brokers);
}

function buildVerdict(domain, total, requests) {
  let level = 'clean';
  let message = 'No data broker connections found.';
  if (total > 0 && total <= 3) {
    level = 'warn';
    message = total + ' broker' + (total !== 1 ? 's' : '') + ' \u00b7 ' + requests + ' request' + (requests !== 1 ? 's' : '');
  } else if (total > 3) {
    level = 'bad';
    message = total + ' brokers \u00b7 ' + requests + ' requests';
  }

  const wrap = el('div', 'verdict verdict-' + level);
  const domainEl = el('div', 'verdict-domain');
  domainEl.textContent = domain;
  wrap.appendChild(domainEl);

  const countEl = el('div', 'verdict-count');
  const num = el('span', 'verdict-flagged');
  num.textContent = total;
  countEl.appendChild(num);
  wrap.appendChild(countEl);

  const msg = el('div', 'verdict-message');
  msg.textContent = message;
  wrap.appendChild(msg);
  return wrap;
}

function buildBreakdown(container, brokers) {
  const types = {};
  for (const b of Object.values(brokers)) {
    const type = b.type || 'Other';
    if (!types[type]) types[type] = {};
    if (types[type][b.name]) {
      types[type][b.name].count += b.count;
    } else {
      types[type][b.name] = { name: b.name, desc: b.desc, count: b.count };
    }
  }

  const sortedTypes = TYPE_ORDER.filter(t => types[t]);
  for (const t of Object.keys(types)) {
    if (!TYPE_ORDER.includes(t)) sortedTypes.push(t);
  }

  const label = el('div', 'section-label');
  label.textContent = "Who's selling your data";
  container.appendChild(label);

  const bd = el('div', 'breakdown-list');
  for (const type of sortedTypes) {
    const list = Object.values(types[type]).sort((a, b) => b.count - a.count);

    const row = el('div', 'breakdown-row');
    const catEl = el('span', 'breakdown-category');
    catEl.textContent = type;
    row.appendChild(catEl);
    bd.appendChild(row);

    const domainList = el('div', 'domain-list');
    for (const broker of list) {
      const brokerRow = el('div', 'domain-row');
      const nameEl = el('span', 'domain-name');
      nameEl.textContent = broker.name;
      const descEl = el('span', 'domain-desc');
      descEl.textContent = broker.desc;
      brokerRow.appendChild(nameEl);
      brokerRow.appendChild(descEl);
      domainList.appendChild(brokerRow);
    }
    bd.appendChild(domainList);
  }
  container.appendChild(bd);
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

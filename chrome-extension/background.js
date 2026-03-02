/* ── State ── */
const traffic = {
  requests: [],     // last N requests for the live feed
  domains: {},      // domain → { count, types, firstSeen, lastSeen, thirdPartyOn, ... }
  tabs: {},         // tabId → { url, domain, requests, thirdParties }
  totals: { count: 0, blocked: 0, thirdParty: 0 },
  timing: {},           // requestId → startTs
  redirects: {},        // requestId → [url chain]
  finalRedirects: {},   // domain → [completed chain], cap 100
  websockets: {},       // domain → { firstSeen, lastSeen, count }
  sessionDomains: {}    // domain → true (for "NEW" flagging, object instead of Set for serialization)
};

const MAX_FEED = 500;
const MAX_TIMESTAMPS = 30;
const MAX_FINAL_REDIRECTS = 100;

/* ── Known tracker / ad domains ── */
const TRACKER_DOMAINS = {
  // Advertising
  'doubleclick.net': 'Advertising',
  'googlesyndication.com': 'Advertising',
  'googleadservices.com': 'Advertising',
  'ads-twitter.com': 'Advertising',
  'amazon-adsystem.com': 'Advertising',
  'criteo.com': 'Advertising',
  'outbrain.com': 'Advertising',
  'taboola.com': 'Advertising',
  'adnxs.com': 'Advertising',
  'rubiconproject.com': 'Advertising',
  'pubmatic.com': 'Advertising',
  'openx.net': 'Advertising',
  'casalemedia.com': 'Advertising',
  'moatads.com': 'Advertising',
  'adsrvr.org': 'Advertising',
  'media.net': 'Advertising',
  'bidswitch.net': 'Advertising',
  'sharethrough.com': 'Advertising',
  'triplelift.com': 'Advertising',
  'indexexchange.com': 'Advertising',
  'lijit.com': 'Advertising',
  'smartadserver.com': 'Advertising',
  'advertising.com': 'Advertising',
  'yieldmanager.com': 'Advertising',
  'serving-sys.com': 'Advertising',
  'adform.net': 'Advertising',
  'adcolony.com': 'Advertising',
  'unity3d.com': 'Advertising',
  'unityads.unity3d.com': 'Advertising',
  'applovin.com': 'Advertising',
  'mopub.com': 'Advertising',
  'inmobi.com': 'Advertising',
  'vungle.com': 'Advertising',
  'chartboost.com': 'Advertising',
  'ironsrc.com': 'Advertising',
  'tapjoy.com': 'Advertising',
  'admob.com': 'Advertising',
  'smaato.net': 'Advertising',
  'fyber.com': 'Advertising',
  'sovrn.com': 'Advertising',
  'conversantmedia.com': 'Advertising',
  'rhythmone.com': 'Advertising',
  'yieldmo.com': 'Advertising',
  'teads.tv': 'Advertising',
  'spotxchange.com': 'Advertising',
  'springserve.com': 'Advertising',
  'undertone.com': 'Advertising',
  'revjet.com': 'Advertising',
  '33across.com': 'Advertising',
  'gumgum.com': 'Advertising',
  'kargo.com': 'Advertising',
  'nativo.com': 'Advertising',
  'stackadapt.com': 'Advertising',
  'zedo.com': 'Advertising',
  'adtechus.com': 'Advertising',
  'tradedoubler.com': 'Advertising',
  'cj.com': 'Advertising',
  'linksynergy.com': 'Advertising',
  'awin1.com': 'Advertising',
  'impact.com': 'Advertising',
  'clickbank.net': 'Advertising',
  'jivox.com': 'Advertising',
  'flashtalking.com': 'Advertising',
  'innovid.com': 'Advertising',
  'celtra.com': 'Advertising',
  'sizmek.com': 'Advertising',
  'eyeviewdigital.com': 'Advertising',
  'adskeeper.com': 'Advertising',
  'revcontent.com': 'Advertising',
  'mgid.com': 'Advertising',
  'content-ad.net': 'Advertising',
  'adblade.com': 'Advertising',
  'adroll.com': 'Advertising',
  'perfectaudience.com': 'Advertising',
  'retargetly.com': 'Advertising',
  'steelhouse.com': 'Advertising',
  'rtbhouse.com': 'Advertising',
  'nextroll.com': 'Advertising',

  // Analytics
  'google-analytics.com': 'Analytics',
  'googletagmanager.com': 'Analytics',
  'hotjar.com': 'Analytics',
  'mixpanel.com': 'Analytics',
  'segment.io': 'Analytics',
  'segment.com': 'Analytics',
  'newrelic.com': 'Analytics',
  'clarity.ms': 'Analytics',
  'scorecardresearch.com': 'Analytics',
  'quantserve.com': 'Analytics',
  'amplitude.com': 'Analytics',
  'heap.io': 'Analytics',
  'heapanalytics.com': 'Analytics',
  'fullstory.com': 'Analytics',
  'logrocket.com': 'Analytics',
  'mouseflow.com': 'Analytics',
  'crazyegg.com': 'Analytics',
  'clicktale.net': 'Analytics',
  'luckyorange.com': 'Analytics',
  'inspectlet.com': 'Analytics',
  'pendo.io': 'Analytics',
  'walkme.com': 'Analytics',
  'userzoom.com': 'Analytics',
  'usertesting.com': 'Analytics',
  'contentsquare.com': 'Analytics',
  'chartbeat.com': 'Analytics',
  'parsely.com': 'Analytics',
  'parse.ly': 'Analytics',
  'matomo.cloud': 'Analytics',
  'plausible.io': 'Analytics',
  'simpleanalytics.com': 'Analytics',
  'fathom.com': 'Analytics',
  'umami.is': 'Analytics',
  'kissmetrics.io': 'Analytics',
  'woopra.com': 'Analytics',
  'clicky.com': 'Analytics',
  'statcounter.com': 'Analytics',
  'gauges.com': 'Analytics',
  'goatcounter.com': 'Analytics',
  'keen.io': 'Analytics',
  'countly.com': 'Analytics',
  'alexametrics.com': 'Analytics',
  'omtrdc.net': 'Analytics',
  'demdex.net': 'Analytics',
  'omniture.com': 'Analytics',
  'adobedtm.com': 'Analytics',
  'coremetrics.com': 'Analytics',
  'webtrends.com': 'Analytics',
  'tealiumiq.com': 'Analytics',
  'tealium.com': 'Analytics',
  'ensighten.com': 'Analytics',
  'commandersact.com': 'Analytics',
  'eulerian.net': 'Analytics',
  'atinternet.com': 'Analytics',
  'piano.io': 'Analytics',
  'cxense.com': 'Analytics',
  'permutive.com': 'Analytics',
  'rudderstack.com': 'Analytics',
  'mparticle.com': 'Analytics',
  'lytics.io': 'Analytics',
  'treasuredata.com': 'Analytics',
  'snowplow.io': 'Analytics',

  // Social Tracking
  'facebook.net': 'Social Tracking',
  'facebook.com': 'Social Tracking',
  'fbcdn.net': 'Social Tracking',
  'analytics.tiktok.com': 'Social Tracking',
  'connect.facebook.net': 'Social Tracking',
  'graph.facebook.com': 'Social Tracking',
  'pixel.facebook.com': 'Social Tracking',
  'instagram.com': 'Social Tracking',
  'twitter.com': 'Social Tracking',
  't.co': 'Social Tracking',
  'platform.twitter.com': 'Social Tracking',
  'linkedin.com': 'Social Tracking',
  'snap.licdn.com': 'Social Tracking',
  'px.ads.linkedin.com': 'Social Tracking',
  'snapchat.com': 'Social Tracking',
  'sc-static.net': 'Social Tracking',
  'pinterest.com': 'Social Tracking',
  'pinimg.com': 'Social Tracking',
  'reddit.com': 'Social Tracking',
  'redditstatic.com': 'Social Tracking',
  'quora.com': 'Social Tracking',
  'tumblr.com': 'Social Tracking',
  'addthis.com': 'Social Tracking',
  'addtoany.com': 'Social Tracking',
  'sharethis.com': 'Social Tracking',
  'sumo.com': 'Social Tracking',

  // Fingerprinting
  'krxd.net': 'Fingerprinting',
  'bluekai.com': 'Fingerprinting',
  'exelator.com': 'Fingerprinting',
  'agkn.com': 'Fingerprinting',
  'pippio.com': 'Fingerprinting',
  'rlcdn.com': 'Fingerprinting',
  'tapad.com': 'Fingerprinting',
  'liveramp.com': 'Fingerprinting',
  'adsymptotic.com': 'Fingerprinting',
  'crwdcntrl.net': 'Fingerprinting',
  'lotame.com': 'Fingerprinting',
  'eyeota.net': 'Fingerprinting',
  'bombora.com': 'Fingerprinting',
  'intentiq.com': 'Fingerprinting',
  'id5-sync.com': 'Fingerprinting',
  'liveintent.com': 'Fingerprinting',
  'zeotap.com': 'Fingerprinting',
  'fingerprintjs.com': 'Fingerprinting',

  // Error Monitoring
  'sentry.io': 'Error Monitoring',
  'sentry-cdn.com': 'Error Monitoring',
  'bugsnag.com': 'Error Monitoring',
  'rollbar.com': 'Error Monitoring',
  'errorception.com': 'Error Monitoring',
  'trackjs.com': 'Error Monitoring',
  'raygun.com': 'Error Monitoring',
  'airbrake.io': 'Error Monitoring',
  'honeybadger.io': 'Error Monitoring',
  'exceptionless.com': 'Error Monitoring',
  'loggly.com': 'Error Monitoring',
  'datadoghq.com': 'Error Monitoring',
  'datadoghq-browser-agent.com': 'Error Monitoring',
  'browser-intake-datadoghq.com': 'Error Monitoring',
  'nr-data.net': 'Error Monitoring',
  'newrelic.com': 'Error Monitoring',
  'bam.nr-data.net': 'Error Monitoring',
  'dynatrace.com': 'Error Monitoring',
  'appdynamics.com': 'Error Monitoring',
  'elastic.co': 'Error Monitoring',
  'logentries.com': 'Error Monitoring',
  'sumologic.com': 'Error Monitoring',
  'splunk.com': 'Error Monitoring',

  // A/B Testing
  'optimizely.com': 'A/B Testing',
  'abtasty.com': 'A/B Testing',
  'vwo.com': 'A/B Testing',
  'kameleoon.com': 'A/B Testing',
  'launchdarkly.com': 'A/B Testing',
  'split.io': 'A/B Testing',
  'flagsmith.com': 'A/B Testing',
  'growthbook.io': 'A/B Testing',
  'conductrics.com': 'A/B Testing',
  'sitespect.com': 'A/B Testing',
  'convert.com': 'A/B Testing',
  'qubit.com': 'A/B Testing',
  'monetate.net': 'A/B Testing',
  'evergage.com': 'A/B Testing',
  'dynamic-yield.com': 'A/B Testing',

  // Chat / Support
  'intercom.io': 'Chat/Support',
  'intercomcdn.com': 'Chat/Support',
  'drift.com': 'Chat/Support',
  'driftt.com': 'Chat/Support',
  'zendesk.com': 'Chat/Support',
  'zdassets.com': 'Chat/Support',
  'freshdesk.com': 'Chat/Support',
  'freshchat.com': 'Chat/Support',
  'tawk.to': 'Chat/Support',
  'crisp.chat': 'Chat/Support',
  'livechatinc.com': 'Chat/Support',
  'olark.com': 'Chat/Support',
  'helpscout.net': 'Chat/Support',
  'kayako.com': 'Chat/Support',
  'userlike.com': 'Chat/Support',
  'tidio.co': 'Chat/Support',
  'hubspot.com': 'Chat/Support',
  'hs-analytics.net': 'Chat/Support',
  'hs-banner.com': 'Chat/Support',
  'hs-scripts.com': 'Chat/Support',
  'hsforms.net': 'Chat/Support',
  'hsforms.com': 'Chat/Support',
  'usemessages.com': 'Chat/Support',
  'kommunicate.io': 'Chat/Support',
  'chatwoot.com': 'Chat/Support',
  'gorgias.chat': 'Chat/Support',

  // Video / Media
  'doubleclick.net': 'Advertising',
  'googlevideo.com': 'Video/Media',
  'youtube.com': 'Video/Media',
  'ytimg.com': 'Video/Media',
  'vimeo.com': 'Video/Media',
  'vimeocdn.com': 'Video/Media',
  'jwpcdn.com': 'Video/Media',
  'jwplatform.com': 'Video/Media',
  'brightcove.com': 'Video/Media',
  'brightcovecdn.com': 'Video/Media',
  'vidyard.com': 'Video/Media',
  'wistia.com': 'Video/Media',
  'wistia.net': 'Video/Media',
  'dailymotion.com': 'Video/Media',
  'twitch.tv': 'Video/Media',
  'twitchcdn.net': 'Video/Media',
  'mux.com': 'Video/Media',
  'cloudinary.com': 'Video/Media',
  'imgix.net': 'Video/Media',
  'unsplash.com': 'Video/Media',
  'giphy.com': 'Video/Media',

  // Consent management
  'cookiebot.com': 'Consent',
  'cookiepro.com': 'Consent',
  'onetrust.com': 'Consent',
  'trustarc.com': 'Consent',
  'quantcast.com': 'Consent',
  'evidon.com': 'Consent',
  'iubenda.com': 'Consent',
  'termly.io': 'Consent',
  'cookieyes.com': 'Consent',
  'osano.com': 'Consent',
  'securiti.ai': 'Consent',
  'didomi.io': 'Consent',
  'consentmanager.net': 'Consent',
  'usercentrics.eu': 'Consent',
  'crownpeak.com': 'Consent',

  // Email marketing / CRM
  'mailchimp.com': 'Email/CRM',
  'list-manage.com': 'Email/CRM',
  'sendgrid.net': 'Email/CRM',
  'sendinblue.com': 'Email/CRM',
  'brevo.com': 'Email/CRM',
  'constantcontact.com': 'Email/CRM',
  'mailgun.com': 'Email/CRM',
  'postmarkapp.com': 'Email/CRM',
  'klaviyo.com': 'Email/CRM',
  'drip.com': 'Email/CRM',
  'activecampaign.com': 'Email/CRM',
  'convertkit.com': 'Email/CRM',
  'aweber.com': 'Email/CRM',
  'getresponse.com': 'Email/CRM',
  'campaignmonitor.com': 'Email/CRM',
  'customer.io': 'Email/CRM',
  'iterable.com': 'Email/CRM',
  'braze.com': 'Email/CRM',
  'onesignal.com': 'Email/CRM',
  'pushwoosh.com': 'Email/CRM',
  'leanplum.com': 'Email/CRM',
  'batch.com': 'Email/CRM',
  'salesforce.com': 'Email/CRM',
  'pardot.com': 'Email/CRM',
  'marketo.com': 'Email/CRM',
  'marketo.net': 'Email/CRM',
  'eloqua.com': 'Email/CRM',
  'act-on.com': 'Email/CRM'
};

const PURPOSE_DOMAINS = {
  'cdn': [
    'cloudflare.com', 'cloudfront.net', 'akamai.net', 'akamaized.net',
    'fastly.net', 'jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com',
    'stackpath.com', 'bootstrapcdn.com', 'maxcdn.com', 'keycdn.com',
    'bunnycdn.com', 'cdn77.com', 'limelight.com', 'edgecastcdn.net',
    'azureedge.net', 'azurefd.net', 'googleapis.com', 'gstatic.com',
    'ggpht.com', 'googleusercontent.com', 'ajax.googleapis.com',
    'polyfill.io', 'polyfill-fastly.io', 'cdninstagram.com',
    'twimg.com', 'pstatic.net', 'awsstatic.com', 'images-amazon.com',
    'ssl-images-amazon.com', 'media-amazon.com'
  ],
  'fonts': [
    'fonts.googleapis.com', 'fonts.gstatic.com', 'use.typekit.net',
    'use.fontawesome.com', 'fast.fonts.net', 'cloud.typography.com',
    'fonts.bunny.net'
  ],
  'captcha': [
    'recaptcha.net', 'hcaptcha.com', 'challenges.cloudflare.com',
    'arkoselabs.com', 'funcaptcha.com'
  ],
  'payment': [
    'stripe.com', 'js.stripe.com', 'paypal.com', 'paypalobjects.com',
    'braintreegateway.com', 'braintree-api.com', 'adyen.com',
    'checkout.com', 'square.com', 'squareup.com', 'shopify.com',
    'shopifycdn.com', 'klarna.com', 'afterpay.com', 'affirm.com',
    'sezzle.com', 'apple.com/apple-pay', 'google.com/pay'
  ],
  'auth': [
    'accounts.google.com', 'login.microsoftonline.com', 'auth0.com',
    'okta.com', 'onelogin.com', 'firebase.google.com',
    'cognito-idp.amazonaws.com', 'appleid.apple.com'
  ],
  'maps': [
    'maps.googleapis.com', 'maps.google.com', 'maps.gstatic.com',
    'api.mapbox.com', 'tile.openstreetmap.org', 'leafletjs.com',
    'here.com', 'tomtom.com'
  ]
};

/* ── Domain pattern matching (name-based classification) ── */
const DOMAIN_PATTERNS = [
  { pattern: /track(er|ing)?[.-]/i, category: 'Analytics', risky: true },
  { pattern: /pixel[.-]/i, category: 'Analytics', risky: true },
  { pattern: /beacon[.-]/i, category: 'Analytics', risky: true },
  { pattern: /telemetry[.-]/i, category: 'Analytics', risky: true },
  { pattern: /adserv(er|ing)?[.-]/i, category: 'Advertising', risky: true },
  { pattern: /metrics[.-]/i, category: 'Analytics', risky: true },
  { pattern: /collect(or)?[.-]/i, category: 'Analytics', risky: true },
  { pattern: /analytics[.-]/i, category: 'Analytics', risky: true },
  { pattern: /stats[.-]/i, category: 'Analytics', risky: false },
  { pattern: /log(s|ging)?[.-]/i, category: 'Analytics', risky: false },
  { pattern: /monitor(ing)?[.-]/i, category: 'Error Monitoring', risky: false },
  { pattern: /click[.-]/i, category: 'Advertising', risky: true },
  { pattern: /impression[.-]/i, category: 'Advertising', risky: true },
  { pattern: /retarget/i, category: 'Advertising', risky: true },
  { pattern: /syndica/i, category: 'Advertising', risky: true },
  { pattern: /affiliate/i, category: 'Advertising', risky: true },
  { pattern: /\.ad[sx]?\./i, category: 'Advertising', risky: true },
  { pattern: /tag(manager)?[.-]/i, category: 'Analytics', risky: true },
  { pattern: /fingerprint/i, category: 'Fingerprinting', risky: true },
  { pattern: /consent[.-]/i, category: 'Consent', risky: false },
  { pattern: /chat[.-]|livechat|support[.-]/i, category: 'Chat/Support', risky: false },
  { pattern: /cdn[.-]|static[.-]|assets[.-]/i, category: 'cdn', risky: false }
];

/* ── Helpers ── */
function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function getRootDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

function classifyDomain(domain, details) {
  const root = getRootDomain(domain);

  // Pass 1: exact domain DB
  if (TRACKER_DOMAINS[root]) return { category: TRACKER_DOMAINS[root], risky: true };
  if (TRACKER_DOMAINS[domain]) return { category: TRACKER_DOMAINS[domain], risky: true };
  for (const [purpose, domains] of Object.entries(PURPOSE_DOMAINS)) {
    if (domains.some(d => domain.includes(d))) return { category: purpose, risky: false };
  }

  // Pass 2: pattern regex
  for (const { pattern, category, risky } of DOMAIN_PATTERNS) {
    if (pattern.test(domain)) return { category, risky };
  }

  // Pass 3: request heuristics (if details provided)
  if (details) {
    // 1x1 pixel detection
    if (details.type === 'image') {
      const cl = getHeader(details.responseHeaders, 'content-length');
      if (cl !== null && parseInt(cl, 10) < 200) {
        return { category: 'Analytics', risky: true, trackingPixel: true };
      }
    }
    // Beacon POST detection
    if (details.method === 'POST' && (details.statusCode === 204 || details.statusCode === 200)) {
      const cl = getHeader(details.responseHeaders, 'content-length');
      if (cl !== null && parseInt(cl, 10) === 0) {
        return { category: 'Analytics', risky: true, beaconPost: true };
      }
    }
  }

  return { category: 'unknown', risky: false };
}

function getHeader(headers, name) {
  if (!headers) return null;
  const h = headers.find(h => h.name.toLowerCase() === name);
  return h ? h.value : null;
}

function isThirdParty(requestDomain, tabDomain) {
  if (!tabDomain || !requestDomain) return false;
  return getRootDomain(requestDomain) !== getRootDomain(tabDomain);
}

function computeBeaconScore(timestamps) {
  if (timestamps.length < 5) return { score: 0, confidence: 0, interval: 0 };
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
  const stddev = Math.sqrt(variance);
  const cv = mean > 0 ? stddev / mean : 1; // coefficient of variation

  // Flag if CV < 0.15 and interval between 10s and 5min
  const meanSec = mean / 1000;
  if (cv < 0.15 && meanSec >= 10 && meanSec <= 300) {
    return { score: Math.round((1 - cv) * 100), confidence: Math.min(timestamps.length / 10, 1), interval: mean };
  }
  return { score: 0, confidence: 0, interval: mean };
}

/* ── onBeforeRequest: timing start, redirect chain init, requestBody size, tab tracking ── */
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;

    // Tab navigation tracking
    if (details.type === 'main_frame') {
      const domain = extractDomain(details.url);
      traffic.tabs[details.tabId] = {
        url: details.url,
        domain,
        requests: 0,
        thirdParties: {}
      };
    }

    // Record timing start
    traffic.timing[details.requestId] = Date.now();

    // Init redirect chain
    traffic.redirects[details.requestId] = [details.url];

    // Track request body size
    if (details.requestBody) {
      const domain = extractDomain(details.url);
      if (domain && traffic.domains[domain]) {
        let size = 0;
        if (details.requestBody.raw) {
          for (const part of details.requestBody.raw) {
            if (part.bytes) size += part.bytes.byteLength;
          }
        }
        traffic.domains[domain].bytesSent = (traffic.domains[domain].bytesSent || 0) + size;
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

/* ── onBeforeRedirect: append to redirect chain ── */
chrome.webRequest.onBeforeRedirect.addListener(
  (details) => {
    if (details.tabId < 0) return;
    if (traffic.redirects[details.requestId]) {
      traffic.redirects[details.requestId].push(details.redirectUrl);
    }
  },
  { urls: ['<all_urls>'] }
);

/* ── onCompleted: main processing ── */
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const domain = extractDomain(details.url);
    if (!domain) return;

    const tabInfo = traffic.tabs[details.tabId];
    const tabDomain = tabInfo ? tabInfo.domain : '';
    const thirdParty = isThirdParty(domain, tabDomain);

    // Compute response time
    let responseTime = 0;
    if (traffic.timing[details.requestId]) {
      responseTime = Date.now() - traffic.timing[details.requestId];
      delete traffic.timing[details.requestId];
    }

    // Finalize redirect chains
    const chain = traffic.redirects[details.requestId];
    if (chain && chain.length > 1) {
      // Add final URL if different from last in chain
      const lastInChain = chain[chain.length - 1];
      if (lastInChain !== details.url) chain.push(details.url);

      const originDomain = extractDomain(chain[0]);
      if (!traffic.finalRedirects[originDomain]) traffic.finalRedirects[originDomain] = [];
      if (traffic.finalRedirects[originDomain].length < MAX_FINAL_REDIRECTS) {
        traffic.finalRedirects[originDomain].push(chain);
      }
    }
    delete traffic.redirects[details.requestId];

    // WebSocket tracking
    if (details.type === 'websocket') {
      if (!traffic.websockets[domain]) {
        traffic.websockets[domain] = { firstSeen: Date.now(), lastSeen: Date.now(), count: 0 };
      }
      traffic.websockets[domain].lastSeen = Date.now();
      traffic.websockets[domain].count++;
    }

    // Classify with heuristics
    const classification = classifyDomain(domain, details);

    // Track bytes received from Content-Length
    let bytesReceived = 0;
    const cl = getHeader(details.responseHeaders, 'content-length');
    if (cl) bytesReceived = parseInt(cl, 10) || 0;

    // Session domain tracking (NEW flag)
    const isNew = !traffic.sessionDomains[domain];
    if (isNew) traffic.sessionDomains[domain] = true;

    // Update domain stats
    if (!traffic.domains[domain]) {
      traffic.domains[domain] = {
        count: 0,
        types: {},
        firstSeen: Date.now(),
        lastSeen: 0,
        thirdPartyOn: {},
        classification,
        recentTimestamps: [],
        isNew: true,
        responseTimeTotal: 0,
        responseTimeCount: 0,
        bytesReceived: 0,
        bytesSent: 0,
        beaconScore: 0,
        beaconConfidence: 0,
        beaconInterval: 0,
        trackingPixel: false,
        beaconPost: false
      };
    }
    const d = traffic.domains[domain];
    d.count++;
    d.lastSeen = Date.now();
    d.types[details.type] = (d.types[details.type] || 0) + 1;
    if (thirdParty && tabDomain) d.thirdPartyOn[tabDomain] = true;

    // Response time tracking
    if (responseTime > 0) {
      d.responseTimeTotal += responseTime;
      d.responseTimeCount++;
    }

    // Bytes tracking
    d.bytesReceived += bytesReceived;

    // Heuristic flags
    if (classification.trackingPixel) d.trackingPixel = true;
    if (classification.beaconPost) d.beaconPost = true;

    // Beacon detection: track timestamps (ring buffer)
    d.recentTimestamps.push(Date.now());
    if (d.recentTimestamps.length > MAX_TIMESTAMPS) d.recentTimestamps.shift();
    const beacon = computeBeaconScore(d.recentTimestamps);
    d.beaconScore = beacon.score;
    d.beaconConfidence = beacon.confidence;
    d.beaconInterval = beacon.interval;

    // Update tab stats
    if (tabInfo) {
      tabInfo.requests++;
      if (thirdParty) tabInfo.thirdParties[domain] = true;
    }

    // Update totals
    traffic.totals.count++;
    if (thirdParty) traffic.totals.thirdParty++;

    // Live feed (ring buffer)
    traffic.requests.push({
      url: details.url,
      domain,
      type: details.type,
      tabId: details.tabId,
      tabDomain,
      thirdParty,
      classification,
      statusCode: details.statusCode,
      ts: Date.now(),
      responseTime,
      isNew
    });
    if (traffic.requests.length > MAX_FEED) traffic.requests.shift();
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

/* ── onErrorOccurred: cleanup timing/redirect maps ── */
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    delete traffic.timing[details.requestId];
    delete traffic.redirects[details.requestId];
  },
  { urls: ['<all_urls>'] }
);

/* ── Clean up closed tabs ── */
chrome.tabs.onRemoved.addListener((tabId) => {
  delete traffic.tabs[tabId];
});

/* ── Open dashboard on icon click ── */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'dashboard.html' });
});

/* ── Messaging: dashboard requests data ── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getTraffic') {
    const domains = {};
    for (const [k, v] of Object.entries(traffic.domains)) {
      domains[k] = {
        ...v,
        types: { ...v.types },
        thirdPartyOn: Object.keys(v.thirdPartyOn),
        responseTime: v.responseTimeCount > 0 ? Math.round(v.responseTimeTotal / v.responseTimeCount) : 0
      };
    }
    const tabs = {};
    for (const [k, v] of Object.entries(traffic.tabs)) {
      tabs[k] = {
        ...v,
        thirdParties: Object.keys(v.thirdParties)
      };
    }

    // Collect redirect chains (flatten all domains)
    const redirectChains = [];
    for (const [domain, chains] of Object.entries(traffic.finalRedirects)) {
      for (const chain of chains) {
        redirectChains.push({ origin: domain, chain });
      }
    }

    sendResponse({
      requests: traffic.requests.slice(-200),
      domains,
      tabs,
      totals: { ...traffic.totals },
      websockets: { ...traffic.websockets },
      redirectChains: redirectChains.slice(-50)
    });
  }
  if (msg.type === 'clearTraffic') {
    traffic.requests.length = 0;
    for (const k of Object.keys(traffic.domains)) delete traffic.domains[k];
    for (const k of Object.keys(traffic.tabs)) delete traffic.tabs[k];
    for (const k of Object.keys(traffic.finalRedirects)) delete traffic.finalRedirects[k];
    for (const k of Object.keys(traffic.websockets)) delete traffic.websockets[k];
    for (const k of Object.keys(traffic.sessionDomains)) delete traffic.sessionDomains[k];
    traffic.totals.count = 0;
    traffic.totals.blocked = 0;
    traffic.totals.thirdParty = 0;
    sendResponse({ ok: true });
  }
  return true;
});

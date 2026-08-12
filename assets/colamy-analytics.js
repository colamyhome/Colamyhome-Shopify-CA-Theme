(function (window, document) {
  'use strict';

  var DEFAULT_CONFIG = {
    debug: false,
    collectorEndpoint: null,
    collectorWriteKey: null,
    ga4MeasurementId: '',
    destinations: {
      collector: true,
      ga4: false,
      meta: false,
    },
  };
  var SCHEMA_VERSION = '1.0';
  var ANALYTICS_SOURCE = 'colamy_custom';
  var EVENT_VERSION = '1.0';
  var ATTRIBUTION_KEYS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'gclid',
    'fbclid',
    'ttclid',
  ];

  var config = Object.assign({}, DEFAULT_CONFIG, window.ColamyAnalyticsConfig || {});
  config.destinations = Object.assign(
    {},
    DEFAULT_CONFIG.destinations,
    (window.ColamyAnalyticsConfig && window.ColamyAnalyticsConfig.destinations) || {}
  );
  var consentListeners = [];
  var ga4Initialized = false;

  function destinationEnabled(destination) {
    return config.destinations && config.destinations[destination] === true;
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function safeGet(storage, key) {
    try {
      return storage && storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeSet(storage, key, value) {
    try {
      if (storage) storage.setItem(key, value);
    } catch (error) {
      // Storage can be disabled in private browsing or strict privacy modes.
    }
  }

  function safeRemove(storage, key) {
    try {
      if (storage) storage.removeItem(key);
    } catch (error) {
      // Storage can be disabled in private browsing or strict privacy modes.
    }
  }

  function safeWindowValue(key) {
    try {
      return window[key];
    } catch (error) {
      return null;
    }
  }

  function getOrCreate(storage, key) {
    var value = safeGet(storage, key);
    if (!value) {
      value = uuid();
      safeSet(storage, key, value);
    }
    return value;
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
    } catch (error) {
      return '';
    }
  }

  function parseSearch(search) {
    var result = {};
    if (!search) return result;

    var query = search.charAt(0) === '?' ? search.slice(1) : search;
    query.split('&').forEach(function (part) {
      if (!part) return;

      var pair = part.split('=');
      var key = safeDecode(pair[0]);
      if (!key) return;

      result[key] = safeDecode(pair.slice(1).join('='));
    });

    return result;
  }

  function allowedAttribution(value) {
    var attribution = {};
    if (!value || typeof value !== 'object') return attribution;

    ATTRIBUTION_KEYS.forEach(function (key) {
      if (value[key]) attribution[key] = value[key];
    });
    return attribution;
  }

  function getAttribution() {
    var params = parseSearch(window.location && window.location.search);
    var attribution = allowedAttribution(params);
    var storage = safeWindowValue('localStorage');

    if (Object.keys(attribution).length > 0) {
      safeSet(storage, 'colamy_last_attribution', JSON.stringify(attribution));

      if (!safeGet(storage, 'colamy_first_attribution')) {
        safeSet(storage, 'colamy_first_attribution', JSON.stringify(attribution));
      }
    } else {
      try {
        attribution = allowedAttribution(
          JSON.parse(safeGet(storage, 'colamy_last_attribution') || '{}')
        );
      } catch (error) {
        attribution = {};
      }
    }

    return attribution;
  }

  function normalizedHostname(hostname) {
    return String(hostname || '').toLowerCase().replace(/^www\./, '');
  }

  function parseUrl(value, base) {
    if (!value || typeof window.URL !== 'function') return null;
    try {
      return new window.URL(value, base || (window.location && window.location.href));
    } catch (error) {
      return null;
    }
  }

  function safePageUrl(value) {
    var parsed = parseUrl(value);
    if (!parsed || !/^https?:$/.test(parsed.protocol)) return '';

    var keys = [];
    parsed.searchParams.forEach(function (_, key) {
      if (keys.indexOf(key) === -1) keys.push(key);
    });
    keys.forEach(function (key) {
      if (ATTRIBUTION_KEYS.indexOf(key) === -1) parsed.searchParams.delete(key);
    });
    parsed.hash = '';
    return parsed.toString();
  }

  function safeReferrer(value) {
    var parsed = parseUrl(value);
    if (!parsed || !/^https?:$/.test(parsed.protocol)) return '';
    return parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname);
  }

  function consentValue(callback, owner) {
    if (typeof callback !== 'function') return 'unknown';
    try {
      var value = callback.call(owner);
      if (value === true) return 'granted';
      if (value === false) return 'denied';
      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  function isDirectAnalyticsMarket() {
    var market = String(config.market || '').toUpperCase();
    var markets = Array.isArray(config.directAnalyticsMarkets)
      ? config.directAnalyticsMarkets
      : [];

    return markets.some(function (value) {
      return String(value || '').toUpperCase() === market;
    });
  }

  function getConsentState() {
    var privacy = window.Shopify && window.Shopify.customerPrivacy;
    var directAnalyticsAllowed = isDirectAnalyticsMarket();

    if (!privacy) {
      return {
        analytics: directAnalyticsAllowed ? 'granted' : 'unknown',
        marketing: 'unknown',
        source: directAnalyticsAllowed ? 'regional_direct_analytics' : 'default',
      };
    }

    var analyticsConsent = consentValue(privacy.analyticsProcessingAllowed, privacy);
    var marketingConsent = consentValue(privacy.marketingAllowed, privacy);
    return {
      analytics: directAnalyticsAllowed ? 'granted' : analyticsConsent,
      marketing: marketingConsent,
      source: directAnalyticsAllowed
        ? 'regional_direct_analytics'
        : (analyticsConsent === 'unknown' && marketingConsent === 'unknown'
          ? 'default'
          : 'shopify_customer_privacy'),
    };
  }

  function consentChanged() {
    var state = getConsentState();

    if (state.analytics === 'granted') {
      initializeDestinations();
    } else if (state.analytics === 'denied') {
      clearAnalyticsStorage();
    }

    consentListeners.slice().forEach(function (listener) {
      try {
        listener(state);
      } catch (error) {
        // A consumer must not be able to stop other consent subscribers.
      }
    });
    return state;
  }

  function onConsentChange(listener) {
    if (typeof listener !== 'function') return function () {};
    consentListeners.push(listener);
    listener(getConsentState());
    return function () {
      consentListeners = consentListeners.filter(function (candidate) {
        return candidate !== listener;
      });
    };
  }

  function clearAnalyticsStorage() {
    var localStorage = safeWindowValue('localStorage');
    var sessionStorage = safeWindowValue('sessionStorage');
    ['colamy_anonymous_id', 'colamy_last_attribution', 'colamy_first_attribution', 'visitor_page_views'].forEach(function (key) {
      safeRemove(localStorage, key);
    });
    safeRemove(sessionStorage, 'colamy_session_id');
  }

  function getPageContext() {
    var page = window.ColamyPage || {};

    return {
      type: page.type || '',
      template: page.template || '',
      url: safePageUrl(window.location && window.location.href),
      referrer: safeReferrer(document.referrer || ''),
    };
  }

  function domainLabelIndex(domain, label) {
    return String(domain || '').split('.').indexOf(label);
  }

  function domainFromLabel(domain, label) {
    var labels = String(domain || '').split('.');
    var index = labels.indexOf(label);
    return index === -1 ? domain : labels.slice(index).join('.');
  }

  function platformFromDomain(hostname) {
    var domain = normalizedHostname(hostname);
    if (!domain) return null;
    if (domain === 'colamyhome.com' || domain.endsWith('.colamyhome.com')) {
      return {
        destination_platform: 'official_site',
        link_type: 'official_site',
        link_domain: 'colamyhome.com',
      };
    }

    var marketplaces = ['amazon', 'walmart', 'wayfair', 'homedepot', 'target'];
    for (var index = 0; index < marketplaces.length; index += 1) {
      if (domainLabelIndex(domain, marketplaces[index]) !== -1) {
        return {
          destination_platform: marketplaces[index],
          link_type: 'marketplace',
          link_domain: domainFromLabel(domain, marketplaces[index]),
        };
      }
    }

    var socials = ['facebook', 'instagram', 'pinterest', 'tiktok', 'youtube'];
    for (var socialIndex = 0; socialIndex < socials.length; socialIndex += 1) {
      if (domainLabelIndex(domain, socials[socialIndex]) !== -1) {
        return {
          destination_platform: socials[socialIndex],
          link_type: 'social',
          link_domain: domainFromLabel(domain, socials[socialIndex]),
        };
      }
    }

    return {
      destination_platform: domain,
      link_type: 'external',
      link_domain: domain,
    };
  }

  function platformFromMedium(medium) {
    var value = String(medium || '').toLowerCase();
    if (!value) return null;
    if (['amazon', 'walmart', 'wayfair', 'homedepot', 'target'].indexOf(value) !== -1) {
      return { destination_platform: value, link_type: 'marketplace', link_domain: '' };
    }
    if (['facebook', 'meta', 'instagram', 'pinterest', 'tiktok', 'youtube'].indexOf(value) !== -1) {
      return {
        destination_platform: value === 'meta' ? 'facebook' : value,
        link_type: 'social',
        link_domain: '',
      };
    }
    return { destination_platform: value, link_type: 'campaign', link_domain: '' };
  }

  function normalizeLinkProperties(properties, attribution) {
    var normalized = Object.assign({}, properties || {});
    var rawHref = normalized.href;
    var parsed = parseUrl(rawHref);
    var suppliedDomain = normalized.href_domain;
    var suppliedType = normalized.href_type;
    var suppliedKeys = normalized.href_query_keys;
    var platform = null;

    if (parsed && /^https?:$/.test(parsed.protocol)) {
      var keys = [];
      parsed.searchParams.forEach(function (_, key) {
        if (keys.indexOf(key) === -1) keys.push(key);
      });
      normalized.href = parsed.pathname || '/';
      normalized.href_path = parsed.pathname || '/';
      normalized.href_domain = suppliedDomain || parsed.hostname || '';
      normalized.href_type = suppliedType || (
        normalizedHostname(parsed.hostname) === normalizedHostname(window.location && window.location.hostname)
          ? 'internal'
          : 'external'
      );
      normalized.href_query_keys = suppliedKeys !== undefined ? suppliedKeys : keys;
      if (parsed.searchParams.get('utm_medium')) {
        normalized.utm_medium = parsed.searchParams.get('utm_medium');
      }
      platform = platformFromDomain(normalized.href_domain);
    } else if (parsed && parsed.protocol === 'mailto:') {
      normalized.href = '';
      normalized.href_path = '';
      normalized.href_domain = '';
      normalized.href_type = 'email';
      normalized.href_query_keys = [];
    } else if (parsed && parsed.protocol === 'tel:') {
      normalized.href = '';
      normalized.href_path = '';
      normalized.href_domain = '';
      normalized.href_type = 'phone';
      normalized.href_query_keys = [];
    } else if (rawHref) {
      normalized.href = '';
      normalized.href_path = '';
      normalized.href_domain = suppliedDomain || '';
      normalized.href_type = suppliedType || 'invalid';
      normalized.href_query_keys = suppliedKeys !== undefined ? suppliedKeys : [];
    }

    if (!normalized.utm_medium && attribution && attribution.utm_medium) {
      normalized.utm_medium = attribution.utm_medium;
    }
    if (!platform && normalized.href_domain) platform = platformFromDomain(normalized.href_domain);
    if (!platform && !rawHref) platform = platformFromMedium(normalized.utm_medium);
    return platform ? Object.assign(normalized, platform) : normalized;
  }

  function buildEvent(eventName, properties, consentState) {
    var consent = consentState || getConsentState();
    if (consent.analytics !== 'granted') return null;
    var attribution = getAttribution();
    return {
      schema_version: SCHEMA_VERSION,
      analytics_source: ANALYTICS_SOURCE,
      event_version: EVENT_VERSION,
      event_id: uuid(),
      event_name: eventName,
      timestamp: Date.now(),
      anonymous_id: getOrCreate(safeWindowValue('localStorage'), 'colamy_anonymous_id'),
      session_id: getOrCreate(safeWindowValue('sessionStorage'), 'colamy_session_id'),
      consent_state: consent,
      page: getPageContext(),
      attribution: attribution,
      write_key: config.collectorWriteKey || '',
      properties: normalizeLinkProperties(properties || {}, attribution),
    };
  }

  function flattenInto(target, value, prefix) {
    if (value === undefined) return;
    if (value === null) {
      target[prefix] = '';
      return;
    }
    if (Array.isArray(value)) {
      target[prefix] = value.map(function (item) {
        return item && typeof item === 'object' ? JSON.stringify(item) : String(item);
      }).join(',');
      return;
    }
    if (typeof value === 'object') {
      Object.keys(value).forEach(function (key) {
        flattenInto(target, value[key], prefix ? prefix + '_' + key : key);
      });
      return;
    }
    target[prefix] = value;
  }

  function ga4Properties(event) {
    var params = {
      analytics_source: event.analytics_source,
      schema_version: event.schema_version,
      event_version: event.event_version,
      event_id: event.event_id,
      anonymous_id: event.anonymous_id,
      session_id: event.session_id,
      page_type: event.page.type,
      page_template: event.page.template,
      page_url: event.page.url,
      page_referrer: event.page.referrer,
      consent_analytics: event.consent_state.analytics,
      consent_marketing: event.consent_state.marketing,
      consent_source: event.consent_state.source,
    };
    flattenInto(params, event.attribution, '');
    flattenInto(params, event.properties, '');
    return params;
  }

  function analyticsGranted(event) {
    return event.consent_state.analytics === 'granted';
  }

  function ensureGtag() {
    if (typeof window.gtag === 'function') return true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    return true;
  }

  function initializeGA4() {
    if (!destinationEnabled('ga4') || !config.ga4MeasurementId || ga4Initialized) return;
    ga4Initialized = true;
    ensureGtag();
    var consent = getConsentState();
    var marketing = consent.marketing === 'granted' ? 'granted' : 'denied';
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: marketing,
      ad_user_data: marketing,
      ad_personalization: marketing,
    });
    window.gtag('js', new Date());
    window.gtag('config', config.ga4MeasurementId);

    if (!document || !document.createElement) return;
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(config.ga4MeasurementId);
    (document.head || document.getElementsByTagName('head')[0] || document.documentElement).appendChild(script);
  }

  function initializeDestinations() {
    initializeGA4();
  }

  function destinationProperties(event) {
    return Object.assign(
      {
        analytics_source: event.analytics_source,
        schema_version: event.schema_version,
        event_version: event.event_version,
        event_id: event.event_id,
        anonymous_id: event.anonymous_id,
        session_id: event.session_id,
        page_type: event.page.type,
        page_template: event.page.template,
        page_url: event.page.url,
      },
      event.attribution,
      event.properties
    );
  }

  function sendToGA4(event) {
    if (!destinationEnabled('ga4')) return;
    if (!analyticsGranted(event)) return;

    initializeGA4();
    if (typeof window.gtag !== 'function') return;

    window.gtag('event', event.event_name, ga4Properties(event));
  }

  function sendToMeta(event) {
    if (!destinationEnabled('meta')) return;
    if (typeof window.fbq !== 'function') return;
    if (!analyticsGranted(event) || event.consent_state.marketing !== 'granted') return;

    window.fbq(
      'trackCustom',
      event.event_name,
      destinationProperties(event),
      { eventID: event.event_id }
    );
  }

  function sendToCollector(event) {
    if (!destinationEnabled('collector')) return;
    if (!config.collectorEndpoint) return;
    if (!analyticsGranted(event)) return;

    var body = JSON.stringify(event);

    if (window.navigator && typeof window.navigator.sendBeacon === 'function') {
      if (window.navigator.sendBeacon(config.collectorEndpoint, body)) return;
    }

    if (typeof window.fetch === 'function') {
      window.fetch(config.collectorEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
      });
    }
  }

  function track(eventName, properties) {
    if (!eventName || typeof eventName !== 'string') return null;

    var consent = getConsentState();
    if (consent.analytics !== 'granted') return null;
    var event = buildEvent(eventName, properties, consent);
    if (!event) return null;

    if (config.debug && window.console && typeof window.console.log === 'function') {
      window.console.log('[ColamyAnalytics]', event);
    }

    sendToGA4(event);
    sendToMeta(event);
    sendToCollector(event);

    return event;
  }

  window.ColamyAnalytics = {
    track: track,
    config: config,
    buildEvent: buildEvent,
    getConsentState: getConsentState,
    onConsentChange: onConsentChange,
  };

  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('visitorConsentCollected', consentChanged);
    document.addEventListener('product-ajax:added', function (nativeEvent) {
      var detail = nativeEvent && nativeEvent.detail || {};
      var product = detail.product || {};
      var item = Array.isArray(product.items) ? product.items[0] : product;
      track('add_to_cart', {
        event_action: 'success',
        event_detail: 'add_to_cart',
        variant_id: item.id || item.variant_id || '',
        product_id: item.product_id || '',
        product_title: item.product_title || item.title || '',
        quantity: item.quantity || 1,
        source: 'product-ajax:added',
      });
    });
  }
  if (getConsentState().analytics === 'granted') initializeDestinations();
})(window, document);

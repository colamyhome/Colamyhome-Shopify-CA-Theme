(function (window, document) {
  'use strict';

  var LOOKBOOK_TRIGGER_CLASS = 'lbcard__popup-btn-trigger';
  var LOOKBOOK_PRODUCT_CLASS = 'lbcard__product';
  var NEWSLETTER_CLASS = 'newsletter';
  var CAROUSEL_ROOT_PREFIX = 'ai-product-carousel-';
  var CAROUSEL_PRODUCT_PREFIX = 'ai-product-carousel__product-';
  var CAROUSEL_NAV_PREFIX = 'ai-product-carousel__nav-';
  var CAROUSEL_PREV_PREFIX = 'ai-product-carousel__nav--prev-';
  var CAROUSEL_NEXT_PREFIX = 'ai-product-carousel__nav--next-';
  var CAROUSEL_DOT_PREFIX = 'ai-product-carousel__dot-';
  var EVENT_VIEW = 'bc_p_v';
  var EVENT_EMAIL_ENTERED = 'bc_nl_e';
  var EVENT_EMAIL_SIGNUP = 'bc_nl_b';
  var EVENT_LOOKBOOK_OPEN = 'bc_lb_b';
  var EVENT_LOOKBOOK_PRODUCT = 'bc_lb_p';
  var EVENT_CAROUSEL_PRODUCT = 'bc_pc_p';
  var EVENT_CAROUSEL_CONTROL = 'bc_pc_c';
  var pageViewTracked = false;

  function isBrandCampaignPage() {
    var page = window.ColamyPage || {};
    var bodyClass = document.body && document.body.className;

    return page.suffix === 'brand-campaign'
      || page.template === 'brand-campaign'
      || (typeof bodyClass === 'string' && bodyClass.indexOf('brand-campaign') !== -1);
  }

  function analytics() {
    return window.ColamyAnalytics && typeof window.ColamyAnalytics.track === 'function'
      ? window.ColamyAnalytics
      : null;
  }

  function track(eventName, action, properties) {
    var client = analytics();
    if (!client) return null;
    return client.track(eventName, Object.assign({
      event_action: action,
      event_detail: eventName,
    }, properties || {}));
  }

  function hasClass(element, className) {
    if (!element || !element.className) return false;
    return String(element.className).split(/\s+/).indexOf(className) !== -1;
  }

  function hasClassPrefix(element, prefix) {
    if (!element || !element.className) return false;
    return String(element.className).split(/\s+/).some(function (className) {
      return className.indexOf(prefix) === 0;
    });
  }

  function closestByClass(element, className) {
    var current = element;

    while (current) {
      if (hasClass(current, className)) return current;
      current = current.parentElement;
    }

    return null;
  }

  function closestByClassPrefix(element, prefix) {
    var current = element;

    while (current) {
      if (hasClassPrefix(current, prefix)) return current;
      current = current.parentElement;
    }

    return null;
  }

  function closestTag(element, tagName) {
    var current = element;
    var normalizedTag = tagName.toUpperCase();

    while (current) {
      if (current.tagName === normalizedTag) return current;
      current = current.parentElement;
    }

    return null;
  }

  function sectionFromElement(element) {
    if (!element || typeof element.closest !== 'function') return null;
    return element.closest('[id^="shopify-section-"]');
  }

  function getSectionId(element) {
    var section = sectionFromElement(element);
    return section ? section.id : '';
  }

  function sectionHandle(section) {
    var id = section && section.id ? section.id.replace(/^shopify-section-/, '') : '';
    var instance = id.indexOf('__') === -1 ? id : id.split('__').pop();
    return instance.replace(/_[A-Za-z0-9]+$/, '');
  }

  function getSectionType(element) {
    var section = sectionFromElement(element);
    var handle = sectionHandle(section);
    if (!section) return '';
    if (section.getAttribute && section.getAttribute('data-section-type')) {
      return section.getAttribute('data-section-type');
    }
    if (handle === 'custom_content') return 'custom-content';
    if (handle === 'newsletter') return 'newsletter';
    if (handle === '1781157852fded783e') return 'product-carousel';

    return handle.replace(/_/g, '-') || '';
  }

  function cleanText(value) {
    return (value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function getHref(element) {
    if (!element) return '';
    return element.href || (element.getAttribute && element.getAttribute('href')) || '';
  }

  function elementPosition(element, selector) {
    var section = sectionFromElement(element);
    if (!section || typeof section.querySelectorAll !== 'function') return null;

    var elements = Array.prototype.slice.call(section.querySelectorAll(selector));
    var index = elements.indexOf(element);
    return index >= 0 ? index + 1 : null;
  }

  function emailDomain(value) {
    var parts = String(value || '').trim().split('@');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function splitList(value) {
    if (!value) return [];
    return String(value).split(',').map(function (item) {
      return item.trim();
    }).filter(Boolean);
  }

  function lookbookRoot(element) {
    return closestByClass(element, 'lbcard');
  }

  function lookbookProperties(element) {
    var lookbook = lookbookRoot(element);
    var lookbookId = lookbook && lookbook.dataset ? lookbook.dataset.colamyLookbookId || '' : '';
    var productHandles = lookbook && lookbook.dataset ? splitList(lookbook.dataset.colamyLookbookProducts) : [];

    return {
      lookbook_id: lookbookId,
      lookbook_position: elementPosition(lookbook, '.lbcard'),
      product_handles: productHandles,
    };
  }

  function newsletterEmailInput(target) {
    if (!target || target.tagName !== 'INPUT') return null;

    var type = target.type || (target.getAttribute && target.getAttribute('type')) || '';
    var name = target.name || (target.getAttribute && target.getAttribute('name')) || '';

    if (type !== 'email' && name !== 'contact[email]') return null;
    return closestByClass(target, NEWSLETTER_CLASS) ? target : null;
  }

  function newsletterSubmitButton(target) {
    var button = closestTag(target, 'button');
    if (!button || !closestByClass(button, NEWSLETTER_CLASS)) return null;

    var type = button.type || (button.getAttribute && button.getAttribute('type')) || '';
    var name = button.name || (button.getAttribute && button.getAttribute('name')) || '';

    return type === 'submit' || name === 'commit' ? button : null;
  }

  function trackEmailEntered(event) {
    var input = newsletterEmailInput(event && event.target);
    if (!input || !input.value) return;
    var domain = emailDomain(input.value);
    if (!domain) return;
    if (input.dataset && input.dataset.colamyAnalyticsEmailDomain === domain) return;

    if (input.dataset) input.dataset.colamyAnalyticsEmailDomain = domain;

    track(EVENT_EMAIL_ENTERED, 'input', {
      section_id: getSectionId(input),
      section_type: getSectionType(input),
      field_name: input.name || (input.getAttribute && input.getAttribute('name')) || '',
      email_domain: domain,
    });
  }

  function trackNewsletterSubmit(button) {
    track(EVENT_EMAIL_SIGNUP, 'click', {
      section_id: getSectionId(button),
      section_type: getSectionType(button),
      button_text: cleanText(button.textContent),
      button_type: button.tagName ? button.tagName.toLowerCase() : '',
      position: elementPosition(button, 'button'),
    });
  }

  function trackLookbookOpen(trigger) {
    var properties = lookbookProperties(trigger);

    properties.section_id = getSectionId(trigger);
    properties.section_type = getSectionType(trigger);
    properties.button_text = cleanText(trigger.textContent);
    properties.product_count = parseInt(cleanText(trigger.textContent), 10) || null;
    properties.position = elementPosition(trigger, '.' + LOOKBOOK_TRIGGER_CLASS);

    track(EVENT_LOOKBOOK_OPEN, 'click', properties);
  }

  function trackLookbookProductClick(link, product) {
    var properties = lookbookProperties(link);

    properties.section_id = getSectionId(link);
    properties.section_type = getSectionType(link);
    properties.product_title = cleanText(link.textContent) || cleanText(product && product.textContent);
    properties.product_text = cleanText(product && product.textContent);
    properties.href = getHref(link);
    properties.position = elementPosition(product, '.' + LOOKBOOK_PRODUCT_CLASS);

    track(EVENT_LOOKBOOK_PRODUCT, 'click', properties);
  }

  function carouselRoot(element) {
    return closestByClassPrefix(element, CAROUSEL_ROOT_PREFIX);
  }

  function carouselControlType(control) {
    if (hasClassPrefix(control, CAROUSEL_NEXT_PREFIX)) return 'next';
    if (hasClassPrefix(control, CAROUSEL_PREV_PREFIX)) return 'previous';
    if (hasClassPrefix(control, CAROUSEL_DOT_PREFIX)) return 'dot';
    return 'unknown';
  }

  function trackCarouselProductClick(link) {
    var carousel = carouselRoot(link);

    track(EVENT_CAROUSEL_PRODUCT, 'click', {
      section_id: getSectionId(link),
      section_type: getSectionType(link),
      carousel_id: carousel && carousel.tagName ? carousel.tagName.toLowerCase() : '',
      product_title: cleanText(link.textContent) || (link.getAttribute && cleanText(link.getAttribute('aria-label'))),
      href: getHref(link),
      position: elementPosition(link, 'a'),
      slides_per_view: carousel && carousel.dataset ? carousel.dataset.slidesPerView || '' : '',
      slides_per_view_mobile: carousel && carousel.dataset ? carousel.dataset.slidesPerViewMobile || '' : '',
    });
  }

  function trackCarouselControlClick(control) {
    var carousel = carouselRoot(control);

    track(EVENT_CAROUSEL_CONTROL, 'click', {
      section_id: getSectionId(control),
      section_type: getSectionType(control),
      carousel_id: carousel && carousel.tagName ? carousel.tagName.toLowerCase() : '',
      control_type: carouselControlType(control),
    });
  }

  function handleClick(event) {
    var target = event && event.target;
    var lookbookTrigger = closestByClass(target, LOOKBOOK_TRIGGER_CLASS);
    var link = closestTag(target, 'a');
    var lookbookProduct = closestByClass(target, LOOKBOOK_PRODUCT_CLASS);
    var newsletterButton = newsletterSubmitButton(target);
    var carouselControl = closestByClassPrefix(target, CAROUSEL_NAV_PREFIX) || closestByClassPrefix(target, CAROUSEL_DOT_PREFIX);
    var carouselProduct = link && closestByClassPrefix(link, CAROUSEL_PRODUCT_PREFIX) ? link : null;

    if (lookbookTrigger) {
      trackLookbookOpen(lookbookTrigger);
      return;
    }

    if (link && lookbookProduct) {
      trackLookbookProductClick(link, lookbookProduct);
      return;
    }

    if (newsletterButton) {
      trackNewsletterSubmit(newsletterButton);
      return;
    }

    if (carouselProduct) {
      trackCarouselProductClick(carouselProduct);
      return;
    }

    if (carouselControl) {
      trackCarouselControlClick(carouselControl);
    }
  }

  function init() {
    if (window.__colamyBrandCampaignAnalyticsInitialized) return;
    if (!isBrandCampaignPage()) return;
    if (!analytics()) return;

    var main = document.querySelector && document.querySelector('#MainContent');
    if (!main || typeof main.addEventListener !== 'function') return;

    window.__colamyBrandCampaignAnalyticsInitialized = true;

    main.addEventListener('click', handleClick);
    main.addEventListener('change', trackEmailEntered);
    main.addEventListener('blur', trackEmailEntered, true);
    if (typeof analytics().onConsentChange === 'function') {
      analytics().onConsentChange(function (state) {
        if (state.analytics === 'granted' && !pageViewTracked && track(EVENT_VIEW, 'view') !== null) {
          pageViewTracked = true;
        }
      });
    } else if (track(EVENT_VIEW, 'view') !== null) {
      pageViewTracked = true;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);

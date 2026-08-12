(function (window, document) {
  'use strict';

  var SECTION_SELECTOR = '[id^="shopify-section-"]';
  var SLIDER_SELECTOR = 'slideshow-component, summer-save-images-text';
  var ACTIONABLE_SELECTOR = 'a[href], button, [role="button"], .btn';
  var SECTION_THRESHOLD = 0.35;
  var main = null;
  var sectionObserver = null;
  var bannerObserver = null;
  var pointerStart = null;
  var viewedBannerKeys = {};
  var pageViewTracked = false;
  var MIN_EXPOSURE_PIXELS = 200;

  function isSummerSavePage() {
    var page = window.ColamyPage || {};
    var bodyClass = document.body && document.body.className;

    return page.suffix === 'summer-save'
      || (typeof bodyClass === 'string' && bodyClass.split(/\s+/).indexOf('summer-save') !== -1);
  }

  function analytics() {
    return window.ColamyAnalytics && typeof window.ColamyAnalytics.track === 'function'
      ? window.ColamyAnalytics
      : null;
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  function sectionFromElement(element) {
    if (!element || typeof element.closest !== 'function') return null;
    return element.closest(SECTION_SELECTOR);
  }

  function sectionHandle(section) {
    var id = section && section.id ? section.id.replace(/^shopify-section-/, '') : '';
    var instance = id.indexOf('__') === -1 ? id : id.split('__').pop();

    return instance.replace(/_[A-Za-z0-9]+$/, '');
  }

  function sectionPosition(section) {
    if (!main || !section || typeof main.querySelectorAll !== 'function') return null;

    var sections = Array.prototype.slice.call(main.querySelectorAll(SECTION_SELECTOR));
    var index = sections.indexOf(section);

    return index < 0 ? null : index + 1;
  }

  function sectionProperties(element) {
    var section = sectionFromElement(element);
    var handle = sectionHandle(section);
    var declaredType = section && section.getAttribute && section.getAttribute('data-section-type');

    return {
      section_id: section ? section.id : '',
      section_type: declaredType || handle.replace(/_/g, '-'),
      section_handle: handle,
      position: sectionPosition(section),
    };
  }

  function track(eventName, action, element, properties) {
    var client = analytics();
    if (!client) return null;

    return client.track(eventName, Object.assign(
      { event_action: action, event_detail: eventName },
      element ? sectionProperties(element) : {},
      properties || {}
    ));
  }

  function viewportHeight() {
    return window.innerHeight || document.documentElement && document.documentElement.clientHeight || 0;
  }

  function isExposureVisible(element, threshold) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return true;
    var rect = element.getBoundingClientRect();
    var viewport = viewportHeight();
    if (!viewport || rect.bottom <= 0 || rect.top >= viewport) return false;
    var visiblePixels = Math.min(rect.bottom, viewport) - Math.max(rect.top, 0);
    var requiredPixels = Math.min(MIN_EXPOSURE_PIXELS, viewport / 2);
    return (requiredPixels > 0 && visiblePixels >= requiredPixels)
      || visiblePixels / Math.max(rect.height || 1, 1) >= threshold;
  }

  function trackSectionView(section) {
    if (!section || !section.dataset || section.dataset.colamySummerSaveViewed === 'true') return;
    if (track('ss_s_v', 'view', section) === null) return;
    section.dataset.colamySummerSaveViewed = 'true';
    var slider = section.querySelector && section.querySelector(SLIDER_SELECTOR);
    if (slider) trackActiveBannerView(slider);

    if (sectionObserver && typeof sectionObserver.unobserve === 'function') {
      sectionObserver.unobserve(section);
    }
  }

  function observeSections() {
    var sections = main && main.querySelectorAll ? main.querySelectorAll(SECTION_SELECTOR) : [];
    var Observer = window.IntersectionObserver;

    if (typeof Observer !== 'function') {
      Array.prototype.forEach.call(sections, trackSectionView);
      return;
    }

    if (!sectionObserver) {
      sectionObserver = new Observer(function (entries) {
        entries.forEach(function (entry) {
          var visiblePixels = entry.intersectionRect && entry.intersectionRect.height || 0;
          if (entry.isIntersecting && (
            entry.intersectionRatio >= SECTION_THRESHOLD
            || (viewportHeight() > 0 && visiblePixels >= Math.min(MIN_EXPOSURE_PIXELS, viewportHeight() / 2))
          )) {
            trackSectionView(entry.target);
          }
        });
      }, { threshold: [0, SECTION_THRESHOLD] });
    }

    Array.prototype.forEach.call(sections, function (section) {
      if (!section.dataset || section.dataset.colamySummerSaveObserved === 'true') return;

      section.dataset.colamySummerSaveObserved = 'true';
      sectionObserver.observe(section);
    });
  }

  function safeLinkProperties(element) {
    var raw = element && (element.href || element.getAttribute && element.getAttribute('href')) || '';

    if (!raw) {
      return { href: '', href_domain: '', href_type: '', href_query_keys: '' };
    }

    try {
      var parsed = new window.URL(raw, window.location && window.location.href);
      var keys = [];

      parsed.searchParams.forEach(function (_, key) {
        if (keys.indexOf(key) === -1) keys.push(key);
      });

      return {
        href: parsed.pathname || '/',
        href_domain: parsed.hostname || '',
        href_type: parsed.hostname === (window.location && window.location.hostname) ? 'internal' : 'external',
        href_query_keys: keys.join(','),
      };
    } catch (error) {
      return { href: '', href_domain: '', href_type: '', href_query_keys: '' };
    }
  }

  function blockId(element) {
    var block = element && element.closest && element.closest('[data-block-id]');
    return block && block.dataset ? block.dataset.blockId || '' : '';
  }

  function clickProperties(element) {
    var text = cleanText(element && element.textContent);

    return Object.assign({
      block_id: blockId(element),
      click_name: text,
      button_text: text,
      button_type: element && element.tagName ? element.tagName.toLowerCase() : '',
    }, safeLinkProperties(element));
  }

  function selectedProductName(root, productType) {
    var slider = root && root.querySelector && root.querySelector('[data-product-slider="' + productType + '"]');
    var slides = slider && slider.querySelectorAll
      ? Array.prototype.slice.call(slider.querySelectorAll('[data-product-slide]'))
      : [];
    var active = slides.find(function (slide) {
      return slide.getAttribute('aria-hidden') === 'false';
    });
    var title = active && active.querySelector ? active.querySelector('strong') : null;

    return cleanText(title && title.textContent);
  }

  function productPairingProperties(root) {
    var state = root && root.state || {};

    return {
      table_index: typeof state.table === 'number' ? state.table + 1 : null,
      chair_index: typeof state.chair === 'number' ? state.chair + 1 : null,
      set_size: state.set === 0 ? 4 : state.set === 1 ? 6 : null,
      variant_id: root && root.combinationVariant ? root.combinationVariant.id || null : null,
      table_name: selectedProductName(root, 'table'),
      chair_name: selectedProductName(root, 'chair'),
    };
  }

  function controlType(control) {
    if (control.dataset && control.dataset.pairingArrow !== undefined) {
      return Number(control.dataset.direction) < 0 ? 'previous' : 'next';
    }
    if (control.className && String(control.className).indexOf('swiper-button-next') !== -1) {
      return 'next';
    }
    if (control.className && String(control.className).indexOf('swiper-button-prev') !== -1) {
      return 'previous';
    }
    return 'pagination';
  }

  function handleClick(event) {
    var target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;

    var summary = target.closest('.accordion-details__summary');
    if (summary) {
      var details = summary.closest('details');
      var faqSection = sectionFromElement(summary);
      var summaries = faqSection && faqSection.querySelectorAll
        ? Array.prototype.slice.call(faqSection.querySelectorAll('.accordion-details__summary'))
        : [];

      track('ss_ct_ch', details && details.open ? 'collapse' : 'expand', summary, {
        question_text: cleanText(summary.textContent),
        question_position: summaries.indexOf(summary) + 1,
      });
      return;
    }

    var pairing = target.closest('product-pairing');
    if (pairing) {
      var arrow = target.closest('[data-pairing-arrow]');
      var dot = target.closest('[data-pairing-dot]');
      var setButton = target.closest('[data-set-index]');
      var detailsButton = target.closest('[data-pairing-details]');
      var addButton = target.closest('[data-pairing-add]');

      if (arrow || dot) {
        var pairingControl = arrow || dot;

        track('ss_pp_c', 'click', pairingControl, Object.assign(productPairingProperties(pairing), {
          product_type: pairingControl.dataset.productType || '',
          control_type: controlType(pairingControl),
          direction: arrow ? (Number(arrow.dataset.direction) < 0 ? 'previous' : 'next') : '',
          selected_index: dot ? Number(dot.dataset.index) + 1 : null,
        }));
        return;
      }

      if (setButton && !setButton.disabled) {
        track('ss_pp_ch', 'change', setButton, Object.assign(productPairingProperties(pairing), {
          selection_type: 'set',
          selected_index: Number(setButton.dataset.setIndex) + 1,
        }));
        return;
      }

      if (detailsButton || addButton) {
        var pairingButton = detailsButton || addButton;
        if (pairingButton.disabled || pairingButton.getAttribute('aria-disabled') === 'true') return;

        track('ss_pp_b', 'click', pairingButton, Object.assign(
          productPairingProperties(pairing),
          clickProperties(pairingButton),
          { button_name: detailsButton ? 'view_details' : 'add_set_to_cart' }
        ));
        return;
      }
    }

    var sliderControl = target.closest('.swiper-button, .swiper-pagination-bullet');
    if (sliderControl) {
      var controlSection = sectionFromElement(sliderControl);
      var controlSlider = sliderControl.closest(SLIDER_SELECTOR)
        || (controlSection && controlSection.querySelector && controlSection.querySelector(SLIDER_SELECTOR));

      if (controlSlider) {
        track('ss_sl_c', 'click', sliderControl, {
          slider_type: controlSlider.tagName.toLowerCase(),
          control_type: controlType(sliderControl),
        });
        return;
      }
    }

    var actionable = target.closest(ACTIONABLE_SELECTOR);
    if (!actionable) return;

    var slideshow = actionable.closest('slideshow-component');
    if (slideshow && actionable.closest('.swiper-slide')) {
      track('ss_sb_b', 'click', actionable, clickProperties(actionable));
      return;
    }

    var images = actionable.closest('summer-save-images-text');
    if (images) {
      var card = actionable.closest('.swiper-slide');

      track('ss_it_b', 'click', actionable, Object.assign(clickProperties(actionable), {
        card_position: card && card.dataset ? Number(card.dataset.index) + 1 : null,
      }));
      return;
    }

    var section = sectionFromElement(actionable);
    if (sectionHandle(section) === 'apps') {
      track('ss_app_b', 'click', actionable, clickProperties(actionable));
      return;
    }

    track('ss_b', 'click', actionable, clickProperties(actionable));
  }

  function bannerProperties(slide) {
    return {
      banner_id: slide && slide.dataset ? slide.dataset.blockId || '' : '',
      banner_index: slide && slide.dataset && slide.dataset.index !== undefined
        ? Number(slide.dataset.index) + 1
        : null,
      banner_type: slide && slide.dataset ? slide.dataset.type || '' : '',
      banner_text: cleanText(slide && slide.textContent),
    };
  }

  function trackBannerView(slide) {
    if (!slide || !slide.dataset) return;

    var properties = bannerProperties(slide);
    var sectionId = sectionProperties(slide).section_id;
    var key = sectionId + ':' + (slide.dataset.blockId || properties.banner_index);

    if (viewedBannerKeys[key]) return;

    if (track('ss_sb_v', 'view', slide, properties) !== null) {
      viewedBannerKeys[key] = true;
      slide.dataset.colamySummerSaveBannerViewed = key;
    }
  }

  function activeBannerSlide(slider) {
    if (!slider || slider.tagName !== 'SLIDESHOW-COMPONENT' || typeof slider.querySelector !== 'function') {
      return null;
    }

    return slider.querySelector('.swiper-slide-active')
      || slider.querySelector('[aria-hidden="false"]')
      || slider.querySelector('.swiper-slide');
  }

  function trackActiveBannerView(slider) {
    if (!isExposureVisible(slider, SECTION_THRESHOLD)) return;
    trackBannerView(activeBannerSlide(slider));
  }

  function observeSliders() {
    var sliders = main && main.querySelectorAll ? main.querySelectorAll(SLIDER_SELECTOR) : [];
    var Observer = window.MutationObserver || window.WebKitMutationObserver;

    Array.prototype.forEach.call(sliders, function (slider) {
      trackActiveBannerView(slider);

      if (slider.tagName === 'SLIDESHOW-COMPONENT' && typeof window.IntersectionObserver === 'function') {
        if (!bannerObserver) {
          bannerObserver = new window.IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) trackActiveBannerView(entry.target);
            });
          }, { threshold: [0, SECTION_THRESHOLD] });
        }
        if (!slider.dataset || slider.dataset.colamySummerSaveBannerObserved !== 'true') {
          if (slider.dataset) slider.dataset.colamySummerSaveBannerObserved = 'true';
          bannerObserver.observe(slider);
        }
      }

      if (!slider.dataset
        || slider.dataset.colamySummerSaveSliderObserved === 'true'
        || typeof Observer !== 'function') {
        return;
      }

      slider.dataset.colamySummerSaveSliderObserved = 'true';
      var previousSelectedIndex = slider.getAttribute('selected-index');

      var observer = new Observer(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.attributeName !== 'selected-index') return;

          var selectedIndex = slider.getAttribute('selected-index');
          if (selectedIndex === previousSelectedIndex) return;

          var wasInitialized = previousSelectedIndex !== null;
          previousSelectedIndex = selectedIndex;

          if (!wasInitialized) {
            trackActiveBannerView(slider);
            return;
          }

          track('ss_sl_ch', 'change', slider, {
            slider_type: slider.tagName.toLowerCase(),
            selected_index: selectedIndex || '',
          });
          trackActiveBannerView(slider);
        });
      });

      observer.observe(slider, {
        attributes: true,
        attributeFilter: ['selected-index'],
      });
    });
  }

  function selectedPairingIndex(root, productType) {
    return root && root.state && typeof root.state[productType] === 'number'
      ? root.state[productType]
      : null;
  }

  function sliderIndex(slider) {
    if (!slider) return null;
    var attribute = slider.getAttribute && slider.getAttribute('selected-index');
    if (attribute !== null && attribute !== '') return String(attribute);
    var instance = slider.sliderInstance && slider.sliderInstance.slider;
    var index = instance && (instance.realIndex !== undefined ? instance.realIndex : instance.activeIndex);
    return typeof index === 'number' ? String(index) : null;
  }

  function handlePointerDown(event) {
    var target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (event.pointerType === 'mouse' && event.button !== undefined && event.button !== 0) return;

    var productSlider = target.closest('[data-product-slider]');
    var pairing = productSlider && productSlider.closest('product-pairing');

    if (pairing) {
      var productType = productSlider.dataset ? productSlider.dataset.productSlider || '' : '';

      pointerStart = {
        kind: 'product-pairing',
        target: pairing,
        productType: productType,
        selectedIndex: selectedPairingIndex(pairing, productType),
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      return;
    }

    var slider = target.closest(SLIDER_SELECTOR);
    if (!slider) return;

    pointerStart = {
      kind: 'slider',
      target: slider,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      selectedIndex: sliderIndex(slider),
    };
  }

  function clearPointerStart() {
    pointerStart = null;
  }

  function handlePointerUp(event) {
    if (!pointerStart) return;

    var start = pointerStart;
    pointerStart = null;

    if (start.pointerId !== undefined
      && event.pointerId !== undefined
      && start.pointerId !== event.pointerId) {
      return;
    }

    var deltaX = event.clientX - start.x;
    var deltaY = event.clientY - start.y;
    var absX = Math.abs(deltaX);
    var absY = Math.abs(deltaY);
    var direction = deltaX < 0 ? 'next' : 'previous';

    if (start.kind === 'product-pairing') {
      if (absX < 48 || absX <= absY) return;

      var selectedIndex = selectedPairingIndex(start.target, start.productType);
      if (selectedIndex === null || selectedIndex === start.selectedIndex) return;

      track('ss_pp_sw', 'swipe', start.target, Object.assign(productPairingProperties(start.target), {
        product_type: start.productType,
        direction: direction,
        selected_index: selectedIndex + 1,
      }));
      return;
    }

    if (absX < 40 || absX < absY * 1.5) return;
    var selectedIndex = sliderIndex(start.target);
    if (selectedIndex === null || selectedIndex === start.selectedIndex) return;

    track('ss_sl_sw', 'swipe', start.target, {
      slider_type: start.target.tagName ? start.target.tagName.toLowerCase() : '',
      direction: direction,
      selected_index: selectedIndex,
    });
  }

  function init() {
    if (window.__colamySummerSaveAnalyticsInitialized || !isSummerSavePage() || !analytics()) return;

    main = document.querySelector && document.querySelector('#MainContent');
    if (!main || typeof main.addEventListener !== 'function') return;

    window.__colamySummerSaveAnalyticsInitialized = true;

    main.addEventListener('click', handleClick);
    main.addEventListener('pointerdown', handlePointerDown);
    main.addEventListener('pointerup', handlePointerUp);
    main.addEventListener('pointercancel', clearPointerStart);
    if (typeof analytics().onConsentChange === 'function') {
      analytics().onConsentChange(function (state) {
        if (state.analytics !== 'granted') return;
        if (!pageViewTracked && track('ss_p_v', 'view') !== null) pageViewTracked = true;
        Array.prototype.forEach.call(main.querySelectorAll(SECTION_SELECTOR), function (section) {
          if (isExposureVisible(section, SECTION_THRESHOLD)) trackSectionView(section);
        });
        Array.prototype.forEach.call(main.querySelectorAll(SLIDER_SELECTOR), trackActiveBannerView);
      });
    } else if (track('ss_p_v', 'view') !== null) {
      pageViewTracked = true;
    }
    observeSections();
    observeSliders();

    document.addEventListener('shopify:section:load', function () {
      observeSections();
      observeSliders();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);

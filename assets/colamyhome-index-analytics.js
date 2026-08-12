(function (window, document) {
  'use strict';

  var SECTION_SELECTOR = '[id^="shopify-section-"]';
  var ACTIONABLE_SELECTOR = 'a[href], button, [role="button"], .btn, [data-click-link]';
  var SLIDER_SELECTOR = 'slideshow-component, slideshow-with-product, images-text, collection-list-slider, featured-collection, testimonials-masonry-slider';
  var BANNER_SLIDE_SELECTOR = '.swiper-slide';
  var SECTION_THRESHOLD = 0.4;
  var SWIPE_DISTANCE = 40;
  var SWIPE_AXIS_RATIO = 1.5;
  var pointerStart = null;
  var sectionObserver = null;
  var bannerObserver = null;
  var viewedBannerKeys = {};
  var main = null;
  var pageViewTracked = false;
  var MIN_EXPOSURE_PIXELS = 200;

  var MODULE_EVENTS = {
    images_text: 'h_it_b',
    scrolling_promotion: 'h_sp_b',
    motion_banner: 'h_mb_b',
    featured_collection: 'h_fc_b',
    slideshow_with_product: 'h_swp_b',
    banner_with_hotspots_title: 'h_bht_b',
    video_hero_icons: 'h_vhi_b',
    testimonials_masonry: 'h_tm_b',
    promotion_banner: 'h_pb_b',
    slideshow_with_product_bottom: 'h_swpb_b',
    lookbook_banner: 'h_lb_b',
    custom_content: 'h_cc_b',
    scrolling_gallery_image: 'h_sgi_b',
    featured_blog: 'h_fb_b',
  };

  var SECTION_TYPES = {
    slideshow_banner: 'slideshow',
    scrolling_promotion: 'scrolling',
    images_text: 'images',
    motion_banner: 'motion',
    featured_collection: 'featured',
    slideshow_with_product: 'slideshow',
    banner_with_hotspots_title: 'banner',
    video_hero_icons: 'video',
    testimonials_masonry: 'testimonials',
    promotion_banner: 'promotion',
    slideshow_with_product_bottom: 'slideshow',
    lookbook_banner: 'lookbook',
    custom_content: 'custom',
    scrolling_gallery_image: 'scrolling',
    featured_blog: 'featured',
    apps: 'apps',
  };

  function isHomePage() {
    var pageType = window.ColamyPage && window.ColamyPage.type;
    var bodyClass = document.body && document.body.className;

    return pageType === 'index'
      || (typeof bodyClass === 'string' && bodyClass.indexOf('index-template') !== -1);
  }

  function analytics() {
    return window.ColamyAnalytics && typeof window.ColamyAnalytics.track === 'function'
      ? window.ColamyAnalytics
      : null;
  }

  function sectionFromElement(element) {
    if (!element || typeof element.closest !== 'function') return null;
    return element.closest(SECTION_SELECTOR);
  }

  function getSectionId(element) {
    var section = sectionFromElement(element);
    return section ? section.id : '';
  }

  function sectionHandle(section) {
    var id = section && section.id ? section.id.replace(/^shopify-section-/, '') : '';
    var instance = id.indexOf('__') === -1 ? id : id.split('__').pop();
    if (
      /^[a-f0-9]{16,}$/i.test(instance)
      && section
      && section.querySelector
      && section.querySelector('.section-app')
    ) {
      return 'apps';
    }
    return instance.replace(/_[A-Za-z0-9]+$/, '');
  }

  function getSectionType(element) {
    var section = sectionFromElement(element);
    var handle = sectionHandle(section);
    var declared = section && section.getAttribute && section.getAttribute('data-section-type');
    return declared || SECTION_TYPES[handle] || handle.replace(/_/g, '-') || '';
  }

  function sectionPosition(section) {
    if (!main || !section || typeof main.querySelectorAll !== 'function') return null;
    var sections = Array.prototype.slice.call(main.querySelectorAll(SECTION_SELECTOR));
    var index = sections.indexOf(section);
    return index < 0 ? null : index + 1;
  }

  function cleanText(value) {
    return (value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function elementPosition(element, selector) {
    var section = sectionFromElement(element);
    if (!section || typeof section.querySelectorAll !== 'function') return null;

    var elements = Array.prototype.slice.call(section.querySelectorAll(selector));
    var index = elements.indexOf(element);
    return index >= 0 ? index + 1 : null;
  }

  function eventProperties(action, detail, element, extra) {
    var section = element ? sectionFromElement(element) : null;
    return Object.assign({
      event_action: action,
      event_detail: detail,
      section_id: section ? section.id : '',
      section_type: getSectionType(element),
    }, extra || {});
  }

  function track(eventName, action, element, extra) {
    var client = analytics();
    if (!client) return null;
    return client.track(eventName, eventProperties(action, eventName, element, extra));
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

  function getBannerIndex(slide) {
    if (!slide) return null;

    var datasetIndex = slide.dataset && slide.dataset.index;
    if (datasetIndex !== undefined && datasetIndex !== null && datasetIndex !== '') {
      var parsedIndex = parseInt(datasetIndex, 10);
      return isNaN(parsedIndex) ? null : parsedIndex + 1;
    }

    return elementPosition(slide, BANNER_SLIDE_SELECTOR);
  }

  function bannerProperties(slide) {
    return {
      banner_id: slide && slide.dataset ? slide.dataset.blockId || '' : '',
      banner_index: getBannerIndex(slide),
      banner_type: slide && slide.dataset ? slide.dataset.type || '' : '',
      banner_text: cleanText(slide && slide.textContent),
    };
  }

  function isBannerSection(element) {
    return sectionHandle(sectionFromElement(element)) === 'slideshow_banner';
  }

  function activeBannerSlide(slider) {
    if (!slider || !isBannerSection(slider) || typeof slider.querySelector !== 'function') return null;

    return slider.querySelector('.swiper-slide-active')
      || slider.querySelector('[aria-hidden="false"]')
      || slider.querySelector(BANNER_SLIDE_SELECTOR);
  }

  function trackBannerView(slide) {
    if (!slide || !slide.dataset) return;

    var key = getSectionId(slide) + ':' + (slide.dataset.blockId || getBannerIndex(slide));
    if (viewedBannerKeys[key]) return;
    if (track('h_sb_v', 'view', slide, bannerProperties(slide)) !== null) {
      viewedBannerKeys[key] = true;
    }
  }

  function trackActiveBannerView(slider) {
    if (!isExposureVisible(slider, SECTION_THRESHOLD)) return;
    trackBannerView(activeBannerSlide(slider));
  }

  function isDisabled(element) {
    return Boolean(element && (
      element.disabled
      || element.getAttribute && element.getAttribute('aria-disabled') === 'true'
      || element.getAttribute && element.getAttribute('disabled') !== null
    ));
  }

  function blockId(element) {
    var block = element && element.closest && element.closest('[data-block-id]');
    if (block && block.dataset) return block.dataset.blockId || '';

    var editorBlock = element && element.closest && element.closest('[data-shopify-editor-block]');
    if (!editorBlock || !editorBlock.getAttribute) return '';
    try {
      return JSON.parse(editorBlock.getAttribute('data-shopify-editor-block') || '{}').id || '';
    } catch (error) {
      return '';
    }
  }

  function clickProperties(element) {
    var text = cleanText(element && element.textContent);
    return {
      block_id: blockId(element),
      click_name: text,
      button_text: text,
      button_type: element && element.tagName ? element.tagName.toLowerCase() : '',
      href: element && (
        element.href
        || element.dataset && element.dataset.clickLink
        || element.getAttribute && element.getAttribute('href')
      ) || '',
      position: elementPosition(element, ACTIONABLE_SELECTOR),
    };
  }

  function controlType(control) {
    var className = control && control.className ? control.className : '';
    if (className.indexOf('swiper-button-next') !== -1) return 'next';
    if (className.indexOf('swiper-button-prev') !== -1) return 'previous';
    return 'pagination';
  }

  function sliderForControl(control) {
    if (!control || typeof control.closest !== 'function') return null;
    var section = sectionFromElement(control);
    var container = control.parentElement;
    while (container && container !== section) {
      if (container.querySelector) {
        var nearby = container.querySelector(SLIDER_SELECTOR);
        if (nearby) return nearby;
      }
      container = container.parentElement;
    }
    return control.closest(SLIDER_SELECTOR)
      || (section && section.querySelector && section.querySelector(SLIDER_SELECTOR));
  }

  function handleClick(event) {
    var target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;

    var control = target.closest('.swiper-button, .swiper-pagination-bullet');
    if (control) {
      var slider = sliderForControl(control);
      if (slider) {
        track('h_sl_c', 'click', control, {
          slider_type: slider.tagName ? slider.tagName.toLowerCase() : '',
          control_type: controlType(control),
        });
        return;
      }
    }

    var actionable = target.closest(ACTIONABLE_SELECTOR);
    if (!actionable || isDisabled(actionable)) return;
    var slide = actionable.closest(BANNER_SLIDE_SELECTOR);
    if (slide && sectionHandle(sectionFromElement(slide)) === 'slideshow_banner') {
      track(
        'h_sb_b',
        'click',
        actionable,
        Object.assign(bannerProperties(slide), clickProperties(actionable))
      );
      return;
    }

    var section = sectionFromElement(actionable);
    var handle = sectionHandle(section);
    if (handle === 'apps' || actionable.closest('.section-app')) {
      track('h_app_b', 'click', actionable, clickProperties(actionable));
      return;
    }
    track(MODULE_EVENTS[handle] || 'h_b', 'click', actionable, clickProperties(actionable));
  }

  function findSlider(target) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest(SLIDER_SELECTOR);
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
    if (event && event.pointerType === 'mouse' && event.button !== 0) return;
    var slider = findSlider(event && event.target);
    if (!slider) return;

    pointerStart = {
      target: slider,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      selectedIndex: sliderIndex(slider),
    };
  }

  function handlePointerUp(event) {
    if (!pointerStart) return;
    if (
      pointerStart.pointerId !== undefined
      && event.pointerId !== undefined
      && event.pointerId !== pointerStart.pointerId
    ) {
      return;
    }

    var start = pointerStart;
    var slider = findSlider(event && event.target) || start.target;
    if (!slider || slider !== start.target) {
      pointerStart = null;
      return;
    }

    var deltaX = event.clientX - start.x;
    var deltaY = event.clientY - start.y;
    var absX = Math.abs(deltaX);
    var absY = Math.abs(deltaY);
    pointerStart = null;

    if (absX < SWIPE_DISTANCE || absX < absY * SWIPE_AXIS_RATIO) return;
    var selectedIndex = sliderIndex(slider);
    if (selectedIndex === null || selectedIndex === start.selectedIndex) return;
    track('h_sl_sw', 'swipe', slider, {
      slider_type: slider.tagName ? slider.tagName.toLowerCase() : '',
      direction: deltaX < 0 ? 'next' : 'previous',
      selected_index: selectedIndex || '',
    });
  }

  function trackSectionView(section) {
    if (!section || !section.dataset || section.dataset.colamyHomeViewed === 'true') return;
    if (track('h_s_v', 'view', section, { position: sectionPosition(section) }) === null) return;
    section.dataset.colamyHomeViewed = 'true';
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
      if (!section.dataset || section.dataset.colamyHomeObserved === 'true') return;
      section.dataset.colamyHomeObserved = 'true';
      sectionObserver.observe(section);
    });
  }

  function observeSliders() {
    var sliders = document.querySelectorAll ? document.querySelectorAll(SLIDER_SELECTOR) : [];
    if (!sliders || !sliders.length) return;
    var MutationObserverConstructor = window.MutationObserver || window.WebKitMutationObserver;

    Array.prototype.forEach.call(sliders, function (slider) {
      if (!slider || !slider.dataset || slider.dataset.colamyAnalyticsObserved === 'true') return;

      slider.dataset.colamyAnalyticsObserved = 'true';
      trackActiveBannerView(slider);
      if (isBannerSection(slider) && typeof window.IntersectionObserver === 'function') {
        if (!bannerObserver) {
          bannerObserver = new window.IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) trackActiveBannerView(entry.target);
            });
          }, { threshold: [0, SECTION_THRESHOLD] });
        }
        bannerObserver.observe(slider);
      }

      if (typeof MutationObserverConstructor !== 'function') return;
      var previousSelectedIndex = slider.getAttribute
        ? slider.getAttribute('selected-index')
        : null;
      var observer = new MutationObserverConstructor(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.attributeName !== 'selected-index') return;

          var selectedIndex = slider.getAttribute
            ? slider.getAttribute('selected-index')
            : null;
          if (selectedIndex === previousSelectedIndex) return;
          if (previousSelectedIndex === null) {
            previousSelectedIndex = selectedIndex;
            trackActiveBannerView(slider);
            return;
          }
          previousSelectedIndex = selectedIndex;

          track('h_sl_ch', 'change', slider, {
            slider_type: slider.tagName ? slider.tagName.toLowerCase() : '',
            selected_index: selectedIndex || '',
          });
          trackActiveBannerView(slider);
        });
      });

      observer.observe(slider, { attributes: true, attributeFilter: ['selected-index'] });
    });
  }

  function init() {
    if (window.__colamyHomeAnalyticsInitialized) return;
    if (!isHomePage()) return;
    if (!analytics()) return;

    main = document.querySelector && document.querySelector('#MainContent');
    if (!main || typeof main.addEventListener !== 'function') return;

    window.__colamyHomeAnalyticsInitialized = true;
    main.addEventListener('click', handleClick);
    main.addEventListener('pointerdown', handlePointerDown);
    main.addEventListener('pointerup', handlePointerUp);
    main.addEventListener('pointercancel', function () { pointerStart = null; });
    if (typeof analytics().onConsentChange === 'function') {
      analytics().onConsentChange(function (state) {
        if (state.analytics !== 'granted') return;
        if (!pageViewTracked && track('h_p_v', 'view') !== null) pageViewTracked = true;
        Array.prototype.forEach.call(main.querySelectorAll(SECTION_SELECTOR), function (section) {
          if (isExposureVisible(section, SECTION_THRESHOLD)) trackSectionView(section);
        });
        Array.prototype.forEach.call(main.querySelectorAll(SLIDER_SELECTOR), trackActiveBannerView);
      });
    } else if (track('h_p_v', 'view') !== null) {
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

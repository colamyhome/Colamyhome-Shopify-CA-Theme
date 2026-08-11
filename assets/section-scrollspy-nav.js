(() => {
  const sectionSelector = '.section-scrollspy-nav';
  const activeClass = 'is-active';
  const initializedAttribute = 'data-scrollspy-nav-initialized';
  const mobileMediaQuery = window.matchMedia('(max-width: 767.98px)');

  function getPixelValue(element, propertyName) {
    const value = getComputedStyle(element).getPropertyValue(propertyName);
    return Number.parseFloat(value) || 0;
  }

  function getHeaderHeight() {
    if (document.body.classList.contains('product-template')) {
      return 0;
    }

    return getPixelValue(document.documentElement, '--header-height');
  }

  function initSection(section) {
    if (section.hasAttribute(initializedAttribute)) return;

    const nav = section.querySelector('.scrollspy-nav__nav');
    const links = Array.from(section.querySelectorAll('.scrollspy-nav__nav-link'));
    const blocks = Array.from(section.querySelectorAll('.scrollspy-nav__block'));

    if (!nav || links.length === 0 || blocks.length === 0) return;

    section.setAttribute(initializedAttribute, 'true');

    const linksByBlockId = new Map(
      links.map((link) => [link.dataset.scrollspyNavLink, link])
    );
    let isTicking = false;

    function isMobileStickyNavEnabled() {
      return section.dataset.mobileStickyNav !== 'false' || !mobileMediaQuery.matches;
    }

    function setActive(activeLink) {
      links.forEach((link) => {
        link.classList.toggle(activeClass, link === activeLink);
        link.toggleAttribute('aria-current', link === activeLink);
      });
    }

    function getTopReadingLine() {
      const stickyNavHeight = isMobileStickyNavEnabled() ? nav.getBoundingClientRect().height : 0;

      return getHeaderHeight() + getPixelValue(section, '--scrollspy-nav-sticky-gap') + stickyNavHeight;
    }

    function findActiveBlock() {
      const topReadingLine = getTopReadingLine();

      return blocks.find((block) => {
        const rect = block.getBoundingClientRect();
        return rect.bottom > topReadingLine;
      }) || blocks[blocks.length - 1];
    }

    function updateActive() {
      isTicking = false;
      const activeBlock = findActiveBlock();
      const activeLink = linksByBlockId.get(activeBlock.id) || links[0];

      setActive(activeLink);
    }

    function scheduleUpdate() {
      if (isTicking) return;

      isTicking = true;
      window.requestAnimationFrame(updateActive);
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    mobileMediaQuery.addEventListener?.('change', scheduleUpdate);
    scheduleUpdate();
  }

  function initAllSections(root = document) {
    root.querySelectorAll(sectionSelector).forEach(initSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAllSections());
  } else {
    initAllSections();
  }

  document.addEventListener('shopify:section:load', (event) => {
    if (event.target.matches?.(sectionSelector)) {
      initSection(event.target);
      return;
    }

    initAllSections(event.target);
  });
})();

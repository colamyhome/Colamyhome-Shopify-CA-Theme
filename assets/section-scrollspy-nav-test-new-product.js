(() => {
  const quietLuxuryPaginationSelector = '[data-quiet-luxury-pagination]';
  const quietLuxuryPaginationInitializedAttribute = 'data-quiet-luxury-pagination-initialized';

  function initQuietLuxuryPagination(pagination) {
    if (pagination.hasAttribute(quietLuxuryPaginationInitializedAttribute)) return;

    const targetId = pagination.dataset.target;
    const scroller = document.getElementById(targetId);
    const current = pagination.querySelector('[data-quiet-luxury-pagination-current]');
    const total = pagination.querySelector('.quiet-luxury-card__pagination-total');
    const previousButton = pagination.querySelector('[data-quiet-luxury-pagination-prev]');
    const nextButton = pagination.querySelector('[data-quiet-luxury-pagination-next]');
    const items = Array.from(scroller?.querySelectorAll('.quiet-luxury-card__item') || []);

    if (!scroller || !current || !total || !previousButton || !nextButton || items.length === 0) return;

    pagination.setAttribute(quietLuxuryPaginationInitializedAttribute, 'true');

    let activeIndex = 0;
    let isPaginationTicking = false;

    function clampQuietLuxuryIndex(index) {
      return Math.min(Math.max(index, 0), items.length - 1);
    }

    function getQuietLuxuryActiveIndex() {
      return items.reduce((closestIndex, item, index) => {
        const closestItem = items[closestIndex];
        const currentDistance = Math.abs(item.offsetLeft - scroller.scrollLeft);
        const closestDistance = Math.abs(closestItem.offsetLeft - scroller.scrollLeft);

        return currentDistance < closestDistance ? index : closestIndex;
      }, 0);
    }

    function updateQuietLuxuryPagination() {
      isPaginationTicking = false;
      activeIndex = getQuietLuxuryActiveIndex();
      current.textContent = String(activeIndex + 1);
      total.textContent = String(items.length);
      previousButton.disabled = activeIndex === 0;
      nextButton.disabled = activeIndex === items.length - 1;
    }

    function scheduleQuietLuxuryPaginationUpdate() {
      if (isPaginationTicking) return;

      isPaginationTicking = true;
      window.requestAnimationFrame(updateQuietLuxuryPagination);
    }

    function scrollQuietLuxuryToIndex(index) {
      const nextIndex = clampQuietLuxuryIndex(index);
      const nextItem = items[nextIndex];

      if (!nextItem) return;

      activeIndex = nextIndex;
      current.textContent = String(activeIndex + 1);
      previousButton.disabled = activeIndex === 0;
      nextButton.disabled = activeIndex === items.length - 1;
      scroller.scrollTo({ left: nextItem.offsetLeft, behavior: 'smooth' });
    }

    previousButton.addEventListener('click', () => scrollQuietLuxuryToIndex(activeIndex - 1));
    nextButton.addEventListener('click', () => scrollQuietLuxuryToIndex(activeIndex + 1));
    scroller.addEventListener('scroll', scheduleQuietLuxuryPaginationUpdate, { passive: true });
    window.addEventListener('resize', scheduleQuietLuxuryPaginationUpdate);
    updateQuietLuxuryPagination();
  }

  function initQuietLuxuryPaginations(root = document) {
    root.querySelectorAll(quietLuxuryPaginationSelector).forEach(initQuietLuxuryPagination);
  }

  function initAllSections(root = document) {
    initQuietLuxuryPaginations(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAllSections());
  } else {
    initAllSections();
  }

  document.addEventListener('shopify:section:load', (event) => {
    initAllSections(event.target);
  });
})();

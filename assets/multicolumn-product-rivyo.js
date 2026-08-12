if (!window.multicolumnProductRivyoInitializer) {
  window.multicolumnProductRivyoInitializer = true;

  const initializeRivyoProductRatings = () => {
    if (typeof window.wc_get_review_badge !== 'function') return false;
    window.wc_get_review_badge(true);
    return true;
  };

  const initializeWhenReady = () => {
    let attempts = 0;
    const tryInitialize = () => {
      if (initializeRivyoProductRatings() || attempts >= 20) return;
      attempts += 1;
      window.setTimeout(tryInitialize, 250);
    };
    tryInitialize();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWhenReady, { once: true });
  } else {
    initializeWhenReady();
  }

  document.addEventListener('shopify:section:load', initializeWhenReady);
}

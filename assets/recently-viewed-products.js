if (!customElements.get('recently-viewed-products')) {
  customElements.define(
    'recently-viewed-products',
    class RecentlyViewedProducts extends HTMLElement {
      constructor() {
        super();

        if ('requestIdleCallback' in window) {
          requestIdleCallback(this.init.bind(this), { timeout: 1500 });
        } else {
          FoxTheme.Motion.inView(this, this.init.bind(this), { margin: '0px 0px 400px 0px' });
        }
      }

      init() {
        const queryUrl = this.getQueryUrl();
        if (!queryUrl) {
          if (this.showEmptyState()) {
            this.dispatchEvent(new CustomEvent('recommendations:empty'));
            return;
          }

          this.removeSection();
          return;
        }

        fetch(queryUrl)
          .then((response) => response.text())
          .then((responseText) => {
            const sectionInnerHTML = new DOMParser()
              .parseFromString(responseText, 'text/html')
              .querySelector('.shopify-section');

            if (sectionInnerHTML === null) return;

            const recommendations = sectionInnerHTML.querySelector('recently-viewed-products');
            let productCount = 0;

            if (recommendations && recommendations.innerHTML.trim().length) {
              const section = recommendations.querySelector('.section');
              productCount = recommendations.querySelectorAll('.product-card').length;
              const panel = this.closest('.header-recently-viewed__panel');

              if (section) {
                section.classList.remove('hidden');
              }

              if (panel) {
                panel.dataset.productCount = String(productCount);
              }

              this.innerHTML = recommendations.innerHTML;
            }

            if (productCount > 0) {
              this.dispatchEvent(new CustomEvent('recommendations:loaded'));
            } else {
              if (!this.showEmptyState()) {
                this.removeSection();
              }

              this.dispatchEvent(new CustomEvent('recommendations:empty'));
            }
          })
          .catch((e) => {
            console.error(e);
          });
      }

      getQueryUrl() {
        const items = JSON.parse(window.localStorage.getItem('hypertheme:recently-viewed') || '[]');
        const productId = parseInt(this.dataset.productId);
        const productsToShow = parseInt(this.dataset.productsToShow);

        if (items.includes(productId)) {
          items.splice(items.indexOf(productId), 1);
        }

        if (items.length > 0) {
          const queryParams = items
            .map((item) => 'id:' + item)
            .slice(0, productsToShow)
            .join(' OR ');

          return this.dataset.url + queryParams;
        }

        return false;
      }

      showEmptyState() {
        const emptyState = this.querySelector('.header-recently-viewed__empty');
        if (!emptyState) return false;

        const content = this.querySelector('.header-recently-viewed__content');
        const panel = this.closest('.header-recently-viewed__panel');
        const productCount = emptyState.querySelectorAll('.product-card').length;

        if (content) {
          content.classList.add('hidden');
        }

        if (panel) {
          panel.dataset.productCount = String(productCount);
        }

        emptyState.classList.remove('hidden');
        return true;
      }

      removeSection() {
        this.remove();
      }

      sendTrekkieEvent(numberProducts) {
        if (!window.ShopifyAnalytics || !window.ShopifyAnalytics.lib || !window.ShopifyAnalytics.lib.track) {
          return;
        }
        let didPageJumpOccur = this.getBoundingClientRect().top <= window.innerHeight;

        window.ShopifyAnalytics.lib.track('Recently Viewed Products Displayed', {
          theme: Shopify.theme.name,
          didPageJumpOccur: didPageJumpOccur,
          numberOfRecommendationsDisplayed: numberProducts,
        });
      }
    }
  );
}

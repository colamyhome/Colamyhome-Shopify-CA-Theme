if (!customElements.get('testimonials-masonry-slider')) {
  customElements.define(
    'testimonials-masonry-slider',
    class TestimonialsMasonrySlider extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        this.selectors = {
          sliderWrapper: '.testimonials-masonry__items',
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev',
          pagination: '.swiper-pagination',
        };
        this.classes = {
          grid: 'f-grid',
          swiper: 'swiper',
          swiperWrapper: 'swiper-wrapper',
        };

        this.sectionId = this.dataset.sectionId;
        this.sectionEl = this.closest(`.section-${this.sectionId}`);
        this.sliderWrapper = this.querySelector(this.selectors.sliderWrapper);

        this.enableSlider = this.dataset.enableSlider === 'true';
        this.items = parseInt(this.dataset.items);
        this.tabletItems = parseInt(this.dataset.tabletItems) || 2;

        this.sliderInstance = false;

        this.alignProducts = this.closest('.testimonials-masonry--align-products');
        if (this.alignProducts) {
          this.alignProductRows = this.alignProductRows.bind(this);
          this.resizeObserver = new ResizeObserver(this.alignProductRows);
          this.querySelectorAll('.testimonial__wrapper').forEach((wrapper) => this.resizeObserver.observe(wrapper));
          window.addEventListener('resize', this.alignProductRows);
          this.alignProductRows();
        }

        if (!this.enableSlider) return;

        const mql = window.matchMedia(FoxTheme.config.mediaQueryMobile);
        mql.onchange = this.init.bind(this);
        this.init();
      }

      disconnectedCallback() {
        if (!this.alignProducts) return;
        this.resizeObserver.disconnect();
        window.removeEventListener('resize', this.alignProductRows);
        cancelAnimationFrame(this.alignProductsFrame);
      }

      alignProductRows() {
        const wrappers = Array.from(this.querySelectorAll('.testimonial__wrapper'));
        if (!wrappers.length || this.isAligningProducts || this.alignProductsFrame) return;

        this.alignProductsFrame = requestAnimationFrame(() => {
          this.alignProductsFrame = null;
          this.isAligningProducts = true;

          wrappers.forEach((wrapper) => wrapper.style.removeProperty('min-height'));
          const tallestContent = Math.max(...wrappers.map((wrapper) => wrapper.getBoundingClientRect().height));
          wrappers.forEach((wrapper) => wrapper.style.setProperty('min-height', `${tallestContent}px`));

          if (this.sliderInstance) this.sliderInstance.slider.update();
          requestAnimationFrame(() => {
            this.isAligningProducts = false;
          });
        });
      }

      init() {
        if (this.alignProducts) this.alignProductRows();
        if (FoxTheme.config.mqlMobile) {
          this.destroySlider();
        } else {
          this.initSlider();
        }
      }

      initSlider() {
        if (typeof this.sliderInstance === 'object') return;
        const columnGap = window.getComputedStyle(this.sliderWrapper).getPropertyValue('--f-column-gap');
        const spaceBetween = parseFloat(columnGap.replace('rem', '')) * 10;

        this.sliderOptions = {
          slidesPerView: this.tabletItems,
          spaceBetween: spaceBetween,
          navigation: {
            nextEl: this.sectionEl.querySelector(this.selectors.nextEl),
            prevEl: this.sectionEl.querySelector(this.selectors.prevEl),
          },
          pagination: {
            el: this.sectionEl.querySelector(this.selectors.pagination),
            type: 'progressbar',
          },
          breakpoints: {
            1024: {
              slidesPerView: this.items,
            },
          },
          loop: false,
          threshold: 2,
          watchSlidesProgress: true,
          mousewheel: {
            enabled: true,
            forceToAxis: true,
          },
        };

        this.classList.add(this.classes.swiper);
        this.sliderWrapper.classList.remove(this.classes.grid);
        this.sliderWrapper.classList.add(this.classes.swiperWrapper);

        this.sliderInstance = new window.FoxTheme.Carousel(this, this.sliderOptions, [FoxTheme.Swiper.Mousewheel]);
        this.sliderInstance.init();

        if (Shopify.designMode && typeof this.sliderInstance === 'object') {
          document.addEventListener('shopify:block:select', (e) => {
            if (e.detail.sectionId != this.sectionId) return;
            let { target } = e;
            const index = Number(target.dataset.index);
            this.sliderInstance.slider.slideTo(index);
          });
        }
      }

      destroySlider() {
        this.classList.remove(this.classes.swiper);
        if (this.sliderWrapper) {
          this.sliderWrapper.classList.remove(this.classes.swiperWrapper);
          this.sliderWrapper.classList.add(this.classes.grid);
        }
        if (typeof this.sliderInstance !== 'object') return;
        this.sliderInstance.slider.destroy();
        this.sliderInstance = false;
      }
    }
  );
}

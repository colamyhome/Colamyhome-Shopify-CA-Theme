if (!customElements.get('summer-save-images-text')) {
  customElements.define(
    'summer-save-images-text',
    class ImagesText extends HTMLElement {
      connectedCallback() {
        this.selectors = {
          sliderWrapper: '.image-cards__inner',
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
        this.items = parseFloat(this.dataset.items);
        this.tabletItems = parseFloat(this.dataset.tabletItems);
        this.laptopItems = parseFloat(this.dataset.laptopItems);
        this.paginationType = this.dataset.paginationType || 'bullets';
        this.autoplayDelay = parseInt(this.dataset.autoplay) || 0;

        this.sliderInstance = false;

        if (!this.enableSlider) return;

        const mql = window.matchMedia(FoxTheme.config.mediaQueryMobile);
        mql.onchange = this.init.bind(this);
        this.init();
      }

      init() {
        if (FoxTheme.config.mqlMobile) {
          this.destroySlider();
        } else {
          this.initSlider();
        }
      }

      initSlider() {
        if (typeof this.sliderInstance === 'object') return;
        const columnGap = window.getComputedStyle(this.sliderWrapper).getPropertyValue('--f-column-gap').trim();
        let spaceBetween = 0;

        if (columnGap.endsWith('vw')) {
          spaceBetween = (window.innerWidth * parseFloat(columnGap)) / 100;
        } else if (columnGap.endsWith('rem')) {
          const rootFontSize = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 10;
          spaceBetween = parseFloat(columnGap) * rootFontSize;
        } else {
          spaceBetween = parseFloat(columnGap) || 0;
        }

        this.sliderOptions = {
          slidesPerView: 2,
          spaceBetween: spaceBetween,
          navigation: {
            nextEl: this.sectionEl.querySelector(this.selectors.nextEl),
            prevEl: this.sectionEl.querySelector(this.selectors.prevEl),
          },
          pagination: {
            el: this.sectionEl.querySelector(this.selectors.pagination),
            type: this.paginationType,
          },
          breakpoints: {
            768: {
              slidesPerView: this.tabletItems,
            },
            1024: {
              slidesPerView: this.laptopItems,
            },
            1280: {
              slidesPerView: this.items,
            },
          },
          loop: this.autoplayDelay > 0,
          roundLengths: true,
          autoplay:
            this.autoplayDelay > 0
              ? {
                  delay: this.autoplayDelay,
                  disableOnInteraction: false,
                }
              : false,
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

        this.sliderInstance = new window.FoxTheme.Carousel(this, this.sliderOptions, [
          FoxTheme.Swiper.Mousewheel,
          FoxTheme.Swiper.Autoplay,
        ]);
        this.sliderInstance.init();
        const syncSelectedIndex = () => {
          const slider = this.sliderInstance && this.sliderInstance.slider;
          const index = slider && (slider.realIndex ?? slider.activeIndex);
          if (typeof index === 'number') this.setAttribute('selected-index', String(index));
        };
        syncSelectedIndex();
        this.sliderInstance.slider?.on?.('slideChange', syncSelectedIndex);

        if (Shopify.designMode && typeof this.sliderInstance === 'object') {
          document.addEventListener('shopify:block:select', (e) => {
            if (e.detail.sectionId != this.sectionId) return;
            const { target } = e;
            const index = Number(target.dataset.index);

            this.sliderInstance.slider.slideTo(index);
          });
        }
      }

      destroySlider() {
        this.classList.remove(this.classes.swiper);
        this.sliderWrapper.classList.remove(this.classes.swiperWrapper);
        this.sliderWrapper.classList.add(this.classes.grid);
        if (typeof this.sliderInstance !== 'object') return;
        this.sliderInstance.slider.destroy();
        this.sliderInstance = false;
      }
    }
  );
}

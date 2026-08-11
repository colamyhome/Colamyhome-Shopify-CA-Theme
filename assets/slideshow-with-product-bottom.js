if (!customElements.get('slideshow-with-product')) {
  customElements.define(
    'slideshow-with-product',
    class SlideshowWithProduct extends HTMLElement {
      constructor() {
        super();

        if (this.dataset.enableSlider !== 'true') return;

        this.sectionId = this.dataset.sectionId;
        this.sliderControls = this.querySelector('.swiper-controls');
        this.sliderInstance = false;
        this.selectedIndex = this.selectedIndex;
        this.sliderHeightAdapt = this.classList.contains('slideshow-with-product-height--adapt');

        this.calcSlideHeight();
        window.addEventListener('resize', FoxTheme.utils.debounce(this.calcSlideHeight.bind(this), 100), false);

        this.initSlider();
      }

      static get observedAttributes() {
        return ['selected-index'];
      }

      get selectedIndex() {
        return parseInt(this.getAttribute('selected-index')) || 0;
      }

      set selectedIndex(index) {
        this.setAttribute('selected-index', `${index}`);
      }

      initSlider() {
        const additionModules = [FoxTheme.Swiper.Autoplay, FoxTheme.Swiper.EffectFade];

        this.sliderOptions = {
          slidesPerView: 1,
          spaceBetween: 10,
          loop: true,
          grabCursor: true,
          allowTouchMove: true,
          threshold: 2,
          effect: 'fade',
          on: {
            init: this.handleAfterInit.bind(this),
            click: this.handleSlideClick.bind(this),
          },
          fadeEffect: {
            crossFade: true,
          },
        };

        if (this.sliderControls) {
          this.sliderOptions.navigation = {
            nextEl: this.sliderControls.querySelector('.swiper-button-next'),
            prevEl: this.sliderControls.querySelector('.swiper-button-prev'),
          };
          this.sliderOptions.pagination = {
            el: this.sliderControls.querySelector('.swiper-pagination'),
            type: 'fraction',
            clickable: true,
          };
        }

        const autoplayDelay = parseInt(this.dataset.autoplay);
        if (autoplayDelay > 0) {
          this.sliderOptions = {
            ...this.sliderOptions,
            autoplay: {
              delay: autoplayDelay,
              disableOnInteraction: false,
            },
          };
        }

        this.sliderInstance = new window.FoxTheme.Carousel(this, this.sliderOptions, additionModules);
        this.sliderInstance.init();

        this.sliderInstance.slider.on('realIndexChange', this.handleSlideChange.bind(this));

        if (this.sliderInstance) {
          this.selectedElement = this.sliderInstance.slider.slides[this.sliderInstance.slider.activeIndex];
          this.onReady(this.selectedElement, this.sliderInstance.slider.slides);

          // Fix accessibility
          const focusableElements = FoxTheme.a11y.getFocusableElements(this);
          focusableElements.forEach((element) => {
            if (!element.classList.contains('swiper-button') && element.tagName.toLowerCase() !== 'a') {
              element.addEventListener('focusin', () => {
                const slide = element.closest('.swiper-slide');
                this.sliderInstance.slider.slideToLoop(this.sliderInstance.slider.slides.indexOf(slide));
              });
            }
          });
        }

        // Initialize product thumbnails slider
        this.initThumbnailsSlider();

        if (Shopify.designMode && typeof this.sliderInstance === 'object') {
          document.addEventListener('shopify:block:select', (e) => {
            if (e.detail.sectionId != this.sectionId) return;
            let { target } = e;
            const index = Number(target.dataset.index);

            this.sliderInstance.slider.slideToLoop(index);
          });
        }
      }

      initThumbnailsSlider() {
        const parentSection = this.closest('.section--slideshow-with-product');
        if (!parentSection) return;

        const thumbnailSlider = parentSection.querySelector('.slideshow-product-thumbnails');
        if (!thumbnailSlider) return;

        if (window.matchMedia('(max-width: 767.98px)').matches) {
          thumbnailSlider.classList.add('slideshow-product-thumbnails--native-scroll');

          if (!thumbnailSlider.dataset.thumbClickBound) {
            thumbnailSlider.addEventListener('click', (event) => {
              const clickedThumb = event.target.closest('.slideshow-product-thumbnail');
              if (!clickedThumb || !thumbnailSlider.contains(clickedThumb)) return;

              const slideIndex = parseInt(clickedThumb.getAttribute('data-slide-index'));
              const thumbLink = clickedThumb.getAttribute('data-thumbnail-link');
              if (!isNaN(slideIndex) && this.sliderInstance) {
                const currentIndex = this.sliderInstance.slider.realIndex;
                if (thumbLink && slideIndex === currentIndex) {
                  window.location.href = thumbLink;
                  return;
                }
                this.sliderInstance.slider.slideToLoop(slideIndex);
              } else if (thumbLink) {
                window.location.href = thumbLink;
              }
            });
            thumbnailSlider.dataset.thumbClickBound = 'true';
          }

          this.syncThumbnails(this.sliderInstance.slider.realIndex);
          return;
        }

        const mainSliderInstance = this.sliderInstance;

        const thumbnailOptions = {
          slidesPerView: 5,
          spaceBetween: 24,
          grabCursor: true,
          slideToClickedSlide: false,
          watchSlidesProgress: true,
          centeredSlides: false,
          centeredSlidesBounds: false,
          on: {
            click: (swiper, e) => {
              const clickedSlide = swiper.clickedSlide;
              if (!clickedSlide) return;

              // If the click originated from a link inside the thumbnail, allow the
              // browser to navigate to the product page and don't intercept.
              if (e && e.target && e.target.closest && e.target.closest('a')) return;

              const slideIndex = parseInt(clickedSlide.getAttribute('data-slide-index'));
              const thumbLink = clickedSlide.getAttribute('data-thumbnail-link');
              if (thumbLink) {
                window.location.href = thumbLink;
                return;
              }

              if (!isNaN(slideIndex) && mainSliderInstance) {
                mainSliderInstance.slider.slideToLoop(slideIndex);
              }
            },
            init: () => {
              this.syncThumbnails(this.sliderInstance.slider.realIndex);
            },
          },
        };

        this.thumbnailSlider = new window.FoxTheme.Carousel(thumbnailSlider, thumbnailOptions, []);
        this.thumbnailSlider.init();

        if (window.matchMedia('(hover: hover)').matches) {
          const thumbnailItems = thumbnailSlider.querySelectorAll('.slideshow-product-thumbnail');
          thumbnailItems.forEach((item) => {
            item.addEventListener('mouseenter', () => {
              const slideIndex = parseInt(item.getAttribute('data-slide-index'));
              if (!isNaN(slideIndex) && mainSliderInstance) {
                mainSliderInstance.slider.slideToLoop(slideIndex);
              }
            });
          });
        }
      }

      handleThumbnailClick(swiper) {
        const clickedSlide = swiper.clickedSlide;
        if (!clickedSlide) return;

        const index = parseInt(clickedSlide.dataset.index);
        if (!isNaN(index)) {
          this.sliderInstance.slider.slideToLoop(index);
        }
      }

      syncThumbnails(activeIndex) {
        const parentSection = this.closest('.section--slideshow-with-product');
        if (!parentSection) return;

        const thumbnails = parentSection.querySelectorAll('.slideshow-product-thumbnail');
        let activeThumb = null;
        thumbnails.forEach((thumb) => {
          const thumbSlideIndex = parseInt(thumb.getAttribute('data-slide-index'));
          if (thumbSlideIndex === activeIndex) {
            thumb.classList.add('active-thumbnail');
            activeThumb = thumb;
          } else {
            thumb.classList.remove('active-thumbnail');
          }
        });

        // Scroll thumbnail slider to active slide
        const thumbnailSlider = parentSection.querySelector('.slideshow-product-thumbnails');
        if (thumbnailSlider && thumbnailSlider.swiper) {
          if (activeThumb) {
            const activeThumbIndex = Array.from(thumbnails).indexOf(activeThumb);
            thumbnailSlider.swiper.slideTo(activeThumbIndex, 0, false);
          }
        } else if (thumbnailSlider && activeThumb && window.matchMedia('(max-width: 767.98px)').matches) {
          this.centerActiveThumbnail(thumbnailSlider, activeThumb);
        }
      }

      centerActiveThumbnail(container, thumbnail) {
        const targetLeft = thumbnail.offsetLeft - (container.clientWidth - thumbnail.clientWidth) / 2;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        const nextScrollLeft = Math.max(0, Math.min(targetLeft, maxScrollLeft));

        container.scrollTo({
          left: nextScrollLeft,
          behavior: 'smooth',
        });
      }

      onReady(selectedElement) {
        if (selectedElement.dataset.type === 'video') {
          const videoElement = FoxTheme.utils.displayedMedia(selectedElement.querySelectorAll('video-element'));
          videoElement?.play();
        }

        if (!FoxTheme.config.motionReduced) {
          const motionEls = selectedElement.querySelectorAll('motion-element');
          motionEls.forEach((motionEl) => {
            setTimeout(() => {
              motionEl && motionEl.refreshAnimation();
            });
          });
        }
      }

      handleAfterInit() {
        this.removeAttribute('data-media-loading');

        // Fix active bullet not transition on the first time.
        if (this.sliderControls) {
          const activeBullet = this.sliderControls.querySelector('.swiper-pagination-bullet-active');

          if (activeBullet) {
            activeBullet.classList.remove('swiper-pagination-bullet-active');
            activeBullet.offsetHeight; // Trigger reflow.
            activeBullet.classList.add('swiper-pagination-bullet-active');
          }
        }
      }

      handleSlideChange(swiper) {
        const { slides, realIndex, activeIndex } = swiper;
        this.selectedIndex = realIndex;

        this.updateControlsScheme(slides[activeIndex]);
        
        // Sync thumbnails with main slider
        this.syncThumbnails(realIndex);
      }

      handleSlideClick(swiper, event) {
        if (!swiper?.allowClick || !event?.target) return;

        const target = event.target;
        if (
          target.closest(
            'a, button, input, select, textarea, label, [role="button"], .swiper-button, .swiper-pagination'
          )
        ) {
          return;
        }

        const clickedSlide = target.closest('.swiper-slide');
        if (!clickedSlide || !clickedSlide.classList.contains('swiper-slide-active')) return;

        const slideLink = clickedSlide.getAttribute('data-slide-link');
        if (slideLink) {
          window.location.href = slideLink;
        }
      }

      attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'selected-index' && oldValue !== null && oldValue !== newValue) {
          const fromElements = this.querySelectorAll(`[data-swiper-slide-index="${oldValue}"]`);
          const toElements = this.querySelectorAll(`[data-swiper-slide-index="${newValue}"]`);

          fromElements.forEach((fromElement) => {
            if (fromElement.dataset.type === 'video') {
              const videoElement = FoxTheme.utils.displayedMedia([fromElement.querySelector('video-element')]);
              videoElement && videoElement.pause();
            }

            const motionEls = fromElement.querySelectorAll('motion-element');
            motionEls &&
              motionEls.forEach((motionEl) => {
                if (motionEl.hasAttribute('data-text')) {
                  motionEl.resetAnimation();
                }
              });
          });

          toElements.forEach((toElement) => {
            setTimeout(() => {
              if (toElement.classList.contains('swiper-slide-active')) {
                if (toElement.dataset.type === 'video') {
                  const videoElement = FoxTheme.utils.displayedMedia([toElement.querySelector('video-element')]);
                  videoElement && videoElement.play();
                }

                const motionEls = toElement.querySelectorAll('motion-element');
                motionEls.forEach((motionEl) => {
                  setTimeout(() => {
                    motionEl && motionEl.refreshAnimation();
                  });
                });
              }
            });
          });
        }
      }

      updateControlsScheme(activeSlide) {
        if (this.sliderControls) {
          const classesToRemove = Array.from(this.sliderControls.classList).filter((className) =>
            className.startsWith('color-')
          );
          classesToRemove.forEach((className) => this.sliderControls.classList.remove(className));
          const colorScheme = activeSlide.dataset.colorScheme;
          this.sliderControls.classList.add(colorScheme);
        }
      }

      calcSlideHeight() {
        this.style.removeProperty('--slide-height');
        let maxHeight = 0;

        const slides = this.querySelectorAll('.swiper-slide');
        slides &&
          slides.forEach((slide) => {
            const slideText = slide.querySelector('.slideshow-with-product__content');
            if (slideText) {
              this.sliderHeightAdapt && slideText.classList.remove('absolute');
              const slideTextHeight = slideText.offsetHeight;
              if (slideTextHeight > maxHeight) {
                maxHeight = slideTextHeight;
              }
              this.sliderHeightAdapt && slideText.classList.add('absolute');
            }
          });

        this.style.setProperty('--slide-height', maxHeight + 'px');
      }
    }
  );
}

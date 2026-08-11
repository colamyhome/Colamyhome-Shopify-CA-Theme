if (!customElements.get('media-gallery')) {
  customElements.define(
    'media-gallery',
    class MediaGallery extends HTMLElement {
      constructor() {
        super();

        this.selectors = {
          viewer: '[id^="GalleryViewer"]',
          thumbnails: '[id^="GalleryThumbnails"]',
          mediaList: '[id^="Slider-Gallery"]',
          mediaItems: ['.product__media-item'],
          loadMoreButton: '[data-load-more-media]',
          remainingMediaStorage: '[data-media-gallery-remaining-storage]',
          remainingThumbnailStorage: '[data-thumbnail-gallery-remaining-storage]',
        };

        this.initialized = false;
        this.sliderInstance = false;
        this.thumbsInstance = false;
      }

      connectedCallback() {
        FoxTheme.Motion.inView(this, this.init.bind(this));
      }

      init() {
        if (this.initialized === true) return;

        this.elements = window.FoxTheme.utils.queryDomNodes(this.selectors, this);
        this.mediaLayout = this.dataset.mediaLayout;
        this.onlyImage = this.dataset.onlyImage === 'true';
        this.enableDesktopSlider = this.dataset.enableDesktopSlider === 'true';
        this.enableMobileThumbnails = this.dataset.enableMobileThumbnails === 'true';
        this.enableImageZoom = this.dataset.enableImageZoom === 'true';
        this.hasMoreMedia = this.dataset.hasMoreMedia === 'true';
        this.context = this.dataset.context;
        this.isMediaExpanded = false;
        this.setSliderOptions();

        const mql = window.matchMedia(FoxTheme.config.mediaQueryMobile);
        mql.onchange = this.updateMediaLayout.bind(this);
        this.updateMediaLayout();

        if (this.enableImageZoom) {
          this.initImageZoom();
        }

        if (this.hasMoreMedia) {
          this.initLoadMoreMedia();
          this.autoLoadMoreMediaOnMobile();
        }

        this.initialized = true;
      }

      initLoadMoreMedia() {
        const loadMoreButton = this.querySelector(this.selectors.loadMoreButton);
        if (!loadMoreButton) return;

        loadMoreButton.addEventListener('click', this.handleLoadMoreMedia.bind(this));
      }

      handleLoadMoreMedia() {
        if (this.isMediaExpanded) {
          this.collapseMedia();
        } else {
          this.expandMedia();
        }

        this.refreshAfterLoadMore();
      }

      expandMedia() {
        const mediaStorage = this.querySelector(this.selectors.remainingMediaStorage);
        const thumbnailStorage = this.querySelector(this.selectors.remainingThumbnailStorage);
        const thumbnailList = this.elements.thumbnails?.querySelector('.thumbnail-list');

        this.moveStoredItemsToVisible(mediaStorage, this.elements.mediaList, '.product__media-item');
        this.moveStoredItemsToVisible(thumbnailStorage, thumbnailList, '.product__thumbs-item');

        this.isMediaExpanded = true;
        this.updateLoadMoreButtonState();
      }

      collapseMedia() {
        this.moveExtraItemsToStorage({ keepPinned: true });

        this.isMediaExpanded = false;
        this.updateLoadMoreButtonState();
      }

      updateLoadMoreButtonState() {
        const loadMoreButton = this.querySelector(this.selectors.loadMoreButton);
        if (!loadMoreButton) return;

        const moreLabel = loadMoreButton.dataset.labelMore;
        const lessLabel = loadMoreButton.dataset.labelLess;
        const buttonLabel = this.isMediaExpanded ? lessLabel : moreLabel;
        const labelEl = loadMoreButton.querySelector('span');

        if (labelEl && buttonLabel) {
          labelEl.textContent = buttonLabel;
        }

        loadMoreButton.setAttribute('aria-expanded', this.isMediaExpanded ? 'true' : 'false');
      }

      getFeaturedMediaPosition(featuredMedia) {
        return featuredMedia?.position ? featuredMedia.position - 1 : null;
      }

      matchesElementToFeaturedMedia(element, featuredMedia, type = 'media') {
        if (!element || !featuredMedia) return false;

        const mediaPosition = this.getFeaturedMediaPosition(featuredMedia);

        if (type === 'media') {
          return (
            element.dataset.mediaId == featuredMedia.id ||
            (mediaPosition !== null && element.dataset.mediaIndex == String(mediaPosition))
          );
        }

        return (
          element.dataset.target == featuredMedia.id ||
          (mediaPosition !== null && element.dataset.mediaIndex == String(mediaPosition))
        );
      }

      findMediaElement(featuredMedia, root = this) {
        if (!featuredMedia) return null;

        const mediaPosition = this.getFeaturedMediaPosition(featuredMedia);
        return (
          root.querySelector(`[data-media-id="${featuredMedia.id}"]`) ||
          (mediaPosition !== null ? root.querySelector(`.product__media-item[data-media-index="${mediaPosition}"]`) : null)
        );
      }

      findThumbnailElement(featuredMedia, root = this) {
        if (!featuredMedia) return null;

        const mediaPosition = this.getFeaturedMediaPosition(featuredMedia);
        return (
          root.querySelector(`.product__thumbs-item[data-target="${featuredMedia.id}"]`) ||
          (mediaPosition !== null ? root.querySelector(`.product__thumbs-item[data-media-index="${mediaPosition}"]`) : null)
        );
      }

      insertItemInOriginalOrder(container, item, itemSelector) {
        if (!container || !item) return;

        const itemIndex = Number(item.dataset.mediaIndex ?? -1);
        const siblings = Array.from(container.children).filter((child) => child.matches(itemSelector));
        const nextSibling = siblings.find((child) => Number(child.dataset.mediaIndex ?? -1) > itemIndex);

        if (nextSibling) {
          container.insertBefore(item, nextSibling);
        } else {
          container.appendChild(item);
        }
      }

      moveStoredItemsToVisible(storage, container, itemSelector) {
        if (!storage || !container) return false;

        let changed = false;

        Array.from(storage.querySelectorAll(itemSelector)).forEach((item) => {
          this.insertItemInOriginalOrder(container, item, itemSelector);
          changed = true;
        });

        return changed;
      }

      moveExtraItemsToStorage({ exceptFeaturedMedia = null, keepPinned = false } = {}) {
        const mediaStorage = this.querySelector(this.selectors.remainingMediaStorage);
        const thumbnailStorage = this.querySelector(this.selectors.remainingThumbnailStorage);
        const thumbnailList = this.elements.thumbnails?.querySelector('.thumbnail-list');
        let changed = false;

        if (mediaStorage && this.elements.mediaList) {
          Array.from(this.elements.mediaList.querySelectorAll('[data-extra-media="true"]')).forEach((item) => {
            const shouldKeep =
              (keepPinned && item.dataset.variantMediaPinned === 'true') ||
              this.matchesElementToFeaturedMedia(item, exceptFeaturedMedia, 'media');

            if (!shouldKeep) {
              item.removeAttribute('data-variant-media-pinned');
              this.insertItemInOriginalOrder(mediaStorage, item, '.product__media-item');
              changed = true;
            }
          });
        }

        if (thumbnailStorage && thumbnailList) {
          Array.from(thumbnailList.querySelectorAll('[data-extra-thumbnail="true"]')).forEach((item) => {
            const shouldKeep =
              (keepPinned && item.dataset.variantThumbnailPinned === 'true') ||
              this.matchesElementToFeaturedMedia(item, exceptFeaturedMedia, 'thumbnail');

            if (!shouldKeep) {
              item.removeAttribute('data-variant-thumbnail-pinned');
              this.insertItemInOriginalOrder(thumbnailStorage, item, '.product__thumbs-item');
              changed = true;
            }
          });
        }

        return changed;
      }

      moveStoredFeaturedMediaToVisible(featuredMedia) {
        const mediaStorage = this.querySelector(this.selectors.remainingMediaStorage);
        const thumbnailStorage = this.querySelector(this.selectors.remainingThumbnailStorage);
        const thumbnailList = this.elements.thumbnails?.querySelector('.thumbnail-list');
        let changed = false;

        if (mediaStorage && this.elements.mediaList && !this.findMediaElement(featuredMedia, this.elements.mediaList)) {
          const mediaItem = this.findMediaElement(featuredMedia, mediaStorage);
          if (mediaItem) {
            this.insertItemInOriginalOrder(this.elements.mediaList, mediaItem, '.product__media-item');
            changed = true;
          }
        }

        if (thumbnailStorage && thumbnailList && !this.findThumbnailElement(featuredMedia, thumbnailList)) {
          const thumbnailItem = this.findThumbnailElement(featuredMedia, thumbnailStorage);
          if (thumbnailItem) {
            this.insertItemInOriginalOrder(thumbnailList, thumbnailItem, '.product__thumbs-item');
            changed = true;
          }
        }

        return changed;
      }

      updatePinnedVariantMedia(featuredMedia) {
        const thumbnailList = this.elements.thumbnails?.querySelector('.thumbnail-list');
        const visibleMedia = this.findMediaElement(featuredMedia, this.elements.mediaList);
        const visibleThumbnail = thumbnailList ? this.findThumbnailElement(featuredMedia, thumbnailList) : null;

        this.querySelectorAll('[data-variant-media-pinned="true"]').forEach((item) => {
          if (item !== visibleMedia) {
            item.removeAttribute('data-variant-media-pinned');
          }
        });

        this.querySelectorAll('[data-variant-thumbnail-pinned="true"]').forEach((item) => {
          if (item !== visibleThumbnail) {
            item.removeAttribute('data-variant-thumbnail-pinned');
          }
        });

        if (!this.isMediaExpanded && visibleMedia?.dataset.extraMedia === 'true') {
          visibleMedia.dataset.variantMediaPinned = 'true';
        } else if (visibleMedia) {
          visibleMedia.removeAttribute('data-variant-media-pinned');
        }

        if (!this.isMediaExpanded && visibleThumbnail?.dataset.extraThumbnail === 'true') {
          visibleThumbnail.dataset.variantThumbnailPinned = 'true';
        } else if (visibleThumbnail) {
          visibleThumbnail.removeAttribute('data-variant-thumbnail-pinned');
        }
      }

      autoLoadMoreMediaOnMobile() {
        if (!this.hasMoreMedia) return;
        if (FoxTheme.config.mqlMobile && !this.isMediaExpanded) {
          this.expandMedia();
          this.refreshAfterLoadMore();
        }
      }

      refreshAfterLoadMore({ skipAutoLoadMore = false } = {}) {
        if (this.sliderInstance?.slider) {
          this.sliderInstance.slider.destroy(true, true);
          this.sliderInstance = false;
        }

        if (this.thumbsInstance?.slider) {
          this.thumbsInstance.slider.destroy(true, true);
          this.thumbsInstance = false;
        }

        if (this.lightbox) {
          this.lightbox.destroy();
          this.lightbox = null;
        }

        this.elements = window.FoxTheme.utils.queryDomNodes(this.selectors, this);
        this.skipAutoLoadMore = skipAutoLoadMore;
        this.updateMediaLayout();
        this.skipAutoLoadMore = false;

        if (this.enableImageZoom) {
          this.initImageZoom();
        }
      }

      setSliderOptions() {
        const mediaItemGap = parseInt(this.dataset.mediaItemGap);
        const mediaItemGapMobile = parseInt(this.dataset.mediaItemGapMobile);

        this.sliderOptions = {
          init: false,
          slidesPerView: this.enableMobileThumbnails ? 1 : 'auto',
          spaceBetween: mediaItemGapMobile,
          loop: false,
          grabCursor: true,
          allowTouchMove: true,
          autoHeight: true,
          breakpoints: {
            768: {
              spaceBetween: mediaItemGap,
            },
          },
          navigation: {
            nextEl: this.querySelector('.swiper-button-next'),
            prevEl: this.querySelector('.swiper-button-prev'),
          },
          pagination: {
            el: this.querySelector('.swiper-pagination'),
            clickable: true,
            type: 'fraction',
          },
          threshold: 2,
        };

        this.thumbsOptions = {
          slidesPerView: 4,
          breakpoints: {
            461: {
              slidesPerView: 5,
              direction: 'horizontal',
            },
          },
          spaceBetween: mediaItemGapMobile,
          loop: false,
          freeMode: true,
          watchSlidesProgress: true,
          threshold: 2,
          breakpoints: {
            768: {
              spaceBetween: mediaItemGap,
            },
          },
        };

        switch (this.mediaLayout) {
          case 'vertical-carousel':
            this.thumbsOptions.breakpoints = {
              ...this.thumbsOptions.breakpoints,
              768: {
                direction: 'vertical',
                slidesPerView: 'auto',
                spaceBetween: mediaItemGap,
              },
            };
            break;
          case 'carousel':
            this.thumbsOptions.breakpoints = {
              ...this.thumbsOptions.breakpoints,
              1024: {
                slidesPerView: 5,
              },
              1536: {
                slidesPerView: 7,
              },
            };
            break;
        }
      }

      updateMediaLayout() {
        if (!this.skipAutoLoadMore) {
          this.autoLoadMoreMediaOnMobile();
        }

        if (FoxTheme.config.mqlMobile) {
          this.initSlider();
        } else {
          if (this.enableDesktopSlider) {
            this.initSlider();
          } else {
            this.destroySlider();
          }
        }
      }

      initSlider() {
        if (typeof this.sliderInstance !== 'object') {
          if ((this.enableDesktopSlider || this.enableMobileThumbnails) && this.elements.thumbnails) {
            this.thumbsInstance = new window.FoxTheme.Carousel(this.elements.thumbnails, this.thumbsOptions);
            this.thumbsInstance.init();

            this.sliderOptions.thumbs = {
              swiper: this.thumbsInstance.slider,
              autoScrollOffset: 2,
            };
          }

          this.sliderInstance = new window.FoxTheme.Carousel(this.elements.viewer, this.sliderOptions, [
            FoxTheme.Swiper.Thumbs,
          ]);
          this.sliderInstance.init();

          this.handleSliderAfterInit();
          this.handleSlideChange();

          this.sliderInstance.slider.init();
        }
      }

      destroySlider() {
        if (typeof this.sliderInstance === 'object') {
          this.sliderInstance.slider.destroy();
          this.sliderInstance = false;
        }
      }

      initThumbsSlider() {
        if (typeof this.thumbsInstance !== 'object') {
          this.thumbsInstance = new window.FoxTheme.Carousel(this.selectors.thumbnails, this.thumbsOptions);
          this.thumbsInstance.init();
        }
      }

      initImageZoom() {
        let dataSource = [];
        const allMedia = this.elements.mediaList
          ? [...this.elements.mediaList.querySelectorAll('.product__media-item:not(.swiper-slide-duplicate)')]
          : [];
        if (allMedia) {
          allMedia.forEach((media) => {
            const { mediaType, mediaIndex, src, pswpWidth, pswpHeight } = media.dataset;

            let source = {
              id: mediaIndex,
              mediaType: mediaType,
            };

            switch (mediaType) {
              case 'model':
              case 'video':
              case 'external_video':
                const htmlTag = mediaType === 'model' ? 'product-model' : 'video-element';

                source = {
                  ...source,
                  html: `<div class="pswp__item--${mediaType}">${media.querySelector(htmlTag).outerHTML}</div>`,
                };
                break;
              default: // Image.
                source = {
                  ...source,
                  src: src,
                  width: pswpWidth,
                  height: pswpHeight,
                };
                break;
            }

            dataSource.push(source);
          });
        }

        this.lightbox = new window.FoxTheme.PhotoSwipeLightbox({
          dataSource: dataSource,
          pswpModule: window.FoxTheme.PhotoSwipe,
          bgOpacity: 1,
          arrowPrev: false,
          arrowNext: false,
          zoom: false,
          close: false,
          counter: false,
          preloader: false,
        });

        this.lightbox.addFilter('thumbEl', (thumbEl, { id }, index) => {
          const slider = this.sliderInstance?.slider;

          if (slider) {
            const { slides, activeIndex } = slider;
            if (slides[activeIndex]) {
              const el = slides[activeIndex].querySelector('img');
              if (el) {
                return el;
              }
            }
          }

          return thumbEl;
        });

        this.lightbox.addFilter('placeholderSrc', (placeholderSrc, { data: { id } }) => {
          const slider = this.sliderInstance?.slider;

          if (slider) {
            const { slides, activeIndex } = slider;
            if (slides[activeIndex]) {
              const el = slides[activeIndex].querySelector('img');
              if (el) {
                return el.src;
              }
            }
          }

          return placeholderSrc;
        });

        this.lightbox.on('change', () => {
          window.pauseAllMedia(this);
        });

        // Store the current index before closing
        let lastLightboxIndex = null;
        this.lightbox.on('close', () => {
          if (this.lightbox?.pswp?.currIndex) {
            lastLightboxIndex = this.lightbox.pswp.currIndex;
          }
        });

        // Update slider after lightbox is destroyed
        this.lightbox.on('destroy', () => {
          const slider = this.sliderInstance?.slider;

          if (slider && lastLightboxIndex !== null) {
            const targetIndex = lastLightboxIndex;
            // currIndex from lightbox is the index in dataSource array
            // which should match the slider index since both are created from the same media items in the same order
            if (targetIndex >= 0 && targetIndex < slider.slides.length && slider.activeIndex !== targetIndex) {
              // Use requestAnimationFrame to ensure DOM is ready
              requestAnimationFrame(() => {
                slider.slideTo(targetIndex, 0);
              });
            }
            lastLightboxIndex = null;
          }
        });

        this.lightbox.on('pointerDown', (e) => {
          if (this.lightbox?.pswp?.currSlide?.data?.mediaType != 'image') {
            e.preventDefault();
          }
        });

        this.lightbox.on('uiRegister', () => {
          const lightboxUI = this.lightbox?.pswp?.ui;

          if (!lightboxUI) return;

          if (!this.onlyImage) {
            lightboxUI.registerElement({
              name: 'next',
              ariaLabel: 'Next slide',
              order: 3,
              isButton: true,
              html: '<svg class="pswp-icon-next flip-x" viewBox="0 0 100 100"><path d="M 10,50 L 60,100 L 65,90 L 25,50  L 65,10 L 60,0 Z"></path></svg>',
              onClick: (event, el) => {
                this.lightbox?.pswp?.next();
              },
            });
            lightboxUI.registerElement({
              name: 'prev',
              ariaLabel: 'Previous slide',
              order: 1,
              isButton: true,
              html: '<svg class="pswp-icon-prev rtl-flip-x" viewBox="0 0 100 100"><path d="M 10,50 L 60,100 L 65,90 L 25,50  L 65,10 L 60,0 Z"></path></svg>',
              onClick: (event, el) => {
                this.lightbox?.pswp?.prev();
              },
            });
          }
          lightboxUI.registerElement({
            name: 'close-zoom',
            ariaLabel: 'Close zoom image',
            order: 2,
            isButton: true,
            html: '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" role="presentation" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
            onClick: (event, el) => {
              this.lightbox?.pswp?.close();
            },
          });
        });

        this.lightbox.init();

        FoxTheme.utils.addEventDelegate({
          selector: '.js-photoswipe--zoom',
          context: this,
          handler: (e, media) => {
            if (media.dataset?.mediaType === 'image') {
              const index = Number(media.dataset.mediaIndex) || 0;
              this.lightbox.loadAndOpen(index);
            }
          },
        });
      }

      handleSliderAfterInit() {
        this.sliderInstance.slider.on('afterInit', (swiper) => {
          const { slides, activeIndex } = swiper;

          if (slides[activeIndex]) {
            const isModelMediaType = slides[activeIndex].dataset.mediaType === 'model';
            this.toggleSliderDraggableState(!isModelMediaType);
          }
        });
      }

      handleSlideChange() {
        this.sliderInstance.slider.on('realIndexChange', (swiper) => {
          const { slides, activeIndex, thumbs } = swiper;

          if (thumbs.swiper) {
            thumbs.swiper.slideTo(activeIndex);
          }

          if (slides[activeIndex]) {
            this.playActiveMedia(slides[activeIndex]);

            const isModelMediaType = slides[activeIndex].dataset.mediaType === 'model';
            this.toggleSliderDraggableState(!isModelMediaType);
          }
        });
      }

      toggleSliderDraggableState(isDraggable) {
        if (this.sliderInstance.slider.allowTouchMove !== isDraggable) {
          this.sliderInstance.slider.allowTouchMove = isDraggable;
        }
      }

      playActiveMedia(selected) {
        const deferredMedia = selected.querySelector('product-model');
        if (deferredMedia) deferredMedia.loadContent(false);
      }

      getFeaturedMediaFromVariant(variant) {
        if (!variant) return null;

        if (variant.featured_media) {
          return variant.featured_media;
        }

        if (variant.featured_image) {
          return {
            id: variant.featured_image.id,
            position: variant.featured_image.position || 0,
            media_type: 'image',
          };
        }

        return null;
      }

      ensureFeaturedMediaLoaded(featuredMedia) {
        if (!featuredMedia) return false;

        let changed = false;

        if (!this.isMediaExpanded) {
          changed = this.moveExtraItemsToStorage({ exceptFeaturedMedia: featuredMedia }) || changed;
        }

        changed = this.moveStoredFeaturedMediaToVisible(featuredMedia) || changed;
        this.updatePinnedVariantMedia(featuredMedia);

        if (changed) {
          this.refreshAfterLoadMore({ skipAutoLoadMore: true });
          this.updatePinnedVariantMedia(featuredMedia);
        }

        return !!this.findMediaElement(featuredMedia, this.elements.mediaList);
      }

      getSlideIndexByFeaturedMedia(featuredMedia) {
        const slides = this.sliderInstance?.slider?.slides ? Array.from(this.sliderInstance.slider.slides) : [];
        return slides.findIndex((slide) => this.matchesElementToFeaturedMedia(slide, featuredMedia, 'media'));
      }

      setActiveMedia(variant) {
        const featuredMedia = this.getFeaturedMediaFromVariant(variant);
        if (!featuredMedia) return;

        this.ensureFeaturedMediaLoaded(featuredMedia);

        if (this.sliderInstance?.slider) {
          const slideIndex = this.getSlideIndexByFeaturedMedia(featuredMedia);
          if (slideIndex >= 0) {
            this.sliderInstance.slider.slideTo(slideIndex, 0, false);
            return;
          }

          const fallbackIndex = featuredMedia.position || 0;
          if (fallbackIndex > 0) {
            this.sliderInstance.slider.slideTo(fallbackIndex - 1, 0, false);
          }
          return;
        }

        this.sortMediaItems(variant, featuredMedia);
      }

      sortMediaItems(variant, featuredMedia) {
        if (!featuredMedia) {
          featuredMedia = this.getFeaturedMediaFromVariant(variant);
        }

        if (!featuredMedia) return;
        this.ensureFeaturedMediaLoaded(featuredMedia);
        const mediaPosition = this.getFeaturedMediaPosition(featuredMedia);

        let newMedias = this.elements.mediaList ? Array.from(this.elements.mediaList.querySelectorAll('.product__media-item')) : [];

        // Reset ordering.
        newMedias.sort(function (a, b) {
          return a.dataset.mediaIndex - b.dataset.mediaIndex;
        });

        newMedias.some((media, index) => {
          if (media.dataset.mediaId == featuredMedia.id || media.dataset.mediaIndex == mediaPosition) {
            const [element] = newMedias.splice(index, 1);
            newMedias.unshift(element);
            return true;
          }
        });

        this.elements.mediaList.innerHTML = '';
        newMedias.forEach((media) => {
          this.elements.mediaList.appendChild(media);
        });

        if (!FoxTheme.config.mqlMobile && this.context !== 'quickview') {
          const selectedMedia = this.findMediaElement(featuredMedia);
          if (selectedMedia) {
            window.scrollTo({ top: selectedMedia.offsetTop, behavior: 'smooth' });
          }
        }
      }
    }
  );
}

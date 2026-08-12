if (!customElements.get('sticky-atc-bar')) {
  customElements.define(
    'sticky-atc-bar',
    class StickyAtcBar extends HTMLElement {
      constructor() {
        super();
        document.body.classList.add('sticky-atc-bar-enabled');
      }

      get variantIdSelect() {
        return this.querySelector('[name="id"]');
      }

      connectedCallback() {
        this.productFormActions = document.querySelector('.main-product-form');
        this.mainProductInfo = document.querySelector('product-info');
        this.container = this.closest('.sticky-atc-bar');

        this.variantData = this.getVariantData();
        this.select = this.querySelector('select');

        this.init();
        if (this.select) {
          this.select.addEventListener('change', () => {
            if (this.isUpdating) return;
            this.isUpdating = true;

            this.mainVariantSelects = this.mainProductInfo && this.mainProductInfo.querySelector('variant-selects');
            const selectedVariantId = this.variantIdSelect.value;
            this.currentVariant = this.variantData.find((variant) => variant.id === Number(selectedVariantId));

            if (this.mainVariantSelects) {
              Array.from(this.mainVariantSelects.querySelectorAll('select, fieldset'), (element, index) => {
                const variantOptionVal = this.currentVariant.options[index];
                switch (element.tagName) {
                  case 'SELECT':
                    element.value = variantOptionVal;
                    const options = element.querySelectorAll('option');
                    options.forEach((option) => option.removeAttribute('selected'));

                    element.value = variantOptionVal;
                    const selectedOption = element.querySelector(`option[value="${variantOptionVal}"]`);
                    if (selectedOption) {
                      selectedOption.setAttribute('selected', 'selected');
                    }
                    break;
                  case 'FIELDSET':
                    Array.from(element.querySelectorAll('input')).forEach((radio) => {
                      if (radio.value === variantOptionVal) {
                        radio.checked = true;
                      }
                    });
                    break;
                }
              });
              setTimeout(() => {
                this.mainVariantSelects.dispatchEvent(new Event('change', { detail: { formStickty: true } }));
                this.isUpdating = false;
              }, 0);
            } else {
              this.isUpdating = false;
            }

            this.updatePrice();
            this.updateButton(true, '', false);
            if (!this.currentVariant) {
              this.updateButton(true, '', true);
            } else {
              this.updateButton(!this.currentVariant.available, FoxTheme.variantStrings.soldOut);
            }
          });
        }
      }

      getVariantData() {
        this.variantData =
          this.variantData || JSON.parse(this.container.querySelector('[type="application/json"]').textContent);
        return this.variantData;
      }

      init() {
        if (!this.productFormActions) {
          this.container.classList.add('sticky-atc-bar--show');
          return;
        }
        this.productId = this.dataset.productId;
        this.isBuyBar = this.container.classList.contains('sticky-atc-bar--buy-bar');
        this.desktopBuyBarQuery = window.matchMedia('(min-width: 1024px)');

        const mql = window.matchMedia(FoxTheme.config.mediaQueryMobile);
        mql.onchange = this.checkDevice.bind(this);
        this.desktopBuyBarQuery.onchange = () => {
          this.checkDevice();
          this.observeProductForm();
        };
        this.checkDevice();

        this.observeProductForm();
        this.syncWithMainProductForm();
      }

      observeProductForm() {
        if (this.observer) this.observer.disconnect();

        const showOnlyAfterBuyButtons = this.isBuyBar && this.desktopBuyBarQuery.matches;
        const rootMargin = showOnlyAfterBuyButtons ? '0px' : `${this.productFormActions.offsetHeight}px 0px 0px 0px`;
        this.observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const shouldShow = showOnlyAfterBuyButtons
                ? entry.boundingClientRect.bottom <= 0
                : !entry.isIntersecting;
              this.container.classList.toggle('sticky-atc-bar--show', shouldShow);
            });
          },
          { threshold: showOnlyAfterBuyButtons ? 0 : 1, rootMargin }
        );
        this.observer.observe(this.productFormActions);
      }

      checkDevice() {
        document.documentElement.style.setProperty('--sticky-atc-bar-height', this.clientHeight + 'px');
      }

      updateButton(disable = true, text, modifyClass = true) {
        const productForm = this.querySelector('.sticky-atc-bar__form');
        if (!productForm) return;

        const addButton = productForm.querySelector('[name="add"]');
        if (!addButton) return;

        const submitButtons = productForm.querySelectorAll('[type="submit"]');
        const addButtonText = addButton.querySelector('.btn__label') || addButton.querySelector('.btn__text');
        const addButtonPrice = addButton.querySelector('.sticky-atc-bar__button-price');
        if (disable) {
          submitButtons.forEach((button) => button.setAttribute('disabled', 'disabled'));
          if (text) addButtonText.textContent = text;
          if (addButtonPrice) addButtonPrice.hidden = true;
        } else {
          submitButtons.forEach((button) => button.removeAttribute('disabled'));
          addButtonText.textContent = FoxTheme.variantStrings.addToCart;
          if (addButtonPrice) addButtonPrice.hidden = false;
        }
      }

      updatePrice() {
        const classes = {
          onSale: 'f-price--on-sale',
          soldOut: 'f-price--sold-out',
        };
        const selectors = {
          priceWrapper: '.f-price',
          salePrice: '.f-price-item--sale',
          compareAtPrice: ['.f-price-item--regular'],
          unitPriceWrapper: '.f-price__unit-wrapper',
        };
        const moneyFormat = FoxTheme.settings.moneyFormat;
        const { priceWrapper, salePrice, unitPriceWrapper, compareAtPrice } = FoxTheme.utils.queryDomNodes(
          selectors,
          this
        );
        const unitPrice = unitPriceWrapper && unitPriceWrapper.querySelector('.f-price__unit');
        const buttonPrice = this.querySelector('.sticky-atc-bar__button-price');
        const buyBarPrice = this.querySelector('.sticky-atc-bar__buy-bar-price');

        const { compare_at_price, price, unit_price_measurement } = this.currentVariant;

        if (priceWrapper) {
          if (compare_at_price && compare_at_price > price) {
            priceWrapper.classList.add(classes.onSale);
          } else {
            priceWrapper.classList.remove(classes.onSale);
          }

          if (!this.currentVariant.available) {
            priceWrapper.classList.add(classes.soldOut);
          } else {
            priceWrapper.classList.remove(classes.soldOut);
          }
        }

        if (salePrice) salePrice.innerHTML = FoxTheme.Currency.formatMoney(price, moneyFormat);
        if (buttonPrice) buttonPrice.textContent = ` -${FoxTheme.Currency.formatMoney(price, moneyFormat)}`;
        if (buyBarPrice) buyBarPrice.textContent = FoxTheme.Currency.formatMoney(price, moneyFormat);

        if (compareAtPrice && compareAtPrice.length && compare_at_price > price) {
          compareAtPrice.forEach(
            (item) => (item.innerHTML = `<s>${FoxTheme.Currency.formatMoney(compare_at_price, moneyFormat)}</s>`)
          );
        } else {
          compareAtPrice.forEach((item) => (item.innerHTML = FoxTheme.Currency.formatMoney(price, moneyFormat)));
        }

        if (unit_price_measurement && unitPriceWrapper && unitPrice) {
          unitPriceWrapper.classList.remove('hidden');
          const unitPriceContent = `<span>${FoxTheme.Currency.formatMoney(
            this.currentVariant.unit_price,
            moneyFormat
          )}</span>/<span data-unit-price-base-unit>${this._getBaseUnit()}</span>`;
          unitPrice.innerHTML = unitPriceContent;
        } else if (unitPriceWrapper) {
          unitPriceWrapper.classList.add('hidden');
        }
      }

      syncWithMainProductForm() {
        FoxTheme.pubsub.subscribe(FoxTheme.pubsub.PUB_SUB_EVENTS.variantChange, (event) => {
          if (!this.mainProductInfo) return;
          const isMainProduct = event.data.sectionId === this.mainProductInfo.dataset.section;
          if (!isMainProduct) return;
          const variant = event.data.variant;
          const variantInput = this.querySelector('[name="id"]');

          this.currentVariant = variant;
          if (!variant) {
            this.updateButton(true, '', true);
            return;
          }
          variantInput.value = variant.id;
          this.updatePrice();
          this.updateButton(true, '', false);
          this.updateButton(!variant.available, FoxTheme.variantStrings.soldOut);
        });
      }
    }
  );
}

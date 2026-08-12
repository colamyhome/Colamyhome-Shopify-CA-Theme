const normalizeVariantValue = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s*&\s*/g, '&');

const containedQuantity = (variant) => {
  for (const option of variant?.options || []) {
    const normalized = String(option || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    const match = normalized.match(/^(?:setof|packof)?(\d+)(?:pieces?|chairs?|pack)?$/);
    if (match && Number(match[1]) > 1) return Number(match[1]);
  }
  return 1;
};

const resolveConfiguredVariant = (product, configuredValue) => {
  const normalizedValue = normalizeVariantValue(configuredValue);
  if (!normalizedValue) return { status: 'missing', variant: null };
  const variants = product?.variants || [];
  const titleMatches = variants.filter((variant) => normalizeVariantValue(variant.title) === normalizedValue);
  const optionMatches = variants.filter((variant) =>
    (variant.options || []).some((option) => normalizeVariantValue(option) === normalizedValue)
  );
  const matches = titleMatches.length ? titleMatches : optionMatches;
  if (!matches.length) return { status: 'missing', variant: null };

  if (matches.length === 1) return { status: 'matched', variant: matches[0] };
  return { status: 'ambiguous', variant: null };
};

const combinationKey = ({ table, chair }) => `t${table + 1}_c${chair + 1}`;

const resolveSetVariant = (product, count) => {
  const expectedQuantity = Number(count);
  if (!Number.isInteger(expectedQuantity) || expectedQuantity <= 1) {
    return { status: 'missing', variant: null };
  }
  const matches = (product?.variants || []).filter(
    (variant) => containedQuantity(variant) === expectedQuantity,
  );
  if (matches.length === 1) return { status: 'matched', variant: matches[0] };
  return { status: matches.length ? 'ambiguous' : 'missing', variant: null };
};

const combinationPrices = (variant, percentage) => {
  const price = Number(variant?.price);
  const discount = Number(percentage);
  if (!variant || !Number.isFinite(price) || !Number.isFinite(discount) || discount <= 0 || discount > 100) return null;
  const compareAtValue = Number(variant.compare_at_price);
  const showCompare = Number.isFinite(compareAtValue) && compareAtValue > price;
  return {
    original: price,
    compareAt: showCompare ? compareAtValue : null,
    promotional: Math.round(price * (100 - discount) / 100),
    showCompare,
  };
};

const variantDetailsUrl = (product, variant) => {
  if (!product?.url || !variant?.id) return '';
  return `${product.url}${product.url.includes('?') ? '&' : '?'}variant=${variant.id}`;
};

const displayImage = (product, configuredValue) =>
  resolveConfiguredVariant(product, configuredValue).variant?.featured_image || product?.featured_image || null;

const canFulfill = (variant, quantity) => {
  if (!variant?.available || !Number.isInteger(quantity) || quantity <= 0) return false;
  if (!variant.inventory_management || variant.inventory_policy === 'continue') return true;
  return Number(variant.inventory_quantity) >= quantity;
};

const mergeDiscountCodes = (existing, configured) => {
  const codes = [];
  const seen = new Set();
  for (const value of [...(existing || []), configured]) {
    const code = String(value || '').trim();
    const normalized = code.toLowerCase();
    if (!code || seen.has(normalized)) continue;
    seen.add(normalized);
    codes.push(code);
  }
  return codes;
};

const discountIsApplicable = (cart, code) => {
  const normalizedCode = String(code || '').trim().toLowerCase();
  return Boolean(normalizedCode && (cart?.discount_codes || []).some((discount) =>
    String(discount.code || '').trim().toLowerCase() === normalizedCode && discount.applicable
  ));
};

const sceneKey = ({ table, chair, set }) => `t${table + 1}_c${chair + 1}_s${set === 0 ? 4 : 6}`;
const chairCount = ({ set }) => set === 0 ? 4 : 6;
const cyclicIndex = (index, direction, total = 2) => ((index + direction) % total + total) % total;
const loopTrackIndex = (fromIndex, toIndex, direction) => {
  if (fromIndex === 1 && toIndex === 0 && direction > 0) return 3;
  if (fromIndex === 0 && toIndex === 1 && direction < 0) return 0;
  return toIndex + 1;
};
window.ProductPairingUtils = {
  normalizeVariantValue, containedQuantity, resolveConfiguredVariant, canFulfill,
  combinationKey, resolveSetVariant, combinationPrices, variantDetailsUrl, displayImage,
  mergeDiscountCodes, discountIsApplicable,
  sceneKey, chairCount, cyclicIndex, loopTrackIndex,
};

if (!customElements.get('product-pairing')) {
  customElements.define(
    'product-pairing',
    class ProductPairing extends HTMLElement {
      constructor() {
        super();
        this.handleClick = this.handleClick.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handlePointerCancel = this.handlePointerCancel.bind(this);
        this.dragStarts = new Map();
        this.sliderTransitions = new Map();
      }

      connectedCallback() {
        if (this.initialized) return;
        this.initialized = true;
        try {
          const data = JSON.parse(this.querySelector('[data-pairing-products]')?.textContent || '{}');
          this.tables = data.tables || [];
          this.chairs = data.chairs || [];
          this.combinations = data.combinations || {};
          this.variantValues = data.variantValues || { tables: [], chairs: [] };
          this.discount = data.discount || {};
          this.scenes = data.scenes || {};
          this.couponSelected = Boolean(this.querySelector('[data-pairing-coupon]')?.checked);
          this.baseValid = this.dataset.pairingValid === 'true';
          this.state = { table: 0, chair: 0, set: 0 };
          this.resolveSelection();
          if (!this.setAvailable(0) && this.setAvailable(1)) {
            this.state.set = 1;
            this.resolveSelection();
          }
          this.cartDrawer = document.querySelector('cart-drawer');
          const configuration = this.querySelector('[data-pairing-configuration]');
          if (configuration) configuration.hidden = true;
        } catch (error) {
          this.baseValid = false;
          this.configurationValid = false;
          this.combinationProduct = null;
          this.combinationVariant = null;
          this.prices = null;
          this.state = { table: 0, chair: 0, set: 0 };
          this.showError(this.dataset.cartError);
          const configuration = this.querySelector('[data-pairing-configuration]');
          if (configuration) configuration.hidden = true;
        }

        this.initializeSliderLoops();
        this.addEventListener('click', this.handleClick);
        this.addEventListener('keydown', this.handleKeydown);
        this.addEventListener('pointerdown', this.handlePointerDown);
        this.addEventListener('pointerup', this.handlePointerUp);
        this.addEventListener('pointercancel', this.handlePointerCancel);
        this.update();
      }

      disconnectedCallback() {
        this.removeEventListener('click', this.handleClick);
        this.removeEventListener('keydown', this.handleKeydown);
        this.removeEventListener('pointerdown', this.handlePointerDown);
        this.removeEventListener('pointerup', this.handlePointerUp);
        this.removeEventListener('pointercancel', this.handlePointerCancel);
        this.sliderTransitions.forEach((transition, type) => this.cancelSliderTransition(type, transition));
        for (const type of ['table', 'chair']) {
          const slider = this.querySelector(`[data-product-slider="${type}"]`);
          const track = slider?.querySelector('[data-product-track]');
          if (track) this.normalizeSlider(type, track, false);
        }
        this.initialized = false;
      }

      createLoopClone(slide) {
        const clone = slide.cloneNode(true);
        clone.classList.add('product-pairing__slide--clone');
        clone.classList.remove('is-active');
        clone.removeAttribute('data-product-slide');
        clone.removeAttribute('data-index');
        clone.removeAttribute('id');
        clone.setAttribute('tabindex', '-1');
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('inert', '');
        if ('inert' in clone) clone.inert = true;
        clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        clone.querySelectorAll('a, button, input, select, textarea, [tabindex]').forEach((element) => {
          element.setAttribute('tabindex', '-1');
        });
        return clone;
      }

      initializeSliderLoops() {
        for (const type of ['table', 'chair']) {
          const slider = this.querySelector(`[data-product-slider="${type}"]`);
          const track = slider?.querySelector('[data-product-track]');
          if (!slider || !track) continue;
          if (slider.dataset.loopReady !== 'true') {
            const slides = [...track.children].filter((child) => child.hasAttribute('data-product-slide'));
            if (slides.length !== 2) continue;
            track.prepend(this.createLoopClone(slides[1]));
            track.append(this.createLoopClone(slides[0]));
            slider.dataset.loopReady = 'true';
          }
          this.normalizeSlider(type, track);
        }
      }

      cancelSliderTransition(type, transition) {
        if (this.sliderTransitions.get(type) !== transition) return false;
        if (transition.onEnd) transition.track.removeEventListener('transitionend', transition.onEnd);
        if (transition.timer != null) window.clearTimeout(transition.timer);
        if (transition.startFrame != null) window.cancelAnimationFrame(transition.startFrame);
        if (transition.resetFrame != null) window.cancelAnimationFrame(transition.resetFrame);
        this.sliderTransitions.delete(type);
        return true;
      }

      normalizeSlider(type, track, releaseLock = true) {
        const active = this.sliderTransitions.get(type);
        if (active) this.cancelSliderTransition(type, active);
        const stableIndex = (this.state?.[type] || 0) + 1;
        track.classList.add('is-resetting');
        track.style.transform = `translateX(-${stableIndex * 100}%)`;
        track.getBoundingClientRect();
        if (!releaseLock) return;
        const transition = {
          track, onEnd: null, timer: null, startFrame: null, resetFrame: null,
        };
        this.sliderTransitions.set(type, transition);
        transition.resetFrame = window.requestAnimationFrame(() => {
          if (this.sliderTransitions.get(type) !== transition) return;
          transition.resetFrame = null;
          track.classList.remove('is-resetting');
          this.sliderTransitions.delete(type);
        });
      }

      handleClick(event) {
        const coupon = event.target.closest('[data-pairing-coupon]');
        if (coupon) {
          this.couponSelected = Boolean(coupon.checked);
          this.update();
          return;
        }
        const arrow = event.target.closest('[data-pairing-arrow]');
        if (arrow) {
          const type = arrow.dataset.productType;
          const direction = Number(arrow.dataset.direction);
          this.move(type, direction);
          return;
        }
        const dot = event.target.closest('[data-pairing-dot]');
        if (dot) {
          this.select(dot.dataset.productType, Number(dot.dataset.index));
          return;
        }
        const setButton = event.target.closest('[data-set-index]');
        if (setButton && !setButton.disabled) {
          this.select('set', Number(setButton.dataset.setIndex));
          return;
        }
        const addButton = event.target.closest('[data-pairing-add]');
        if (addButton) this.addToCart(addButton);
      }

      handleKeydown(event) {
        const dot = event.target.closest('[data-pairing-dot]');
        if (!dot || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const type = dot.dataset.productType;
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        if (!this.move(type, direction)) return;
        this.querySelector(
          `[data-pairing-dot][data-product-type="${type}"][data-index="${this.state[type]}"]`,
        )?.focus();
      }

      handlePointerDown(event) {
        const viewport = event.target.closest('.product-pairing__viewport');
        const slider = viewport?.closest('[data-product-slider]');
        if (!slider || event.pointerType === 'mouse' && event.button !== 0) return;
        this.dragStarts.set(event.pointerId, { x: event.clientX, y: event.clientY, slider });
        viewport.classList.add('is-dragging');
        viewport.setPointerCapture?.(event.pointerId);
      }

      handlePointerUp(event) {
        const start = this.dragStarts.get(event.pointerId);
        if (!start) return;
        this.dragStarts.delete(event.pointerId);
        start.slider.querySelector('.product-pairing__viewport')?.classList.remove('is-dragging');
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
        const type = start.slider.dataset.productSlider;
        this.move(type, deltaX < 0 ? 1 : -1);
      }

      handlePointerCancel(event) {
        const start = this.dragStarts.get(event.pointerId);
        start?.slider.querySelector('.product-pairing__viewport')?.classList.remove('is-dragging');
        this.dragStarts.delete(event.pointerId);
      }

      move(type, direction) {
        if (!['table', 'chair'].includes(type) || ![-1, 1].includes(direction)) return false;
        if (this.sliderTransitions.has(type)) return false;
        return this.select(type, cyclicIndex(this.state[type], direction), direction);
      }

      transitionSlider(type, track, { fromIndex, toIndex, direction }) {
        const stableIndex = toIndex + 1;
        const visualIndex = loopTrackIndex(fromIndex, toIndex, direction);
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        if (reduceMotion) {
          track.classList.add('is-resetting');
          track.style.transform = `translateX(-${stableIndex * 100}%)`;
          track.getBoundingClientRect();
          track.classList.remove('is-resetting');
          return;
        }

        const transition = {
          track, onEnd: null, timer: null, startFrame: null, resetFrame: null, started: false,
        };
        const finish = () => {
          if (this.sliderTransitions.get(type) !== transition) return;
          if (transition.onEnd) track.removeEventListener('transitionend', transition.onEnd);
          if (transition.timer != null) {
            window.clearTimeout(transition.timer);
            transition.timer = null;
          }
          if (visualIndex !== stableIndex) {
            track.classList.add('is-resetting');
            track.style.transform = `translateX(-${stableIndex * 100}%)`;
            track.getBoundingClientRect();
            transition.resetFrame = window.requestAnimationFrame(() => {
              if (this.sliderTransitions.get(type) !== transition) return;
              transition.resetFrame = null;
              track.classList.remove('is-resetting');
              this.sliderTransitions.delete(type);
            });
          } else {
            this.sliderTransitions.delete(type);
          }
        };
        const onEnd = (event) => {
          if (transition.started && event.target === track && event.propertyName === 'transform') finish();
        };
        transition.onEnd = onEnd;
        this.sliderTransitions.set(type, transition);
        track.addEventListener('transitionend', onEnd);
        track.classList.remove('is-resetting');
        transition.startFrame = window.requestAnimationFrame(() => {
          if (this.sliderTransitions.get(type) !== transition) return;
          transition.startFrame = null;
          transition.started = true;
          track.style.transform = `translateX(-${visualIndex * 100}%)`;
          transition.timer = window.setTimeout(finish, 400);
        });
      }

      select(type, index, direction = 0) {
        if (!['table', 'chair', 'set'].includes(type) || ![0, 1].includes(index)) return false;
        if (type !== 'set' && this.sliderTransitions.has(type)) return false;
        const fromIndex = this.state[type];
        if (fromIndex === index) return false;
        this.pendingSliderTransition = type === 'table' || type === 'chair'
          ? { type, fromIndex, toIndex: index, direction }
          : null;
        this.lastSelectionType = type;
        this.state[type] = index;
        if (type !== 'set' && !this.setAvailable(this.state.set) && this.setAvailable(this.state.set === 0 ? 1 : 0)) {
          this.state.set = this.state.set === 0 ? 1 : 0;
        }
        this.update();
        this.pendingSliderTransition = null;
        return true;
      }

      update() {
        if (!this.state) return;
        const selectionValid = this.resolveSelection();
        for (const type of ['table', 'chair']) {
          const slider = this.querySelector(`[data-product-slider="${type}"]`);
          const track = slider?.querySelector('[data-product-track]');
          const transition = this.pendingSliderTransition?.type === type
            ? this.pendingSliderTransition
            : null;
          if (track && !this.sliderTransitions.has(type)) {
            if (transition) {
              this.transitionSlider(type, track, transition);
            } else {
              const offset = slider?.dataset.loopReady === 'true' ? this.state[type] + 1 : this.state[type];
              track.style.transform = `translateX(-${offset * 100}%)`;
            }
          }
          slider?.querySelectorAll('[data-product-slide]').forEach((slide) => {
            const active = Number(slide.dataset.index) === this.state[type];
            slide.classList.toggle('is-active', active);
            slide.setAttribute('aria-hidden', String(!active));
          });
          slider?.querySelectorAll('[data-pairing-dot]').forEach((dot) => {
            const active = Number(dot.dataset.index) === this.state[type];
            dot.classList.toggle('is-active', active);
            dot.setAttribute('aria-pressed', String(active));
            dot.tabIndex = active ? 0 : -1;
          });
        }

        const details = this.querySelector('[data-pairing-details]');
        const detailsUrl = variantDetailsUrl(this.combinationProduct, this.combinationVariant);
        if (details) {
          if (detailsUrl) {
            details.setAttribute('href', detailsUrl);
            details.removeAttribute('aria-disabled');
            details.removeAttribute('tabindex');
          } else {
            details.removeAttribute('href');
            details.setAttribute('aria-disabled', 'true');
            details.setAttribute('tabindex', '-1');
          }
        }

        const count = chairCount(this.state);
        const quantity = (this.dataset.chairQuantityTemplate || '__COUNT__').replace('__COUNT__', String(count));
        this.querySelectorAll('[data-chair-quantity]').forEach((element) => { element.textContent = quantity; });
        this.querySelectorAll('[data-chair-thumbnail]').forEach((element, index) => { element.hidden = index >= count; });
        const chairImage = displayImage(
          this.chairs?.[this.state.chair],
          this.variantValues?.chairs?.[this.state.chair],
        )?.src;
        if (chairImage) this.querySelectorAll('[data-chair-thumbnail-image]').forEach((image) => { image.src = chairImage; image.removeAttribute('srcset'); });

        for (const set of [0, 1]) {
          const button = this.querySelector(`[data-set-index="${set}"]`);
          const unavailable = !this.setAvailable(set);
          if (button) {
            button.disabled = unavailable;
            button.classList.toggle('is-active', set === this.state.set);
            button.setAttribute('aria-pressed', String(set === this.state.set));
          }
        }

        this.setMoney('[data-pairing-price]', this.couponSelected ? this.prices?.promotional : this.prices?.original);
        const compare = this.querySelector('[data-pairing-compare-price]');
        const showCompare = Boolean(compare && this.prices?.showCompare);
        if (compare) {
          compare.hidden = !showCompare;
          if (showCompare) compare.innerHTML = this.formatMoney(this.prices.compareAt);
        }

        const add = this.querySelector('[data-pairing-add]');
        this.currentCanAdd = Boolean(selectionValid && this.setAvailable(this.state.set));
        if (add && !add.classList.contains('btn--loading')) {
          add.disabled = !this.currentCanAdd;
          add.setAttribute('aria-disabled', String(!this.currentCanAdd));
        }

        if (!selectionValid) this.showError('');

        this.updateScene(sceneKey(this.state));
        const status = this.querySelector('[data-pairing-status]');
        if (status && this.lastSelectionType) {
          const selectedControl = this.lastSelectionType === 'set'
            ? this.querySelector(`[data-set-index="${this.state.set}"]`)
            : this.querySelector(`[data-product-slider="${this.lastSelectionType}"]`);
          const position = this.lastSelectionType === 'set' ? '' : (this.dataset.slidePosition || '__POSITION__ / __TOTAL__')
            .replace('__POSITION__', String(this.state[this.lastSelectionType] + 1))
            .replace('__TOTAL__', '2');
          const selectedText = this.lastSelectionType === 'set'
            ? selectedControl?.textContent
            : selectedControl?.querySelector('.is-active')?.textContent;
          const unavailableSets = [...this.querySelectorAll('[data-set-index]:disabled')].map((button) => button.textContent.trim());
          status.textContent = [selectedControl?.getAttribute('aria-label'), position, selectedText?.trim(), ...unavailableSets]
            .filter(Boolean)
            .join('. ');
        }
      }

      resolveSelection() {
        const count = chairCount(this.state);
        this.combinationProduct = this.combinations?.[combinationKey(this.state)] || null;
        this.combinationVariantResult = resolveSetVariant(this.combinationProduct, count);
        this.combinationVariant = this.combinationVariantResult.variant;
        this.configurationValid = Boolean(
          this.baseValid &&
          this.combinationVariantResult.status === 'matched'
        );
        this.prices = combinationPrices(this.combinationVariant, this.discount?.percentage);
        return Boolean(this.configurationValid && this.prices && String(this.discount?.code || '').trim());
      }

      setAvailable(set) {
        const count = set === 0 ? 4 : 6;
        const product = this.combinations?.[combinationKey(this.state)];
        const result = resolveSetVariant(product, count);
        return Boolean(result.status === 'matched' && canFulfill(result.variant, 1));
      }

      updateScene(key) {
        this.pendingSceneKey = key;
        const next = this.querySelector(`[data-scene-key="${key}"]`);
        if (!next || next.classList.contains('is-active')) return;
        const activate = () => {
          if (this.pendingSceneKey !== key) return;
          this.querySelectorAll('[data-scene-key]').forEach((layer) => {
            const active = layer === next;
            layer.classList.toggle('is-active', active);
            layer.setAttribute('aria-hidden', String(!active));
          });
        };
        const image = next.querySelector('img');
        if (!image) return;
        if (image.complete) {
          if (image.naturalWidth > 0) activate();
        } else {
          image.addEventListener('load', activate, { once: true });
          image.addEventListener('error', () => {}, { once: true });
        }
      }

      setMoney(selector, cents) {
        const element = this.querySelector(selector);
        if (element) element.innerHTML = cents == null ? '' : this.formatMoney(cents);
      }

      formatMoney(cents) {
        if (window.FoxTheme?.Currency?.formatMoney) return FoxTheme.Currency.formatMoney(cents, FoxTheme.settings.moneyFormat);
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: this.dataset.currency || 'USD' }).format((cents || 0) / 100);
      }

      showError(message) {
        const error = this.querySelector('[data-pairing-error]');
        if (error) { error.textContent = message || ''; error.hidden = !message; }
      }

      existingDiscountCodes() {
        return [...document.querySelectorAll('.cart__discounts .discount')]
          .map((element) => element.dataset.discountCode)
          .filter(Boolean);
      }

      cartSections() {
        const sections = [];
        document.documentElement.dispatchEvent(
          new CustomEvent('cart:grouped-sections', { bubbles: true, detail: { sections } }),
        );
        return sections;
      }

      showDiscountError(message) {
        const discountForm = this.cartDrawer?.querySelector('form[is="cart-discount"]') ||
          document.querySelector('form[is="cart-discount"]');
        if (typeof discountForm?.displayFormErrors === 'function') {
          discountForm.displayFormErrors(message);
        } else {
          this.showError(message);
        }
      }

      async addToCart(button) {
        if (!this.currentCanAdd || button.classList.contains('btn--loading')) return;
        const items = [{ id: this.combinationVariant.id, quantity: 1 }];
        const sections = this.cartSections();
        let addedResult = null;
        let finalSections = null;
        let itemsAdded = false;

        button.classList.add('btn--loading');
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        this.showError('');

        try {
          const addResponse = await fetch(FoxTheme.routes.cart_add_url, {
            ...FoxTheme.utils.fetchConfig('javascript'),
            body: JSON.stringify({ items, sections, sections_url: window.location.pathname }),
          });
          addedResult = await addResponse.json();
          if (!addResponse.ok || addedResult.status) throw new Error(addedResult.description || this.dataset.cartError);
          itemsAdded = true;
          finalSections = addedResult.sections;

          if (this.couponSelected) {
            const codes = mergeDiscountCodes(this.existingDiscountCodes(), this.discount.code);
            const updateConfig = FoxTheme.utils.fetchConfig('javascript');
            updateConfig.headers['X-Requested-With'] = 'XMLHttpRequest';
            delete updateConfig.headers['Content-Type'];
            const formData = new FormData();
            formData.append('sections', sections);
            formData.append('sections_url', window.location.pathname);
            formData.append('discount', codes.join(','));
            updateConfig.body = formData;

            const discountResponse = await fetch(FoxTheme.routes.cart_update_url, updateConfig);
            const discountResult = await discountResponse.json();
            finalSections = discountResult.sections || finalSections;
            if (!discountResponse.ok || !discountIsApplicable(discountResult, this.discount.code)) {
              throw Object.assign(new Error(this.dataset.discountError), { discountFailure: true });
            }
          }

          const cart = await (await fetch(FoxTheme.routes.cart_url, FoxTheme.utils.fetchConfig('json', 'GET'))).json();
          cart.sections = finalSections;
          FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart });
          document.dispatchEvent(new CustomEvent('product-ajax:added', { detail: { product: addedResult } }));
          if (document.body.classList.contains('cart-template') || FoxTheme.settings.cartType !== 'drawer') {
            window.location.href = FoxTheme.routes.cart_url;
          } else {
            this.cartDrawer?.show(button);
          }
        } catch (error) {
          if (itemsAdded) {
            try {
              const cart = await (await fetch(FoxTheme.routes.cart_url, FoxTheme.utils.fetchConfig('json', 'GET'))).json();
              cart.sections = finalSections;
              FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart });
            } catch (_refreshError) {
              // The successful add response remains authoritative if refreshing the cart fails.
            }
            if (document.body.classList.contains('cart-template') || FoxTheme.settings.cartType !== 'drawer') {
              window.location.href = FoxTheme.routes.cart_url;
            } else {
              this.cartDrawer?.show(button);
            }
            this.showDiscountError(this.dataset.discountError);
          } else {
            this.showError(error.message || this.dataset.cartError);
          }
        } finally {
          button.classList.remove('btn--loading');
          button.removeAttribute('aria-busy');
          this.update();
        }
      }
    }
  );
}

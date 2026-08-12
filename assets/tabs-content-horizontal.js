class TabsContentHorizontal extends HTMLElement {
  constructor() {
    super();
    this.selectedIndex = 0;
    this.scrollOffset = 15;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleBlockSelect = this.handleBlockSelect.bind(this);
    this.handleViewportChange = this.handleViewportChange.bind(this);
  }

  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.tabList = this.querySelector('[role="tablist"]');
    this.tabs = Array.from(this.querySelectorAll('[role="tab"]'));
    this.panels = Array.from(this.querySelectorAll('[role="tabpanel"]'));
    this.panelContainer = this.querySelector('.tabs-horizontal__panel');
    this.mobileMedia = window.matchMedia('(max-width: 767.98px)');

    this.tabs.forEach((tab, index) => {
      tab.dataset.index = index;
      tab.addEventListener('click', () => this.handleTabClick(index));
      tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      tab.setAttribute('aria-expanded', index === 0 ? 'true' : 'false');

      const panel = this.panels[index];
      if (tab.id && panel?.id) {
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('aria-labelledby', tab.id);
      }
    });

    this.panels.forEach((panel, index) => {
      panel.tabIndex = 0;
      panel.hidden = index !== 0;
    });

    this.tabList?.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('shopify:block:select', this.handleBlockSelect);
    this.mobileMedia.addEventListener('change', this.handleViewportChange);
    this.syncLayout();
    this.setActiveTab(0, false);
  }

  disconnectedCallback() {
    this.tabList?.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('shopify:block:select', this.handleBlockSelect);
    this.mobileMedia?.removeEventListener('change', this.handleViewportChange);
    this.initialized = false;
  }

  isMobile() {
    return this.mobileMedia?.matches;
  }

  handleViewportChange() {
    this.syncLayout();
  }

  syncLayout() {
    if (!this.panelContainer) return;

    if (this.isMobile()) {
      this.panels.forEach((panel, index) => {
        this.tabs[index]?.after(panel);
      });
      return;
    }

    this.panels.forEach((panel) => this.panelContainer.append(panel));
    if (this.selectedIndex === -1) this.setActiveTab(0, false);
  }

  handleTabClick(index) {
    if (this.isMobile() && this.selectedIndex === index) {
      this.closeMobileTab(index);
      return;
    }

    this.setActiveTab(index);
  }

  closeMobileTab(index) {
    const tab = this.tabs[index];
    const panel = this.panels[index];
    if (!tab || !panel) return;

    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('aria-expanded', 'false');
    tab.tabIndex = 0;
    panel.hidden = true;
    this.selectedIndex = -1;
    this.selectedTab = null;
    this.removeAttribute('data-selected');
  }

  setActiveTab(index, scroll = true) {
    if (!this.tabs?.[index] || !this.panels?.[index]) return;

    this.selectedIndex = index;
    this.tabs.forEach((tab, tabIndex) => {
      const isSelected = tabIndex === index;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.setAttribute('aria-expanded', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
    });
    this.panels.forEach((panel, panelIndex) => {
      panel.hidden = panelIndex !== index;
    });

    this.setAttribute('data-selected', index);
    this.dispatchEvent(
      new CustomEvent('tabChange', {
        bubbles: true,
        detail: { selectedIndex: index, selectedTab: this.panels[index] },
      })
    );

    if (scroll) this.scrollToActiveTab(this.tabs[index]);
  }

  scrollToActiveTab(tab) {
    if (this.isMobile()) return;
    const nav = this.querySelector('.tabs-horizontal__nav-js');
    if (!nav || !tab) return;

    const tabRect = tab.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    nav.scrollTo({
      left: tabRect.left - navRect.left + nav.scrollLeft - this.scrollOffset,
      behavior: 'smooth',
    });
  }

  handleKeyDown(event) {
    if (this.isMobile()) return;
    if (!['ArrowRight', 'ArrowLeft'].includes(event.key) || !this.tabs.length) return;

    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (this.selectedIndex + direction + this.tabs.length) % this.tabs.length;
    this.setActiveTab(nextIndex);
    this.tabs[nextIndex].focus();
  }

  handleBlockSelect(event) {
    const tab = event.target.closest('[role="tab"]');
    if (!tab || !this.contains(tab)) return;
    this.setActiveTab(Number(tab.dataset.index), false);
  }
}

if (!customElements.get('tabs-content-horizontal')) {
  customElements.define('tabs-content-horizontal', TabsContentHorizontal);
}

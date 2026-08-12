(() => {
  const setActiveTab = (component, tabIndex) => {
    component.querySelectorAll('[data-comparison-table-fullw-tab]').forEach((tab) => {
      const isActive = tab.dataset.comparisonTableFullwTab === tabIndex;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    component.querySelectorAll('[data-comparison-table-fullw-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.comparisonTableFullwPanel !== tabIndex;
    });
  };

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-comparison-table-fullw-tab]');
    if (!tab) return;

    const component = tab.closest('comparison-table-fullw');
    if (component) setActiveTab(component, tab.dataset.comparisonTableFullwTab);
  });

  document.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[data-comparison-table-fullw-tab]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const component = tab.closest('comparison-table-fullw');
    if (!component) return;

    const tabs = [...component.querySelectorAll('[data-comparison-table-fullw-tab]')];
    const currentIndex = tabs.indexOf(tab);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;

    event.preventDefault();
    tabs[nextIndex].focus();
    setActiveTab(component, tabs[nextIndex].dataset.comparisonTableFullwTab);
  });
})();

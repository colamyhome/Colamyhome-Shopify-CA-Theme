(function () {
  function parseJson(value) {
    let parsed = value;

    for (let index = 0; index < 2 && typeof parsed === 'string'; index += 1) {
      const trimmed = parsed.trim();
      if (!trimmed) return null;

      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        return trimmed;
      }
    }

    return parsed;
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isEmptyValue(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.every(isEmptyValue);
    if (isPlainObject(value)) return Object.values(value).every(isEmptyValue);

    return false;
  }

  function appendTextLine(parent, value) {
    String(value)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const item = document.createElement('span');
        item.className = 'product-accordion-json__value-line';
        item.textContent = line;
        parent.appendChild(item);
      });
  }

  function isImageLabel(label) {
    return String(label).trim().toLowerCase() === 'image';
  }

  function isImageUrl(value) {
    if (typeof value !== 'string') return false;

    const trimmed = value.trim();
    return /^(https?:)?\/\//i.test(trimmed) || /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(trimmed);
  }

  function getImageSources(value) {
    if (Array.isArray(value)) {
      return value.flatMap(getImageSources);
    }

    if (isImageUrl(value)) return [value.trim()];

    if (isPlainObject(value)) {
      return ['src', 'url', 'image', 'Image']
        .flatMap((key) => getImageSources(value[key]))
        .filter(Boolean);
    }

    return [];
  }

  function appendImage(parent, source) {
    const image = document.createElement('img');
    image.className = 'product-accordion-json__image';
    image.setAttribute('src', source);
    image.setAttribute('alt', '');
    image.setAttribute('loading', 'lazy');
    parent.appendChild(image);
  }

  function appendValue(parent, value) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (!isEmptyValue(item)) appendValue(parent, item);
      });
      return;
    }

    if (isPlainObject(value)) {
      renderRows(value, parent);
      return;
    }

    appendTextLine(parent, value);
  }

  function renderRow(label, value, parent) {
    if (isEmptyValue(value)) return;

    const row = document.createElement('div');
    row.className = 'product-accordion-json__row';

    const labelCell = document.createElement('div');
    labelCell.className = 'product-accordion-json__label';
    labelCell.textContent = label;

    const valueCell = document.createElement('div');
    valueCell.className = 'product-accordion-json__value';

    const imageSources = isImageLabel(label) ? getImageSources(value) : [];
    if (imageSources.length) {
      row.className += ' product-accordion-json__row--image';
      valueCell.className += ' product-accordion-json__value--image';
      imageSources.forEach((source) => appendImage(valueCell, source));
    } else if (Array.isArray(value) && !value.some(isPlainObject)) {
      valueCell.className += ' product-accordion-json__value--list';
      appendValue(valueCell, value);
    } else {
      appendValue(valueCell, value);
    }

    if (!valueCell.childElementCount && valueCell.textContent.trim() === '') return;

    if (imageSources.length) {
      row.appendChild(valueCell);
    } else {
      row.append(labelCell, valueCell);
    }
    parent.appendChild(row);
  }

  function renderGroup(title, value, parent) {
    if (isEmptyValue(value)) return;

    const group = document.createElement('section');
    group.className = 'product-accordion-json__group';

    const heading = document.createElement('div');
    heading.className = 'product-accordion-json__group-heading';

    const titleElement = document.createElement('h3');
    titleElement.className = 'product-accordion-json__group-title';
    titleElement.textContent = title;

    const line = document.createElement('span');
    line.className = 'product-accordion-json__group-line';
    line.setAttribute('aria-hidden', 'true');

    heading.append(titleElement, line);
    group.appendChild(heading);

    renderRows(value, group);

    if (group.querySelector('.product-accordion-json__row')) {
      parent.appendChild(group);
    }
  }

  function shouldRenderAsGroup(label, value) {
    if (isImageLabel(label) && getImageSources(value).length) return false;
    if (isPlainObject(value)) return true;

    return Array.isArray(value) && value.some(isPlainObject);
  }

  function renderRows(data, parent) {
    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (isPlainObject(item)) {
          renderRows(item, parent);
        } else if (!isEmptyValue(item)) {
          renderRow('', item, parent);
        }
      });
      return;
    }

    if (!isPlainObject(data)) return;

    Object.entries(data).forEach(([label, value]) => {
      if (!shouldRenderAsGroup(label, value)) renderRow(label, value, parent);
    });

    Object.entries(data).forEach(([label, value]) => {
      if (shouldRenderAsGroup(label, value)) renderGroup(label, value, parent);
    });
  }

  function hideEmptyRoot(root) {
    root.hidden = true;

    if (typeof root.closest !== 'function') return;

    const accordionBlock = root.closest('.product__block--accordion_row');
    if (accordionBlock) accordionBlock.hidden = true;
  }

  function renderRoot(root) {
    if (root.dataset.productAccordionJsonRendered === 'true') return;

    const dataElement = root.querySelector('.product-accordion-row-json__data');
    const source = parseJson(dataElement ? dataElement.textContent : '');
    root.dataset.productAccordionJsonRendered = 'true';

    if (isEmptyValue(source)) {
      hideEmptyRoot(root);
      return;
    }

    const content = document.createElement('div');
    content.className = 'product-accordion-json__content';
    renderRows(source, content);

    root.innerHTML = '';

    if (content.querySelector('.product-accordion-json__row')) {
      root.appendChild(content);
    } else {
      hideEmptyRoot(root);
    }
  }

  function renderAll() {
    document.querySelectorAll('[data-product-accordion-json]').forEach(renderRoot);
  }

  document.addEventListener('DOMContentLoaded', renderAll);
  document.addEventListener('shopify:section:load', renderAll);
  renderAll();
})();

(function() {
  'use strict';

  let allItems = [];
  let keepCustom = new Set();
  let customTextures = {};
  let customTextureBlobs = {};
  let packTextureMap = {};
  let filteredItems = [];
  let vanillaOverrides = {};

  let sbTextureZip = null;
  let vanillaTextureZip = null;
  let modelsMap = {};
  let textureCache = {};

  const SB_TEXTURES_ZIP = 'textures/sb_textures.zip';
  const VANILLA_TEXTURES_ZIP = 'textures/vanilla_textures.zip';
  const SB_MODELS_JSON = 'models/sb_models.json';

  const itemList = document.getElementById('item-list');
  const loading = document.getElementById('loading');
  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const vanillaFilter = document.getElementById('vanilla-filter');
  const selectAllBtn = document.getElementById('select-all-btn');
  const deselectAllBtn = document.getElementById('deselect-all-btn');
  const visibleCount = document.getElementById('visible-count');
  const generateBtn = document.getElementById('generate-btn');
  const progressArea = document.getElementById('progress-area');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const downloadArea = document.getElementById('download-area');
  const downloadLink = document.getElementById('download-link');
  const uploadPackBtn = document.getElementById('upload-pack-btn');
  const packFileInput = document.getElementById('pack-file-input');
  const packStatus = document.getElementById('pack-status');
  const packName = document.getElementById('pack-name');
  const selectedOnly = document.getElementById('selected-only');
  const uploadIconBtn = document.getElementById('upload-icon-btn');
  const packIconInput = document.getElementById('pack-icon-input');
  const iconStatus = document.getElementById('icon-status');
  const packIconPreview = document.getElementById('pack-icon-preview');
  const tooltip = document.getElementById('preview-tooltip');
  let currentPackIconBlob = null;

  const sumTotal = document.getElementById('sum-total');
  const sumKeep = document.getElementById('sum-keep');
  const sumConvert = document.getElementById('sum-convert');
  const sumUploads = document.getElementById('sum-uploads');

  const CATEGORY_LABELS = {
    'abiphones': 'Abiphones',
    'bingo': 'Bingo',
    'broken': 'Broken Items',
    'collections': 'Collections',
    'combat_1': 'Combat',
    'community_center': 'Community Center',
    'events': 'Events',
    'fishing': 'Fishing',
    'glacite': 'Glacite',
    'great_spook': 'Great Spook',
    'island_relevant': 'Island Relevant',
    'jacob': 'Jacob',
    'slayer': 'Slayer',
    'stranded_only': 'Stranded',
    'uncategorized': 'Uncategorized'
  };

  const CATEGORY_ORDER = [
    'combat_1', 'slayer', 'fishing', 'collections', 'community_center',
    'events', 'great_spook', 'glacite', 'jacob', 'bingo',
    'island_relevant', 'abiphones', 'stranded_only', 'broken', 'uncategorized'
  ];

  function getCategory(texturePath) {
    const idx = texturePath.indexOf('/');
    return idx > 0 ? texturePath.substring(0, idx) : 'other';
  }

  function getPrimaryCategory(item) {
    const cats = item.textures.map(t => getCategory(t));
    for (const order of CATEGORY_ORDER) {
      if (cats.includes(order)) return order;
    }
    return cats[0] || 'uncategorized';
  }

  function updateStats() {
    const statsBar = document.getElementById('stats-bar');
    if (statsBar && allItems.length) {
      const effectiveVanilla = allItems.map(i => vanillaOverrides[i.name] || i.vanilla);
      const vanillaSet = new Set(effectiveVanilla);
      const overrideCount = Object.keys(vanillaOverrides).length;
      statsBar.innerHTML = `
        <span>${allItems.length} Items</span>
        <span>${vanillaSet.size} Vanilla Types</span>
        <span>${allItems.filter(i => keepCustom.has(i.name)).length} Kept Custom</span>
        ${overrideCount ? '<span>' + overrideCount + ' Overrides</span>' : ''}
      `;
    }
  }

  function getSelectedCount() {
    return allItems.filter(i => keepCustom.has(i.name)).length;
  }

  function updateSummary() {
    const items = selectedOnly.checked ? allItems.filter(i => keepCustom.has(i.name)) : filteredItems;
    const total = items.length;
    const keep = items.filter(i => keepCustom.has(i.name)).length;
    const convert = total - keep;
    const uploads = Object.keys(customTextures).length;
    sumTotal.textContent = total;
    sumKeep.textContent = keep;
    sumConvert.textContent = convert;
    sumUploads.textContent = uploads;
    generateBtn.textContent = selectedOnly.checked
      ? 'Generate Pack (' + getSelectedCount() + ' selected)'
      : 'Generate Pack';
    updateStats();
  }

  function categorizeItems() {
    const cats = new Set();
    const vanillas = new Set();
    allItems.forEach(item => {
      item.textures.forEach(t => cats.add(getCategory(t)));
      vanillas.add(item.vanilla);
    });
    return { categories: [...cats].sort(), vanillas: [...vanillas].sort() };
  }

  function populateFilters() {
    const { categories, vanillas } = categorizeItems();
    const catFragment = document.createDocumentFragment();
    const defaultCatOpt = document.createElement('option');
    defaultCatOpt.value = 'all';
    defaultCatOpt.textContent = 'All Categories';
    catFragment.appendChild(defaultCatOpt);
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      catFragment.appendChild(opt);
    });
    categoryFilter.innerHTML = '';
    categoryFilter.appendChild(catFragment);

    const vanillaFragment = document.createDocumentFragment();
    const defaultVanOpt = document.createElement('option');
    defaultVanOpt.value = 'all';
    defaultVanOpt.textContent = 'All Vanilla Types';
    vanillaFragment.appendChild(defaultVanOpt);
    vanillas.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v.replace(/_/g, ' ');
      vanillaFragment.appendChild(opt);
    });
    vanillaFilter.innerHTML = '';
    vanillaFilter.appendChild(vanillaFragment);
  }

  function filterItems() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const category = categoryFilter.value;
    const vanilla = vanillaFilter.value;

    filteredItems = allItems.filter(item => {
      if (searchTerm && !item.name.toLowerCase().includes(searchTerm)) {
        return false;
      }
      if (category !== 'all') {
        const hasCategory = item.textures.some(t => getCategory(t) === category);
        if (!hasCategory) return false;
      }
      if (vanilla !== 'all' && item.vanilla !== vanilla) {
        return false;
      }
      return true;
    });

    visibleCount.textContent = filteredItems.length + ' items';
    renderItems();
    updateSummary();
  }

  function createItemRow(item) {
    const row = document.createElement('div');
    row.className = 'item-row ' + (keepCustom.has(item.name) ? 'checked' : 'unchecked');
    row.dataset.name = item.name;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'checkbox';
    cb.checked = keepCustom.has(item.name);
    cb.addEventListener('change', function(e) {
      e.stopPropagation();
      if (toggling) return;
      toggleItem(item.name, this.checked);
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = item.name.replace(/_/g, ' ');
    nameSpan.title = item.name;

    function getVanillaDisplay(item) {
      return (vanillaOverrides[item.name] || item.vanilla).replace(/_/g, ' ');
    }

    const vanillaTag = document.createElement('span');
    vanillaTag.className = 'vanilla-tag-sm';
    vanillaTag.textContent = getVanillaDisplay(item);
    vanillaTag.addEventListener('click', function(e) {
      e.stopPropagation();
      if (vanillaTag.querySelector('input')) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'vanilla-override-input';
      input.value = vanillaOverrides[item.name] || item.vanilla;
      input.placeholder = item.vanilla;
      vanillaTag.textContent = '';
      vanillaTag.appendChild(input);
      input.focus();
      input.select();
      input.addEventListener('blur', function() {
        saveVanillaOverride(item, input.value);
      });
      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          ev.stopPropagation();
          input.blur();
        }
        if (ev.key === 'Escape') {
          ev.stopPropagation();
          saveVanillaOverride(item, '');
        }
      });
    });

    const texCount = document.createElement('span');
    texCount.className = 'texture-count';
    texCount.textContent = item.textures.length > 1 ? item.textures.length + ' tex' : '';

    const uploadIndicator = document.createElement('span');
    uploadIndicator.className = 'upload-indicator';
    if (customTextures[item.name]) {
      uploadIndicator.textContent = '\u2713 uploaded';
    }

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'upload-btn';
    uploadBtn.textContent = customTextures[item.name] ? 'Change' : '+ Upload';
    uploadBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      triggerUpload(item.name);
    });

    const removeUploadBtn = document.createElement('button');
    removeUploadBtn.className = 'remove-upload-btn';
    if (customTextures[item.name]) {
      removeUploadBtn.textContent = '\u2715';
      removeUploadBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        delete customTextures[item.name];
        delete customTextureBlobs[item.name];
        renderItems();
        updateSummary();
      });
    }

    row.appendChild(cb);
    row.appendChild(nameSpan);
    row.appendChild(vanillaTag);
    row.appendChild(texCount);
    row.appendChild(uploadIndicator);
    if (!keepCustom.has(item.name)) {
      row.appendChild(uploadBtn);
      if (removeUploadBtn.textContent) {
        row.appendChild(removeUploadBtn);
      }
    }

    row.addEventListener('mouseenter', function(e) {
      showPreview(e, item);
    });
    row.addEventListener('mousemove', function(e) {
      positionTooltip(e);
    });
    row.addEventListener('mouseleave', function() {
      hidePreview();
    });

    let toggling = false;
    row.addEventListener('click', function() {
      if (toggling) return;
      toggling = true;
      const isChecked = keepCustom.has(item.name);
      toggleItem(item.name, !isChecked);
      setTimeout(function() { toggling = false; }, 50);
    });

    return row;
  }

  function renderItems() {
    if (filteredItems.length === 0) {
      itemList.innerHTML = '<div class="loading">No items match your filters</div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    const grouped = {};
    filteredItems.forEach(item => {
      const cat = getPrimaryCategory(item);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });

    for (const cat of CATEGORY_ORDER) {
      if (!grouped[cat]) continue;
      const label = CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const header = document.createElement('div');
      header.className = 'category-header';
      header.innerHTML = '<span class="cat-label">' + label + '</span><span class="cat-count">' + grouped[cat].length + ' items</span>';
      fragment.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'item-grid';
      grouped[cat].sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
        grid.appendChild(createItemRow(item));
      });
      fragment.appendChild(grid);
    }

    for (const cat in grouped) {
      if (CATEGORY_ORDER.includes(cat)) continue;
      const label = CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const header = document.createElement('div');
      header.className = 'category-header';
      header.innerHTML = '<span class="cat-label">' + label + '</span><span class="cat-count">' + grouped[cat].length + ' items</span>';
      fragment.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'item-grid';
      grouped[cat].sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
        grid.appendChild(createItemRow(item));
      });
      fragment.appendChild(grid);
    }

    itemList.innerHTML = '';
    itemList.appendChild(fragment);
  }

  function saveVanillaOverride(item, value) {
    const trimmed = value.trim().replace(/\.png$/i, '').replace(/ /g, '_');
    if (trimmed && trimmed !== item.vanilla) {
      vanillaOverrides[item.name] = trimmed;
    } else {
      delete vanillaOverrides[item.name];
    }
    renderItems();
    updateSummary();
  }

  function toggleItem(name, checked) {
    if (checked) {
      keepCustom.add(name);
    } else {
      keepCustom.delete(name);
    }
    renderItems();
    updateSummary();
  }

  function triggerUpload(itemName) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.jpg,.jpeg';
    input.addEventListener('change', function() {
      if (this.files && this.files[0]) {
        handleCustomTexture(itemName, this.files[0]);
      }
    });
    input.click();
  }

  function handleCustomTexture(itemName, file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const blob = new Blob([e.target.result], { type: 'image/png' });
      customTextures[itemName] = URL.createObjectURL(blob);
      customTextureBlobs[itemName] = blob;
      renderItems();
      updateSummary();
    };
    reader.readAsArrayBuffer(file);
  }

  async function getTextureUrl(zip, path, zipName) {
    if (textureCache[path]) return textureCache[path];
    try {
      const file = zip.files[path];
      if (!file) {
        console.warn('Preview: file not found in ' + zipName + ': ' + path);
        return '';
      }
      if (file.dir) {
        console.warn('Preview: file is a directory in ' + zipName + ': ' + path);
        return '';
      }
      const base64 = await file.async('base64');
      if (!base64 || base64.length < 10) {
        console.warn('Preview: empty base64 for ' + zipName + ': ' + path);
        return '';
      }
      const url = 'data:image/png;base64,' + base64;
      textureCache[path] = url;
      return url;
    } catch (e) {
      console.warn('Preview error for', zipName, path, e.message);
      return '';
    }
  }

  function clearTextureCache() {
    Object.values(textureCache).forEach(u => URL.revokeObjectURL(u));
    textureCache = {};
  }

  async function showPreview(event, item) {
    const sbTexture = item.textures[0];
    const sbImg = document.getElementById('preview-sb');
    const targetImg = document.getElementById('preview-target');
    const previewName = document.getElementById('preview-name');
    const previewVanilla = document.getElementById('preview-vanilla');
    const targetLabel = document.getElementById('preview-target-label');

    const effectiveVanilla = vanillaOverrides[item.name] || item.vanilla;
    previewName.textContent = item.name.replace(/_/g, ' ');
    previewVanilla.textContent = effectiveVanilla.replace(/_/g, ' ');

    sbImg.src = await getTextureUrl(sbTextureZip, sbTexture + '.png', 'sb');

    if (customTextures[item.name]) {
      targetImg.src = customTextures[item.name];
      targetLabel.textContent = 'Custom Texture';
    } else {
      targetImg.src = await getTextureUrl(vanillaTextureZip, effectiveVanilla + '.png', 'vanilla');
      targetLabel.textContent = 'Vanilla Texture';
    }

    tooltip.classList.add('visible');
    positionTooltip(event);
  }

  function positionTooltip(event) {
    const x = event.clientX + 16;
    const y = event.clientY + 16;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    const ww = window.innerWidth;
    const wh = window.innerHeight;

    let left = x;
    let top = y;
    if (left + tw > ww - 10) left = event.clientX - tw - 16;
    if (top + th > wh - 10) top = event.clientY - th - 16;
    if (left < 10) left = 10;
    if (top < 10) top = 10;

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hidePreview() {
    tooltip.classList.remove('visible');
  }

  // Pack icon upload
  uploadIconBtn.addEventListener('click', function() {
    packIconInput.click();
  });

  packIconInput.addEventListener('change', function() {
    if (!this.files || !this.files[0]) return;
    const file = this.files[0];
    currentPackIconBlob = file;
    iconStatus.textContent = '\u2713';
    packIconPreview.src = URL.createObjectURL(file);
    packIconPreview.hidden = false;
  });

  // Custom pack upload
  uploadPackBtn.addEventListener('click', function() {
    packFileInput.click();
  });

  packFileInput.addEventListener('change', async function() {
    if (!this.files || !this.files[0]) return;
    const file = this.files[0];

    packStatus.textContent = 'Reading pack...';
    packStatus.className = 'pack-status';

    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      packTextureMap = {};

      const itemFiles = Object.keys(zip.files).filter(k =>
        k.startsWith('assets/minecraft/textures/item/') && k.endsWith('.png') && !zip.files[k].dir
      );
      const blockFiles = Object.keys(zip.files).filter(k =>
        k.startsWith('assets/minecraft/textures/block/') && k.endsWith('.png') && !zip.files[k].dir
      );

      for (const name of itemFiles) {
        const vanilla = name.replace('assets/minecraft/textures/item/', '').replace('.png', '');
        const blob = await zip.files[name].async('blob');
        packTextureMap[vanilla] = blob;
      }
      for (const name of blockFiles) {
        const vanilla = name.replace('assets/minecraft/textures/block/', '').replace('.png', '');
        if (!packTextureMap[vanilla]) {
          const blob = await zip.files[name].async('blob');
          packTextureMap[vanilla] = blob;
        }
      }

      const totalNeeded = new Set(allItems.map(i => i.vanilla)).size;
      const matched = Object.keys(packTextureMap).filter(v => {
        for (const item of allItems) {
          if (item.vanilla === v) return true;
        }
        return false;
      }).length;

      packStatus.textContent = file.name + ': ' + matched + '/' + totalNeeded + ' textures matched';
      packStatus.className = 'pack-status loaded';
    } catch (err) {
      packStatus.textContent = 'Failed to read pack: ' + err.message;
    }
  });

  // Generate pack
  generateBtn.addEventListener('click', async function() {
    progressArea.hidden = false;
    downloadArea.hidden = true;
    progressFill.style.width = '0%';
    progressText.textContent = 'Generating pack...';
    generateBtn.disabled = true;

    try {
      const zip = new JSZip();
      let processed = 0;
      let skipped = 0;
      const errorDiv = document.getElementById('progress-errors');
      errorDiv.innerHTML = '';
      errorDiv.hidden = true;
      const itemsToProcess = selectedOnly.checked
        ? allItems.filter(i => keepCustom.has(i.name))
        : allItems;
      const total = itemsToProcess.length;

      for (const item of itemsToProcess) {
        const name = item.name;
        const vanilla = vanillaOverrides[item.name] || item.vanilla;
        const textures = item.textures;

        for (const texturePath of textures) {
          try {
            const destTexturePath = 'assets/hypixel_skyblock/textures/item/' + texturePath + '.png';
            const destModelPath = 'assets/hypixel_skyblock/models/item/' + texturePath + '.json';

            if (keepCustom.has(name)) {
              const sbFile = sbTextureZip.files[texturePath + '.png'];
              if (sbFile && !sbFile.dir) {
                const sbBlob = await sbFile.async('blob');
                zip.file(destTexturePath, sbBlob);
              }
              const modelData = modelsMap[texturePath];
              if (modelData) {
                zip.file(destModelPath, JSON.stringify(modelData));
              }
            } else if (customTextureBlobs[name]) {
              zip.file(destTexturePath, customTextureBlobs[name]);
              zip.file(destModelPath, JSON.stringify({
                parent: 'minecraft:item/' + vanilla,
                textures: { layer0: 'hypixel_skyblock:item/' + texturePath }
              }));
            } else if (packTextureMap[vanilla]) {
              zip.file(destTexturePath, packTextureMap[vanilla]);
              zip.file(destModelPath, JSON.stringify({
                parent: 'minecraft:item/' + vanilla,
                textures: { layer0: 'hypixel_skyblock:item/' + texturePath }
              }));
            } else {
              const vanFile = vanillaTextureZip.files[vanilla + '.png'];
              if (vanFile && !vanFile.dir) {
                const vanillaBlob = await vanFile.async('blob');
                zip.file(destTexturePath, vanillaBlob);
              }
              zip.file(destModelPath, JSON.stringify({
                parent: 'minecraft:item/' + vanilla
              }));
            }
          } catch (err) {
            skipped++;
            if (skipped <= 3) {
              const msg = document.createElement('div');
              msg.className = 'error-msg';
              msg.textContent = 'ERROR: Cannot read "' + texturePath + '.png" (' + err.message + ').';
              errorDiv.appendChild(msg);
              errorDiv.hidden = false;
            }
          }
        }

        processed++;
        const pct = Math.round((processed / total) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = 'Processing ' + processed + '/' + total + '...';
      }

      const description = packName.value.trim() || 'Skyblock Texture Pack (Generated)';
      zip.file('pack.mcmeta', JSON.stringify({
        pack: {
          pack_format: 87,
          description: description
        }
      }));

      if (currentPackIconBlob) {
        zip.file('pack.png', currentPackIconBlob);
      }

      progressText.textContent = 'Compressing pack...';

      const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

      const safeName = description.replace(/[^\w\- ]/g, '').trim() || 'Skyblock_Texture_Pack';
      const displayName = safeName + '.zip';

      const url = URL.createObjectURL(content);
      downloadLink.href = url;
      downloadLink.download = displayName;
      downloadArea.hidden = false;
      progressFill.style.width = '100%';
      progressText.textContent = 'Done! ' + processed + ' items processed' + (skipped ? ', ' + skipped + ' skipped. See errors below.' : '.') + (selectedOnly.checked ? ' (selected items only)' : '');
    } catch (err) {
      progressText.textContent = 'Error: ' + err.message;
    }
    generateBtn.disabled = false;
  });

  // Search/filter events
  searchInput.addEventListener('input', filterItems);
  categoryFilter.addEventListener('change', filterItems);
  vanillaFilter.addEventListener('change', filterItems);

  selectAllBtn.addEventListener('click', function() {
    allItems.forEach(item => keepCustom.add(item.name));
    filterItems();
  });

  deselectAllBtn.addEventListener('click', function() {
    keepCustom.clear();
    filterItems();
  });

  // Load all assets
  async function loadAssets() {
    try {
      loading.textContent = 'Loading assets...';
      const [sbZipData, vanZipData, modelsData, itemsResp] = await Promise.all([
        fetch(SB_TEXTURES_ZIP).then(r => r.arrayBuffer()),
        fetch(VANILLA_TEXTURES_ZIP).then(r => r.arrayBuffer()),
        fetch(SB_MODELS_JSON).then(r => r.json()),
        fetch('data/item_database.json').then(r => r.json())
      ]);

      sbTextureZip = await JSZip.loadAsync(sbZipData);
      vanillaTextureZip = await JSZip.loadAsync(vanZipData);
      modelsMap = modelsData;

      const grouped = {};
      itemsResp.forEach(item => {
        if (!grouped[item.name]) {
          grouped[item.name] = { name: item.name, vanilla: item.vanilla, textures: [] };
        }
        grouped[item.name].textures.push(item.texture);
      });

      allItems = Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
      keepCustom = new Set();
      filteredItems = [...allItems];
      populateFilters();
      filterItems();
      loading.style.display = 'none';

      // Pre-populate texture cache in background
      setTimeout(function() {
        const toPreload = [];
        for (const item of allItems) {
          for (const t of item.textures) {
            if (!textureCache[t + '.png']) toPreload.push(t + '.png');
          }
          if (!textureCache[item.vanilla + '.png']) toPreload.push(item.vanilla + '.png');
        }
        toPreload.forEach(function(path) {
          const isVanilla = path.indexOf('/') === -1;
          getTextureUrl(
            isVanilla ? vanillaTextureZip : sbTextureZip,
            path,
            isVanilla ? 'vanilla' : 'sb'
          );
        });
      }, 500);
    } catch (err) {
      loading.textContent = 'Failed to load: ' + err.message;
    }
  }

  selectedOnly.addEventListener('change', updateSummary);

  loadAssets();
})();

(function() {
  'use strict';

  let allItems = [];
  let keepCustom = new Set();
  let customTextures = {};
  let customTextureBlobs = {};
  let packTextureMap = {};
  let filteredItems = [];
  const VANILLA_TEXTURES_PATH = 'textures/vanilla/';
  const SB_TEXTURES_PATH = 'textures/sb/';
  const SB_MODELS_PATH = 'models/sb/';

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
  const packFormat = document.getElementById('pack-format');
  const minFormat = document.getElementById('min-format');
  const maxFormat = document.getElementById('max-format');
  const packName = document.getElementById('pack-name');
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
      const vanillaSet = new Set(allItems.map(i => i.vanilla));
      statsBar.innerHTML = `
        <span>${allItems.length} Items</span>
        <span>${vanillaSet.size} Vanilla Types</span>
        <span>${allItems.filter(i => keepCustom.has(i.name)).length} Kept Custom</span>
      `;
    }
  }

  function updateSummary() {
    const total = filteredItems.length;
    const keep = filteredItems.filter(i => keepCustom.has(i.name)).length;
    const convert = total - keep;
    const uploads = Object.keys(customTextures).length;
    sumTotal.textContent = total;
    sumKeep.textContent = keep;
    sumConvert.textContent = convert;
    sumUploads.textContent = uploads;
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

    const vanillaTag = document.createElement('span');
    vanillaTag.className = 'vanilla-tag-sm';
    vanillaTag.textContent = item.vanilla.replace(/_/g, ' ');

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

  function showPreview(event, item) {
    const sbTexture = item.textures[0];
    const sbImg = document.getElementById('preview-sb');
    const targetImg = document.getElementById('preview-target');
    const previewName = document.getElementById('preview-name');
    const previewVanilla = document.getElementById('preview-vanilla');
    const targetLabel = document.getElementById('preview-target-label');

    sbImg.src = SB_TEXTURES_PATH + sbTexture + '.png';
    previewName.textContent = item.name.replace(/_/g, ' ');
    previewVanilla.textContent = item.vanilla.replace(/_/g, ' ');

    if (customTextures[item.name]) {
      targetImg.src = customTextures[item.name];
      targetLabel.textContent = 'Custom Texture';
    } else {
      targetImg.src = VANILLA_TEXTURES_PATH + item.vanilla + '.png';
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
      const total = allItems.length;

      for (const item of allItems) {
        const name = item.name;
        const vanilla = item.vanilla;
        const textures = item.textures;

        for (const texturePath of textures) {
          const destTexturePath = 'assets/hypixel_skyblock/textures/item/' + texturePath + '.png';
          const destModelPath = 'assets/hypixel_skyblock/models/item/' + texturePath + '.json';

          if (keepCustom.has(name)) {
            const sbBlob = await fetch(SB_TEXTURES_PATH + texturePath + '.png').then(r => {
              if (!r.ok) throw new Error('Missing SB texture: ' + texturePath);
              return r.blob();
            });
            zip.file(destTexturePath, sbBlob);
            const modelResp = await fetch(SB_MODELS_PATH + texturePath + '.json');
            if (modelResp.ok) {
              const modelText = await modelResp.text();
              zip.file(destModelPath, modelText);
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
            const vanillaBlob = await fetch(VANILLA_TEXTURES_PATH + vanilla + '.png').then(r => {
              if (!r.ok) throw new Error('Missing vanilla texture: ' + vanilla);
              return r.blob();
            });
            zip.file(destTexturePath, vanillaBlob);
            zip.file(destModelPath, JSON.stringify({
              parent: 'minecraft:item/' + vanilla
            }));
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
          pack_format: parseInt(packFormat.value) || 87,
          min_format: parseInt(minFormat.value) || 69,
          max_format: parseInt(maxFormat.value) || 999,
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
      progressText.textContent = 'Done! ' + processed + ' items processed.';
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

  // Load items
  async function loadItems() {
    try {
      const resp = await fetch('data/item_database.json');
      const rawItems = await resp.json();

      const grouped = {};
      rawItems.forEach(item => {
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
    } catch (err) {
      loading.textContent = 'Failed to load items: ' + err.message;
    }
  }

  loadItems();
})();

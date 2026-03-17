/* ============================================
   Claude Plugin Manager — Frontend SPA
   Premium UI with card-based detail view
   ============================================ */

(function () {
  'use strict';

  // --- Constants ---
  var CHEVRON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  var DEBOUNCE_MS = 150;

  // --- Section Icons (safe static SVGs) ---
  var SECTION_ICONS = {
    skills: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    agents: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="3"/></svg>',
    commands: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    hooks: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    mcp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    modes: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    claudemd: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',
    install: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>'
  };

  // --- DOM References ---
  var searchInput = document.getElementById('search');
  var searchClear = document.getElementById('search-clear');
  var searchShortcut = document.querySelector('.search-shortcut');
  var filterSource = document.getElementById('filter-source');
  var filterStatus = document.getElementById('filter-status');
  var pluginCount = document.getElementById('plugin-count');
  var pluginList = document.getElementById('plugin-list');
  var detailEmpty = document.getElementById('detail-empty');
  var detailContent = document.getElementById('detail-content');
  var detailLoading = document.getElementById('detail-loading');
  var footerCount = document.getElementById('footer-count');

  // --- State ---
  var currentPlugins = [];
  var selectedId = null;
  var isTransitioning = false;

  // --- Utilities ---

  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function escapeForDisplay(str) {
    // Returns safe text - we always use textContent, but this is belt-and-suspenders
    return String(str);
  }

  // --- API ---

  async function fetchPlugins(query, filter, source) {
    var params = new URLSearchParams();
    if (query) params.set('q', query);
    if (filter) params.set('filter', filter);
    if (source) params.set('source', source);
    var qs = params.toString();
    var url = '/api/plugins' + (qs ? '?' + qs : '');
    var res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch plugins');
    return res.json();
  }

  async function fetchPluginDetail(id) {
    var encoded = encodeURIComponent(id);
    var res = await fetch('/api/plugins/' + encoded);
    if (!res.ok) throw new Error('Failed to fetch plugin detail');
    return res.json();
  }

  // --- Rendering: Plugin List ---

  function renderPluginList(plugins) {
    pluginList.textContent = '';
    plugins.forEach(function (p) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.dataset.id = p.id;

      var dot = document.createElement('span');
      dot.className = 'status-dot ' + (p.enabled ? 'enabled' : 'disabled');
      dot.setAttribute('aria-label', p.enabled ? 'Enabled' : 'Disabled');

      var info = document.createElement('div');
      info.className = 'plugin-item-info';

      var name = document.createElement('span');
      name.className = 'plugin-name';
      name.textContent = p.name;
      info.appendChild(name);

      if (p.description) {
        var desc = document.createElement('span');
        desc.className = 'plugin-desc-preview';
        desc.textContent = p.description;
        info.appendChild(desc);
      }

      li.appendChild(dot);
      li.appendChild(info);

      // Mini count badges
      var totalFeatures = (p.skillCount || 0) + (p.agentCount || 0) + (p.commandCount || 0) +
                          (p.hookCount || 0) + (p.mcpServerCount || 0) + (p.modeCount || 0);
      if (totalFeatures > 0) {
        var badges = document.createElement('div');
        badges.className = 'plugin-meta-badges';
        var countBadge = document.createElement('span');
        countBadge.className = 'mini-badge';
        countBadge.textContent = totalFeatures;
        badges.appendChild(countBadge);
        li.appendChild(badges);
      }

      li.addEventListener('click', function () {
        selectPlugin(p.id);
      });

      pluginList.appendChild(li);
    });
  }

  // --- Rendering: Detail States ---

  function showDetailState(state) {
    detailEmpty.hidden = state !== 'empty';
    detailContent.hidden = state !== 'content';
    detailLoading.hidden = state !== 'loading';
  }

  // --- Rendering: Detail Content ---

  function renderPluginDetail(plugin) {
    detailContent.textContent = '';
    detailContent.classList.remove('fade-in');

    // Force reflow then animate in
    void detailContent.offsetWidth;
    detailContent.classList.add('fade-in');

    // --- Header ---
    var header = document.createElement('div');
    header.className = 'detail-header';

    var titleRow = document.createElement('div');
    titleRow.className = 'detail-title-row';

    var h2 = document.createElement('h2');
    h2.textContent = plugin.name;
    titleRow.appendChild(h2);

    if (plugin.installations && plugin.installations[0] && plugin.installations[0].version) {
      var vPill = document.createElement('span');
      vPill.className = 'version-pill';
      vPill.textContent = 'v' + plugin.installations[0].version;
      titleRow.appendChild(vPill);
    }

    // Status badge
    var statusBadge = document.createElement('span');
    if (plugin.enabled !== undefined) {
      statusBadge.className = 'badge ' + (plugin.enabled ? 'enabled-badge' : 'disabled-badge');
      statusBadge.textContent = plugin.enabled ? 'Enabled' : 'Disabled';
      titleRow.appendChild(statusBadge);
    }

    header.appendChild(titleRow);

    // Description
    if (plugin.description) {
      var desc = document.createElement('p');
      desc.className = 'detail-description';
      desc.textContent = plugin.description;
      header.appendChild(desc);
    }

    // Meta line
    var meta = document.createElement('div');
    meta.className = 'detail-meta';

    if (plugin.author && plugin.author.name) {
      var bySpan = document.createElement('span');
      bySpan.textContent = 'by ' + plugin.author.name;
      meta.appendChild(bySpan);
    }

    if (meta.childNodes.length > 0) {
      var sep = document.createElement('span');
      sep.className = 'meta-separator';
      sep.textContent = '\u25CF';
      meta.appendChild(sep);
    }

    var sourceBadge = document.createElement('span');
    sourceBadge.className = 'badge ' + (plugin.isOfficial ? 'official' : 'community');
    sourceBadge.textContent = plugin.isOfficial ? 'Official' : 'Community';
    meta.appendChild(sourceBadge);

    header.appendChild(meta);

    // Error banner
    if (plugin.error) {
      var errBanner = document.createElement('div');
      errBanner.className = 'error-banner';

      var errIcon = document.createElement('span');
      errIcon.className = 'error-banner-icon';
      errIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      errBanner.appendChild(errIcon);

      var errText = document.createElement('span');
      errText.className = 'error-banner-text';
      errText.textContent = plugin.error;
      errBanner.appendChild(errText);

      header.appendChild(errBanner);
    }

    // Stat chips
    var stats = [];
    if (plugin.skills && plugin.skills.length) stats.push({ label: 'Skills', count: plugin.skills.length });
    if (plugin.agents && plugin.agents.length) stats.push({ label: 'Agents', count: plugin.agents.length });
    if (plugin.commands && plugin.commands.length) stats.push({ label: 'Commands', count: plugin.commands.length });
    if (plugin.hooks && plugin.hooks.length) stats.push({ label: 'Hooks', count: plugin.hooks.length });
    if (plugin.mcpServers && plugin.mcpServers.length) stats.push({ label: 'MCP Servers', count: plugin.mcpServers.length });
    if (plugin.modes && plugin.modes.length) stats.push({ label: 'Modes', count: plugin.modes.length });

    if (stats.length > 0) {
      var chipsWrap = document.createElement('div');
      chipsWrap.className = 'stat-chips';
      stats.forEach(function (s) {
        var chip = document.createElement('span');
        chip.className = 'stat-chip';
        var countEl = document.createElement('span');
        countEl.className = 'stat-count';
        countEl.textContent = s.count;
        var labelEl = document.createElement('span');
        labelEl.textContent = s.label;
        chip.appendChild(countEl);
        chip.appendChild(labelEl);
        chipsWrap.appendChild(chip);
      });
      header.appendChild(chipsWrap);
    }

    detailContent.appendChild(header);

    // --- Sections ---
    var firstExpanded = false;

    // Skills (card grid)
    if (plugin.skills && plugin.skills.length > 0) {
      var sec = renderCardSection('Skills', SECTION_ICONS.skills, plugin.skills, function (item) {
        return createItemCard(item.name, item.description);
      });
      if (!firstExpanded) { autoExpandSection(sec); firstExpanded = true; }
      detailContent.appendChild(sec);
    }

    // Agents (card grid)
    if (plugin.agents && plugin.agents.length > 0) {
      var sec2 = renderCardSection('Agents', SECTION_ICONS.agents, plugin.agents, function (item) {
        return createItemCard(item.name, item.description);
      });
      if (!firstExpanded) { autoExpandSection(sec2); firstExpanded = true; }
      detailContent.appendChild(sec2);
    }

    // Commands (card grid)
    if (plugin.commands && plugin.commands.length > 0) {
      var sec3 = renderCardSection('Commands', SECTION_ICONS.commands, plugin.commands, function (item) {
        return createItemCard(item.name, item.description);
      });
      if (!firstExpanded) { autoExpandSection(sec3); firstExpanded = true; }
      detailContent.appendChild(sec3);
    }

    // Hooks (compact list)
    if (plugin.hooks && plugin.hooks.length > 0) {
      var sec4 = renderCompactSection('Hooks', SECTION_ICONS.hooks, plugin.hooks, function (item, idx) {
        return createCompactRow(item.event, item.command || '', idx);
      });
      if (!firstExpanded) { autoExpandSection(sec4); firstExpanded = true; }
      detailContent.appendChild(sec4);
    }

    // MCP Servers (compact list)
    if (plugin.mcpServers && plugin.mcpServers.length > 0) {
      var sec5 = renderCompactSection('MCP Servers', SECTION_ICONS.mcp, plugin.mcpServers, function (item, idx) {
        var val = (item.type ? item.type + ' — ' : '') + (item.command || item.url || '');
        return createCompactRow(item.name, val, idx);
      });
      if (!firstExpanded) { autoExpandSection(sec5); firstExpanded = true; }
      detailContent.appendChild(sec5);
    }

    // Modes (compact list)
    if (plugin.modes && plugin.modes.length > 0) {
      var sec6 = renderCompactSection('Modes', SECTION_ICONS.modes, plugin.modes, function (item, idx) {
        return createCompactRow(item.name, '', idx);
      });
      if (!firstExpanded) { autoExpandSection(sec6); firstExpanded = true; }
      detailContent.appendChild(sec6);
    }

    // CLAUDE.md
    if (plugin.hasClaudeMd) {
      var sec7 = renderClaudeMdSection(plugin.claudeMdPreview || 'CLAUDE.md present');
      detailContent.appendChild(sec7);
    }

    // Installation info
    if (plugin.installations && plugin.installations.length > 0) {
      var inst = plugin.installations[0];
      var infoItems = [];
      if (inst.scope) infoItems.push({ label: 'Scope', value: inst.scope });
      if (inst.installedAt) infoItems.push({ label: 'Installed', value: new Date(inst.installedAt).toLocaleDateString() });
      if (inst.gitCommitSha) infoItems.push({ label: 'Git SHA', value: inst.gitCommitSha.substring(0, 8) });
      if (inst.installPath) infoItems.push({ label: 'Path', value: inst.installPath });

      if (infoItems.length > 0) {
        var sec8 = renderInstallSection(infoItems);
        detailContent.appendChild(sec8);
      }
    }

    showDetailState('content');
  }

  // --- Card Section (Skills, Agents, Commands) ---

  function renderCardSection(title, iconSvg, items, renderCard) {
    var wrapper = document.createElement('div');
    wrapper.className = 'collapsible-section';

    var headerEl = createSectionHeader(title, iconSvg, items.length);
    var contentEl = document.createElement('div');
    contentEl.className = 'section-content';

    var grid = document.createElement('div');
    grid.className = 'card-grid';

    items.forEach(function (item, idx) {
      var card = renderCard(item);
      card.style.animationDelay = (idx * 30) + 'ms';
      grid.appendChild(card);
    });

    contentEl.appendChild(grid);
    setupToggle(headerEl, contentEl);
    wrapper.appendChild(headerEl);
    wrapper.appendChild(contentEl);
    return wrapper;
  }

  // --- Compact Section (Hooks, MCP, Modes) ---

  function renderCompactSection(title, iconSvg, items, renderRow) {
    var wrapper = document.createElement('div');
    wrapper.className = 'collapsible-section';

    var headerEl = createSectionHeader(title, iconSvg, items.length);
    var contentEl = document.createElement('div');
    contentEl.className = 'section-content';

    var list = document.createElement('div');
    list.className = 'compact-list';

    items.forEach(function (item, idx) {
      list.appendChild(renderRow(item, idx));
    });

    contentEl.appendChild(list);
    setupToggle(headerEl, contentEl);
    wrapper.appendChild(headerEl);
    wrapper.appendChild(contentEl);
    return wrapper;
  }

  // --- CLAUDE.md Section ---

  function renderClaudeMdSection(preview) {
    var wrapper = document.createElement('div');
    wrapper.className = 'collapsible-section';

    var headerEl = createSectionHeader('CLAUDE.md', SECTION_ICONS.claudemd, 1);
    var contentEl = document.createElement('div');
    contentEl.className = 'section-content';

    var previewWrap = document.createElement('div');
    previewWrap.className = 'claudemd-preview';

    var block = document.createElement('div');
    block.className = 'claudemd-block';
    block.textContent = preview;

    previewWrap.appendChild(block);
    contentEl.appendChild(previewWrap);
    setupToggle(headerEl, contentEl);
    wrapper.appendChild(headerEl);
    wrapper.appendChild(contentEl);
    return wrapper;
  }

  // --- Installation Section ---

  function renderInstallSection(items) {
    var wrapper = document.createElement('div');
    wrapper.className = 'collapsible-section';

    var headerEl = createSectionHeader('Installation', SECTION_ICONS.install, items.length);
    var contentEl = document.createElement('div');
    contentEl.className = 'section-content';

    var grid = document.createElement('div');
    grid.className = 'install-grid';

    items.forEach(function (item) {
      var label = document.createElement('span');
      label.className = 'install-label';
      label.textContent = item.label;

      var value = document.createElement('span');
      value.className = 'install-value';
      value.textContent = item.value;
      value.title = item.value; // Show full value on hover

      grid.appendChild(label);
      grid.appendChild(value);
    });

    contentEl.appendChild(grid);
    setupToggle(headerEl, contentEl);
    wrapper.appendChild(headerEl);
    wrapper.appendChild(contentEl);
    return wrapper;
  }

  // --- Helpers ---

  function createSectionHeader(title, iconSvg, count) {
    var headerEl = document.createElement('div');
    headerEl.className = 'section-header';
    headerEl.setAttribute('role', 'button');
    headerEl.setAttribute('tabindex', '0');
    headerEl.setAttribute('aria-expanded', 'false');

    var iconSpan = document.createElement('span');
    iconSpan.innerHTML = iconSvg; // Safe: controlled static SVG
    headerEl.appendChild(iconSpan);

    var titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    headerEl.appendChild(titleSpan);

    var countSpan = document.createElement('span');
    countSpan.className = 'section-count';
    countSpan.textContent = count;
    headerEl.appendChild(countSpan);

    var spacer = document.createElement('span');
    spacer.className = 'section-spacer';
    headerEl.appendChild(spacer);

    var chevron = document.createElement('span');
    chevron.innerHTML = CHEVRON_SVG; // Safe: controlled static SVG
    headerEl.appendChild(chevron);

    return headerEl;
  }

  function setupToggle(headerEl, contentEl) {
    function toggle() {
      var isExpanded = headerEl.classList.contains('expanded');
      if (isExpanded) {
        headerEl.classList.remove('expanded');
        contentEl.classList.remove('expanded');
        headerEl.setAttribute('aria-expanded', 'false');
      } else {
        headerEl.classList.add('expanded');
        contentEl.classList.add('expanded');
        headerEl.setAttribute('aria-expanded', 'true');
      }
    }

    headerEl.addEventListener('click', toggle);
    headerEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  function autoExpandSection(sectionEl) {
    var h = sectionEl.querySelector('.section-header');
    var c = sectionEl.querySelector('.section-content');
    if (h && c) {
      h.classList.add('expanded');
      c.classList.add('expanded');
      h.setAttribute('aria-expanded', 'true');
    }
  }

  function createItemCard(name, description) {
    var card = document.createElement('div');
    card.className = 'item-card';

    var nameEl = document.createElement('div');
    nameEl.className = 'card-name';
    nameEl.textContent = name;
    card.appendChild(nameEl);

    if (description) {
      var descEl = document.createElement('div');
      descEl.className = 'card-description';
      descEl.textContent = description;
      card.appendChild(descEl);

      // Check if text is likely to be clamped (rough heuristic: > 80 chars)
      if (description.length > 80) {
        card.classList.add('is-expandable');

        var hint = document.createElement('div');
        hint.className = 'card-expand-hint';
        hint.textContent = 'Click to expand';
        card.appendChild(hint);

        card.addEventListener('click', function () {
          var isExpanded = descEl.classList.contains('expanded');
          descEl.classList.toggle('expanded');
          hint.textContent = isExpanded ? 'Click to expand' : 'Click to collapse';
        });
      }
    }

    return card;
  }

  function createCompactRow(key, value, idx) {
    var row = document.createElement('div');
    row.className = 'compact-row';
    row.style.animationDelay = (idx * 30) + 'ms';

    var keyEl = document.createElement('span');
    keyEl.className = 'compact-row-key';
    keyEl.textContent = key;
    row.appendChild(keyEl);

    if (value) {
      var valEl = document.createElement('span');
      valEl.className = 'compact-row-value';
      valEl.textContent = value;
      row.appendChild(valEl);
    }

    return row;
  }

  // --- Selection ---

  function selectPlugin(id) {
    if (isTransitioning && id === selectedId) return;

    selectedId = id;

    // Update list selection
    var items = pluginList.querySelectorAll('li');
    items.forEach(function (li) {
      var isSelected = li.dataset.id === id;
      li.classList.toggle('selected', isSelected);
      li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    // Fade out current content, then show loading
    if (!detailContent.hidden) {
      isTransitioning = true;
      detailContent.classList.add('fade-out');
      detailContent.classList.remove('fade-in');
      setTimeout(function () {
        showDetailState('loading');
        detailContent.classList.remove('fade-out');
        doFetchDetail(id);
      }, 100);
    } else {
      showDetailState('loading');
      doFetchDetail(id);
    }
  }

  function doFetchDetail(id) {
    fetchPluginDetail(id).then(function (plugin) {
      isTransitioning = false;
      if (selectedId === id) {
        renderPluginDetail(plugin);
      }
    }).catch(function (err) {
      isTransitioning = false;
      console.error('Failed to load plugin detail:', err);
      showDetailState('empty');
    });
  }

  // --- Counts ---

  function updateCounts(total, filtered) {
    pluginCount.textContent = filtered + ' of ' + total + ' plugins';
    footerCount.textContent = '\u2022 ' + total + ' plugins installed';
  }

  // --- Load & Refresh ---

  async function loadPlugins() {
    var query = searchInput.value.trim();
    var source = filterSource.value;
    var filter = filterStatus.value;

    try {
      var data = await fetchPlugins(query, filter, source);
      currentPlugins = data.plugins;
      renderPluginList(currentPlugins);
      updateCounts(data.total, data.filtered);

      var ids = currentPlugins.map(function (p) { return p.id; });
      if (currentPlugins.length > 0) {
        if (!selectedId || ids.indexOf(selectedId) === -1) {
          selectPlugin(currentPlugins[0].id);
        } else {
          selectPlugin(selectedId);
        }
      } else {
        selectedId = null;
        showDetailState('empty');
      }
    } catch (err) {
      console.error('Failed to load plugins:', err);
    }
  }

  // --- Search ---

  var debouncedLoad = debounce(loadPlugins, DEBOUNCE_MS);

  searchInput.addEventListener('input', function () {
    searchClear.hidden = !searchInput.value;
    if (searchShortcut) {
      searchShortcut.style.display = searchInput.value ? 'none' : '';
    }
    debouncedLoad();
  });

  searchClear.addEventListener('click', function () {
    searchInput.value = '';
    searchClear.hidden = true;
    if (searchShortcut) searchShortcut.style.display = '';
    searchInput.focus();
    loadPlugins();
  });

  // Global "/" shortcut to focus search
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== searchInput &&
        !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    // Escape to blur search
    if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.blur();
    }
  });

  // --- Filters ---

  filterSource.addEventListener('change', loadPlugins);
  filterStatus.addEventListener('change', loadPlugins);

  // --- Keyboard Navigation ---

  pluginList.addEventListener('keydown', function (e) {
    var items = Array.from(pluginList.querySelectorAll('li'));
    if (items.length === 0) return;

    var currentIdx = items.findIndex(function (li) { return li.classList.contains('selected'); });

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
      selectPlugin(items[nextIdx].dataset.id);
      items[nextIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prevIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
      selectPlugin(items[prevIdx].dataset.id);
      items[prevIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentIdx >= 0) {
        selectPlugin(items[currentIdx].dataset.id);
      }
    }
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      pluginList.focus();
      var items = Array.from(pluginList.querySelectorAll('li'));
      if (items.length > 0) {
        var currentIdx = items.findIndex(function (li) { return li.classList.contains('selected'); });
        var nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
        selectPlugin(items[nextIdx].dataset.id);
      }
    }
  });

  // --- Init ---
  loadPlugins();

})();

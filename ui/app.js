/* ============================================
   Claude Plugin Manager — Frontend SPA
   Premium UI with card-based detail view
   ============================================ */

(function () {
  'use strict';

  /* ----------------------------------------
     Constants & Static SVGs
     ---------------------------------------- */

  var CHEVRON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  var DEBOUNCE_MS = 150;

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

  /* ----------------------------------------
     DOM References
     ---------------------------------------- */

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

  /* ----------------------------------------
     State
     ---------------------------------------- */

  var currentPlugins = [];
  var selectedId = null;
  var isTransitioning = false;
  var restartBannerShown = false;

  /* ----------------------------------------
     Utilities
     ---------------------------------------- */

  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /* ----------------------------------------
     API
     ---------------------------------------- */

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
    var res = await fetch('/api/plugins/' + encodeURIComponent(id));
    if (!res.ok) throw new Error('Failed to fetch plugin detail');
    return res.json();
  }

  /* ----------------------------------------
     Rendering: Plugin List
     ---------------------------------------- */

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

  /* ----------------------------------------
     Rendering: Detail States
     ---------------------------------------- */

  function showDetailState(state) {
    detailEmpty.hidden = state !== 'empty';
    detailContent.hidden = state !== 'content';
    detailLoading.hidden = state !== 'loading';
  }

  /* ----------------------------------------
     Rendering: Detail Content
     ---------------------------------------- */

  function renderPluginDetail(plugin) {
    detailContent.textContent = '';
    detailContent.classList.remove('fade-in');
    void detailContent.offsetWidth;
    detailContent.classList.add('fade-in');

    detailContent.appendChild(renderDetailHeader(plugin));
    renderDetailSections(plugin);

    showDetailState('content');
  }

  function renderDetailHeader(plugin) {
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

    if (plugin.enabled !== undefined) {
      var statusBadge = document.createElement('span');
      statusBadge.className = 'badge ' + (plugin.enabled ? 'enabled-badge' : 'disabled-badge');
      statusBadge.textContent = plugin.enabled ? 'Enabled' : 'Disabled';
      titleRow.appendChild(statusBadge);
    }

    header.appendChild(titleRow);

    if (plugin.description) {
      var desc = document.createElement('p');
      desc.className = 'detail-description';
      desc.textContent = plugin.description;
      header.appendChild(desc);
    }

    header.appendChild(renderDetailMeta(plugin));

    // Toggle switch
    if (plugin.enabled !== undefined) {
      var toggleWrap = document.createElement('div');
      toggleWrap.className = 'toggle-wrap';

      var toggleBtn = document.createElement('button');
      toggleBtn.className = 'toggle-switch' + (plugin.enabled ? ' on' : '');
      toggleBtn.setAttribute('role', 'switch');
      toggleBtn.setAttribute('aria-checked', String(plugin.enabled));
      toggleBtn.setAttribute('aria-label', 'Toggle plugin');

      var toggleThumb = document.createElement('span');
      toggleThumb.className = 'toggle-thumb';
      toggleBtn.appendChild(toggleThumb);

      var toggleLabel = document.createElement('span');
      toggleLabel.className = 'toggle-label';
      toggleLabel.textContent = plugin.enabled ? 'Enabled' : 'Disabled';
      toggleWrap.appendChild(toggleBtn);
      toggleWrap.appendChild(toggleLabel);

      toggleBtn.addEventListener('click', async function() {
        var newState = !plugin.enabled;

        // Optimistic: update UI immediately
        toggleBtn.classList.toggle('on', newState);
        toggleBtn.setAttribute('aria-checked', String(newState));
        toggleLabel.textContent = newState ? 'Enabled' : 'Disabled';

        try {
          var res = await fetch('/api/plugins/' + encodeURIComponent(plugin.id) + '/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: newState })
          });
          if (!res.ok) throw new Error('Failed');
          plugin.enabled = newState;
          showToast(newState ? 'Plugin enabled' : 'Plugin disabled', 'success');
          showRestartBanner();
          // Refresh list to update status dot
          loadPlugins();
        } catch (err) {
          // Revert on failure
          toggleBtn.classList.toggle('on', !newState);
          toggleBtn.setAttribute('aria-checked', String(!newState));
          toggleLabel.textContent = !newState ? 'Enabled' : 'Disabled';
          showToast('Failed to toggle plugin', 'error');
        }
      });

      header.appendChild(toggleWrap);
    }

    if (plugin.error) {
      header.appendChild(renderErrorBanner(plugin.error));
    }

    var statChips = renderStatChips(plugin);
    if (statChips) {
      header.appendChild(statChips);
    }

    return header;
  }

  function renderDetailMeta(plugin) {
    var meta = document.createElement('div');
    meta.className = 'detail-meta';

    if (plugin.author && plugin.author.name) {
      var bySpan = document.createElement('span');
      bySpan.textContent = 'by ' + plugin.author.name;
      meta.appendChild(bySpan);

      var sep = document.createElement('span');
      sep.className = 'meta-separator';
      sep.textContent = '\u25CF';
      meta.appendChild(sep);
    }

    var sourceBadge = document.createElement('span');
    sourceBadge.className = 'badge ' + (plugin.isOfficial ? 'official' : 'community');
    sourceBadge.textContent = plugin.isOfficial ? 'Official' : 'Community';
    meta.appendChild(sourceBadge);

    return meta;
  }

  function renderErrorBanner(errorText) {
    var banner = document.createElement('div');
    banner.className = 'error-banner';

    var icon = document.createElement('span');
    icon.className = 'error-banner-icon';
    icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    banner.appendChild(icon);

    var text = document.createElement('span');
    text.className = 'error-banner-text';
    text.textContent = errorText;
    banner.appendChild(text);

    return banner;
  }

  function renderStatChips(plugin) {
    var statDefs = [
      { key: 'skills', label: 'Skills' },
      { key: 'agents', label: 'Agents' },
      { key: 'commands', label: 'Commands' },
      { key: 'hooks', label: 'Hooks' },
      { key: 'mcpServers', label: 'MCP Servers' },
      { key: 'modes', label: 'Modes' }
    ];

    var stats = statDefs.filter(function (def) {
      return plugin[def.key] && plugin[def.key].length > 0;
    });

    if (stats.length === 0) return null;

    var chipsWrap = document.createElement('div');
    chipsWrap.className = 'stat-chips';
    stats.forEach(function (s) {
      var chip = document.createElement('span');
      chip.className = 'stat-chip';
      var countEl = document.createElement('span');
      countEl.className = 'stat-count';
      countEl.textContent = plugin[s.key].length;
      var labelEl = document.createElement('span');
      labelEl.textContent = s.label;
      chip.appendChild(countEl);
      chip.appendChild(labelEl);
      chipsWrap.appendChild(chip);
    });
    return chipsWrap;
  }

  /* ----------------------------------------
     Rendering: Detail Sections
     ---------------------------------------- */

  function renderDetailSections(plugin) {
    var firstExpanded = false;

    function appendSection(sectionEl) {
      if (!firstExpanded) {
        autoExpandSection(sectionEl);
        firstExpanded = true;
      }
      detailContent.appendChild(sectionEl);
    }

    // Card sections (Skills, Agents, Commands)
    var cardSections = [
      { key: 'skills', title: 'Skills', icon: SECTION_ICONS.skills },
      { key: 'agents', title: 'Agents', icon: SECTION_ICONS.agents },
      { key: 'commands', title: 'Commands', icon: SECTION_ICONS.commands }
    ];

    cardSections.forEach(function (def) {
      var items = plugin[def.key];
      if (items && items.length > 0) {
        appendSection(renderCollapsibleSection(def.title, def.icon, items, 'card', function (item) {
          return createItemCard(item.name, item.description);
        }));
      }
    });

    // Compact sections (Hooks, MCP Servers, Modes)
    if (plugin.hooks && plugin.hooks.length > 0) {
      appendSection(renderCollapsibleSection('Hooks', SECTION_ICONS.hooks, plugin.hooks, 'compact', function (item, idx) {
        return createCompactRow(item.event, item.command || '', idx);
      }));
    }

    if (plugin.mcpServers && plugin.mcpServers.length > 0) {
      appendSection(renderCollapsibleSection('MCP Servers', SECTION_ICONS.mcp, plugin.mcpServers, 'compact', function (item, idx) {
        var val = (item.type ? item.type + ' — ' : '') + (item.command || item.url || '');
        return createCompactRow(item.name, val, idx);
      }));
    }

    if (plugin.modes && plugin.modes.length > 0) {
      appendSection(renderCollapsibleSection('Modes', SECTION_ICONS.modes, plugin.modes, 'compact', function (item, idx) {
        return createCompactRow(item.name, '', idx);
      }));
    }

    // CLAUDE.md
    if (plugin.hasClaudeMd) {
      detailContent.appendChild(renderClaudeMdSection(plugin.claudeMdPreview || 'CLAUDE.md present'));
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
        detailContent.appendChild(renderInstallSection(infoItems));
      }
    }
  }

  /* ----------------------------------------
     Rendering: Collapsible Section (unified)
     ---------------------------------------- */

  function renderCollapsibleSection(title, iconSvg, items, layout, renderItem) {
    var wrapper = document.createElement('div');
    wrapper.className = 'collapsible-section';

    var headerEl = createSectionHeader(title, iconSvg, items.length);
    var contentEl = document.createElement('div');
    contentEl.className = 'section-content';

    var container = document.createElement('div');
    container.className = layout === 'card' ? 'card-grid' : 'compact-list';

    items.forEach(function (item, idx) {
      var el = renderItem(item, idx);
      if (layout === 'card') {
        el.style.animationDelay = (idx * 30) + 'ms';
      }
      container.appendChild(el);
    });

    contentEl.appendChild(container);
    setupToggle(headerEl, contentEl);
    wrapper.appendChild(headerEl);
    wrapper.appendChild(contentEl);
    return wrapper;
  }

  /* ----------------------------------------
     Rendering: CLAUDE.md Section
     ---------------------------------------- */

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

  /* ----------------------------------------
     Rendering: Installation Section
     ---------------------------------------- */

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
      value.title = item.value;

      grid.appendChild(label);
      grid.appendChild(value);
    });

    contentEl.appendChild(grid);
    setupToggle(headerEl, contentEl);
    wrapper.appendChild(headerEl);
    wrapper.appendChild(contentEl);
    return wrapper;
  }

  /* ----------------------------------------
     Section Helpers
     ---------------------------------------- */

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
      var expanding = !headerEl.classList.contains('expanded');
      headerEl.classList.toggle('expanded');
      contentEl.classList.toggle('expanded');
      headerEl.setAttribute('aria-expanded', String(expanding));
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

  /* ----------------------------------------
     Card & Row Helpers
     ---------------------------------------- */

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

  /* ----------------------------------------
     Plugin Selection
     ---------------------------------------- */

  function selectPlugin(id) {
    if (isTransitioning && id === selectedId) return;

    selectedId = id;

    var items = pluginList.querySelectorAll('li');
    items.forEach(function (li) {
      var isSelected = li.dataset.id === id;
      li.classList.toggle('selected', isSelected);
      li.setAttribute('aria-selected', String(isSelected));
    });

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

  /* ----------------------------------------
     Counts
     ---------------------------------------- */

  function updateCounts(total, filtered) {
    pluginCount.textContent = filtered + ' of ' + total + ' plugins';
    footerCount.textContent = '\u2022 ' + total + ' plugins installed';
  }

  /* ----------------------------------------
     Load & Refresh
     ---------------------------------------- */

  async function loadPlugins() {
    var query = searchInput.value.trim();
    var source = filterSource.value;
    var filter = filterStatus.value;

    try {
      var data = await fetchPlugins(query, filter, source);
      currentPlugins = data.plugins;
      renderPluginList(currentPlugins);
      updateCounts(data.total, data.filtered);

      if (currentPlugins.length === 0) {
        selectedId = null;
        showDetailState('empty');
        return;
      }

      var ids = currentPlugins.map(function (p) { return p.id; });
      if (!selectedId || ids.indexOf(selectedId) === -1) {
        selectPlugin(currentPlugins[0].id);
      } else {
        selectPlugin(selectedId);
      }
    } catch (err) {
      console.error('Failed to load plugins:', err);
    }
  }

  /* ----------------------------------------
     Search
     ---------------------------------------- */

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

  /* ----------------------------------------
     Keyboard Shortcuts
     ---------------------------------------- */

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== searchInput &&
        !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.blur();
    }
  });

  /* ----------------------------------------
     Filters
     ---------------------------------------- */

  filterSource.addEventListener('change', loadPlugins);
  filterStatus.addEventListener('change', loadPlugins);

  /* ----------------------------------------
     Keyboard Navigation
     ---------------------------------------- */

  pluginList.addEventListener('keydown', function (e) {
    var items = Array.from(pluginList.querySelectorAll('li'));
    if (items.length === 0) return;

    var currentIdx = items.findIndex(function (li) { return li.classList.contains('selected'); });
    var nextIdx;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentIdx >= 0) selectPlugin(items[currentIdx].dataset.id);
      return;
    } else {
      return;
    }

    selectPlugin(items[nextIdx].dataset.id);
    items[nextIdx].scrollIntoView({ block: 'nearest' });
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

  /* ----------------------------------------
     Toast Notifications
     ---------------------------------------- */

  function showToast(message, type) {
    // type: 'success' | 'error' | 'info'
    var container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;

    var closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', function() { dismissToast(toast); });
    toast.appendChild(closeBtn);

    container.appendChild(toast);

    // Auto-dismiss after 4s
    setTimeout(function() { dismissToast(toast); }, 4000);
  }

  function dismissToast(toast) {
    toast.classList.add('toast-exit');
    setTimeout(function() { toast.remove(); }, 250);
  }

  /* ----------------------------------------
     Restart Banner
     ---------------------------------------- */

  function showRestartBanner() {
    if (restartBannerShown) return;
    restartBannerShown = true;

    var banner = document.createElement('div');
    banner.className = 'restart-banner';
    banner.id = 'restart-banner';

    var icon = document.createElement('span');
    icon.textContent = '\u26A0';
    banner.appendChild(icon);

    var text = document.createElement('span');
    text.textContent = 'Changes will apply on next Claude Code session';
    banner.appendChild(text);

    // Insert at top of detail panel
    var detail = document.getElementById('detail');
    detail.insertBefore(banner, detail.firstChild);
  }

  /* ----------------------------------------
     SSE Live Updates
     ---------------------------------------- */

  function connectSSE() {
    var source = new EventSource('/api/events');
    source.onmessage = function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'settings-changed') {
          loadPlugins(); // refresh list
        }
      } catch (ignore) {}
    };
    source.onerror = function() {
      source.close();
      // Reconnect after 5s
      setTimeout(connectSSE, 5000);
    };
  }

  /* ----------------------------------------
     Init
     ---------------------------------------- */

  loadPlugins();
  connectSSE();

})();

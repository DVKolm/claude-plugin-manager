/* ============================================
   Claude Plugin Manager — Frontend SPA
   ============================================ */

(function () {
  'use strict';

  // --- Constants ---
  const CHEVRON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>';
  const DEBOUNCE_MS = 150;

  // --- DOM References ---
  const searchInput = document.getElementById('search');
  const searchClear = document.getElementById('search-clear');
  const filterSource = document.getElementById('filter-source');
  const filterStatus = document.getElementById('filter-status');
  const pluginCount = document.getElementById('plugin-count');
  const pluginList = document.getElementById('plugin-list');
  const detailEmpty = document.getElementById('detail-empty');
  const detailContent = document.getElementById('detail-content');
  const detailLoading = document.getElementById('detail-loading');
  const footerCount = document.getElementById('footer-count');

  // --- State ---
  let currentPlugins = [];
  let selectedId = null;

  // --- Utilities ---

  function debounce(fn, ms) {
    let timer;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  // --- API ---

  async function fetchPlugins(query, filter, source) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (filter) params.set('filter', filter);
    if (source) params.set('source', source);
    const qs = params.toString();
    const url = '/api/plugins' + (qs ? '?' + qs : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch plugins');
    return res.json();
  }

  async function fetchPluginDetail(id) {
    const encoded = encodeURIComponent(id);
    const res = await fetch('/api/plugins/' + encoded);
    if (!res.ok) throw new Error('Failed to fetch plugin detail');
    return res.json();
  }

  // --- Rendering ---

  function renderPluginList(plugins) {
    pluginList.innerHTML = '';
    plugins.forEach(function (p) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.dataset.id = p.id;

      var dot = document.createElement('span');
      dot.className = 'status-dot ' + (p.enabled ? 'enabled' : 'disabled');

      var name = document.createElement('span');
      name.className = 'plugin-name';
      name.textContent = p.name;

      li.appendChild(dot);
      li.appendChild(name);

      li.addEventListener('click', function () {
        selectPlugin(p.id);
      });

      pluginList.appendChild(li);
    });
  }

  function showDetailState(state) {
    detailEmpty.hidden = state !== 'empty';
    detailContent.hidden = state !== 'content';
    detailLoading.hidden = state !== 'loading';
  }

  function renderPluginDetail(plugin) {
    detailContent.innerHTML = '';

    // Header
    var header = document.createElement('div');
    header.className = 'detail-header';

    var titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap = '10px';

    var h2 = document.createElement('h2');
    h2.textContent = plugin.name;
    titleRow.appendChild(h2);

    if (plugin.installations && plugin.installations[0] && plugin.installations[0].version) {
      var vBadge = document.createElement('span');
      vBadge.className = 'badge';
      vBadge.textContent = 'v' + plugin.installations[0].version;
      titleRow.appendChild(vBadge);
    }

    header.appendChild(titleRow);

    // Description
    if (plugin.description) {
      var desc = document.createElement('p');
      desc.className = 'description';
      desc.textContent = plugin.description;
      header.appendChild(desc);
    }

    // Meta line
    var meta = document.createElement('div');
    meta.className = 'detail-meta';

    var parts = [];
    if (plugin.author && plugin.author.name) {
      var bySpan = document.createElement('span');
      bySpan.textContent = 'by ' + plugin.author.name;
      meta.appendChild(bySpan);
    }

    var sourceBadge = document.createElement('span');
    sourceBadge.className = 'badge ' + (plugin.isOfficial ? 'official' : 'community');
    sourceBadge.textContent = plugin.isOfficial ? 'Official' : 'Community';
    if (meta.childNodes.length > 0) {
      meta.appendChild(document.createTextNode(' \u2022 '));
    }
    meta.appendChild(sourceBadge);

    header.appendChild(meta);
    detailContent.appendChild(header);

    // Collapsible sections

    // Skills
    if (plugin.skills && plugin.skills.length > 0) {
      detailContent.appendChild(renderCollapsibleSection(
        'Skills', '\u26A1', plugin.skills.length, plugin.skills,
        function (item) {
          var tr = document.createElement('tr');
          var td1 = document.createElement('td');
          td1.textContent = item.name;
          var td2 = document.createElement('td');
          td2.textContent = item.description || '';
          tr.appendChild(td1);
          tr.appendChild(td2);
          return tr;
        }
      ));
    }

    // Agents
    if (plugin.agents && plugin.agents.length > 0) {
      detailContent.appendChild(renderCollapsibleSection(
        'Agents', '\uD83E\uDD16', plugin.agents.length, plugin.agents,
        function (item) {
          var tr = document.createElement('tr');
          var td1 = document.createElement('td');
          td1.textContent = item.name;
          var td2 = document.createElement('td');
          td2.textContent = item.description || '';
          tr.appendChild(td1);
          tr.appendChild(td2);
          return tr;
        }
      ));
    }

    // Commands
    if (plugin.commands && plugin.commands.length > 0) {
      detailContent.appendChild(renderCollapsibleSection(
        'Commands', '\u2328', plugin.commands.length, plugin.commands,
        function (item) {
          var tr = document.createElement('tr');
          var td1 = document.createElement('td');
          td1.textContent = item.name;
          var td2 = document.createElement('td');
          td2.textContent = item.description || '';
          tr.appendChild(td1);
          tr.appendChild(td2);
          return tr;
        }
      ));
    }

    // Hooks
    if (plugin.hooks && plugin.hooks.length > 0) {
      detailContent.appendChild(renderCollapsibleSection(
        'Hooks', '\uD83D\uDD17', plugin.hooks.length, plugin.hooks,
        function (item) {
          var tr = document.createElement('tr');
          var td1 = document.createElement('td');
          td1.textContent = item.event;
          var td2 = document.createElement('td');
          td2.textContent = item.command || '';
          tr.appendChild(td1);
          tr.appendChild(td2);
          return tr;
        }
      ));
    }

    // MCP Servers
    if (plugin.mcpServers && plugin.mcpServers.length > 0) {
      detailContent.appendChild(renderCollapsibleSection(
        'MCP Servers', '\uD83D\uDDA5', plugin.mcpServers.length, plugin.mcpServers,
        function (item) {
          var tr = document.createElement('tr');
          var td1 = document.createElement('td');
          td1.textContent = item.name;
          var td2 = document.createElement('td');
          td2.textContent = item.type || '';
          var td3 = document.createElement('td');
          td3.textContent = item.command || item.url || '';
          tr.appendChild(td1);
          tr.appendChild(td2);
          tr.appendChild(td3);
          return tr;
        }
      ));
    }

    // Modes
    if (plugin.modes && plugin.modes.length > 0) {
      detailContent.appendChild(renderCollapsibleSection(
        'Modes', '\uD83C\uDFA8', plugin.modes.length, plugin.modes,
        function (item) {
          var tr = document.createElement('tr');
          var td1 = document.createElement('td');
          td1.textContent = item.name;
          tr.appendChild(td1);
          return tr;
        }
      ));
    }

    // CLAUDE.md
    if (plugin.hasClaudeMd) {
      var claudeItems = [{ preview: plugin.claudeMdPreview || 'CLAUDE.md present' }];
      detailContent.appendChild(renderCollapsibleSection(
        'CLAUDE.md', '\uD83D\uDCC4', 1, claudeItems,
        function (item) {
          var div = document.createElement('div');
          div.style.padding = '8px 0';
          div.style.fontSize = '0.8125rem';
          div.style.color = 'var(--text-secondary)';
          div.style.whiteSpace = 'pre-wrap';
          div.textContent = item.preview;
          return div;
        }
      ));
    }

    // Auto-expand first non-empty collapsible section
    var firstSection = detailContent.querySelector('.collapsible-section');
    if (firstSection && firstSection.__wrapper) {
      firstSection.__wrapper.autoExpand();
    }
    // Try simpler approach: expand first section-header
    var firstHeader = detailContent.querySelector('.section-header');
    var firstContentEl = detailContent.querySelector('.section-content');
    if (firstHeader && firstContentEl) {
      firstHeader.classList.add('expanded');
      firstContentEl.classList.add('expanded');
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
        var section = renderCollapsibleSection(
          'Installation', '\uD83D\uDCE6', infoItems.length, infoItems,
          function (item) {
            var tr = document.createElement('tr');
            var td1 = document.createElement('td');
            td1.textContent = item.label;
            var td2 = document.createElement('td');
            td2.textContent = item.value;
            tr.appendChild(td1);
            tr.appendChild(td2);
            return tr;
          }
        );
        detailContent.appendChild(section);
      }
    }

    showDetailState('content');
  }

  function renderCollapsibleSection(title, iconEmoji, count, items, renderRow) {
    var wrapper = document.createElement('div');
    wrapper.className = 'collapsible-section';

    // Header
    var headerEl = document.createElement('div');
    headerEl.className = 'section-header';

    var iconSpan = document.createElement('span');
    iconSpan.textContent = iconEmoji;
    headerEl.appendChild(iconSpan);

    var titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    headerEl.appendChild(titleSpan);

    var countSpan = document.createElement('span');
    countSpan.className = 'section-count';
    countSpan.textContent = '(' + count + ')';
    headerEl.appendChild(countSpan);

    // Spacer to push chevron right
    var spacer = document.createElement('span');
    spacer.style.flex = '1';
    headerEl.appendChild(spacer);

    // Chevron — static SVG, safe to use innerHTML
    var chevron = document.createElement('span');
    chevron.innerHTML = CHEVRON_SVG;
    headerEl.appendChild(chevron);

    // Content area
    var contentEl = document.createElement('div');
    contentEl.className = 'section-content';

    // Build table or list of items
    var usesTable = items.length > 0 && renderRow(items[0]).tagName === 'TR';

    if (usesTable) {
      var table = document.createElement('table');
      items.forEach(function (item) {
        table.appendChild(renderRow(item));
      });
      contentEl.appendChild(table);
    } else {
      items.forEach(function (item) {
        contentEl.appendChild(renderRow(item));
      });
    }

    // Toggle expand/collapse
    headerEl.addEventListener('click', function () {
      var isExpanded = headerEl.classList.contains('expanded');
      if (isExpanded) {
        headerEl.classList.remove('expanded');
        contentEl.classList.remove('expanded');
      } else {
        headerEl.classList.add('expanded');
        contentEl.classList.add('expanded');
      }
    });

    wrapper.appendChild(headerEl);
    wrapper.appendChild(contentEl);
    wrapper.autoExpand = function () {
      headerEl.classList.add('expanded');
      contentEl.classList.add('expanded');
    };
    return wrapper;
  }

  // --- Selection ---

  function selectPlugin(id) {
    selectedId = id;

    // Update list selection
    var items = pluginList.querySelectorAll('li');
    items.forEach(function (li) {
      var isSelected = li.dataset.id === id;
      li.classList.toggle('selected', isSelected);
      li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    // Show loading
    showDetailState('loading');

    // Fetch and render detail
    fetchPluginDetail(id).then(function (plugin) {
      if (selectedId === id) {
        renderPluginDetail(plugin);
      }
    }).catch(function (err) {
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

      // Auto-select first plugin if none selected or selected no longer in list
      var ids = currentPlugins.map(function (p) { return p.id; });
      if (currentPlugins.length > 0) {
        if (!selectedId || ids.indexOf(selectedId) === -1) {
          selectPlugin(currentPlugins[0].id);
        } else {
          // Re-mark the currently selected item
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
    debouncedLoad();
  });

  searchClear.addEventListener('click', function () {
    searchInput.value = '';
    searchClear.hidden = true;
    loadPlugins();
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

  // Also allow arrow keys when search is focused to navigate list
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

  // Make plugin list focusable for keyboard nav
  pluginList.setAttribute('tabindex', '0');

  // --- Init ---
  loadPlugins();

})();

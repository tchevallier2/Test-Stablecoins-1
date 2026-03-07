/* ============================================================
   Stablecoin Dashboard — Application Logic
   ============================================================ */

// ---------- State ----------
const state = {
  activeFilter: "all",
  searchQuery: "",
  sortBy: "marketcap",
  expandedIssuers: new Set(),
  theme: localStorage.getItem("theme") || "light",
  activeView: "issuers", // "issuers" | "rankings"
};

// ---------- Utilities ----------

function formatMarketCap(value) {
  if (!value) return "N/A";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getRegBadgeClass(status) {
  if (!status) return "";
  const s = status.toLowerCase();
  if (s.includes("licensed") || s.includes("regulated")) return "licensed";
  if (s.includes("dao") || s.includes("decentralized")) return "dao";
  return "unregulated";
}

function computeIssuerMarketCap(issuer) {
  return issuer.stablecoins.reduce((sum, sc) => sum + (sc.marketCap || 0), 0);
}

// ---------- Theme ----------

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.querySelector(".theme-icon");
  if (icon) icon.textContent = theme === "dark" ? "☀" : "☾";
  localStorage.setItem("theme", theme);
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme(state.theme);
}

// ---------- Stat Cards ----------

function renderStats() {
  const { stats, meta } = STABLECOIN_DATA;

  document.getElementById("stat-market-cap").textContent =
    formatMarketCap(stats.totalMarketCap);
  document.getElementById("stat-issuers").textContent = stats.totalIssuers;
  document.getElementById("stat-stablecoins").textContent = stats.totalStablecoins;
  document.getElementById("stat-blockchains").textContent =
    stats.uniqueBlockchains.length;

  const dateEl = document.getElementById("last-updated");
  if (dateEl) dateEl.textContent = `Updated ${formatDate(meta.lastUpdated)}`;

  const footerDate = document.getElementById("footer-date");
  if (footerDate) footerDate.textContent = formatDate(meta.lastUpdated);
}

// ---------- View Switcher ----------

function switchView(view) {
  state.activeView = view;

  document.querySelectorAll(".page-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  document.getElementById("issuers-view").classList.toggle("hidden", view !== "issuers");
  document.getElementById("rankings-view").classList.toggle("hidden", view !== "rankings");

  if (view === "rankings") renderRankingsTable();
}

// ---------- Filter Tabs ----------

function renderFilterTabs() {
  const container = document.getElementById("filter-tabs");
  container.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = `tab-btn ${state.activeFilter === "all" ? "active" : ""}`;
  allBtn.dataset.filter = "all";
  allBtn.textContent = "All Issuers";
  allBtn.addEventListener("click", () => setFilter("all"));
  container.appendChild(allBtn);

  STABLECOIN_DATA.issuers.forEach((issuer) => {
    const btn = document.createElement("button");
    btn.className = `tab-btn ${state.activeFilter === issuer.id ? "active" : ""}`;
    btn.dataset.filter = issuer.id;
    btn.textContent = issuer.name;
    btn.addEventListener("click", () => setFilter(issuer.id));
    container.appendChild(btn);
  });
}

function setFilter(filterId) {
  state.activeFilter = filterId;
  renderFilterTabs();
  renderIssuers();
}

// ---------- Sort ----------

function getSortedIssuers(issuers) {
  return [...issuers].sort((a, b) => {
    if (state.sortBy === "marketcap") {
      return computeIssuerMarketCap(b) - computeIssuerMarketCap(a);
    }
    if (state.sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (state.sortBy === "founded") {
      return a.founded - b.founded;
    }
    return 0;
  });
}

// ---------- Search Filter ----------

function matchesSearch(issuer, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (issuer.name.toLowerCase().includes(q)) return true;
  if (issuer.description && issuer.description.toLowerCase().includes(q)) return true;
  return issuer.stablecoins.some(
    (sc) =>
      sc.ticker.toLowerCase().includes(q) ||
      sc.name.toLowerCase().includes(q) ||
      sc.blockchains.some((b) => b.toLowerCase().includes(q)) ||
      sc.type.toLowerCase().includes(q)
  );
}

// ---------- Render Issuers ----------

function renderIssuers() {
  const container = document.getElementById("issuers-container");
  const noResults = document.getElementById("no-results");
  container.innerHTML = "";

  let issuers = STABLECOIN_DATA.issuers;

  if (state.activeFilter !== "all") {
    issuers = issuers.filter((i) => i.id === state.activeFilter);
  }

  if (state.searchQuery) {
    issuers = issuers.filter((i) => matchesSearch(i, state.searchQuery));
  }

  issuers = getSortedIssuers(issuers);

  if (issuers.length === 0) {
    noResults.classList.remove("hidden");
    return;
  }

  noResults.classList.add("hidden");

  issuers.forEach((issuer) => {
    const card = buildIssuerCard(issuer);
    container.appendChild(card);
  });
}

// ---------- Build Issuer Card ----------

function buildIssuerCard(issuer) {
  const isExpanded = state.expandedIssuers.has(issuer.id);
  const totalMcap = computeIssuerMarketCap(issuer);

  const card = document.createElement("div");
  card.className = `issuer-card ${isExpanded ? "expanded" : ""}`;
  card.id = `issuer-${issuer.id}`;

  // ---- Header ----
  const header = document.createElement("div");
  header.className = "issuer-header";
  header.addEventListener("click", () => toggleIssuer(issuer.id));

  const regClass = getRegBadgeClass(issuer.regulatoryStatus);

  header.innerHTML = `
    <div class="issuer-header-left">
      <div class="issuer-logo" style="background-color: ${issuer.logoColor}">
        ${issuer.logo}
      </div>
      <div class="issuer-title">
        <div class="issuer-name">${issuer.name}</div>
        <div class="issuer-meta">
          <span class="issuer-hq">📍 ${issuer.headquarters}</span>
          <span class="reg-badge ${regClass}">${issuer.regulatoryStatus}</span>
          <span class="issuer-hq">Est. ${issuer.founded}</span>
        </div>
        <div class="issuer-desc">${issuer.description}</div>
      </div>
    </div>
    <div class="issuer-header-right">
      <div class="issuer-total-mcap">
        <div class="mcap-label">Market Cap</div>
        <div class="mcap-value">${formatMarketCap(totalMcap)}</div>
      </div>
      <div class="collapse-icon">▾</div>
    </div>
  `;

  card.appendChild(header);

  // ---- Body ----
  const body = document.createElement("div");
  body.className = "issuer-body";

  // Stablecoins
  const scSection = document.createElement("div");
  scSection.className = "stablecoins-section";
  scSection.innerHTML = `<div class="section-title">Stablecoins (${issuer.stablecoins.length})</div>`;

  const scGrid = document.createElement("div");
  scGrid.className = "stablecoins-grid";

  issuer.stablecoins.forEach((sc) => {
    const scCard = buildStablecoinCard(sc, issuer);
    scGrid.appendChild(scCard);
  });

  scSection.appendChild(scGrid);
  body.appendChild(scSection);

  // News
  if (issuer.news && issuer.news.length > 0) {
    const newsSection = buildNewsSection(issuer.news);
    body.appendChild(newsSection);
  }

  card.appendChild(body);
  return card;
}

function toggleIssuer(issuerId) {
  const card = document.getElementById(`issuer-${issuerId}`);
  if (!card) return;

  if (state.expandedIssuers.has(issuerId)) {
    state.expandedIssuers.delete(issuerId);
    card.classList.remove("expanded");
  } else {
    state.expandedIssuers.add(issuerId);
    card.classList.add("expanded");
  }
}

// ---------- Build Stablecoin Card ----------

function buildStablecoinCard(sc, issuer) {
  const card = document.createElement("div");
  card.className = "sc-card";
  card.addEventListener("click", (e) => {
    e.stopPropagation();
    openModal(sc, issuer);
  });

  const maxChains = 5;
  const chains = sc.blockchains || [];
  const visibleChains = chains.slice(0, maxChains);
  const moreCount = chains.length - maxChains;

  const chainChips = visibleChains
    .map((c) => `<span class="chain-chip">${c}</span>`)
    .join("");
  const moreChip =
    moreCount > 0
      ? `<span class="chain-chip more">+${moreCount} more</span>`
      : "";

  const badges = [];
  if (sc.isNew) badges.push(`<span class="badge badge-new">New</span>`);
  if (sc.status === "legacy") badges.push(`<span class="badge badge-legacy">Legacy</span>`);
  badges.push(`<span class="badge badge-type">${sc.type}</span>`);

  card.innerHTML = `
    <div class="sc-card-top">
      <div class="sc-ticker-wrap">
        <div>
          <div class="sc-ticker">${sc.ticker}</div>
          <div class="sc-name">${sc.name}</div>
        </div>
      </div>
      <div class="sc-badges">${badges.join("")}</div>
    </div>
    <div class="sc-mcap">
      ${formatMarketCap(sc.marketCap)}
      <span class="sc-mcap-label">market cap</span>
    </div>
    <div class="chains-label">Blockchains</div>
    <div class="chains-list">
      ${chainChips}${moreChip}
    </div>
  `;

  return card;
}

// ---------- Build News Section ----------

function buildNewsSection(newsItems) {
  const section = document.createElement("div");
  section.className = "news-section";

  const title = document.createElement("div");
  title.className = "section-title";
  title.textContent = `Recent News`;
  section.appendChild(title);

  const list = document.createElement("div");
  list.className = "news-list";

  newsItems.forEach((item) => {
    const el = document.createElement("div");
    el.className = "news-item";

    const tags = (item.tags || [])
      .map((t) => `<span class="news-tag">${t}</span>`)
      .join("");

    const headlineHtml = item.url
      ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="news-headline-link">${item.headline}</a>`
      : `<span>${item.headline}</span>`;

    el.innerHTML = `
      <div class="news-date-col">
        <div class="news-date">${formatDate(item.date)}</div>
      </div>
      <div class="news-content">
        <div class="news-headline">${headlineHtml}</div>
        <div class="news-summary">${item.summary}</div>
        <div class="news-tags">${tags}</div>
      </div>
    `;
    list.appendChild(el);
  });

  section.appendChild(list);
  return section;
}

// ---------- Rankings Table ----------

function renderRankingsTable() {
  const tbody = document.getElementById("rankings-tbody");
  tbody.innerHTML = "";

  // Flatten all stablecoins with issuer context
  const allCoins = [];
  STABLECOIN_DATA.issuers.forEach((issuer) => {
    issuer.stablecoins.forEach((sc) => {
      allCoins.push({ ...sc, issuerName: issuer.name, issuerId: issuer.id });
    });
  });

  // Sort by market cap descending; null/0 values go to the bottom
  allCoins.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

  const totalMcap = allCoins.reduce((sum, c) => sum + (c.marketCap || 0), 0);

  allCoins.forEach((coin, idx) => {
    const hasMarketCap = coin.marketCap && coin.marketCap > 0;
    const share = hasMarketCap ? (coin.marketCap / totalMcap) * 100 : 0;
    const shareLabel = hasMarketCap
      ? (share < 0.1 ? "<0.1%" : share.toFixed(1) + "%")
      : "—";

    const statusBadge = coin.isNew
      ? `<span class="badge badge-new" style="margin-left:5px">New</span>`
      : coin.status === "legacy"
      ? `<span class="badge badge-legacy" style="margin-left:5px">Legacy</span>`
      : "";

    // coin.issuer overrides the parent issuer name (e.g. USDtb → Anchorage Digital Bank)
    const displayIssuer = coin.issuer || coin.issuerName;

    const tr = document.createElement("tr");
    tr.classList.add("rankings-row");
    tr.addEventListener("click", () => {
      const issuer = STABLECOIN_DATA.issuers.find((i) => i.id === coin.issuerId);
      if (issuer) openModal(coin, issuer);
    });

    tr.innerHTML = `
      <td class="col-rank">${idx + 1}</td>
      <td class="col-ticker">
        <span class="rt-ticker">${coin.ticker}</span>${statusBadge}
      </td>
      <td class="col-name"><span class="rt-name">${coin.name}</span></td>
      <td class="col-issuer rt-issuer">${displayIssuer}</td>
      <td class="col-peg rt-peg">${coin.peg}</td>
      <td class="col-type">
        <span class="badge badge-type rt-type">${coin.type}</span>
      </td>
      <td class="col-manager rt-manager">${coin.reserveManager || "—"}</td>
      <td class="col-custodian rt-custodian">${coin.custodian || "—"}</td>
      <td class="col-mcap rt-mcap">${formatMarketCap(coin.marketCap)}</td>
      <td class="col-share">
        <div class="share-cell">
          <div class="share-bar-wrap">
            <div class="share-bar" style="width: ${Math.min(share, 100)}%"></div>
          </div>
          <span class="share-pct">${shareLabel}</span>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// ---------- Modal ----------

function openModal(sc, issuer) {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");

  const chains = (sc.blockchains || [])
    .map((c) => `<span class="modal-chain-chip">${c}</span>`)
    .join("");

  const launched = sc.launched ? formatDate(sc.launched) : "Unknown";

  body.innerHTML = `
    <div class="modal-header">
      <div class="modal-ticker">${sc.ticker}</div>
      <div class="modal-name">${sc.name} · Issued by ${issuer.name}</div>
    </div>
    <div class="modal-body-inner">
      <div class="modal-section">
        <div class="modal-section-title">Key Info</div>
        <div class="modal-info-grid">
          <div class="modal-info-item">
            <div class="modal-info-label">Market Cap</div>
            <div class="modal-info-value">${formatMarketCap(sc.marketCap)}</div>
          </div>
          <div class="modal-info-item">
            <div class="modal-info-label">Peg</div>
            <div class="modal-info-value">${sc.peg}</div>
          </div>
          <div class="modal-info-item">
            <div class="modal-info-label">Type</div>
            <div class="modal-info-value">${sc.type}</div>
          </div>
          <div class="modal-info-item">
            <div class="modal-info-label">Status</div>
            <div class="modal-info-value" style="text-transform: capitalize">${sc.status}</div>
          </div>
          <div class="modal-info-item">
            <div class="modal-info-label">Launch Date</div>
            <div class="modal-info-value">${launched}</div>
          </div>
          <div class="modal-info-item">
            <div class="modal-info-label">Blockchain Count</div>
            <div class="modal-info-value">${sc.blockchains.length}</div>
          </div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Collateral / Reserves</div>
        <div class="modal-reserves">${sc.reserves}</div>
      </div>

      ${sc.reserveManager ? `
      <div class="modal-section">
        <div class="modal-section-title">Reserve Manager</div>
        <div class="modal-reserves">${sc.reserveManager}</div>
      </div>` : ""}

      <div class="modal-section">
        <div class="modal-section-title">Supported Blockchains (${sc.blockchains.length})</div>
        <div class="modal-chains-grid">${chains}</div>
      </div>

      ${sc.note ? `
      <div class="modal-section">
        <div class="modal-section-title">Note</div>
        <div class="modal-reserves">${sc.note}</div>
      </div>` : ""}
    </div>
  `;

  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.body.style.overflow = "";
}

// ---------- Event Listeners ----------

function initEventListeners() {
  // Theme toggle
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

  // View switcher
  document.querySelectorAll(".page-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  // Search
  document.getElementById("search-input").addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim();
    renderIssuers();
  });

  // Sort
  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderIssuers();
  });

  // Modal close
  document.getElementById("modal-close").addEventListener("click", closeModal);

  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Keyboard escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Export / Import
  document.getElementById("export-btn").addEventListener("click", downloadCSV);
  document.getElementById("excel-upload").addEventListener("change", (e) => {
    if (e.target.files[0]) handleImport(e.target.files[0]);
    e.target.value = ""; // reset so same file can be re-uploaded
  });
}

// ---------- CSV Export ----------

function csvEscape(val) {
  const s = String(val ?? "");
  return (s.includes(",") || s.includes('"') || s.includes("\n"))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function buildCSV(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function downloadCSV() {
  const coinHeaders = [
    "Ticker", "Name", "Parent Issuer", "Legal Issuer", "Peg", "Type",
    "Status", "Market Cap (USD)", "Asset Manager", "Custodian",
    "Reserves Description", "Launched", "Blockchains", "Is New",
  ];
  const coinRows = [coinHeaders];
  STABLECOIN_DATA.issuers.forEach((issuer) => {
    issuer.stablecoins.forEach((sc) => {
      coinRows.push([
        sc.ticker,
        sc.name,
        issuer.name,
        sc.issuer || issuer.name,
        sc.peg,
        sc.type,
        sc.status || "active",
        sc.marketCap !== null && sc.marketCap !== undefined ? sc.marketCap : "",
        sc.reserveManager || "",
        sc.custodian || "",
        sc.reserves || "",
        sc.launched || "",
        (sc.blockchains || []).join(", "),
        sc.isNew ? "Yes" : "No",
      ]);
    });
  });

  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([buildCSV(coinRows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stablecoin-data-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Import (CSV or Excel) ----------

function handleImport(file) {
  const isCSV = file.name.toLowerCase().endsWith(".csv");
  if (isCSV) {
    handleCSVImport(file);
  } else {
    handleExcelUpload(file);
  }
}

function handleCSVImport(file) {
  if (typeof XLSX === "undefined") {
    alert("Spreadsheet library not loaded. Check your internet connection.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      // Use XLSX to parse CSV: handles UTF-8 BOM, quoted fields, and
      // multiline cells that a line-by-line parser would mishandle.
      const wb = XLSX.read(e.target.result, { type: "string" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) throw new Error("Empty file");

      const h = rows[0];
      const col = (name) => h.indexOf(name);
      let updatedCoins = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const ticker = row[col("Ticker")];
        if (!ticker) continue;

        for (const issuer of STABLECOIN_DATA.issuers) {
          const sc = issuer.stablecoins.find((s) => s.ticker === ticker);
          if (!sc) continue;

          const set = (field, idx, transform) => {
            const val = row[idx];
            if (val !== undefined && val !== "") {
              sc[field] = transform ? transform(val) : val;
            }
          };

          set("name", col("Name"));
          set("marketCap", col("Market Cap (USD)"), (v) => (v === "" ? null : Number(v) || null));
          set("type", col("Type"));
          set("status", col("Status"));
          set("reserveManager", col("Asset Manager"));
          set("custodian", col("Custodian"));
          set("reserves", col("Reserves Description"));
          set("peg", col("Peg"));

          const legalIssuer = row[col("Legal Issuer")];
          if (legalIssuer && legalIssuer !== issuer.name) {
            sc.issuer = legalIssuer;
          } else if (legalIssuer === issuer.name) {
            delete sc.issuer;
          }

          const chains = row[col("Blockchains")];
          if (chains) {
            sc.blockchains = String(chains).split(",").map((c) => c.trim()).filter(Boolean);
          }

          updatedCoins++;
          break;
        }
      }

      STABLECOIN_DATA.stats.totalMarketCap = STABLECOIN_DATA.issuers.reduce(
        (sum, iss) => sum + iss.stablecoins.reduce((s, sc) => s + (sc.marketCap || 0), 0), 0
      );
      STABLECOIN_DATA.stats.uniqueBlockchains = [
        ...new Set(STABLECOIN_DATA.issuers.flatMap((iss) => iss.stablecoins.flatMap((sc) => sc.blockchains))),
      ];

      renderStats();
      renderFilterTabs();
      renderIssuers();
      renderRankingsTable();
      showImportBanner(updatedCoins, 0, 0);
    } catch (err) {
      alert(`Import failed: ${err.message}\n\nMake sure you are uploading a CSV exported from this dashboard.`);
    }
  };
  reader.readAsText(file);
}

function handleExcelUpload(file) {
  if (typeof XLSX === "undefined") {
    alert("Spreadsheet library not loaded. Check your internet connection.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });

      let updatedCoins = 0;
      let updatedIssuers = 0;
      let updatedNews = 0;

      // --- Update Stablecoins sheet ---
      const wsCoins = wb.Sheets["Stablecoins"];
      if (wsCoins) {
        const rows = XLSX.utils.sheet_to_json(wsCoins, { header: 1 });
        if (rows.length >= 2) {
          const h = rows[0];
          const col = (name) => h.indexOf(name);

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const ticker = row[col("Ticker")];
            if (!ticker) continue;

            for (const issuer of STABLECOIN_DATA.issuers) {
              const sc = issuer.stablecoins.find((s) => s.ticker === ticker);
              if (!sc) continue;

              const set = (field, idx, transform) => {
                const val = row[idx];
                if (val !== undefined && val !== "") {
                  sc[field] = transform ? transform(val) : val;
                }
              };

              set("name", col("Name"));
              set("marketCap", col("Market Cap (USD)"), (v) => (v === "" ? null : Number(v) || null));
              set("type", col("Type"));
              set("status", col("Status"));
              set("reserveManager", col("Asset Manager"));
              set("custodian", col("Custodian"));
              set("reserves", col("Reserves Description"));
              set("peg", col("Peg"));

              // Legal issuer override
              const legalIssuer = row[col("Legal Issuer")];
              if (legalIssuer && legalIssuer !== issuer.name) {
                sc.issuer = legalIssuer;
              } else if (legalIssuer === issuer.name) {
                delete sc.issuer;
              }

              // Blockchains
              const chains = row[col("Blockchains")];
              if (chains) {
                sc.blockchains = chains.split(",").map((c) => c.trim()).filter(Boolean);
              }

              updatedCoins++;
              break;
            }
          }
        }
      }

      // --- Update Issuers sheet ---
      const wsIssuers = wb.Sheets["Issuers"];
      if (wsIssuers) {
        const rows = XLSX.utils.sheet_to_json(wsIssuers, { header: 1 });
        if (rows.length >= 2) {
          const h = rows[0];
          const col = (name) => h.indexOf(name);

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const id = row[col("ID")];
            const issuer = STABLECOIN_DATA.issuers.find((iss) => iss.id === id);
            if (!issuer) continue;

            const set = (field, idx) => {
              const val = row[idx];
              if (val !== undefined && val !== "") issuer[field] = val;
            };
            set("name", col("Name"));
            set("headquarters", col("Headquarters"));
            set("website", col("Website"));
            set("regulatoryStatus", col("Regulatory Status"));
            set("description", col("Description"));
            if (row[col("Founded")]) issuer.founded = Number(row[col("Founded")]);
            updatedIssuers++;
          }
        }
      }

      // --- Update News sheet ---
      const wsNews = wb.Sheets["News"];
      if (wsNews) {
        const rows = XLSX.utils.sheet_to_json(wsNews, { header: 1 });
        if (rows.length >= 2) {
          const h = rows[0];
          const col = (name) => h.indexOf(name);

          // Group rows by issuer name
          const newsByIssuer = {};
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const issuerName = row[col("Issuer")];
            if (!issuerName) continue;
            if (!newsByIssuer[issuerName]) newsByIssuer[issuerName] = [];
            newsByIssuer[issuerName].push({
              date: row[col("Date")] || "",
              headline: row[col("Headline")] || "",
              summary: row[col("Summary")] || "",
              tags: (row[col("Tags")] || "").split(",").map((t) => t.trim()).filter(Boolean),
              url: row[col("URL")] || undefined,
            });
          }

          for (const issuer of STABLECOIN_DATA.issuers) {
            if (newsByIssuer[issuer.name]) {
              issuer.news = newsByIssuer[issuer.name];
              updatedNews++;
            }
          }
        }
      }

      // Recompute stats
      STABLECOIN_DATA.stats.totalMarketCap = STABLECOIN_DATA.issuers.reduce(
        (sum, iss) => sum + iss.stablecoins.reduce((s, sc) => s + (sc.marketCap || 0), 0), 0
      );
      STABLECOIN_DATA.stats.uniqueBlockchains = [
        ...new Set(STABLECOIN_DATA.issuers.flatMap((iss) => iss.stablecoins.flatMap((sc) => sc.blockchains))),
      ];

      // Re-render both views so rankings table always reflects imported data
      renderStats();
      renderFilterTabs();
      renderIssuers();
      renderRankingsTable();

      showImportBanner(updatedCoins, updatedIssuers, updatedNews);
    } catch (err) {
      alert(`Import failed: ${err.message}\n\nMake sure you are uploading a CSV or Excel file exported from this dashboard.`);
    }
  };
  reader.readAsArrayBuffer(file);
}

function showImportBanner(coins, issuers, news) {
  const existing = document.getElementById("import-banner");
  if (existing) existing.remove();

  const parts = [];
  if (coins) parts.push(`${coins} stablecoin${coins !== 1 ? "s" : ""}`);
  if (issuers) parts.push(`${issuers} issuer${issuers !== 1 ? "s" : ""}`);
  if (news) parts.push(`news for ${news} issuer${news !== 1 ? "s" : ""}`);
  const summary = parts.length ? parts.join(", ") : "no records";

  const banner = document.createElement("div");
  banner.id = "import-banner";
  banner.className = "import-banner";
  banner.innerHTML = `
    <span class="import-banner-icon">✓</span>
    <span class="import-banner-text">Updated ${summary}. Changes are live in this session.</span>
    <button class="import-download-btn" id="download-datajs-btn">Download updated data.js</button>
    <button class="import-dismiss-btn" id="import-dismiss-btn">✕</button>
  `;

  const main = document.querySelector(".main-content");
  main.insertBefore(banner, main.firstChild);

  document.getElementById("download-datajs-btn").addEventListener("click", downloadDataJs);
  document.getElementById("import-dismiss-btn").addEventListener("click", () => banner.remove());
}

// ---------- Download updated data.js ----------

function downloadDataJs() {
  const base = { meta: STABLECOIN_DATA.meta, issuers: STABLECOIN_DATA.issuers };
  const json = JSON.stringify(base, null, 2);

  const content =
    `const STABLECOIN_DATA = ${json};\n\n` +
    `// Computed stats\n` +
    `STABLECOIN_DATA.stats = {\n` +
    `  totalIssuers: STABLECOIN_DATA.issuers.length,\n` +
    `  totalStablecoins: STABLECOIN_DATA.issuers.reduce(\n` +
    `    (sum, i) => sum + i.stablecoins.length,\n` +
    `    0\n` +
    `  ),\n` +
    `  totalMarketCap: STABLECOIN_DATA.issuers.reduce(\n` +
    `    (sum, i) =>\n` +
    `      sum +\n` +
    `      i.stablecoins.reduce((s, sc) => s + (sc.marketCap || 0), 0),\n` +
    `    0\n` +
    `  ),\n` +
    `  uniqueBlockchains: [\n` +
    `    ...new Set(\n` +
    `      STABLECOIN_DATA.issuers.flatMap((i) =>\n` +
    `        i.stablecoins.flatMap((sc) => sc.blockchains)\n` +
    `      )\n` +
    `    ),\n` +
    `  ],\n` +
    `};\n`;

  const blob = new Blob([content], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.js";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Init ----------

function init() {
  applyTheme(state.theme);
  renderStats();
  renderFilterTabs();

  // Expand first two issuers by default for a better first impression
  if (STABLECOIN_DATA.issuers.length > 0) {
    state.expandedIssuers.add(STABLECOIN_DATA.issuers[0].id);
    state.expandedIssuers.add(STABLECOIN_DATA.issuers[1].id);
  }

  renderIssuers();
  initEventListeners();
}

document.addEventListener("DOMContentLoaded", init);

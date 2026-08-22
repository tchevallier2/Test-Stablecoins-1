/* ============================================================
   Stablecoin Dashboard — Application Logic
   ============================================================ */

// ---------- State ----------
const VIEWS = ["issuers", "rankings", "by-type", "trends", "structure", "allocation"];

const state = {
  activeFilter: "all",
  searchQuery: "",
  sortBy: "marketcap",
  expandedIssuers: new Set(),
  // Respect the visitor's system preference on a first visit; once they use
  // the toggle, their stored choice wins.
  theme:
    localStorage.getItem("theme") ||
    (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  activeView: "issuers",
  rankingsSort: { key: "marketcap", dir: "desc" },
  trendRange: 0, // days; 0 = all available history
};

// Daily snapshots from history.json; null until loaded, and stays null when
// the file cannot be fetched (e.g. opened over file://).
let HISTORY = null;

// Venue attribution from allocations.json; null when unavailable.
let ALLOCATIONS = null;

// How each venue bucket is presented. Unattributed is deliberately last and
// neutral: it is the absence of a label, not a venue competing with the rest.
const VENUE_KINDS = {
  cex: { name: "Centralised exchanges", colorVar: "--series-1" },
  defi: { name: "DeFi protocols", colorVar: "--series-3" },
  bridge: { name: "Bridge escrow", colorVar: "--series-4" },
  unattributed: { name: "Unattributed", colorVar: "--series-unattributed" },
};

// ---------- Utilities ----------

function formatMarketCap(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
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

/** Every stablecoin, flattened, with its issuer context attached. */
function allCoins() {
  return STABLECOIN_DATA.issuers.flatMap((issuer) =>
    issuer.stablecoins.map((sc) => ({
      ...sc,
      issuerName: issuer.name,
      issuerId: issuer.id,
    }))
  );
}

// ---------- History & analytics ----------

async function loadHistory() {
  try {
    const res = await fetch("history.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (Array.isArray(payload?.snapshots) && payload.snapshots.length) {
      HISTORY = payload;
    }
  } catch (err) {
    // Most often this is a file:// origin blocking fetch. The trend views
    // explain the situation rather than rendering empty charts.
    console.warn("History unavailable:", err.message);
    HISTORY = null;
  }
}

async function loadAllocations() {
  try {
    const res = await fetch("allocations.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload?.tokens && Array.isArray(payload.venues)) ALLOCATIONS = payload;
  } catch (err) {
    console.warn("Allocations unavailable:", err.message);
    ALLOCATIONS = null;
  }
}

/** Snapshots trimmed to the active range (0 = everything we have). */
function snapshots(days = state.trendRange) {
  if (!HISTORY) return [];
  const all = HISTORY.snapshots;
  if (!days || days <= 0) return all;
  return all.slice(Math.max(0, all.length - days - 1));
}

/** Percentage change in total market cap over the trailing `days`. */
function totalChangeOver(days) {
  if (!HISTORY) return null;
  const all = HISTORY.snapshots;
  if (all.length < 2) return null;
  const latest = all[all.length - 1];
  const idx = Math.max(0, all.length - 1 - days);
  const past = all[idx];
  if (!past?.totalMarketCap || past === latest) return null;
  return (latest.totalMarketCap / past.totalMarketCap - 1) * 100;
}

/** Daily market cap series for one ticker within the active range. */
function coinSeries(ticker, days = state.trendRange) {
  return snapshots(days)
    .filter((s) => s.coins[ticker] !== undefined)
    .map((s) => ({ date: s.date, value: s.coins[ticker] }));
}

function coinChangeOver(ticker, days) {
  const series = coinSeries(ticker, days);
  if (series.length < 2) return null;
  const first = series[0].value;
  if (!first) return null;
  return (series[series.length - 1].value / first - 1) * 100;
}

/**
 * Herfindahl–Hirschman Index over market shares, expressed on the 0–10,000
 * scale that competition regulators use. Above 2,500 counts as highly
 * concentrated.
 */
function herfindahlIndex() {
  const caps = allCoins()
    .map((c) => c.marketCap || 0)
    .filter((c) => c > 0);
  const total = caps.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return caps.reduce((sum, cap) => sum + Math.pow((cap / total) * 100, 2), 0);
}

function topNShare(n) {
  const caps = allCoins()
    .map((c) => c.marketCap || 0)
    .filter((c) => c > 0)
    .sort((a, b) => b - a);
  const total = caps.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (caps.slice(0, n).reduce((a, b) => a + b, 0) / total) * 100;
}

/**
 * Market cap reachable on each chain.
 *
 * A coin is counted on every chain it is issued on, because the dataset
 * records deployments rather than per-chain supply. The totals therefore
 * overlap and deliberately sum to more than the market — this measures each
 * chain's addressable stablecoin value, not its share.
 */
function chainDistribution() {
  const byChain = new Map();
  for (const coin of allCoins()) {
    for (const chain of coin.blockchains || []) {
      const entry = byChain.get(chain) || { chain, marketCap: 0, coins: [] };
      entry.marketCap += coin.marketCap || 0;
      entry.coins.push(coin.ticker);
      byChain.set(chain, entry);
    }
  }
  return [...byChain.values()].sort((a, b) => b.marketCap - a.marketCap);
}

/** Coins that report a live price, with their distance from peg in bps. */
function pegDeviations() {
  return allCoins()
    .filter((c) => Number.isFinite(c.pegDeviationBps))
    .sort((a, b) => Math.abs(b.pegDeviationBps) - Math.abs(a.pegDeviationBps));
}

function pegSeverity(bps) {
  const abs = Math.abs(bps);
  if (abs >= 100) return { level: "critical", label: "Depegged" };
  if (abs >= 50) return { level: "serious", label: "Under strain" };
  if (abs >= 25) return { level: "warning", label: "Drifting" };
  return { level: "good", label: "On peg" };
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

  renderHeadlineDelta();
}

/** 24h change beneath the hero figure, once history is available. */
function renderHeadlineDelta() {
  const el = document.getElementById("stat-market-cap-delta");
  if (!el) return;

  const change = totalChangeOver(1);
  if (change === null) {
    el.textContent = "";
    return;
  }
  const dir = change >= 0 ? "up" : "down";
  el.className = `stat-delta ${dir}`;
  el.textContent = `${change >= 0 ? "▲" : "▼"} ${formatPercent(change)} · 24h`;
}

// ---------- View Switcher ----------

function switchView(view, { updateHash = true } = {}) {
  if (!VIEWS.includes(view)) view = "issuers";
  state.activeView = view;

  document.querySelectorAll(".page-tab").forEach((btn) => {
    const active = btn.dataset.view === view;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  for (const name of VIEWS) {
    const panel = document.getElementById(`${name}-view`);
    if (panel) panel.classList.toggle("hidden", name !== view);
  }

  if (view === "rankings") renderRankingsTable();
  if (view === "by-type") renderByTypeView();
  if (view === "trends") renderTrendsView();
  if (view === "structure") renderStructureView();
  if (view === "allocation") renderAllocationView();

  if (updateHash) {
    const target = `#${view}`;
    if (window.location.hash !== target) {
      history.replaceState(null, "", target);
    }
  }
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

  // logoColor lands in a style attribute, so it is restricted to a colour
  // literal rather than escaped — an imported CSV must not be able to inject
  // arbitrary declarations here.
  const safeColor = /^#[0-9a-f]{3,8}$|^[a-z]+$/i.test(issuer.logoColor || "")
    ? issuer.logoColor
    : "#2775CA";

  header.innerHTML = `
    <div class="issuer-header-left">
      <div class="issuer-logo" style="background-color: ${safeColor}">
        ${escapeHtml(issuer.logo)}
      </div>
      <div class="issuer-title">
        <div class="issuer-name">${escapeHtml(issuer.name)}</div>
        <div class="issuer-meta">
          <span class="issuer-hq">📍 ${escapeHtml(issuer.headquarters)}</span>
          <span class="reg-badge ${regClass}">${escapeHtml(issuer.regulatoryStatus)}</span>
          <span class="issuer-hq">Est. ${escapeHtml(issuer.founded)}</span>
        </div>
        <div class="issuer-desc">${escapeHtml(issuer.description)}</div>
      </div>
    </div>
    <div class="issuer-header-right">
      <div class="issuer-total-mcap">
        <div class="mcap-label">Market Cap</div>
        <div class="mcap-value">${escapeHtml(formatMarketCap(totalMcap))}</div>
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
    .map((c) => `<span class="chain-chip">${escapeHtml(c)}</span>`)
    .join("");
  const moreChip =
    moreCount > 0
      ? `<span class="chain-chip more">+${moreCount} more</span>`
      : "";

  const badges = [];
  if (sc.isNew) badges.push(`<span class="badge badge-new">New</span>`);
  if (sc.status === "legacy") badges.push(`<span class="badge badge-legacy">Legacy</span>`);
  badges.push(`<span class="badge badge-type">${escapeHtml(sc.type)}</span>`);

  const change30 = coinChangeOver(sc.ticker, 30);
  const trend = coinSeries(sc.ticker, 30).map((p) => p.value);
  const changeHtml =
    change30 === null
      ? ""
      : `<span class="sc-change ${change30 >= 0 ? "up" : "down"}">${escapeHtml(
          formatPercent(change30, 1)
        )} <span class="sc-change-period">30d</span></span>`;

  card.innerHTML = `
    <div class="sc-card-top">
      <div class="sc-ticker-wrap">
        <div>
          <div class="sc-ticker">${escapeHtml(sc.ticker)}</div>
          <div class="sc-name">${escapeHtml(sc.name)}</div>
        </div>
      </div>
      <div class="sc-badges">${badges.join("")}</div>
    </div>
    <div class="sc-mcap">
      ${escapeHtml(formatMarketCap(sc.marketCap))}
      <span class="sc-mcap-label">market cap</span>
    </div>
    <div class="sc-trend-row">${sparklineSvg(trend)}${changeHtml}</div>
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
      .map((t) => `<span class="news-tag">${escapeHtml(t)}</span>`)
      .join("");

    // Only http(s) links are rendered as anchors, so an imported sheet cannot
    // smuggle in a javascript: URL.
    const safeUrl = /^https?:\/\//i.test(item.url || "") ? item.url : null;
    const headlineHtml = safeUrl
      ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="news-headline-link">${escapeHtml(
          item.headline
        )}</a>`
      : `<span>${escapeHtml(item.headline)}</span>`;

    el.innerHTML = `
      <div class="news-date-col">
        <div class="news-date">${escapeHtml(formatDate(item.date))}</div>
      </div>
      <div class="news-content">
        <div class="news-headline">${headlineHtml}</div>
        <div class="news-summary">${escapeHtml(item.summary)}</div>
        <div class="news-tags">${tags}</div>
      </div>
    `;
    list.appendChild(el);
  });

  section.appendChild(list);
  return section;
}

// ---------- By Type View ----------

const TYPE_GROUPS = [
  {
    label: "Payment Stablecoins",
    description: "Fiat-collateralized stablecoins pegged to currencies",
    match: (type) => /fiat|yield|rwa/i.test(type) && !/commodity/i.test(type),
  },
  {
    label: "Crypto-Collateralized",
    description: "Stablecoins backed by crypto assets, synthetic positions, or algorithmic mechanisms",
    match: (type) => /crypto|algorithmic|synthetic|hybrid/i.test(type),
  },
  {
    label: "Commodity-Backed",
    description: "Stablecoins pegged to physical commodities such as gold",
    match: (type) => /commodity/i.test(type),
  },
];

function renderByTypeView() {
  const container = document.getElementById("by-type-container");
  container.innerHTML = "";

  const coinsWithIssuer = allCoins();
  const totalMcap = coinsWithIssuer.reduce((sum, c) => sum + (c.marketCap || 0), 0);

  TYPE_GROUPS.forEach((group) => {
    const coins = coinsWithIssuer
      .filter((c) => group.match(c.type))
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

    if (coins.length === 0) return;

    const groupMcap = coins.reduce((sum, c) => sum + (c.marketCap || 0), 0);

    const section = document.createElement("div");
    section.className = "type-group";

    section.innerHTML = `
      <div class="type-group-header">
        <div class="type-group-title-wrap">
          <h2 class="type-group-title">${escapeHtml(group.label)}</h2>
          <p class="type-group-desc">${escapeHtml(group.description)}</p>
        </div>
        <div class="type-group-stats">
          <div class="type-group-mcap">${escapeHtml(formatMarketCap(groupMcap))}</div>
          <div class="type-group-count">${coins.length} stablecoin${coins.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
      <div class="rankings-wrap">
        <table class="rankings-table">
          <thead>
            <tr>
              <th class="col-rank">#</th>
              <th class="col-ticker">Ticker</th>
              <th class="col-name">Name</th>
              <th class="col-issuer">Issuer</th>
              <th class="col-peg">Peg</th>
              <th class="col-manager">Asset Manager</th>
              <th class="col-custodian">Custodian</th>
              <th class="col-mcap">Market Cap</th>
              <th class="col-share">% Share</th>
            </tr>
          </thead>
          <tbody class="type-tbody"></tbody>
        </table>
      </div>
    `;

    const tbody = section.querySelector(".type-tbody");

    coins.forEach((coin, idx) => {
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

      const displayIssuer = coin.issuer || coin.issuerName;

      const tr = document.createElement("tr");
      tr.className = "rankings-row";
      tr.addEventListener("click", () => {
        const issuer = STABLECOIN_DATA.issuers.find((i) => i.id === coin.issuerId);
        if (issuer) openModal(coin, issuer);
      });

      tr.innerHTML = `
        <td class="col-rank">${idx + 1}</td>
        <td class="col-ticker">
          <span class="rt-ticker">${escapeHtml(coin.ticker)}</span>${statusBadge}
        </td>
        <td class="col-name"><span class="rt-name">${escapeHtml(coin.name)}</span></td>
        <td class="col-issuer rt-issuer">${escapeHtml(displayIssuer)}</td>
        <td class="col-peg rt-peg">${escapeHtml(coin.peg)}</td>
        <td class="col-manager rt-manager">${escapeHtml(coin.reserveManager || "—")}</td>
        <td class="col-custodian rt-custodian">${escapeHtml(coin.custodian || "—")}</td>
        <td class="col-mcap rt-mcap">${escapeHtml(formatMarketCap(coin.marketCap))}</td>
        <td class="col-share">
          <div class="share-cell">
            <div class="share-bar-wrap">
              <div class="share-bar" style="width: ${Math.min(share, 100)}%"></div>
            </div>
            <span class="share-pct">${escapeHtml(shareLabel)}</span>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    container.appendChild(section);
  });
}

// ---------- Rankings Table ----------

const RANKINGS_SORTERS = {
  marketcap: (a, b) => (b.marketCap || 0) - (a.marketCap || 0),
  ticker: (a, b) => a.ticker.localeCompare(b.ticker),
  name: (a, b) => a.name.localeCompare(b.name),
  issuer: (a, b) =>
    (a.issuer || a.issuerName).localeCompare(b.issuer || b.issuerName),
  type: (a, b) => (a.type || "").localeCompare(b.type || ""),
  change: (a, b) => (b.change30d ?? -Infinity) - (a.change30d ?? -Infinity),
};

function renderRankingsTable() {
  const tbody = document.getElementById("rankings-tbody");
  tbody.innerHTML = "";

  const coins = allCoins().map((coin) => ({
    ...coin,
    change30d: coinChangeOver(coin.ticker, 30),
    series: coinSeries(coin.ticker, 30).map((p) => p.value),
  }));

  const { key, dir } = state.rankingsSort;
  const sorter = RANKINGS_SORTERS[key] || RANKINGS_SORTERS.marketcap;
  coins.sort(sorter);
  if (dir === "asc") coins.reverse();

  const totalMcap = coins.reduce((sum, c) => sum + (c.marketCap || 0), 0);

  document.querySelectorAll("#rankings-head .sortable").forEach((th) => {
    const active = th.dataset.sort === key;
    th.classList.toggle("sorted", active);
    th.setAttribute("aria-sort", active ? (dir === "asc" ? "ascending" : "descending") : "none");
  });

  coins.forEach((coin, idx) => {
    const hasMarketCap = coin.marketCap && coin.marketCap > 0;
    const share = hasMarketCap ? (coin.marketCap / totalMcap) * 100 : 0;
    const shareLabel = hasMarketCap
      ? share < 0.1
        ? "<0.1%"
        : share.toFixed(1) + "%"
      : "—";

    const statusBadge = coin.isNew
      ? `<span class="badge badge-new" style="margin-left:5px">New</span>`
      : coin.status === "legacy"
      ? `<span class="badge badge-legacy" style="margin-left:5px">Legacy</span>`
      : "";

    // coin.issuer overrides the parent issuer name (e.g. USDtb → Anchorage Digital Bank)
    const displayIssuer = coin.issuer || coin.issuerName;

    const changeClass =
      coin.change30d === null || coin.change30d === undefined
        ? "muted"
        : coin.change30d >= 0
        ? "up"
        : "down";

    const tr = document.createElement("tr");
    tr.classList.add("rankings-row");
    tr.tabIndex = 0;
    tr.addEventListener("click", () => {
      const issuer = STABLECOIN_DATA.issuers.find((i) => i.id === coin.issuerId);
      if (issuer) openModal(coin, issuer);
    });
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tr.click();
      }
    });

    tr.innerHTML = `
      <td class="col-rank">${idx + 1}</td>
      <td class="col-ticker">
        <span class="rt-ticker">${escapeHtml(coin.ticker)}</span>${statusBadge}
      </td>
      <td class="col-name"><span class="rt-name">${escapeHtml(coin.name)}</span></td>
      <td class="col-issuer rt-issuer">${escapeHtml(displayIssuer)}</td>
      <td class="col-peg rt-peg">${escapeHtml(coin.peg)}</td>
      <td class="col-type">
        <span class="badge badge-type rt-type">${escapeHtml(coin.type)}</span>
      </td>
      <td class="col-manager rt-manager">${escapeHtml(coin.reserveManager || "—")}</td>
      <td class="col-custodian rt-custodian">${escapeHtml(coin.custodian || "—")}</td>
      <td class="col-trend">${sparklineSvg(coin.series)}</td>
      <td class="col-change ${changeClass}">${escapeHtml(
      coin.change30d === null || coin.change30d === undefined
        ? "—"
        : formatPercent(coin.change30d, 1)
    )}</td>
      <td class="col-mcap rt-mcap">${escapeHtml(formatMarketCap(coin.marketCap))}</td>
      <td class="col-share">
        <div class="share-cell">
          <div class="share-bar-wrap">
            <div class="share-bar" style="width: ${Math.min(share, 100)}%"></div>
          </div>
          <span class="share-pct">${escapeHtml(shareLabel)}</span>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// ---------- Trends View ----------

function notice(title, bodyHtml) {
  return `
    <div class="notice">
      <span class="notice-icon">◔</span>
      <div>
        <p class="notice-title">${escapeHtml(title)}</p>
        <p class="notice-body">${bodyHtml}</p>
      </div>
    </div>`;
}

function historyNotice(message) {
  return notice(
    message,
    `Daily snapshots live in <code>history.json</code>. If you opened this page
     directly from disk, the browser blocks reading it — serve the folder over
     HTTP instead (<code>python3 -m http.server</code>).`
  );
}

function renderTrendsView() {
  const deltaGrid = document.getElementById("delta-grid");
  const rangeDesc = document.getElementById("trends-range-desc");

  if (!HISTORY) {
    deltaGrid.innerHTML = historyNotice("Historical data is not available.");
    ["chart-total", "chart-indexed", "chart-gainers", "chart-losers"].forEach((id) => {
      document.getElementById(id).innerHTML = "";
    });
    rangeDesc.textContent = "";
    return;
  }

  const points = snapshots().map((s) => ({ date: s.date, value: s.totalMarketCap }));
  const windowDays = points.length - 1;

  rangeDesc.textContent = `${points.length} daily snapshots, ${shortDate(
    points[0].date
  )} → ${shortDate(points[points.length - 1].date)}.`;

  // ---- Delta tiles ----
  const periods = [
    { label: "24 hours", days: 1 },
    { label: "7 days", days: 7 },
    { label: "30 days", days: 30 },
    { label: "Full history", days: HISTORY.snapshots.length - 1 },
  ];

  deltaGrid.innerHTML = periods
    .map(({ label, days }) => {
      const change = totalChangeOver(days);
      if (change === null) {
        return `<div class="delta-tile"><div class="delta-label">${escapeHtml(
          label
        )}</div><div class="delta-value muted">—</div></div>`;
      }
      const dir = change >= 0 ? "up" : "down";
      const latest = HISTORY.snapshots[HISTORY.snapshots.length - 1].totalMarketCap;
      const abs = latest - latest / (1 + change / 100);
      return `
        <div class="delta-tile">
          <div class="delta-label">${escapeHtml(label)}</div>
          <div class="delta-value ${dir}">${escapeHtml(formatPercent(change))}</div>
          <div class="delta-abs">${change >= 0 ? "+" : "−"}${escapeHtml(
        formatMarketCap(Math.abs(abs))
      )}</div>
        </div>`;
    })
    .join("");

  // ---- Total market cap over time ----
  renderTimeSeries(document.getElementById("chart-total"), {
    points,
    title: "Total stablecoin market cap",
    subtitle: `Sum of all tracked stablecoins, daily. Hover for any day's value.`,
    format: formatMarketCap,
  });

  // ---- Indexed comparison ----
  // Selected by how much each coin actually moved, not by size. Picking the
  // largest coins fills the chart with near-flat lines — the majors move less
  // than 3% over a range like this — and buries the coins that did something.
  // A floor keeps out tiny coins whose percentages swing on noise.
  const MIN_CAP_FOR_TREND = 100e6;

  const movers = allCoins()
    .filter((c) => c.marketCap >= MIN_CAP_FOR_TREND)
    .map((c) => ({
      name: c.ticker,
      points: coinSeries(c.ticker),
      change: coinChangeOver(c.ticker, windowDays),
    }))
    .filter((s) => s.points.length >= 2 && Number.isFinite(s.change))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6);

  renderIndexedLines(document.getElementById("chart-indexed"), {
    series: movers,
    title: "Biggest movers, indexed to a common base",
    subtitle: `The six stablecoins over ${formatMarketCap(
      MIN_CAP_FOR_TREND
    )} that moved most this range. Each starts at 100, so a $180B coin and a $200M one are directly comparable — the axis is percent change, not dollars.`,
  });

  // ---- Growth leaders and laggards ----
  const changes = allCoins()
    .filter((c) => c.marketCap > 0)
    .map((c) => ({
      label: c.ticker,
      value: coinChangeOver(c.ticker, windowDays),
      detail: `${c.name} · ${formatMarketCap(c.marketCap)}`,
    }))
    .filter((c) => c.value !== null && Number.isFinite(c.value));

  changes.sort((a, b) => b.value - a.value);
  const rangeLabel = state.trendRange ? `${state.trendRange}-day` : "full-history";

  renderDivergingBars(document.getElementById("chart-gainers"), {
    items: changes.slice(0, 6),
    title: "Fastest growing",
    subtitle: `Largest ${rangeLabel} market cap gains.`,
  });

  renderDivergingBars(document.getElementById("chart-losers"), {
    items: changes.slice(-6).reverse(),
    title: "Largest contractions",
    subtitle: `Largest ${rangeLabel} market cap declines.`,
  });
}

// ---------- Market Structure View ----------

function renderStructureView() {
  const grid = document.getElementById("concentration-grid");
  const coins = allCoins().filter((c) => c.marketCap > 0);
  const total = coins.reduce((sum, c) => sum + c.marketCap, 0);
  const hhi = herfindahlIndex();
  const largest = coins.slice().sort((a, b) => b.marketCap - a.marketCap)[0];

  const hhiVerdict =
    hhi === null ? "" : hhi > 2500 ? "Highly concentrated" : hhi > 1500 ? "Moderately concentrated" : "Competitive";

  grid.innerHTML = `
    <div class="delta-tile">
      <div class="delta-label">Herfindahl index</div>
      <div class="delta-value">${hhi === null ? "—" : escapeHtml(Math.round(hhi).toLocaleString())}</div>
      <div class="delta-abs">${escapeHtml(hhiVerdict)}</div>
    </div>
    <div class="delta-tile">
      <div class="delta-label">Top 3 share</div>
      <div class="delta-value">${escapeHtml((topNShare(3) ?? 0).toFixed(1))}%</div>
      <div class="delta-abs">of tracked market cap</div>
    </div>
    <div class="delta-tile">
      <div class="delta-label">Largest stablecoin</div>
      <div class="delta-value">${escapeHtml(largest?.ticker ?? "—")}</div>
      <div class="delta-abs">${escapeHtml(
        largest ? `${((largest.marketCap / total) * 100).toFixed(1)}% of market` : ""
      )}</div>
    </div>
    <div class="delta-tile">
      <div class="delta-label">Coins with live pricing</div>
      <div class="delta-value">${escapeHtml(String(pegDeviations().length))}</div>
      <div class="delta-abs">of ${escapeHtml(String(coins.length))} tracked</div>
    </div>
  `;

  // ---- Peg stability ----
  const pegs = pegDeviations();
  const pegCard = document.getElementById("chart-peg");

  if (!pegs.length) {
    pegCard.innerHTML = `
      <div class="chart-figure">
        <figcaption class="chart-caption">
          <span class="chart-title">Peg stability</span>
          <span class="chart-subtitle">How far each stablecoin trades from its own peg.</span>
        </figcaption>
        ${notice(
          "Live pricing has not been collected yet.",
          `Peg deviation is measured against each coin's own unit — dollars for
           USD-pegged coins, euros for <strong>EURC</strong>, a troy ounce for
           <strong>PAXG</strong> and <strong>XAUT</strong>. Prices arrive with the
           next scheduled data run, and this panel fills in automatically.`
        )}
      </div>`;
  } else {
    renderDivergingBars(pegCard, {
      items: pegs.map((c) => ({
        label: c.ticker,
        value: c.pegDeviationBps,
        detail: `${c.name} · ${pegSeverity(c.pegDeviationBps).label} · priced in ${
          c.priceUnit || "USD"
        }`,
      })),
      title: "Peg stability",
      subtitle:
        "Distance from peg in basis points. Each coin is priced in its own peg unit, so gold- and euro-backed coins are judged fairly.",
      unit: " bps",
    });
  }

  // ---- Chain distribution ----
  const chains = chainDistribution().slice(0, 12);
  renderBars(document.getElementById("chart-chains"), {
    items: chains.map((c) => ({
      label: c.chain,
      value: c.marketCap,
      detail: `${c.coins.length} stablecoin${c.coins.length !== 1 ? "s" : ""}: ${c.coins
        .slice(0, 6)
        .join(", ")}${c.coins.length > 6 ? "…" : ""}`,
    })),
    title: "Stablecoin value deployed per chain",
    subtitle:
      "A coin counts on every chain it is issued on, so these overlap and sum to more than the market — this is each chain's addressable value, not its share.",
    format: formatMarketCap,
  });

  // ---- Composition by type ----
  const byType = new Map();
  for (const coin of coins) {
    const entry = byType.get(coin.type) || { type: coin.type, marketCap: 0, count: 0 };
    entry.marketCap += coin.marketCap;
    entry.count++;
    byType.set(coin.type, entry);
  }

  renderBars(document.getElementById("chart-types"), {
    items: [...byType.values()]
      .sort((a, b) => b.marketCap - a.marketCap)
      .map((t) => ({
        label: t.type,
        value: t.marketCap,
        detail: `${t.count} coin${t.count !== 1 ? "s" : ""} · ${(
          (t.marketCap / total) *
          100
        ).toFixed(1)}% of market`,
      })),
    title: "Market cap by collateral type",
    subtitle: "Each coin counted once, so these sum to the whole market.",
    format: formatMarketCap,
  });
}

// ---------- Allocation View ----------

/**
 * Where supply actually sits, per coin.
 *
 * The residual leads rather than hides: most supply is in wallets nobody has
 * labelled, and a chart that rescaled the attributed part to fill the bar
 * would imply the market is far better understood than it is.
 */
function renderAllocationView() {
  const summary = document.getElementById("allocation-summary");
  const desc = document.getElementById("allocation-desc");

  if (!ALLOCATIONS) {
    desc.textContent = "";
    summary.innerHTML = notice(
      "Venue attribution has not been collected yet.",
      `This view is built from <code>allocations.json</code>, produced by the
       weekly allocations workflow. Run it once and this fills in.`
    );
    ["chart-allocation", "chart-venues", "allocation-table", "allocation-caveats"].forEach(
      (id) => {
        document.getElementById(id).innerHTML = "";
      }
    );
    return;
  }

  const { meta, tokens, venues } = ALLOCATIONS;

  const circulating = Object.values(tokens).reduce((s, t) => s + (t.circulating || 0), 0);
  const attributed = Object.values(tokens).reduce((s, t) => s + (t.attributed || 0), 0);
  const unattributed = circulating - attributed;

  desc.textContent = `${Object.keys(tokens).sort().join(" and ")} only, from ${
    meta.source
  }, updated ${formatDate(meta.lastUpdated)}. ${meta.protocolsWithHoldings} of ${
    meta.protocolsQueried
  } venues queried hold a balance.`;

  // ---- Summary tiles ----
  const byKind = ALLOCATIONS.byKind || {};
  summary.innerHTML = `
    <div class="delta-tile">
      <div class="delta-label">Attributed to a venue</div>
      <div class="delta-value">${escapeHtml(formatMarketCap(attributed))}</div>
      <div class="delta-abs">${escapeHtml(
        ((attributed / circulating) * 100).toFixed(1)
      )}% of ${escapeHtml(formatMarketCap(circulating))} tracked supply</div>
    </div>
    <div class="delta-tile">
      <div class="delta-label">Unattributed</div>
      <div class="delta-value muted">${escapeHtml(formatMarketCap(unattributed))}</div>
      <div class="delta-abs">in wallets nobody has labelled</div>
    </div>
    <div class="delta-tile">
      <div class="delta-label">On exchanges</div>
      <div class="delta-value">${escapeHtml(formatMarketCap(byKind.cex || 0))}</div>
      <div class="delta-abs">${escapeHtml(
        venues.filter((v) => v.kind === "cex").length.toString()
      )} exchanges with identified wallets</div>
    </div>
    <div class="delta-tile">
      <div class="delta-label">In DeFi protocols</div>
      <div class="delta-value">${escapeHtml(formatMarketCap(byKind.defi || 0))}</div>
      <div class="delta-abs">${escapeHtml(
        venues.filter((v) => v.kind === "defi").length.toString()
      )} protocols, excluding bridge escrow</div>
    </div>
  `;

  // ---- Composition per coin ----
  const rows = Object.entries(tokens).map(([ticker, t]) => {
    const held = (kind) =>
      venues
        .filter((v) => v.kind === kind)
        .reduce((sum, v) => sum + (v.holdings?.[ticker] || 0), 0);

    return {
      label: ticker,
      segments: [
        { name: VENUE_KINDS.cex.name, value: held("cex"), colorVar: VENUE_KINDS.cex.colorVar },
        { name: VENUE_KINDS.defi.name, value: held("defi"), colorVar: VENUE_KINDS.defi.colorVar },
        {
          name: VENUE_KINDS.bridge.name,
          value: held("bridge"),
          colorVar: VENUE_KINDS.bridge.colorVar,
        },
        {
          name: VENUE_KINDS.unattributed.name,
          value: Math.max(0, t.unattributed || 0),
          colorVar: VENUE_KINDS.unattributed.colorVar,
        },
      ],
    };
  });

  renderStackedBars(document.getElementById("chart-allocation"), {
    rows,
    title: "Where each stablecoin sits",
    subtitle:
      "Share of total circulating supply. The grey band is supply held at addresses nobody has labelled — it is the largest single bucket, and shrinking it would misrepresent how much of the market is actually accounted for.",
    format: formatMarketCap,
    legend: Object.values(VENUE_KINDS),
  });

  // ---- Ranked venues ----
  const top = venues.slice(0, 15);
  renderBars(document.getElementById("chart-venues"), {
    items: top.map((v) => ({
      label: v.name,
      value: v.total,
      detail: `${VENUE_KINDS[v.kind]?.name || v.kind} · ${v.category || ""} · ${Object.entries(
        v.holdings || {}
      )
        .map(([k, n]) => `${k} ${formatMarketCap(n)}`)
        .join(", ")}`,
    })),
    title: "Largest venues by stablecoin balance",
    subtitle: `Top ${top.length} of ${venues.length} venues holding USDT or USDC.`,
    format: formatMarketCap,
  });

  // ---- Full table ----
  document.getElementById("allocation-table").innerHTML = `
    <div class="rankings-wrap allocation-wrap">
      <table class="rankings-table">
        <thead>
          <tr>
            <th class="col-rank">#</th>
            <th>Venue</th>
            <th>Type</th>
            <th>Category</th>
            <th class="col-mcap">USDT</th>
            <th class="col-mcap">USDC</th>
            <th class="col-mcap">Total</th>
          </tr>
        </thead>
        <tbody>
          ${venues
            .map(
              (v, i) => `
            <tr>
              <td class="col-rank">${i + 1}</td>
              <td><span class="rt-ticker">${escapeHtml(v.name)}</span></td>
              <td><span class="kind-chip kind-${escapeHtml(v.kind)}">${escapeHtml(
                VENUE_KINDS[v.kind]?.name || v.kind
              )}</span></td>
              <td class="rt-issuer">${escapeHtml(v.category || "—")}</td>
              <td class="col-mcap rt-mcap">${escapeHtml(
                v.holdings?.USDT ? formatMarketCap(v.holdings.USDT) : "—"
              )}</td>
              <td class="col-mcap rt-mcap">${escapeHtml(
                v.holdings?.USDC ? formatMarketCap(v.holdings.USDC) : "—"
              )}</td>
              <td class="col-mcap rt-mcap">${escapeHtml(formatMarketCap(v.total))}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  // ---- Caveats, stated in the UI rather than buried in the data file ----
  document.getElementById("allocation-caveats").innerHTML = `
    <div class="caveat-panel">
      <h3 class="caveat-title">How to read these numbers</h3>
      <ul class="caveat-list">
        ${(meta.caveats || []).map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
      </ul>
    </div>
  `;
}

// ---------- Modal ----------

// Element that had focus before the modal opened, so it can be restored.
let lastFocused = null;

function openModal(sc, issuer) {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");

  const chains = (sc.blockchains || [])
    .map((c) => `<span class="modal-chain-chip">${escapeHtml(c)}</span>`)
    .join("");

  const launched = sc.launched ? formatDate(sc.launched) : "Unknown";
  const series = coinSeries(sc.ticker, 0);
  const change30 = coinChangeOver(sc.ticker, 30);

  const pegBlock = Number.isFinite(sc.pegDeviationBps)
    ? (() => {
        const sev = pegSeverity(sc.pegDeviationBps);
        return `
          <div class="modal-info-item">
            <div class="modal-info-label">Peg deviation</div>
            <div class="modal-info-value">
              <span class="peg-dot ${sev.level}"></span>${escapeHtml(
          sc.pegDeviationBps.toFixed(1)
        )} bps · ${escapeHtml(sev.label)}
            </div>
          </div>`;
      })()
    : "";

  const priceBlock =
    sc.price !== undefined
      ? `<div class="modal-info-item">
           <div class="modal-info-label">Price</div>
           <div class="modal-info-value">${escapeHtml(
             Number(sc.price).toFixed(4)
           )} ${escapeHtml(sc.priceUnit || "")}</div>
         </div>`
      : "";

  const changeBlock =
    change30 !== null
      ? `<div class="modal-info-item">
           <div class="modal-info-label">30-day change</div>
           <div class="modal-info-value ${change30 >= 0 ? "up" : "down"}">${escapeHtml(
          formatPercent(change30, 1)
        )}</div>
         </div>`
      : "";

  body.innerHTML = `
    <div class="modal-header">
      <div class="modal-ticker" id="modal-title">${escapeHtml(sc.ticker)}</div>
      <div class="modal-name">${escapeHtml(sc.name)} · Issued by ${escapeHtml(
    issuer.name
  )}</div>
    </div>
    <div class="modal-body-inner">
      ${
        series.length >= 2
          ? `<div class="modal-section">
               <div class="modal-section-title">Market cap history</div>
               <div class="modal-chart" id="modal-chart"></div>
             </div>`
          : ""
      }

      <div class="modal-section">
        <div class="modal-section-title">Key Info</div>
        <div class="modal-info-grid">
          <div class="modal-info-item">
            <div class="modal-info-label">Market Cap</div>
            <div class="modal-info-value">${escapeHtml(formatMarketCap(sc.marketCap))}</div>
          </div>
          ${changeBlock}
          ${priceBlock}
          ${pegBlock}
          <div class="modal-info-item">
            <div class="modal-info-label">Peg</div>
            <div class="modal-info-value">${escapeHtml(sc.peg)}</div>
          </div>
          <div class="modal-info-item">
            <div class="modal-info-label">Type</div>
            <div class="modal-info-value">${escapeHtml(sc.type)}</div>
          </div>
          <div class="modal-info-item">
            <div class="modal-info-label">Status</div>
            <div class="modal-info-value" style="text-transform: capitalize">${escapeHtml(
              sc.status
            )}</div>
          </div>
          <div class="modal-info-item">
            <div class="modal-info-label">Launch Date</div>
            <div class="modal-info-value">${escapeHtml(launched)}</div>
          </div>
          <div class="modal-info-item">
            <div class="modal-info-label">Blockchain Count</div>
            <div class="modal-info-value">${escapeHtml(
              String((sc.blockchains || []).length)
            )}</div>
          </div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Collateral / Reserves</div>
        <div class="modal-reserves">${escapeHtml(sc.reserves || "Not disclosed")}</div>
      </div>

      ${
        sc.reserveManager
          ? `<div class="modal-section">
               <div class="modal-section-title">Reserve Manager</div>
               <div class="modal-reserves">${escapeHtml(sc.reserveManager)}</div>
             </div>`
          : ""
      }

      ${
        sc.custodian
          ? `<div class="modal-section">
               <div class="modal-section-title">Custodian</div>
               <div class="modal-reserves">${escapeHtml(sc.custodian)}</div>
             </div>`
          : ""
      }

      <div class="modal-section">
        <div class="modal-section-title">Supported Blockchains (${escapeHtml(
          String((sc.blockchains || []).length)
        )})</div>
        <div class="modal-chains-grid">${chains}</div>
      </div>

      ${
        sc.note
          ? `<div class="modal-section">
               <div class="modal-section-title">Note</div>
               <div class="modal-reserves">${escapeHtml(sc.note)}</div>
             </div>`
          : ""
      }
    </div>
  `;

  if (series.length >= 2) {
    renderTimeSeries(document.getElementById("modal-chart"), {
      points: series,
      title: `${sc.ticker} market cap`,
      subtitle: `${series.length} daily snapshots.`,
      format: formatMarketCap,
    });
  }

  lastFocused = document.activeElement;
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  document.getElementById("modal-close").focus();
}

function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  if (overlay.classList.contains("hidden")) return;
  overlay.classList.add("hidden");
  document.body.style.overflow = "";
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  lastFocused = null;
}

/** Keep Tab inside the dialog while it is open. */
function trapModalFocus(event) {
  const overlay = document.getElementById("modal-overlay");
  if (event.key !== "Tab" || overlay.classList.contains("hidden")) return;

  const focusable = overlay.querySelectorAll(
    'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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

  // Sortable rankings columns — click to sort, click again to flip direction
  document.querySelectorAll("#rankings-head .sortable").forEach((th) => {
    th.tabIndex = 0;
    const activate = () => {
      const key = th.dataset.sort;
      if (state.rankingsSort.key === key) {
        state.rankingsSort.dir = state.rankingsSort.dir === "desc" ? "asc" : "desc";
      } else {
        state.rankingsSort = { key, dir: "desc" };
      }
      renderRankingsTable();
    };
    th.addEventListener("click", activate);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });

  // Trend range picker
  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.trendRange = Number(btn.dataset.range);
      document
        .querySelectorAll(".range-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderTrendsView();
    });
  });

  // Modal close
  document.getElementById("modal-close").addEventListener("click", closeModal);

  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Keyboard: escape closes, tab stays trapped inside the dialog
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    trapModalFocus(e);
  });

  // Charts are drawn at their container's pixel width, so a resize needs a
  // redraw. Debounced, and only for the chart views.
  let resizeTimer = null;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastWidth) return; // ignore mobile scroll chrome
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.activeView === "trends") renderTrendsView();
      if (state.activeView === "structure") renderStructureView();
      if (state.activeView === "allocation") renderAllocationView();
    }, 180);
  });

  // Deep links — back/forward between views. An unrecognised hash falls back
  // to the default view rather than leaving whatever was on screen, matching
  // what a cold load of the same URL does.
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace(/^#/, "");
    const view = VIEWS.includes(hash) ? hash : "issuers";
    if (view !== state.activeView) {
      switchView(view, { updateHash: false });
    }
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

// Shared: update existing coin OR insert new one into its parent issuer.
// Returns the number of coins processed.
function processCoinsFromRows(rows) {
  if (rows.length < 2) return 0;
  const h = rows[0];
  const col = (name) => h.indexOf(name);
  let count = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const ticker = String(row[col("Ticker")] ?? "").trim();
    if (!ticker) continue;

    // --- Try to find & update an existing stablecoin ---
    let found = false;
    for (const issuer of STABLECOIN_DATA.issuers) {
      const sc = issuer.stablecoins.find((s) => s.ticker === ticker);
      if (!sc) continue;

      const set = (field, idx, transform) => {
        const val = row[idx];
        if (val !== undefined && val !== "") sc[field] = transform ? transform(val) : val;
      };
      set("name", col("Name"));
      set("marketCap", col("Market Cap (USD)"), (v) => Number(v) || null);
      set("type", col("Type"));
      set("status", col("Status"));
      set("reserveManager", col("Asset Manager"));
      set("custodian", col("Custodian"));
      set("reserves", col("Reserves Description"));
      set("peg", col("Peg"));

      const legalIssuer = row[col("Legal Issuer")];
      if (legalIssuer && legalIssuer !== issuer.name) sc.issuer = legalIssuer;
      else if (legalIssuer === issuer.name) delete sc.issuer;

      const chains = row[col("Blockchains")];
      if (chains) sc.blockchains = String(chains).split(",").map((c) => c.trim()).filter(Boolean);

      count++;
      found = true;
      break;
    }

    if (found) continue;

    // --- Insert new stablecoin into its parent issuer ---
    const parentName = String(row[col("Parent Issuer")] ?? "").trim();
    const parentIssuer = STABLECOIN_DATA.issuers.find((iss) => iss.name === parentName);
    if (!parentIssuer) continue; // unknown issuer — skip

    const mcapRaw = row[col("Market Cap (USD)")];
    const legalIssuer = String(row[col("Legal Issuer")] ?? "").trim();
    const chains = row[col("Blockchains")];

    const newCoin = {
      ticker,
      name: String(row[col("Name")] || ticker),
      peg: String(row[col("Peg")] || "USD"),
      type: String(row[col("Type")] || "fiat-backed"),
      status: String(row[col("Status")] || "active"),
      marketCap: mcapRaw !== undefined && mcapRaw !== "" ? (Number(mcapRaw) || null) : null,
      reserveManager: row[col("Asset Manager")] || null,
      custodian: row[col("Custodian")] || null,
      reserves: row[col("Reserves Description")] || null,
      launched: row[col("Launched")] ? String(row[col("Launched")]) : null,
      blockchains: chains ? String(chains).split(",").map((c) => c.trim()).filter(Boolean) : [],
      isNew: row[col("Is New")] === "Yes",
    };
    if (legalIssuer && legalIssuer !== parentName) newCoin.issuer = legalIssuer;

    parentIssuer.stablecoins.push(newCoin);
    count++;
  }

  return count;
}

function recomputeAndRender() {
  STABLECOIN_DATA.stats.totalMarketCap = STABLECOIN_DATA.issuers.reduce(
    (sum, iss) => sum + iss.stablecoins.reduce((s, sc) => s + (sc.marketCap || 0), 0), 0
  );
  STABLECOIN_DATA.stats.uniqueBlockchains = [
    ...new Set(STABLECOIN_DATA.issuers.flatMap((iss) => iss.stablecoins.flatMap((sc) => sc.blockchains))),
  ];
  renderStats();
  renderFilterTabs();
  renderIssuers();
  if (state.activeView === "rankings") renderRankingsTable();
  if (state.activeView === "by-type") renderByTypeView();
}

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
      const wb = XLSX.read(e.target.result, { type: "string" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const count = processCoinsFromRows(rows);
      recomputeAndRender();
      showImportBanner(count, 0, 0);
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
        updatedCoins = processCoinsFromRows(rows);
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

      recomputeAndRender();

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

async function init() {
  applyTheme(state.theme);
  renderStats();
  renderFilterTabs();

  // Expand the two largest issuers by default for a better first impression
  STABLECOIN_DATA.issuers
    .slice()
    .sort((a, b) => computeIssuerMarketCap(b) - computeIssuerMarketCap(a))
    .slice(0, 2)
    .forEach((issuer) => state.expandedIssuers.add(issuer.id));

  renderIssuers();
  initEventListeners();

  // History arrives asynchronously; re-render whatever depends on it once
  // it lands so the first paint is never blocked on the fetch.
  await Promise.all([loadHistory(), loadAllocations()]);
  renderHeadlineDelta();

  const initial = window.location.hash.replace(/^#/, "");
  switchView(VIEWS.includes(initial) ? initial : "issuers", { updateHash: false });
}

document.addEventListener("DOMContentLoaded", init);

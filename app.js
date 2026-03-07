// ── Stablecoin Dashboard App ───────────────────────────────────────────────

(function () {
  "use strict";

  // ── Helpers ──────────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  function setView(viewId) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const target = el("view-" + viewId);
    if (target) target.classList.add("active");
  }

  function setActiveNav(viewId, issuerId) {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    if (issuerId) {
      const match = document.querySelector(`.nav-item[data-issuer="${issuerId}"]`);
      if (match) match.classList.add("active");
    } else {
      const match = document.querySelector(`.nav-item[data-view="${viewId}"]`);
      if (match) match.classList.add("active");
    }
  }

  function updatePageTitle(title) {
    el("page-title").textContent = title;
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderChainTags(chains) {
    return chains.map(c => `<span class="chain-tag">${c}</span>`).join("");
  }

  function renderStatusPill(status) {
    const map = {
      active:     { cls: "status-active",     label: "Active" },
      announced:  { cls: "status-announced",   label: "Announced" },
      deprecated: { cls: "status-deprecated",  label: "Deprecated" },
    };
    const s = map[status] || map.active;
    return `<span class="status-pill ${s.cls}">${s.label}</span>`;
  }

  function renderNewsItem(item) {
    const issuerTag = item.issuer
      ? `<span class="news-tag">${item.issuer}</span>`
      : `<span class="news-tag">${item.tag}</span>`;
    return `
      <div class="news-item">
        <div class="news-date">${item.date}</div>
        <div class="news-content">
          <div class="news-headline">${item.headline}</div>
          <div class="news-summary">${item.summary}</div>
        </div>
        ${issuerTag}
      </div>`;
  }

  // ── Overview: Issuers grid ────────────────────────────────────────────────
  function renderIssuersGrid() {
    const grid = el("issuers-grid");
    grid.innerHTML = ISSUERS.map(issuer => {
      const tokens = issuer.stablecoins.map(s => {
        const cls = s.status === "announced" ? "token-badge announced" : "token-badge";
        return `<span class="${cls}">${s.ticker}</span>`;
      }).join("");

      return `
        <div class="issuer-card" style="--issuer-color:${issuer.color}"
             data-issuer="${issuer.id}">
          <div class="issuer-header">
            <div class="issuer-logo"
                 style="background:${issuer.color}22; color:${issuer.color}">
              ${issuer.logoText}
            </div>
            <div>
              <div class="issuer-name">${issuer.name}</div>
              <div class="issuer-type">${issuer.type}</div>
            </div>
          </div>
          <div class="issuer-stats">
            <div class="issuer-stat">
              <div class="issuer-stat-label">Market Cap</div>
              <div class="issuer-stat-value">${issuer.marketCap}</div>
            </div>
            <div class="issuer-stat">
              <div class="issuer-stat-label">Market Share</div>
              <div class="issuer-stat-value">${issuer.marketShare}%</div>
            </div>
          </div>
          <div class="issuer-tokens">${tokens}</div>
        </div>`;
    }).join("");

    // Attach click listeners
    grid.querySelectorAll(".issuer-card").forEach(card => {
      card.addEventListener("click", () => {
        showIssuerDetail(card.dataset.issuer);
      });
    });
  }

  // ── Overview: Market share bar ────────────────────────────────────────────
  function renderMarketShare() {
    const chart  = el("market-share-chart");
    const legend = el("market-share-legend");

    const total = ISSUERS.reduce((a, i) => a + i.marketShare, 0);

    chart.innerHTML = ISSUERS.map(issuer => `
      <div class="market-share-segment"
           title="${issuer.name}: ${issuer.marketShare}%"
           style="width:${(issuer.marketShare / total * 100).toFixed(2)}%; background:${issuer.color}"
           data-issuer="${issuer.id}">
      </div>`).join("");

    legend.innerHTML = ISSUERS.map(issuer => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${issuer.color}"></div>
        <span class="legend-name">${issuer.shortName}</span>
        <span class="legend-pct">${issuer.marketShare}%</span>
      </div>`).join("");

    // Click on segment → issuer detail
    chart.querySelectorAll(".market-share-segment").forEach(seg => {
      seg.addEventListener("click", () => showIssuerDetail(seg.dataset.issuer));
    });
  }

  // ── Issuer detail view ────────────────────────────────────────────────────
  function showIssuerDetail(issuerId) {
    const issuer = ISSUERS.find(i => i.id === issuerId);
    if (!issuer) return;

    setView("issuer");
    setActiveNav("issuer", issuerId);
    updatePageTitle(issuer.name);

    const newsHtml = issuer.news.map(n => renderNewsItem(n)).join("");

    const stablecoinsRows = issuer.stablecoins.map(s => `
      <tr>
        <td class="ticker-cell">${s.ticker}</td>
        <td>${s.name}</td>
        <td>${renderStatusPill(s.status)}</td>
        <td>${s.peg}</td>
        <td>${s.marketCap}</td>
        <td>${s.backing}</td>
        <td><div class="chains-list">${renderChainTags(s.chains)}</div></td>
        <td>${s.launched}</td>
        <td style="color:var(--text-muted);font-size:12px">${s.notes}</td>
      </tr>`).join("");

    el("issuer-detail").innerHTML = `
      <button class="back-btn" id="back-to-overview">← Back to overview</button>

      <div class="detail-hero" style="--issuer-color:${issuer.color}">
        <div class="detail-hero-top">
          <div class="detail-logo"
               style="background:${issuer.color}22; color:${issuer.color}">
            ${issuer.logoText}
          </div>
          <div class="detail-info">
            <div class="detail-name">${issuer.name}</div>
            <div class="detail-desc">${issuer.description}</div>
            <div class="detail-tags">
              ${issuer.tags.map(t => `<span class="detail-tag">${t}</span>`).join("")}
            </div>
          </div>
        </div>
        <div class="detail-kpis">
          <div class="detail-kpi">
            <div class="detail-kpi-label">Total Market Cap</div>
            <div class="detail-kpi-value">${issuer.marketCap}</div>
          </div>
          <div class="detail-kpi">
            <div class="detail-kpi-label">Market Share</div>
            <div class="detail-kpi-value">${issuer.marketShare}%</div>
          </div>
          <div class="detail-kpi">
            <div class="detail-kpi-label">Founded</div>
            <div class="detail-kpi-value">${issuer.founded}</div>
          </div>
          <div class="detail-kpi">
            <div class="detail-kpi-label">Headquarters</div>
            <div class="detail-kpi-value" style="font-size:14px">${issuer.headquarters}</div>
          </div>
          <div class="detail-kpi" style="grid-column: span 2">
            <div class="detail-kpi-label">Regulatory Status</div>
            <div class="detail-kpi-value" style="font-size:13px">${issuer.regulatoryStatus}</div>
          </div>
          <div class="detail-kpi" style="grid-column: span 2">
            <div class="detail-kpi-label">Stablecoins</div>
            <div class="detail-kpi-value">${issuer.stablecoins.length}</div>
          </div>
        </div>
      </div>

      <div class="stablecoins-section">
        <div class="section-title">Stablecoins</div>
        <table class="stablecoins-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Name</th>
              <th>Status</th>
              <th>Peg</th>
              <th>Market Cap</th>
              <th>Backing</th>
              <th>Blockchains</th>
              <th>Launched</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${stablecoinsRows}</tbody>
        </table>
      </div>

      <div class="detail-news">
        <div class="section-title">Recent News</div>
        ${newsHtml}
      </div>`;

    el("back-to-overview").addEventListener("click", () => {
      setView("overview");
      setActiveNav("overview");
      updatePageTitle("Overview");
    });

    // Scroll to top
    el("view-issuer").scrollTop = 0;
  }

  // ── News view ─────────────────────────────────────────────────────────────
  function renderNewsView() {
    el("news-grid").innerHTML = ALL_NEWS.map(n => renderNewsItem(n)).join("");
  }

  // ── Nav routing ───────────────────────────────────────────────────────────
  function initNav() {
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", e => {
        e.preventDefault();
        const view    = item.dataset.view;
        const issuerId = item.dataset.issuer;

        if (view === "issuer" && issuerId) {
          showIssuerDetail(issuerId);
        } else if (view === "news") {
          setView("news");
          setActiveNav("news");
          updatePageTitle("Latest News");
        } else {
          setView("overview");
          setActiveNav("overview");
          updatePageTitle("Overview");
        }
      });
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    renderIssuersGrid();
    renderMarketShare();
    renderNewsView();
    initNav();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

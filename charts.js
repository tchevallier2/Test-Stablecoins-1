/* ============================================================
   Stablecoin Dashboard — Chart primitives

   Dependency-free SVG charts. Series colours come from CSS custom
   properties (--series-1…6), so charts re-colour themselves on a theme
   switch with no JavaScript involved.
   ============================================================ */

const SVG_NS = "http://www.w3.org/2000/svg";

// ---------- Shared helpers ----------

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

/** Round an axis value up to a clean 1/1.5/2/2.5/5 × 10ⁿ number. */
function niceCeil(value) {
  if (value <= 0) return 0;
  const exp = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exp);
  const scaled = value / magnitude;
  const step = [1, 1.5, 2, 2.5, 5, 10].find((s) => scaled <= s) ?? 10;
  return step * magnitude;
}

function niceTicks(min, max, count = 4) {
  if (min === max) return [min];
  const span = niceCeil(max - min);
  const step = span / count;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    if (v >= min - step * 0.001) ticks.push(v);
  }
  return ticks;
}

function compactUsd(value) {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A chart is only as accessible as its fallback. Every chart gets a
 * screen-reader summary plus a visually hidden table of its own numbers, so
 * the data is never gated behind colour or hover.
 */
function attachA11yTable(figure, { caption, columns, rows }) {
  // The table lives inside a hidden wrapper rather than being hidden itself:
  // `height: 1px` is only a minimum on a <table>, so hiding it directly leaves
  // its full height in the page flow.
  const wrapper = document.createElement("div");
  wrapper.className = "sr-only";

  const table = document.createElement("table");
  table.className = "chart-data-table";
  table.innerHTML = `
    <caption>${escapeHtml(caption)}</caption>
    <thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr>${r.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
        )
        .join("")}
    </tbody>
  `;
  wrapper.appendChild(table);
  figure.appendChild(wrapper);
}

function makeFigure(container, { title, subtitle, ariaLabel }) {
  container.innerHTML = "";

  const figure = document.createElement("figure");
  figure.className = "chart-figure";

  if (title) {
    const cap = document.createElement("figcaption");
    cap.className = "chart-caption";
    cap.innerHTML = `
      <span class="chart-title">${escapeHtml(title)}</span>
      ${subtitle ? `<span class="chart-subtitle">${escapeHtml(subtitle)}</span>` : ""}
    `;
    figure.appendChild(cap);
  }

  const plot = document.createElement("div");
  plot.className = "chart-plot";
  plot.setAttribute("role", "img");
  plot.setAttribute("aria-label", ariaLabel || title || "chart");
  figure.appendChild(plot);

  container.appendChild(figure);
  return { figure, plot };
}

/**
 * Charts render at the container's real pixel width with a 1:1 viewBox.
 *
 * A fixed viewBox scaled down to a phone shrinks the label text with it — at
 * 390px a 900-unit viewBox renders 11px labels at about 4px. Measuring first
 * keeps text at its true size on every screen.
 */
function plotWidth(plot, min = 300) {
  return Math.max(min, Math.round(plot.clientWidth || plot.offsetWidth || 900));
}

/** Margins shrink on narrow screens so the plot area does not vanish. */
function scaleMargins(width, margins) {
  if (width >= 620) return margins;
  const factor = Math.max(0.45, width / 620);
  return {
    top: margins.top,
    bottom: margins.bottom,
    left: Math.round(margins.left * factor),
    right: Math.round(margins.right * factor),
  };
}

function makeTooltip(plot) {
  const tip = document.createElement("div");
  tip.className = "chart-tooltip hidden";
  plot.appendChild(tip);
  return tip;
}

/** Keep the tooltip inside the plot instead of letting it run off the edge. */
function positionTooltip(tip, plot, x, y) {
  const plotWidth = plot.clientWidth;
  const tipWidth = tip.offsetWidth;
  let left = x + 14;
  if (left + tipWidth > plotWidth - 4) left = x - tipWidth - 14;
  if (left < 4) left = 4;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(4, y - tip.offsetHeight - 10)}px`;
}

// ---------- Time series (single series, area + line) ----------

/**
 * points: [{ date: "YYYY-MM-DD", value: Number }]
 * A single series needs no legend — the caption names what is plotted.
 */
function renderTimeSeries(container, { points, title, subtitle, format = compactUsd }) {
  const { figure, plot } = makeFigure(container, {
    title,
    subtitle,
    ariaLabel: `${title}. Line chart of ${points.length} daily values from ${
      points[0]?.date
    } to ${points[points.length - 1]?.date}.`,
  });

  if (points.length < 2) {
    plot.innerHTML = `<p class="chart-empty">Not enough history yet — at least two daily snapshots are needed.</p>`;
    return;
  }

  const W = plotWidth(plot);
  const H = W < 620 ? 240 : 320;
  const M = scaleMargins(W, { top: 16, right: 20, bottom: 34, left: 68 });
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Pad the band so the line never rides the frame; keep zero out of it —
  // these values never approach zero and a zero baseline would flatten the shape.
  const pad = (rawMax - rawMin) * 0.18 || rawMax * 0.02;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const x = (i) => M.left + (i / (points.length - 1)) * innerW;
  const y = (v) => M.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    height: H,
    class: "chart-svg",
  });

  // Gridlines + y ticks
  for (const tick of niceTicks(yMin, yMax, W < 620 ? 3 : 4)) {
    if (tick < yMin || tick > yMax) continue;
    svg.appendChild(
      svgEl("line", {
        x1: M.left,
        x2: W - M.right,
        y1: y(tick),
        y2: y(tick),
        class: "chart-gridline",
      })
    );
    const label = svgEl("text", {
      x: M.left - 10,
      y: y(tick) + 4,
      class: "chart-axis-label",
      "text-anchor": "end",
    });
    label.textContent = format(tick);
    svg.appendChild(label);
  }

  // X ticks — fewer on narrow screens, always including the last point.
  // A regular tick sitting too close to that final label would overlap it, so
  // it is dropped rather than drawn on top.
  const xTickCount = W < 460 ? 2 : W < 620 ? 3 : 5;
  const tickEvery = Math.max(1, Math.floor((points.length - 1) / xTickCount));
  const lastX = x(points.length - 1);
  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    if (i % tickEvery !== 0 && !isLast) return;
    if (!isLast && lastX - x(i) < 44) return;
    const label = svgEl("text", {
      x: x(i),
      y: H - 12,
      class: "chart-axis-label",
      "text-anchor": isLast ? "end" : "middle",
    });
    label.textContent = shortDate(p.date);
    svg.appendChild(label);
  });

  const linePath = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1)},${M.top + innerH} L${x(0)},${
    M.top + innerH
  } Z`;

  svg.appendChild(
    svgEl("path", { d: areaPath, class: "chart-area", style: "fill: var(--series-1)" })
  );
  svg.appendChild(
    svgEl("path", { d: linePath, class: "chart-line", style: "stroke: var(--series-1)" })
  );

  // End marker with a surface ring so it stays legible over the line
  const lastIdx = points.length - 1;
  svg.appendChild(
    svgEl("circle", {
      cx: x(lastIdx),
      cy: y(points[lastIdx].value),
      r: 5,
      class: "chart-end-dot",
      style: "fill: var(--series-1)",
    })
  );

  // Crosshair layer
  const crosshair = svgEl("line", { class: "chart-crosshair hidden", y1: M.top, y2: M.top + innerH });
  const hoverDot = svgEl("circle", {
    r: 5,
    class: "chart-hover-dot hidden",
    style: "fill: var(--series-1)",
  });
  svg.appendChild(crosshair);
  svg.appendChild(hoverDot);

  plot.appendChild(svg);
  const tip = makeTooltip(plot);

  const onMove = (event) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * W;
    const ratio = (relX - M.left) / innerW;
    const idx = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
    const point = points[idx];

    crosshair.classList.remove("hidden");
    hoverDot.classList.remove("hidden");
    crosshair.setAttribute("x1", x(idx));
    crosshair.setAttribute("x2", x(idx));
    hoverDot.setAttribute("cx", x(idx));
    hoverDot.setAttribute("cy", y(point.value));

    const first = points[0].value;
    const change = ((point.value / first - 1) * 100).toFixed(2);
    tip.innerHTML = `
      <div class="tt-date">${escapeHtml(shortDate(point.date))}</div>
      <div class="tt-value">${escapeHtml(format(point.value))}</div>
      <div class="tt-meta">${change >= 0 ? "+" : ""}${escapeHtml(change)}% vs ${escapeHtml(
      shortDate(points[0].date)
    )}</div>
    `;
    tip.classList.remove("hidden");
    positionTooltip(
      tip,
      plot,
      (x(idx) / W) * plot.clientWidth,
      (y(point.value) / H) * plot.clientHeight
    );
  };

  const onLeave = () => {
    crosshair.classList.add("hidden");
    hoverDot.classList.add("hidden");
    tip.classList.add("hidden");
  };

  svg.addEventListener("mousemove", onMove);
  svg.addEventListener("mouseleave", onLeave);

  attachA11yTable(figure, {
    caption: `${title} — underlying data`,
    columns: ["Date", "Value"],
    rows: points.map((p) => [p.date, format(p.value)]),
  });
}

// ---------- Indexed multi-series lines ----------

/**
 * series: [{ name, points: [{date, value}] }]
 * Values are indexed to 100 at the first date so coins three orders of
 * magnitude apart share one axis — the alternative would be a second y-axis,
 * which is never correct.
 */
function renderIndexedLines(container, { series, title, subtitle }) {
  const { figure, plot } = makeFigure(container, {
    title,
    subtitle,
    ariaLabel: `${title}. Indexed line chart comparing ${series.length} stablecoins.`,
  });

  const usable = series.filter((s) => s.points.length >= 2 && s.points[0].value > 0);
  if (usable.length === 0) {
    plot.innerHTML = `<p class="chart-empty">Not enough history yet to compare.</p>`;
    return;
  }

  const indexed = usable.map((s, i) => ({
    name: s.name,
    colorVar: `--series-${(i % 6) + 1}`,
    points: s.points.map((p) => ({ date: p.date, value: (p.value / s.points[0].value) * 100 })),
  }));

  const W = plotWidth(plot);
  const H = W < 620 ? 260 : 340;
  // End labels need their gutter even when space is tight, so the right
  // margin is preserved while the left one shrinks.
  const M = {
    top: 16,
    right: W < 620 ? 62 : 76,
    bottom: 34,
    left: W < 620 ? 34 : 52,
  };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const all = indexed.flatMap((s) => s.points.map((p) => p.value));
  const rawMin = Math.min(...all, 100);
  const rawMax = Math.max(...all, 100);
  const pad = (rawMax - rawMin) * 0.12 || 2;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const len = indexed[0].points.length;
  const x = (i) => M.left + (i / (len - 1)) * innerW;
  const y = (v) => M.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, height: H, class: "chart-svg" });

  for (const tick of niceTicks(yMin, yMax, W < 620 ? 3 : 4)) {
    if (tick < yMin || tick > yMax) continue;
    svg.appendChild(
      svgEl("line", {
        x1: M.left,
        x2: W - M.right,
        y1: y(tick),
        y2: y(tick),
        class: tick === 100 ? "chart-baseline" : "chart-gridline",
      })
    );
    const label = svgEl("text", {
      x: M.left - 10,
      y: y(tick) + 4,
      class: "chart-axis-label",
      "text-anchor": "end",
    });
    label.textContent = tick.toFixed(0);
    svg.appendChild(label);
  }

  const tickEvery = Math.max(1, Math.floor((len - 1) / (W < 460 ? 2 : W < 620 ? 3 : 5)));
  const lastTickX = x(len - 1);
  indexed[0].points.forEach((p, i) => {
    const isLast = i === len - 1;
    if (i % tickEvery !== 0 && !isLast) return;
    if (!isLast && lastTickX - x(i) < 44) return;
    const label = svgEl("text", {
      x: x(i),
      y: H - 12,
      class: "chart-axis-label",
      "text-anchor": isLast ? "end" : "middle",
    });
    label.textContent = shortDate(p.date);
    svg.appendChild(label);
  });

  // Lines, then end labels. Labels are nudged apart only enough to stop exact
  // overlap; past that the legend carries identity.
  const endLabels = [];
  indexed.forEach((s) => {
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
    svg.appendChild(
      svgEl("path", { d, class: "chart-line", style: `stroke: var(${s.colorVar})` })
    );
    const last = s.points[s.points.length - 1];
    svg.appendChild(
      svgEl("circle", {
        cx: x(len - 1),
        cy: y(last.value),
        r: 4,
        class: "chart-end-dot",
        style: `fill: var(${s.colorVar})`,
      })
    );
    endLabels.push({ name: s.name, anchorY: y(last.value), y: y(last.value) });
  });

  endLabels.sort((a, b) => a.y - b.y);
  const MIN_GAP = 13;
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < MIN_GAP) {
      endLabels[i].y = endLabels[i - 1].y + MIN_GAP;
    }
  }

  endLabels.forEach((label) => {
    const labelY = Math.min(label.y, H - M.bottom - 4);

    // A nudged label has left its line, so a leader connects them back up.
    // Without it the displaced text reads as belonging to a neighbour.
    if (Math.abs(labelY - label.anchorY) > 1.5) {
      svg.appendChild(
        svgEl("path", {
          d: `M${W - M.right + 1},${label.anchorY} L${W - M.right + 5},${labelY}`,
          class: "chart-leader",
        })
      );
    }

    const text = svgEl("text", {
      x: W - M.right + 8,
      y: labelY + 4,
      class: "chart-end-label",
      "text-anchor": "start",
    });
    text.textContent = label.name;
    svg.appendChild(text);
  });

  const crosshair = svgEl("line", { class: "chart-crosshair hidden", y1: M.top, y2: M.top + innerH });
  svg.appendChild(crosshair);

  plot.appendChild(svg);

  // Legend — always present for two or more series
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML = indexed
    .map(
      (s) =>
        `<span class="legend-item"><span class="legend-swatch" style="background: var(${s.colorVar})"></span>${escapeHtml(
          s.name
        )}</span>`
    )
    .join("");
  figure.appendChild(legend);

  const tip = makeTooltip(plot);

  svg.addEventListener("mousemove", (event) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * W;
    const ratio = (relX - M.left) / innerW;
    const idx = Math.max(0, Math.min(len - 1, Math.round(ratio * (len - 1))));

    crosshair.classList.remove("hidden");
    crosshair.setAttribute("x1", x(idx));
    crosshair.setAttribute("x2", x(idx));

    const rows = indexed
      .map((s) => ({ name: s.name, v: s.points[idx].value, colorVar: s.colorVar }))
      .sort((a, b) => b.v - a.v)
      .map(
        (r) =>
          `<div class="tt-row"><span class="legend-swatch" style="background: var(${
            r.colorVar
          })"></span><span class="tt-row-name">${escapeHtml(r.name)}</span><span class="tt-row-val">${
            r.v >= 100 ? "+" : ""
          }${escapeHtml((r.v - 100).toFixed(1))}%</span></div>`
      )
      .join("");

    tip.innerHTML = `<div class="tt-date">${escapeHtml(
      shortDate(indexed[0].points[idx].date)
    )}</div>${rows}`;
    tip.classList.remove("hidden");
    positionTooltip(tip, plot, (x(idx) / W) * plot.clientWidth, plot.clientHeight * 0.55);
  });

  svg.addEventListener("mouseleave", () => {
    crosshair.classList.add("hidden");
    tip.classList.add("hidden");
  });

  attachA11yTable(figure, {
    caption: `${title} — indexed values (first date = 100)`,
    columns: ["Stablecoin", "Start", "Latest", "Change"],
    rows: indexed.map((s) => [
      s.name,
      "100.0",
      s.points[s.points.length - 1].value.toFixed(1),
      `${(s.points[s.points.length - 1].value - 100).toFixed(1)}%`,
    ]),
  });
}

// ---------- Diverging bars (change around zero) ----------

/**
 * items: [{ label, value, detail }] — value is a signed percentage.
 * Diverging blue/red around a neutral zero line.
 */
function renderDivergingBars(container, { items, title, subtitle, unit = "%" }) {
  const { figure, plot } = makeFigure(container, {
    title,
    subtitle,
    ariaLabel: `${title}. Diverging bar chart of ${items.length} values around zero.`,
  });

  if (!items.length) {
    plot.innerHTML = `<p class="chart-empty">No data available.</p>`;
    return;
  }

  const rowH = 26;
  const W = plotWidth(plot);
  const H = items.length * rowH + 28;
  const M = scaleMargins(W, { top: 8, right: 64, bottom: 20, left: 92 });
  const innerW = W - M.left - M.right;

  // The domain covers only the signs actually present, so a "biggest gainers"
  // ranking does not waste half its width on an empty negative arm. Both
  // bounds are snapped to a whole number of ticks, which keeps the axis
  // labels round.
  const values = items.map((i) => i.value);
  const maxPos = Math.max(...values, 0);
  const maxNeg = Math.max(...values.map((v) => -v), 0);
  const step = niceCeil((maxPos + maxNeg) / 4) || 1;

  const domainMax = Math.ceil(maxPos / step) * step;
  const domainMin = -Math.ceil(maxNeg / step) * step;
  const span = domainMax - domainMin || 1;

  const toX = (v) => M.left + ((v - domainMin) / span) * innerW;
  const zeroX = toX(0);

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, height: H, class: "chart-svg chart-svg-fixed" });

  const tickValues = [];
  for (let v = domainMin; v <= domainMax + step * 0.001; v += step) {
    tickValues.push(Math.abs(v) < step * 0.001 ? 0 : v);
  }

  for (const tick of tickValues) {
    const tx = toX(tick);
    svg.appendChild(
      svgEl("line", {
        x1: tx,
        x2: tx,
        y1: M.top,
        y2: H - M.bottom,
        class: tick === 0 ? "chart-baseline" : "chart-gridline",
      })
    );
    const label = svgEl("text", {
      x: tx,
      y: H - 6,
      class: "chart-axis-label",
      "text-anchor": "middle",
    });
    const decimals = step >= 10 ? 0 : step >= 1 ? 1 : 2;
    label.textContent = `${tick > 0 ? "+" : ""}${tick.toFixed(decimals)}${unit}`;
    svg.appendChild(label);
  }

  const tip = makeTooltip(plot);

  items.forEach((item, i) => {
    const yTop = M.top + i * rowH + 4;
    const barH = Math.min(16, rowH - 10);
    const positive = item.value >= 0;
    const x = positive ? zeroX : toX(item.value);
    const width = Math.abs(toX(item.value) - zeroX);

    const name = svgEl("text", {
      x: M.left - 12,
      y: yTop + barH / 2 + 4,
      class: "chart-row-label",
      "text-anchor": "end",
    });
    name.textContent = item.label;
    svg.appendChild(name);

    const rect = svgEl("rect", {
      x,
      y: yTop,
      width: Math.max(width, 1),
      height: barH,
      rx: 3,
      class: "chart-bar",
      style: `fill: var(${positive ? "--diverge-pos" : "--diverge-neg"})`,
    });
    svg.appendChild(rect);

    // Value at the tip, outside the bar. When the bar reaches the edge of the
    // plot there is no room out there, so the label moves inside the bar's own
    // end rather than colliding with the row label or being clipped.
    const text = `${positive ? "+" : ""}${item.value.toFixed(1)}${unit}`;
    const estimatedTextWidth = text.length * 6.2;
    const outsideX = positive ? x + width + 8 : x - 8;
    const fitsOutside = positive
      ? outsideX + estimatedTextWidth <= W - 4
      : outsideX - estimatedTextWidth >= M.left + 4;

    let labelX;
    let anchor;
    if (fitsOutside) {
      labelX = outsideX;
      anchor = positive ? "start" : "end";
    } else {
      // Tucked just inside the bar's own end, reading back toward the baseline.
      labelX = positive ? x + width - 8 : x + 8;
      anchor = positive ? "end" : "start";
    }

    const value = svgEl("text", {
      x: labelX,
      y: yTop + barH / 2 + 4,
      class: fitsOutside ? "chart-value-label" : "chart-value-label chart-value-inside",
      "text-anchor": anchor,
    });
    value.textContent = text;
    svg.appendChild(value);

    const hit = svgEl("rect", {
      x: M.left,
      y: yTop - 4,
      width: innerW,
      height: rowH,
      fill: "transparent",
      class: "chart-hit",
    });
    hit.addEventListener("mousemove", (event) => {
      const rectBox = plot.getBoundingClientRect();
      tip.innerHTML = `<div class="tt-date">${escapeHtml(item.label)}</div>
        <div class="tt-value">${positive ? "+" : ""}${escapeHtml(
        item.value.toFixed(2)
      )}${escapeHtml(unit)}</div>
        ${item.detail ? `<div class="tt-meta">${escapeHtml(item.detail)}</div>` : ""}`;
      tip.classList.remove("hidden");
      positionTooltip(tip, plot, event.clientX - rectBox.left, event.clientY - rectBox.top);
    });
    hit.addEventListener("mouseleave", () => tip.classList.add("hidden"));
    svg.appendChild(hit);
  });

  plot.appendChild(svg);

  attachA11yTable(figure, {
    caption: `${title} — underlying data`,
    columns: ["Name", `Change (${unit})`, "Detail"],
    rows: items.map((i) => [i.label, i.value.toFixed(2), i.detail || ""]),
  });
}

// ---------- Horizontal magnitude bars ----------

/**
 * items: [{ label, value, detail }] — non-negative magnitudes.
 */
function renderBars(container, { items, title, subtitle, format = compactUsd }) {
  const { figure, plot } = makeFigure(container, {
    title,
    subtitle,
    ariaLabel: `${title}. Bar chart of ${items.length} values.`,
  });

  if (!items.length) {
    plot.innerHTML = `<p class="chart-empty">No data available.</p>`;
    return;
  }

  const rowH = 30;
  const W = plotWidth(plot);
  const H = items.length * rowH + 12;
  const M = scaleMargins(W, { top: 6, right: 96, bottom: 6, left: 132 });
  const innerW = W - M.left - M.right;
  const max = Math.max(...items.map((i) => i.value)) || 1;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, height: H, class: "chart-svg chart-svg-fixed" });
  const tip = makeTooltip(plot);

  items.forEach((item, i) => {
    const yTop = M.top + i * rowH + 5;
    const barH = Math.min(18, rowH - 12);
    const width = Math.max((item.value / max) * innerW, 2);

    const name = svgEl("text", {
      x: M.left - 12,
      y: yTop + barH / 2 + 4,
      class: "chart-row-label",
      "text-anchor": "end",
    });
    name.textContent = item.label;
    svg.appendChild(name);

    svg.appendChild(
      svgEl("rect", {
        x: M.left,
        y: yTop,
        width,
        height: barH,
        rx: 3,
        class: "chart-bar",
        style: "fill: var(--series-1)",
      })
    );

    const value = svgEl("text", {
      x: M.left + width + 10,
      y: yTop + barH / 2 + 4,
      class: "chart-value-label",
      "text-anchor": "start",
    });
    value.textContent = format(item.value);
    svg.appendChild(value);

    const hit = svgEl("rect", {
      x: M.left,
      y: yTop - 5,
      width: innerW,
      height: rowH,
      fill: "transparent",
      class: "chart-hit",
    });
    hit.addEventListener("mousemove", (event) => {
      const box = plot.getBoundingClientRect();
      tip.innerHTML = `<div class="tt-date">${escapeHtml(item.label)}</div>
        <div class="tt-value">${escapeHtml(format(item.value))}</div>
        ${item.detail ? `<div class="tt-meta">${escapeHtml(item.detail)}</div>` : ""}`;
      tip.classList.remove("hidden");
      positionTooltip(tip, plot, event.clientX - box.left, event.clientY - box.top);
    });
    hit.addEventListener("mouseleave", () => tip.classList.add("hidden"));
    svg.appendChild(hit);
  });

  plot.appendChild(svg);

  attachA11yTable(figure, {
    caption: `${title} — underlying data`,
    columns: ["Name", "Value", "Detail"],
    rows: items.map((i) => [i.label, format(i.value), i.detail || ""]),
  });
}

// ---------- Stacked composition bars ----------

/**
 * rows: [{ label, segments: [{ name, value, colorVar }] }]
 *
 * One bar per row, each split into segments summing to that row's total.
 * Segments are separated by a 2px gap in the surface colour rather than a
 * stroke, so neighbouring fills read as distinct without adding ink.
 */
function renderStackedBars(container, { rows, title, subtitle, format = compactUsd, legend = [] }) {
  const { figure, plot } = makeFigure(container, {
    title,
    subtitle,
    ariaLabel: `${title}. Stacked composition of ${rows.length} rows.`,
  });

  if (!rows.length) {
    plot.innerHTML = `<p class="chart-empty">No data available.</p>`;
    return;
  }

  const W = plotWidth(plot);
  const rowH = 62;
  const H = rows.length * rowH + 8;
  const M = scaleMargins(W, { top: 4, right: 8, bottom: 4, left: 74 });
  const innerW = W - M.left - M.right;
  const GAP = 2;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, height: H, class: "chart-svg chart-svg-fixed" });
  const tip = makeTooltip(plot);

  rows.forEach((row, rowIndex) => {
    const total = row.segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;
    const yTop = M.top + rowIndex * rowH + 20;
    const barH = 26;

    const name = svgEl("text", {
      x: M.left - 12,
      y: yTop + barH / 2 + 4,
      class: "chart-row-label",
      "text-anchor": "end",
    });
    name.textContent = row.label;
    svg.appendChild(name);

    const totalLabel = svgEl("text", {
      x: M.left,
      y: yTop - 7,
      class: "chart-axis-label",
      "text-anchor": "start",
    });
    totalLabel.textContent = `${format(total)} total`;
    svg.appendChild(totalLabel);

    let cursor = M.left;
    row.segments.forEach((segment, i) => {
      const share = Math.max(0, segment.value) / total;
      const rawWidth = share * innerW;
      const isLast = i === row.segments.length - 1;
      const width = Math.max(0, isLast ? rawWidth : rawWidth - GAP);
      if (rawWidth <= 0) return;

      svg.appendChild(
        svgEl("rect", {
          x: cursor,
          y: yTop,
          width,
          height: barH,
          rx: 2,
          class: "chart-bar",
          style: `fill: var(${segment.colorVar})`,
        })
      );

      // Label inside only when it genuinely fits, measured against the text.
      const pct = `${(share * 100).toFixed(share < 10 ? 1 : 0)}%`;
      if (width > pct.length * 8 + 16) {
        const label = svgEl("text", {
          x: cursor + width / 2,
          y: yTop + barH / 2 + 4,
          class: "chart-value-label chart-value-inside",
          "text-anchor": "middle",
        });
        label.textContent = pct;
        svg.appendChild(label);
      }

      const hit = svgEl("rect", {
        x: cursor,
        y: yTop,
        width,
        height: barH,
        fill: "transparent",
        class: "chart-hit",
      });
      hit.addEventListener("mousemove", (event) => {
        const box = plot.getBoundingClientRect();
        tip.innerHTML = `<div class="tt-date">${escapeHtml(row.label)}</div>
          <div class="tt-row"><span class="legend-swatch" style="background: var(${
            segment.colorVar
          })"></span><span class="tt-row-name">${escapeHtml(segment.name)}</span></div>
          <div class="tt-value">${escapeHtml(format(segment.value))}</div>
          <div class="tt-meta">${escapeHtml((share * 100).toFixed(1))}% of ${escapeHtml(
          row.label
        )}</div>`;
        tip.classList.remove("hidden");
        positionTooltip(tip, plot, event.clientX - box.left, event.clientY - box.top);
      });
      hit.addEventListener("mouseleave", () => tip.classList.add("hidden"));
      svg.appendChild(hit);

      cursor += rawWidth;
    });
  });

  plot.appendChild(svg);

  if (legend.length) {
    const legendEl = document.createElement("div");
    legendEl.className = "chart-legend";
    legendEl.innerHTML = legend
      .map(
        (l) =>
          `<span class="legend-item"><span class="legend-swatch" style="background: var(${l.colorVar})"></span>${escapeHtml(
            l.name
          )}</span>`
      )
      .join("");
    figure.appendChild(legendEl);
  }

  attachA11yTable(figure, {
    caption: `${title} — underlying data`,
    columns: ["Group", "Segment", "Value", "Share"],
    rows: rows.flatMap((row) => {
      const total = row.segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
      return row.segments.map((s) => [
        row.label,
        s.name,
        format(s.value),
        `${((Math.max(0, s.value) / total) * 100).toFixed(1)}%`,
      ]);
    }),
  });
}

// ---------- Sparkline (inline, for table rows) ----------

/** Returns an SVG string — small enough to inline into table markup. */
function sparklineSvg(values, { width = 76, height = 22 } = {}) {
  if (!values || values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => (i / (values.length - 1)) * (width - 2) + 1;
  const y = (v) => height - 2 - ((v - min) / span) * (height - 4);

  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const rising = values[values.length - 1] >= values[0];
  const colorVar = rising ? "--diverge-pos" : "--diverge-neg";

  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">
    <path d="${d}" fill="none" stroke="var(${colorVar})" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

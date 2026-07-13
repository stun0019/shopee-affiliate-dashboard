const CSV_URL = "https://docs.google.com/spreadsheets/d/1KqTwe-hXAaQW4CHMepyje6iCyzmffppPXZ8-aGLd29U/export?format=csv&gid=0";
const MONTHLY_GOAL = 5000;

const fields = {
  date: "日期",
  month: "月份",
  postUrl: "貼文URL",
  contentType: "內容類型",
  product: "商品名稱",
  category: "品類",
  price: "售價",
  commissionRate: "佣金率",
  impressions: "曝光數",
  interactions: "互動數",
  clicks: "點擊數",
  orders: "訂單數",
  revenue: "實際分潤",
  ctr: "CTR",
  cvr: "CVR",
  epc: "EPC",
  status: "狀態",
  nextAction: "下次行動",
};

const state = {
  rows: [],
  month: currentMonthKey(),
  resizeTimer: null,
};

const elements = {
  sourceStatus: document.querySelector("#sourceStatus"),
  loadAlert: document.querySelector("#loadAlert"),
  csvFile: document.querySelector("#csvFile"),
  monthSelect: document.querySelector("#monthSelect"),
  refreshButton: document.querySelector("#refreshButton"),
  monthlyRevenue: document.querySelector("#monthlyRevenue"),
  monthlyOrders: document.querySelector("#monthlyOrders"),
  monthlyClicks: document.querySelector("#monthlyClicks"),
  monthlyEpc: document.querySelector("#monthlyEpc"),
  goalBar: document.querySelector("#goalBar"),
  goalText: document.querySelector("#goalText"),
  conversionHint: document.querySelector("#conversionHint"),
  ctrHint: document.querySelector("#ctrHint"),
  actionCount: document.querySelector("#actionCount"),
  actionHint: document.querySelector("#actionHint"),
  productRows: document.querySelector("#productRows"),
  actionRows: document.querySelector("#actionRows"),
};

document.addEventListener("DOMContentLoaded", () => {
  hydrateIcons();
  bindEvents();
  loadRemoteCsv();
});

window.addEventListener("resize", () => {
  window.clearTimeout(state.resizeTimer);
  state.resizeTimer = window.setTimeout(render, 120);
});

function bindEvents() {
  elements.refreshButton.addEventListener("click", loadRemoteCsv);
  elements.monthSelect.addEventListener("change", (event) => {
    state.month = event.target.value;
    render();
  });
  elements.csvFile.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        receiveRows(parseCsv(String(reader.result || "")), `已匯入 ${file.name}`);
      } catch (error) {
        showAlert("CSV 解析失敗，請確認檔案格式。");
      }
    });
    reader.readAsText(file, "utf-8");
  });
}

async function loadRemoteCsv() {
  setSourceStatus("loading", "正在讀取 Google Sheet");
  hideAlert();
  render();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${CSV_URL}&cacheBust=${Date.now()}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    receiveRows(parseCsv(await response.text()), "已連上 Google Sheet");
  } catch (error) {
    setSourceStatus("error", "Google Sheet 尚未可讀");
    showAlert("目前讀不到 Google Sheet CSV。請確認試算表已發布到網路，或先用左側「匯入 CSV」載入資料。");
    state.rows = [];
    populateMonthSelect([]);
    render();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function receiveRows(rows, message) {
  state.rows = rows.map(normalizeRow).filter((row) => row.date || row.product || row.month);
  const months = getMonths(state.rows);
  if (!months.includes(state.month)) state.month = months[0] || currentMonthKey();
  populateMonthSelect(months);
  setSourceStatus("ready", `${message}，${state.rows.length} 筆`);
  hideAlert();
  render();
}

function normalizeRow(row) {
  const dateValue = clean(row[fields.date]);
  const monthValue = clean(row[fields.month]) || monthFromDate(dateValue);
  const clicks = toNumber(row[fields.clicks]);
  const impressions = toNumber(row[fields.impressions]);
  const orders = toNumber(row[fields.orders]);
  const revenue = toNumber(row[fields.revenue]);

  return {
    date: dateValue,
    month: monthValue,
    postUrl: clean(row[fields.postUrl]),
    contentType: clean(row[fields.contentType]) || "未分類",
    product: clean(row[fields.product]) || "未命名商品",
    category: clean(row[fields.category]) || "未分類",
    price: toNumber(row[fields.price]),
    commissionRate: toRate(row[fields.commissionRate]),
    impressions,
    interactions: toNumber(row[fields.interactions]),
    clicks,
    orders,
    revenue,
    ctr: toRate(row[fields.ctr], impressions ? clicks / impressions : null),
    cvr: toRate(row[fields.cvr], clicks ? orders / clicks : null),
    epc: toNumber(row[fields.epc], clicks ? revenue / clicks : null),
    status: clean(row[fields.status]) || "未更新",
    nextAction: clean(row[fields.nextAction]),
  };
}

function render() {
  const monthRows = state.rows.filter((row) => row.month === state.month);
  const totals = summarize(monthRows);
  renderKpis(totals, monthRows);
  renderCharts(monthRows);
  renderProductRows(monthRows);
  renderActionRows(monthRows);
}

function renderKpis(totals, monthRows) {
  const gap = Math.max(MONTHLY_GOAL - totals.revenue, 0);
  const progress = Math.min((totals.revenue / MONTHLY_GOAL) * 100, 100);
  const actionRows = getActionRows(monthRows);

  elements.monthlyRevenue.textContent = money(totals.revenue);
  elements.monthlyOrders.textContent = number(totals.orders);
  elements.monthlyClicks.textContent = number(totals.clicks);
  elements.monthlyEpc.textContent = totals.clicks ? money(totals.revenue / totals.clicks) : "-";
  elements.goalBar.style.width = `${progress}%`;
  elements.goalText.textContent = gap ? `距離 NT$5,000 還差 ${money(gap)}` : "本月目標已達成";
  elements.conversionHint.textContent = `CVR ${totals.clicks ? percent(totals.orders / totals.clicks) : "-"}`;
  elements.ctrHint.textContent = `CTR ${totals.impressions ? percent(totals.clicks / totals.impressions) : "-"}`;
  elements.actionCount.textContent = number(actionRows.length);
  elements.actionHint.textContent = actionRows.length ? `${actionRows[0].product} 需要 ${actionRows[0].nextAction}` : "目前沒有需要處理的項目";
}

function renderCharts(rows) {
  const byDate = groupBy(rows, (row) => row.date || "未填日期");
  const dailyLabels = Object.keys(byDate).sort();
  drawLineChart("dailyRevenueChart", dailyLabels, dailyLabels.map((date) => sum(byDate[date], "revenue")));

  const categories = Object.entries(groupBy(rows, (row) => row.category))
    .map(([label, items]) => ({ label, value: sum(items, "revenue") }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  drawBarChart("categoryChart", categories.map((item) => item.label), categories.map((item) => item.value));

  const byContent = groupBy(rows, (row) => row.contentType);
  const contentLabels = Object.keys(byContent);
  drawComboChart(
    "contentChart",
    contentLabels,
    contentLabels.map((label) => sum(byContent[label], "revenue")),
    contentLabels.map((label) => {
      const totals = summarize(byContent[label]);
      return totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
    }),
    contentLabels.map((label) => {
      const totals = summarize(byContent[label]);
      return totals.clicks ? (totals.orders / totals.clicks) * 100 : 0;
    }),
  );
}

function renderProductRows(rows) {
  const topRows = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  if (!topRows.length) {
    elements.productRows.innerHTML = emptyRow(5, "這個月份還沒有商品資料");
    return;
  }

  elements.productRows.innerHTML = topRows.map((row) => `
    <tr>
      <td class="product-name">${linkOrText(row.product, row.postUrl)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${money(row.revenue)}</td>
      <td>${row.clicks ? money(row.revenue / row.clicks) : "-"}</td>
      <td><span class="badge ${isActionable(row.nextAction) ? "warn" : ""}">${escapeHtml(row.status)}</span></td>
    </tr>
  `).join("");
}

function renderActionRows(rows) {
  const actionRows = getActionRows(rows).slice(0, 12);
  if (!actionRows.length) {
    elements.actionRows.innerHTML = emptyRow(4, "這個月份沒有待處理項目");
    return;
  }

  elements.actionRows.innerHTML = actionRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.date || "-")}</td>
      <td class="product-name">${linkOrText(row.product, row.postUrl)}</td>
      <td><span class="badge warn">${escapeHtml(row.nextAction)}</span></td>
      <td>${money(row.revenue)}</td>
    </tr>
  `).join("");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => clean(cell))) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => clean(cell))) rows.push(row);

  const headers = (rows.shift() || []).map((header) => clean(header).replace(/^\uFEFF/, ""));
  return rows.map((cells) => headers.reduce((record, header, index) => {
    record[header] = cells[index] ?? "";
    return record;
  }, {}));
}

function populateMonthSelect(months) {
  const options = months.length ? months : [state.month];
  elements.monthSelect.innerHTML = options.map((month) => `<option value="${month}">${month}</option>`).join("");
  elements.monthSelect.value = state.month;
}

function getActionRows(rows) {
  return rows
    .filter((row) => isActionable(row.nextAction))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function isActionable(action) {
  const value = clean(action);
  return value && value !== "觀察";
}

function summarize(rows) {
  return {
    revenue: sum(rows, "revenue"),
    orders: sum(rows, "orders"),
    clicks: sum(rows, "clicks"),
    impressions: sum(rows, "impressions"),
  };
}

function groupBy(rows, keyGetter) {
  return rows.reduce((groups, row) => {
    const key = keyGetter(row);
    groups[key] = groups[key] || [];
    groups[key].push(row);
    return groups;
  }, {});
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function getMonths(rows) {
  return [...new Set(rows.map((row) => row.month).filter(Boolean))].sort().reverse();
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthFromDate(value) {
  const normalized = clean(value).replaceAll("/", "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}` : "";
}

function clean(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback = 0) {
  const text = clean(value);
  if (!text) return fallback ?? 0;
  const parsed = Number(text.replace(/[NT$,\s]/g, "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : (fallback ?? 0);
}

function toRate(value, fallback = 0) {
  const text = clean(value);
  if (!text) return fallback ?? 0;
  if (text.includes("%")) return toNumber(text) / 100;
  const parsed = toNumber(text, fallback);
  return parsed > 1 ? parsed / 100 : parsed;
}

function money(value) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function number(value) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function percent(value) {
  return `${number((Number(value) || 0) * 100)}%`;
}

function setSourceStatus(type, message) {
  elements.sourceStatus.classList.remove("ready", "error");
  if (type === "ready") elements.sourceStatus.classList.add("ready");
  if (type === "error") elements.sourceStatus.classList.add("error");
  elements.sourceStatus.querySelector("span:last-child").textContent = message;
}

function showAlert(message) {
  elements.loadAlert.textContent = message;
  elements.loadAlert.classList.remove("hidden");
}

function hideAlert() {
  elements.loadAlert.classList.add("hidden");
}

function emptyRow(colspan, message) {
  return `<tr><td class="empty-row" colspan="${colspan}">${message}</td></tr>`;
}

function linkOrText(text, href) {
  const label = escapeHtml(text);
  if (!href) return label;
  return `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${label}</a>`;
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function hydrateIcons() {
  const icons = {
    "layout-dashboard": '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/>',
    "bar-chart-3": '<path d="M4 20V10"/><path d="M12 20V4"/><path d="M20 20v-7"/>',
    trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M5 5H3v2a4 4 0 0 0 4 4"/><path d="M19 5h2v2a4 4 0 0 1-4 4"/>',
    "list-checks": '<path d="m3 7 2 2 4-4"/><path d="M11 7h10"/><path d="m3 17 2 2 4-4"/><path d="M11 17h10"/>',
    upload: '<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
    "refresh-cw": '<path d="M21 12a9 9 0 0 1-15.1 6.6"/><path d="M3 12A9 9 0 0 1 18.1 5.4"/><path d="M21 5v6h-6"/><path d="M3 19v-6h6"/>',
    "badge-dollar-sign": '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M15 9.5A3 3 0 0 0 12 8c-1.7 0-3 .8-3 2s1.3 2 3 2 3 .8 3 2-1.3 2-3 2a3 3 0 0 1-3-1.5"/>',
    "shopping-bag": '<path d="M6 8h12l-1 13H7L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    "mouse-pointer-click": '<path d="M4 4 13 21l2-7 6-2L4 4Z"/><path d="M14 4h6v6"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    "bell-ring": '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/><path d="M4 4 2 6"/><path d="m20 4 2 2"/>',
  };

  document.querySelectorAll("[data-lucide]").forEach((node) => {
    const name = node.getAttribute("data-lucide");
    node.outerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ""}</svg>`;
  });
}

function setupCanvas(id) {
  const canvas = document.getElementById(id);
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(rect.width, 280);
  const height = Math.max(rect.height, 220);
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function drawEmptyChart(context, width, height) {
  context.fillStyle = "#67736b";
  context.font = "14px Microsoft JhengHei, sans-serif";
  context.textAlign = "center";
  context.fillText("這個月份還沒有可繪製資料", width / 2, height / 2);
}

function chartFrame(context, width, height, maxValue, formatter = number) {
  const pad = { top: 24, right: 18, bottom: 48, left: 62 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  context.strokeStyle = "#edf1ea";
  context.fillStyle = "#67736b";
  context.lineWidth = 1;
  context.font = "12px Microsoft JhengHei, sans-serif";
  context.textAlign = "right";

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = (maxValue / 4) * tick;
    const y = pad.top + plotHeight - (plotHeight / 4) * tick;
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
    context.fillText(formatter(value), pad.left - 10, y + 4);
  }

  return { pad, plotWidth, plotHeight };
}

function drawLineChart(id, labels, data) {
  const { context, width, height } = setupCanvas(id);
  if (!data.length || data.every((value) => value === 0)) return drawEmptyChart(context, width, height);

  const maxValue = Math.max(...data, 1);
  const { pad, plotWidth, plotHeight } = chartFrame(context, width, height, maxValue, money);
  const xStep = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const points = data.map((value, index) => ({
    x: pad.left + xStep * index,
    y: pad.top + plotHeight - (value / maxValue) * plotHeight,
  }));

  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, pad.top + plotHeight);
  context.lineTo(points[0].x, pad.top + plotHeight);
  context.closePath();
  context.fillStyle = "rgba(22, 128, 60, 0.12)";
  context.fill();

  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.strokeStyle = "#16803c";
  context.lineWidth = 3;
  context.stroke();

  points.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    context.fillStyle = "#16803c";
    context.fill();
  });
  drawXAxisLabels(context, labels, pad, plotWidth, height);
}

function drawBarChart(id, labels, data) {
  const { context, width, height } = setupCanvas(id);
  if (!data.length || data.every((value) => value === 0)) return drawEmptyChart(context, width, height);

  const maxValue = Math.max(...data, 1);
  const { pad, plotWidth, plotHeight } = chartFrame(context, width, height, maxValue, money);
  const gap = 12;
  const barWidth = Math.max((plotWidth - gap * (data.length - 1)) / data.length, 10);

  data.forEach((value, index) => {
    const x = pad.left + index * (barWidth + gap);
    const barHeight = (value / maxValue) * plotHeight;
    context.fillStyle = "#16803c";
    roundedRect(context, x, pad.top + plotHeight - barHeight, barWidth, barHeight, 6);
    context.fill();
  });
  drawXAxisLabels(context, labels, pad, plotWidth, height);
}

function drawComboChart(id, labels, revenue, ctr, cvr) {
  const { context, width, height } = setupCanvas(id);
  if (!labels.length || revenue.every((value) => value === 0)) return drawEmptyChart(context, width, height);

  const maxRevenue = Math.max(...revenue, 1);
  const maxRate = Math.max(...ctr, ...cvr, 1);
  const { pad, plotWidth, plotHeight } = chartFrame(context, width, height, maxRevenue, money);
  const gap = 14;
  const barWidth = Math.max((plotWidth - gap * (revenue.length - 1)) / revenue.length, 10);

  revenue.forEach((value, index) => {
    const x = pad.left + index * (barWidth + gap);
    const barHeight = (value / maxRevenue) * plotHeight;
    context.fillStyle = "#16803c";
    roundedRect(context, x, pad.top + plotHeight - barHeight, barWidth, barHeight, 6);
    context.fill();
  });

  drawRateLine(context, ctr, maxRate, pad, plotWidth, plotHeight, "#c56718");
  drawRateLine(context, cvr, maxRate, pad, plotWidth, plotHeight, "#315c9b");
  drawLegend(context, width, ["分潤", "CTR", "CVR"], ["#16803c", "#c56718", "#315c9b"]);
  drawXAxisLabels(context, labels, pad, plotWidth, height);
}

function drawRateLine(context, data, maxValue, pad, plotWidth, plotHeight, color) {
  const xStep = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  context.beginPath();
  data.forEach((value, index) => {
    const x = pad.left + xStep * index;
    const y = pad.top + plotHeight - (value / maxValue) * plotHeight;
    index ? context.lineTo(x, y) : context.moveTo(x, y);
  });
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
}

function drawXAxisLabels(context, labels, pad, plotWidth, height) {
  const interval = Math.max(Math.ceil(labels.length / 5), 1);
  context.fillStyle = "#67736b";
  context.font = "12px Microsoft JhengHei, sans-serif";
  context.textAlign = "center";

  labels.forEach((label, index) => {
    if (index % interval !== 0 && index !== labels.length - 1) return;
    const x = pad.left + (labels.length > 1 ? (plotWidth / (labels.length - 1)) * index : plotWidth / 2);
    context.fillText(shortLabel(label), x, height - 18);
  });
}

function drawLegend(context, width, labels, colors) {
  context.font = "12px Microsoft JhengHei, sans-serif";
  context.textAlign = "left";
  let x = Math.max(width - 180, 72);

  labels.forEach((label, index) => {
    context.fillStyle = colors[index];
    context.fillRect(x, 14, 9, 9);
    context.fillStyle = "#49554d";
    context.fillText(label, x + 14, 23);
    x += 52;
  });
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function shortLabel(label) {
  const text = clean(label);
  return text.length > 7 ? `${text.slice(0, 7)}...` : text;
}

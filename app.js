const CSV_URL = "https://docs.google.com/spreadsheets/d/1KqTwe-hXAaQW4CHMepyje6iCyzmffppPXZ8-aGLd29U/export?format=csv&gid=0";
const MONTHLY_GOAL = 5000;

const fieldAliases = {
  date: ["日期", "紀錄日期", "發文日期"],
  selectionDate: ["選品日期", "評估日期"],
  month: ["月份", "月分"],
  postUrl: ["貼文URL", "貼文 URL", "Threads貼文", "Threads URL"],
  productUrl: ["蝦皮商品連結", "商品連結", "商品URL", "商品 URL"],
  affiliateUrl: ["分潤短連結", "分潤連結", "聯盟連結", "短連結"],
  contentType: ["內容類型", "文案類型"],
  product: ["商品名稱", "品名"],
  category: ["品類", "分類"],
  price: ["售價", "價格"],
  commissionRate: ["佣金率", "分潤率"],
  impressions: ["曝光數", "曝光"],
  interactions: ["互動數", "互動"],
  clicks: ["點擊數", "點擊"],
  orders: ["訂單數", "訂單"],
  sales: ["成交金額", "銷售金額"],
  revenue: ["實際分潤", "分潤", "收益"],
  estimatedCommission: ["預估單筆分潤", "預估分潤"],
  ctr: ["CTR"],
  cvr: ["CVR"],
  epc: ["EPC"],
  status: ["狀態"],
  nextAction: ["下次行動", "建議行動"],
  priority: ["優先級", "優先順序"],
  pitch: ["一句賣點", "賣點"],
  selectionScore: ["選品總分", "選品分數"],
  weeklyRole: ["本週角色", "主推角色"],
  recommendedAngle: ["推薦發文角度", "發文角度"],
  audience: ["適合族群", "目標族群", "受眾"],
  risk: ["可能風險", "風險"],
  hardGate: ["硬性門檻判定", "硬性門檻"],
  suitableForPush: ["適合主推", "是否適合主推"],
  whyNow: ["為什麼現在值得推", "現在值得推"],
  funnelResult: ["漏斗結果"],
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
  actionRows: document.querySelector("#actionRows"),
  recommendList: document.querySelector("#recommendList"),
  lowPerformanceList: document.querySelector("#lowPerformanceList"),
  highCommissionList: document.querySelector("#highCommissionList"),
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
  const dateValue = cell(row, "selectionDate") || cell(row, "date");
  const monthValue = cell(row, "month") || monthFromDate(dateValue) || currentMonthKey();
  const clicks = toNullableNumber(cell(row, "clicks"));
  const impressions = toNullableNumber(cell(row, "impressions"));
  const orders = toNullableNumber(cell(row, "orders"));
  const commissionRate = toRate(cell(row, "commissionRate"));
  const explicitEstimated = toNullableNumber(cell(row, "estimatedCommission"));
  const explicitRevenue = toNullableNumber(cell(row, "revenue"));
  const revenue = explicitRevenue;
  const status = normalizeStatus(cell(row, "status") || "未更新");
  const priority = normalizePriority(cell(row, "priority"));
  const price = toNumber(cell(row, "price"));
  const estimatedCommission = explicitEstimated ?? (price && commissionRate ? price * commissionRate : null);

  return {
    date: dateValue,
    month: monthValue,
    postUrl: cell(row, "postUrl"),
    productUrl: cell(row, "productUrl"),
    affiliateUrl: cell(row, "affiliateUrl"),
    contentType: cell(row, "contentType") || "未分類",
    product: cell(row, "product") || "未命名商品",
    category: cell(row, "category") || "未分類",
    price,
    commissionRate,
    estimatedCommission,
    impressions,
    interactions: toNullableNumber(cell(row, "interactions")),
    clicks,
    orders,
    revenue,
    ctr: toNullableRate(cell(row, "ctr"), impressions && clicks !== null ? clicks / impressions : null),
    cvr: toNullableRate(cell(row, "cvr"), clicks && orders !== null ? orders / clicks : null),
    epc: toNullableNumber(cell(row, "epc"), clicks && revenue !== null ? revenue / clicks : null),
    status,
    priority,
    pitch: cell(row, "pitch"),
    selectionScore: toNullableNumber(cell(row, "selectionScore")),
    weeklyRole: cell(row, "weeklyRole"),
    recommendedAngle: cell(row, "recommendedAngle"),
    audience: cell(row, "audience"),
    risk: cell(row, "risk"),
    hardGate: cell(row, "hardGate"),
    suitableForPush: cell(row, "suitableForPush"),
    whyNow: cell(row, "whyNow"),
    funnelResult: cell(row, "funnelResult"),
    nextAction: deriveNextAction(cell(row, "nextAction"), status, priority),
  };
}

function render() {
  const monthRows = state.rows.filter((row) => row.month === state.month);
  const totals = summarize(monthRows);
  renderKpis(totals, monthRows);
  renderOps(monthRows);
  renderCharts(monthRows);
  renderActionRows(monthRows);
}

function renderKpis(totals, monthRows) {
  const actualRevenue = totals.revenue ?? 0;
  const gap = Math.max(MONTHLY_GOAL - actualRevenue, 0);
  const progress = Math.min((actualRevenue / MONTHLY_GOAL) * 100, 100);
  const actionRows = getActionRows(monthRows);

  elements.monthlyRevenue.textContent = totals.revenue === null ? "-" : money(totals.revenue);
  elements.monthlyOrders.textContent = totals.orders === null ? "-" : number(totals.orders);
  elements.monthlyClicks.textContent = totals.clicks === null ? "-" : number(totals.clicks);
  elements.monthlyEpc.textContent = totals.clicks && totals.revenue !== null ? money(totals.revenue / totals.clicks) : "-";
  elements.goalBar.style.width = `${progress}%`;
  elements.goalText.textContent = totals.revenue === null ? "尚無實際分潤資料" : gap ? `距離 NT$5,000 還差 ${money(gap)}` : "本月目標已達成";
  elements.conversionHint.textContent = `CVR ${totals.clicks && totals.orders !== null ? percent(totals.orders / totals.clicks) : "-"}`;
  elements.ctrHint.textContent = `CTR ${totals.impressions && totals.clicks !== null ? percent(totals.clicks / totals.impressions) : "-"}`;
  elements.actionCount.textContent = number(actionRows.length);
  elements.actionHint.textContent = actionRows.length ? `${actionRows[0].product}：${actionRows[0].status}` : "目前沒有需要處理的項目";
}

function renderCharts(rows) {
  const byDate = groupBy(rows, (row) => row.date || "未填日期");
  const dailyLabels = Object.keys(byDate).sort();
  drawLineChart("dailyRevenueChart", dailyLabels, dailyLabels.map((date) => sumNullable(byDate[date], "revenue") ?? 0));

  const categories = Object.entries(groupBy(rows, (row) => row.category))
    .map(([label, items]) => ({ label, value: sumNullable(items, "revenue") ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  drawBarChart("categoryChart", categories.map((item) => item.label), categories.map((item) => item.value));

  const byContent = groupBy(rows, (row) => row.contentType);
  const contentLabels = Object.keys(byContent);
  drawComboChart(
    "contentChart",
    contentLabels,
    contentLabels.map((label) => sumNullable(byContent[label], "revenue") ?? 0),
    contentLabels.map((label) => {
      const totals = summarize(byContent[label]);
      return totals.impressions && totals.clicks !== null ? (totals.clicks / totals.impressions) * 100 : 0;
    }),
    contentLabels.map((label) => {
      const totals = summarize(byContent[label]);
      return totals.clicks && totals.orders !== null ? (totals.orders / totals.clicks) * 100 : 0;
    }),
  );
}

function renderOps(rows) {
  renderOpsList(elements.recommendList, getRecommendedRows(rows), "補上商品名稱、價格、佣金率、狀態後，這裡會自動挑出本週主推商品。", "recommend");
  renderOpsList(elements.lowPerformanceList, getLowPerformanceRows(rows), "目前沒有低成效警示。若要啟用提醒，請補曝光數、點擊數、訂單數。", "low");
  renderOpsList(elements.highCommissionList, getHighCommissionRows(rows), "補上價格與佣金率後，這裡會列出高分潤商品。", "high");
}

function renderOpsList(container, rows, emptyMessage, type) {
  if (!rows.length) {
    container.innerHTML = `<div class="ops-empty">${emptyMessage}</div>`;
    return;
  }

  container.innerHTML = rows.slice(0, 4).map((row) => {
    const value = type === "low" ? lowPerformanceReason(row) : `${money(row.estimatedCommission || row.revenue)} / 單筆`;
    const action = type === "recommend" ? row.nextAction || "安排發文" : type === "high" ? "加碼測試" : row.nextAction || "調整素材";
    return `
      <div class="ops-item">
        <strong>${linkOrText(row.product, primaryUrl(row))}</strong>
        <div class="ops-meta">
          <span class="badge ${type === "low" ? "warn" : ""}">${escapeHtml(action)}</span>
          <span>${escapeHtml(row.category)}</span>
          <span>${escapeHtml(value)}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderActionRows(rows) {
  const actionRows = getActionRows(rows).slice(0, 12);
  if (!actionRows.length) {
    elements.actionRows.innerHTML = emptyRow(4, "目前沒有待處理事項。若商品需要追蹤，請將狀態設為待發文。");
    return;
  }

  elements.actionRows.innerHTML = actionRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.date || "-")}</td>
      <td class="product-name">${linkOrText(row.product, primaryUrl(row))}</td>
      <td><span class="badge warn">${escapeHtml(row.status)}</span></td>
      <td>${percent(row.commissionRate)}</td>
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

function cell(row, key) {
  const aliases = fieldAliases[key] || [];
  const normalizedMap = Object.keys(row).reduce((map, header) => {
    map[normalizeHeader(header)] = row[header];
    return map;
  }, {});

  for (const alias of aliases) {
    const value = normalizedMap[normalizeHeader(alias)];
    if (clean(value)) return clean(value);
  }

  return "";
}

function normalizeHeader(header) {
  return clean(header).replace(/\s+/g, "").toLowerCase();
}

function deriveNextAction(action, status, priority) {
  if (clean(action)) return clean(action);
  const statusValue = clean(status);
  if (statusValue.includes("待發文")) return "發文";
  if (statusValue.includes("有點擊")) return "觀察轉單";
  if (statusValue.includes("成交")) return "加碼/變體文";
  if (clean(priority) === "高") return "優先測試";
  return "";
}

function primaryUrl(row) {
  return row.postUrl || row.affiliateUrl || row.productUrl;
}

function populateMonthSelect(months) {
  const options = months.length ? months : [state.month];
  elements.monthSelect.innerHTML = options.map((month) => `<option value="${month}">${month}</option>`).join("");
  elements.monthSelect.value = state.month;
}

function getActionRows(rows) {
  return rows
    .filter((row) => isPendingStatus(row.status))
    .sort(actionSort);
}

function isPendingStatus(status) {
  const value = normalizeStatus(status);
  const excludedStatuses = ["未更新", "觀察", "淘汰", "已發文", "已完成", "完成", "停止主推"];
  return Boolean(value) && !excludedStatuses.some((excluded) => value.includes(excluded));
}

function summarize(rows) {
  return {
    revenue: sumNullable(rows, "revenue"),
    orders: sumNullable(rows, "orders"),
    clicks: sumNullable(rows, "clicks"),
    impressions: sumNullable(rows, "impressions"),
  };
}

function getRecommendedRows(rows) {
  return [...rows]
    .filter((row) => row.product && (row.selectionScore !== null || row.status.includes("待發文") || row.priority || row.estimatedCommission || row.revenue))
    .sort(compareRecommendations);
}

function getLowPerformanceRows(rows) {
  return [...rows]
    .filter((row) => {
      const ctrValue = row.impressions && row.clicks !== null ? row.clicks / row.impressions : null;
      return (row.clicks >= 10 && row.orders === 0) || (row.impressions >= 500 && row.clicks === 0) || (ctrValue !== null && row.impressions >= 500 && ctrValue < 0.01);
    })
    .sort((a, b) => (b.clicks ?? 0) + (b.impressions ?? 0) / 100 - ((a.clicks ?? 0) + (a.impressions ?? 0) / 100));
}

function getHighCommissionRows(rows) {
  return [...rows]
    .filter((row) => row.estimatedCommission > 0 || row.revenue > 0)
    .sort((a, b) => (b.estimatedCommission || b.revenue) - (a.estimatedCommission || a.revenue));
}

function compareRecommendations(a, b) {
  return compareNullableDescending(a.selectionScore, b.selectionScore)
    || (priorityScore(b.priority) - priorityScore(a.priority))
    || (dateFreshnessValue(b.date) - dateFreshnessValue(a.date))
    || compareNullableDescending(a.estimatedCommission, b.estimatedCommission)
    || String(a.product).localeCompare(String(b.product), "zh-Hant");
}

function actionSort(a, b) {
  return (a.status.includes("待發文") ? -1 : 0)
    || (b.status.includes("待發文") ? 1 : 0)
    || (priorityScore(b.priority) - priorityScore(a.priority))
    || ((b.estimatedCommission || 0) - (a.estimatedCommission || 0))
    || String(b.date).localeCompare(String(a.date));
}

function priorityScore(priority) {
  const value = normalizePriority(priority);
  if (value === "高") return 3;
  if (value === "中") return 2;
  if (value === "低") return 1;
  return 0;
}

function lowPerformanceReason(row) {
  if (row.clicks >= 10 && row.orders === 0) return `${number(row.clicks)} 點擊未成交`;
  if (row.impressions >= 500 && row.clicks === 0) return `${number(row.impressions)} 曝光無點擊`;
  if (row.impressions) return `CTR ${percent(row.clicks / row.impressions)}`;
  return "需要檢查素材";
}

function groupBy(rows, keyGetter) {
  return rows.reduce((groups, row) => {
    const key = keyGetter(row);
    groups[key] = groups[key] || [];
    groups[key].push(row);
    return groups;
  }, {});
}

function sumNullable(rows, key) {
  const values = rows
    .map((row) => row[key])
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
  return values.length ? values.reduce((total, value) => total + Number(value), 0) : null;
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

function normalizePriority(value) {
  const normalized = clean(value).toUpperCase().replace(/\s+/g, "");
  if (["A", "A級", "高", "高優先"].includes(normalized)) return "高";
  if (["B", "B級", "中", "中優先"].includes(normalized)) return "中";
  if (["C", "C級", "低", "低優先"].includes(normalized)) return "低";
  return clean(value);
}

function normalizeStatus(value) {
  return clean(value)
    .replaceAll("待發佈", "待發文")
    .replaceAll("待發布", "待發文")
    .replaceAll("已發佈", "已發文")
    .replaceAll("已發布", "已發文");
}

function compareNullableDescending(a, b) {
  const aMissing = a === null || a === undefined || !Number.isFinite(Number(a));
  const bMissing = b === null || b === undefined || !Number.isFinite(Number(b));
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : (aMissing ? 1 : -1);
  return Number(b) - Number(a);
}

function dateFreshnessValue(value) {
  const normalized = clean(value).replaceAll("/", "-");
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function toNullableNumber(value, fallback = null) {
  const text = clean(value);
  if (!text) return fallback;
  const parsed = Number(text.replace(/[NT$,\s]/g, "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableRate(value, fallback = null) {
  const text = clean(value);
  if (!text) return fallback;
  if (text.includes("%")) {
    const parsedPercent = toNullableNumber(text, fallback);
    return parsedPercent === null ? null : parsedPercent / 100;
  }
  const parsed = toNullableNumber(text, fallback);
  return parsed !== null && parsed > 1 ? parsed / 100 : parsed;
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

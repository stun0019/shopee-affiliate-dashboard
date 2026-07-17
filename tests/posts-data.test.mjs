import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(testDirectory, "../app.js");

function loadPostsCore() {
  const noop = () => {};
  const sandbox = vm.createContext({
    AbortController,
    Date,
    FileReader: class FileReader {},
    Intl,
    URL,
    console,
    document: {
      addEventListener: noop,
      querySelector: () => ({}),
      querySelectorAll: () => [],
    },
    fetch: async () => ({ ok: true, text: async () => "" }),
    window: {
      addEventListener: noop,
      clearTimeout: noop,
      devicePixelRatio: 1,
      setTimeout: noop,
    },
  });

  vm.runInContext(fs.readFileSync(appPath, "utf8"), sandbox, { filename: appPath });
  return vm.runInContext(
    "({ buildPostDataset, countPublishingStatuses, deriveProductId, inspectPostSchema, joinPostsToProducts, normalizePostRow, normalizePublishingStatus, parseCsv })",
    sandbox,
  );
}

const {
  buildPostDataset,
  countPublishingStatuses,
  deriveProductId,
  inspectPostSchema,
  joinPostsToProducts,
  normalizePostRow,
  normalizePublishingStatus,
  parseCsv,
} = loadPostsCore();

const headers = [
  "日期", "平台", "貼文類型", "商品名稱", "貼文主題", "貼文URL", "分潤連結", "是否發布", "備註",
  "post_id", "product_id", "status", "main_text", "reply_text", "disclosure", "time_slot", "selection_tier",
  "draft_source", "asset_source", "experiment_source", "affiliate_url_ref", "backup_product_id",
  "backup_product_name", "backup_reason", "source_calendar",
];

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function structuredRow(overrides = {}) {
  return {
    日期: "2026/07/18",
    平台: "Threads",
    貼文類型: "測試類型",
    商品名稱: "測試商品 A",
    貼文主題: "測試主題",
    貼文URL: "",
    分潤連結: "https://example.invalid/affiliate/001",
    是否發布: "否",
    備註: "",
    post_id: "TH-TEST-001",
    product_id: "test-product-001",
    status: "pending_review",
    main_text: "第一行\n第二行\n第三行",
    reply_text: "接著看\nhttps://example.invalid/affiliate/001\n分潤揭露",
    disclosure: "分潤揭露",
    time_slot: "",
    selection_tier: "主推",
    draft_source: "work/draft.md#test-product-001",
    asset_source: "work/assets.md#test-product-001",
    experiment_source: "work/experiment.md#test-product-001",
    affiliate_url_ref: "work/selection.csv#test-product-001",
    backup_product_id: "",
    backup_product_name: "",
    backup_reason: "",
    source_calendar: "work/calendar.md#test-product-001",
    ...overrides,
  };
}

function legacyRow() {
  return {
    日期: "2026/07/13",
    平台: "Threads",
    貼文類型: "清單型",
    商品名稱: "舊版範例",
    貼文主題: "舊版主題",
    貼文URL: "https://example.invalid/post/legacy",
    分潤連結: "https://example.invalid/affiliate/legacy",
    是否發布: "是",
    備註: "範例",
  };
}

function toCsv(rows, customHeaders = headers) {
  return [
    customHeaders.map(csvEscape).join(","),
    ...rows.map((row) => customHeaders.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ].join("\r\n");
}

test("RFC 4180 解析25欄、多行文字，空白與NBSP正規化為 null", () => {
  const row = structuredRow({ time_slot: "\u00A0", backup_reason: "   " });
  const parsed = parseCsv(toCsv([legacyRow(), row]));
  const normalized = normalizePostRow(parsed[1]);

  assert.equal(parsed.headers.length, 25);
  assert.equal(parsed[1].main_text, "第一行\n第二行\n第三行");
  assert.equal(normalized.timeSlot, null);
  assert.equal(normalized.backupReason, null);
  assert.equal(normalized.publishingStatus, "pending_review");
  assert.equal(normalized.dataState, "ready");
});

test("25欄 schema 接受正式貼文主題欄，也兼容實際分潤變體", () => {
  const official = parseCsv(toCsv([structuredRow()]));
  assert.equal(inspectPostSchema(official).valid, true);

  const revenueHeaders = headers.map((header) => header === "貼文主題" ? "實際分潤" : header);
  const revenueRow = structuredRow({ 實際分潤: "0" });
  delete revenueRow.貼文主題;
  const variant = parseCsv(toCsv([revenueRow], revenueHeaders));
  assert.equal(inspectPostSchema(variant).valid, true);
  assert.equal(normalizePostRow(variant[0]).revenue, 0);
});

test("舊版列被排除，結構化列以 product_id 精確 join", () => {
  const parsed = parseCsv(toCsv([legacyRow(), structuredRow()]));
  const products = [{ productId: "test-product-001", product: "商品池正式名稱", selectionScore: 92 }];
  const dataset = buildPostDataset(parsed, products);

  assert.equal(dataset.legacyRows.length, 1);
  assert.equal(dataset.rows.length, 1);
  assert.equal(dataset.rows[0].productRow.product, "商品池正式名稱");
  assert.equal(dataset.counts.pending_review, 1);
  assert.equal(dataset.dataState, "ready");
});

test("七種 status 正規化並正確計數", () => {
  const posts = [
    "draft", "pending_review", "approved", "scheduled", "published", "needs_backfill", "completed",
  ].map((status, index) => normalizePostRow(structuredRow({
    post_id: `TH-TEST-${String(index + 1).padStart(3, "0")}`,
    product_id: `test-product-${String(index + 1).padStart(3, "0")}`,
    status,
    time_slot: status === "scheduled" ? "早" : "",
    是否發布: ["published", "needs_backfill", "completed"].includes(status) ? "是" : "否",
    貼文URL: ["published", "needs_backfill", "completed"].includes(status) ? `https://example.invalid/post/${index}` : "",
  })));
  const counts = countPublishingStatuses(posts);

  for (const status of ["draft", "pending_review", "approved", "scheduled", "published", "needs_backfill", "completed"]) {
    assert.equal(counts[status], 1, status);
    assert.equal(normalizePublishingStatus(status), status);
  }
  assert.equal(normalizePublishingStatus("unknown_status"), "unknown");
});

test("未知狀態、重複 post_id 與缺少商品 join 產生 partial，不中斷可用列", () => {
  const rows = [
    structuredRow({ status: "unknown_status" }),
    structuredRow({ product_id: "test-product-002" }),
  ];
  const dataset = buildPostDataset(parseCsv(toCsv(rows)), []);

  assert.equal(dataset.rows.length, 2);
  assert.equal(dataset.dataState, "partial");
  assert.ok(dataset.duplicateIds.includes("TH-TEST-001"));
  assert.ok(dataset.rows.some((row) => row.issues.includes("missing:product-join")));
  assert.ok(dataset.rows.some((row) => row.issues.includes("invalid:status")));
});

test("商品 offer URL 可衍生成發文表 product_id", () => {
  assert.equal(
    deriveProductId("https://affiliate.shopee.tw/offer/product_offer/431861528"),
    "shopee-431861528",
  );
  assert.equal(deriveProductId("https://example.invalid/item"), "");
  assert.equal(joinPostsToProducts([], []).length, 0);
});

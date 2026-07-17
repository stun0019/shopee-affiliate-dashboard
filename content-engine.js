"use strict";

(function exposeContentEngine(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ContentEngine = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createContentEngine() {
  const INITIAL_STATUS = "draft";
  const DISCLOSURE = "（分潤連結，透過連結購買我可能獲得分潤）";
  const STATUS_TRANSITIONS = Object.freeze({
    draft: Object.freeze(["pending_review"]),
    pending_review: Object.freeze(["approved"]),
    approved: Object.freeze(["scheduled"]),
    scheduled: Object.freeze([]),
  });

  const FIELD_ALIASES = Object.freeze({
    productName: ["productName", "商品名稱"],
    sellingPoint: ["sellingPoint", "賣點"],
    recommendationAngle: ["recommendationAngle", "postAngle", "推薦角度"],
    audience: ["audience", "族群"],
    risk: ["risk", "可能風險"],
    affiliateUrl: ["affiliateUrl", "分潤連結"],
    weeklyRole: ["weeklyRole", "本週角色"],
  });

  const UNSAFE_PATTERNS = Object.freeze([
    /(?:我|本人)(?:已經|有|曾經|正在)?(?:用過|買過|吃過|喝過|試過|實測)/giu,
    /(?:親測|實測|使用後|用了?\s*\d+\s*天)/giu,
    /(?:NT\$?|TWD|新台幣|售價|價格)\s*[:：]?\s*[\d,.]+/giu,
    /(?:特價|優惠|折扣|限時|買一送一|免運|下殺|現省|最便宜)/giu,
    /(?:熱銷|爆賣|銷量|已售|萬人購買|人手一件)/giu,
    /(?:保證|一定|百分之百|100\s*%|立即見效|根治|治療|治癒|改善|有效|無副作用)/giu,
  ]);

  function firstValue(input, keys) {
    for (const key of keys) {
      const value = input && input[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return "";
  }

  function normalizeInput(input = {}) {
    return Object.fromEntries(
      Object.entries(FIELD_ALIASES).map(([field, aliases]) => [field, firstValue(input, aliases)]),
    );
  }

  function removeUrls(value) {
    return String(value || "")
      .replace(/(?:https?:\/\/|www\.)\S+/giu, "")
      .replace(/\b(?:s\.)?shopee\.(?:tw|com)\/\S*/giu, "");
  }

  function sanitizeClaim(value, fallback = "有個細節值得留意") {
    let cleaned = removeUrls(value);
    const containsUnsafeClaim = UNSAFE_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      const matched = pattern.test(cleaned);
      pattern.lastIndex = 0;
      return matched;
    });
    if (containsUnsafeClaim) return fallback;

    for (const pattern of UNSAFE_PATTERNS) {
      cleaned = cleaned.replace(pattern, "");
    }

    cleaned = cleaned
      .replace(/[\r\n\t]+/gu, " ")
      .replace(/\s{2,}/gu, " ")
      .replace(/^[\s，。、；：!?！？—-]+|[\s，。、；：!?！？—-]+$/gu, "")
      .trim();

    return cleaned || fallback;
  }

  function isValidAffiliateUrl(value) {
    if (!value) return false;
    try {
      const url = new URL(String(value).trim());
      return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
    } catch (_error) {
      return false;
    }
  }

  function normalizeAffiliateUrl(value) {
    return isValidAffiliateUrl(value) ? new URL(String(value).trim()).toString() : "";
  }

  function inferContentType(weeklyRole, recommendationAngle) {
    const context = `${weeklyRole} ${recommendationAngle}`;
    if (/避雷|風險|提醒|注意/gu.test(context)) return "風險提醒";
    if (/比較|對比|反差|省時/gu.test(context)) return "反差觀察";
    if (/情境|日常|生活|通勤|租屋/gu.test(context)) return "情境共鳴";
    if (/清單|整理|懶人包/gu.test(context)) return "重點整理";
    return "選物觀點";
  }

  function buildHook(contentType) {
    const hooks = {
      風險提醒: "先別急著跟風，真正該看的不是聲量。",
      反差觀察: "看起來不起眼，差別偏偏藏在小地方。",
      情境共鳴: "有些日常卡點，小到很煩、卻天天遇到。",
      重點整理: "選擇太多時，反而先抓一個重點就好。",
      選物觀點: "不是每個熱門選擇，都適合照單全收。",
    };
    return hooks[contentType];
  }

  function buildMainText(fields, contentType) {
    const productName = sanitizeClaim(fields.productName, "這個選擇");
    const sellingPoint = sanitizeClaim(fields.sellingPoint);
    const angle = sanitizeClaim(fields.recommendationAngle, "先看是否符合自己的需求");
    const audience = sanitizeClaim(fields.audience, "正在做選擇的人");

    return [
      buildHook(contentType),
      `${productName}讓我注意到的是：${sellingPoint}。`,
      `如果你是${audience}，可以從「${angle}」這點判斷適不適合。`,
    ].join("\n");
  }

  function buildReplyText(affiliateUrl) {
    const link = normalizeAffiliateUrl(affiliateUrl);
    return link
      ? `想看商品頁可以從這裡接著看：${link} ${DISCLOSURE}`
      : `商品連結尚待補上。${DISCLOSURE}`;
  }

  function createThreadsDraft(input) {
    const fields = normalizeInput(input);
    const contentType = inferContentType(fields.weeklyRole, fields.recommendationAngle);

    return Object.freeze({
      mainText: buildMainText(fields, contentType),
      replyText: buildReplyText(fields.affiliateUrl),
      disclosure: DISCLOSURE,
      contentType,
      status: INITIAL_STATUS,
    });
  }

  function hasApprovalLink(context = {}) {
    if (typeof context === "string") return isValidAffiliateUrl(context);
    if (isValidAffiliateUrl(context.affiliateUrl || context["分潤連結"])) return true;
    const replyText = String(context.replyText || "");
    const match = replyText.match(/https?:\/\/[^\s）)]+/iu);
    return Boolean(match && isValidAffiliateUrl(match[0]));
  }

  function canTransitionStatus(fromStatus, toStatus, context = {}) {
    const pathIsValid = Boolean(STATUS_TRANSITIONS[fromStatus]?.includes(toStatus));
    if (!pathIsValid) return false;
    if (toStatus === "approved") return hasApprovalLink(context);
    return true;
  }

  function transitionStatus(fromStatus, toStatus, context = {}) {
    if (!Object.hasOwn(STATUS_TRANSITIONS, fromStatus)) {
      throw new RangeError(`Unknown publishing status: ${fromStatus}`);
    }
    if (!Object.hasOwn(STATUS_TRANSITIONS, toStatus)) {
      throw new RangeError(`Unknown publishing status: ${toStatus}`);
    }
    if (toStatus === "approved" && !hasApprovalLink(context)) {
      throw new Error("An affiliate link is required before approval");
    }
    if (!canTransitionStatus(fromStatus, toStatus, context)) {
      throw new Error(`Illegal publishing status transition: ${fromStatus} -> ${toStatus}`);
    }
    return toStatus;
  }

  return Object.freeze({
    DISCLOSURE,
    INITIAL_STATUS,
    STATUS_TRANSITIONS,
    createThreadsDraft,
    isValidAffiliateUrl,
    canTransitionStatus,
    transitionStatus,
  });
}));

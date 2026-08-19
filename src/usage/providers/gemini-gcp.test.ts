import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GEMINI_FREE_TIER_FLASH,
  buildFreeTierQuotas,
  buildQuotasFromPublishedLimits,
  isQuotaApiUnavailable,
  maxPoint,
  peakAlignedSum,
  sumPoints,
  usedPercent,
} from "./gemini-gcp.js";

describe("isQuotaApiUnavailable", () => {
  it("matches Permission denied to get quota", () => {
    assert.equal(isQuotaApiUnavailable(new Error("Permission denied to get quota")), true);
  });

  it("matches SERVICE_DISABLED and billing errors", () => {
    assert.equal(isQuotaApiUnavailable("SERVICE_DISABLED: serviceusage.googleapis.com"), true);
    assert.equal(isQuotaApiUnavailable(new Error("Cloud Quotas API has not been used in project")), true);
    assert.equal(isQuotaApiUnavailable("The project has no billing account"), true);
  });

  it("does not match unrelated failures", () => {
    assert.equal(isQuotaApiUnavailable(new Error("Invalid service account JSON")), false);
    assert.equal(isQuotaApiUnavailable("GCP auth failed (HTTP 401)"), false);
    assert.equal(isQuotaApiUnavailable("Failed to reach serviceusage.googleapis.com"), false);
  });
});

describe("monitoring point helpers", () => {
  it("sums delta points and takes the peak", () => {
    const points = [
      { value: { int64Value: "4" }, interval: { endTime: "2026-08-19T01:00:00Z" } },
      { value: { int64Value: "11" }, interval: { endTime: "2026-08-19T01:01:00Z" } },
      { value: { doubleValue: 2 }, interval: { endTime: "2026-08-19T01:02:00Z" } },
    ];
    assert.equal(sumPoints(points), 17);
    assert.equal(maxPoint(points), 11);
  });

  it("peaks the aligned sum across series in the same minute", () => {
    const peak = peakAlignedSum([
      {
        points: [
          { value: { int64Value: "10" }, interval: { endTime: "t1" } },
          { value: { int64Value: "3" }, interval: { endTime: "t2" } },
        ],
      },
      {
        points: [{ value: { int64Value: "5" }, interval: { endTime: "t1" } }],
      },
    ]);
    assert.equal(peak, 15);
  });
});

describe("buildFreeTierQuotas", () => {
  it("maps 24h request counts onto published Flash RPD / RPM", () => {
    const quotas = buildFreeTierQuotas({
      requestCount24h: 750,
      peakRpm: 15,
      tokenCount24h: 0,
      peakTpm: 0,
    });
    assert.equal(quotas.length, 2);
    const rpd = quotas.find((q) => q.key === "gemini-free-rpd");
    const rpm = quotas.find((q) => q.key === "gemini-free-rpm");
    assert.equal(rpd?.usedCount, 750);
    assert.equal(rpd?.limitCount, GEMINI_FREE_TIER_FLASH.rpd);
    assert.equal(rpd?.usedPercent, 50);
    assert.equal(rpm?.usedPercent, 100);
  });

  it("adds a token window only for per-minute token usage", () => {
    const withPeak = buildFreeTierQuotas({
      requestCount24h: 0,
      peakRpm: 0,
      tokenCount24h: 0,
      peakTpm: 125_000,
    });
    const tpm = withPeak.find((q) => q.key === "gemini-free-tpm");
    assert.equal(tpm?.usedCount, 125_000);
    assert.equal(tpm?.limitCount, GEMINI_FREE_TIER_FLASH.tpm);
    assert.equal(tpm?.usedPercent, 50);

    const dailyOnly = buildFreeTierQuotas({
      requestCount24h: 10,
      peakRpm: 1,
      tokenCount24h: 1_000_000,
      peakTpm: 0,
    });
    assert.equal(
      dailyOnly.some((q) => q.key === "gemini-free-tpm"),
      false,
    );
  });
});

describe("buildQuotasFromPublishedLimits", () => {
  it("uses published Free Tier caps when allocation metrics have no official limit", () => {
    const quotas = buildQuotasFromPublishedLimits(
      new Map([
        ["generativelanguage.googleapis.com/generate_content_requests_per_day", 150],
        ["generativelanguage.googleapis.com/generate_content_tokens_per_minute", 25_000],
      ]),
    );
    assert.equal(quotas.length, 2);
    const rpd = quotas.find((q) => q.limitCount === GEMINI_FREE_TIER_FLASH.rpd);
    const tpm = quotas.find((q) => q.limitCount === GEMINI_FREE_TIER_FLASH.tpm);
    assert.equal(rpd?.usedPercent, 10);
    assert.equal(tpm?.usedPercent, 10);
  });

  it("skips allocation metrics that do not name a rate window", () => {
    const quotas = buildQuotasFromPublishedLimits(
      new Map([["generativelanguage.googleapis.com/generate_content_requests", 150]]),
    );
    assert.equal(quotas.length, 0);
  });
});

describe("usedPercent", () => {
  it("clamps and rounds to one decimal", () => {
    assert.equal(usedPercent(1, 3), 33.3);
    assert.equal(usedPercent(99, 10), 100);
    assert.equal(usedPercent(0, 0), 0);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractReportMarkdown,
  formatBytes,
  formatBytesPerSec,
  formatMemoryPair,
  memoryPercent,
  parseNetstatE,
  parseNvidiaSmi,
  parseProcNetDev,
  formatHostEnvMarkdown,
} from "./host-env.js";

describe("formatBytes", () => {
  it("formats gb and mb", () => {
    assert.equal(formatBytes(32 * 1024 * 1024 * 1024), "32.0 GB");
    assert.equal(formatBytes(512 * 1024 * 1024), "512 MB");
  });
});

describe("formatMemoryPair", () => {
  it("keeps both sides in the same unit", () => {
    assert.equal(formatMemoryPair(16 * 1024 ** 3, 32 * 1024 ** 3), "16.0 / 32.0 GB");
  });
});

describe("formatBytesPerSec", () => {
  it("appends /s", () => {
    assert.equal(formatBytesPerSec(512 * 1024 * 1024), "512 MB/s");
    assert.equal(formatBytesPerSec(null), "—");
  });
});

describe("memoryPercent", () => {
  it("rounds to one decimal", () => {
    assert.equal(memoryPercent(16 * 1024 ** 3, 32 * 1024 ** 3), 50);
    assert.equal(memoryPercent(1, 0), null);
  });
});

describe("parseNetstatE", () => {
  it("reads received and sent bytes", () => {
    const parsed = parseNetstatE(`
Interface Statistics

                           Received            Sent

Bytes                    1234567890         987654321
Unicast packets               11111             22222
`);
    assert.deepEqual(parsed, { rx: 1234567890, tx: 987654321 });
  });
});

describe("parseProcNetDev", () => {
  it("sums non-loopback interfaces", () => {
    const parsed = parseProcNetDev(`
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 100 0 0 0 0 0 0 0 100 0 0 0 0 0 0 0
  eth0: 200 1 0 0 0 0 0 0 300 1 0 0 0 0 0 0
  wlan0: 50 1 0 0 0 0 0 0 70 1 0 0 0 0 0 0
`);
    assert.deepEqual(parsed, { rx: 250, tx: 370 });
  });
});

describe("parseNvidiaSmi", () => {
  it("parses csv noheader", () => {
    const gpu = parseNvidiaSmi("NVIDIA GeForce RTX 4070, 12, 2048, 12288");
    assert.equal(gpu?.name, "NVIDIA GeForce RTX 4070");
    assert.equal(gpu?.usagePercent, 12);
    assert.equal(gpu?.memoryUsedBytes, 2048 * 1024 * 1024);
  });
});

describe("extractReportMarkdown", () => {
  it("unwraps a markdown fence", () => {
    assert.equal(extractReportMarkdown("```md\n# Hi\n```"), "# Hi");
  });
});

describe("formatHostEnvMarkdown", () => {
  it("includes cpu memory and listeners", () => {
    const text = formatHostEnvMarkdown({
      capturedAt: "2026-08-19T00:00:00.000Z",
      platform: "win32",
      release: "10.0",
      arch: "x64",
      cpu: { model: "Test CPU", cores: 8, usagePercent: 12.5 },
      memory: { totalBytes: 32 * 1024 ** 3, usedBytes: 16 * 1024 ** 3 },
      network: { rxBytesPerSec: 1200, txBytesPerSec: 800 },
      gpu: null,
      listeners: [
        { protocol: "tcp", port: 3000, address: "0.0.0.0", pid: 12345, processName: "node.exe" },
      ],
    });
    assert.match(text, /cpu usage: 12.5%/u);
    assert.match(text, /node\.exe/u);
    assert.match(text, /not detected/u);
  });
});

import { describe, it } from "node:test";
import { strictEqual, throws } from "node:assert";
import {
  convertSemverToWsVersion,
  convertSemverRangeToWsRange,
  compareWsVersions,
  isValidWsVersion,
  isValidWsRange,
  encodePrereleaseToNumber,
} from "./index.ts";

describe("convertSemverToWsVersion", () => {
  it("converts regular versions", () => {
    strictEqual(convertSemverToWsVersion("1.0.0"), "1.0.0.9999");
    strictEqual(convertSemverToWsVersion("2.5.3"), "2.5.3.9999");
    strictEqual(convertSemverToWsVersion("0.1.2"), "0.1.2.9999");
  });

  it("converts alpha prerelease", () => {
    strictEqual(convertSemverToWsVersion("1.0.0-alpha"), "1.0.0.1000");
    strictEqual(convertSemverToWsVersion("1.0.0-alpha.1"), "1.0.0.1001");
    strictEqual(convertSemverToWsVersion("1.0.0-alpha.2"), "1.0.0.1002");
  });

  it("converts beta prerelease", () => {
    strictEqual(convertSemverToWsVersion("1.0.0-beta"), "1.0.0.2000");
    strictEqual(convertSemverToWsVersion("1.0.0-beta.1"), "1.0.0.2001");
  });

  it("converts rc prerelease", () => {
    strictEqual(convertSemverToWsVersion("1.0.0-rc.1"), "1.0.0.3001");
  });

  it("converts numeric prerelease", () => {
    strictEqual(convertSemverToWsVersion("1.0.0-1"), "1.0.0.5001");
  });

  it("throws on invalid version", () => {
    throws(() => convertSemverToWsVersion("not-a-version"));
  });

  it("throws when components exceed 999", () => {
    throws(() => convertSemverToWsVersion("1000.0.0"));
    throws(() => convertSemverToWsVersion("0.1000.0"));
    throws(() => convertSemverToWsVersion("0.0.1000"));
  });
});

describe("encodePrereleaseToNumber", () => {
  it("returns 9999 for empty prerelease", () => {
    strictEqual(encodePrereleaseToNumber([]), 9999);
  });

  it("encodes alpha/beta/rc with correct base", () => {
    strictEqual(encodePrereleaseToNumber(["alpha"]), 1000);
    strictEqual(encodePrereleaseToNumber(["beta"]), 2000);
    strictEqual(encodePrereleaseToNumber(["rc"]), 3000);
  });

  it("adds numeric offset", () => {
    strictEqual(encodePrereleaseToNumber(["alpha", 5]), 1005);
    strictEqual(encodePrereleaseToNumber(["beta", 3]), 2003);
    strictEqual(encodePrereleaseToNumber(["rc", 1]), 3001);
  });
});

describe("compareWsVersions", () => {
  it("returns 0 for equal versions", () => {
    strictEqual(compareWsVersions("1.0.0.9999", "1.0.0.9999"), 0);
  });

  it("compares major versions", () => {
    strictEqual(compareWsVersions("1.0.0.9999", "2.0.0.9999"), -1);
    strictEqual(compareWsVersions("2.0.0.9999", "1.0.0.9999"), 1);
  });

  it("compares prerelease vs release", () => {
    strictEqual(compareWsVersions("1.0.0.1000", "1.0.0.9999"), -1);
  });

  it("preserves semver ordering", () => {
    const versions = ["1.0.0-alpha.1", "1.0.0-alpha.2", "1.0.0-beta.1", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0"];
    const wsVersions = versions.map(convertSemverToWsVersion);

    for (let i = 0; i < wsVersions.length - 1; i++) {
      strictEqual(compareWsVersions(wsVersions[i], wsVersions[i + 1]), -1);
    }
  });
});

describe("isValidWsVersion", () => {
  it("accepts valid versions", () => {
    strictEqual(isValidWsVersion("1.0.0"), true);
    strictEqual(isValidWsVersion("1.0.0.0"), true);
    strictEqual(isValidWsVersion("2.5.3.123"), true);
    strictEqual(isValidWsVersion("0.01.002"), true);
  });

  it("rejects invalid versions", () => {
    strictEqual(isValidWsVersion("1.0"), false);
    strictEqual(isValidWsVersion("1.0.0.0.0"), false);
    strictEqual(isValidWsVersion("1.a.0"), false);
  });
});

describe("convertSemverRangeToWsRange", () => {
  it("converts exact versions", () => {
    strictEqual(convertSemverRangeToWsRange("1.2.3"), "1.2.3.9999");
  });

  it("converts caret ranges", () => {
    strictEqual(convertSemverRangeToWsRange("^1.2.3"), "^1.2.3.9999");
    strictEqual(convertSemverRangeToWsRange("^1.0.0-alpha.1"), "^1.0.0.1001");
  });

  it("converts tilde ranges to caret", () => {
    strictEqual(convertSemverRangeToWsRange("~1.2.3"), "^1.2.3.9999");
    strictEqual(convertSemverRangeToWsRange("~2.1.0-beta.5"), "^2.1.0.2005");
  });

  it("converts wildcard", () => {
    strictEqual(convertSemverRangeToWsRange("*"), "^0.0.0.0");
  });

  it("throws on invalid range", () => {
    throws(() => convertSemverRangeToWsRange("^not-valid"));
  });
});

describe("isValidWsRange", () => {
  it("accepts valid ranges", () => {
    strictEqual(isValidWsRange("1.0.0.0"), true);
    strictEqual(isValidWsRange("^1.0.0.0"), true);
    strictEqual(isValidWsRange("^0.0.0.0"), true);
  });

  it("rejects invalid ranges", () => {
    strictEqual(isValidWsRange("^1.0"), false);
    strictEqual(isValidWsRange("^1.a.0.0"), false);
    strictEqual(isValidWsRange("~1.0.0.0"), false);
  });
});

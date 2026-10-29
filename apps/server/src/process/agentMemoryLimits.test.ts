import { describe, expect, it } from "@effect/vitest";
import { agentMemoryPlan } from "./agentMemoryLimits.ts";

const GiB = 1024 ** 3;
const plan = (
  environment: Record<string, string> = {},
  currentHigh = "infinity",
  currentMax = "infinity",
  totalBytes = 16 * GiB,
) => agentMemoryPlan({ totalBytes, currentHigh, currentMax, environment });

describe("agentMemoryPlan", () => {
  it.each(["1610612736", "1.5G", "1536MiB"])("accepts a byte size %s", (size) => {
    expect(plan({ T3CODE_AGENT_MEMORY_HIGH: size }, "infinity", String(12 * GiB))).toEqual({
      ok: true,
      assignments: ["MemoryHigh=1610612736"],
    });
  });
  it.each([
    [8, 4, 6],
    [16, 10, 12],
    [64, 58, 60],
  ])("sizes defaults for a %i GiB machine", (total, high, max) => {
    expect(plan({}, "infinity", "infinity", total * GiB)).toEqual({
      ok: true,
      assignments: [`MemoryHigh=${high * GiB}`, `MemoryMax=${max * GiB}`],
    });
  });
  it("preserves systemd settings when no environment override is given", () => {
    expect(plan({}, String(11 * GiB), String(12 * GiB))).toEqual({ ok: true, assignments: [] });
  });
  it("applies explicit byte-size and percentage overrides even after previous automatic limits", () => {
    expect(
      plan(
        { T3CODE_AGENT_MEMORY_HIGH: "11GiB", T3CODE_AGENT_MEMORY_MAX: "75%" },
        String(10 * GiB),
        String(12 * GiB),
      ),
    ).toEqual({ ok: true, assignments: [`MemoryHigh=${11 * GiB}`, `MemoryMax=${12 * GiB}`] });
  });
  it("can explicitly recompute defaults after a restart", () => {
    expect(
      plan({ T3CODE_AGENT_MEMORY_HIGH: "auto", T3CODE_AGENT_MEMORY_MAX: "auto" }, "123", "456"),
    ).toEqual(plan());
  });
  it("can explicitly remove both limits", () => {
    expect(
      plan({ T3CODE_AGENT_MEMORY_HIGH: "infinity", T3CODE_AGENT_MEMORY_MAX: "infinity" }),
    ).toEqual({ ok: true, assignments: ["MemoryHigh=infinity", "MemoryMax=infinity"] });
  });
  it.each(["0", "-1G", "101%", "0%", "NaN", "bogus", "99999999999999999G"])(
    "rejects an invalid override %s without any writes",
    (value) => {
      expect(plan({ T3CODE_AGENT_MEMORY_HIGH: value }).ok).toBe(false);
    },
  );
  it("rejects conflicting explicit limits as a pair", () => {
    expect(plan({ T3CODE_AGENT_MEMORY_HIGH: "12G", T3CODE_AGENT_MEMORY_MAX: "11G" }).ok).toBe(
      false,
    );
  });
  it("fits an automatic high limit under an existing small hard limit", () => {
    expect(plan({}, "infinity", String(3 * GiB))).toEqual({
      ok: true,
      assignments: [`MemoryHigh=${3 * GiB}`],
    });
  });
  it("fits an automatic hard limit above an existing high limit", () => {
    expect(plan({}, String(13 * GiB))).toEqual({
      ok: true,
      assignments: [`MemoryMax=${13 * GiB}`],
    });
  });
  it("does not guess missing systemd values", () => {
    expect(
      agentMemoryPlan({
        totalBytes: 16 * GiB,
        currentHigh: undefined,
        currentMax: "infinity",
        environment: {},
      }).ok,
    ).toBe(false);
  });
  it("allows a disabled soft limit with a finite hard limit", () => {
    expect(plan({ T3CODE_AGENT_MEMORY_HIGH: "infinity", T3CODE_AGENT_MEMORY_MAX: "12G" })).toEqual({
      ok: true,
      assignments: ["MemoryHigh=infinity", `MemoryMax=${12 * GiB}`],
    });
  });
});

type Limit = number | "infinity";
type Choice = { value: Limit; automatic: boolean; write: boolean };
const GiB = 1024 ** 3;

function parseLimit(raw: string, totalBytes: number): Limit | undefined {
  if (raw.toLowerCase() === "infinity") return "infinity";
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(raw);
  if (percent) {
    const value = Number(percent[1]);
    const bytes = Math.floor((totalBytes * value) / 100);
    return value > 0 && value <= 100 && Number.isSafeInteger(bytes) && bytes > 0
      ? bytes
      : undefined;
  }
  const size = /^(\d+(?:\.\d+)?)(B|K(?:i?B)?|M(?:i?B)?|G(?:i?B)?|T(?:i?B)?)?$/i.exec(raw);
  if (!size) return undefined;
  const unit = size[2]?.[0]?.toUpperCase() ?? "B";
  const exponent = { B: 0, K: 1, M: 2, G: 3, T: 4 }[unit];
  if (exponent === undefined) return undefined;
  const bytes = Math.floor(Number(size[1]) * 1024 ** exponent);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : undefined;
}

export function agentMemoryPlan(input: {
  readonly totalBytes: number;
  readonly currentHigh: string | undefined;
  readonly currentMax: string | undefined;
  readonly environment: Readonly<Record<string, string | undefined>>;
}):
  | { readonly ok: true; readonly assignments: ReadonlyArray<string> }
  | { readonly ok: false; readonly error: string } {
  const { totalBytes, environment } = input;
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
    return { ok: false, error: "Cannot determine usable machine memory." };
  }
  const defaults = {
    high: Math.max(1, totalBytes - 6 * GiB, Math.floor(totalBytes / 2)),
    max: Math.max(1, totalBytes - 4 * GiB, Math.floor(totalBytes * 0.75)),
  };
  const choices: Choice[] = [];
  for (const [name, current, fallback] of [
    ["T3CODE_AGENT_MEMORY_HIGH", input.currentHigh, defaults.high],
    ["T3CODE_AGENT_MEMORY_MAX", input.currentMax, defaults.max],
  ] as const) {
    const raw = environment[name]?.trim();
    if (raw && raw.toLowerCase() !== "auto") {
      const value = parseLimit(raw, totalBytes);
      if (value === undefined) {
        return {
          ok: false,
          error: `${name} must be a positive byte size, a percentage greater than 0 and at most 100, auto, or infinity.`,
        };
      }
      choices.push({ value, automatic: false, write: true });
    } else if (raw?.toLowerCase() === "auto" || current === "infinity") {
      choices.push({ value: fallback, automatic: true, write: true });
    } else if (
      current !== undefined &&
      /^\d+$/.test(current) &&
      Number.isSafeInteger(Number(current))
    ) {
      choices.push({ value: Number(current), automatic: false, write: false });
    } else {
      // A partial query cannot establish a safe pair of limits.
      return {
        ok: false,
        error: "Could not read both systemd memory limits; leaving them unchanged.",
      };
    }
  }
  const [high, max] = choices as [Choice, Choice];
  if (typeof high.value === "number" && typeof max.value === "number" && high.value > max.value) {
    if (high.automatic) high.value = max.value;
    else if (max.automatic) max.value = high.value;
    else
      return {
        ok: false,
        error:
          "Agent memory high limit must not exceed the maximum; leaving both limits unchanged.",
      };
  }
  return {
    ok: true,
    assignments: choices.flatMap((choice, index) =>
      choice.write ? [`${index === 0 ? "MemoryHigh" : "MemoryMax"}=${choice.value}`] : [],
    ),
  };
}

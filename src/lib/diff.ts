export type DiffLine = { type: "same" | "add" | "del"; text: string };

/** Line diff via LCS (after trimming the common prefix/suffix, which keeps the DP table small) */
export function diffLines(a: string[], b: string[]): DiffLine[] {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
    }

    const midA = a.slice(start, endA);
    const midB = b.slice(start, endB);
    const n = midA.length;
    const m = midB.length;
    // lcs[i * (m + 1) + j] = LCS length of midA[i:] and midB[j:]
    const lcs = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            lcs[i * (m + 1) + j] =
                midA[i] === midB[j]
                    ? lcs[(i + 1) * (m + 1) + j + 1] + 1
                    : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
        }
    }

    const out: DiffLine[] = a.slice(0, start).map((text) => ({ type: "same", text }));
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (midA[i] === midB[j]) {
            out.push({ type: "same", text: midA[i] });
            i++;
            j++;
        } else if (lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1]) {
            out.push({ type: "del", text: midA[i++] });
        } else {
            out.push({ type: "add", text: midB[j++] });
        }
    }
    while (i < n) out.push({ type: "del", text: midA[i++] });
    while (j < m) out.push({ type: "add", text: midB[j++] });
    for (const text of a.slice(endA)) out.push({ type: "same", text });
    return out;
}

/**
 * Canonical JSON for diffing: object keys sorted, and arrays of named objects
 * (containers, env vars, secrets, volumes…) sorted by name so reordering isn't reported as a change.
 */
export function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        const items = value.map(canonicalize);
        const named = items.every(
            (v) => typeof v === "object" && v !== null && typeof (v as { name?: unknown }).name === "string",
        );
        return named && items.length > 1
            ? [...items].sort((x, y) => ((x as { name: string }).name < (y as { name: string }).name ? -1 : 1))
            : items;
    }
    if (typeof value === "object" && value !== null) {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]),
        );
    }
    return value;
}

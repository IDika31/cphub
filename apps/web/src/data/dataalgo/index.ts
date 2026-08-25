import type { Algo } from "./types";

export type { Algo, AlgoLevel, AlgoCategory } from "./types";
export { CATEGORIES, LEVEL_ORDER } from "./types";

/**
 * Loads the algorithm library on demand. It is a few hundred KB of source text,
 * so it stays out of the page bundle until the panel is actually opened.
 */
export async function loadAlgos(): Promise<Algo[]> {
  const mods = await Promise.all([
    import("./math"),
    import("./sorting"),
    import("./ds"),
    import("./graph"),
    import("./graph-advanced"),
    import("./tree"),
    import("./dp"),
    import("./string"),
    import("./geometry"),
    import("./misc"),
  ]);
  return mods.flatMap((m) => m.default);
}

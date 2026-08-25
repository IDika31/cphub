/** One place to name a provider. `tlx` is the official tlx.toki.id; `tlx-custom`
 *  is a self-hosted Judgels instance the user added in the extension. Conflating
 *  the two made Connections and the dashboard ambiguous, so they stay separate
 *  everywhere. */
export const PROVIDER_TLX = "tlx";
export const PROVIDER_TLX_CUSTOM = "tlx-custom";
export const PROVIDER_CODEFORCES = "codeforces";

const LABELS: Record<string, string> = {
  [PROVIDER_CODEFORCES]: "Codeforces",
  [PROVIDER_TLX]: "TLX TOKI",
  [PROVIDER_TLX_CUSTOM]: "tlx-custom",
  google: "Google",
};

/** `name` is what the user called a self-hosted instance in the extension. It
 *  wins over the host, which is only a fallback identity — nobody wants to read
 *  `tlx-cpc.compfest.id` in a navbar when they called it "COMPFEST CPC". */
export function providerLabel(provider: string, handle?: string, name?: string): string {
  if (provider === PROVIDER_TLX_CUSTOM) {
    const named = name?.trim();
    if (named) return named;
    if (handle) return `tlx-${handle}`;
  }
  return LABELS[provider] ?? provider ?? "—";
}

/** The account identity to print beside a provider label. `handle` means username
 *  everywhere except tlx-custom, which keeps the instance host there and the real
 *  username in `providerUsername` — so a self-hosted instance used to show a
 *  domain in the slot where Codeforces shows a person. Returns "" when the label
 *  already contains it, so nothing prints twice. */
export function accountIdentity(label: string, handle?: string, providerUsername?: string): string {
  const id = providerUsername?.trim() || handle?.trim() || "";
  return id && !label.includes(id) ? id : "";
}

/** Badge variant per provider, so colour carries the same distinction. */
export function providerBadge(provider: string): "cf" | "difficulty" | "verdict-ce" | "time" {
  switch (provider) {
    case PROVIDER_CODEFORCES:
      return "cf";
    case PROVIDER_TLX:
      return "difficulty";
    case PROVIDER_TLX_CUSTOM:
      return "verdict-ce";
    default:
      return "time";
  }
}

export function isTLXFamily(provider: string): boolean {
  return provider === PROVIDER_TLX || provider === PROVIDER_TLX_CUSTOM;
}

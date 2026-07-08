// User-facing copy for the manual market-value tracker. Centralized so the
// honesty test (MarketValuePanel.test.tsx) guards one source, shared by the
// record panel and the archive card.
//
// Honesty (CLAUDE.md §3): the value is a number the USER types — never live,
// fetched, AI-derived, or "market data". The wording is deliberately phrased
// without capability-claim trap words so the FORBIDDEN_CLAIM_TERMS guard passes
// without relying on awkward negations.
export const MARKET_VALUE_COPY = {
  heading: 'Market value',
  help: 'A manual estimate you enter of what this piece could be worth now — your own number, kept over time. Nothing is fetched or priced for you.',
  inputLabel: 'Current estimated value',
  button: 'Record value',
  cardLabel: 'Market value · manual estimate',
  latestLabel: 'Latest recorded',
  emptyHint:
    'No market value recorded yet — add a manual estimate when you edit this piece.',
} as const

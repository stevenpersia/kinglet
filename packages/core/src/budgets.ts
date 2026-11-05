import { t } from './i18n.ts';

/** A performance budget: limits a page (or a group of pages) must stay under. null: no limit. */
export interface Budget {
  id: string;
  /** Path, with * wildcards: "/", "/blog/*", "*" for every page. */
  path: string;
  /** Weight transferred (document + resources), KB. */
  maxKb: number | null;
  /** Largest Contentful Paint, ms. */
  lcpMs: number | null;
  /** Cumulative Layout Shift. */
  cls: number | null;
  /** Number of requests. */
  maxRequests: number | null;
}

/** What one device measured on one page. */
export interface BudgetMeasure {
  deviceId: string;
  label: string;
  bytes: number | null;
  requests: number | null;
  lcpMs: number | null;
  cls: number | null;
}

export type BudgetMetric = 'weight' | 'lcp' | 'cls' | 'requests';

export interface BudgetResult {
  budgetId: string;
  path: string;
  metric: BudgetMetric;
  limit: number;
  /** Worst value among the devices (null: not measured). */
  value: number | null;
  device: string | null;
  ok: boolean;
}

/** "/blog/*" matches "/blog/a"; "*" matches everything; trailing slashes don't matter. */
export function pathMatches(pattern: string, path: string): boolean {
  const p = pattern.trim() || '*';
  const strip = (s: string) => (s.length > 1 ? s.replace(/\/+$/, '') : s);
  const re = new RegExp(`^${strip(p).split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return re.test(strip(path));
}

export const DEFAULT_BUDGET = (): Budget => ({ id: `b${Date.now().toString(36)}`, path: '/', maxKb: 500, lcpMs: 2500, cls: 0.1, maxRequests: null });

/** Every budget whose path matches the page, against the worst device. */
export function evaluateBudgets(budgets: Budget[], path: string, measures: BudgetMeasure[]): BudgetResult[] {
  const out: BudgetResult[] = [];
  for (const b of budgets.filter((x) => pathMatches(x.path, path))) {
    const check = (metric: BudgetMetric, limit: number | null, pick: (m: BudgetMeasure) => number | null) => {
      if (limit == null) return;
      const vals = measures.map((m) => ({ m, v: pick(m) })).filter((x): x is { m: BudgetMeasure; v: number } => x.v != null);
      const worst = vals.sort((a, b2) => b2.v - a.v)[0];
      out.push({ budgetId: b.id, path: b.path, metric, limit, value: worst?.v ?? null, device: worst?.m.label ?? null, ok: !worst || worst.v <= limit });
    };
    check('weight', b.maxKb, (m) => (m.bytes == null ? null : Math.round(m.bytes / 1024)));
    check('lcp', b.lcpMs, (m) => m.lcpMs);
    check('cls', b.cls, (m) => m.cls);
    check('requests', b.maxRequests, (m) => m.requests);
  }
  return out;
}

export function budgetMetricLabel(m: BudgetMetric): string {
  return m === 'weight' ? t('Weight', 'Poids') : m === 'lcp' ? 'LCP' : m === 'cls' ? 'CLS' : t('Requests', 'Requêtes');
}

/** "742 KB", "2.8 s", "0.12", "54". */
export function formatBudgetValue(m: BudgetMetric, v: number): string {
  if (m === 'weight') return `${Math.round(v)} ${t('KB', 'Ko')}`;
  if (m === 'lcp') return v < 1000 ? `${Math.round(v)} ms` : `${t((v / 1000).toFixed(1), (v / 1000).toFixed(1).replace('.', ','))} s`;
  if (m === 'cls') return t(v.toFixed(2), v.toFixed(2).replace('.', ','));
  return String(Math.round(v));
}

/** One line per exceeded budget: "/ · Weight 742 KB > 500 KB (iPhone 16)". */
export function describeFailures(results: BudgetResult[]): string[] {
  return results
    .filter((r) => !r.ok && r.value != null)
    .map((r) => `${r.path} · ${budgetMetricLabel(r.metric)} ${formatBudgetValue(r.metric, r.value!)} > ${formatBudgetValue(r.metric, r.limit)}${r.device ? ` (${r.device})` : ''}`);
}

export { BOTS, type BotId } from './bots.ts';
export { parseMeta, readPageMeta, type PageMeta, type FetchOptions } from './meta.ts';
export { probeImage, type ImageProbe } from './image.ts';
export {
  checkShare,
  runChecks,
  score,
  isNonProduction,
  CHECK_GROUPS,
  HEAVY_IMAGE_BYTES,
  type Issue,
  type Severity,
  type CheckResult,
  type CheckGroup,
  type CheckStatus,
  type CheckInput,
  type RenderedDevice,
  type Vitals,
  type AxeSummary,
  type AxeViolation,
  type AxeImpact,
  type FormsSummary,
} from './checks.ts';
export { readSiteFiles, parseRobots, parseSitemap, type SiteFiles } from './site.ts';
export { crawl, type CrawledPage } from './crawl.ts';
export { detectFramework, type Framework } from './meta.ts';
export { PLATFORMS, buildCard, readSharePreviews, type Platform, type PlatformFamily, type ShareCard, type CardStatus, type SharePreviews } from './share.ts';
export { buildShareFix, guessSiteName, isAddedLine, type ShareFix } from './fix.ts';
export {
  VercelClient,
  VercelError,
  VERCEL_API,
  parseProject,
  parseDeployment,
  previewsByBranch,
  samePageOn,
  vercelBypassHeaders,
  type VercelUser,
  type VercelTeam,
  type VercelProject,
  type VercelDeployment,
  type DeploymentState,
} from './vercel.ts';
export { fetchExplained } from './net.ts';
export { t, setLanguage, getLanguage, locale, ago, resolveLanguage, type Language } from './i18n.ts';
export { consolePrompt, formatEntries, groupEntries, type ConsoleEntry } from './console.ts';
export { readStructuredData, flattenJsonLd, richKindLabel, type StructuredData, type StructuredItem, type RichPreview, type RichKind } from './structured.ts';
export { readHreflang, checkHreflangTags, type HreflangReport, type HreflangIssue, type HreflangAlternate } from './hreflang.ts';
export { auditSite, auditPrompt, type SiteAudit, type AuditPage, type BrokenLink, type Duplicate } from './audit.ts';
export { evaluateBudgets, pathMatches, describeFailures, budgetMetricLabel, formatBudgetValue, DEFAULT_BUDGET, type Budget, type BudgetMeasure, type BudgetResult, type BudgetMetric } from './budgets.ts';

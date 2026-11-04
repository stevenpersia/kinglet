/** "*\/api/plans*" matches "http://localhost:3000/api/plans?x=1" (* = anything, ? = one character). */
export function globMatch(pattern: string, url: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  return re.test(url);
}

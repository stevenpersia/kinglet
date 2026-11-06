import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChangedFile, DiffLine, WorkingChanges } from '../shared/types';

/** git's empty tree: the base when the repository has no commit yet. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const MAX_DIFF = 3 << 20;
const MAX_LINES = 4000;
const MAX_UNTRACKED = 256 << 10;

const git = (folder: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile('git', ['-C', folder, '-c', 'core.quotepath=off', ...args], { timeout: 10_000, maxBuffer: MAX_DIFF * 2 }, (err, out) => (err ? reject(err) : resolve(out))),
  );

/** Splits `git diff` output into files, each with its numbered lines. */
export function parseDiff(text: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let cur: ChangedFile | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = / b\/(.*)$/.exec(raw);
      cur = { path: m?.[1] ?? raw.slice(11), oldPath: null, status: 'M', added: 0, removed: 0, binary: false, truncated: false, lines: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith('new file mode')) cur.status = 'A';
    else if (raw.startsWith('deleted file mode')) cur.status = 'D';
    else if (raw.startsWith('rename from ')) {
      cur.oldPath = raw.slice(12);
      cur.status = 'R';
    } else if (raw.startsWith('Binary files ')) cur.binary = true;
    else if (raw.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      oldNo = Number(m?.[1] ?? 0);
      newNo = Number(m?.[2] ?? 0);
      push(cur, { kind: 'hunk', text: raw, old: null, new: null });
    } else if (cur.lines.length && !raw.startsWith('\\')) {
      // Header lines (index, ---, +++) come before the first hunk and are skipped.
      if (raw.startsWith('+')) {
        cur.added++;
        push(cur, { kind: 'add', text: raw.slice(1), old: null, new: newNo++ });
      } else if (raw.startsWith('-')) {
        cur.removed++;
        push(cur, { kind: 'del', text: raw.slice(1), old: oldNo++, new: null });
      } else if (raw.startsWith(' ')) push(cur, { kind: 'ctx', text: raw.slice(1), old: oldNo++, new: newNo++ });
    }
  }
  return files;
}

function push(f: ChangedFile, line: DiffLine) {
  if (f.lines.length < MAX_LINES) f.lines.push(line);
  else f.truncated = true;
}

/** An untracked file, shown as all added. */
async function untracked(folder: string, path: string): Promise<ChangedFile> {
  const file: ChangedFile = { path, oldPath: null, status: '?', added: 0, removed: 0, binary: false, truncated: false, lines: [] };
  try {
    const full = join(folder, path);
    const st = await stat(full);
    if (!st.isFile()) return file;
    const buf = await readFile(full);
    const head = buf.subarray(0, Math.min(buf.length, MAX_UNTRACKED));
    if (head.includes(0)) {
      file.binary = true;
      return file;
    }
    const lines = head.toString('utf8').split('\n');
    if (lines.at(-1) === '') lines.pop();
    file.added = lines.length;
    file.truncated = buf.length > MAX_UNTRACKED;
    lines.forEach((text, i) => push(file, { kind: 'add', text, old: null, new: i + 1 }));
  } catch {
    /* removed meanwhile */
  }
  return file;
}

/** What changed in the folder since the last commit: staged, unstaged and new files. */
export async function readChanges(folder: string): Promise<WorkingChanges> {
  try {
    await git(folder, ['rev-parse', '--is-inside-work-tree']);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    return { repo: false, branch: null, files: [], error: err.code === 'ENOENT' ? 'git' : null };
  }
  const base = await git(folder, ['rev-parse', '--verify', '-q', 'HEAD']).then(() => 'HEAD', () => EMPTY_TREE);
  const branch = await git(folder, ['rev-parse', '--abbrev-ref', 'HEAD']).then((b) => b.trim(), () => null);
  const [diff, others] = await Promise.all([
    git(folder, ['diff', base, '--no-color', '--no-ext-diff', '-M', '--']).catch(() => ''),
    git(folder, ['ls-files', '--others', '--exclude-standard', '-z']).catch(() => ''),
  ]);
  const files = parseDiff(diff.length > MAX_DIFF ? diff.slice(0, MAX_DIFF) : diff);
  const news = others.split('\0').filter(Boolean).slice(0, 200);
  files.push(...(await Promise.all(news.map((p) => untracked(folder, p)))));
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { repo: true, branch, files, error: null };
}

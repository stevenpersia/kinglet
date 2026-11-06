import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDiff, readChanges } from './changes';

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
 --- not a header
diff --git a/old.txt b/new.txt
similarity index 90%
rename from old.txt
rename to new.txt
diff --git a/img.png b/img.png
new file mode 100644
Binary files /dev/null and b/img.png differ
`;

describe('parseDiff', () => {
  it('splits files, counts lines and numbers them', () => {
    const files = parseDiff(DIFF);
    expect(files.map((f) => [f.path, f.status])).toEqual([
      ['src/a.ts', 'M'],
      ['new.txt', 'R'],
      ['img.png', 'A'],
    ]);
    const a = files[0]!;
    expect([a.added, a.removed]).toEqual([1, 1]);
    expect(a.lines.map((l) => [l.kind, l.old, l.new])).toEqual([
      ['hunk', null, null],
      ['ctx', 1, 1],
      ['del', 2, null],
      ['add', null, 2],
      ['ctx', 3, 3],
    ]);
    expect(files[1]!.oldPath).toBe('old.txt');
    expect(files[2]!.binary).toBe(true);
  });
});

describe('readChanges', () => {
  it('lists modified and new files of a repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kinglet-changes-'));
    const g = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args]);
    g('init', '-q');
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n');
    g('add', '.');
    g('commit', '-qm', 'init');
    writeFileSync(join(dir, 'a.txt'), 'one\n2\n');
    writeFileSync(join(dir, 'b.txt'), 'new\n');
    const r = await readChanges(dir);
    expect(r.repo).toBe(true);
    expect(r.files.map((f) => [f.path, f.status, f.added, f.removed])).toEqual([
      ['a.txt', 'M', 1, 1],
      ['b.txt', '?', 1, 0],
    ]);
  });

  it('says when the folder is not a repository', async () => {
    const r = await readChanges(mkdtempSync(join(tmpdir(), 'kinglet-norepo-')));
    expect(r.repo).toBe(false);
  });
});

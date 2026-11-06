import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { t } from '@kinglet/core';
import type { TemplateId } from '../shared/types';

/** A starter written by Kinglet itself: no generator to download, nothing asked in a terminal. */
interface Template {
  id: TemplateId;
  /** Vercel's framework preset. */
  framework: string;
  defaultPort: number;
  files(name: string, port: number): Record<string, string>;
}

/** Folder and package name: lowercase letters, digits and dashes (what npm, GitHub and Vercel all accept). */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'my-site'
  );
}

const gitignore = ['node_modules', 'dist', '.next', 'out', '.vercel', '.env*.local', '.DS_Store', '*.log', ''].join('\n');

const readme = (name: string, run: string, port: number) =>
  `# ${name}\n\nCreated with [Kinglet](https://github.com/stevenpersia/kinglet).\n\n\`\`\`bash\nnpm install\n${run}\n\`\`\`\n\nThen open http://localhost:${port}.\n`;

/** For Claude Code, started in this folder from Kinglet: how to work on the project. */
const claudeMd = (stack: string, port: number) =>
  `# Project\n\n${stack}\n\n- Dev server: \`npm run dev\` on http://localhost:${port} (Kinglet starts it and shows the site on every device).\n- Build: \`npm run build\`. Run it before saying a change is done.\n- Deployed by Vercel on every push to GitHub (main: production, other branches: previews).\n`;

const indexCss = `:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}
main {
  max-width: 640px;
  text-align: center;
}
h1 {
  font-size: clamp(2rem, 6vw, 3.5rem);
  letter-spacing: -0.03em;
  margin: 0 0 0.5em;
}
p {
  opacity: 0.75;
}
`;

const html = (title: string, body: string, head = '') => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${title}" />
${head}  </head>
  <body>
${body}
  </body>
</html>
`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

export const TEMPLATES: Record<TemplateId, Template> = {
  'vite-react': {
    id: 'vite-react',
    framework: 'vite',
    defaultPort: 5173,
    files: (name, port) => ({
      'package.json': json({
        name: slugify(name),
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: { dev: `vite --port ${port} --strictPort`, build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^19.3.1', 'react-dom': '^19.3.1' },
        devDependencies: { '@types/react': '^19.3.0', '@types/react-dom': '^19.3.0', '@vitejs/plugin-react': '^6.2.1', vite: '^8.3.5' },
      }),
      'vite.config.js': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n`,
      'tsconfig.json': json({ compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true }, include: ['src'] }),
      'index.html': html(esc(name), '    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>'),
      'src/main.tsx': `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { App } from './App';\nimport './index.css';\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n`,
      'src/App.tsx': `export function App() {\n  return (\n    <main>\n      <h1>${esc(name)}</h1>\n      <p>Edit src/App.tsx, or ask Claude in Kinglet.</p>\n    </main>\n  );\n}\n`,
      'src/index.css': indexCss,
      'README.md': readme(name, 'npm run dev', port),
      'CLAUDE.md': claudeMd('React + Vite + TypeScript. Components in src/, styles in src/index.css.', port),
      '.gitignore': gitignore,
    }),
  },
  next: {
    id: 'next',
    framework: 'nextjs',
    defaultPort: 3000,
    files: (name, port) => ({
      'package.json': json({
        name: slugify(name),
        private: true,
        version: '0.1.0',
        scripts: { dev: `next dev -p ${port}`, build: 'next build', start: 'next start' },
        dependencies: { next: 'latest', react: '^19.3.1', 'react-dom': '^19.3.1' },
      }),
      'next.config.mjs': `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nexport default nextConfig;\n`,
      'jsconfig.json': json({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
      'app/layout.jsx': `import './globals.css';\n\nexport const metadata = {\n  title: ${JSON.stringify(name)},\n  description: ${JSON.stringify(name)},\n};\n\nexport default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`,
      'app/page.jsx': `export default function Home() {\n  return (\n    <main>\n      <h1>${esc(name)}</h1>\n      <p>Edit app/page.jsx, or ask Claude in Kinglet.</p>\n    </main>\n  );\n}\n`,
      'app/globals.css': indexCss,
      'README.md': readme(name, 'npm run dev', port),
      'CLAUDE.md': claudeMd('Next.js (App Router, JavaScript). Pages in app/, global styles in app/globals.css.', port),
      '.gitignore': gitignore,
    }),
  },
  static: {
    id: 'static',
    framework: 'vite',
    defaultPort: 5173,
    files: (name, port) => ({
      'package.json': json({
        name: slugify(name),
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: { dev: `vite --port ${port} --strictPort`, build: 'vite build', preview: 'vite preview' },
        devDependencies: { vite: '^8.3.5' },
      }),
      'index.html': html(esc(name), `    <main>\n      <h1>${esc(name)}</h1>\n      <p>Edit index.html, or ask Claude in Kinglet.</p>\n    </main>\n    <script type="module" src="/main.js"></script>`, '    <link rel="stylesheet" href="/style.css" />\n'),
      'style.css': indexCss,
      'main.js': `// JavaScript of the site.\n`,
      'README.md': readme(name, 'npm run dev', port),
      'CLAUDE.md': claudeMd('Plain HTML, CSS and JavaScript, served and built by Vite. Pages are .html files at the root.', port),
      '.gitignore': gitignore,
    }),
  },
};

const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });

/** The template's usual port, or the next one that is free and not already a known project's. */
export async function pickPort(start: number, taken: Set<number>, isFree = portFree): Promise<number> {
  for (let port = start; port < start + 100; port++) if (!taken.has(port) && (await isFree(port))) return port;
  return start;
}

const git = (args: string[], cwd: string) =>
  new Promise<string>((resolve, reject) =>
    execFile('git', args, { cwd, timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stderr: String(stderr) })) : resolve(String(stdout).trim()),
    ),
  );

/** Write the files of a template in a new folder. */
export function writeTemplate(folder: string, files: Record<string, string>) {
  if (existsSync(folder) && readdirSync(folder).length) throw new Error(t(`${folder} already exists and isn’t empty. Choose another name or place.`, `${folder} existe déjà et n’est pas vide. Choisis un autre nom ou un autre endroit.`));
  for (const [path, content] of Object.entries(files)) {
    const file = join(folder, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
}

/**
 * A new project from scratch: the template's files in parent/<slug>, then a git repository with a
 * first commit on main. Without a git identity on this computer, the commit is signed with the one
 * given (the connected GitHub account), for this commit only.
 */
export async function createProject(opts: { name: string; parent: string; template: TemplateId; port: number; identity?: { name: string; email: string } | null }): Promise<string> {
  const template = TEMPLATES[opts.template];
  if (!template) throw new Error(`Unknown template: ${opts.template}`);
  const folder = join(opts.parent, slugify(opts.name));
  writeTemplate(folder, template.files(opts.name.trim() || slugify(opts.name), opts.port));
  try {
    await git(['init', '-q', '-b', 'main'], folder).catch(async () => {
      // git before 2.28 has no -b.
      await git(['init', '-q'], folder);
      await git(['symbolic-ref', 'HEAD', 'refs/heads/main'], folder);
    });
    await git(['add', '-A'], folder);
    const hasIdentity = !!(await git(['config', 'user.email'], folder).catch(() => ''));
    const id = !hasIdentity ? (opts.identity ?? { name: 'Kinglet', email: 'kinglet@localhost' }) : null;
    await git([...(id ? ['-c', `user.name=${id.name}`, '-c', `user.email=${id.email}`] : []), 'commit', '-q', '-m', 'First commit (created with Kinglet)'], folder);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // Without git the project still works locally: only publishing needs it.
    if (err.code !== 'ENOENT') throw new Error(t(`The files are there, but git failed: ${err.message}`, `Les fichiers sont là, mais git a échoué : ${err.message}`));
  }
  return folder;
}

/** Vercel's framework preset for an existing folder, from its package.json (null: let Vercel detect it). */
export function frameworkOf(folder: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const known: [string, string][] = [['next', 'nextjs'], ['astro', 'astro'], ['@remix-run/react', 'remix'], ['@sveltejs/kit', 'sveltekit-1'], ['nuxt', 'nuxtjs'], ['gatsby', 'gatsby'], ['vite', 'vite']];
    return known.find(([dep]) => dep in deps)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** "owner/name" of a GitHub remote URL (https or ssh), else null. */
export function githubRepoOf(remote: string | null): string | null {
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(remote?.trim() ?? '');
  return m ? `${m[1]}/${m[2]}` : null;
}

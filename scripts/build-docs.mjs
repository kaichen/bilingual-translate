import { mkdir, readdir, readFile, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(rootDir, 'docs');
const publicDir = path.join(docsDir, 'public');
const outDir = path.join(docsDir, '.static');

function escapeHtml(input) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inlineMarkdown(input) {
  let output = escapeHtml(input);
  output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return output;
}

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

function renderTable(rows) {
  const cells = rows
    .filter((row, index) => index !== 1)
    .map((row, index) => {
      const tag = index === 0 ? 'th' : 'td';
      return `<tr>${row
        .split('|')
        .slice(1, -1)
        .map((cell) => `<${tag}>${inlineMarkdown(cell.trim())}</${tag}>`)
        .join('')}</tr>`;
    })
    .join('\n');
  return `<table>${cells}</table>`;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let list = [];
  let orderedList = [];
  let codeBlock = [];
  let codeFence = false;
  let tableRows = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
      list = [];
    }
    if (orderedList.length > 0) {
      html.push(`<ol>${orderedList.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ol>`);
      orderedList = [];
    }
  };
  const flushTable = () => {
    if (tableRows.length > 0) {
      html.push(renderTable(tableRows));
      tableRows = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      flushTable();
      if (codeFence) {
        html.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`);
        codeBlock = [];
        codeFence = false;
      } else {
        codeFence = true;
      }
      continue;
    }

    if (codeFence) {
      codeBlock.push(line);
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    if (/^\|.+\|$/.test(line)) {
      flushParagraph();
      flushList();
      tableRows.push(line);
      continue;
    }

    flushTable();

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      html.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
      continue;
    }

    const unordered = /^\s*[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      orderedList = [];
      list.push(unordered[1]);
      continue;
    }

    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      list = [];
      orderedList.push(ordered[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushTable();
  return html.join('\n');
}

async function collectMarkdownFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'public') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(fullPath, files);
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function routeFor(filePath) {
  const relative = path.relative(docsDir, filePath);
  if (relative === 'index.md') return 'index.html';
  if (relative.endsWith(`${path.sep}index.md`)) return relative.replace(/index\.md$/, 'index.html');
  return relative.replace(/\.md$/, '.html');
}

function titleFromMarkdown(markdown, fallback) {
  const title = /^#\s+(.+)$/m.exec(markdown);
  return title ? title[1].trim() : fallback;
}

function hrefForRoute(route) {
  return route === 'index.html' ? './index.html' : `./${route.split(path.sep).join('/')}`;
}

async function copyDirectory(source, target) {
  if (!existsSync(source)) return;
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      await copyFile(sourcePath, targetPath);
    }
  }
}

function pageTemplate({ title, content, nav }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - bilingual translate</title>
  <link rel="icon" href="./logo.png">
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #252b33; background: #f7f8fb; }
    body { margin: 0; }
    .layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 100vh; }
    nav { border-right: 1px solid #dde3ea; background: #fff; padding: 18px 14px; position: sticky; top: 0; height: 100vh; box-sizing: border-box; overflow: auto; }
    nav .brand { font-weight: 700; margin-bottom: 18px; }
    nav a { display: block; color: #40556c; text-decoration: none; padding: 6px 8px; border-radius: 6px; font-size: 14px; }
    nav a:hover { background: #edf4ff; color: #1d5fb8; }
    main { width: min(900px, calc(100vw - 280px)); padding: 36px 40px 72px; }
    h1, h2, h3 { color: #1d2630; line-height: 1.25; }
    h1 { font-size: 34px; margin: 0 0 24px; }
    h2 { font-size: 24px; margin-top: 34px; border-top: 1px solid #e2e8f0; padding-top: 24px; }
    p, li { line-height: 1.75; }
    a { color: #1d65c1; }
    code { background: #eef2f6; border-radius: 4px; padding: 2px 5px; }
    pre { background: #151b23; color: #d8dee9; border-radius: 8px; padding: 16px; overflow: auto; }
    pre code { background: transparent; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 18px 0; background: #fff; }
    th, td { border: 1px solid #d8dee6; padding: 8px 10px; text-align: left; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid #dde3ea; } main { width: auto; padding: 24px 18px 48px; } }
  </style>
</head>
<body>
  <div class="layout">
    <nav>
      <div class="brand">bilingual translate</div>
      ${nav}
    </nav>
    <main>${content}</main>
  </div>
</body>
</html>`;
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await copyDirectory(publicDir, outDir);

  const files = await collectMarkdownFiles(docsDir);
  const pages = await Promise.all(
    files.map(async (file) => {
      const markdown = await readFile(file, 'utf8');
      return {
        file,
        route: routeFor(file),
        title: titleFromMarkdown(markdown, path.basename(file, '.md')),
        content: renderMarkdown(markdown),
      };
    }),
  );

  const nav = pages
    .sort((a, b) => a.route.localeCompare(b.route, 'zh-CN'))
    .map((page) => `<a href="${hrefForRoute(page.route)}">${escapeHtml(page.title)}</a>`)
    .join('\n');

  for (const page of pages) {
    const target = path.join(outDir, page.route);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, pageTemplate({ title: page.title, content: page.content, nav }), 'utf8');
  }

  const statsResult = await stat(outDir);
  if (!statsResult.isDirectory()) {
    throw new Error('文档输出目录创建失败');
  }
  console.log(`Built ${pages.length} documentation pages into ${path.relative(rootDir, outDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

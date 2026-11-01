// src/components/Markdown.tsx
// ✍️ 统一 Markdown 渲染：GFM（表格 / 删除线 / 任务列表 / 自动链接 / 脚注）
//    + 代码语法高亮 + 受控的裸 HTML，并集中处理明暗排版与交互细节。
//    Gallery（阅读舱 / 预览）与 Orchard（星点全文）共用同一套渲染，杜绝重复与漂移。
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import { slugify } from '../lib/reading';
import { openLightbox } from '../lib/lightbox';

interface MarkdownProps {
  children: string;
  className?: string;
  /** 编辑器预览专用：给顶层 Markdown 块写入源码行号，供双向滚动锚定。 */
  sourceLine?: boolean;
}

// 🔖 rehype 插件：为 h2/h3 注入锚点 id，与 lib/reading 的 extractToc 同一套 slugify + 去重规则，
//    保证文中目录（TOC）点击能精确定位、直链可跳转。
const nodeText = (node: Root | RootContent | ElementContent): string => {
  if (node.type === 'text') return node.value;
  return 'children' in node ? node.children.map(nodeText).join('') : '';
};
const rehypeHeadingIds = () => (tree: Root) => {
  const seen = new Map<string, number>();
  const walk = (node: Root | RootContent) => {
    if (node.type === 'element' && (node.tagName === 'h2' || node.tagName === 'h3')) {
      let id = slugify(nodeText(node));
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n}`;
      node.properties = node.properties || {};
      if (!node.properties.id) node.properties.id = id;
    }
    if ('children' in node) node.children.forEach(walk);
  };
  walk(tree);
};

// ✍️ 编辑器分屏的源码锚点。只标记顶层块，避免同一源码行上的嵌套节点互相争抢；
// position 来自 Markdown 语法树，比“整篇高度百分比”更能抵抗图片、代码块和表格的高度差。
const SOURCE_LINE_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'pre', 'blockquote', 'table', 'hr', 'img']);
const rehypeSourceLine = () => (tree: Root) => {
  for (const node of tree.children ?? []) {
    const line = node.position?.start?.line;
    if (node.type === 'element' && SOURCE_LINE_BLOCKS.has(node.tagName) && line) {
      ((node as Element).properties ??= {}).dataSrcLine = line;
    }
  }
};

// 🛡️ 裸 HTML 白名单：rehype-raw 会把正文里的 HTML 原样进树，正文虽只有园丁能写，
//    但任何一处写路径失守（RLS 配错、账号被盗、localStorage 缓存投毒）都会升级成持久 XSS——
//    这里作为纵深防御剥掉 <script>/<iframe>/事件属性等执行向量。基于 GitHub 同款 defaultSchema
//    （已含图片、任务列表、footnote 等 GFM 所需），额外放行折叠块与内联样式（无脚本执行能力）。
//    必须排在 rehypeRaw 之后、headingIds/highlight 之前：锚点 id 与 hljs 类是我们自己后注入的，不受白名单裁剪。
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary', 'mark', 'video', 'audio', 'source'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'style', 'className', 'dataSrcLine'],
    details: ['open'],
    video: ['src', 'poster', 'controls', 'loop', 'muted', 'playsInline', 'width', 'height'],
    audio: ['src', 'controls', 'loop', 'muted'],
    source: ['src', 'type'],
  },
};

// 📋 代码块：语言标签水印（左上）+ 轻量「复制」按钮（右上，hover 浮现）
const CodeBlock: React.FC<React.HTMLAttributes<HTMLPreElement>> = ({ children, ...props }) => {
  const [copied, setCopied] = useState(false);
  // rehype-highlight 会给 <code> 加 language-xxx / hljs 类，取出语言名做水印
  const codeChild = React.Children.toArray(children).find(
    (c): c is React.ReactElement<{ className?: string }> =>
      React.isValidElement<{ className?: string }>(c) &&
      !!(c.props.className?.includes('language-') || c.props.className?.includes('hljs'))
  );
  const lang = (codeChild?.props?.className?.match(/language-([\w-]+)/)?.[1] || '').toLowerCase();
  const handleCopy = (e: React.MouseEvent) => {
    const pre = (e.currentTarget as HTMLElement).parentElement?.querySelector('code');
    const text = pre?.textContent ?? '';
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className="group/code relative">
      {lang && lang !== 'undefined' && (
        <span className="absolute top-3 left-4 z-10 font-mono text-[9px] tracking-[0.18em] uppercase text-slate-400/60 dark:text-slate-500/60 pointer-events-none select-none">
          {lang}
        </span>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 z-10 font-mono text-[9px] tracking-[0.18em] uppercase px-2.5 py-1 rounded-md bg-white/70 dark:bg-white/10 border border-slate-200/70 dark:border-white/10 text-slate-500 dark:text-slate-300 opacity-0 group-hover/code:opacity-100 hover:text-oasis-teal transition-all backdrop-blur-sm"
        aria-label="Copy code"
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <pre {...props}>{children}</pre>
    </div>
  );
};

const MD_COMPONENTS = {
  // 外链新窗打开且加安全 rel；锚点保持原样
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const external = href?.startsWith('http');
    return (
      <a href={href} {...props} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    );
  },
  // 图片可点放大：光标提示 + 派发灯箱事件
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
      src={src} alt={alt} {...props} loading="lazy" decoding="async"
      style={{ width: '100%', aspectRatio: 'auto 16 / 10', ...props.style }}
      className="oasis-markdown-image cursor-zoom-in transition-opacity duration-300 hover:opacity-90"
      onClick={() => typeof src === 'string' && openLightbox(src, alt)}
    />
  ),
  pre: CodeBlock as unknown as React.FC,
};

// 共享 prose 排版类：明暗双态，覆盖标题 / 链接 / 强调 / 代码 / 表格 / 引用 / 图片
export const PROSE_CLASS =
  'prose prose-slate dark:prose-invert prose-lg max-w-none font-serif text-slate-700 dark:text-slate-300 leading-[2.1] tracking-wide ' +
  'prose-headings:font-serif prose-headings:font-normal prose-headings:text-slate-800 dark:prose-headings:text-white ' +
  'prose-a:text-[#39C5BB] prose-a:no-underline hover:prose-a:underline ' +
  'prose-strong:font-bold prose-strong:text-slate-900 dark:prose-strong:text-white ' +
  'prose-em:text-slate-700 dark:prose-em:text-slate-200 ' +
  'prose-code:text-[#0f766e] dark:prose-code:text-[#6EE7B7] prose-code:font-mono prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:bg-slate-100/80 dark:prose-pre:bg-white/[0.04] prose-pre:text-slate-800 dark:prose-pre:text-slate-200 ' +
  'prose-blockquote:border-l-2 prose-blockquote:border-[#39C5BB]/50 prose-blockquote:not-italic prose-blockquote:text-slate-500 dark:prose-blockquote:text-slate-400 ' +
  'prose-img:rounded-2xl prose-img:shadow-xl prose-img:mx-auto ' +
  'prose-hr:border-slate-200/70 dark:prose-hr:border-white/10';

// ∑ 公式按需加载：正文里像有 $$…$$ 或 $…$ 才去拉 lib/math（KaTeX 插件 + CSS + 字体，自成 chunk）。
//    探测宽一点无妨——误判只是多下一次，不影响渲染；整站共用一个 promise，只拉一次。
const MATH_HINT = /\$\$[\s\S]+?\$\$|\$[^\s$][^$\n]*?\$/;
type MathPlugins = typeof import('../lib/math');
let mathPlugins: MathPlugins | null = null;
let mathLoading: Promise<MathPlugins> | null = null;
const loadMath = () => (mathLoading ??= import('../lib/math').then((m) => (mathPlugins = m)));

const useMathPlugins = (source: string): MathPlugins | null => {
  const wanted = MATH_HINT.test(source);
  const [plugins, setPlugins] = useState(mathPlugins);
  useEffect(() => {
    if (!wanted || plugins) return;
    let alive = true;
    loadMath().then((m) => alive && setPlugins(m), () => {});
    return () => { alive = false; };
  }, [wanted, plugins]);
  return wanted ? plugins : null;
};

export const Markdown: React.FC<MarkdownProps> = ({ children, className, sourceLine = false }) => {
  const math = useMathPlugins(children);
  return (
    <div className={className ?? PROSE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...(math ? [math.remarkMath] : []), remarkBreaks]}
        rehypePlugins={[
          ...(sourceLine ? [rehypeSourceLine] : []),
          rehypeRaw,
          [rehypeSanitize, SANITIZE_SCHEMA],
          // KaTeX 必须在白名单之后：它生成的 MathML（<math>/<semantics>…）不在白名单里，先渲染会被剥掉；
          // 也要在 highlight 之前，免得公式的 <code class="language-math"> 被当成代码块上色。
          ...(math ? [math.rehypeKatex] : []),
          rehypeHeadingIds,
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={MD_COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

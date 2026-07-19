// src/components/Markdown.tsx
// ✍️ 统一 Markdown 渲染：GFM（表格 / 删除线 / 任务列表 / 自动链接 / 脚注）
//    + 代码语法高亮 + 受控的裸 HTML，并集中处理明暗排版与交互细节。
//    Gallery（阅读舱 / 预览）与 Orchard（星点全文）共用同一套渲染，杜绝重复与漂移。
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { slugify } from '../lib/reading';

interface MarkdownProps {
  children: string;
  className?: string;
}

// 🖼️ 图片点击 → 全屏灯箱。用自定义事件解耦：Markdown 只管派发，Reader 里的 Lightbox 负责呈现。
export const LIGHTBOX_EVENT = 'oasis:lightbox';
export const openLightbox = (src: string, alt?: string) =>
  window.dispatchEvent(new CustomEvent(LIGHTBOX_EVENT, { detail: { src, alt } }));

// 🔖 rehype 插件：为 h2/h3 注入锚点 id，与 lib/reading 的 extractToc 同一套 slugify + 去重规则，
//    保证文中目录（TOC）点击能精确定位、直链可跳转。
const nodeText = (node: any): string => {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children || []).map(nodeText).join('');
};
const rehypeHeadingIds = () => (tree: any) => {
  const seen = new Map<string, number>();
  const walk = (node: any) => {
    if (node.type === 'element' && (node.tagName === 'h2' || node.tagName === 'h3')) {
      let id = slugify(nodeText(node));
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n}`;
      node.properties = node.properties || {};
      if (!node.properties.id) node.properties.id = id;
    }
    (node.children || []).forEach(walk);
  };
  walk(tree);
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
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'style', 'className'],
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
  const codeChild: any = React.Children.toArray(children).find(
    (c: any) => c?.props?.className?.includes('language-') || c?.props?.className?.includes('hljs')
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
      src={src} alt={alt} {...props} loading="lazy"
      className="cursor-zoom-in transition-opacity duration-300 hover:opacity-90"
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

export const Markdown: React.FC<MarkdownProps> = ({ children, className }) => (
  <div className={className ?? PROSE_CLASS}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA], rehypeHeadingIds, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={MD_COMPONENTS}
    >
      {children}
    </ReactMarkdown>
  </div>
);

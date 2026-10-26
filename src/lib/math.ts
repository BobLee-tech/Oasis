// src/lib/math.ts
// ∑ 公式渲染（KaTeX）：只被 Markdown.tsx 动态 import，自成一个 chunk。
//    插件 + katex.min.css + 字体都在这里，没写公式的文章一个字节都不多下。
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './math.css';

export { remarkMath, rehypeKatex };

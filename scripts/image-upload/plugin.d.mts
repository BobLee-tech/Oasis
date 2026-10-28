import type { Plugin } from 'vite';

/** 写作抽屉的本地上传（POST /__upload/image），只在 `vite serve` 下注册。 */
export default function imageUpload(): Plugin;

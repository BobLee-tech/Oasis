// src/lib/visitor.ts
// 🖋️ 访客署名：留言时自愿填写的昵称，本地记住，让「Hello, Visitor」变成「Hello, 某某」
export const VISITOR_ALIAS_KEY = 'oasis_visitor_alias';

export const getVisitorAlias = (): string | null => {
  try {
    const v = localStorage.getItem(VISITOR_ALIAS_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
};

export const setVisitorAlias = (name: string) => {
  try { localStorage.setItem(VISITOR_ALIAS_KEY, name.trim().slice(0, 20)); } catch { /* 隐私模式等失败可忽略 */ }
};

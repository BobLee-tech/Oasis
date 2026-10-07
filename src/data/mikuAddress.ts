// 💬 称呼与场域（docs/miku-design.md A5）：场域决定叫你什么。这份是默认值——你可以直接改。
//
//   · 「你」是零称呼：选中它时不插入任何呼语（中文里「你，……」作呼语不自然），所以它的权重
//     实际上就是「这次不叫昵称」的概率。
//   · 出现率 rate：这个场域里一句话带称呼的基础概率；之后还要乘「称呼疲劳」（最近 5 句里叫过几次）。
//   · 位置 position：模板里写 {呼，}（句首）或 {，呼}（句末）两个槽位；场域的惯用位置决定两个槽都在时用哪个。
//     句首称呼用来唤起注意或调侃，句末称呼起软化、亲昵的作用。

export type Field = 'solemn' | 'care' | 'comfort' | 'play' | 'tender' | 'focus' | 'daily';
export type Term = '爱人' | '宝贝' | '小盆友' | '你';

export interface FieldConfig {
  terms: Partial<Record<Term, number>>;
  rate: number;
  position: 'head' | 'tail';
}

export const FIELDS: Record<Field, FieldConfig> = {
  solemn: { terms: { 爱人: 0.7, 你: 0.3 }, rate: 0.5, position: 'head' },
  care: { terms: { 宝贝: 0.6, 你: 0.4 }, rate: 0.35, position: 'tail' },
  comfort: { terms: { 宝贝: 0.5, 你: 0.5 }, rate: 0.3, position: 'tail' },
  play: { terms: { 小盆友: 0.8, 你: 0.2 }, rate: 0.45, position: 'head' },
  tender: { terms: { 宝贝: 0.5, 爱人: 0.1, 你: 0.4 }, rate: 0.25, position: 'tail' },
  focus: { terms: {}, rate: 0, position: 'tail' },
  daily: { terms: { 你: 1 }, rate: 0.08, position: 'tail' },
};

/** 门槛与每日上限：亲昵称呼要稀缺才有分量。 */
export const TERM_GATES: Record<Exclude<Term, '你'>, { minIntimacy?: number; minDays?: number; dailyCap?: number }> = {
  小盆友: {},
  宝贝: { minIntimacy: 1, minDays: 7 },
  爱人: { minIntimacy: 2, minDays: 30, dailyCap: 1 },
};

/** 访客：不用任何亲昵称呼；设过别名时按这个概率用别名。 */
export const VISITOR_ALIAS_RATE = 0.15;

/** 模板里禁止硬写的称呼词（质量测试检查；称呼必须走槽位，场域逻辑才能集中管理）。 */
export const RESERVED_TERMS = ['爱人', '宝贝', '小盆友', '亲爱的'];

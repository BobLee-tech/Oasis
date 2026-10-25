// ☀️ 悉尼此刻的太阳：方位（自正北顺时针，度）与高度（度）。NOAA 的近似式，误差约 1°，给砂庭打光足够。
//   南半球：正午太阳在北边（屏幕上方），影子朝南、朝下；早上在东，影子朝西长长地拖。
//   时区按悉尼的真实偏移（夏令时 AEDT +11 / 标准 AEST +10）由 Intl 取，与访客所在时区无关。

export const SYDNEY = { lat: -33.87, lon: 151.21 };

/** 悉尼此刻相对 UTC 的偏移（小时） */
const sydneyOffset = (date: Date) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', timeZoneName: 'shortOffset' }).formatToParts(date);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+10';
    const m = name.match(/GMT([+-]\d+)(?::(\d+))?/);
    return m ? +m[1] + (m[2] ? Math.sign(+m[1]) * +m[2] / 60 : 0) : 10;
  } catch { return 10; }
};

export interface SunPosition { az: number; el: number }

export const sunAt = (date: Date = new Date(), { lat, lon } = SYDNEY): SunPosition => {
  const tz = sydneyOffset(date);
  const local = new Date(date.getTime() + tz * 3600e3);             // 悉尼墙上时间（借 UTC 字段读）
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60 + local.getUTCSeconds() / 3600;
  const start = Date.UTC(local.getUTCFullYear(), 0, 0);
  const N = Math.floor((Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - start) / 864e5);
  const g = 2 * Math.PI / 365 * (N - 1 + (hour - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const phi = lat * Math.PI / 180;
  const tst = hour * 60 + eq + 4 * lon - 60 * tz, ha = (tst / 4 - 180) * Math.PI / 180;
  const cz = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha);
  const el = 90 - Math.acos(Math.max(-1, Math.min(1, cz))) * 180 / Math.PI;
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) * 180 / Math.PI + 540) % 360;
  return { az, el };
};

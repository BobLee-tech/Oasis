// 🏷️ 场所的中文名：Dock、⌘K、园图签条共用这一份。
//   名字等树测试（docs/ia-demo.html 第 04 节）定下来，只改这里。
export type Place = 'soundscape' | 'garden' | 'orchard' | 'atelier' | 'lights';

export const PLACE_NAME: Record<Place, string> = {
  soundscape: '共鸣',
  garden: '花园',
  orchard: '星图',
  atelier: '工坊',
  lights: '尺牍',
};

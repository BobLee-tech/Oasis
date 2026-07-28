// 🪷 全站底部漫游系统：导航是稳定的石基，Miku 是停靠在旁边的风铃。
// 二者共享定位、安全区和入场节奏，但语义保持独立——Miku 不是第六个导航目的地。
import { motion, useReducedMotion } from 'framer-motion';
import type { AppView } from '../types/auth';
import { OasisDock } from './OasisDock';
import { OasisMiku } from './OasisMiku';

interface OasisBottomChromeProps {
  currentView: AppView;
  onViewChange: (view: AppView, origin?: { x: number; y: number }) => void;
}

export const OasisBottomChrome = ({ currentView, onViewChange }: OasisBottomChromeProps) => {
  const reduceMotion = !!useReducedMotion();

  return (
    <motion.div
      className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] md:bottom-8 left-1/2 -translate-x-1/2 z-[90]"
      initial={reduceMotion ? { opacity: 0 } : { y: 56, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { y: 28, opacity: 0, scale: 0.98 }}
      transition={reduceMotion
        ? { duration: 0.12 }
        : { type: 'spring', stiffness: 260, damping: 26, mass: 0.8 }}
    >
      <div className="relative">
        <OasisDock currentView={currentView} onViewChange={onViewChange} />

        {/* ≥360px 与 Dock 共轴停靠；极窄屏改为右上方卡槽，既不挤压五个目的地，也不漂离系统。 */}
        <aside
          aria-label="Miku 伴侣"
          className="pointer-events-auto absolute left-full ml-1.5 md:ml-2.5 top-1/2 -translate-y-1/2 max-[359px]:left-auto max-[359px]:right-0 max-[359px]:top-0 max-[359px]:ml-0 max-[359px]:-translate-y-[calc(100%+0.4rem)]"
        >
          <OasisMiku view={currentView} />
        </aside>
      </div>
    </motion.div>
  );
};

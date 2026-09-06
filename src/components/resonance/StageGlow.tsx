import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { getEnergy } from '../../hooks/useSoundscape';
import { useTicker } from '../../lib/ticker';

interface StageGlowProps {
  color: string;
  isPlaying: boolean;
  audible?: boolean;
  active?: boolean;
  enabled?: boolean;
  focus?: 'disc' | 'lyrics' | 'crate';
  compact?: boolean;
}

const COLOR_FADE_MS = 1_450;
const RAPID_SETTLE_MS = 150;

/**
 * 两张固定色片交叉淡化。background-image 本身是离散动画，直接 transition 会跳色；
 * 固定双层也让连续切歌始终只有两张色片，不会积累离场节点。
 */
const ColorWash: React.FC<{ color: string; className: string }> = ({ color, className }) => {
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeLayerRef = useRef(0);
  const colorRef = useRef(color);
  const [initialColor] = useState(color);
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  useLayoutEffect(() => {
    if (colorRef.current === color) return;

    const generation = ++generationRef.current;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);

    const layers = layerRefs.current;
    const sourceIndex = activeLayerRef.current;
    const targetIndex = sourceIndex === 0 ? 1 : 0;
    const source = layers[sourceIndex];
    const target = layers[targetIndex];
    if (!source || !target) return;

    const beginFade = () => {
      if (generation !== generationRef.current) return;
      target.style.setProperty('--resonance-color', color);
      target.style.transitionDuration = `${COLOR_FADE_MS}ms`;
      source.style.transitionDuration = `${COLOR_FADE_MS}ms`;

      window.requestAnimationFrame(() => {
        if (generation !== generationRef.current) return;
        target.style.opacity = '1';
        source.style.opacity = '0';
      });

      activeLayerRef.current = targetIndex;
      colorRef.current = color;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        source.style.transitionDuration = `${COLOR_FADE_MS}ms`;
      }, COLOR_FADE_MS + 40);
    };

    // 上一轮尚未结束时先用 150ms 收束到当前主色，再转向最新颜色。
    // 这样不会把用户快速略过的颜色排成一串慢慢播放。
    const targetOpacity = Number.parseFloat(window.getComputedStyle(target).opacity);
    if (targetOpacity > 0.04) {
      source.style.transitionDuration = `${RAPID_SETTLE_MS}ms`;
      target.style.transitionDuration = `${RAPID_SETTLE_MS}ms`;
      source.style.opacity = '1';
      target.style.opacity = '0';
      timerRef.current = window.setTimeout(beginFade, RAPID_SETTLE_MS + 20);
    } else {
      beginFade();
    }
  }, [color]);

  useEffect(() => () => {
    generationRef.current += 1;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  return (
    <>
      {[0, 1].map(index => (
        <div
          key={index}
          ref={node => { layerRefs.current[index] = node; }}
          className={className}
          style={{
            '--resonance-color': initialColor,
            opacity: index === 0 ? 1 : 0,
            transitionDuration: `${COLOR_FADE_MS}ms`,
          } as React.CSSProperties}
        />
      ))}
    </>
  );
};

/**
 * 共鸣页唯一的音乐响应光场。
 *
 * - 近光：低频与瞬态轻轻抬亮唱片周围，缩放严格限幅。
 * - 远光：只跟随较慢的整体能量，把左右两区放进同一个空间。
 * - 歌词模式：收弱唱片起伏，把阅读焦点交还给词场。
 *
 * 每帧只改两个容器的 opacity / transform；渐变形状和颜色片不参与逐帧重绘。
 */
export const StageGlow: React.FC<StageGlowProps> = ({
  color,
  isPlaying,
  audible = true,
  active = true,
  enabled = true,
  focus = 'disc',
  compact = false,
}) => {
  const reduceMotion = !!useReducedMotion();
  const nearRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const envelopeRef = useRef({ near: 0, far: 0, presence: 0 });
  const driving = isPlaying && audible;
  const [releasing, setReleasing] = useState(driving);

  useEffect(() => {
    if (driving) {
      const frame = window.requestAnimationFrame(() => setReleasing(true));
      return () => window.cancelAnimationFrame(frame);
    }
    // 余光完成回落后取消本组件的逐帧订阅。
    const timer = window.setTimeout(() => setReleasing(false), compact ? 1_800 : 2_600);
    return () => window.clearTimeout(timer);
  }, [compact, driving]);

  const dynamic = active && enabled && !reduceMotion && releasing;

  useEffect(() => {
    if (dynamic) return;
    envelopeRef.current = { near: 0, far: 0, presence: 0 };
    if (nearRef.current) {
      nearRef.current.style.opacity = compact ? '0.09' : focus === 'lyrics' ? '0.055' : '0.072';
      nearRef.current.style.transform = 'translate3d(-50%, -50%, 0) scale(1)';
    }
    if (farRef.current) {
      farRef.current.style.opacity = focus === 'lyrics' ? '0.022' : '0.032';
      farRef.current.style.transform = 'translate3d(-50%, -50%, 0) scale(1)';
    }
  }, [compact, dynamic, focus]);

  useTicker((_now, dt) => {
    const energy = getEnergy();
    const state = envelopeRef.current;
    const nearTarget = driving
      ? Math.min(1, energy.low * 0.65 + energy.mid * 0.2 + energy.beat * 0.15)
      : 0;
    const farTarget = driving ? Math.min(1, energy.low * 0.7 + energy.mid * 0.3) : 0;
    const presenceTarget = driving ? 1 : 0;

    const nearTau = nearTarget > state.near ? 0.08 : 0.58;
    const farTau = farTarget > state.far ? 0.5 : 1.15;
    const presenceTau = presenceTarget > state.presence ? 0.65 : 0.9;
    state.near += (nearTarget - state.near) * (1 - Math.exp(-dt / nearTau));
    state.far += (farTarget - state.far) * (1 - Math.exp(-dt / farTau));
    state.presence += (presenceTarget - state.presence) * (1 - Math.exp(-dt / presenceTau));

    const focusGain = focus === 'lyrics' ? 0.6 : 1;
    if (nearRef.current) {
      const base = compact ? 0.09 : focus === 'lyrics' ? 0.055 : 0.072;
      const response = compact ? 0.07 : 0.085;
      const presence = compact ? 0.014 : 0.022;
      nearRef.current.style.opacity = String(
        base + state.presence * presence + state.near * response * focusGain,
      );
      const scaleRange = compact ? 0.02 : 0.035;
      nearRef.current.style.transform =
        `translate3d(-50%, -50%, 0) scale(${1 + state.near * scaleRange * focusGain})`;
    }
    if (farRef.current) {
      const base = focus === 'lyrics' ? 0.022 : 0.032;
      farRef.current.style.opacity = String(
        base + state.presence * 0.008 + state.far * 0.042 * focusGain,
      );
      farRef.current.style.transform =
        `translate3d(-50%, -50%, 0) scale(${1 + state.far * 0.012 * focusGain})`;
    }
  }, dynamic);

  return (
    <div
      aria-hidden="true"
      className="resonance-light-root pointer-events-none absolute"
      data-compact={compact ? 'true' : 'false'}
      data-dynamic={dynamic ? 'true' : 'false'}
      data-focus={focus}
    >
      {!compact && (
        <div ref={farRef} className="resonance-light-region resonance-light-far">
          <ColorWash color={color} className="resonance-light-color resonance-light-far-color" />
        </div>
      )}
      <div ref={nearRef} className="resonance-light-region resonance-light-near">
        <ColorWash color={color} className="resonance-light-color resonance-light-near-color" />
      </div>
    </div>
  );
};

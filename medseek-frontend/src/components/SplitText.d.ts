import type { FC } from 'react';

export type SplitTextEffect = 'rise' | 'fade' | 'blur' | 'flip' | 'pop' | 'skew' | 'wave';

export interface SplitTextProps {
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  text: string;
  className?: string;
  effect?: SplitTextEffect;
  trigger?: 'view' | 'load' | 'hover' | 'click';
  loop?: boolean;
  loopDelay?: number;
  hoverEffect?: 'none' | 'lift' | 'wave';
  color?: string;
  accentColor?: string;
  /** Delay between pieces, in ms. */
  delay?: number;
  /** Duration of each piece's animation, in seconds. */
  duration?: number;
  ease?: string | ((t: number) => number);
  splitType?: 'chars' | 'words' | 'lines' | 'words, chars';
  staggerFrom?: 'start' | 'center' | 'end' | 'edges' | 'random';
  mask?: boolean;
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
  threshold?: number;
  rootMargin?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify' | 'start' | 'end';
  onLetterAnimationComplete?: () => void;
}

declare const SplitText: FC<SplitTextProps>;

export default SplitText;

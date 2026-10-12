import type { CSSProperties, FC } from 'react';

export interface FoldTextProps {
  text?: string;
  splitBy?: 'char' | 'word' | 'line';
  hinge?: 'top' | 'bottom' | 'left' | 'right';
  duration?: number;
  stagger?: number;
  ease?: string;
  perspective?: number;
  creaseShading?: number;
  trigger?: 'mount' | 'hover' | 'scroll' | 'loop';
  fontSize?: string | number;
  fontWeight?: string | number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

declare const FoldText: FC<FoldTextProps>;

export default FoldText;

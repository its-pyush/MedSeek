import type { HTMLAttributes, FC } from 'react';

export interface ThreadsProps extends HTMLAttributes<HTMLDivElement> {
  color?: [number, number, number];
  amplitude?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
  speed?: number;
}

declare const Threads: FC<ThreadsProps>;

export default Threads;

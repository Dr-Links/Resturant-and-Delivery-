import type React from 'react';
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        'ios-src'?: string;
        poster?: string;
        alt?: string;
        ar?: boolean | '';
        'ar-modes'?: string;
        'camera-controls'?: boolean | '';
        'touch-action'?: string;
        'shadow-intensity'?: string;
        'auto-rotate'?: boolean | '';
      };
    }
  }
}
export {};

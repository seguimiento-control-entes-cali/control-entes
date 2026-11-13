// Versión y fecha de construcción, que Vite escribe al construir (define en vite.config.ts).
declare const __CE_VERSION__: string;
declare const __CE_CONSTRUIDO__: string;

export const VERSION_APP = typeof __CE_VERSION__ === 'string' ? __CE_VERSION__ : '';
export const FECHA_CONSTRUCCION = typeof __CE_CONSTRUIDO__ === 'string' ? __CE_CONSTRUIDO__ : '';

/// <reference types="astro/client" />

declare module 'wawoff2' {
  export function decompress(input: Uint8Array): Promise<Uint8Array>;

  const wawoff2: {
    decompress: typeof decompress;
  };

  export default wawoff2;
}

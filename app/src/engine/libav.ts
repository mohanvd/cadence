import type { LibAV as LibAVInstance } from '@libav.js/variant-webcodecs';

/**
 * Lazy singleton loader for the libav.js WASM runtime.
 *
 * The runtime is ~2.5MB, so it is never touched for files the browser can play
 * on its own. It loads from `/libav/` as a static asset rather than through the
 * bundler: the loader resolves its own `.wasm` relative to `import.meta.url`,
 * which only works if the glue and the binary stay siblings on disk.
 */

type LibAVFactory = {
  LibAV(opts?: { noworker?: boolean; nothreads?: boolean }): Promise<LibAVInstance>;
  base: string;
};

let factoryPromise: Promise<LibAVFactory> | null = null;
let instancePromise: Promise<LibAVInstance> | null = null;

/** Resolves once the WASM runtime is downloaded and instantiated. */
export function loadLibAVFactory(): Promise<LibAVFactory> {
  factoryPromise ??= (async () => {
    const mod = (await import(
      /* @vite-ignore */ `${import.meta.env.BASE_URL}libav/libav-webcodecs.mjs`
    )) as { default?: LibAVFactory } & LibAVFactory;

    const factory = mod.default ?? mod;
    // The loader infers `base` from its own URL; make it explicit so the
    // `.wasm` fetch does not depend on how the module was resolved.
    factory.base = `${import.meta.env.BASE_URL}libav`.replace(/\/+$/, '');
    return factory;
  })();
  return factoryPromise;
}

/**
 * Shared libav instance.
 *
 * One instance is reused across probes and playback: spinning up a second WASM
 * heap costs both memory and instantiation time, and demuxing is sequential
 * anyway. Threading is disabled because `SharedArrayBuffer` requires COOP/COEP
 * headers, which would break the app being served from a plain static host.
 */
export function getLibAV(): Promise<LibAVInstance> {
  instancePromise ??= loadLibAVFactory().then((factory) =>
    factory.LibAV({ nothreads: true }),
  );
  return instancePromise;
}

/** True once the runtime is resident, so callers can skip loading spinners. */
export function isLibAVLoaded(): boolean {
  return instancePromise !== null;
}

let fileCounter = 0;

/** Unique in-WASM filename; libav's virtual FS is a flat global namespace. */
export function nextVirtualFilename(realName: string): string {
  const ext = realName.slice(realName.lastIndexOf('.') + 1) || 'bin';
  fileCounter += 1;
  return `cadence-${fileCounter}.${ext}`;
}

import { useEffect, type RefObject } from 'react';

export const estHls = (src?: string | null) => !!src && /\.m3u8(\?|$)/i.test(src);

/** Lit un flux HLS (.m3u8) dans un élément <video> : nativement (Safari, iOS) ou avec hls.js, chargé seulement au besoin. Les autres
 *  sources (MP4…) se donnent par l'attribut `src`, sans passer par ici. */
export function useHls(ref: RefObject<HTMLVideoElement | null>, src?: string | null) {
  useEffect(() => {
    const v = ref.current;
    if (!v || !src || !estHls(src)) return;
    if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = src; return; }
    let hls: { destroy: () => void } | null = null;
    let annule = false;
    import('hls.js').then(({ default: Hls }) => {
      if (annule || !Hls.isSupported()) return;
      const h = new Hls();
      h.loadSource(src);
      h.attachMedia(v);
      hls = h;
    });
    return () => { annule = true; hls?.destroy(); };
  }, [ref, src]);
}

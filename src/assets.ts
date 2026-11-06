import { defineAssets } from '@iwsdk/core';

/**
 * CRUNCHER builds every mesh procedurally at runtime (src/render/*) so the
 * manifest is intentionally empty: no downloads, no CDN.
 */
export default defineAssets({});

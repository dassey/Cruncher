import { AdditiveBlending, BackSide, Color, ShaderMaterial, type Texture } from '@iwsdk/core';

/**
 * Instanced neon block. One draw call for the whole grid.
 * Per-instance attributes:
 *   instanceColor (vec3)  neon rim colour
 *   aCell   (float)       label atlas cell index (8×8 atlas)
 *   aState  (vec4)        x = wrong flash, y = hover, z = assist shimmer, w = hit flash
 */
export function createBlockMaterial(atlas: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas },
      uTime: { value: 0 },
      uFace: { value: new Color(0x0d0420) },
      uBeat: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aCell;
      attribute vec4 aState;
      varying vec3 vLocal;
      varying vec3 vN;
      varying vec3 vColor;
      varying float vCell;
      varying vec4 vState;
      void main() {
        vLocal = position;
        vN = normal;
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(0.0, 0.9, 1.0);
        #endif
        vCell = aCell;
        vState = aState;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform float uTime;
      uniform vec3 uFace;
      uniform float uBeat;
      varying vec3 vLocal;
      varying vec3 vN;
      varying vec3 vColor;
      varying float vCell;
      varying vec4 vState;
      void main() {
        vec3 a = abs(vLocal) * 2.0;           // 0..1 at faces for a unit cube
        vec3 m = a * (1.0 - abs(vN));
        float e = 1.0 - max(m.x, max(m.y, m.z)); // 0 at edge, 1 at face centre
        float rim = smoothstep(0.10, 0.0, e) + 0.35 * smoothstep(0.32, 0.0, e);
        vec3 neon = vColor;
        neon = mix(neon, vec3(1.0, 0.13, 0.27), vState.x);
        float shimmer = vState.z * (0.5 + 0.5 * sin(uTime * 7.0 + vLocal.x * 18.0 + vLocal.y * 9.0));
        neon = mix(neon, vec3(1.0, 0.95, 0.4), shimmer * 0.8);
        vec3 col = uFace + neon * rim * (1.25 + vState.y * 0.8 + uBeat * 0.25);
        col += neon * 0.10 * (1.0 + vState.y);
        // Front face: label from the atlas.
        if (vN.z > 0.5) {
          vec2 uv = vLocal.xy + 0.5;
          // vCell is an interpolated varying: round first or mod() flickers at multiples of 8.
          float cell = floor(vCell + 0.5);
          float cx = cell - 8.0 * floor(cell / 8.0 + 0.001);
          float cy = floor(cell / 8.0 + 0.001);
          vec2 auv = (vec2(cx, 7.0 - cy) + uv) / 8.0;
          vec4 t = texture2D(uAtlas, auv);
          col = mix(col, mix(vec3(1.0), neon, 0.15) * (1.2 + vState.y * 0.4), t.a);
        }
        col += vec3(1.0) * vState.w;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  });
}

/** Soft additive glow quad (fake bloom). Instanced; uses instanceColor. */
export function createHaloMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uIntensity: { value: 0.55 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vUv = uv;
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(1.0);
        #endif
        #ifdef USE_INSTANCING
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #endif
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        float g = pow(max(0.0, 1.0 - d), 2.2);
        gl_FragColor = vec4(vColor * g * uIntensity, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
}

/** Synthwave sky dome: gradient, stars, striped sun on the horizon. */
export function createSkyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uPulse;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 top = vec3(0.02, 0.0, 0.06);
        vec3 mid = vec3(0.16, 0.02, 0.25);
        vec3 hor = vec3(0.55, 0.06, 0.45);
        vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, h));
        col = mix(col, top, smoothstep(0.18, 0.7, h));
        if (h < 0.0) col = mix(vec3(0.05, 0.0, 0.08), hor * 0.4, smoothstep(-0.15, 0.0, h));
        // Stars (static, twinkle slowly - no flashing).
        vec2 sp = vec2(atan(d.z, d.x) * 120.0, h * 200.0);
        vec2 cell = floor(sp);
        float star = step(0.992, hash(cell)) * smoothstep(0.08, 0.3, h);
        float tw = 0.6 + 0.4 * sin(uTime * 0.7 + hash(cell + 3.0) * 6.28);
        col += vec3(0.75, 0.8, 1.0) * star * tw * smoothstep(0.35, 0.05, length(fract(sp) - 0.5));
        // Sun toward -Z.
        vec3 sunDir = normalize(vec3(0.0, 0.07, -1.0));
        float ang = acos(clamp(dot(d, sunDir), -1.0, 1.0));
        float r = 0.24;
        if (ang < r) {
          float y = (d.y - sunDir.y) / r; // -1..1
          vec3 sunCol = mix(vec3(1.0, 0.2, 0.55), vec3(1.0, 0.85, 0.25), smoothstep(-0.8, 0.8, y));
          float stripes = step(0.0, y) + step(0.35, fract(y * 5.0 + 0.2));
          float edge = smoothstep(r, r * 0.96, ang);
          col = mix(col, sunCol * (1.1 + 0.15 * uPulse), edge * clamp(stripes, 0.0, 1.0));
        }
        col += vec3(1.0, 0.25, 0.6) * 0.25 * exp(-ang * 4.0);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    depthWrite: false,
    toneMapped: false,
  });
}

/** Neon grid floor that fades into the haze. Static (no scrolling: avoids vection). */
export function createFloorMaterial(color: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uPulse: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPulse;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float dist = length(p);
        float fade = exp(-dist * 0.07);
        float nearFade = smoothstep(0.4, 1.6, dist); // keep the floor under the player calm
        vec3 base = vec3(0.03, 0.0, 0.06);
        vec3 col = base + uColor * line * fade * (0.8 + 0.25 * uPulse) * mix(0.35, 1.0, nearFade);
        col = mix(col, vec3(0.3, 0.04, 0.3), (1.0 - fade) * 0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  });
}

/** Particles: instanced quads, additive, colour per instance, fade via aLife. */
export function createParticleMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aLife;
      varying float vLife;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vLife = aLife;
        vUv = uv;
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(1.0);
        #endif
        // Billboard: take instance translation and scale, face camera.
        vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        c.xy += position.xy * s;
        gl_Position = projectionMatrix * c;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vLife;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        // Diamond "data shard": sharp core + soft glow halo.
        float d = abs(p.x) + abs(p.y);
        float core = smoothstep(0.75, 0.45, d);
        float glow = smoothstep(1.4, 0.2, d) * 0.35;
        vec3 c = mix(vColor, vec3(1.0), core * 0.45);
        gl_FragColor = vec4(c * (core + glow) * vLife * 1.6, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
}

/** Head-locked edge vignette for damage / slow-mo. Never touches the centre of view. */
export function createVignetteMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(1, 0.1, 0.3) },
      uAmount: { value: 0 },
      uSeed: { value: 0 },
      uGlitch: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAmount;
      uniform float uSeed;
      uniform float uGlitch;
      varying vec2 vUv;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p * vec2(1.0, 1.15));
        float edge = smoothstep(0.55, 1.05, r);
        // Glitch: horizontal bands near the edges only. Pattern is fixed per event
        // (uSeed) and fades out - it never strobes (photosensitivity).
        float band = floor(vUv.y * 24.0);
        float g = step(0.6, hash(band + uSeed)) * uGlitch * edge;
        float a = clamp(edge * uAmount + g * 0.35, 0.0, 1.0);
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

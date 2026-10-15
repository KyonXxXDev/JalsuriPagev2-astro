"use client";
/**
 * PigmentCursor — tinta de acuarela o gouache que sigue al puntero.
 * React 18+ · WebGL2 · sin dependencias.
 *
 * Uso
 *   import PigmentCursor from "./PigmentCursor";
 *
 *   <div style={{ height: 600 }}>
 *     <PigmentCursor colors={["#5227FF", "#FF9FFC"]}>
 *       <h1>Tu hero aquí</h1>
 *     </PigmentCursor>
 *   </div>
 *
 * Props (todas opcionales)
 *   colors          [string, string]  ["#5227FF", "#FF9FFC"]  Las dos tintas; el pincel pasa de una a otra y se mezclan como pigmento.
 *   backgroundColor string            "transparent"           Fondo del componente. Transparente = pinta sobre tu página.
 *   mode            "auto" | "watercolor" | "gouache"  "auto"  Acuarela multiplica sobre fondos claros; gouache es opaco para fondos oscuros.
 *   size            number            14     Radio del pincel en px. Los trazos rápidos salen más finos.
 *   bloom           number            0.9    Segundos que tarda cada gota en abrirse.
 *   bleed           number            0.5    Cuánto se expande el halo de tinta sobre el papel (solo fondos claros).
 *   edge            number            0.6    Oscurecimiento que se acumula en los bordes al secar.
 *   roughness       number            0.3    Bordes de perfectamente lisos a orgánicos.
 *   grain           number            0.35   Textura de papel dentro de la tinta.
 *   intensity       number            1      Fuerza de la tinta.
 *   fade            number            3.5    Segundos que dura cada parte del trazo; lo más viejo se evapora primero.
 *   follow          number            0.06   Segundos de retraso del pincel respecto al puntero (suaviza el pulso).
 *   colorCycle      number            700    Px de recorrido para ir de la primera tinta a la segunda y volver. 0 = solo la primera.
 *   splash          boolean           true   Clic o toque: salpicadura de tinta.
 *   autoplay        boolean           true   Una mano invisible pinta hasta que llega el puntero y después de que se va.
 *   autoplaySpeed   number            1      Velocidad de esa mano.
 *   idleDelay       number            1.5    Segundos tras salir el puntero antes de que la mano vuelva.
 *   interactive     boolean           true   El puntero y el toque pintan (escucha en window: el contenido encima también pinta).
 *   paused          boolean           false  Congela la tinta. Con "reducir movimiento" nunca hay mano invisible.
 *   quality         "low" | "medium" | "high"  "medium"  Resolución a la que se forma la tinta.
 *   dpr             number            2      Device pixel ratio máximo del canvas.
 *   ref             { splash(x, y), clear() }  Salpicar en un punto (px desde la esquina superior izquierda) o limpiar.
 *   children        ReactNode                Contenido por encima de la tinta.
 *   className/style                          Para el elemento raíz (ocupa su contenedor, mínimo 320px de alto).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  Motor de pigmento · WebGL2, sin dependencias
//  Cada movimiento del pincel deja "gotas" de tinta (una lista viva en la GPU).
//  En cada cuadro se suman en un campo de densidad, se umbraliza con ruido de
//  papel (bordes orgánicos) y se compone como acuarela (multiplica) o gouache
//  (opaco). Los dos pigmentos se mezclan de forma sustractiva.
// ─────────────────────────────────────────────────────────────────────────────

const PIGMENT_DEFAULTS = Object.freeze({
  colors: ["#5227FF", "#FF9FFC"],
  backgroundColor: "transparent",
  mode: "auto",
  size: 14,
  bloom: 0.9,
  bleed: 0.5,
  edge: 0.6,
  roughness: 0.3,
  grain: 0.35,
  intensity: 1,
  fade: 3.5,
  follow: 0.06,
  colorCycle: 700,
  splash: true,
  autoplay: true,
  autoplaySpeed: 1,
  idleDelay: 1.5,
  interactive: true,
  paused: false,
  quality: "medium",
  dpr: 2,
});

const QUALITY_SCALE = { low: 0.35, medium: 0.5, high: 1 };
const STRIDE = 8; // floats por gota: x, y, radio, nacimiento, mezcla, cantidad, vida, en vuelo
const CAPACITY = 16384; // gotas vivas como máximo (búfer circular)
const TRANSIENT_CAP = 768; // gotas de salpicadura en vuelo por cuadro
const LIFE_MAX = 1.35; // vida relativa máxima (las salpicaduras duran un poco más)
const SPACING = 0.22; // distancia entre gotas, en radios
const REF = 16 / 15 / SPACING; // densidad en el centro de un trazo normal
const THRESHOLD = 0.3; // isolínea que se convierte en el borde del trazo
const RADIUS_GAIN = 1.25; // compensa el umbral: el semiancho visible ≈ size
const HALO_TEXEL = 4; // px CSS por texel del halo (bleed)

const SPLAT_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aStamp;   // x, y, radio, nacimiento
layout(location = 2) in vec4 aInfo;    // mezcla, cantidad, vida, en vuelo
uniform vec2 uView;
uniform float uTime;
uniform float uFade;
uniform float uBloom;
uniform float uFS;
out vec2 vLocal;
out vec4 vInfo;
void main() {
  float age = uTime - aStamp.w;
  float u = age / max(uFade * aInfo.z, 0.05);
  bool flying = aInfo.w > 0.5;
  if (!flying && (age < 0.0 || u >= 1.0)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vLocal = vec2(0.0);
    vInfo = vec4(0.0);
    return;
  }
  // bloom: la gota se abre después de caer
  float b = clamp(age / max(uBloom, 0.001), 0.0, 1.0);
  float grow = flying ? 1.0 : 0.4 + 0.6 * (1.0 - pow(1.0 - b, 3.0));
  // fade: la tinta más vieja se evapora primero y el trazo se adelgaza
  float keep = flying ? 1.0 : 1.0 - smoothstep(0.3, 1.0, u);
  float fadeK = pow(keep, 0.6);
  float r = aStamp.z * grow * fadeK;
  float rq = max(r, 1.5 / uFS);
  vec2 p = aStamp.xy + aCorner * rq;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  vLocal = aCorner * (rq / max(r, 0.0001));
  float dry = flying ? 0.0 : 1.0 - exp(-age / 0.8);
  float creep = flying ? 0.0 : 1.0 - exp(-age / 1.1);
  vInfo = vec4(aInfo.x, aInfo.y * fadeK, dry, creep);
}`;

const SPLAT_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vInfo;
uniform float uEncode;
out vec4 outColor;
void main() {
  float d2 = dot(vLocal, vLocal);
  if (d2 >= 1.0) discard;
  float k = 1.0 - d2;
  float w = k * k * vInfo.y;
  // r: tinta 1 · g: tinta 2 · b: tinta que ya se expande (halo) · a: tinta seca
  outColor = vec4(w * (1.0 - vInfo.x), w * vInfo.x, w * vInfo.w, w * vInfo.z) * uEncode;
}`;

const FULL_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const DOWN_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform vec2 uOff;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  outColor = 0.25 * (texture(uTex, uv - uOff) + texture(uTex, uv + uOff)
    + texture(uTex, uv + vec2(uOff.x, -uOff.y)) + texture(uTex, uv + vec2(-uOff.x, uOff.y)));
}`;

const BLUR_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform vec2 uStep;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 s = texture(uTex, uv);
  float n = 1.0;
  for (int i = 1; i <= 6; i++) {
    float w = exp(-float(i * i) / 18.0);
    s += (texture(uTex, uv + uStep * float(i)) + texture(uTex, uv - uStep * float(i))) * w;
    n += 2.0 * w;
  }
  outColor = s / n;
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uField;
uniform sampler2D uHalo;
uniform vec2 uRes;
uniform float uPR;
uniform float uFS;
uniform vec2 uTexel;
uniform float uDecode;
uniform vec3 uKA;
uniform vec3 uKB;
uniform float uGouache;
uniform float uIntensity;
uniform float uEdge;
uniform float uRough;
uniform float uGrain;
uniform float uBleed;
uniform float uSize;
out vec4 outColor;

const float REF = ${REF.toFixed(4)};
const float THRESHOLD = ${THRESHOLD.toFixed(4)};

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = mat2(1.6, -1.2, 1.2, 1.6) * p + 7.31;
    a *= 0.5;
  }
  return s / 0.9375;
}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float dens(vec2 uv) {
  vec4 f = textureLod(uField, uv, 0.0);
  return (f.r + f.g) * uDecode;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 f = textureLod(uField, uv, 0.0) * uDecode;
  float D = f.r + f.g;
  float aaD = fwidth(D);
  vec4 h = textureLod(uHalo, uv, 0.0) * uDecode;
  float halo = uBleed * (1.0 - uGouache) * h.b;
  if (D < 0.015 && halo < 0.0015) {
    outColor = vec4(0.0);
    return;
  }

  vec2 pc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPR; // px CSS, fijo al papel
  vec2 t = uTexel;
  float gx = dens(uv + vec2(t.x, 0.0)) - dens(uv - vec2(t.x, 0.0));
  float gy = dens(uv + vec2(0.0, t.y)) - dens(uv - vec2(0.0, t.y));
  float grad = 0.5 * length(vec2(gx, gy)) * uFS;

  // roughness: el ruido del papel dobla la isolínea del borde
  float n1 = fbm(pc / (uSize * 0.85));
  float n2 = noise(pc / (uSize * 0.2) + 19.7);
  float thr = THRESHOLD * exp(uRough * (1.6 * (n1 - 0.5) + 0.7 * (n2 - 0.5)));
  float aa = max(aaD * 0.75, 0.0001);
  float m = smoothstep(thr - aa, thr + aa, D);

  // edge: banda junto al borde, más marcada cuanto más seca está la tinta
  float sd = (D - thr) / max(grad, 0.0001);
  float eb = m * (1.0 - smoothstep(0.0, max(uSize * 0.3, 1.5), sd));
  float dry = clamp(f.a / max(D, 0.00001), 0.0, 1.0);
  float T = D / REF;

  // mezcla sustractiva: se promedian absorbancias (media geométrica de reflectancias)
  vec3 K = mix(uKA, uKB, clamp(f.g / max(D, 0.00001), 0.0, 1.0));
  float dither = (hash(gl_FragCoord.xy + 3.7) - 0.5) / 255.0;
  float blot = fbm(pc / (uSize * 3.2) + 2.9); // manchas amplias, como un lavado irregular

  if (uGouache < 0.5) {
    // acuarela: tinta transparente que se multiplica sobre el papel
    float gr = fbm(pc * 0.55 + 41.0); // granulación fina del papel
    float tau = uIntensity * (0.45 + 0.55 * min(T, 2.6)) * (0.82 + 0.36 * blot);
    tau *= 1.0 - 0.35 * uEdge * dry;
    tau += uIntensity * uEdge * 2.4 * eb * (0.3 + 0.7 * dry);
    tau *= max(0.0, 1.0 + uGrain * 1.6 * (gr - 0.5));
    float hw = h.r + h.g;
    vec3 Kh = mix(uKA, uKB, clamp(h.g / max(hw, 0.00001), 0.0, 1.0));
    float hn = fbm(pc / (uSize * 1.5) + 5.3);
    float tauH = uIntensity * smoothstep(0.0, 0.4, halo / REF) * (0.3 + 1.1 * hn);
    vec3 col = mix(exp(-Kh * tauH), exp(-K * tau - Kh * tauH * 0.25), m);
    vec3 s = clamp(toSRGB(col) + dither, 0.0, 1.0);
    float mn = min(s.r, min(s.g, s.b));
    // equivale a multiplicar el fondo por "s" (exacto con mix-blend-mode: multiply)
    outColor = vec4(s - mn, 1.0 - mn);
  } else {
    // gouache: pintura opaca para fondos oscuros
    float gm = fbm(pc / 2.6 + 13.0); // textura de pincel, más gruesa que la granulación
    float body = 0.9 + 0.3 * clamp(T - 1.0, 0.0, 1.5);
    vec3 refl = exp(-K * body);
    refl *= 1.0 - 0.32 * uEdge * eb * (0.3 + 0.7 * dry);
    refl *= 1.0 + uGrain * 0.28 * (gm - 0.5) + 0.06 * (blot - 0.5);
    float a = m * clamp(uIntensity * (0.78 + 0.4 * T), 0.0, 1.0);
    // pincel seco: solo el borde exterior se deshilacha
    float rim = 1.0 - smoothstep(0.0, max(uSize * 0.22, 1.0), sd);
    a *= 1.0 - uGrain * 1.4 * rim * smoothstep(0.42, 0.78, gm);
    a = clamp(a, 0.0, 1.0);
    vec3 c = clamp(toSRGB(refl) + dither, 0.0, 1.0);
    outColor = vec4(c * a, a);
  }
}`;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

let colorCtx = null;
function parseColor(value) {
  if (typeof document === "undefined") return [0, 0, 0, 0];
  if (!colorCtx) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    colorCtx = c.getContext("2d", { willReadFrequently: true });
  }
  colorCtx.clearRect(0, 0, 1, 1);
  colorCtx.fillStyle = "rgba(0,0,0,0)";
  try {
    colorCtx.fillStyle = String(value);
  } catch (e) {
    /* color inválido: queda transparente */
  }
  colorCtx.fillRect(0, 0, 1, 1);
  const d = colorCtx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
}
function absorbance(value, fallback) {
  let c = parseColor(value);
  if (c[3] === 0) c = parseColor(fallback);
  return new Float32Array([0, 1, 2].map((i) => -Math.log(Math.max(srgbToLinear(c[i]), 0.004))));
}

function compileProgram(gl, vsSource, fsSource) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log || "shader compile error");
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "program link error");
  }
  const u = {};
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(program, i);
    u[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, u };
}

class PigmentEngine {
  constructor(root, canvas, options = {}) {
    this.root = root;
    this.canvas = canvas;
    this.o = { ...PIGMENT_DEFAULTS };
    this.supported = false;
    this.lost = false;
    this.visible = true;
    this.time = 0;
    this.cssW = 1;
    this.cssH = 1;
    this.pr = 1;
    this.fieldPerCss = 1;
    this.bgDark = false;
    this.modeResolved = "";
    this.source = "none";
    this.reducedMotion = false;
    this.field = null;

    this.data = new Float32Array(CAPACITY * STRIDE);
    this.head = 0;
    this.count = 0;
    this.pending = 0;
    this.tData = new Float32Array(TRANSIENT_CAP * STRIDE);
    this.tCount = 0;
    this.drops = [];

    this.brush = { x: 0, y: 0, has: false, down: false, fresh: false, carry: 0, dist: 0, speed: 0, still: 0, strokeStart: 0 };
    this.pointer = { x: 0, y: 0, cx: 0, cy: 0, hasPos: false, type: "mouse", inside: false, leftAt: -1e9 };
    this.auto = { x: 0, y: 0, angle: 0, t: 0, ph: [0, 0, 0, 0], press: 1, pen: true, timer: 3 };

    this._raf = 0;
    this._last = 0;
    this._frame = this._frame.bind(this);

    if (typeof window === "undefined" || !root || !canvas) return;
    if (!this._initGL()) return;
    this.supported = true;
    this.setOptions(options);
    this._bind();
    this._detectBackground();
    this._applyMode();
    this._resize();
    this._kick();
  }

  // ── API pública ───────────────────────────────────────────────────────────

  setOptions(next = {}) {
    const prev = this.o;
    const o = { ...PIGMENT_DEFAULTS };
    for (const key in next) {
      if (next[key] !== undefined && key in PIGMENT_DEFAULTS) o[key] = next[key];
    }
    this.o = o;
    if (!this.supported) return;

    const cols = Array.isArray(o.colors) && o.colors.length ? o.colors : PIGMENT_DEFAULTS.colors;
    const inkKey = `${cols[0]}|${cols[1] ?? cols[0]}`;
    if (inkKey !== this._inkKey) {
      this._inkKey = inkKey;
      this.kA = absorbance(cols[0], PIGMENT_DEFAULTS.colors[0]);
      this.kB = absorbance(cols[1] ?? cols[0], PIGMENT_DEFAULTS.colors[1]);
    }
    if (o.backgroundColor !== prev.backgroundColor) this._detectBackground();
    this._applyMode();
    if (this.field && (o.dpr !== prev.dpr || o.quality !== prev.quality)) this._resize();
    if (!o.interactive) this._pointerGone();
    if (o.paused) this._stop();
    this._kick();
    if (!this._raf && this.field) this._render();
  }

  /** Salpica tinta en (x, y), en px desde la esquina superior izquierda. */
  splash(x, y) {
    if (!this.supported) return;
    const s = Math.max(2, this.o.size);
    const mix = this._mixAt(this.brush.dist);
    const t = this.time;
    const tint = (spread) => clamp(mix + (Math.random() - 0.5) * spread, 0, 1);
    // charco central irregular
    const blobs = 9 + Math.floor(Math.random() * 5);
    for (let i = 0; i < blobs; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = s * 1.25 * Math.sqrt(Math.random());
      const r = s * (0.55 + Math.random() * 0.85) * RADIUS_GAIN;
      this._add(x + Math.cos(a) * d, y + Math.sin(a) * d, r, t, tint(0.12), 1.35, 1.3);
    }
    // brazos cortos que salen del impacto
    const arms = 4 + Math.floor(Math.random() * 4);
    for (let j = 0; j < arms; j++) {
      const a = Math.random() * Math.PI * 2;
      const len = s * (1.6 + Math.random() * 2.0);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const c = tint(0.14);
      for (let d = s * 0.6; d < len; d += s * 0.16) {
        const k = (d - s * 0.6) / Math.max(len - s * 0.6, 1);
        this._add(x + ca * d, y + sa * d, s * (0.5 - 0.32 * k) * RADIUS_GAIN, t, c, 1.1, 1.3);
      }
      this._add(x + ca * len, y + sa * len, s * (0.28 + Math.random() * 0.14) * RADIUS_GAIN, t, c, 1.4, 1.3);
    }
    // gotas que salen volando, aterrizan y se abren
    const n = 12 + Math.floor(Math.random() * 10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const big = Math.random();
      const r = s * (0.12 + 0.4 * big * big);
      const speed = s * (20 + Math.random() * 60) * (1.2 - big * 0.55);
      this.drops.push({
        sx: x, sy: y, x, y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        age: 0, flight: 0.09 + Math.random() * 0.22, r,
        mix: tint(0.18),
      });
    }
    this._kick();
    if (!this._raf && this.field) this._render();
  }

  /** Limpia el papel. */
  clear() {
    this.count = 0;
    this.pending = 0;
    this.tCount = 0;
    this.drops.length = 0;
    this.brush.down = false;
    if (this.supported && !this._raf && this.field) this._render();
  }

  destroy() {
    this._stop();
    if (!this.supported) return;
    this.supported = false;
    const w = window;
    w.removeEventListener("pointermove", this._onPointer);
    w.removeEventListener("pointerdown", this._onPointer);
    w.removeEventListener("pointerup", this._onPointerEnd);
    w.removeEventListener("pointercancel", this._onPointerEnd);
    w.removeEventListener("pointerout", this._onOut);
    w.removeEventListener("blur", this._onBlur);
    w.removeEventListener("scroll", this._onScroll, true);
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._mqDark?.removeEventListener?.("change", this._onTheme);
    this._mqMotion?.removeEventListener?.("change", this._onMotion);
    this.canvas.removeEventListener("webglcontextlost", this._onLost);
    this.canvas.removeEventListener("webglcontextrestored", this._onRestored);
    this._ro?.disconnect();
    this._io?.disconnect();
    this._mo?.disconnect();
    clearInterval(this._themeTimer);
    if (!this.lost) {
      const gl = this.gl;
      [this.splatP, this.downP, this.blurP, this.compP].forEach((p) => p && gl.deleteProgram(p.program));
      [this.quadBuf, this.ringBuf, this.tBuf].forEach((b) => gl.deleteBuffer(b));
      [this.ringVAO, this.tVAO, this.fullVAO].forEach((v) => gl.deleteVertexArray(v));
      [this.field, this.haloA, this.haloB].forEach((t) => this._freeTarget(t));
    }
    this.field = null;
  }

  // ── WebGL ─────────────────────────────────────────────────────────────────

  _initGL() {
    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return false;
    this.gl = gl;
    try {
      this.splatP = compileProgram(gl, SPLAT_VS, SPLAT_FS);
      this.downP = compileProgram(gl, FULL_VS, DOWN_FS);
      this.blurP = compileProgram(gl, FULL_VS, BLUR_FS);
      this.compP = compileProgram(gl, FULL_VS, COMPOSITE_FS);
    } catch (err) {
      console.warn("[PigmentCursor] WebGL2 no disponible:", err);
      return false;
    }
    const byte = { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE, encode: 1 / 8 };
    this.fmt = byte;
    if (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")) {
      this.fmt = { internal: gl.RGBA16F, type: gl.HALF_FLOAT, encode: 1 };
      const probe = this._target(4, 4);
      if (!probe.ok) this.fmt = byte;
      this._freeTarget(probe);
    }

    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.ringBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ringBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    this.tBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.tData.byteLength, gl.DYNAMIC_DRAW);
    this.ringVAO = this._stampVAO(this.ringBuf);
    this.tVAO = this._stampVAO(this.tBuf);
    this.fullVAO = gl.createVertexArray();
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.field = this.haloA = this.haloB = null;
    this.pending = this.count;
    return true;
  }

  _stampVAO(buf) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * 4, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    return vao;
  }

  _target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.fmt.internal, w, h, 0, gl.RGBA, this.fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (ok) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h, ok };
  }

  _freeTarget(t) {
    if (!t || !this.gl) return;
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  _resize() {
    if (!this.supported || this.lost) return;
    const o = this.o;
    const W = Math.max(1, this.root.clientWidth);
    const H = Math.max(1, this.root.clientHeight);
    const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, o.dpr || 1));
    const cw = Math.max(1, Math.round(W * pr));
    const ch = Math.max(1, Math.round(H * pr));
    this.cssW = W;
    this.cssH = H;
    this.pr = pr;
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const q = QUALITY_SCALE[o.quality] ?? QUALITY_SCALE.medium;
    const fw = Math.max(1, Math.round(cw * q));
    const fh = Math.max(1, Math.round(ch * q));
    if (!this.field || this.field.w !== fw || this.field.h !== fh) {
      this._freeTarget(this.field);
      this.field = this._target(fw, fh);
    }
    const hw = Math.max(1, Math.ceil(W / HALO_TEXEL));
    const hh = Math.max(1, Math.ceil(H / HALO_TEXEL));
    if (!this.haloA || this.haloA.w !== hw || this.haloA.h !== hh) {
      this._freeTarget(this.haloA);
      this._freeTarget(this.haloB);
      this.haloA = this._target(hw, hh);
      this.haloB = this._target(hw, hh);
    }
    this.fieldPerCss = fw / W;
    this._kick();
    if (!this._raf) this._render();
  }

  _upload() {
    const gl = this.gl;
    const n = Math.min(this.pending, this.count);
    this.pending = 0;
    if (n <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ringBuf);
    const start = (this.head - n + CAPACITY) % CAPACITY;
    if (start + n <= CAPACITY) {
      gl.bufferSubData(gl.ARRAY_BUFFER, start * STRIDE * 4, this.data, start * STRIDE, n * STRIDE);
    } else {
      const first = CAPACITY - start;
      gl.bufferSubData(gl.ARRAY_BUFFER, start * STRIDE * 4, this.data, start * STRIDE, first * STRIDE);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, (n - first) * STRIDE);
    }
  }

  _trim() {
    const lifeMax = Math.max(this.o.fade, 0.05) * LIFE_MAX;
    while (this.count > 0) {
      const i = (this.head - this.count + CAPACITY) % CAPACITY;
      if (this.time - this.data[i * STRIDE + 3] < lifeMax) break;
      this.count--;
    }
  }

  _drawRing() {
    const gl = this.gl;
    const start = (this.head - this.count + CAPACITY) % CAPACITY;
    gl.bindVertexArray(this.ringVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ringBuf);
    const draw = (first, n) => {
      if (n <= 0) return;
      const off = first * STRIDE * 4;
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, off);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * 4, off + 16);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    };
    if (start + this.count <= CAPACITY) draw(start, this.count);
    else {
      draw(start, CAPACITY - start);
      draw(0, this.head);
    }
  }

  _render() {
    if (!this.supported || this.lost || !this.field) return;
    const gl = this.gl;
    const o = this.o;
    this._trim();
    this._upload();

    // 1 · campo de pigmento: se suman todas las gotas vivas
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.field.fbo);
    gl.viewport(0, 0, this.field.w, this.field.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.count || this.tCount) {
      const S = this.splatP;
      gl.useProgram(S.program);
      gl.uniform2f(S.u.uView, this.cssW, this.cssH);
      gl.uniform1f(S.u.uTime, this.time);
      gl.uniform1f(S.u.uFade, Math.max(o.fade, 0.05));
      gl.uniform1f(S.u.uBloom, Math.max(o.bloom, 0));
      gl.uniform1f(S.u.uFS, this.fieldPerCss);
      gl.uniform1f(S.u.uEncode, this.fmt.encode);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      if (this.count) this._drawRing();
      if (this.tCount) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.tBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.tData, 0, this.tCount * STRIDE);
        gl.bindVertexArray(this.tVAO);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.tCount);
      }
      gl.disable(gl.BLEND);
    }

    // 2 · halo (bleed): versión reducida y desenfocada del campo
    const watercolor = this.modeResolved !== "gouache";
    const bleed = watercolor ? Math.max(0, o.bleed) : 0;
    gl.bindVertexArray(this.fullVAO);
    if (bleed > 0 && this.count) {
      const A = this.haloA;
      const B = this.haloB;
      gl.viewport(0, 0, A.w, A.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.fbo);
      gl.useProgram(this.downP.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.field.tex);
      gl.uniform1i(this.downP.u.uTex, 0);
      gl.uniform2f(this.downP.u.uSize, A.w, A.h);
      const ratio = this.field.w / A.w;
      gl.uniform2f(this.downP.u.uOff, (0.25 * ratio) / this.field.w, (0.25 * ratio) / this.field.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const sigma = Math.max(1, o.size) * (0.45 + 2.2 * bleed);
      const step = Math.max(1, sigma / HALO_TEXEL / 3);
      gl.useProgram(this.blurP.program);
      gl.uniform1i(this.blurP.u.uTex, 0);
      gl.uniform2f(this.blurP.u.uSize, A.w, A.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo);
      gl.bindTexture(gl.TEXTURE_2D, A.tex);
      gl.uniform2f(this.blurP.u.uStep, step / A.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.fbo);
      gl.bindTexture(gl.TEXTURE_2D, B.tex);
      gl.uniform2f(this.blurP.u.uStep, 0, step / A.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 3 · composición final sobre el canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const C = this.compP;
    const u = C.u;
    gl.useProgram(C.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.field.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.haloA.tex);
    gl.uniform1i(u.uField, 0);
    gl.uniform1i(u.uHalo, 1);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uPR, this.pr);
    gl.uniform1f(u.uFS, this.fieldPerCss);
    gl.uniform2f(u.uTexel, 1 / this.field.w, 1 / this.field.h);
    gl.uniform1f(u.uDecode, 1 / this.fmt.encode);
    gl.uniform3fv(u.uKA, this.kA);
    gl.uniform3fv(u.uKB, this.kB);
    gl.uniform1f(u.uGouache, watercolor ? 0 : 1);
    gl.uniform1f(u.uIntensity, Math.max(0, o.intensity));
    gl.uniform1f(u.uEdge, Math.max(0, o.edge));
    gl.uniform1f(u.uRough, Math.max(0, o.roughness));
    gl.uniform1f(u.uGrain, Math.max(0, o.grain));
    gl.uniform1f(u.uBleed, this.count ? bleed : 0);
    gl.uniform1f(u.uSize, Math.max(1, o.size));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  // ── Bucle ─────────────────────────────────────────────────────────────────

  _shouldRun() {
    return (
      this.supported &&
      !this.lost &&
      !!this.field &&
      !this.o.paused &&
      this.visible &&
      !(typeof document !== "undefined" && document.hidden)
    );
  }

  _kick() {
    if (this._raf || !this._shouldRun()) return;
    this._last = 0;
    this._raf = requestAnimationFrame(this._frame);
  }

  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  _frame(now) {
    this._raf = 0;
    if (!this._shouldRun()) return;
    const t = now / 1000;
    const dt = this._last ? Math.min(Math.max(t - this._last, 0), 0.05) : 1 / 60;
    this._last = t;
    this.time += dt;
    if (this.time > 5000) this._rebase();
    this._update(dt);
    this._render();
    const idle =
      !this.count && !this.drops.length && this.source === "none" && !(this.o.autoplay && !this.reducedMotion);
    if (!idle) this._raf = requestAnimationFrame(this._frame);
  }

  _rebase() {
    const shift = this.time - 60;
    for (let k = 0; k < this.count; k++) {
      this.data[((this.head - 1 - k + CAPACITY) % CAPACITY) * STRIDE + 3] -= shift;
    }
    this.time -= shift;
    this.brush.strokeStart -= shift;
    this.pointer.leftAt -= shift;
    this.pending = this.count;
  }

  // ── Pincel ────────────────────────────────────────────────────────────────

  _update(dt) {
    const o = this.o;
    const p = this.pointer;
    const b = this.brush;
    this.tCount = 0;

    let src = "none";
    if (o.interactive && p.inside) src = "pointer";
    else if (o.autoplay && !this.reducedMotion && this.time - p.leftAt >= o.idleDelay) src = "auto";

    if (src !== this.source) {
      if (src === "pointer") {
        b.x = p.x;
        b.y = p.y;
        b.has = true;
        b.speed = 0;
        b.down = false;
      } else if (src === "auto") this._startAuto();
      else b.down = false;
      this.source = src;
    }

    if (src !== "none") {
      let tx = p.x;
      let ty = p.y;
      let pen = true;
      if (src === "auto") {
        pen = this._stepAuto(dt);
        tx = this.auto.x;
        ty = this.auto.y;
      }
      if (!b.has) {
        b.x = tx;
        b.y = ty;
        b.has = true;
      }
      const k = o.follow > 0 ? 1 - Math.exp(-dt / o.follow) : 1;
      const px = b.x;
      const py = b.y;
      b.x += (tx - px) * k;
      b.y += (ty - py) * k;
      const len = Math.hypot(b.x - px, b.y - py);
      b.speed += (len / Math.max(dt, 0.001) - b.speed) * (1 - Math.exp(-dt / 0.08));
      if (len < 0.15) {
        b.still += dt;
        if (b.still > 0.35) b.down = false; // el pincel descansa: el próximo trazo empieza afilado
      } else b.still = 0;

      if (pen && len >= 0.15) {
        if (!b.down) {
          b.down = true;
          b.fresh = true;
          b.carry = 0;
          b.strokeStart = this.time - dt;
        }
        this._paint(px, py, b.x, b.y, len, dt);
      } else if (!pen) b.down = false;
    }
    this._updateDrops(dt);
  }

  _radius() {
    const b = this.brush;
    const speedK = 0.4 + 0.6 * Math.exp(-b.speed / 1400); // trazos rápidos, más finos
    const ramp = clamp((this.time - b.strokeStart) / 0.16, 0, 1);
    const taper = 0.35 + 0.65 * (1 - (1 - ramp) * (1 - ramp));
    const press = this.source === "auto" ? this.auto.press : 1;
    return Math.max(0.6, this.o.size * RADIUS_GAIN * speedK * taper * press);
  }

  _mixAt(dist) {
    const cycle = this.o.colorCycle;
    return cycle > 0 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * dist) / cycle) : 0;
  }

  _paint(x0, y0, x1, y1, len, dt) {
    const b = this.brush;
    const r = this._radius();
    const step = Math.max(0.5, r * SPACING);
    let d = b.fresh ? 0 : step - b.carry;
    b.fresh = false;
    const t0 = this.time - dt;
    while (d <= len) {
      const f = d / len;
      const jitter = 1 + (Math.random() - 0.5) * 0.12;
      this._add(
        x0 + (x1 - x0) * f,
        y0 + (y1 - y0) * f,
        r * jitter,
        t0 + dt * f,
        this._mixAt(b.dist + d),
        0.92 + Math.random() * 0.16,
        1
      );
      d += step;
    }
    b.carry = len - (d - step);
    b.dist += len;
  }

  _add(x, y, r, birth, mix, amount, life) {
    const d = this.data;
    const i = this.head * STRIDE;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = r;
    d[i + 3] = birth;
    d[i + 4] = mix;
    d[i + 5] = amount;
    d[i + 6] = life;
    d[i + 7] = 0;
    this.head = (this.head + 1) % CAPACITY;
    if (this.count < CAPACITY) this.count++;
    if (this.pending < CAPACITY) this.pending++;
  }

  _addFlying(x, y, r, mix, amount) {
    if (this.tCount >= TRANSIENT_CAP) return;
    const d = this.tData;
    const i = this.tCount++ * STRIDE;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = r;
    d[i + 3] = this.time;
    d[i + 4] = mix;
    d[i + 5] = amount;
    d[i + 6] = 1;
    d[i + 7] = 1;
  }

  _updateDrops(dt) {
    const k = 3.5;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      const e = Math.exp(-k * Math.min(d.age, d.flight));
      const px = d.x;
      const py = d.y;
      d.x = d.sx + (d.vx / k) * (1 - e);
      d.y = d.sy + (d.vy / k) * (1 - e);
      if (d.age >= d.flight) {
        // aterriza: gota, cola alargada y a veces un satélite
        const vx = d.vx * e;
        const vy = d.vy * e;
        const sp = Math.hypot(vx, vy) || 1;
        const ux = vx / sp;
        const uy = vy / sp;
        const R = d.r * RADIUS_GAIN;
        this._add(d.x, d.y, R, this.time, d.mix, 1.5, 1.2);
        this._add(d.x - ux * d.r * 0.9, d.y - uy * d.r * 0.9, R * 0.7, this.time, d.mix, 1.2, 1.2);
        this._add(d.x - ux * d.r * 1.8, d.y - uy * d.r * 1.8, R * 0.45, this.time, d.mix, 1.0, 1.2);
        if (Math.random() < 0.6) {
          const g = d.r * (1.8 + Math.random() * 1.8);
          this._add(d.x + ux * g, d.y + uy * g, R * (0.25 + Math.random() * 0.15), this.time, d.mix, 1.4, 1.2);
        }
        this.drops.splice(i, 1);
      } else {
        this._addFlying(d.x, d.y, d.r * 0.8 * RADIUS_GAIN, d.mix, 1.4);
        this._addFlying((d.x + px) / 2, (d.y + py) / 2, d.r * 0.55 * RADIUS_GAIN, d.mix, 1.1);
      }
    }
  }

  // ── Mano invisible (autoplay) ─────────────────────────────────────────────

  _startAuto() {
    const a = this.auto;
    const b = this.brush;
    const W = this.cssW;
    const H = this.cssH;
    if (b.has) {
      a.x = clamp(b.x, 0, W);
      a.y = clamp(b.y, 0, H);
    } else {
      a.x = W * (0.25 + Math.random() * 0.5);
      a.y = H * (0.3 + Math.random() * 0.4);
      b.x = a.x;
      b.y = a.y;
      b.has = true;
    }
    a.angle = Math.random() * Math.PI * 2;
    a.t = Math.random() * 1000;
    a.ph = [0, 1, 2, 3].map(() => Math.random() * Math.PI * 2);
    a.pen = true;
    a.timer = 2.5 + Math.random() * 2.5;
    b.down = false;
  }

  _stepAuto(dt) {
    const a = this.auto;
    const W = this.cssW;
    const H = this.cssH;
    const sdt = dt * Math.max(0, this.o.autoplaySpeed);
    a.t += sdt;
    const base = clamp(Math.min(W, H) * 0.75, 180, 620);
    const speed = base * (0.8 + 0.35 * Math.sin(a.t * 1.13 + a.ph[0]));
    let turn = 1.7 * Math.sin(a.t * 0.71 + a.ph[1]) + 0.8 * Math.sin(a.t * 1.93 + a.ph[2]);
    const out = Math.max(Math.abs((a.x - W / 2) / (W / 2)), Math.abs((a.y - H / 2) / (H / 2)));
    if (out > 0.5) {
      const toCenter = Math.atan2(H / 2 - a.y, W / 2 - a.x);
      const diff = Math.atan2(Math.sin(toCenter - a.angle), Math.cos(toCenter - a.angle));
      const pull = smoothstep(0.5, 0.92, out);
      turn = turn * (1 - pull) + diff * 4.5 * pull;
    }
    a.angle += turn * sdt;
    a.x = clamp(a.x + Math.cos(a.angle) * speed * sdt, 0, W);
    a.y = clamp(a.y + Math.sin(a.angle) * speed * sdt, 0, H);
    a.press = 0.82 + 0.28 * (0.5 + 0.5 * Math.sin(a.t * 2.4 + a.ph[3]));
    a.timer -= sdt;
    if (a.timer <= 0) {
      a.pen = !a.pen;
      a.timer = a.pen ? 2.2 + Math.random() * 3 : 0.18 + Math.random() * 0.3;
    }
    return a.pen;
  }

  // ── Eventos, tema y visibilidad ───────────────────────────────────────────

  _bind() {
    const w = window;
    this._onPointer = (e) => {
      const p = this.pointer;
      p.cx = e.clientX;
      p.cy = e.clientY;
      p.hasPos = true;
      p.type = e.pointerType || "mouse";
      this._locate();
      if (e.type === "pointerdown" && p.inside && this.o.splash) this.splash(p.x, p.y);
    };
    this._onPointerEnd = (e) => {
      if (e.pointerType === "touch") this._pointerGone();
    };
    this._onOut = (e) => {
      if (!e.relatedTarget) this._pointerGone();
    };
    this._onBlur = () => this._pointerGone();
    this._onScroll = () => {
      const p = this.pointer;
      if (p.hasPos && p.type !== "touch") this._locate();
    };
    w.addEventListener("pointermove", this._onPointer, { passive: true });
    w.addEventListener("pointerdown", this._onPointer, { passive: true });
    w.addEventListener("pointerup", this._onPointerEnd, { passive: true });
    w.addEventListener("pointercancel", this._onPointerEnd, { passive: true });
    w.addEventListener("pointerout", this._onOut, { passive: true });
    w.addEventListener("blur", this._onBlur);
    w.addEventListener("scroll", this._onScroll, { passive: true, capture: true });

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.root);
    if ("IntersectionObserver" in w) {
      this._io = new IntersectionObserver((entries) => {
        this.visible = entries[entries.length - 1].isIntersecting;
        this._kick();
      });
      this._io.observe(this.root);
    }
    this._onVisibility = () => this._kick();
    document.addEventListener("visibilitychange", this._onVisibility);

    let queued = false;
    this._onTheme = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        this._detectBackground();
      });
    };
    this._mo = new MutationObserver(this._onTheme);
    this._mo.observe(document.documentElement, { attributes: true });
    if (document.body) this._mo.observe(document.body, { attributes: true });
    this._mqDark = w.matchMedia ? w.matchMedia("(prefers-color-scheme: dark)") : null;
    this._mqDark?.addEventListener?.("change", this._onTheme);
    this._themeTimer = setInterval(this._onTheme, 1500);

    this._mqMotion = w.matchMedia ? w.matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.reducedMotion = !!this._mqMotion?.matches;
    this._onMotion = () => {
      this.reducedMotion = !!this._mqMotion.matches;
      this._kick();
    };
    this._mqMotion?.addEventListener?.("change", this._onMotion);

    this._onLost = (e) => {
      e.preventDefault();
      this.lost = true;
      this._stop();
    };
    this._onRestored = () => {
      this.lost = false;
      if (this._initGL()) {
        this.pending = this.count;
        this._resize();
        this._kick();
      }
    };
    this.canvas.addEventListener("webglcontextlost", this._onLost);
    this.canvas.addEventListener("webglcontextrestored", this._onRestored);
  }

  _locate() {
    const p = this.pointer;
    if (!this.o.interactive) {
      this._pointerGone();
      return;
    }
    const r = this.root.getBoundingClientRect();
    p.x = p.cx - r.left;
    p.y = p.cy - r.top;
    if (p.x >= 0 && p.y >= 0 && p.x <= r.width && p.y <= r.height) {
      p.inside = true;
      this._kick();
    } else this._pointerGone();
  }

  _pointerGone() {
    const p = this.pointer;
    if (p.inside) {
      p.inside = false;
      p.leftAt = this.time;
    }
  }

  _detectBackground() {
    if (!this.supported) return;
    let col = null;
    for (let el = this.root; el && !col; el = el.parentElement) {
      const c = parseColor(getComputedStyle(el).backgroundColor);
      if (c[3] > 0.5) col = c;
    }
    if (!col) {
      const scheme = getComputedStyle(document.documentElement).colorScheme || "";
      const prefersDark = !!this._mqDark?.matches;
      const dark = scheme.includes("dark") && (prefersDark || !scheme.includes("light"));
      col = dark ? [0.07, 0.07, 0.08, 1] : [1, 1, 1, 1];
    }
    const L = 0.2126 * srgbToLinear(col[0]) + 0.7152 * srgbToLinear(col[1]) + 0.0722 * srgbToLinear(col[2]);
    const dark = L < 0.18;
    if (dark !== this.bgDark) {
      this.bgDark = dark;
      this._applyMode();
    }
  }

  _applyMode() {
    const m = this.o.mode;
    const want = m === "watercolor" || m === "gouache" ? m : this.bgDark ? "gouache" : "watercolor";
    if (want === this.modeResolved) return;
    this.modeResolved = want;
    this.canvas.style.mixBlendMode = want === "watercolor" ? "multiply" : "normal";
    if (!this._raf && this.field) this._render();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Componente React
// ─────────────────────────────────────────────────────────────────────────────

const PigmentCursor = forwardRef(function PigmentCursor({ children, className, style, ...props }, ref) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const engine = new PigmentEngine(rootRef.current, canvasRef.current, propsRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setOptions(props);
  });

  useImperativeHandle(
    ref,
    () => ({
      splash: (x, y) => engineRef.current?.splash(x, y),
      clear: () => engineRef.current?.clear(),
    }),
    []
  );

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 320,
        overflow: "hidden",
        background: props.backgroundColor ?? PIGMENT_DEFAULTS.backgroundColor,
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
      {children != null && (
        <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }}>{children}</div>
      )}
    </div>
  );
});

export default PigmentCursor;
export { PigmentCursor, PigmentEngine, PIGMENT_DEFAULTS };

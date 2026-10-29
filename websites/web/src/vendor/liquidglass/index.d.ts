/* Types for the vendored liquidglass (index.js beside this file): only
   the surface LiquidGlassRoot uses. */
export interface GlassConfig {
  blurAmount: number;
  refraction: number;
  chromAberration: number;
  edgeHighlight: number;
  specular: number;
  fresnel: number;
  distortion: number;
  cornerRadius: number;
  zRadius: number;
  opacity: number;
  saturation: number;
  tintStrength: number;
  brightness: number;
  shadowOpacity: number;
  shadowSpread: number;
  shadowOffsetY: number;
  floating: boolean;
  button: boolean;
  bevelMode: number;
}

export declare class LiquidGlass {
  static init(options: {
    root: HTMLElement;
    glassElements?: NodeListOf<HTMLElement> | HTMLElement[];
    defaults?: Partial<GlassConfig>;
  }): Promise<LiquidGlass>;
  fps: number;
  destroy(): void;
  markChanged(element?: HTMLElement): void;
}

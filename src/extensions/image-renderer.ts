import type { Platform } from "./platform-config";
import type { TerminalCapabilities } from "./capability-detector";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TerminalCapabilityDetector } from "./capability-detector";
import { SixelEncoder } from "./sixel-encoder";
import { KittyEncoder } from "./kitty-encoder";
import { FallbackLinkGenerator } from "./fallback-link";

export type EncodeImageFn = (imagePath: string) => Promise<string>;
export type FallbackLinkFn = (imagePath: string) => Promise<string>;
export type DetectCapabilitiesFn = () => Promise<TerminalCapabilities>;

export interface ImageRendererOptions {
  platform?: Platform;
  maxWidth?: number;
  maxHeight?: number;
  detectCapabilities?: DetectCapabilitiesFn;
  sixelEncode?: EncodeImageFn;
  kittyEncode?: EncodeImageFn;
  fallbackLink?: FallbackLinkFn;
}

export class ImageRenderer {
  private readonly platform: Platform;
  private readonly maxWidth: number;
  private readonly maxHeight: number;
  private readonly detectCapabilities: DetectCapabilitiesFn;
  private readonly sixelEncode: EncodeImageFn;
  private readonly kittyEncode: EncodeImageFn;
  private readonly fallbackLink: FallbackLinkFn;

  constructor(options?: ImageRendererOptions) {
    this.platform = options?.platform ?? "native-linux";
    this.maxWidth = options?.maxWidth ?? 1024;
    this.maxHeight = options?.maxHeight ?? 768;

    const sixel = new SixelEncoder({ maxWidth: this.maxWidth, maxHeight: this.maxHeight });
    const kitty = new KittyEncoder({ maxWidth: this.maxWidth, maxHeight: this.maxHeight });
    const fallback = new FallbackLinkGenerator({ platform: this.platform });

    this.detectCapabilities = options?.detectCapabilities ??
      (() => new TerminalCapabilityDetector().detectWithCache());
    this.sixelEncode = options?.sixelEncode ?? ((p) => sixel.encode(p));
    this.kittyEncode = options?.kittyEncode ?? ((p) => kitty.encode(p));
    this.fallbackLink = options?.fallbackLink ?? ((p) => fallback.generate(p));
  }

  async renderImage(imagePath: string): Promise<string> {
    const caps = await this.detectCapabilities();

    if (caps.sixel) return this.sixelEncode(imagePath);
    if (caps.kitty) return this.kittyEncode(imagePath);
    return this.fallbackLink(imagePath);
  }

  getPlatform(): Platform {
    return this.platform;
  }
}

/**
 * Extension factory that wires ImageRenderer into the pi-coding-agent
 */
export function imageRendererExtension(pi: ExtensionAPI): void {
  const renderer = new ImageRenderer();

  pi.on("session_start", () => {
    // Phase 5: detect terminal capabilities and register image rendering hook
    void renderer;
  });
}

export default ImageRenderer;

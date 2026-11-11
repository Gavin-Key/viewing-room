import { LinearFilter, Texture } from 'three';

// Preserve the whole packed frame while bounding dimensions and upload area.
export function videoTextureSize(
  width: number,
  height: number,
  maxSize: number,
) {
  const scale = Math.min(
    1,
    maxSize / Math.max(width, height),
    Math.sqrt((1920 * 1080) / (width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export class PacedVideoTexture extends Texture {
  readonly isVideoTexture: boolean;
  private video: HTMLVideoElement;
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private callbackId?: number;
  private pending = true;
  private disposed = false;
  private uploadedTime = -1;
  private hasFrameCallback: boolean;

  constructor(video: HTMLVideoElement, maxSize = 2048) {
    super(video);
    this.video = video;
    this.hasFrameCallback =
      typeof video.requestVideoFrameCallback === 'function';
    this.generateMipmaps = false;
    this.minFilter = this.magFilter = LinearFilter;
    const size = videoTextureSize(video.videoWidth, video.videoHeight, maxSize);
    if (size.width < video.videoWidth || size.height < video.videoHeight) {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare VR video texture');
      this.canvas = canvas;
      this.context = context;
      this.image = canvas;
    }
    // Canvas pixels must not receive Three's video-only color conversion.
    this.isVideoTexture = !this.canvas;
    if (this.hasFrameCallback) {
      const onFrame = () => {
        if (this.disposed) return;
        this.pending = true;
        this.callbackId = video.requestVideoFrameCallback(onFrame);
      };
      this.callbackId = video.requestVideoFrameCallback(onFrame);
    }
  }

  get pendingFrame() {
    return (
      !this.disposed &&
      (this.pending ||
        (!this.hasFrameCallback &&
          this.video.readyState >= 2 &&
          this.video.currentTime !== this.uploadedTime))
    );
  }

  // Renderer visits must not bypass the shared XR upload scheduler.
  update() {}

  uploadFrame() {
    if (this.disposed || this.video.readyState < 2) return false;
    if (this.canvas && this.context) {
      this.context.drawImage(
        this.video,
        0,
        0,
        this.canvas.width,
        this.canvas.height,
      );
    }
    this.uploadedTime = this.video.currentTime;
    this.pending = false;
    this.needsUpdate = true;
    return true;
  }

  override dispose() {
    this.disposed = true;
    if (this.callbackId !== undefined) {
      this.video.cancelVideoFrameCallback(this.callbackId);
      this.callbackId = undefined;
    }
    super.dispose();
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
  }
}

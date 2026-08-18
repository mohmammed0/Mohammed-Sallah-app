export interface ImageDimensions {
  width: number;
  height: number;
  type: 'bmp' | 'gif' | 'jpg' | 'ktx' | 'png' | 'psd' | 'svg' | 'tiff' | 'webp';
}

declare function imageSize(input: Uint8Array | string): ImageDimensions;
export = imageSize;

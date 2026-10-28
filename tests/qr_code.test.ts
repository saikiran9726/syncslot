// SlotSync QR Code Generation & Scan Verification Tests
// Proves that generated QR codes round-trip and decode to the exact share URL with ?src=qr

import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { buildShareUrl } from '../src/shared/slugUtils';

describe('QR Code Generation & Scan Round-Trip', () => {
  it('generates an SVG string with error correction level M', async () => {
    const url = buildShareUrl('https://syncslot.dev', 'luxe-salon', 'qr');
    expect(url).toBe('https://syncslot.dev/b/luxe-salon?src=qr');

    const svg = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('generates a PNG data URL and decodes via jsQR to the exact original URL', async () => {
    const originalUrl = buildShareUrl('https://syncslot.dev', 'luxe-salon', 'qr');

    // 1. Generate QR matrix with error correction level M
    const qr = QRCode.create(originalUrl, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const border = 4;
    const scale = 4;
    const width = (size + border * 2) * scale;
    const height = width;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // 2. Render to RGBA bitmap
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const modX = Math.floor(x / scale) - border;
        const modY = Math.floor(y / scale) - border;
        let isDark = false;
        if (modX >= 0 && modX < size && modY >= 0 && modY < size) {
          isDark = qr.modules.get(modX, modY) !== 0;
        }
        const idx = (y * width + x) * 4;
        const val = isDark ? 0 : 255;
        rgba[idx] = val;
        rgba[idx + 1] = val;
        rgba[idx + 2] = val;
        rgba[idx + 3] = 255;
      }
    }

    // 3. Decode with jsQR
    const decoded = jsQR(rgba, width, height);

    expect(decoded).toBeTruthy();
    expect(decoded?.data).toBe(originalUrl);
    expect(decoded?.data).toContain('?src=qr');
  });
});

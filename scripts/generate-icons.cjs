#!/usr/bin/env node
/**
 * Generate macOS tray template icons and app icon for Argus.
 *
 * Strategy:
 * 1. Try python3 with PyObjC (macOS built-in) to render SVG -> PNG
 * 2. Fallback to qlmanage (macOS built-in thumbnail generator)
 * 3. Last resort: generate raw PNG with Node.js zlib
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const ASSETS_DIR = path.join(__dirname, '..', 'electron', 'assets');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-icons-'));

// --- SVG definitions ---

const svg16 = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <path d="M8 4C4.5 4 1.5 7 1 8c.5 1 3.5 4 7 4s6.5-3 7-4c-.5-1-3.5-4-7-4z" fill="none" stroke="#000" stroke-width="1.2"/>
  <circle cx="8" cy="8" r="2" fill="#000"/>
</svg>`;

const svg32 = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M16 8C9 8 3 14.5 2 16c1 1.5 7 8 14 8s13-6.5 14-8c-1-1.5-7-8-14-8z" fill="none" stroke="#000" stroke-width="2"/>
  <circle cx="16" cy="16" r="4" fill="#000"/>
</svg>`;

const svg256 = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#0d0d1a"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="48" fill="url(#bg)"/>
  <path d="M128 80C80 80 40 120 32 128c8 8 48 48 96 48s88-40 96-48c-8-8-48-48-96-48z" fill="none" stroke="#00d4a0" stroke-width="8" stroke-linecap="round"/>
  <circle cx="128" cy="128" r="20" fill="#00d4a0"/>
  <circle cx="128" cy="128" r="8" fill="#1a1a2e"/>
</svg>`;

// --- Python script that uses CoreGraphics (PyObjC, built-in on macOS) ---

const pythonScript = `
import sys
import os

def svg_to_png(svg_path, png_path, width, height):
    """Convert SVG to PNG using macOS CoreGraphics via PyObjC (built-in)."""
    try:
        import Cocoa

        with open(svg_path, 'rb') as f:
            svg_data = f.read()

        ns_data = Cocoa.NSData.dataWithBytes_length_(svg_data, len(svg_data))
        image = Cocoa.NSImage.alloc().initWithData_(ns_data)
        if image is None:
            raise Exception("NSImage could not parse SVG")

        image.setSize_(Cocoa.NSMakeSize(width, height))

        bitmap = Cocoa.NSBitmapImageRep.alloc().initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel_(
            None, width, height, 8, 4, True, False,
            Cocoa.NSCalibratedRGBColorSpace, 0, 0
        )
        bitmap.setSize_(Cocoa.NSMakeSize(width, height))

        Cocoa.NSGraphicsContext.saveGraphicsState()
        ctx = Cocoa.NSGraphicsContext.graphicsContextWithBitmapImageRep_(bitmap)
        Cocoa.NSGraphicsContext.setCurrentContext_(ctx)
        image.drawInRect_fromRect_operation_fraction_(
            Cocoa.NSMakeRect(0, 0, width, height),
            Cocoa.NSZeroRect,
            Cocoa.NSCompositingOperationSourceOver,
            1.0
        )
        Cocoa.NSGraphicsContext.restoreGraphicsState()

        png_data = bitmap.representationUsingType_properties_(
            Cocoa.NSBitmapImageFileTypePNG, {}
        )
        png_data.writeToFile_atomically_(png_path, True)
        print(f"OK: {png_path} ({width}x{height})")
        return True

    except Exception as e:
        print(f"CoreGraphics failed: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    tasks = sys.argv[1:]
    i = 0
    success = True
    while i < len(tasks):
        svg_path = tasks[i]
        png_path = tasks[i+1]
        size = int(tasks[i+2])
        if not svg_to_png(svg_path, png_path, size, size):
            success = False
        i += 3
    sys.exit(0 if success else 1)
`;

// --- Raw PNG generation fallback ---

function generateRawEyePNG(outputPath, w, h, isAppIcon) {
  const pixels = Buffer.alloc(w * h * 4, 0);

  if (isAppIcon) {
    const rx = 48 * (w / 256);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isInRoundedRect(x, y, w, h, rx)) {
          const idx = (y * w + x) * 4;
          const t = (x + y) / (w + h);
          pixels[idx] = Math.round(26 * (1 - t) + 13 * t);
          pixels[idx + 1] = Math.round(26 * (1 - t) + 13 * t);
          pixels[idx + 2] = Math.round(46 * (1 - t) + 26 * t);
          pixels[idx + 3] = 255;
        }
      }
    }
    drawEye(pixels, w, h, 0x00, 0xd4, 0xa0, w / 256);
    drawCircle(pixels, w, h, w / 2, h / 2, 8 * (w / 256), 0x1a, 0x1a, 0x2e);
  } else {
    drawEye(pixels, w, h, 0x00, 0x00, 0x00, w / 16);
  }

  const pngData = createPNG(pixels, w, h);
  fs.writeFileSync(outputPath, pngData);
  console.log(`OK (raw): ${outputPath} (${w}x${h})`);
}

function isInRoundedRect(x, y, w, h, r) {
  if (x >= r && x < w - r) return true;
  if (y >= r && y < h - r) return true;
  const corners = [[r, r], [w - r - 1, r], [r, h - r - 1], [w - r - 1, h - r - 1]];
  for (const [cx, cy] of corners) {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

function drawEye(pixels, w, h, cr, cg, cb, scale) {
  const cx = w / 2;
  const cy = h / 2;
  const strokeW = Math.max(1, 1.2 * scale);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const nx = (x - cx) / (w * 0.4);
      if (Math.abs(nx) <= 1) {
        const eyeHeight = w * 0.25 * Math.sqrt(Math.max(0, 1 - nx * nx));
        const eyeTop = cy - eyeHeight;
        const eyeBot = cy + eyeHeight;
        const distTop = Math.abs(y - eyeTop);
        const distBot = Math.abs(y - eyeBot);
        const minDist = Math.min(distTop, distBot);

        if (minDist < strokeW) {
          const alpha = Math.min(255, Math.round(255 * Math.max(0, 1 - minDist / strokeW)));
          const idx = (y * w + x) * 4;
          blendPixel(pixels, idx, cr, cg, cb, alpha);
        }
      }

      const pupilR = w * 0.125;
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (dist < pupilR) {
        const idx = (y * w + x) * 4;
        blendPixel(pixels, idx, cr, cg, cb, 255);
      }
    }
  }
}

function drawCircle(pixels, w, h, cx, cy, r, cr, cg, cb) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (dist < r) {
        const idx = (y * w + x) * 4;
        pixels[idx] = cr;
        pixels[idx + 1] = cg;
        pixels[idx + 2] = cb;
        pixels[idx + 3] = 255;
      }
    }
  }
}

function blendPixel(pixels, idx, r, g, b, a) {
  const existingA = pixels[idx + 3];
  if (existingA === 0) {
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = a;
  } else {
    const outA = a + existingA * (255 - a) / 255;
    if (outA > 0) {
      pixels[idx] = Math.round((r * a + pixels[idx] * existingA * (255 - a) / 255) / outA);
      pixels[idx + 1] = Math.round((g * a + pixels[idx + 1] * existingA * (255 - a) / 255) / outA);
      pixels[idx + 2] = Math.round((b * a + pixels[idx + 2] * existingA * (255 - a) / 255) / outA);
      pixels[idx + 3] = Math.round(outA);
    }
  }
}

function createPNG(pixels, w, h) {
  const rawData = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowOffset = y * (1 + w * 4);
    rawData[rowOffset] = 0;
    pixels.copy(rawData, rowOffset + 1, y * w * 4, (y + 1) * w * 4);
  }

  const compressed = zlib.deflateSync(rawData);
  const chunks = [];

  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(pngChunk('IHDR', ihdr));
  chunks.push(pngChunk('IDAT', compressed));
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// --- qlmanage fallback ---

function generateWithQlmanage(svgPath, pngPath, size) {
  const tmpOut = path.join(TMP_DIR, 'ql_output');
  fs.mkdirSync(tmpOut, { recursive: true });
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', tmpOut, svgPath],
    { timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });

  const baseName = path.basename(svgPath);
  const outputFile = path.join(tmpOut, `${baseName}.png`);
  if (fs.existsSync(outputFile)) {
    fs.copyFileSync(outputFile, pngPath);
    console.log(`OK (qlmanage): ${pngPath} (${size}x${size})`);
  } else {
    throw new Error(`qlmanage did not produce ${outputFile}`);
  }
}

// --- Main ---

function main() {
  console.log('Generating Argus icons...');
  console.log(`Temp dir: ${TMP_DIR}`);
  console.log(`Assets dir: ${ASSETS_DIR}`);

  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  const svg16Path = path.join(TMP_DIR, 'icon16.svg');
  const svg32Path = path.join(TMP_DIR, 'icon32.svg');
  const svg256Path = path.join(TMP_DIR, 'icon256.svg');

  fs.writeFileSync(svg16Path, svg16);
  fs.writeFileSync(svg32Path, svg32);
  fs.writeFileSync(svg256Path, svg256);

  const pyPath = path.join(TMP_DIR, 'svg2png.py');
  fs.writeFileSync(pyPath, pythonScript);

  const png16 = path.join(ASSETS_DIR, 'iconTemplate.png');
  const png32 = path.join(ASSETS_DIR, 'iconTemplate@2x.png');
  const png256 = path.join(ASSETS_DIR, 'icon.png');

  let generated = false;

  // Strategy 1: Python with PyObjC/CoreGraphics
  if (!generated) {
    try {
      const result = execFileSync('python3', [
        pyPath, svg16Path, png16, '16', svg32Path, png32, '32', svg256Path, png256, '256'
      ], { encoding: 'utf-8', timeout: 30000 });
      console.log(result);
      generated = true;
    } catch (err) {
      console.error('Python CoreGraphics failed, trying qlmanage...');
      console.error(err.stderr || err.message);
    }
  }

  // Strategy 2: qlmanage
  if (!generated) {
    try {
      generateWithQlmanage(svg16Path, png16, 16);
      generateWithQlmanage(svg32Path, png32, 32);
      generateWithQlmanage(svg256Path, png256, 256);
      generated = true;
    } catch (err) {
      console.error('qlmanage failed, using raw PNG generation...');
      console.error(err.message);
    }
  }

  // Strategy 3: Raw PNG with Node.js
  if (!generated) {
    generateRawEyePNG(png16, 16, 16, false);
    generateRawEyePNG(png32, 32, 32, false);
    generateRawEyePNG(png256, 256, 256, true);
  }

  // Verify output
  const files = ['iconTemplate.png', 'iconTemplate@2x.png', 'icon.png'];
  console.log('\nGenerated files:');
  for (const f of files) {
    const fp = path.join(ASSETS_DIR, f);
    if (fs.existsSync(fp)) {
      const stat = fs.statSync(fp);
      console.log(`  ${f}: ${stat.size} bytes`);
    } else {
      console.error(`  ${f}: MISSING!`);
    }
  }
}

main();

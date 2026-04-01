import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const OUT_DIR = path.join(process.cwd(), 'public/defaults/logos');

async function generateLogo(name: string, emoji: string, bgColor: string) {
  const svg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="64" fill="${bgColor}"/>
      <text x="256" y="300" font-size="256" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    </svg>`;

  const buffer = Buffer.from(svg);
  await sharp(buffer).resize(512, 512).png().toFile(path.join(OUT_DIR, `${name}.png`));
}

async function generateLogoText(name: string, initials: string, bgColor: string, textColor = '#ffffff') {
  const svg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" rx="64" fill="${bgColor}"/>
      <text x="256" y="256" font-size="180" font-weight="bold" font-family="Arial, sans-serif"
            text-anchor="middle" dominant-baseline="central" fill="${textColor}">${initials}</text>
    </svg>`;

  const buffer = Buffer.from(svg);
  await sharp(buffer).resize(512, 512).png().toFile(path.join(OUT_DIR, `${name}.png`));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Try emoji first, fall back to text initials if rendering fails
  try {
    await generateLogo('fieldmapper', '📍', '#2563eb');
    console.log('Generated fieldmapper with emoji');
  } catch {
    console.log('Emoji failed, falling back to text initials for fieldmapper');
    await generateLogoText('fieldmapper', 'FM', '#2563eb');
  }

  try {
    await generateLogo('birdhouse', '🏠', '#5D7F3A');
    console.log('Generated birdhouse with emoji');
  } catch {
    console.log('Emoji failed, falling back to text initials for birdhouse');
    await generateLogoText('birdhouse', 'BH', '#5D7F3A');
  }

  try {
    await generateLogo('binoculars', '🔭', '#8B5E3C');
    console.log('Generated binoculars with emoji');
  } catch {
    console.log('Emoji failed, falling back to text initials for binoculars');
    await generateLogoText('binoculars', 'BN', '#8B5E3C');
  }

  try {
    await generateLogo('leaf', '🌿', '#2d5a27');
    console.log('Generated leaf with emoji');
  } catch {
    console.log('Emoji failed, falling back to text initials for leaf');
    await generateLogoText('leaf', 'LF', '#2d5a27');
  }

  // Generate PWA icon variants from fieldmapper (default)
  const source = path.join(OUT_DIR, 'fieldmapper.png');
  await sharp(source).resize(192, 192).toFile(path.join(OUT_DIR, 'icon-192.png'));
  await sharp(source).resize(512, 512).toFile(path.join(OUT_DIR, 'icon-512.png'));

  // Maskable: add 20% padding (safe zone)
  const maskableSize = Math.floor(512 * 0.8);
  const padding = Math.floor((512 - maskableSize) / 2);
  await sharp(source)
    .resize(maskableSize, maskableSize)
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: '#2563eb' })
    .toFile(path.join(OUT_DIR, 'icon-512-maskable.png'));

  await sharp(source).resize(32, 32).toFile(path.join(OUT_DIR, 'favicon-32.png'));

  console.log('Default logos generated in', OUT_DIR);
}

main();

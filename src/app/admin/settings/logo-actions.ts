'use server';

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export async function uploadLogo(
  formData: FormData,
  scope: 'org' | 'property',
  propertyId?: string,
): Promise<{ success?: boolean; basePath?: string; error?: string }> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const file = formData.get('logo') as File | null;
  if (!file) return { error: 'No file provided' };

  if (!file.type.startsWith('image/')) {
    return { error: 'File must be an image' };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { error: 'Image must be under 5MB' };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const basePath = scope === 'property' && propertyId
    ? `${tenant.orgId}/${propertyId}`
    : `${tenant.orgId}`;

  // Generate variants
  const variants: { name: string; buffer: Buffer }[] = [];

  // Solid white background applied to every square variant so non-square
  // logos render letterboxed (not cropped) and platform masks (Android
  // adaptive icons, iOS rounded-rect) don't expose colored padding.
  const white = { r: 255, g: 255, b: 255, alpha: 1 } as const;

  // Original (max 1024px, preserve aspect ratio, no background fill)
  const original = await sharp(buffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  variants.push({ name: 'original.png', buffer: original });

  // PWA icons (square, contain on white so non-square logos aren't cropped)
  const icon192 = await sharp(buffer)
    .resize(192, 192, { fit: 'contain', background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'icon-192.png', buffer: icon192 });

  const icon512 = await sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'icon-512.png', buffer: icon512 });

  // Maskable icon: 80% inner safe zone, 10% padding on each side, white fill
  const maskableInner = Math.floor(512 * 0.8);
  const padding = Math.floor((512 - maskableInner) / 2);
  const maskable = await sharp(buffer)
    .resize(maskableInner, maskableInner, { fit: 'contain', background: white })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'icon-512-maskable.png', buffer: maskable });

  // Apple touch icon (180x180 retina, white background — iOS does not honor
  // PNG transparency on home-screen icons)
  const appleTouch = await sharp(buffer)
    .resize(180, 180, { fit: 'contain', background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'apple-touch-icon-180.png', buffer: appleTouch });

  // Favicon (32x32). Letterboxing wide wordmark logos with white gutters at
  // this tiny size is intentional — preserves the full logo at the cost of
  // shrinking it. The alternative (fit: 'cover') would crop wide logos to
  // an unreadable center slice.
  const favicon = await sharp(buffer)
    .resize(32, 32, { fit: 'contain', background: white })
    .png()
    .toBuffer();
  variants.push({ name: 'favicon-32.png', buffer: favicon });

  // Upload all variants to vault-public bucket
  for (const variant of variants) {
    const { error } = await supabase.storage
      .from('vault-public')
      .upload(`${basePath}/${variant.name}`, variant.buffer, {
        contentType: 'image/png',
        upsert: true,
      });
    if (error) {
      return { error: `Failed to upload ${variant.name}: ${error.message}` };
    }
  }

  // Save base path to org or property
  if (scope === 'property' && propertyId) {
    const { error } = await supabase
      .from('properties')
      .update({ logo_url: basePath })
      .eq('id', propertyId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('orgs')
      .update({ logo_url: basePath })
      .eq('id', tenant.orgId);
    if (error) return { error: error.message };
  }

  return { success: true, basePath };
}

export async function uploadDefaultLogo(
  defaultName: string,
  scope: 'org' | 'property',
  propertyId?: string,
): Promise<{ success?: boolean; basePath?: string; error?: string }> {
  try {
    // Read the default logo from the filesystem (works in both dev and production)
    const filePath = path.join(process.cwd(), 'public', 'defaults', 'logos', `${defaultName}.png`);
    const buffer = await fs.readFile(filePath);

    const formData = new FormData();
    formData.set('logo', new Blob([buffer], { type: 'image/png' }), `${defaultName}.png`);

    return uploadLogo(formData, scope, propertyId);
  } catch {
    return { error: 'Default logo not found' };
  }
}

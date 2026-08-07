// Serves the Instagram images we've copied into blob storage.
//
// A post's image never changes, and the key is the post ID, so these can be
// cached hard at the edge — in practice this runs once per image per deploy.

import { readCachedImage } from '../lib/instagram.js';

export default async (req, context) => {
  const id = context?.params?.id || new URL(req.url).pathname.split('/').filter(Boolean).pop();
  const image = await readCachedImage(id);

  if (!image) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response(image.body, {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};

export const config = {
  path: '/instagram-media/:id',
};

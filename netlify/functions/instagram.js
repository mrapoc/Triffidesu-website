// Serves our recent Instagram posts to the homepage as JSON.
//
// Normally this just hands back the copy that netlify/functions/instagram-sync.js
// wrote overnight, so Instagram isn't involved in a page view at all. The live
// call is only a stopgap for the window between deploying and the first sync.

import { readCachedPosts, fetchRecentPosts, postLimit } from '../lib/instagram.js';

const CACHE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=1800, stale-while-revalidate=86400',
};

export default async () => {
  const cached = await readCachedPosts();

  if (cached) {
    return new Response(JSON.stringify({ posts: cached.posts, syncedAt: cached.syncedAt, source: 'cache' }), {
      status: 200,
      headers: CACHE_HEADERS,
    });
  }

  try {
    // No sync has landed yet — go straight to Instagram. Images still point at
    // Instagram's CDN until the first sync copies them across.
    const posts = await fetchRecentPosts(postLimit());

    return new Response(JSON.stringify({ posts, syncedAt: new Date().toISOString(), source: 'live' }), {
      status: 200,
      headers: CACHE_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ posts: [], error: error.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }
};

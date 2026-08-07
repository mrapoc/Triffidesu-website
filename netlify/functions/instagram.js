// Netlify serverless function that serves our recent Instagram posts as JSON.
// The access token stays server-side, and the response is cached so a burst of
// visitors doesn't hammer the Instagram API.

import { fetchRecentPosts } from '../lib/instagram.js';

export default async () => {
  try {
    const posts = await fetchRecentPosts(12);

    return new Response(JSON.stringify({ posts, fetchedAt: new Date().toISOString() }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        // New posts show up within half an hour; the stale window keeps the feed
        // on screen even if Instagram is having a moment.
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=86400',
      },
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

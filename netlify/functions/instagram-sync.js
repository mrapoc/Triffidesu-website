// Nightly copy of our Instagram posts and images into Netlify Blobs.
//
// This is the only thing that talks to Instagram on a schedule. It also refreshes
// the access token, which Meta doesn't do on its own — an lapsed token is the
// usual reason a feed like this quietly stops updating.
//
// If Instagram is unreachable the sync throws without touching the stored copy,
// so the site carries on showing the last good set of posts.

import { syncPosts } from '../lib/instagram.js';

export default async () => {
  try {
    const posts = await syncPosts();

    console.log(`Instagram sync: stored ${posts.length} posts.`);
    return new Response('synced', { status: 200 });
  } catch (error) {
    console.error(`Instagram sync failed, keeping the previous copy: ${error.message}`);
    return new Response(`failed: ${error.message}`, { status: 500 });
  }
};

export const config = {
  // Hourly. A routine run is one API call and a manifest write — images already
  // copied are recognised from the previous manifest and never re-fetched — so
  // the cost of checking often is close to nothing, and a Monday evening post is
  // on the site the same evening.
  schedule: '0 * * * *',
};

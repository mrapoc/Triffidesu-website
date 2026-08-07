// Scheduled top-up for the Instagram access token.
//
// The feed function already refreshes the token as it goes, but that only helps
// while people are visiting the site. This runs every Monday so the token stays
// alive through quiet spells too — an Instagram token that lapses is the usual
// reason a feed like this stops updating.

import { refreshAccessToken } from '../lib/instagram.js';

export default async () => {
  try {
    const expiresAt = await refreshAccessToken({ force: true });

    if (!expiresAt) {
      console.log('Instagram token refresh skipped (no blob store available).');
      return new Response('skipped', { status: 200 });
    }

    console.log(`Instagram token refreshed, now valid until ${expiresAt}.`);
    return new Response('refreshed', { status: 200 });
  } catch (error) {
    console.error(`Instagram token refresh failed: ${error.message}`);
    return new Response(`failed: ${error.message}`, { status: 500 });
  }
};

export const config = {
  schedule: '0 4 * * 1',
};

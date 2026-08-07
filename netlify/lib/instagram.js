// Instagram Graph API access, plus the daily copy of posts and images into
// Netlify Blobs that keeps the site going when the API isn't there.
//
// Setup lives in docs/instagram-feed.md. The short version: INSTAGRAM_ACCESS_TOKEN
// holds a long-lived Instagram token. Meta doesn't refresh those on its own and
// they lapse after 60 days, so the scheduled sync refreshes it as it goes.
//
// Nothing here is on the critical path for a page view — the homepage reads the
// blob copy, so a bad day at Instagram shows yesterday's posts rather than none.

import { getStore } from '@netlify/blobs';

const GRAPH_HOST = 'https://graph.instagram.com';
const GRAPH_VERSION = 'v23.0';

const DATA_STORE = 'social';
const TOKEN_KEY = 'instagram-token';
const POSTS_KEY = 'instagram-posts';

const MEDIA_STORE = 'instagram-media';
// Public URL prefix for copied images, served by netlify/functions/instagram-media.js.
const MEDIA_PATH = '/instagram-media/';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Refresh once the live token is a week old. Tokens last 60 days from each
// refresh, so a daily sync leaves an enormous margin.
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
// Instagram refuses to refresh a token that is less than 24 hours old.
const MIN_TOKEN_AGE_MS = 25 * 60 * 60 * 1000;
const DEFAULT_TOKEN_LIFETIME_S = 60 * 24 * 60 * 60;

const MEDIA_FIELDS = [
  'id',
  'caption',
  'media_type',
  'media_url',
  'thumbnail_url',
  'permalink',
  'timestamp',
  'children{media_type,media_url,thumbnail_url}',
].join(',');

// Blobs are only available when running on Netlify. Everywhere else we fall back
// to the environment variable and live API calls, which still work — they just
// can't self-refresh or cache.
function getBlobStore(name, options) {
  try {
    return getStore({ name, ...options });
  } catch (error) {
    return null;
  }
}

// Strong consistency for the token: reading a stale one after a refresh would
// mean using a token we've already replaced.
const getDataStore = () => getBlobStore(DATA_STORE, { consistency: 'strong' });
// Images are immutable once written, so eventual consistency is fine and quicker.
const getMediaStore = () => getBlobStore(MEDIA_STORE);

async function readStoredToken(store) {
  if (!store) return null;
  try {
    const stored = await store.get(TOKEN_KEY, { type: 'json' });
    if (!stored || !stored.token) return null;
    if (stored.expiresAt && Date.parse(stored.expiresAt) <= Date.now()) return null;
    return stored;
  } catch (error) {
    return null;
  }
}

// Prefers the refreshed token we've stored, falling back to the one in the
// environment (which is what's in play on the very first run after setup).
async function getActiveToken() {
  const store = getDataStore();
  const stored = await readStoredToken(store);

  if (stored) {
    return { token: stored.token, refreshedAt: stored.refreshedAt || null, store };
  }

  return { token: process.env.INSTAGRAM_ACCESS_TOKEN || '', refreshedAt: null, store };
}

function isRefreshDue(refreshedAt) {
  if (!refreshedAt) return true;
  const age = Date.now() - Date.parse(refreshedAt);
  if (Number.isNaN(age)) return true;
  if (age < MIN_TOKEN_AGE_MS) return false;
  return age >= REFRESH_AFTER_MS;
}

// Exchanges the current token for a fresh 60-day one and stores it. Returns the
// new expiry, or null when there was nothing to do.
export async function refreshAccessToken({ force = false } = {}) {
  const { token, refreshedAt, store } = await getActiveToken();

  if (!token) throw new Error('INSTAGRAM_ACCESS_TOKEN is not set');
  // Without somewhere to persist the result, refreshing would just throw the new
  // token away and burn the old one's refresh window.
  if (!store) return null;
  if (!force && !isRefreshDue(refreshedAt)) return null;

  const url = new URL(`${GRAPH_HOST}/refresh_access_token`);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', token);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(data?.error?.message || `Token refresh failed (${response.status})`);
  }

  const now = Date.now();
  const record = {
    token: data.access_token,
    refreshedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (data.expires_in || DEFAULT_TOKEN_LIFETIME_S) * 1000).toISOString(),
  };

  await store.setJSON(TOKEN_KEY, record);
  return record.expiresAt;
}

function pickImage(post) {
  if (post.media_type === 'CAROUSEL_ALBUM') {
    // Album parents don't carry their own media_url — use the first child.
    const children = (post.children && post.children.data) || [];
    const child = children.find((c) => c.media_url || c.thumbnail_url);
    if (child) {
      return child.media_type === 'VIDEO'
        ? child.thumbnail_url || child.media_url || ''
        : child.media_url || child.thumbnail_url || '';
    }
  }

  if (post.media_type === 'VIDEO') {
    return post.thumbnail_url || post.media_url || '';
  }

  return post.media_url || post.thumbnail_url || '';
}

function normalisePost(post) {
  const image = pickImage(post);
  const caption = (post.caption || '').trim();

  // Nothing to show without at least a picture or some words.
  if (!image && !caption) return null;

  return {
    id: post.id,
    caption,
    image,
    permalink: post.permalink || 'https://www.instagram.com/triffidesu/',
    timestamp: post.timestamp || '',
    mediaType: post.media_type || 'IMAGE',
  };
}

// Live call to Instagram. Images still point at Instagram's CDN at this stage.
export async function fetchRecentPosts(limit = 12) {
  const active = await getActiveToken();
  if (!active.token) throw new Error('INSTAGRAM_ACCESS_TOKEN is not set');

  const userId = process.env.INSTAGRAM_USER_ID || 'me';
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${userId}/media`);
  url.searchParams.set('fields', MEDIA_FIELDS);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', active.token);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `Instagram API returned ${response.status}`);
  }

  return (data.data || []).map(normalisePost).filter(Boolean);
}

// Copies one post's image into blob storage and returns the URL to serve it
// from. Instagram's own image URLs are signed and expire, so hot-linking them is
// only ever a stopgap — if the copy fails we do exactly that for this one post.
async function cacheImage(media, post) {
  if (!media || !post.image) return post.image;

  try {
    // Already copied on an earlier run — post images never change.
    if (await media.getMetadata(post.id)) return MEDIA_PATH + post.id;
  } catch (error) {
    // Fall through and re-download.
  }

  try {
    const response = await fetch(post.image);
    if (!response.ok) return post.image;

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return post.image;

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return post.image;

    await media.set(post.id, bytes, { metadata: { contentType } });
    return MEDIA_PATH + post.id;
  } catch (error) {
    return post.image;
  }
}

// Drops images for posts that have scrolled out of the window we display.
async function pruneMedia(media, keepIds) {
  // An empty keep-list would wipe everything — only ever prune against a real sync.
  if (!media || !keepIds.length) return;

  try {
    const keep = new Set(keepIds);
    const { blobs } = await media.list();
    await Promise.all(
      blobs.filter((blob) => !keep.has(blob.key)).map((blob) => media.delete(blob.key)),
    );
  } catch (error) {
    // Tidying is optional; a failure here shouldn't fail the sync.
  }
}

// The daily job: pull the latest posts, copy anything new into blob storage and
// write the manifest the site reads. Throws without touching the stored copy if
// Instagram is unreachable, so the site keeps serving the last good sync.
export async function syncPosts(limit = 12) {
  const posts = await fetchRecentPosts(limit);
  if (!posts.length) throw new Error('Instagram returned no posts');

  const media = getMediaStore();
  const store = getDataStore();

  const synced = [];
  for (const post of posts) {
    synced.push({ ...post, image: await cacheImage(media, post) });
  }

  if (store) {
    await store.setJSON(POSTS_KEY, { syncedAt: new Date().toISOString(), posts: synced });
  }

  await pruneMedia(media, synced.map((post) => post.id));
  // Piggyback the token top-up on a run we know worked.
  await refreshAccessToken().catch(() => {});

  return synced;
}

export async function readCachedPosts() {
  const store = getDataStore();
  if (!store) return null;

  try {
    const cached = await store.get(POSTS_KEY, { type: 'json' });
    if (!cached || !Array.isArray(cached.posts) || !cached.posts.length) return null;
    return cached;
  } catch (error) {
    return null;
  }
}

export async function readCachedImage(id) {
  const media = getMediaStore();
  if (!media || !id) return null;

  try {
    const result = await media.getWithMetadata(id, { type: 'arrayBuffer' });
    if (!result) return null;
    return {
      body: result.data,
      contentType: (result.metadata && result.metadata.contentType) || 'image/jpeg',
    };
  } catch (error) {
    return null;
  }
}

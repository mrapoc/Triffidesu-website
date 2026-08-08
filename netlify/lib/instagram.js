// Instagram Graph API access, plus the daily copy of posts and images into
// Netlify Blobs that keeps the site going when the API isn't there.
//
// Setup lives in docs/instagram-feed.md. The short version: INSTAGRAM_ACCESS_TOKEN
// holds a Meta token — ideally a Business system user one, which never expires.
//
// Nothing here is on the critical path for a page view — the homepage reads the
// blob copy, so a bad day at Instagram shows yesterday's posts rather than none.

import { getStore } from '@netlify/blobs';

// Two ways in, and the token itself tells us which one is in play:
//
//   Business system user / Page token ("EAA…") — graph.facebook.com, never
//     expires. This is the setup we want, and it needs no refreshing at all.
//   Instagram Login token ("IG…")             — graph.instagram.com, lasts 60
//     days and has to be refreshed on a schedule.
//
// Either works; the system user one is just less to go wrong.
const IG_HOST = 'https://graph.instagram.com';
const FB_HOST = 'https://graph.facebook.com';
const GRAPH_VERSION = 'v23.0';

const DATA_STORE = 'social';
const TOKEN_KEY = 'instagram-token';
const POSTS_KEY = 'instagram-posts';
const USER_ID_KEY = 'instagram-user-id';

const MEDIA_STORE = 'instagram-media';
// Public URL prefix for copied images, served by netlify/functions/instagram-media.js.
const MEDIA_PATH = '/instagram-media/';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Instagram's own ceiling for a carousel.
const MAX_CAROUSEL_IMAGES = 10;

// How many posts to keep. Raise INSTAGRAM_POST_LIMIT in Netlify to hold more
// history; the homepage decides separately how many of them to show at once.
const DEFAULT_POST_LIMIT = 12;
const MAX_POST_LIMIT = 50;

export function postLimit() {
  const configured = parseInt(process.env.INSTAGRAM_POST_LIMIT || '', 10);
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_POST_LIMIT;
  return Math.min(configured, MAX_POST_LIMIT);
}

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

// Instagram Login issues tokens prefixed "IG"; Facebook Login and Business
// system users issue "EAA…" ones. They talk to different hosts, and only the
// Instagram ones expire.
function isInstagramLoginToken(token) {
  return typeof token === 'string' && token.startsWith('IG');
}

const PAGE_FIELDS = 'name,instagram_business_account{id,username}';

function readLink(page) {
  if (!page?.instagram_business_account?.id) return null;
  return {
    id: page.instagram_business_account.id,
    username: page.instagram_business_account.username || '',
    page: page.name || '',
  };
}

// Finds the Instagram account behind whichever Facebook token we've been given.
// A Page token *is* the Page, so it carries the link directly; user and system
// user tokens see a list of Pages instead, so we look for one with Instagram
// attached. Trying the cheap single-Page call first covers both.
async function discoverLink(token) {
  for (const [path, pick] of [
    ['me', (data) => readLink(data)],
    ['me/accounts', (data) => (data.data || []).map(readLink).find(Boolean)],
  ]) {
    try {
      const url = new URL(`${FB_HOST}/${GRAPH_VERSION}/${path}`);
      url.searchParams.set('fields', PAGE_FIELDS);
      url.searchParams.set('access_token', token);

      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) continue;

      const link = pick(data);
      if (link) return link;
    } catch (error) {
      // Try the next shape.
    }
  }

  throw new Error(
    'No Instagram Business account is linked to a Page this token can see. Check the ' +
      'Instagram account is linked to the Facebook Page, and that the token was granted ' +
      'the instagram_basic and pages_show_list permissions.',
  );
}

// Which Instagram account to read, worked out once and remembered.
async function resolveUserId(token, store) {
  if (process.env.INSTAGRAM_USER_ID) return process.env.INSTAGRAM_USER_ID;
  // An Instagram Login token is already scoped to a single account.
  if (isInstagramLoginToken(token)) return 'me';

  if (store) {
    try {
      const cached = await store.get(USER_ID_KEY, { type: 'json' });
      if (cached && cached.id) return cached.id;
    } catch (error) {
      // Fall through and look it up again.
    }
  }

  const link = await discoverLink(token);

  if (store) {
    try {
      await store.setJSON(USER_ID_KEY, link);
    } catch (error) {
      // Caching the lookup is a nicety, not a requirement.
    }
  }

  return link.id;
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
  // Business system user and Page tokens don't expire — nothing to do.
  if (!isInstagramLoginToken(token)) return null;
  // Without somewhere to persist the result, refreshing would just throw the new
  // token away and burn the old one's refresh window.
  if (!store) return null;
  if (!force && !isRefreshDue(refreshedAt)) return null;

  const url = new URL(`${IG_HOST}/refresh_access_token`);
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

// A still image for one item, whatever kind it is. Videos and reels only ever
// give us a poster frame — playback stays on Instagram.
function stillFor(item) {
  return item.media_type === 'VIDEO'
    ? item.thumbnail_url || item.media_url || ''
    : item.media_url || item.thumbnail_url || '';
}

// Every image belonging to a post, in the order they appear on Instagram. A
// carousel gives one per slide; everything else gives exactly one.
function pickImages(post) {
  if (post.media_type === 'CAROUSEL_ALBUM') {
    // Album parents carry no media of their own — it all hangs off the children.
    const children = (post.children && post.children.data) || [];
    return children.map(stillFor).filter(Boolean).slice(0, MAX_CAROUSEL_IMAGES);
  }

  const still = stillFor(post);
  return still ? [still] : [];
}

function normalisePost(post) {
  const images = pickImages(post);
  const caption = (post.caption || '').trim();

  // Nothing to show without at least a picture or some words.
  if (!images.length && !caption) return null;

  return {
    id: post.id,
    caption,
    // `image` is the one the grid shows; `images` is every slide, for the
    // gallery on the featured card.
    image: images[0] || '',
    images,
    permalink: post.permalink || 'https://www.instagram.com/triffidesu/',
    timestamp: post.timestamp || '',
    mediaType: post.media_type || 'IMAGE',
  };
}

// Live call to Instagram. Images still point at Instagram's CDN at this stage.
export async function fetchRecentPosts(limit = 12) {
  const active = await getActiveToken();
  if (!active.token) throw new Error('INSTAGRAM_ACCESS_TOKEN is not set');

  const userId = await resolveUserId(active.token, active.store);
  const host = isInstagramLoginToken(active.token) ? IG_HOST : FB_HOST;

  const url = new URL(`${host}/${GRAPH_VERSION}/${userId}/media`);
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

// One blob per image: "<post id>-<slide number>".
const blobKey = (postId, index) => `${postId}-${index}`;

// Copies one image into blob storage and returns the URL to serve it from.
// Instagram's own URLs are signed and expire, so hot-linking them is only ever a
// stopgap — if the copy fails we do exactly that for this one image.
async function cacheImage(media, key, remoteUrl) {
  if (!media || !remoteUrl) return remoteUrl;

  try {
    // Already copied on an earlier run — a post's images never change.
    if (await media.getMetadata(key)) return MEDIA_PATH + key;
  } catch (error) {
    // Fall through and re-download.
  }

  try {
    const response = await fetch(remoteUrl);
    if (!response.ok) return remoteUrl;

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return remoteUrl;

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return remoteUrl;

    await media.set(key, bytes, { metadata: { contentType } });
    return MEDIA_PATH + key;
  } catch (error) {
    return remoteUrl;
  }
}

// Copies every slide of a post, in order.
async function cacheImages(media, post) {
  const copied = [];
  for (const [index, remoteUrl] of post.images.entries()) {
    copied.push(await cacheImage(media, blobKey(post.id, index), remoteUrl));
  }
  return copied;
}

// Drops images for posts that have scrolled out of the window we display.
async function pruneMedia(media, keepKeys) {
  // An empty keep-list would wipe everything — only ever prune against a real sync.
  if (!media || !keepKeys.length) return;

  try {
    const keep = new Set(keepKeys);
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
export async function syncPosts(limit = postLimit()) {
  const posts = await fetchRecentPosts(limit);
  if (!posts.length) throw new Error('Instagram returned no posts');

  const media = getMediaStore();
  const store = getDataStore();

  const synced = [];
  const keepKeys = [];

  for (const post of posts) {
    const images = await cacheImages(media, post);
    synced.push({ ...post, image: images[0] || '', images });
    post.images.forEach((_, index) => keepKeys.push(blobKey(post.id, index)));
  }

  if (store) {
    await store.setJSON(POSTS_KEY, { syncedAt: new Date().toISOString(), posts: synced });
  }

  await pruneMedia(media, keepKeys);
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

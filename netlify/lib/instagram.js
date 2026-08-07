// Shared helpers for talking to the Instagram Graph API.
//
// Setup lives in docs/instagram-feed.md. In short: INSTAGRAM_ACCESS_TOKEN holds a
// long-lived Instagram token. Those expire after 60 days, so we refresh it in the
// background and keep the fresh copy in Netlify Blobs — that way the feed keeps
// updating on its own instead of quietly going stale two months from now.

import { getStore } from '@netlify/blobs';

const GRAPH_HOST = 'https://graph.instagram.com';
const GRAPH_VERSION = 'v23.0';

const TOKEN_STORE = 'social';
const TOKEN_KEY = 'instagram-token';

// Refresh once the live token is a week old. Tokens last 60 days, so this leaves
// plenty of margin even if the site goes quiet for a while.
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
// to the environment variable, which still works — it just can't self-refresh.
function getTokenStore() {
  try {
    return getStore({ name: TOKEN_STORE, consistency: 'strong' });
  } catch (error) {
    return null;
  }
}

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
// environment (which is what's in play on the very first request after setup).
async function getActiveToken() {
  const store = getTokenStore();
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

  // Piggyback the token top-up on a request we know worked. Failures here are
  // never fatal — the current token is still good for weeks.
  await refreshAccessToken().catch(() => {});

  return (data.data || []).map(normalisePost).filter(Boolean);
}

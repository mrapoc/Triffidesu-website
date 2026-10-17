<?php
// Copy to private/triffid-config.php on the host: the "private" folder sits
// beside public_html, never inside it. Permissions 0600 (0640 if PHP can't
// read it). See docs/hosting.md.
return [
    // The Meta token from docs/instagram-feed.md. Starts "EAA" (system user or
    // Page token, never expires) or "IG" (Instagram Login, refreshed weekly
    // by the sync on its own).
    'instagram_access_token' => '',

    // Optional. Found automatically for EAA tokens.
    // 'instagram_user_id' => '',

    // Optional. Posts kept, default 48, maximum 50.
    // 'instagram_post_limit' => 48,
];

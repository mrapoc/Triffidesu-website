// Triffid Explorer Scouts
//
// Two live sources drive this site: the Online Scout Manager programme and our
// Instagram feed. Both are rendered here as HTML strings, so the class names
// below are a contract with css/style.css — see docs/feed-contract.md before
// renaming one.

document.addEventListener('DOMContentLoaded', function () {

  // ===== MOBILE NAV TOGGLE =====
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      navToggle.classList.toggle('active');
      var expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
    });

    // Close the menu when a link is taken.
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('open');
        navToggle.classList.remove('active');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ===== HEADER SCROLL SHADOW =====
  var header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  // ===== FAQ ACCORDION =====
  // The answer is collapsed with max-height rather than display:none so it can
  // animate. One open at a time.
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.setAttribute('aria-expanded', 'false');

    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var answer = item.querySelector('.faq-answer');
      var wasActive = item.classList.contains('active');

      document.querySelectorAll('.faq-item').forEach(function (other) {
        other.classList.remove('active');
        other.querySelector('.faq-answer').style.maxHeight = null;
        var otherBtn = other.querySelector('.faq-question');
        if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
      });

      if (!wasActive) {
        item.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ===== SMOOTH SCROLL FOR ANCHOR LINKS =====
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;
      var target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();
      var headerHeight = header ? header.offsetHeight : 0;
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - headerHeight - 16,
        behavior: 'smooth',
      });
    });
  });

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== PROGRAMME CALENDAR =====
  // Synced from Online Scout Manager. The Netlify function proxies the iCal
  // feed to dodge CORS; corsproxy.io is the backstop if the function is down.
  var calendarEl = document.getElementById('programme-calendar');
  if (calendarEl) {
    var ICAL_URL = 'https://www.onlinescoutmanager.co.uk/ext/cal/?f=308716.NzM0YWQxYmU1YmI4YWVmZjg3NTdkMTc1NjdkMDI4MTdkZTBhNzU1YjRkNzFlZGJiOTFhNzYwMjk0NDMyNDg1NGQzNTY2NmFlZTUzODY2MWVhNDg2OGVjZjJlNjllZjZlMmQ4NmM0ZGJkNzM4YzgzMzAwMzgwOGQxYjc5MzVhYWU%3D.K6K061eQr9';

    fetch('/.netlify/functions/calendar')
      .then(function (res) {
        if (!res.ok) throw new Error('Function failed');
        return res.text();
      })
      .then(function (icalData) {
        if (!icalData || !icalData.includes('BEGIN:VCALENDAR')) throw new Error('Invalid data');
        renderProgramme(parseICal(icalData), calendarEl);
      })
      .catch(function () {
        return fetch('https://corsproxy.io/?' + encodeURIComponent(ICAL_URL))
          .then(function (res) { return res.text(); })
          .then(function (icalData) {
            if (!icalData || !icalData.includes('BEGIN:VCALENDAR')) throw new Error('Invalid data');
            renderProgramme(parseICal(icalData), calendarEl);
          });
      })
      .catch(function () {
        calendarEl.innerHTML = '<p class="programme-empty">Unable to load the programme. ' +
          '<a href="' + ICAL_URL + '" target="_blank" rel="noopener noreferrer">Subscribe to our calendar</a> ' +
          'or check our <a href="https://www.facebook.com/triffidesu" target="_blank" rel="noopener noreferrer">Facebook page</a> for upcoming events.</p>';
      });
  }

  function parseICal(data) {
    var events = [];
    var blocks = data.split('BEGIN:VEVENT');

    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i].split('END:VEVENT')[0];
      var event = {};

      // SUMMARY, unfolding continuation lines.
      var summaryMatch = block.match(/SUMMARY:([\s\S]*?)(?=\r?\n[A-Z])/);
      if (summaryMatch) {
        event.summary = summaryMatch[1]
          .replace(/\r?\n\s/g, '')
          .replace(/\\,/g, ',')
          .replace(/\\n/g, ' ')
          .trim();
      }

      var startMatch = block.match(/DTSTART(?:;TZID=[^:]*)?:(\d{8}T\d{6})/);
      if (startMatch) event.start = icalDate(startMatch[1]);

      var endMatch = block.match(/DTEND(?:;TZID=[^:]*)?:(\d{8}T\d{6})/);
      if (endMatch) event.end = icalDate(endMatch[1]);

      var locMatch = block.match(/LOCATION:(.*)/);
      if (locMatch) event.location = locMatch[1].replace(/\\,/g, ',').trim();

      if (event.summary && event.start) events.push(event);
    }

    var now = new Date();
    return events
      .filter(function (ev) { return ev.start >= now; })
      .sort(function (a, b) { return a.start - b.start; })
      .slice(0, 10);
  }

  function icalDate(s) {
    return new Date(
      parseInt(s.substr(0, 4), 10),
      parseInt(s.substr(4, 2), 10) - 1,
      parseInt(s.substr(6, 2), 10),
      parseInt(s.substr(9, 2), 10),
      parseInt(s.substr(11, 2), 10)
    );
  }

  function renderProgramme(events, container) {
    if (!events.length) {
      container.innerHTML = '<p class="programme-empty">Nothing listed just yet. Check back soon, or drop us an email.</p>';
      return;
    }

    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    container.innerHTML = events.map(function (ev, idx) {
      var isNext = idx === 0;
      var timeStr = ev.start && ev.end ? formatTime(ev.start) + ' &ndash; ' + formatTime(ev.end) : '';
      var meta = days[ev.start.getDay()] + (timeStr ? ' &bull; ' + timeStr : '') +
        (ev.location ? ' &bull; ' + escapeHtml(ev.location) : '');

      return '<div class="programme-event' + (isNext ? ' is-next' : '') + '">' +
        '<div class="programme-date">' +
        '<span class="day">' + ev.start.getDate() + '</span>' +
        '<span class="month">' + months[ev.start.getMonth()] + '</span>' +
        '</div>' +
        '<div class="programme-details">' +
        '<h4>' + escapeHtml(ev.summary) + '</h4>' +
        '<span class="programme-time">' + meta + '</span>' +
        '</div>' +
        (isNext ? '<span class="programme-badge">Next</span>' : '') +
        '</div>';
    }).join('');
  }

  function formatTime(date) {
    var h = date.getHours();
    var m = date.getMinutes();
    var suffix = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return h + (m > 0 ? ':' + (m < 10 ? '0' : '') + m : '') + suffix;
  }

  // ===== INSTAGRAM FEED (Latest news + Latest adventures + tagged content) =====
  // One fetch drives every Instagram surface on the page: the newest post
  // becomes the featured news card, the rest fill the adventures grid, and
  // tagged photos and strips pick from the same set.

  // Tiles shown before "Show more". A multiple of the grid's column count so
  // the last row is never left ragged.
  var TILES_BEFORE_MORE = 8;

  // We keep about a year of posts so the activity tags always have something
  // recent to pull from. The homepage grid deliberately doesn't grow with it.
  var MAX_GRID_TILES = 16;

  // Tiles in a tagged strip, e.g. the DofE page. One row, no expander.
  var TAG_FEED_TILES = 4;

  // Captions run long. The featured card shows this much, then hands off to
  // the lightbox for the rest rather than to Instagram.
  var FEATURED_CAPTION_LENGTH = 500;

  // Corner badges, in Instagram's own visual language.
  var BADGE_VIDEO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var BADGE_ALBUM = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="13" height="13" rx="2"/><path d="M4 8v11a2 2 0 0 0 2 2h11"/></svg>';

  // Every post we've been given, so the lightbox can open any of them by index.
  var feedPosts = [];

  // ===== WHERE A POST LANDS ON THE SITE =====
  // The whole point of this is that nobody has to administer it. James posts to
  // Instagram as normal; the post turns up in the right section here on its own.
  //
  // A section asks for a topic (data-topic="water"), and a post matches that
  // topic if any of the words below appear in its caption. A hashtag and a
  // plain word both count, so "#kayak" and "great night kayaking" both land in
  // the same place. Nothing is case sensitive, and a trailing "s" is ignored.
  //
  // To change where something lands, edit this list. It is the only place these
  // words live — no HTML to touch, no admin screen, no re-deploy needed beyond
  // the usual one. docs/hashtags.md is the plain-English version for James.
  var TOPICS = {
    hiking: ['hike', 'hiking', 'walk', 'walking', 'ramble', 'cycle', 'cycling', 'bike', 'biking', 'ride', 'expedition', 'expeditions'],
    camping: ['camp', 'camping', 'campfire', 'campsite', 'bushcraft', 'survival', 'nightsaway', 'tent', 'tents'],
    water: ['kayak', 'kayaking', 'canoe', 'canoeing', 'paddle', 'paddling', 'paddlesport', 'water', 'sailing', 'sail', 'raft', 'rafting', 'swim', 'swimming'],
    service: ['service', 'community', 'remembrance', 'parade', 'volunteering', 'volunteer', 'fundraising', 'litterpick'],
    games: ['widegames', 'widegame', 'gamesnight', 'games', 'evening', 'hutnight', 'nighthike', 'cooking', 'crafts', 'craft'],
    daysout: ['daysout', 'dayout', 'climbing', 'climb', 'karting', 'gokarting', 'gokart', 'paintball', 'paintballing', 'monopolyrun', 'trip', 'tripout'],
    dofe: ['dofe', 'dukeofedinburgh', 'bronze', 'silver', 'gold', 'expedition', 'navigation', 'navigating'],
    skills: ['firstaid', 'emergencyaid', 'aid', 'skills', 'navigation', 'map', 'maps', 'mapreading', 'training'],
  };

  // Turn whatever a section asked for into a list of words to look for.
  // Accepts a topic name ("water"), or raw words for one-off cases.
  function termsFor(spec) {
    var asked = (spec || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
    var terms = [];
    asked.forEach(function (word) {
      var bare = word.replace(/^#/, '');
      if (TOPICS[bare]) {
        terms = terms.concat(TOPICS[bare]);
      } else {
        terms.push(bare);
      }
    });
    return terms;
  }

  // Hashes are stripped before matching, so "#camp" and "camp" are the same
  // thing. \b keeps "camp" from swallowing "campaign", and an optional trailing
  // "s" covers the plural without pulling in every word that starts the same.
  function captionMatches(post, terms) {
    if (!terms.length) return true;
    var caption = (post.caption || '').toLowerCase().replace(/#/g, ' ');
    return terms.some(function (term) {
      var safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('\\b' + safe + 's?\\b').test(caption);
    });
  }

  var newsContainer = document.getElementById('latest-news');
  var feedContainer = document.getElementById('instagram-feed');
  // Inner pages have no feed sections, only tagged photos and strips.
  var hasTagged = document.querySelector('[data-topic], [data-tag], .tag-feed, #gallery-grid');

  if (newsContainer || feedContainer || hasTagged) {
    fetch('/.netlify/functions/instagram')
      .then(function (res) {
        if (!res.ok) throw new Error('Instagram feed unavailable');
        return res.json();
      })
      .then(function (data) {
        var posts = (data && data.posts) || [];
        if (!posts.length) throw new Error('No posts returned');
        feedPosts = posts;
        if (newsContainer) populateLatestNews(posts[0]);
        // The featured post leads the news section, so keep it out of the grid.
        if (feedContainer) populateInstagramFeed(posts.slice(1, 1 + MAX_GRID_TILES), 1);
        populateTagged();
        populateGallery();
        reportTagRouting();
      })
      .catch(function () {
        showSocialFallback();
        removeEl('gallery-loading');
        showEl('gallery-fallback');
        // Static photos stay as they are; drop any strip that can't be filled.
        document.querySelectorAll('.tag-feed').forEach(dropTagFeed);
      });
  }

  function removeEl(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  }

  function showEl(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = '';
  }

  // Instagram captions often end with a wall of hashtags. Fine on Instagram,
  // noisy on the site.
  function cleanCaption(caption) {
    if (!caption) return '';
    var lines = caption.split('\n');
    while (lines.length) {
      var last = lines[lines.length - 1].trim();
      if (last === '' || /^(#[^\s#]+\s*)+$/.test(last)) {
        lines.pop();
      } else {
        break;
      }
    }
    return lines.join('\n').trim();
  }

  // Captions carry the page's SEO weight now that images live on our own
  // domain, but a caption of "🔥🔥" describes nothing, so fall back to
  // something honest rather than pass emoji to a screen reader.
  function altFor(post, fallback) {
    var caption = cleanCaption(post.caption);
    return /[a-z]{3}/i.test(caption)
      ? truncate(caption, 100)
      : fallback || 'Photo from Triffid Explorers';
  }

  function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    var cut = text.slice(0, maxLength);
    var lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) cut = cut.slice(0, lastSpace);
    return cut.trim() + '…';
  }

  function formatPostDate(timestamp) {
    if (!timestamp) return '';
    var date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Instagram captions are plain text with meaning carried by line breaks. Turn
  // that into real paragraphs, and knock hashtags and @mentions back visually
  // so the words people wrote lead. Escapes first, then adds markup: the
  // patterns below can't match inside an HTML entity.
  function renderCaption(caption, maxLength) {
    var text = cleanCaption(caption);
    if (!text) return '';
    if (maxLength) text = truncate(text, maxLength);

    return text
      .split(/\n\s*\n/)
      .map(function (para) {
        var html = escapeHtml(para.trim())
          .replace(/(^|\s)(#[\wÀ-ɏ]+)/g, '$1<span class="caption-tag">$2</span>')
          .replace(/(^|\s)(@[\w.]+)/g, '$1<span class="caption-tag">$2</span>')
          .replace(/\n/g, '<br>');
        return html ? '<p>' + html + '</p>' : '';
      })
      .join('');
  }

  function populateLatestNews(post) {
    var container = document.getElementById('latest-news');
    if (!container) return;

    var caption = cleanCaption(post.caption);
    if (!caption && !post.image) {
      showSocialFallback();
      return;
    }

    removeEl('latest-news-loading');
    removeEl('latest-news-fallback');

    // The lead story owns this post; tagged cards below will pick something else.
    claim(post);

    var images = imagesOf(post);
    var dateText = formatPostDate(post.timestamp);
    var altText = altFor(post, 'Latest post from Triffid Explorers');
    var wasTruncated = caption.length > FEATURED_CAPTION_LENGTH;
    var html = '<div class="two-col">';

    if (images.length) {
      html += '<div class="two-col-image">';
      html += '  <button type="button" class="news-image-open" aria-label="Open this post">';
      html += '    <img id="latest-news-image" src="' + escapeHtml(images[0]) + '" alt="' + escapeHtml(altText) + '">';
      html += '  </button>';
      // A carousel gets its slides as a thumbnail strip under the main image.
      if (images.length > 1) {
        html += '  <div class="news-gallery" role="group" aria-label="Photos from this post">';
        images.forEach(function (src, i) {
          html += '<button type="button" class="news-gallery-thumb' + (i === 0 ? ' is-current' : '') + '"' +
            ' data-src="' + escapeHtml(src) + '" data-slide="' + i + '" aria-label="Show photo ' + (i + 1) + ' of ' + images.length + '">' +
            '<img src="' + escapeHtml(src) + '" alt="" loading="lazy"></button>';
        });
        html += '  </div>';
      }
      html += '</div>';
    }

    html += '<div class="two-col-text">';
    if (dateText) html += '<p class="post-date">' + escapeHtml(dateText) + '</p>';
    if (caption) html += '<div class="post-caption">' + renderCaption(post.caption, FEATURED_CAPTION_LENGTH) + '</div>';
    html += '<button type="button" class="btn btn-outline news-read-more">' +
      (wasTruncated ? 'Read the full post' : 'Open this post') + '</button>';
    html += '</div>';
    html += '</div>';

    container.innerHTML = html;

    // The featured post is always index 0 of the feed.
    container.querySelectorAll('.news-image-open, .news-read-more').forEach(function (el) {
      el.addEventListener('click', function () {
        var main = container.querySelector('#latest-news-image');
        openLightbox(0, parseInt((main && main.getAttribute('data-slide')) || '0', 10));
      });
    });

    if (images.length > 1) wireNewsGallery(container);
  }

  // Clicking a thumbnail swaps the main image. Buttons rather than links, so it
  // works from the keyboard and doesn't add history entries.
  function wireNewsGallery(container) {
    var main = container.querySelector('#latest-news-image');
    var thumbs = container.querySelectorAll('.news-gallery-thumb');
    if (!main) return;

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        main.src = thumb.getAttribute('data-src');
        // Opening the post from here should land on the slide being looked at.
        main.setAttribute('data-slide', thumb.getAttribute('data-slide') || '0');
        thumbs.forEach(function (other) { other.classList.remove('is-current'); });
        thumb.classList.add('is-current');
      });
    });
  }

  // Posts synced before multi-image support only carry a single `image`.
  function imagesOf(post) {
    if (post.images && post.images.length) return post.images;
    return post.image ? [post.image] : [];
  }

  function populateInstagramFeed(posts, indexOffset) {
    var container = document.getElementById('instagram-feed');
    if (!container) return;

    var offset = indexOffset || 0;
    var withImages = [];
    posts.forEach(function (post, i) {
      if (post.image) withImages.push({ post: post, feedIndex: i + offset });
    });

    if (!withImages.length) {
      removeEl('instagram-feed-loading');
      showEl('instagram-feed-fallback');
      return;
    }

    removeEl('instagram-feed-loading');

    container.innerHTML = withImages.map(function (entry, i) {
      var post = entry.post;
      var caption = cleanCaption(post.caption);
      var alt = altFor(post, 'Instagram post from Triffid Explorers');
      var slides = imagesOf(post).length;
      var extra = i >= TILES_BEFORE_MORE ? ' is-hidden' : '';

      return '<a class="instagram-post' + extra + '" data-post="' + entry.feedIndex + '"' +
        ' href="' + escapeHtml(post.permalink) + '" target="_blank" rel="noopener noreferrer">' +
        '<img src="' + escapeHtml(post.image) + '" alt="' + escapeHtml(alt) + '" loading="lazy">' +
        typeBadge(post, slides) +
        (caption ? '<span class="instagram-post-caption">' + escapeHtml(truncate(caption, 140)) + '</span>' : '') +
        '</a>';
    }).join('');

    container.querySelectorAll('.instagram-post').forEach(function (tile) {
      tile.addEventListener('click', function (e) {
        openInPage(e, parseInt(tile.getAttribute('data-post'), 10), 0);
      });
    });

    if (withImages.length > TILES_BEFORE_MORE) addShowMore(container, withImages.length);
  }

  function typeBadge(post, slides) {
    if (post.mediaType === 'VIDEO') {
      return '<span class="instagram-post-type instagram-post-type--video" aria-label="Video">' + BADGE_VIDEO + '</span>';
    }
    if (slides > 1) {
      return '<span class="instagram-post-type instagram-post-type--album" aria-label="' + slides + ' photos">' + BADGE_ALBUM + '</span>';
    }
    return '';
  }

  // Everything is already downloaded, so revealing the rest is instant: no
  // second request, and no wall of photos before anyone asks for one.
  function addShowMore(container, total, extraClass) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline instagram-more' + (extraClass ? ' ' + extraClass : '');
    button.textContent = extraClass === 'gallery-more' ? 'Show all photos' : 'Show more posts';

    button.addEventListener('click', function () {
      container.querySelectorAll('.instagram-post.is-hidden').forEach(function (tile) {
        tile.classList.remove('is-hidden');
      });
      button.remove();
    });

    container.insertAdjacentElement('afterend', button);
  }

  // ===== TAGGED CONTENT =====
  // Hashtag a post on Instagram and it turns up in the matching place on the
  // site. Two ways to ask for it, both declarative so a page needs no JS:
  //
  //   <img data-tag="camp">                    newest matching photo replaces this
  //   <div class="tag-feed" data-tag="dofe">   a short row of recent matches
  //
  // Nothing matching means nothing changes. The static photo stays, and an
  // empty strip removes itself.

  // Posts already showing somewhere on this page. A post tagged "#camp #hike"
  // matches two activity cards, and the newest post of all is usually both the
  // featured card and somebody's newest tagged match. Without this the same
  // photo turns up twice in one eyeful and reads as a bug.
  var claimedPosts = [];

  function claim(post) {
    if (post && claimedPosts.indexOf(post.id) === -1) claimedPosts.push(post.id);
  }

  function isClaimed(post) {
    return !!post && claimedPosts.indexOf(post.id) !== -1;
  }

  // Nothing asked for means "whatever's newest", which is how the recruitment
  // pages show recent activity without caring what it was.
  function postsWithTag(spec) {
    var terms = termsFor(spec);
    if (!terms.length) return feedPosts.slice();
    return feedPosts.filter(function (post) { return captionMatches(post, terms); });
  }

  // A section can say data-topic="water" (preferred) or data-tag="kayak paddle"
  // for a one-off. Both end up in the same matcher.
  function specOf(el) {
    return el.getAttribute('data-topic') || el.getAttribute('data-tag') || '';
  }

  function indexOfPost(post) {
    return feedPosts.indexOf(post);
  }

  function populateTagged() {
    document.querySelectorAll('img[data-topic], img[data-tag]').forEach(refreshTaggedImage);
    document.querySelectorAll('.tag-feed').forEach(fillTagFeed);
  }

  // Swaps a fixed illustrative photo for the newest real one on that theme. The
  // box is a fixed aspect ratio in CSS, so this costs no layout shift and no
  // extra page length. The card just stops being from three years ago.
  function refreshTaggedImage(img) {
    var matches = postsWithTag(specOf(img));
    var post = null;
    for (var i = 0; i < matches.length; i++) {
      if (matches[i].image && !isClaimed(matches[i])) { post = matches[i]; break; }
    }

    // Nothing left that isn't already on screen. The original photo beats
    // showing the same shot twice, so leave the card alone.
    if (!post) return;

    claim(post);
    var index = indexOfPost(post);
    img.src = post.image;
    img.classList.add('is-live');
    img.setAttribute('alt', altFor(post, img.getAttribute('alt')));
    img.addEventListener('click', function () { openLightbox(index, 0); });
  }

  // A section marked data-tag-section exists only to show its strip, so it goes
  // too, otherwise a tag nobody has used leaves a heading standing over
  // nothing. Sections with their own content just lose the strip.
  function dropTagFeed(container) {
    var section = container.closest('[data-tag-section]');
    (section || container).remove();
  }

  function fillTagFeed(container) {
    var wanted = parseInt(container.getAttribute('data-count'), 10) || TAG_FEED_TILES;
    var candidates = postsWithTag(specOf(container)).filter(function (post) {
      return post.image;
    });

    // Prefer posts not already shown elsewhere on the page, but a short row
    // would be more obvious than a repeat, so fall back to the plain
    // chronological pick rather than leaving gaps. Either branch keeps order.
    var unclaimed = candidates.filter(function (post) { return !isClaimed(post); });
    var matches = (unclaimed.length >= wanted ? unclaimed : candidates).slice(0, wanted);
    matches.forEach(claim);

    // Better no section than an empty one.
    if (!matches.length) {
      dropTagFeed(container);
      return;
    }

    container.innerHTML = matches.map(function (post) {
      var alt = altFor(post, 'Photo from Triffid Explorers');
      var slides = imagesOf(post).length;

      return '<a class="instagram-post" data-post="' + indexOfPost(post) + '"' +
        ' href="' + escapeHtml(post.permalink) + '" target="_blank" rel="noopener noreferrer">' +
        '<img src="' + escapeHtml(post.image) + '" alt="' + escapeHtml(alt) + '" loading="lazy">' +
        typeBadge(post, slides) + '</a>';
    }).join('');

    container.hidden = false;
    container.querySelectorAll('.instagram-post').forEach(function (tile) {
      tile.addEventListener('click', function (e) {
        openInPage(e, parseInt(tile.getAttribute('data-post'), 10), 0);
      });
    });
  }

  // Add ?tags=check to any page to see where each recent post was routed and
  // which words did it. Nobody needs this day to day, but when a photo doesn't
  // turn up where you expected, it answers the question in one look instead of
  // guessing at hashtags.
  function reportTagRouting() {
    if (window.location.search.indexOf('tags=check') === -1) return;

    var topics = Object.keys(TOPICS);
    var rows = feedPosts.slice(0, 20).map(function (post) {
      var caption = (post.caption || '').replace(/\s+/g, ' ').trim();
      var matched = topics.filter(function (topic) {
        return captionMatches(post, TOPICS[topic]);
      });
      return {
        posted: formatPostDate(post.timestamp),
        caption: truncate(caption, 60) || '(no caption)',
        'lands in': matched.length ? matched.join(', ') : '— newest-posts slots only',
      };
    });

    console.log('%c Where your recent posts land ', 'background:#7413dc;color:#fff;padding:4px 8px;border-radius:4px;font-weight:700');
    if (console.table) { console.table(rows); } else { console.log(rows); }

    var unrouted = rows.filter(function (r) { return r['lands in'].charAt(0) === '—'; }).length;
    console.log(unrouted
      ? unrouted + ' of ' + rows.length + ' recent posts matched no topic. They still show in the newest-posts strips, they just will not fill a themed section. See docs/hashtags.md.'
      : 'Every recent post matched at least one topic.');
    console.log('Topics available: ' + topics.join(', '));
  }

  // ===== GALLERY PAGE =====
  // Every photo we hold, newest first, flattened so each slide of a carousel is
  // its own tile. Filters reuse the same tag matching as everywhere else.
  var GALLERY_PAGE_SIZE = 40;

  function populateGallery() {
    var grid = document.getElementById('gallery-grid');
    if (!grid) return;

    removeEl('gallery-loading');

    if (!feedPosts.length) {
      showEl('gallery-fallback');
      return;
    }

    buildGalleryFilters();
    renderGallery('');
  }

  // Only offer a filter that matches something: an activity we haven't
  // photographed yet shouldn't be a button that leads nowhere.
  function buildGalleryFilters() {
    var bar = document.getElementById('gallery-filters');
    if (!bar) return;

    var buttons = [].slice.call(bar.querySelectorAll('[data-topic], [data-tag]'));
    var available = buttons.filter(function (button) {
      return postsWithTag(specOf(button)).length > 0;
    });

    buttons.forEach(function (button) {
      if (available.indexOf(button) === -1) button.remove();
    });

    // With nothing to filter by, the bar is just noise.
    if (!available.length) {
      bar.remove();
      return;
    }

    bar.hidden = false;
    bar.querySelectorAll('button').forEach(function (button) {
      button.addEventListener('click', function () {
        bar.querySelectorAll('button').forEach(function (other) { other.classList.remove('is-current'); });
        button.classList.add('is-current');
        renderGallery(specOf(button));
      });
    });
  }

  function renderGallery(tag) {
    var grid = document.getElementById('gallery-grid');
    var matches = postsWithTag(tag);

    // One tile per photo, not per post.
    var photos = [];
    matches.forEach(function (post) {
      var index = indexOfPost(post);
      imagesOf(post).forEach(function (src, slide) {
        photos.push({ post: post, index: index, slide: slide, src: src });
      });
    });

    var existingMore = document.querySelector('.gallery-more');
    if (existingMore) existingMore.remove();

    grid.innerHTML = photos.map(function (photo, i) {
      return '<a class="instagram-post' + (i >= GALLERY_PAGE_SIZE ? ' is-hidden' : '') + '"' +
        ' data-post="' + photo.index + '" data-slide="' + photo.slide + '"' +
        ' href="' + escapeHtml(photo.post.permalink) + '" target="_blank" rel="noopener noreferrer">' +
        '<img src="' + escapeHtml(photo.src) + '" alt="' + escapeHtml(altFor(photo.post)) + '" loading="lazy">' +
        '</a>';
    }).join('');

    grid.querySelectorAll('.instagram-post').forEach(function (tile) {
      tile.addEventListener('click', function (e) {
        openInPage(e, parseInt(tile.getAttribute('data-post'), 10), parseInt(tile.getAttribute('data-slide'), 10));
      });
    });

    var count = document.getElementById('gallery-count');
    if (count) {
      count.textContent = photos.length + (photos.length === 1 ? ' photo' : ' photos');
    }

    if (photos.length > GALLERY_PAGE_SIZE) addShowMore(grid, photos.length, 'gallery-more');
  }

  // ===== POST LIGHTBOX =====
  // Opens a post in place rather than sending people off to Instagram. Since we
  // hold the images and the caption anyway, there's no reason to hand the visit
  // over. The link out stays, it just stops being the only way to read a post.
  var lightbox = null;
  var lightboxPost = null;
  var lightboxSlide = 0;
  var lastFocused = null;

  function buildLightbox() {
    if (lightbox) return lightbox;

    lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Post');
    lightbox.hidden = true;
    lightbox.innerHTML = [
      '<div class="lightbox-backdrop" data-close></div>',
      '<div class="lightbox-panel">',
      '  <button type="button" class="lightbox-close" data-close aria-label="Close">&times;</button>',
      '  <div class="lightbox-media">',
      '    <img class="lightbox-image" src="" alt="">',
      '    <button type="button" class="lightbox-nav lightbox-prev" aria-label="Previous photo">&#8249;</button>',
      '    <button type="button" class="lightbox-nav lightbox-next" aria-label="Next photo">&#8250;</button>',
      '    <div class="lightbox-dots"></div>',
      '  </div>',
      '  <div class="lightbox-body">',
      '    <p class="lightbox-date"></p>',
      '    <div class="lightbox-caption"></div>',
      // Somebody reading a post is as interested as they get. Offer them a way
      // in here rather than a way out to the feed.
      '    <div class="lightbox-actions">',
      '      <a class="btn btn-sm" href="mailto:hello@triffidesu.co.uk?subject=Arranging%20a%20first%20visit%20to%20Triffid%20Explorers">Arrange a visit <span class="arrow" aria-hidden="true">&rarr;</span></a>',
      '      <a class="lightbox-source" target="_blank" rel="noopener noreferrer">View on Instagram</a>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('');

    document.body.appendChild(lightbox);

    lightbox.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-close')) closeLightbox();
    });
    lightbox.querySelector('.lightbox-prev').addEventListener('click', function () { moveSlide(-1); });
    lightbox.querySelector('.lightbox-next').addEventListener('click', function () { moveSlide(1); });

    // Swipe between slides on touch.
    var startX = null;
    var media = lightbox.querySelector('.lightbox-media');
    media.addEventListener('touchstart', function (e) { startX = e.changedTouches[0].clientX; }, { passive: true });
    media.addEventListener('touchend', function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) moveSlide(dx < 0 ? 1 : -1);
      startX = null;
    }, { passive: true });

    return lightbox;
  }

  function openLightbox(postIndex, slideIndex) {
    var post = feedPosts[postIndex];
    if (!post) return;

    buildLightbox();
    lastFocused = document.activeElement;
    lightboxPost = post;

    var caption = cleanCaption(post.caption);
    lightbox.querySelector('.lightbox-date').textContent = formatPostDate(post.timestamp);
    lightbox.querySelector('.lightbox-caption').innerHTML = renderCaption(post.caption);
    lightbox.querySelector('.lightbox-source').href = post.permalink;
    lightbox.setAttribute('aria-label', truncate(caption, 80) || 'Post from Triffid Explorers');

    var images = imagesOf(post);
    var dots = lightbox.querySelector('.lightbox-dots');
    dots.innerHTML = images.length > 1
      ? images.map(function (_, i) {
        return '<button type="button" class="lightbox-dot" data-slide="' + i + '" aria-label="Photo ' + (i + 1) + ' of ' + images.length + '"></button>';
      }).join('')
      : '';
    dots.querySelectorAll('.lightbox-dot').forEach(function (dot) {
      dot.addEventListener('click', function () { showSlide(parseInt(dot.getAttribute('data-slide'), 10)); });
    });

    var multiple = images.length > 1;
    lightbox.querySelector('.lightbox-prev').hidden = !multiple;
    lightbox.querySelector('.lightbox-next').hidden = !multiple;

    showSlide(slideIndex || 0);

    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    lightbox.querySelector('.lightbox-close').focus();
    document.addEventListener('keydown', onLightboxKey);
  }

  function showSlide(index) {
    var images = imagesOf(lightboxPost);
    if (!images.length) return;

    lightboxSlide = (index + images.length) % images.length;

    var img = lightbox.querySelector('.lightbox-image');
    img.src = images[lightboxSlide];
    img.alt = altFor(lightboxPost, 'Photo from Triffid Explorers');

    lightbox.querySelectorAll('.lightbox-dot').forEach(function (dot, i) {
      dot.classList.toggle('is-current', i === lightboxSlide);
    });
  }

  function moveSlide(step) {
    showSlide(lightboxSlide + step);
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove('lightbox-open');
    document.removeEventListener('keydown', onLightboxKey);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function onLightboxKey(e) {
    if (e.key === 'Escape') return closeLightbox();
    if (e.key === 'ArrowLeft') return moveSlide(-1);
    if (e.key === 'ArrowRight') return moveSlide(1);
    if (e.key !== 'Tab') return;

    // Keep Tab inside the dialog while it's open.
    var focusable = [].slice.call(lightbox.querySelectorAll('button, a[href]')).filter(function (el) {
      return !el.hidden && el.offsetParent !== null;
    });
    if (!focusable.length) return;

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Plain clicks open the post here; the anchor stays a real link so middle
  // click, ctrl-click and no-JS all still reach Instagram.
  function openInPage(e, postIndex, slideIndex) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    openLightbox(postIndex, slideIndex);
  }

  // Instagram is unreachable (or not set up yet), so show the hand-written news
  // card and point people at the profile rather than leaving empty sections.
  function showSocialFallback() {
    removeEl('latest-news-loading');
    showEl('latest-news-fallback');
    removeEl('instagram-feed-loading');
    showEl('instagram-feed-fallback');
  }

  // ===== BADGES PAGE =====
  // The 51 Explorer activity badges are in the markup, so the page works with
  // no JS. This only narrows what's on screen.
  (function () {
    var grid = document.getElementById('badge-grid');
    if (!grid) return;

    var search = document.getElementById('badge-search');
    var filters = document.getElementById('badge-filters');
    var count = document.getElementById('badge-count');
    var empty = document.getElementById('badge-empty');
    var tiles = [].slice.call(grid.querySelectorAll('.badge-tile'));
    var filter = 'all';

    function apply() {
      var query = (search ? search.value : '').trim().toLowerCase();
      var shown = 0;

      tiles.forEach(function (tile) {
        var matchesQuery = !query || tile.getAttribute('data-name').indexOf(query) !== -1;
        var matchesFilter =
          filter === 'all' ||
          (filter === 'staged' ? tile.hasAttribute('data-staged') : tile.getAttribute('data-kind') === filter);
        var visible = matchesQuery && matchesFilter;

        tile.classList.toggle('is-hidden', !visible);
        if (visible) shown++;
      });

      if (count) count.textContent = shown + ' of ' + tiles.length;
      if (empty) empty.hidden = shown > 0;
      grid.hidden = shown === 0;
    }

    if (search) search.addEventListener('input', apply);

    if (filters) {
      filters.querySelectorAll('button').forEach(function (button) {
        button.addEventListener('click', function () {
          filters.querySelectorAll('button').forEach(function (other) { other.classList.remove('is-current'); });
          button.classList.add('is-current');
          filter = button.getAttribute('data-filter');
          apply();
        });
      });
    }

    apply();
  })();
});

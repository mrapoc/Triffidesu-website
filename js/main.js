// ===== MOBILE NAV TOGGLE =====
document.addEventListener('DOMContentLoaded', function () {
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      navToggle.classList.toggle('active');
      var expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
    });

    // Close nav when a link is clicked
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
      if (window.scrollY > 10) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  // ===== FAQ ACCORDION =====
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var answer = item.querySelector('.faq-answer');
      var isActive = item.classList.contains('active');

      // Close all others
      document.querySelectorAll('.faq-item').forEach(function (other) {
        other.classList.remove('active');
        other.querySelector('.faq-answer').style.maxHeight = null;
      });

      // Toggle this one
      if (!isActive) {
        item.classList.add('active');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });

  // ===== SMOOTH SCROLL FOR ANCHOR LINKS =====
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var targetId = this.getAttribute('href');
      if (targetId === '#') return;
      var target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        var headerHeight = document.querySelector('.site-header').offsetHeight;
        var targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }
    });
  });

  // ===== PROGRAMME CALENDAR (iCal parser) =====
  var calendarEl = document.getElementById('programme-calendar');
  if (calendarEl) {
    var ICAL_URL = 'https://www.onlinescoutmanager.co.uk/ext/cal/?f=308716.NzM0YWQxYmU1YmI4YWVmZjg3NTdkMTc1NjdkMDI4MTdkZTBhNzU1YjRkNzFlZGJiOTFhNzYwMjk0NDMyNDg1NGQzNTY2NmFlZTUzODY2MWVhNDg2OGVjZjJlNjllZjZlMmQ4NmM0ZGJkNzM4YzgzMzAwMzgwOGQxYjc5MzVhYWU%3D.K6K061eQr9';

    // Try Netlify function first, fall back to CORS proxy
    fetch('/.netlify/functions/calendar')
      .then(function (res) {
        if (!res.ok) throw new Error('Function failed');
        return res.text();
      })
      .then(function (icalData) {
        if (!icalData || !icalData.includes('BEGIN:VCALENDAR')) throw new Error('Invalid data');
        var events = parseICal(icalData);
        renderProgramme(events, calendarEl);
      })
      .catch(function () {
        // Fallback: try corsproxy.io
        return fetch('https://corsproxy.io/?' + encodeURIComponent(ICAL_URL))
          .then(function (res) { return res.text(); })
          .then(function (icalData) {
            if (!icalData || !icalData.includes('BEGIN:VCALENDAR')) throw new Error('Invalid data');
            var events = parseICal(icalData);
            renderProgramme(events, calendarEl);
          });
      })
      .catch(function () {
        calendarEl.innerHTML = '<p style="text-align:center; color: var(--grey);">Unable to load programme. <a href="' + ICAL_URL + '" target="_blank" rel="noopener noreferrer">Subscribe to our calendar</a> or check our <a href="https://www.facebook.com/triffidesu" target="_blank" rel="noopener noreferrer">Facebook page</a> for upcoming events.</p>';
      });
  }

  function parseICal(data) {
    var events = [];
    var blocks = data.split('BEGIN:VEVENT');

    for (var i = 1; i < blocks.length; i++) {
      var block = blocks[i].split('END:VEVENT')[0];
      var event = {};

      // Extract SUMMARY (handle line folding)
      var summaryMatch = block.match(/SUMMARY:([\s\S]*?)(?=\r?\n[A-Z])/);
      if (summaryMatch) {
        event.summary = summaryMatch[1].replace(/\r?\n\s/g, '').replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
      }

      // Extract DTSTART
      var startMatch = block.match(/DTSTART(?:;TZID=[^:]*)?:(\d{8}T\d{6})/);
      if (startMatch) {
        var s = startMatch[1];
        event.start = new Date(
          parseInt(s.substr(0, 4)),
          parseInt(s.substr(4, 2)) - 1,
          parseInt(s.substr(6, 2)),
          parseInt(s.substr(9, 2)),
          parseInt(s.substr(11, 2))
        );
      }

      // Extract DTEND
      var endMatch = block.match(/DTEND(?:;TZID=[^:]*)?:(\d{8}T\d{6})/);
      if (endMatch) {
        var e = endMatch[1];
        event.end = new Date(
          parseInt(e.substr(0, 4)),
          parseInt(e.substr(4, 2)) - 1,
          parseInt(e.substr(6, 2)),
          parseInt(e.substr(9, 2)),
          parseInt(e.substr(11, 2))
        );
      }

      // Extract LOCATION
      var locMatch = block.match(/LOCATION:(.*)/);
      if (locMatch) {
        event.location = locMatch[1].replace(/\\,/g, ',').trim();
      }

      if (event.summary && event.start) {
        events.push(event);
      }
    }

    // Sort by date, filter to future events only
    var now = new Date();
    events = events.filter(function (ev) {
      return ev.start >= now;
    });
    events.sort(function (a, b) {
      return a.start - b.start;
    });

    return events.slice(0, 10); // Show next 10 events
  }

  function renderProgramme(events, container) {
    if (events.length === 0) {
      container.innerHTML = '<p style="text-align:center; color: var(--grey);">No upcoming events &mdash; check back soon!</p>';
      return;
    }

    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var html = '';

    events.forEach(function (ev, idx) {
      var isNext = idx === 0;
      var day = ev.start.getDate();
      var month = months[ev.start.getMonth()];
      var dayName = days[ev.start.getDay()];

      var timeStr = '';
      if (ev.start && ev.end) {
        timeStr = formatTime(ev.start) + ' &ndash; ' + formatTime(ev.end);
      }

      html += '<div class="programme-event' + (isNext ? ' is-next' : '') + '">';
      html += '  <div class="programme-date">';
      html += '    <span class="day">' + day + '</span>';
      html += '    <span class="month">' + month + '</span>';
      html += '  </div>';
      html += '  <div class="programme-details">';
      html += '    <h4>' + escapeHtml(ev.summary) + '</h4>';
      html += '    <span class="programme-time">' + dayName + ' &bull; ' + timeStr + '</span>';
      html += '  </div>';
      if (isNext) {
        html += '  <span class="programme-badge">Next</span>';
      }
      html += '</div>';
    });

    container.innerHTML = html;
  }

  function formatTime(date) {
    var h = date.getHours();
    var m = date.getMinutes();
    var suffix = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return h + (m > 0 ? ':' + (m < 10 ? '0' : '') + m : '') + suffix;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== SCROLL REVEAL =====
  var revealElements = document.querySelectorAll('.activity-card, .dofe-card, .programme-event, .gallery-item, .section-header, .two-col, .quote-block, .faq-list, .price-highlight');

  revealElements.forEach(function (el) {
    el.classList.add('reveal');
  });

  // Stagger activity cards and gallery items
  document.querySelectorAll('.activity-grid, .dofe-levels, .gallery-grid').forEach(function (grid) {
    grid.querySelectorAll('.reveal').forEach(function (card, i) {
      card.classList.add('reveal-delay-' + Math.min(i + 1, 5));
    });
  });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal').forEach(function (el) {
    observer.observe(el);
  });

  // Console hint for curious explorers
  console.log('%c Triffid ESU ', 'background: #7413BD; color: white; font-size: 14px; padding: 4px 8px; border-radius: 4px;');
  console.log('%c psst... try typing our name ', 'color: #999; font-style: italic;');
  console.log('%c there are 7 hidden surprises on this site. here are some clues... ', 'color: #bbb; font-size: 11px;');
  console.log('%c 1. the year at the bottom does more than just sit there ', 'color: #ccc; font-size: 10px;');
  console.log('%c 2. leaders always have something to say if you ask ', 'color: #ccc; font-size: 10px;');
  console.log('%c 3. ...both of them ', 'color: #ccc; font-size: 10px;');
  console.log('%c 4. purple words aren\'t just for show ', 'color: #ccc; font-size: 10px;');
  console.log('%c 5. the big photo at the top has a secret move ', 'color: #ccc; font-size: 10px;');
  console.log('%c 6. ever wondered exactly how long until Monday? ', 'color: #ccc; font-size: 10px;');
  console.log('%c 7. three quick taps on a photo might break something ', 'color: #ccc; font-size: 10px;');
  console.log('%c ...and there might be more if you keep looking 👀 ', 'color: #aaa; font-size: 10px; font-style: italic;');

  // ===== HIDDEN INTERACTIONS (7 surprises) =====
  var isMobile = window.innerWidth <= 768;
  var foundCount = 0;
  var totalSurprises = 7;

  function surpriseFound(name) {
    foundCount++;
    var toast = document.createElement('div');
    toast.className = 'surprise-toast';
    toast.innerHTML = '<strong>Easter egg ' + foundCount + '/' + totalSurprises + ' found!</strong> ' + name;
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('show'); });
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 400);
    }, 3000);

    if (foundCount >= totalSurprises) {
      setTimeout(function () {
        var mega = document.createElement('div');
        mega.className = 'surprise-toast surprise-mega';
        mega.innerHTML = '<strong>YOU FOUND THEM ALL!</strong> You are officially the most dedicated Explorer. Screenshot this and show Sam or James for a prize.';
        document.body.appendChild(mega);
        requestAnimationFrame(function () { mega.classList.add('show'); });
        launchConfetti(200);
      }, 3500);
    }
  }

  // Inject surprise CSS
  var surpriseStyle = document.createElement('style');
  surpriseStyle.textContent = [
    '.surprise-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px); background: #1a1a2e; color: white; padding: 1rem 1.5rem; border-radius: 12px; font-size: 0.9rem; z-index: 10000; transition: transform 0.4s ease; box-shadow: 0 8px 30px rgba(0,0,0,0.3); max-width: 90vw; text-align: center; }',
    '.surprise-toast.show { transform: translateX(-50%) translateY(0); }',
    '.surprise-mega { background: linear-gradient(135deg, #ff006e, #8338ec) !important; font-size: 1rem; padding: 1.5rem 2rem; }',
    '.barrel-roll { animation: barrel-roll 1s ease-in-out; }',
    '@keyframes barrel-roll { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
    '.screen-shake { animation: screen-shake 0.5s ease-in-out; }',
    '@keyframes screen-shake { 0%,100% { transform: translateX(0); } 10% { transform: translateX(-8px); } 20% { transform: translateX(8px); } 30% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 50% { transform: translateX(-4px); } 60% { transform: translateX(4px); } 70% { transform: translateX(-2px); } 80% { transform: translateX(2px); } }',
    '.skull-piece { position: fixed; font-size: 1.5rem; z-index: 9999; pointer-events: none; }',
    '.wiggle { animation: wiggle 0.5s ease-in-out; }',
    '@keyframes wiggle { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-5deg); } 40% { transform: rotate(5deg); } 60% { transform: rotate(-3deg); } 80% { transform: rotate(3deg); } }',
    '.confetti-piece { position: fixed; width: 10px; height: 10px; z-index: 9999; pointer-events: none; border-radius: 2px; }',
    '.speech-bubble { position: absolute; background: #1a1a2e; color: white; padding: 0.75rem 1rem; border-radius: 12px; font-size: 0.85rem; z-index: 100; top: -60px; left: 50%; transform: translateX(-50%); opacity: 0; transition: opacity 0.3s ease; pointer-events: none; max-width: 280px; white-space: normal; text-align: center; }',
    '.speech-bubble.show { opacity: 1; }',
    '.speech-bubble::after { content: ""; position: absolute; bottom: -8px; left: 50%; margin-left: -8px; border: 8px solid transparent; border-top-color: #1a1a2e; }',
    '.gravity-drop { animation: gravity-drop 1.5s ease-in forwards; }',
    '@keyframes gravity-drop { 0% { transform: translateY(0) rotate(0); } 30% { transform: translateY(20px) rotate(2deg); } 100% { transform: translateY(200vh) rotate(720deg); } }',
    '.rubber-band { animation: rubber-band 0.8s ease; }',
    '@keyframes rubber-band { 0% { transform: scale(1); } 30% { transform: scaleX(1.25) scaleY(0.75); } 40% { transform: scaleX(0.75) scaleY(1.25); } 50% { transform: scaleX(1.15) scaleY(0.85); } 65% { transform: scaleX(0.95) scaleY(1.05); } 75% { transform: scaleX(1.05) scaleY(0.95); } 100% { transform: scale(1); } }',
  ].join('\n');
  document.head.appendChild(surpriseStyle);

  function launchConfetti(count) {
    var colors = ['#ff006e', '#8338ec', '#3a86ff', '#23A950', '#D4AF37', '#ff595e', '#ffca3a'];
    for (var i = 0; i < (count || 80); i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.top = '-10px';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.width = (Math.random() * 8 + 5) + 'px';
      piece.style.height = (Math.random() * 8 + 5) + 'px';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      document.body.appendChild(piece);
      animateConfetti(piece, Math.random() * 500);
    }
  }

  function animateConfetti(el, delay) {
    var x = parseFloat(el.style.left);
    var drift = (Math.random() - 0.5) * 30;
    var duration = 2000 + Math.random() * 2000;
    var start = null;
    setTimeout(function () {
      function fall(ts) {
        if (!start) start = ts;
        var progress = (ts - start) / duration;
        if (progress >= 1) { el.remove(); return; }
        var y = progress * window.innerHeight * 1.2;
        var wobble = Math.sin(progress * 10) * 15;
        el.style.top = y + 'px';
        el.style.left = (x + drift * progress + wobble) + 'px';
        el.style.opacity = 1 - progress * 0.5;
        el.style.transform = 'rotate(' + progress * 720 + 'deg)';
        requestAnimationFrame(fall);
      }
      requestAnimationFrame(fall);
    }, delay);
  }

  // --- SURPRISE 1: Click the copyright year → barrel roll ---
  var footerBottom = document.querySelector('.footer-bottom');
  if (footerBottom) {
    var yearText = footerBottom.querySelector('p');
    if (yearText) {
      yearText.style.cursor = 'default';
      var yearClicks = 0;
      yearText.addEventListener('click', function () {
        yearClicks++;
        if (yearClicks === 1) {
          var anim = isMobile ? 'screen-shake' : 'barrel-roll';
          document.documentElement.classList.add(anim);
          surpriseFound(isMobile ? 'Screen shake!' : 'Barrel roll!');
          setTimeout(function () { document.documentElement.classList.remove(anim); }, 1100);
        }
      });
    }
  }

  // --- SURPRISE 2: Click Sam's leader avatar → dad joke ---
  var samJokes = [
    "I told the Explorers a camping joke. It was in-tents.",
    "Why don't Explorer Scouts ever get lost? Because they always take the right path... eventually.",
    "I tried to make a belt out of watches. It was a waist of time.",
    "What do you call a Scout who can sing? A camp-fire performer.",
    "I'd tell you a map joke but you'd never find the punchline.",
  ];

  // --- SURPRISE 3: Click James's leader avatar → kayak joke ---
  var jamesJokes = [
    "What's a kayaker's favourite type of music? Rock and row.",
    "I tried to tell a river joke. It didn't flow well.",
    "Why did James bring a ladder kayaking? To reach the high tide.",
    "What do you call a kayak that tells jokes? A paddle-comedian.",
    "I wanted to be a professional kayaker but I couldn't stay afloat financially.",
  ];

  var leaderAvatars = document.querySelectorAll('.leader-avatar');
  if (leaderAvatars.length >= 2) {
    setupJokeAvatar(leaderAvatars[0], samJokes, "Sam's dad joke");
    setupJokeAvatar(leaderAvatars[1], jamesJokes, "James's dad joke");
  }

  function setupJokeAvatar(avatar, jokes, name) {
    avatar.style.cursor = 'pointer';
    var jokeIndex = 0;
    var found = false;
    avatar.addEventListener('click', function () {
      avatar.classList.add('rubber-band');
      setTimeout(function () { avatar.classList.remove('rubber-band'); }, 800);

      // Show speech bubble
      var card = avatar.closest('.activity-card') || avatar.parentElement;
      card.style.position = 'relative';
      card.style.overflow = 'visible';
      var existing = card.querySelector('.speech-bubble');
      if (existing) existing.remove();

      var bubble = document.createElement('div');
      bubble.className = 'speech-bubble';
      bubble.textContent = jokes[jokeIndex % jokes.length];
      card.appendChild(bubble);
      // Position above avatar
      var avatarRect = avatar.getBoundingClientRect();
      var cardRect = card.getBoundingClientRect();
      bubble.style.top = (avatarRect.top - cardRect.top - 55) + 'px';
      bubble.style.left = '50%';
      requestAnimationFrame(function () { bubble.classList.add('show'); });
      jokeIndex++;

      setTimeout(function () {
        bubble.classList.remove('show');
        setTimeout(function () { bubble.remove(); }, 300);
      }, 4000);

      if (!found) { found = true; surpriseFound(name); }
    });
  }

  // --- SURPRISE 4: Click "properly" or "Proper" on DofE page → confetti ---
  document.querySelectorAll('.highlight').forEach(function (el) {
    if (el.textContent.trim() === 'Proper' || el.textContent.trim() === 'Last') {
      var found = false;
      el.style.cursor = 'pointer';
      el.addEventListener('click', function () {
        launchConfetti(isMobile ? 35 : 100);
        if (!found) { found = true; surpriseFound('Confetti!'); }
      });
    }
  });

  // --- SURPRISE 5: Click hero image → all activity cards do a wiggle ---
  var heroImg = document.querySelector('.hero-image img');
  if (heroImg) {
    var found5 = false;
    heroImg.style.cursor = 'pointer';
    heroImg.addEventListener('click', function () {
      if (isMobile) {
        // On mobile the cards are off-screen, so wiggle the hero image itself
        heroImg.classList.add('wiggle');
        setTimeout(function () { heroImg.classList.remove('wiggle'); }, 600);
        // Also wiggle the nav logo for fun
        var logo = document.querySelector('.nav-logo img');
        if (logo) {
          setTimeout(function () {
            logo.classList.add('wiggle');
            setTimeout(function () { logo.classList.remove('wiggle'); }, 600);
          }, 200);
        }
      } else {
        document.querySelectorAll('.activity-card').forEach(function (card, i) {
          setTimeout(function () {
            card.classList.add('wiggle');
            setTimeout(function () { card.classList.remove('wiggle'); }, 600);
          }, i * 100);
        });
      }
      if (!found5) { found5 = true; surpriseFound('Wiggle party!'); }
    });
  }

  // --- SURPRISE 6: Click the meeting time "7:00 – 9:00 pm" → countdown to Monday ---
  var infoItems = document.querySelectorAll('.info-item span');
  infoItems.forEach(function (item) {
    if (item.textContent.indexOf('7:00') !== -1 || item.innerHTML.indexOf('7:00') !== -1) {
      item.style.cursor = 'pointer';
      var found6 = false;
      item.addEventListener('click', function () {
        var now = new Date();
        var nextMonday = new Date();
        nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
        nextMonday.setHours(19, 0, 0, 0);
        if (now.getDay() === 1 && now.getHours() < 21) {
          nextMonday = new Date();
          nextMonday.setHours(19, 0, 0, 0);
        }
        var diff = nextMonday - now;
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var mins = Math.floor((diff % 3600000) / 60000);

        var msg = days > 0 ? days + 'd ' + hours + 'h ' + mins + 'm until Monday vibes' : hours + 'h ' + mins + 'm until we meet!';
        if (now.getDay() === 1 && now.getHours() >= 19 && now.getHours() < 21) {
          msg = "We're live RIGHT NOW! Get to the hut!";
        }

        var toast = document.createElement('div');
        toast.className = 'surprise-toast';
        toast.innerHTML = '<strong>' + msg + '</strong>';
        document.body.appendChild(toast);
        requestAnimationFrame(function () { toast.classList.add('show'); });
        setTimeout(function () {
          toast.classList.remove('show');
          setTimeout(function () { toast.remove(); }, 400);
        }, 4000);

        if (!found6) { found6 = true; surpriseFound('Monday countdown!'); }
      });
    }
  });

  // --- SURPRISE 6b: "six or seven" → the meme ---
  document.querySelectorAll('.six-seven').forEach(function (el) {
    el.style.cursor = 'default';
    var found67 = false;
    el.addEventListener('click', function () {
      if (!found67) {
        found67 = true;
        // Mark all six-seven elements so it only counts once
        document.querySelectorAll('.six-seven').forEach(function (other) {
          other.removeAttribute('data-trigger');
        });
      }

      // The meme sequence
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-family:Inter,sans-serif;';

      var line1 = document.createElement('div');
      line1.style.cssText = 'font-size:' + (isMobile ? '1.3rem' : '2rem') + ';color:white;opacity:0;transition:opacity 0.5s;text-align:center;padding:0 1rem;';
      line1.textContent = 'Why was 6 afraid of 7?';

      var numbers = document.createElement('div');
      numbers.style.cssText = 'font-size:' + (isMobile ? '3rem' : '5rem') + ';margin:2rem 0;display:flex;gap:0.5rem;align-items:center;';

      var n6 = document.createElement('span');
      n6.textContent = '6';
      n6.style.cssText = 'transition: all 0.5s ease; color: #3a86ff;';

      var n7 = document.createElement('span');
      n7.textContent = '7';
      n7.style.cssText = 'transition: all 0.5s ease; color: #ff006e;';

      var n8 = document.createElement('span');
      n8.textContent = '8';
      n8.style.cssText = 'transition: all 0.5s ease; color: #8338ec;';

      var n9 = document.createElement('span');
      n9.textContent = '9';
      n9.style.cssText = 'transition: all 0.5s ease; color: #23A950;';

      numbers.appendChild(n6);
      numbers.appendChild(n7);
      numbers.appendChild(n8);
      numbers.appendChild(n9);

      var line2 = document.createElement('div');
      line2.style.cssText = 'font-size:' + (isMobile ? '1.1rem' : '1.5rem') + ';color:#ff006e;opacity:0;transition:opacity 0.5s;font-weight:700;text-align:center;padding:0 1rem;';
      line2.textContent = 'Because 7 ate 9!';

      var tapHint = document.createElement('div');
      tapHint.style.cssText = 'position:absolute;bottom:2rem;color:rgba(255,255,255,0.3);font-size:0.8rem;';
      tapHint.textContent = 'tap anywhere to close';

      overlay.appendChild(line1);
      overlay.appendChild(numbers);
      overlay.appendChild(line2);
      overlay.appendChild(tapHint);
      document.body.appendChild(overlay);

      // Animation sequence
      setTimeout(function () { line1.style.opacity = '1'; }, 300);
      setTimeout(function () {
        // 6 gets scared
        n6.style.transform = 'translateX(' + (isMobile ? '-15px' : '-30px') + ') scale(0.8)';
        n6.style.color = '#ffca3a';
        n6.textContent = '6 😰';
      }, 1500);
      setTimeout(function () {
        // 7 eats 8
        n7.style.transform = 'scale(1.3)';
        n7.textContent = '7 😈';
        n8.style.opacity = '0';
        n8.style.transform = 'scale(0)';
      }, 2500);
      setTimeout(function () {
        // 7 eats 9
        n9.style.opacity = '0';
        n9.style.transform = 'scale(0)';
        n7.style.transform = 'scale(1.5)';
        n7.textContent = '7 🤤';
      }, 3300);
      setTimeout(function () {
        // 6 runs away
        n6.style.transform = 'translateX(' + (isMobile ? '-80px' : '-200px') + ') scale(0.5)';
        n6.style.opacity = '0';
        n6.textContent = '6 🏃';
      }, 4000);
      setTimeout(function () {
        line2.style.opacity = '1';
        // This one is a secret bonus — doesn't count toward the 7
        if (!found67) {
          found67 = true;
          var bonusToast = document.createElement('div');
          bonusToast.className = 'surprise-toast surprise-mega';
          bonusToast.innerHTML = '<strong>SECRET BONUS FOUND!</strong> This one doesn\'t even count toward the 7. You absolute legend.';
          document.body.appendChild(bonusToast);
          requestAnimationFrame(function () { bonusToast.classList.add('show'); });
          setTimeout(function () {
            bonusToast.classList.remove('show');
            setTimeout(function () { bonusToast.remove(); }, 400);
          }, 4000);
        }
      }, 4800);

      overlay.addEventListener('click', function () {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s';
        setTimeout(function () { overlay.remove(); }, 300);
      });
    });
  });

  // --- SURPRISE 7: Triple-click any activity card photo → gravity drop all photos briefly ---
  var photoClicks = {};
  document.querySelectorAll('.activity-photo').forEach(function (photo, idx) {
    var clickCount = 0;
    var clickTimer = null;
    photo.style.cursor = 'pointer';
    photo.addEventListener('click', function () {
      clickCount++;
      if (clickCount === 1) {
        clickTimer = setTimeout(function () { clickCount = 0; }, 600);
      }
      if (clickCount >= 3) {
        clearTimeout(clickTimer);
        clickCount = 0;
        if (!photoClicks.found) {
          photoClicks.found = true;
          surpriseFound('Gravity!');
        }
        // Photos fall then reset — on mobile only drop visible ones
        var photos = document.querySelectorAll('.activity-photo');
        var visiblePhotos = [];
        photos.forEach(function (p) {
          if (isMobile) {
            var rect = p.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) visiblePhotos.push(p);
          } else {
            visiblePhotos.push(p);
          }
        });
        visiblePhotos.forEach(function (p, i) {
          setTimeout(function () {
            p.classList.add('gravity-drop');
          }, i * 80);
        });
        setTimeout(function () {
          visiblePhotos.forEach(function (p) {
            p.classList.remove('gravity-drop');
            p.style.transform = '';
          });
        }, 2500);
      }
    });
  });

  // --- BONUS: Click "for real" → skull rain (frfr egg) ---
  var forReal = document.querySelector('.for-real');
  if (forReal) {
    forReal.style.cursor = 'pointer';
    var frFound = false;
    forReal.addEventListener('click', function () {
      // Launch skull rain
      var skulls = ['💀', '☠️', '💀', '🗿', '💀'];
      var count = isMobile ? 20 : 40;
      for (var i = 0; i < count; i++) {
        var skull = document.createElement('div');
        skull.className = 'skull-piece';
        skull.textContent = skulls[Math.floor(Math.random() * skulls.length)];
        skull.style.left = Math.random() * 100 + 'vw';
        skull.style.top = '-40px';
        skull.style.fontSize = (Math.random() * 1.5 + 1) + 'rem';
        document.body.appendChild(skull);
        (function (el, delay) {
          var duration = 2000 + Math.random() * 2000;
          var start = null;
          var drift = (Math.random() - 0.5) * 30;
          var x = parseFloat(el.style.left);
          setTimeout(function () {
            function fall(ts) {
              if (!start) start = ts;
              var progress = (ts - start) / duration;
              if (progress >= 1) { el.remove(); return; }
              var y = progress * window.innerHeight * 1.2;
              var wobble = Math.sin(progress * 8) * 20;
              el.style.top = y + 'px';
              el.style.left = (x + drift * progress + wobble) + 'px';
              el.style.opacity = 1 - progress * 0.3;
              el.style.transform = 'rotate(' + progress * 540 + 'deg)';
              requestAnimationFrame(fall);
            }
            requestAnimationFrame(fall);
          }, delay);
        })(skull, Math.random() * 600);
      }
      // Toast
      var toast = document.createElement('div');
      toast.className = 'surprise-toast surprise-mega';
      toast.innerHTML = '<strong>no cap detected 💀</strong>';
      document.body.appendChild(toast);
      requestAnimationFrame(function () { toast.classList.add('show'); });
      setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () { toast.remove(); }, 400);
      }, 3000);
      if (!frFound) { frFound = true; surpriseFound('frfr!'); }
    });
  }

  // ===== BRAINROT MODE =====
  (function () {
    var active = false;
    var typed = '';
    var secret = 'triffid';

    // Activate via ?vibe=check in the URL
    if (window.location.search.indexOf('vibe=check') !== -1) {
      sessionStorage.setItem('brainrot', '1');
      setTimeout(function () { activateBrainrot(); }, 1000);
    }

    // Persist across pages via sessionStorage
    if (sessionStorage.getItem('brainrot') === '1') {
      setTimeout(function () { activateBrainrot(); }, 500);
    }

    // Desktop: Type "triffid" anywhere on the page to toggle
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      typed += e.key.toLowerCase();
      if (typed.length > secret.length) {
        typed = typed.slice(-secret.length);
      }
      if (typed === secret) {
        typed = '';
        if (active) {
          sessionStorage.removeItem('brainrot');
          window.location.reload();
        } else {
          sessionStorage.setItem('brainrot', '1');
          activateBrainrot();
        }
      }
    });

    // Mobile: Tap the final clue 3 times
    var finalClue = document.getElementById('clue4');
    if (finalClue) {
      var taps = 0;
      var tapTimer = null;
      finalClue.addEventListener('click', function (e) {
        if (active) return;
        e.preventDefault();
        taps++;
        if (taps === 1) {
          tapTimer = setTimeout(function () { taps = 0; }, 1500);
          finalClue.style.color = 'rgba(255,255,255,0.15)';
        }
        if (taps === 2) {
          finalClue.style.color = 'rgba(255,255,255,0.3)';
        }
        if (taps >= 3) {
          clearTimeout(tapTimer);
          taps = 0;
          sessionStorage.setItem('brainrot', '1');
          activateBrainrot();
        }
      });
    }

    function activateBrainrot() {
      active = true;
      document.body.classList.add('brainrot');

      var swaps = [
        // Hero (homepage)
        ['Explorer Scouts in Ludlow', 'The Most Goated Unit in Ludlow'],
        ['Adventure, Teamwork & Memories That', 'No Cap, This Unit Is Literally'],
        ['Last', 'Peak'],
        ['who love getting outdoors', 'who actually touch grass'],
        ['camping, hiking, kayaking, and giving back to the community', 'camping, hiking, kayaking, and serving main character energy for the community'],
        ['Join the Adventure', 'Bet. Slide In'],
        ['Duke of Edinburgh', 'Duke of Edinbruh'],
        ['Find Out More', 'Show Me the Vibes'],

        // Hero (join page)
        ['Looking for Things to Do in', 'Nothing to Do in'],
        ['bored of the same old routine, we get it', 'bored of the same old routine, same'],
        ['not just sitting around', 'not just doomscrolling'],
        ['See What We Do', 'Peep the Vibes'],
        ['How to Join', 'How to Lock In'],

        // Hero (dofe page)
        ['Done the', 'Done the'],
        ['Proper', 'Sigma'],
        ['Real hiking. Real camping. Real adventure.', 'Real hiking. Real camping. Real main character energy.'],
        ['cheaper than school and done the way it should be', 'cheaper than school and actually bussin'],
        ['Start Your DofE', 'Unlock Your DofE Arc'],
        ['Why Choose Us?', 'Why We\'re Built Different'],

        // Info bar
        ['Mondays', 'Monday Vibes'],
        ['Ages', 'Slay Ages'],
        ['Ludlow Scout Hut', 'The Hut (IYKYK)'],

        // Activities
        ['What We Get Up To', 'The Vibes We Serve'],
        ['never a dull Monday', 'never a flop Monday'],
        ['Hiking, Cycling & Expeditions', 'Touching Grass (Literally)'],
        ['Camping & Bushcraft', 'Living Our Best Feral Era'],
        ['Kayaking & Water Sports', 'Aqua Rizz'],
        ['Community Service', 'Main Character Energy for Ludlow'],
        ['for real', 'fr fr no cap'],
        ['Wide Games & Evenings', 'Goated Evening Activities'],
        ['Big Days Out & More', 'Absolute Bangers'],
        ['Go-karting, rock climbing, paintballing, the Monopoly Run in London', 'Go-karting, rock climbing, paintballing, the Monopoly Run in London (we ate)'],
        ['Our Explorers pick what they want to do each term', 'Our Explorers run the meta each term'],

        // What We Actually Do (join page)
        ['What We Actually Do', 'What We Actually Do (It Slaps)'],
        ['you pick what we do each term', 'you run the meta each term'],
        ['We ask what you want, and we make it happen', 'You say the word, we make it happen. No cap'],
        ['You\'ll get wet. That\'s the point.', 'You\'ll get wet. That\'s the whole vibe.'],
        ['sleeping under the stars (or clouds', 'sleeping under the stars (or clouds'],
        ['Helmets on, chalk up, and send it.', 'Helmets on, chalk up, and absolutely send it.'],
        ['we fit in as many bigger activities as we can', 'we fit in as many bangers as we can'],
        ['even more fun', 'even more W\'s'],
        ['Stage 4 Emergency Aid training', 'Stage 4 Emergency Aid training (we ate that)'],
        ['The evening sessions hit different.', 'The evening sessions hit different fr fr.'],
        ['thousands of Explorers racing around the city', 'thousands of Explorers speedrunning London'],
        ['It\'s chaos. It\'s brilliant.', 'It\'s chaos. It\'s peak. It\'s giving main character.'],

        // Why Bother (join page)
        ['Why Bother?', 'Why Should You Even Care?'],
        ['Honestly? Because it\'s fun. But also:', 'Honestly? Because it slaps. But also:'],
        ['You choose what we do', 'You literally run the programme'],
        ['If you want go-karting, we\'ll sort go-karting', 'If you want go-karting, say less'],
        ['Our leaders won the Leaders\' League in 2025', 'Our leaders won the Leaders\' League in 2025 (they\'re lowkey cracked)'],
        ['very competitive about defending the title', 'very competitive about defending the title (it\'s giving obsession)'],
        ['Stuff that\'s useful in real life.', 'Stuff that\'s useful IRL.'],
        ['you\'ll meet people from different schools', 'you\'ll meet people from different schools'],
        ['It looks great on a CV', 'It looks great on a CV (trust)'],
        ['Teamwork, initiative, resilience', 'Teamwork, initiative, resilience'],
        ['gaming nights on the projector, wide games in the woods', 'gaming nights on the projector (bussin), wide games in the woods'],
        ['Monday evenings sorted', 'Monday evenings are lowkey the best part of the week'],

        // Not What You Think (join page)
        ['Not What You Think', 'It\'s Not What You Think Bestie'],
        ['If you think Scouts is just for little kids, think again.', 'If you think Scouts is just for little kids, you\'re getting an L on that one.'],
        ['Turns out it\'s the best thing I do all week.', 'Turns out it\'s lowkey the best thing I do all week. No cap.'],
        ['it\'s not Cubs', 'it\'s not Cubs era'],
        ['You\'ll pick it up fast.', 'You\'ll pick it up fast. Trust the process.'],
        ['Neither did half the people who are here now.', 'Neither did half the people who are here now. Everyone was the new kid once.'],
        ['It takes about one session to feel like part of the group.', 'It takes about one session to catch the vibe.'],
        ['Everyone\'s in the same boat', 'Everyone\'s in the same boat'],

        // About
        ['Why Triffid Explorers?', 'Why We\'re Lowkey Goated'],
        ['we believe in proper outdoor adventure', 'we believe in absolutely sending it outdoors'],
        ['carry your own pack, cook your own food, and earn every mile', 'carry your own pack, cook your own food, and stack W\'s every mile'],
        ['push boundaries, and have a brilliant time', 'push boundaries, and have the most goated time'],
        ['Get in Touch', 'Slide Into Our DMs'],
        ['Not sure if we\'re your nearest group?', 'Not sure if we\'re your nearest group?'],

        // Meet the Leaders
        ['Meet the Leaders', 'Meet the Legends'],
        ['Your young person is in experienced, committed hands.', 'Your young person is in lowkey legendary hands.'],
        ['Explorer Scout Leader', 'Explorer Scout Legend'],
        ['In Scouting for over 29 years', 'In Scouting for over 29 years (OG status)'],
        ['Over 30 years in Scouting', 'Over 30 years in Scouting (absolute veteran)'],
        ['Reigning Monopoly Run Leaders\' League champion', 'Reigning Monopoly Run champion (built different)'],
        ['very competitive about defending it', 'lowkey obsessed with defending it'],

        // Programme
        ['Our Programme', 'The Lore'],
        ['See what\'s coming up', 'Peep what\'s dropping'],
        ['Our live calendar is kept up to date', 'The lore is always up to date'],

        // News
        ['Latest News', 'Fresh Tea'],

        // Social / Gallery
        ['Latest Adventures', 'Recent W\'s'],
        ['Fresh from our social media', 'Fresh drops from our socials'],

        // CTA
        ['Ready for an Adventure?', 'You Tryna Join or Nah?'],
        ['there\'s a place for you', 'there\'s a vibe for you'],
        ['no commitment, just come and see what we\'re about', 'no cap, just come vibe and see if we pass the vibe check'],
        ['Email Us', 'Slide Into Our Inbox'],
        ['Turn up on a Monday at 7pm. That\'s it.', 'Just turn up on a Monday at 7pm. That\'s literally it.'],
        ['Info for Parents', 'Lore for the Parentals'],

        // Parents
        ['Information for Parents', 'Lore Drop for the Parentals'],
        ['Everything you need to know', 'Here\'s the tea on everything'],
        ['What is Explorer Scouts?', 'What Even Is Explorer Scouts?'],
        ['Looking for activities for teenagers in Ludlow? This is it.', 'Looking for activities for teenagers in Ludlow? You found it. W.'],
        ['What to expect', 'The Vibes to Expect'],
        ['How to join', 'How to Lock In'],
        ['no need to book, just turn up', 'no need to book, just rock up'],
        ['no pressure', 'zero pressure, we promise'],
        ['they\'re part of the team', 'they\'re locked in. Let\'s go.'],
        ['Safeguarding', 'Safeguarding (Serious Bit)'],
        ['Frequently Asked Questions', 'FAQs (The Tea)'],
        ['Do they need to have been in Scouts before?', 'Do they need to have been in Scouts before?'],
        ['Not at all!', 'Nope!'],
        ['Everyone is welcome regardless of experience.', 'Everyone is welcome. Zero gatekeeping.'],
        ['Is it safe?', 'Is it safe tho?'],
        ['Absolutely.', 'Absolutely. 100%.'],
        ['nearly 60 years of combined Scouting experience', 'nearly 60 years of combined Scouting experience (they\'re actual legends)'],

        // Testimonials
        ['What People Say', 'What the People Say'],
        ['Hear from our Explorers and their parents.', 'The reviews are in.'],
        ['Got something to say about Triffid Explorers?', 'Got opinions? We love that.'],
        ['Send us a few words', 'Drop us your hot take'],

        // DofE page specifics
        ['Why Do DofE With Us Instead of School?', 'Why We Clear School at DofE'],
        ['There\'s a big difference between doing DofE properly and just ticking boxes.', 'There\'s a big difference between actually doing DofE and just ticking boxes. Let us cook.'],
        ['DofE Levels at a Glance', 'DofE Levels (Choose Your Difficulty)'],
        ['Start at Bronze and progress through Silver to Gold', 'Start at Bronze (tutorial mode) and work up to Gold (final boss)'],
        ['The perfect introduction.', 'Tutorial mode. You got this.'],
        ['A real step up.', 'Difficulty: Medium. You\'ll surprise yourself.'],
        ['The ultimate challenge.', 'Final boss energy.'],
        ['Start Bronze', 'Begin the Grind'],
        ['Start Silver', 'Level Up'],
        ['Start Gold', 'Go Full Legend'],
        ['DofE Frequently Asked Questions', 'DofE FAQs (All the Tea)'],
        ['Start Your DofE Journey', 'Start Your DofE Arc'],
        ['Don\'t wait for school to sort it out.', 'Don\'t wait for school to sort it out. Be the main character.'],
        ['leaders who do it properly', 'leaders who are actually built for this'],
        ['Email Us About DofE', 'Slide In About DofE'],
        ['schools typically charge', 'schools typically charge (big oof)'],
        ['a better experience for a fraction of the price', 'a better experience for a fraction of the price. We\'re literally unmatched'],
        ['That\'s not a typo.', 'That\'s not a typo. We just move different.'],

        // Footer
        ['Adventure, teamwork, and memories that last', 'No cap, straight vibes and W\'s only'],
        ['Quick Links', 'Quick Links (Speedrun)'],
        ['Contact Us', 'Slide In'],
        ['Website by', 'Website crafted by'],

        // === MOVING UP page ===
        ['Read This First', 'Read This Bit First'],
        ['Scouts is starting to feel a bit small for you', 'Scouts is starting to feel mid'],
        ['here\'s the honest pitch', 'here\'s the unfiltered pitch'],
        ['And you decide what we actually do.', 'And you literally run the programme.'],
        ['The Honest Pitch', 'The Real Talk'],
        ['The Three Things That Matter', 'The Three Things That Slap'],
        ['If you\'re going to read anything on this page, read these.', 'If you read literally anything on this page, read these three.'],
        ['Same hut. Zero clash.', 'Same hut. Zero clash. Easy.'],
        ['Plenty of our members did both for ages before deciding.', 'Plenty of our lot did both for ages before deciding.'],
        ['It\'s literally your programme.', 'It\'s literally YOUR programme. Built different.'],
        ['Heard a Few Things About Us?', 'Heard the Tea About Us?'],
        ['we\'re a loud bunch', 'we\'re a loud bunch fr'],
        ['The hut is still standing.', 'The hut is somehow still standing.'],
        ['if you\'re someone who wants a bit more energy and a bit more freedom', 'if you want main character energy and freedom'],
        ['You\'ll know in twenty minutes.', 'You\'ll catch the vibe in twenty minutes.'],
        ['But I won\'t know anyone.', 'But I won\'t know anyone bestie.'],
        ['Neither did most of us at first.', 'Neither did most of us at first. We got u.'],
        ['you\'ll find your people', 'you\'ll find your people fr'],
        ['Won\'t I be the youngest?', 'Won\'t I be the youngest tho?'],
        ['Briefly, yeah.', 'Briefly fr.'],
        ['Most stick it right through to 18, and a good few stay mates for life after that.', 'Most stick it right through to 18, and loads stay mates for life after. Forever bond.'],
        ['What if I hate it?', 'What if I hate it tho?'],
        ['No awkward conversation needed.', 'Zero awkward conversation needed.'],
        ['What about Scouts?', 'What about Scouts tho?'],
        ['It\'s not either/or.', 'It\'s not either/or. You can stack both.'],
        ['Don\'t take our word for it', 'Don\'t take our word for it bestie'],
        ['have a look at the live programme', 'peep the live programme'],
        ['Some recent and upcoming flavour', 'Some recent W\'s and upcoming bangers'],
        ['Real rock, not a leisure-centre wall. Helmets on, chalk up, send it.', 'Real rock, not some leisure-centre wall. Helmets on, chalk up, absolutely send it.'],
        ['Real camping, cook your own food, sleep under the stars', 'Real camping, cook your own food, sleep under the stars (peak)'],
        ['Big Days Out', 'Big Days Out (Bangers)'],
        ['daft stuff that ends up being the best bits', 'daft stuff that ends up being the best bits fr'],
        ['Skills That Stick', 'Skills That Actually Stick'],
        ['You Drive the Programme', 'You\'re Literally the DM'],
        ['This is the bit that makes Explorers different.', 'This is the bit that makes Explorers built different.'],
        ['If we can sort it, we sort it.', 'If we can make it happen, we make it happen.'],
        ['You\'re shaping it.', 'You\'re shaping it. Real one.'],
        ['that\'s a feature not a bug', 'that\'s a feature not a bug fr fr'],
        ['if your young person has handed you their phone', 'if your young person has handed you their phone for this'],
        ['How to Come Try It', 'How to Pull Up'],
        ['Got a mate who isn\'t in Scouts and might be into this?', 'Got a mate who isn\'t in Scouts and might catch the vibe?'],

        // === BRING A MATE page ===
        ['Won\'t lie', 'Won\'t lie bestie'],
        ['But pretty much everyone who tries it ends up staying.', 'But pretty much everyone who tries it ends up locked in.'],
        ['You get three Mondays free to make your mind up.', 'Three Mondays free to make your mind up.'],
        ['Have a quick look. Then decide whose opinion actually matters.', 'Peep this. Then decide whose opinion actually matters.'],
        ['Already in Scouts?', 'Already in Scouts bestie?'],
        ['The Honest Version', 'The Real Talk Version'],
        ['No PowerPoint, no', 'No PowerPoint, no cringe'],
        ['Three things you actually care about.', 'Three things you actually care about fr.'],
        ['Explorers isn\'t school', 'Explorers Isn\'t School (Different Vibe)'],
        ['It\'s two hours on a Monday night.', 'Just two hours on a Monday night.'],
        ['Not a school club, not on any school radar', 'Not a school club, not on any school radar fr'],
        ['a different group of people, doing actual outdoor stuff, on your own time', 'a different group of people, doing actual outdoor stuff, on your own time fr'],
        ['Three Mondays free', 'Three Mondays Free (No Cap)'],
        ['Three sessions, no money, no sign-up, no awkward chat.', 'Three sessions, no money, no sign-up, zero awkward chat.'],
        ['Turn up, see what it is, walk away at any point if you don\'t fancy it.', 'Pull up, see what it is, dip at any point if you\'re not feeling it.'],
        ['Every term we ask the Explorers what they want to do', 'Every term we ask the Explorers what they want'],
        ['we build the programme around it', 'we build the programme around it. Say less.'],
        ['all from our own lot', 'all from our own lot fr'],
        ['Full kit, full day, full body bruises.', 'Full kit, full day, full body bruises (worth it).'],
        ['One of the highlights every year.', 'Lowkey one of the highlights every year.'],
        ['On the actual river with a qualified instructor.', 'On the actual river with a qualified instructor (cracked).'],
        ['stay up later than you would at home', 'stay up later than you would at home (peak)'],
        ['Some of the best weekends you\'ll have.', 'Some of the best weekends you\'ll have. Trust.'],
        ['Games in the woods after dark', 'Games in the woods after dark (lowkey terrifying)'],
        ['gaming on the projector at the hut', 'gaming on the projector at the hut (bussin)'],
        ['Big Days & Trips', 'Big Days & Bangers'],
        ['Go-karting, bike rides, the Monopoly Run in London, summer camp.', 'Go-karting, bike rides, the Monopoly Run in London, summer camp. Endless W\'s.'],
        ['See What\'s On This Term', 'Peep This Term\'s Lore'],
        ['But…', 'But Tho…'],
        ['Whatever you\'re about to type, we\'ve heard it.', 'Whatever you\'re about to type, we\'ve heard it bestie.'],
        ['Then they came once.', 'Then they came once. Now look.'],
        ['Isn\'t this for kids?', 'Isn\'t this for kids tho?'],
        ['that lasts about as long as it takes to learn names.', 'that lasts about as long as it takes to learn names fr.'],
        ['I\'ve never done Scouts.', 'I\'ve never done Scouts tho.'],
        ['Doesn\'t matter.', 'Doesn\'t matter bestie.'],
        ['Loads of our members never did Cubs or Scouts.', 'Loads of our members never did Cubs or Scouts. Zero gatekeeping.'],
        ['You\'re not behind.', 'You\'re not behind. Trust.'],
        ['My mates will take the mick.', 'My mates will take the mick tho.'],
        ['Maybe for a week.', 'Maybe for a week max.'],
        ['A few of them will ask if they can come too.', 'A few of them will ask if they can pull up too.'],
        ['That\'s how most of us got here.', 'That\'s how most of us got here fr.'],
        ['Do I have to wear a uniform?', 'Do I have to wear a uniform tho?'],
        ['just turn up in normal clothes', 'just rock up in normal clothes'],
        ['Anything I\'d actually put on a CV?', 'Anything I\'d actually put on a CV tho?'],
        ['Yeah, plenty.', 'Yeah, plenty fr.'],
        ['DofE is on every UCAS personal statement that ever got someone into uni', 'DofE is literally on every UCAS personal statement that got someone into uni'],
        ['that doesn\'t go on a CV but you\'ll use the rest of your life', 'that doesn\'t go on a CV but you\'ll use the rest of your life. Trust the process.'],
        ['The Quick Facts', 'The Quick Facts (Receipts)'],
        ['Everything you need in one place', 'Everything you need in one place fr'],
        ['Where members come from', 'Where Members Pull Up From'],
        ['Tell whoever opens the door your mate sent you.', 'Tell whoever opens the door your mate sent you bestie.'],
        ['Leave at 9pm.', 'Dip at 9pm.'],
        ['That\'s the whole ask.', 'That\'s the whole ask fr.'],
        ['Email Us First', 'Slide In First'],
        ['Where to Find Us', 'Where to Pull Up'],

        // === Bring a Mate referral section (homepage) ===
        ['Already an Explorer? Bring a Mate.', 'Already an Explorer? Tag a Mate In.'],
        ['help us grow the unit', 'help us stack the roster'],
        ['You know what we\'re like better than any leader does.', 'You know what we\'re like better than any leader does fr.'],
        ['Send via WhatsApp', 'WhatsApp'],
        ['Send via Text', 'Text'],
        ['Send via Email', 'Email'],
        ['Easier than trying to explain it yourself.', 'Easier than trying to explain it yourself bestie.'],
      ];

      // Walk the DOM and replace text
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      var textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      textNodes.forEach(function (node) {
        var text = node.nodeValue;
        swaps.forEach(function (pair) {
          if (text.indexOf(pair[0]) !== -1) {
            text = text.replace(pair[0], pair[1]);
          }
        });
        node.nodeValue = text;
      });

      // Also swap any matching alt text and button values
      document.querySelectorAll('[alt], [title], [aria-label]').forEach(function (el) {
        ['alt', 'title', 'aria-label'].forEach(function (attr) {
          var val = el.getAttribute(attr);
          if (!val) return;
          swaps.forEach(function (pair) {
            if (val.indexOf(pair[0]) !== -1) {
              el.setAttribute(attr, val.replace(pair[0], pair[1]));
            }
          });
        });
      });

      // Fun CSS tweaks
      var style = document.createElement('style');
      style.textContent = [
        '.brainrot .hero-text h1 .highlight { background: linear-gradient(135deg, #ff006e, #8338ec, #3a86ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: brainrot-glow 2s ease-in-out infinite alternate; }',
        '@keyframes brainrot-glow { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(30deg); } }',
        '.brainrot .activity-card:hover { animation: brainrot-shake 0.3s ease-in-out; }',
        '@keyframes brainrot-shake { 0%,100% { transform: translateY(-4px); } 25% { transform: translateY(-4px) rotate(-2deg); } 75% { transform: translateY(-4px) rotate(2deg); } }',
        '.brainrot .nav-logo span::after { content: " (brainrot mode)"; font-size: 0.6rem; color: #ff006e; vertical-align: super; }',
        '.brainrot .btn-primary { background: linear-gradient(135deg, #ff006e, #8338ec) !important; }',
        '.brainrot .btn-primary:hover { background: linear-gradient(135deg, #8338ec, #ff006e) !important; }',
        '.brainrot .btn-cta-white { background: linear-gradient(135deg, #ff006e, #8338ec) !important; color: white !important; }',
        '.brainrot .info-bar { background: linear-gradient(135deg, #1a1a2e, #2d1b4e) !important; }',
        '.brainrot .cta-section { background: linear-gradient(135deg, #ff006e, #8338ec, #3a86ff) !important; }',
        '.brainrot .section-header h2 { background: linear-gradient(135deg, #ff006e, #8338ec); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; display: inline-block; }',
        '.brainrot .feature-list li::before { background: #ff006e !important; }',
        '.brainrot .dofe-bronze h3 { color: #ff006e !important; }',
        '.brainrot .dofe-silver h3 { color: #8338ec !important; }',
        '.brainrot .dofe-gold h3 { color: #3a86ff !important; }',
        '.brainrot .leader-avatar { background: linear-gradient(135deg, #ff006e, #8338ec) !important; animation: brainrot-spin 3s linear infinite; }',
        '@keyframes brainrot-spin { 0% { box-shadow: 0 0 15px #ff006e; } 33% { box-shadow: 0 0 15px #8338ec; } 66% { box-shadow: 0 0 15px #3a86ff; } 100% { box-shadow: 0 0 15px #ff006e; } }',
        '.brainrot .programme-badge { background: linear-gradient(135deg, #ff006e, #8338ec) !important; }',
        '.brainrot .nav-cta { background: linear-gradient(135deg, #ff006e, #8338ec) !important; }',
        '.brainrot .footer-bottom { font-style: italic; }',
      ].join('\n');
      document.head.appendChild(style);

      // Console flex
      console.log('%c BRAINROT MODE ACTIVATED - no cap fr fr ', 'background: linear-gradient(135deg, #ff006e, #8338ec); color: white; font-size: 16px; padding: 8px 16px; border-radius: 8px;');
    }
  })();

  // ===== LATEST NEWS (pull first post from Curator feed) =====
  var newsContainer = document.getElementById('latest-news');
  if (newsContainer) {
    var curatorCheckCount = 0;
    var curatorInterval = setInterval(function () {
      curatorCheckCount++;
      var posts = document.querySelectorAll('#curator-feed-default-feed-layout .crt-post');
      if (posts.length > 0) {
        clearInterval(curatorInterval);
        var loading = document.getElementById('latest-news-loading');
        if (loading) loading.remove();
        populateLatestNews(posts[0]);
      }
      // After 15 seconds, give up and show the static fallback
      if (curatorCheckCount > 30) {
        clearInterval(curatorInterval);
        var loading = document.getElementById('latest-news-loading');
        if (loading) loading.remove();
        var fallback = document.getElementById('latest-news-fallback');
        if (fallback) fallback.style.display = '';
      }
    }, 500);
  }

  function populateLatestNews(postEl) {
    // Extract image
    var imgEl = postEl.querySelector('.crt-post-content-image img, .crt-grid-post-image img, img');
    var imgSrc = imgEl ? (imgEl.getAttribute('data-src') || imgEl.src) : '';

    // Extract text content
    var textEl = postEl.querySelector('.crt-post-text');
    var postText = textEl ? textEl.textContent.trim() : '';

    // Extract date
    var dateEl = postEl.querySelector('.crt-post-date, .crt-post-date-link');
    var dateText = dateEl ? dateEl.textContent.trim() : '';

    // Extract link to original post
    var linkEl = postEl.querySelector('a[href*="facebook.com"], a[href*="instagram.com"]');
    var postLink = linkEl ? linkEl.href : 'https://www.facebook.com/triffidesu';

    // Only replace if we got text (image optional)
    if (!postText) return;

    // Build the featured news card
    var html = '<div class="two-col">';

    if (imgSrc) {
      html += '<div class="two-col-image">';
      html += '  <img src="' + escapeHtml(imgSrc) + '" alt="Latest post from Triffid Explorers">';
      html += '</div>';
    }

    html += '<div class="two-col-text">';
    if (dateText) {
      html += '<p style="color: var(--grey); font-size: 0.85rem; margin-bottom: 0.5rem;">' + escapeHtml(dateText) + '</p>';
    }
    // Show the full post text, preserving line breaks
    html += '<p style="font-size: 1.05rem; line-height: 1.7; white-space: pre-line;">' + escapeHtml(postText) + '</p>';
    html += '<a href="' + escapeHtml(postLink) + '" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="margin-top: 1rem;">See original post</a>';
    html += '</div>';
    html += '</div>';

    var container = document.getElementById('latest-news');
    if (container) {
      container.innerHTML = html;
    }

    // Hide the first post from the Curator feed so it's not duplicated
    postEl.style.display = 'none';
  }
});

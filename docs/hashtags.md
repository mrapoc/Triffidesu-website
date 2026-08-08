# Getting photos onto the website

**For James.** Short version: post to Instagram exactly as you already do. The
website reads the caption and files the photo in the right place on its own.
There is no admin screen, no login, and nothing for anyone to tick off.

Photos appear on the site within the hour.

---

## The one thing worth knowing

The site looks at the **words in your caption** and works out what the post is
about. It doesn't care whether you use a hashtag or just write the word
normally. All of these put a photo in the kayaking slots:

- `#kayak`
- `Kayaking on the Teme tonight`
- `great night out paddling`

So you don't have to remember a list. If you describe what you did, in normal
words, it usually lands correctly on its own.

## Where things go

| If your caption mentions… | It fills the… |
| --- | --- |
| hike, walk, cycle, bike, ride, expedition | **Hiking & cycling** card and gallery filter |
| camp, camping, campfire, bushcraft, survival, tent | **Camping** card and filter |
| kayak, canoe, paddle, sailing, water, swim, raft | **Kayaking & water** card and filter |
| service, community, remembrance, parade, volunteering, fundraising, silence, reflection, poppy | **Community service** card and filter |
| wide games, games night, hut night, night hike, cooking, crafts, creative, paracord, woggle, cricket, football, sport, quiz, pizza | **Wide games & evenings** card and filter |
| climbing, karting, paintball, Monopoly Run, day out, trip | **Big days out** card and filter |
| DofE, expedition, bronze, silver, gold, navigation | **DofE** strip on the Duke of Edinburgh page |
| first aid, emergency aid, skills, map reading, training | **Skills** cards |

Capital letters don't matter. Plurals don't matter (`tents` works as well as
`tent`). A post can match more than one, which is fine and often right: a camp
where you also went climbing fills both.

These lists were built from your actual captions, not from guesswork. The
Remembrance words are there because you write "two minutes' silence" and "a
quiet moment of reflection" rather than the word "remembrance".

## If a post matches nothing

Nothing breaks. It still shows up in:

- **Latest news** on the homepage, if it's the newest post
- The **What we've been up to lately** strips
- The **gallery**, which shows everything regardless

It just won't fill one of the themed activity cards. If you want it to, add a
word from the table above and the site will pick it up on the next sync.

## The same photo never appears twice

If a post would land in two places on the same page, the site gives it to the
first one and finds something else for the second. You don't need to think
about it.

## Checking where something landed

Add `?tags=check` to the end of any page address, open it, and look at the
browser console (**F12**, then the *Console* tab). You'll get a table of the
last 20 posts and where each one was filed, plus a note of any that matched
nothing.

```
https://www.triffidesu.co.uk/?tags=check
```

Nobody needs this day to day. It's there for when a photo doesn't show up where
you expected and you'd rather know than guess.

## A few things that help

- **Write a real caption.** The words are what does the filing, and they're also
  what search engines and screen readers read. A caption of two emoji tells the
  site nothing.
- **A trailing block of hashtags is fine.** The site strips a wall of tags off
  the end before showing the caption, so tag away for Instagram's benefit.
- **Landscape photos** sit better in the wide cards. Square and portrait are
  fine everywhere else.
- **Carousels are welcome.** A multi-photo post shows as one tile with a stack
  badge, and every slide turns up in the gallery.

## Changing where things go

The word lists live in one place: `TOPICS` near the top of `js/main.js`. Add a
word to a list, or add a whole new topic, and that's the change made. No HTML to
touch. That's a job for Sam, and it's a two-minute one.

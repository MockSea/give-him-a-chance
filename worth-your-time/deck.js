// Part 2: "Is he worth your time?" Loaded before ../app.js, which reads
// everything deck-specific from window.DECK.
(() => {
  // Part 2: "Is he worth your time?" Sherita Janielle's follow-up reel, transcribed.
  // Same shape as part 1's STEPS. Wording of `q`, `why` and `note` is hers from the
  // reel transcript (whisper, checked by ear against the caption); roasts are Moxy's.
  const CREDIT = Object.freeze({
    name: 'Sherita Janielle',
    handle: '@sheritajanielle',
    profile: 'https://www.instagram.com/sheritajanielle/',
    reel: 'https://www.instagram.com/reel/DeSKNONvs7q/',
  });

  const TITLE_HTML = 'Is he worth <em>your time?</em>';
  const TITLE_TEXT = 'Is he worth your time?';
  const LEDE = 'Part two. You gave him a chance. Now let’s see if he earned it.';

  const STEPS = Object.freeze([
    { q: 'Did he ask you out again?', pass: 'yes',
      why: { text: 'We’re not going to be chasing him, okay? He needs to show some interest.', said: true },
      roast: [
        'You’re not in a situationship. You’re in a waiting room.',
        'He had a nice time. Once. Apparently that covers it.',
        'If he wanted to, there’d be a calendar invite by now.',
      ] },
    { q: 'Did any date he mentioned involve a trip?', pass: 'no',
      why: { text: 'We just met him. We can’t be traveling with people we don’t know. That’s going to be a no for me.', said: true },
      roast: [
        'Date two is not a weekend in Tulum.',
        'Nobody needs to see your toiletry bag this early.',
        'That’s not romance. That’s skipping the part where you get to know him.',
      ] },
    { q: 'Does he text first?', pass: 'yes',
      rescue: {
        q: 'Have you been the one texting first every time?', pass: 'yes',
        note: 'Then let’s scale it back, and see if he’s worth your time.',
      },
      why: { text: 'You gave him a chance to text first and he still doesn’t? It’s a no.', said: true },
      roast: [
        'His phone works. His thumbs are just busy elsewhere.',
        'You’ve been carrying this conversation like a group project.',
        'Texting back is not the same as texting.',
      ] },
    { q: 'Does he ask about you?', pass: 'yes',
      rescue: {
        q: 'Does he remember what you say?', pass: 'yes',
        note: 'If he remembers, that means he’s listening.',
      },
      why: { text: 'If he’s not asking or remembering, it’s going to be a no for me. He’s not worth your time.', said: true },
      roast: [
        'You know his whole childhood. He knows your name. Probably.',
        'That wasn’t a date. It was a podcast with one guest.',
        'He listened like it was a terms-of-service page.',
      ] },
    { q: 'Is he consistent week to week?', pass: 'yes',
      rescue: {
        q: 'Did he explain why?', pass: 'yes',
        note: 'Maybe his dog’s sick. Maybe his great aunt died. You never know what’s going on in a man’s life.',
      },
      why: { text: 'Not consistent, and he didn’t explain. It’s a no for me.', said: true },
      roast: [
        'Hot Tuesday, cold Friday. He’s not a man, he’s weather.',
        'His great aunt has died four times this year.',
        'Consistency is the bare minimum, and he’s under it.',
      ] },
    { q: 'Does he keep his word?', pass: 'yes',
      rescue: {
        q: 'Did he apologize with a gift?', pass: 'yes',
        note: 'Because that does make the situation better.',
      },
      why: { text: 'Not keeping his word, not bringing gifts? It’s gonna be a no for me, okay?', said: true },
      roast: [
        '“I’ll call you tomorrow” is doing a lot of work for a man who didn’t.',
        'No follow-through and no flowers. Bold strategy.',
        'A sorry with no gift is just a text.',
      ] },
    { q: 'Does he respect your boundaries?', pass: 'yes',
      why: { text: 'Honestly, there’s no qualifying there. If he does not, it’s a no for me.', said: true },
      roast: [
        'If “no” is an opening offer to him, he’s out.',
        'This question has no rescue. Neither does he.',
        'Boundaries aren’t a negotiation. Bye.',
      ] },
  ]);

  const YES_LINE = 'If he’s done all of this, we can continue. This man is worth your time.';

  const YES_ROASTS = Object.freeze([
    'Worth your time. Still make him plan date four.',
    'He passed all seven. Screenshot this before he ruins it.',
    'Fine. Tell the group chat he’s allowed back in.',
  ]);

  const VERDICT = Object.freeze({ NO: 'Not worth your time', YES: 'Worth your time' });

  // On the credit line: which part this is, and the way back to part 1.
  const SERIES = Object.freeze({ label: 'Part 2', prev: Object.freeze({ href: '../give-him-a-chance/', text: 'start with part 1' }) });

  window.DECK = Object.freeze({ CREDIT, TITLE_HTML, TITLE_TEXT, LEDE, STEPS, YES_LINE, YES_ROASTS, VERDICT, SERIES });
})();

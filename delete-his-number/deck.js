// Part 3: "Should you delete his number before November?" Loaded before
// ../app.js, which reads everything deck-specific from window.DECK.
(() => {
  // Sherita Janielle's cuffing-season reel, transcribed. Same shape as parts 1
  // and 2. `q` is the board's wording with its spelling fixed; `why` and `note`
  // are hers from the narration (whisper, checked against the burned-in
  // captions); roasts are Moxy's.
  //
  // Her board has no passing endpoint: every branch, including a yes on the
  // last question, runs into "It's a 'NO' for me". So the last step has
  // `pass: null` (both answers lose) and a reason per answer in `whyIf`.
  const CREDIT = Object.freeze({
    name: 'Sherita Janielle',
    handle: '@sheritajanielle',
    profile: 'https://www.instagram.com/sheritajanielle/',
    reel: 'https://www.instagram.com/reel/DehulYnvT7W/',
  });

  const TITLE_HTML = 'Should you delete his number <em>before November?</em>';
  const TITLE_TEXT = 'Should you delete his number before November?';
  const LEDE = 'Part three. Cuffing season is almost here.';

  const STEPS = Object.freeze([
    { q: 'Does it take longer than 24 hours for him to respond?', pass: 'no',
      why: { text: 'If that is a yes, it’s a no for me. Delete his number.', said: true },
      roast: [
        'He replies like he’s paying per text.',
        'Twenty-four hours is a shipping estimate, not a reply time.',
        'He saw it. He’s letting it marinate. You’re the marinade.',
      ] },
    { q: 'Do you have to scroll for a while to find your conversation?', pass: 'no',
      note: 'That means that you all don’t talk that much, okay? So he should be able to be found very quickly.',
      rescue: {
        q: 'Do you text everybody and their mama?', pass: 'yes',
      },
      why: { text: 'Now, if that is a no, then it’s going to be a no for me. That means that you all don’t talk that much, okay? So he should be able to be found very quickly.', said: true },
      roast: [
        'He’s below the dentist and a 2-for-1 pizza code.',
        'If you need the search bar to find him, he’s already archived.',
        'Your pharmacy texts you more consistently.',
      ] },
    { q: 'Can you say aloud what he’s saved as in your phone?', pass: 'yes',
      note: 'We all know that the name is not his name. But would you be comfortable saying that name or whatever it’s saved in out loud?',
      rescue: {
        q: 'Is it at least a word, and not just emojis?', pass: 'yes',
      },
      why: { text: 'Now, if that’s a no, then it’s going to be a no for me. Delete his number.', said: true },
      roast: [
        'If he’s saved as three eggplants and a warning sign, you already know.',
        'He’s not a contact, he’s a content warning.',
        'He’s saved as a vibe. Vibes don’t get November.',
      ] },
    { q: 'After you all hang out, are you happy you went?', pass: 'yes',
      note: 'Or do you wish you was at home? Or could you have been someplace else?',
      rescue: {
        q: 'Did he at least take you somewhere you wanted to go?', pass: 'yes',
        note: 'But if he at least took you where you asked, then, you know, sometimes the vibe is off. I’m going to give him that, okay?',
      },
      why: { text: 'If that is a no, then it’s going to be a no for me.', said: true },
      roast: [
        'You left your couch for his couch. Bad trade.',
        'You spent the whole date planning your Uber home.',
        'He picked the place and you still wanted to leave. Two strikes in one night.',
      ] },
    { q: 'Has he met your friends?', pass: 'yes',
      note: 'What you hiding, girl?',
      rescue: {
        q: 'Have you met his friends?', pass: 'yes',
      },
      why: { text: 'If that’s a no, what are we doing? Are you embarrassed? Just saying. If these are a no, then it’s going to be a no for me.', said: true },
      roast: [
        'Nobody’s met anybody. That’s not dating, that’s witness protection.',
        'Your friends think he’s a rumor.',
        'He has friends, allegedly. Like his job, allegedly.',
      ] },
    { q: 'Would you want a relationship with him, if he acted right?', pass: null,
      note: 'I’m going to keep this simple. Only one more question.',
      why: { text: 'Now, clearly, if that’s a no, it’s going to be a no for me.', said: true },
      whyIf: Object.freeze({
        yes: { text: 'However, if that’s a yes, then it’s still going to be a no for me because this man is acting how he wants to act and he’s not going to act any better. So wanting a relationship is not going to take y’all any further. We’re going to go ahead and delete his number.', said: true },
      }),
      roast: [
        '“If he acted right” is doing all the heavy lifting.',
        'You’re in love with a trailer for a movie that’s never coming out.',
        'There was never a yes on this board. Delete it.',
      ] },
  ]);

  // Unreachable on her board (see above). The engine still reads these.
  const YES_LINE = 'If he survived all of this, keep his number. For now.';

  const YES_ROASTS = Object.freeze([
    'He made it to November. Don’t get comfortable.',
    'Number stays. Rename the contact, though.',
    'Fine. He’s cuffed until further notice.',
  ]);

  const VERDICT = Object.freeze({ NO: 'Delete his number', YES: 'Keep his number' });

  // On the credit line: which part this is, and the way back to part 1.
  const SERIES = Object.freeze({ label: 'Part 3', prev: Object.freeze({ href: '../give-him-a-chance/', text: 'start with part 1' }) });

  window.DECK = Object.freeze({ CREDIT, TITLE_HTML, TITLE_TEXT, LEDE, STEPS, YES_LINE, YES_ROASTS, VERDICT, SERIES });
})();

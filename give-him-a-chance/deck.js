// Part 1: "Should you give this man a chance?" Loaded before ../app.js, which
// reads everything deck-specific from window.DECK.
(() => {
  // Sherita Janielle's whiteboard, transcribed. Wording is hers; question marks
  // added where the board drops them. Each main question can carry one rescue
  // question that runs when the main answer fails.
  const CREDIT = Object.freeze({
    name: 'Sherita Janielle',
    handle: '@sheritajanielle',
    profile: 'https://www.instagram.com/sheritajanielle/',
    reel: 'https://www.instagram.com/reel/DeKs-qdvu4l/',
  });

  // `why` is what she says when he fails that step. `said: true` means her words
  // from the reel transcript, near verbatim; otherwise it is a line built from
  // the board for a step where she doesn't give a reason out loud.
  // `roast` is Moxy's line for the same step, one picked at random per verdict.
  const STEPS = Object.freeze([
    { q: 'Are you attracted to him?', pass: 'yes',
      why: { text: 'We want to be attracted.', said: true },
      roast: [
        'You can\'t manifest chemistry. You tried. We all saw.',
        '"He\'s nice on paper" is how you end up living on paper.',
        'Respectfully, he\'s a coworker now.',
      ] },
    { q: 'Is he the hottest man you have ever seen?', pass: 'no',
      why: { text: 'It’s going to lead you to heartbreak. He don’t have to be the hottest guy in the world, okay?', said: true },
      roast: [
        'That face has a waitlist and you\'re not first on it.',
        'Men that pretty already have a girlfriend. It\'s the mirror.',
        'He\'s already been told he\'s perfect. By several people. This week.',
      ] },
    { q: 'Did he plan the date?', pass: 'yes',
      rescue: { q: 'Did he ask for your input?', pass: 'yes' },
      why: { text: 'He just had you plan the whole thing? That’s going to go ahead and be a no for me, okay?', said: true },
      roast: [
        'You didn\'t go on a date. You ran an event.',
        'He showed up like a plus-one to his own date.',
        'Congrats on your new unpaid role as his travel agent.',
      ] },
    { q: 'Did he pay the check?', pass: 'yes',
      rescue: { q: 'Did he offer?', pass: 'yes' },
      why: { text: 'Some of you women, you have a problem with people paying for stuff. Fine. But he didn’t even offer.', said: false },
      roast: [
        'The check came and so did his sudden interest in his phone.',
        'He reached for his wallet the way people reach for the gym.',
        'Splitting is fine. Not seeing the check is a lifestyle.',
      ] },
    { q: 'Did he make you laugh?', pass: 'yes',
      rescue: { q: 'Was he nice to the wait staff?', pass: 'yes' },
      why: { text: 'Not making you laugh is okay. Not being nice to the waitstaff? That is a hard no.', said: true },
      roast: [
        'Boring and mean to the server. A two-for-one nobody ordered.',
        'How he treats the waiter is the trailer. The trailer was bad.',
        'He didn\'t make you laugh, but he did make the server sigh.',
      ] },
    { q: 'Is he employed?', pass: 'yes',
      rescue: { q: 'Did he just sell his tech company?', pass: 'yes' },
      why: { text: 'No job, and he did not just sell a tech company. That’s a no for me, okay?', said: false },
      roast: [
        '"Between opportunities" since the Obama administration.',
        'His startup is a podcast with zero episodes.',
        'The only thing he\'s acquired is your Netflix password.',
      ] },
    { q: 'Did he text you after the date?', pass: 'yes',
      rescue: { q: 'Did he call?', pass: 'yes' },
      why: { text: 'If he did neither of those, then it’s going to go ahead and be a no for me.', said: true },
      roast: [
        'He\'s not busy. His phone works. You know this.',
        'Radio silence isn\'t mysterious. It\'s information.',
        'He\'ll text in three weeks with "hey stranger". Don\'t.',
      ] },
    {
      q: 'Is he emotionally available?', pass: 'yes',
      rescue: {
        q: 'Is he in therapy?', pass: 'yes',
      },
      why: { text: 'Not emotionally available, and not in therapy about it. It’s going to go ahead and be a no.', said: false },
      roast: [
        'He\'s not a fixer-upper. He\'s a teardown.',
        'You\'d be his therapist, unpaid, with worse hours.',
        'His emotional range is "idk" to "lol".',
      ],
    },
  ]);

  const YES_LINE = 'If this man has done all this, we are definitely giving him a chance, okay? I’m glad we sorted that out.';

  const YES_ROASTS = Object.freeze([
    'Go. Text the group chat. Then put your phone down.',
    'Rare find. Do not mention the five-year plan on date two.',
    'He passed all eight. Check for a pulse, then a ring.',
  ]);

  const VERDICT = Object.freeze({ NO: "It's a NO for me", YES: 'Give him a chance' });

  const TITLE_HTML = 'Should you give this man <em>a chance?</em>';
  const TITLE_TEXT = 'Should you give this man a chance?';
  const LEDE = 'He’s cute. Allegedly. Let’s see if he survives Sherita’s flowchart.';

  // Shown under the YES verdict.
  const NEXT = Object.freeze({ href: '../worth-your-time/', text: 'Part 2: is he worth your time? →' });

  // On the credit line: which part this is.
  const SERIES = Object.freeze({ label: 'Part 1' });

  window.DECK = Object.freeze({ CREDIT, TITLE_HTML, TITLE_TEXT, LEDE, STEPS, YES_LINE, YES_ROASTS, VERDICT, NEXT, SERIES });
})();

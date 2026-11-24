import { describe, expect, it } from 'vitest';
import {
  NARRATION_DRAG_START_PX,
  NARRATION_SWIPE_MIN_PX,
  classifyNarrationSwipe,
  firstRangeStartingIn,
  isNarrationDrag,
  narratedRangeAt,
} from '@/readalong/narration/gestures';

describe('classifyNarrationSwipe', () => {
  it('reads an upward swipe as next sentence and a downward one as previous', () => {
    expect(classifyNarrationSwipe(0, -120)).toBe('next');
    expect(classifyNarrationSwipe(10, 120)).toBe('prev');
  });

  it('reports a horizontal swipe as a page turn', () => {
    expect(classifyNarrationSwipe(-150, 10)).toBe('turn');
    expect(classifyNarrationSwipe(150, -20)).toBe('turn');
  });

  it('ignores short or diagonal movement', () => {
    expect(classifyNarrationSwipe(0, -(NARRATION_SWIPE_MIN_PX - 1))).toBeNull();
    expect(classifyNarrationSwipe(90, -100)).toBeNull();
  });
});

describe('firstRangeStartingIn', () => {
  const setup = () => {
    document.body.innerHTML =
      '<p><span id="a">One carried over.</span> <span id="b">Two.</span></p>' +
      '<p><span id="c">Three.</span> <span id="d">Four.</span></p>';
    const span = (id: string) => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(id)!);
      return range;
    };
    return { span, all: ['a', 'b', 'c', 'd'].map(span) };
  };

  it('skips a sentence carried over from the previous page', () => {
    const { span, all } = setup();
    // The page begins in the middle of sentence "a" and ends inside "c".
    const visible = document.createRange();
    visible.setStart(document.getElementById('a')!.firstChild!, 5);
    visible.setEnd(document.getElementById('c')!.firstChild!, 3);
    const first = firstRangeStartingIn(all, visible);
    expect(first?.toString()).toBe(span('b').toString());
  });

  it('finds the earliest in text order even when listed out of order', () => {
    const { all } = setup();
    const visible = document.createRange();
    visible.selectNodeContents(document.body);
    expect(firstRangeStartingIn([...all].reverse(), visible)?.toString()).toBe('One carried over.');
  });

  it('returns null when no sentence begins on the page', () => {
    const { all } = setup();
    const visible = document.createRange();
    const text = document.getElementById('a')!.firstChild!;
    visible.setStart(text, 2);
    visible.setEnd(text, 8);
    expect(firstRangeStartingIn(all, visible)).toBeNull();
  });

  it('ignores ranges from another document', () => {
    const { all } = setup();
    const other = document.implementation.createHTMLDocument('other');
    other.body.innerHTML = '<p>Elsewhere.</p>';
    const visible = other.createRange();
    visible.selectNodeContents(other.body);
    expect(firstRangeStartingIn(all, visible)).toBeNull();
  });
});

describe('isNarrationDrag', () => {
  it('starts once the touch has moved far enough, mostly vertically', () => {
    expect(isNarrationDrag(0, NARRATION_DRAG_START_PX - 1)).toBe(false);
    expect(isNarrationDrag(0, NARRATION_DRAG_START_PX)).toBe(true);
    expect(isNarrationDrag(0, -NARRATION_DRAG_START_PX)).toBe(true);
    expect(isNarrationDrag(80, 40)).toBe(false);
  });
});

describe('narratedRangeAt (line under the finger)', () => {
  const setup = () => {
    document.body.innerHTML =
      '<p><span id="a">One.</span> <span id="gap">x</span> <span id="b">Two.</span></p>' +
      '<p id="after">After.</p>';
    const sentence = (id: string) => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(id)!);
      return range;
    };
    const pointIn = (id: string, offset = 1) => {
      const range = document.createRange();
      range.setStart(document.getElementById(id)!.firstChild!, offset);
      range.collapse(true);
      return range;
    };
    return { sentences: [sentence('a'), sentence('b')], pointIn };
  };

  it('finds the sentence the finger is on', () => {
    const { sentences, pointIn } = setup();
    expect(narratedRangeAt(sentences, pointIn('a'))).toBe(sentences[0]);
    expect(narratedRangeAt(sentences, pointIn('b'))).toBe(sentences[1]);
  });

  it('between sentences takes the next one, and after the last the last', () => {
    const { sentences, pointIn } = setup();
    expect(narratedRangeAt(sentences, pointIn('gap', 0))).toBe(sentences[1]);
    expect(narratedRangeAt(sentences, pointIn('after'))).toBe(sentences[1]);
  });

  it('returns null with no sentences', () => {
    const { pointIn } = setup();
    expect(narratedRangeAt([], pointIn('a'))).toBeNull();
  });
});

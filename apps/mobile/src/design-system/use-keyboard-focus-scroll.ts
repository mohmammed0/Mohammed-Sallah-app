import { useCallback, useLayoutEffect, useRef } from 'react';
import { Keyboard, Platform, TextInput, type ScrollView } from 'react-native';

export function useKeyboardFocusScroll(enabled: boolean) {
  const scrollRef = useRef<ScrollView>(null);
  const frameRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const reconcile = useCallback(() => {
    cancel();
    if (!enabled || Platform.OS === 'web') return;
    const scroll = scrollRef.current;
    const nativeScroll = scroll?.getNativeScrollRef();
    if (!scroll || !nativeScroll || !Keyboard.isVisible()) return;
    const input = TextInput.State.currentlyFocusedInput();
    if (!input || !nativeScroll.contains(input)) return;
    const generation = generationRef.current;

    // Native focus scrolling can precede the final keyboard-avoiding layout.
    frameRef.current = requestAnimationFrame(() => {
      if (generation !== generationRef.current) return;
      frameRef.current = null;
      if (
        scrollRef.current !== scroll ||
        scroll.getNativeScrollRef() !== nativeScroll ||
        TextInput.State.currentlyFocusedInput() !== input ||
        !Keyboard.isVisible() ||
        !nativeScroll.contains(input)
      )
        return;

      // These synchronous native rectangles share a coordinate system and retain
      // the full input height, unlike accessibility bounds clipped by the keyboard.
      const viewport = nativeScroll.getBoundingClientRect();
      const field = input.getBoundingClientRect();
      if (viewport.height <= 0 || field.height <= 0) return;
      const delta =
        field.height > viewport.height || field.top < viewport.top
          ? field.top - viewport.top
          : Math.max(0, field.bottom - viewport.bottom);
      if (Number.isFinite(delta) && delta !== 0) {
        scroll.scrollTo({ y: Math.max(0, nativeScroll.scrollTop + delta), animated: false });
      }
    });
  }, [cancel, enabled]);

  useLayoutEffect(() => cancel, [cancel, enabled]);

  return {
    ref: scrollRef,
    onFocus: reconcile,
    onLayout: reconcile,
    onKeyboardDidShow: reconcile,
    onKeyboardDidHide: cancel,
    onScrollBeginDrag: cancel,
  };
}

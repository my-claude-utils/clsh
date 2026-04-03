/**
 * Shared keyboard state hook — modifier toggles, flash feedback, touch/mouse handlers,
 * and key repeat (hold-to-repeat for non-modifier keys like backspace, arrows, letters).
 * Used by both MacBookKeyboard and IOSKeyboard.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { keyToEscapeSequence } from '../lib/keyboard';

export interface KeyDef {
  id: string;
  label: string;
  shiftLabel?: string;
  width: number; // multiplier of base width
}

const FLASH_DURATION = 150;
/** Delay before key repeat starts (ms). */
const REPEAT_DELAY = 400;
/** Interval between repeated keystrokes (ms). */
const REPEAT_INTERVAL = 60;

const MODIFIER_IDS = new Set([
  'shift-left', 'shift-right', 'caps', 'ctrl',
  'opt-left', 'opt-right', 'cmd-left', 'cmd-right', 'fn',
]);

export function useKeyboardState({ onKey }: { onKey: (data: string) => void }) {
  const [shiftActive, setShiftActive] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [optActive, setOptActive] = useState(false);
  const [cmdActive, setCmdActive] = useState(false);
  const pressedKeysRef = useRef(new Set<string>());
  const [pressedKeys, setPressedKeys] = useState(new Set<string>());
  const [flashingKeys, setFlashingKeys] = useState(new Set<string>());
  const flashTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Key repeat refs
  const repeatDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isShifted = shiftActive || capsLock;

  const stopRepeat = useCallback(() => {
    if (repeatDelayRef.current) { clearTimeout(repeatDelayRef.current); repeatDelayRef.current = null; }
    if (repeatIntervalRef.current) { clearInterval(repeatIntervalRef.current); repeatIntervalRef.current = null; }
  }, []);

  // Cleanup on unmount
  useEffect(() => stopRepeat, [stopRepeat]);

  const flashKey = useCallback((keyId: string) => {
    const existing = flashTimersRef.current.get(keyId);
    if (existing) clearTimeout(existing);

    setFlashingKeys((prev) => new Set(prev).add(keyId));
    const timer = setTimeout(() => {
      setFlashingKeys((prev) => {
        const next = new Set(prev);
        next.delete(keyId);
        return next;
      });
      flashTimersRef.current.delete(keyId);
    }, FLASH_DURATION);
    flashTimersRef.current.set(keyId, timer);
  }, []);

  const handleKeyDown = useCallback(
    (keyDef: KeyDef) => {
      flashKey(keyDef.id);

      if (keyDef.id === 'shift-left' || keyDef.id === 'shift-right') {
        setShiftActive((prev) => !prev);
        return;
      }
      if (keyDef.id === 'caps') {
        setCapsLock((prev) => !prev);
        return;
      }
      if (keyDef.id === 'ctrl') {
        setCtrlActive((prev) => !prev);
        return;
      }
      if (keyDef.id === 'opt-left' || keyDef.id === 'opt-right') {
        setOptActive((prev) => !prev);
        return;
      }
      if (keyDef.id === 'cmd-left' || keyDef.id === 'cmd-right') {
        setCmdActive((prev) => !prev);
        return;
      }

      const seq = keyToEscapeSequence(keyDef.id, isShifted, ctrlActive);
      if (seq) {
        onKey(seq);
      }

      // Reset sticky modifiers after a keypress (except caps lock)
      if (shiftActive) setShiftActive(false);
      if (ctrlActive) setCtrlActive(false);
      if (optActive) setOptActive(false);
      if (cmdActive) setCmdActive(false);
    },
    [onKey, isShifted, ctrlActive, shiftActive, optActive, cmdActive, flashKey],
  );

  /** Start key repeat for non-modifier keys. Repeats the base (unmodified) sequence. */
  const startRepeat = useCallback(
    (keyDef: KeyDef) => {
      stopRepeat();
      // Compute base escape sequence for repeat (modifiers already applied on initial press)
      const seq = keyToEscapeSequence(keyDef.id, false, false);
      if (!seq) return;
      repeatDelayRef.current = setTimeout(() => {
        repeatIntervalRef.current = setInterval(() => {
          onKey(seq);
        }, REPEAT_INTERVAL);
      }, REPEAT_DELAY);
    },
    [onKey, stopRepeat],
  );

  // Track whether the last interaction was touch to suppress duplicate mouse events
  const isTouchRef = useRef(false);

  const handleTouchStart = useCallback(
    (keyDef: KeyDef) => (e: React.TouchEvent) => {
      e.preventDefault();
      isTouchRef.current = true;
      pressedKeysRef.current.add(keyDef.id);
      setPressedKeys(new Set(pressedKeysRef.current));
      handleKeyDown(keyDef);
      if (!MODIFIER_IDS.has(keyDef.id)) startRepeat(keyDef);
    },
    [handleKeyDown, startRepeat],
  );

  const handleTouchEnd = useCallback(
    (keyDef: KeyDef) => (e: React.TouchEvent) => {
      e.preventDefault();
      pressedKeysRef.current.delete(keyDef.id);
      setPressedKeys(new Set(pressedKeysRef.current));
      stopRepeat();
    },
    [stopRepeat],
  );

  const handleMouseDown = useCallback(
    (keyDef: KeyDef) => (e: React.MouseEvent) => {
      if (isTouchRef.current) { isTouchRef.current = false; return; }
      e.preventDefault();
      pressedKeysRef.current.add(keyDef.id);
      setPressedKeys(new Set(pressedKeysRef.current));
      handleKeyDown(keyDef);
      if (!MODIFIER_IDS.has(keyDef.id)) startRepeat(keyDef);
    },
    [handleKeyDown, startRepeat],
  );

  const handleMouseUp = useCallback(
    (keyDef: KeyDef) => (e: React.MouseEvent) => {
      e.preventDefault();
      pressedKeysRef.current.delete(keyDef.id);
      setPressedKeys(new Set(pressedKeysRef.current));
      stopRepeat();
    },
    [stopRepeat],
  );

  const isModifierActive = (id: string): boolean => {
    if (id === 'shift-left' || id === 'shift-right') return isShifted;
    if (id === 'caps') return capsLock;
    if (id === 'ctrl') return ctrlActive;
    if (id === 'opt-left' || id === 'opt-right') return optActive;
    if (id === 'cmd-left' || id === 'cmd-right') return cmdActive;
    return false;
  };

  return {
    isShifted,
    capsLock,
    pressedKeys,
    flashingKeys,
    isModifierActive,
    handleTouchStart,
    handleTouchEnd,
    handleMouseDown,
    handleMouseUp,
  };
}

import type { KeyDef } from '../hooks/useKeyboardState'

/** Number row shared by MacBook and iOS keyboard layouts (backtick through equals). */
export const NUMBER_ROW: KeyDef[] = [
  { id: '`', label: '`', shiftLabel: '~', width: 1 },
  { id: '1', label: '1', shiftLabel: '!', width: 1 },
  { id: '2', label: '2', shiftLabel: '@', width: 1 },
  { id: '3', label: '3', shiftLabel: '#', width: 1 },
  { id: '4', label: '4', shiftLabel: '$', width: 1 },
  { id: '5', label: '5', shiftLabel: '%', width: 1 },
  { id: '6', label: '6', shiftLabel: '^', width: 1 },
  { id: '7', label: '7', shiftLabel: '&', width: 1 },
  { id: '8', label: '8', shiftLabel: '*', width: 1 },
  { id: '9', label: '9', shiftLabel: '(', width: 1 },
  { id: '0', label: '0', shiftLabel: ')', width: 1 },
  { id: '-', label: '-', shiftLabel: '_', width: 1 },
  { id: '=', label: '=', shiftLabel: '+', width: 1 },
]

import { describe, it, expect } from 'vitest'
import { CostTracker } from '../notifications/cost-tracker.js'

describe('CostTracker', () => {
  it('parses "Total cost: $1.23" format', () => {
    const tracker = new CostTracker()
    expect(tracker.feedLine('Total cost: $1.23')).toBe(true)
    expect(tracker.getCost()).toEqual({ totalCost: 1.23, tokens: null })
  })

  it('parses "Session cost: $0.45" format', () => {
    const tracker = new CostTracker()
    tracker.feedLine('Session cost: $0.45')
    expect(tracker.getCost()?.totalCost).toBe(0.45)
  })

  it('returns null before any cost is detected', () => {
    const tracker = new CostTracker()
    expect(tracker.getCost()).toBeNull()
  })

  it('ratchets up — keeps highest cost seen', () => {
    const tracker = new CostTracker()
    tracker.feedLine('Total cost: $0.50')
    tracker.feedLine('Total cost: $1.00')
    tracker.feedLine('Total cost: $0.75') // lower — ignored
    expect(tracker.getCost()?.totalCost).toBe(1.0)
  })

  it('does NOT false positive on dollar amounts in code', () => {
    const tracker = new CostTracker()
    expect(tracker.feedLine('  const price = $5.00')).toBe(false)
    expect(tracker.feedLine('// The cost: $0 when cached')).toBe(false)
    expect(tracker.feedLine('const totalCost = calculateCost($amount)')).toBe(false)
    expect(tracker.getCost()).toBeNull()
  })

  it('does NOT false positive on code comments with cost', () => {
    const tracker = new CostTracker()
    expect(tracker.feedLine('  // cost: $10.00 per request')).toBe(false)
    expect(tracker.getCost()).toBeNull()
  })

  it('parses token counts', () => {
    const tracker = new CostTracker()
    tracker.feedLine('Total cost: $1.23')
    tracker.feedLine('Total tokens: 5,432')
    expect(tracker.getCost()?.tokens).toBe(5432)
  })

  it('ignores zero-cost lines', () => {
    const tracker = new CostTracker()
    tracker.feedLine('Total cost: $0')
    expect(tracker.getCost()).toBeNull()
  })
})

import type { ServerMessage } from './protocol';

type MessageListener = (msg: ServerMessage) => void;

/**
 * Simple pub/sub message bus for routing WebSocket messages
 * to multiple terminal pane subscribers.
 */
export class MessageBus {
  private listeners = new Set<MessageListener>();

  subscribe(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(msg: ServerMessage): void {
    for (const listener of this.listeners) {
      listener(msg);
    }
  }
}

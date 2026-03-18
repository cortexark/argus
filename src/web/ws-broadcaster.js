/**
 * WebSocket broadcaster for real-time event streaming.
 * Clients connect and receive JSON events as they happen.
 */

/**
 * Create a new broadcaster instance.
 * @returns {{ addClient, removeClient, broadcast, clientCount }}
 */
export function createBroadcaster() {
  const clients = new Set();

  return {
    addClient(socket) {
      clients.add(socket);
    },

    removeClient(socket) {
      clients.delete(socket);
    },

    /**
     * Send a JSON event to all open WebSocket clients.
     * Silently skips clients that are not in OPEN state (readyState === 1).
     * @param {{ type: string, data: object }} event
     */
    broadcast(event) {
      const payload = JSON.stringify(event);
      for (const socket of clients) {
        // WebSocket OPEN state = 1
        if (socket.readyState === 1) {
          try {
            socket.send(payload);
          } catch {
            // Socket threw unexpectedly — remove it and continue
            clients.delete(socket);
          }
        }
      }
    },

    get clientCount() {
      return clients.size;
    },
  };
}

export default { createBroadcaster };

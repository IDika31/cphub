type WSCallback = (data: unknown) => void;

let ws: WebSocket | null = null;
const listeners: Map<string, WSCallback[]> = new Map();

export function connectGraderWebSocket(runId?: string): WebSocket {
  if (ws?.readyState === WebSocket.OPEN) return ws;

  const url = "ws://localhost:3001/api/grader/ws";
  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("[grader-ws] connected");
    if (runId) {
      ws?.send(JSON.stringify({ type: "subscribe", runId }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const type = data.type;
      if (type && listeners.has(type)) {
        listeners.get(type)?.forEach((cb) => cb(data));
      }
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    console.log("[grader-ws] disconnected");
    ws = null;
  };

  return ws;
}

export function subscribeGraderWS(event: string, callback: WSCallback): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, []);
  }
  listeners.get(event)!.push(callback);
  return () => {
    const arr = listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(callback);
      if (idx >= 0) arr.splice(idx, 1);
    }
  };
}

export function disconnectGraderWS(): void {
  ws?.close();
  ws = null;
}

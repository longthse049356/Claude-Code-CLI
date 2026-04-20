type SseEvent = {
  event: string;
  data: string;
};

function parseSseEvent(rawEvent: string): SseEvent | null {
  const normalizedEvent = rawEvent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedEvent.split("\n");
  let event = "message";
  const dataParts: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;

    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataParts.push(line.slice(5).trimStart());
    }
  }

  if (dataParts.length === 0) {
    return null;
  }

  return {
    event,
    data: dataParts.join("\n"),
  };
}

export async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void | Promise<void>,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        const parsed = parseSseEvent(rawEvent);
        if (parsed) {
          await onEvent(parsed);
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsed = parseSseEvent(buffer);
      if (parsed) {
        await onEvent(parsed);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

import { expect, test } from "bun:test";
import { readSseStream } from "./sse";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

test("readSseStream parses token event JSON payload", async () => {
  const stream = streamFromChunks(['event: token\ndata: {"text":"Hi"}\n\n']);
  const events: Array<{ event: string; data: string }> = [];

  await readSseStream(stream, (event) => {
    events.push(event);
  });

  expect(events).toHaveLength(1);
  expect(events[0].event).toBe("token");
  expect(JSON.parse(events[0].data)).toEqual({ text: "Hi" });
});

test("readSseStream parses done and error events", async () => {
  const stream = streamFromChunks([
    'event: done\ndata: {"message":{"id":"m-1"}}\n\n',
    'event: error\ndata: {"error":"stream failed"}\n\n',
  ]);

  const events: Array<{ event: string; data: string }> = [];
  await readSseStream(stream, (event) => {
    events.push(event);
  });

  expect(events).toHaveLength(2);
  expect(events[0].event).toBe("done");
  expect(JSON.parse(events[0].data)).toEqual({ message: { id: "m-1" } });
  expect(events[1].event).toBe("error");
  expect(JSON.parse(events[1].data)).toEqual({ error: "stream failed" });
});

test("readSseStream handles chunk-split event boundaries", async () => {
  const stream = streamFromChunks([
    'event: token\ndata: {"text":"He',
    'llo"}\n\n',
  ]);

  const events: Array<{ event: string; data: string }> = [];
  await readSseStream(stream, (event) => {
    events.push(event);
  });

  expect(events).toHaveLength(1);
  expect(events[0].event).toBe("token");
  expect(JSON.parse(events[0].data)).toEqual({ text: "Hello" });
});

test("readSseStream joins multi-line data payload", async () => {
  const stream = streamFromChunks([
    "event: token\ndata: line-1\ndata: line-2\n\n",
  ]);

  const events: Array<{ event: string; data: string }> = [];
  await readSseStream(stream, (event) => {
    events.push(event);
  });

  expect(events).toHaveLength(1);
  expect(events[0].event).toBe("token");
  expect(events[0].data).toBe("line-1\nline-2");
});

test("readSseStream supports CRLF-framed events", async () => {
  const stream = streamFromChunks([
    'event: token\r\ndata: {"text":"CRLF"}\r\n\r\n',
  ]);

  const events: Array<{ event: string; data: string }> = [];
  await readSseStream(stream, (event) => {
    events.push(event);
  });

  expect(events).toHaveLength(1);
  expect(events[0].event).toBe("token");
  expect(JSON.parse(events[0].data)).toEqual({ text: "CRLF" });
});

test("readSseStream ignores malformed events without data", async () => {
  const stream = streamFromChunks([
    "event: token\n\n",
    'event: token\ndata: {"text":"ok"}\n\n',
  ]);

  const events: Array<{ event: string; data: string }> = [];
  await readSseStream(stream, (event) => {
    events.push(event);
  });

  expect(events).toHaveLength(1);
  expect(events[0].event).toBe("token");
  expect(JSON.parse(events[0].data)).toEqual({ text: "ok" });
});

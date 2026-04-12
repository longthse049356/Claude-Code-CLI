# M1 — Terminal Chatbot: Giải thích toàn bộ

> Tài liệu này giải thích **tại sao** M1 tồn tại, **từng file** làm gì, **từng hàm** có ý nghĩa gì, và **flow** hoạt động như thế nào. Viết cho người đã có kinh nghiệm Frontend (React/Next.js) nhưng chưa từng làm việc với LLM API.

---

## 1. Tại sao cần M1?

Trước khi build bất kỳ AI agent nào — dù là Claude Code, Cursor, hay Clawd — bạn cần hiểu **cơ chế nền tảng nhất**:

> **"AI không phải magic. Nó chỉ là một HTTP API nhận vào một mảng messages và trả về text."**

M1 tồn tại để trả lời câu hỏi: **Một chatbot đơn giản nhất hoạt động như thế nào?**

Không có database. Không có server. Không có UI. Chỉ là:
- Đọc input từ terminal
- Gửi lên API
- In kết quả ra terminal
- Lặp lại

Mọi thứ phức tạp hơn ở M2-M10 đều xây trên nền này.

---

## 2. Tại sao tác giả Clawd cần các file này?

Clawd là một AI agent platform — về bản chất nó là một **chat room** nơi AI agents và users cùng nhắn tin. Nhưng trước khi làm được điều đó, tác giả cần giải quyết bài toán cơ bản nhất:

**"Làm sao để gửi 1 tin nhắn lên Claude API và nhận được response?"**

Ba file trong M1 chính là câu trả lời tối giản cho bài toán đó:

| File | Vai trò | FE Analogy |
|---|---|---|
| `src/types.ts` | Định nghĩa data structures | TypeScript interfaces trong React project |
| `src/providers/anthropic.ts` | Giao tiếp với API | `lib/api.ts` — nơi chứa `fetch()` calls |
| `src/index.ts` | Điều phối toàn bộ app | `App.tsx` — component gốc quản lý state và UI |

---

## 3. File `src/types.ts` — Tại sao cần?

TypeScript cần biết "data trông như thế nào" trước khi làm việc với nó. File này định nghĩa toàn bộ data structures của M1.

### Vấn đề cần giải quyết

Claude API trả về response có thể là một trong hai dạng:
1. **Text thông thường** — AI trả lời bằng ngôn ngữ tự nhiên
2. **Tool use** — AI muốn gọi một function (đọc file, chạy lệnh...)

Nếu không có types rõ ràng, code sẽ lộn xộn và dễ bug.

### Giải thích từng type

```typescript
// Khi AI trả về text bình thường: "Hello, how can I help?"
interface TextBlock {
  type: "text";
  text: string;
}

// Khi AI muốn gọi tool: đọc file, chạy bash...
// AI KHÔNG tự chạy — nó chỉ nói "tôi muốn chạy cái này"
interface ToolUseBlock {
  type: "tool_use";
  id: string;       // "toolu_01A..." — ID duy nhất của lần gọi này
  name: string;     // "read_file", "bash"...
  input: Record<string, unknown>;  // { path: "package.json" }
}

// Một response có thể chứa cả text lẫn tool_use cùng lúc
type ContentBlock = TextBlock | ToolUseBlock;
```

**Tại sao AI không tự chạy tool?**
Vì AI chỉ là một model tạo ra text — nó không có khả năng tự đọc file hay chạy lệnh. Thay vào đó, nó tạo ra một JSON mô tả "tôi muốn làm gì", rồi **server của bạn** đọc JSON đó và thực thi. M1 chỉ hiển thị JSON này mà chưa thực thi — M4 mới làm điều đó.

```typescript
// Lịch sử hội thoại — mỗi tin nhắn là một object
interface UserMessage {
  role: "user";
  content: string;          // text thuần túy từ bàn phím
}

interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];  // có thể chứa text + tool calls
}

// Kết quả sau khi stream xong
interface StreamResult {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  // end_turn   = AI nói xong
  // tool_use   = AI muốn gọi tool, chờ server xử lý
  // max_tokens = bị cắt vì quá dài
  usage: {
    inputTokens: number;   // số token trong messages gửi lên
    outputTokens: number;  // số token AI đã tạo ra
  };
}
```

**FE Analogy:** `ContentBlock` giống như union type trong Redux actions — `{type: "TEXT", payload: "..."}` hoặc `{type: "TOOL_CALL", payload: {...}}`. `type` field là discriminant để switch/case.

---

## 4. File `src/providers/anthropic.ts` — Tại sao cần?

Đây là lớp duy nhất được phép giao tiếp với Anthropic API. Tất cả code khác chỉ gọi `sendMessage()` — không ai biết bên dưới đang dùng SDK nào, endpoint nào.

**Tại sao tách riêng?** Nếu sau này muốn đổi từ Anthropic sang OpenAI, hoặc sang proxy như ChiaSeGPU — chỉ cần sửa file này, không cần động vào `index.ts`.

### `M1_TOOLS` — Khai báo tool schemas

```typescript
const M1_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the contents of a file at the given path",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
      },
      required: ["path"],
    },
  },
  // ... write_file, bash
];
```

**Tại sao khai báo tools mà không thực thi?**

Đây là cơ chế quan trọng nhất cần hiểu:

> Khi gửi tool schemas lên API, bạn đang nói với AI: **"Này Claude, bạn có thể yêu cầu tôi làm những việc này."**

AI sẽ đọc schemas này và khi cần, tạo ra một `ToolUseBlock` đúng format. M1 chỉ hiển thị block đó ra terminal — chưa chạy gì cả. Điều này giúp bạn thấy AI "nghĩ" gì trước khi M4 thực sự cho nó hành động.

**FE Analogy:** Giống như bạn define Redux action types trước — `READ_FILE`, `WRITE_FILE` — rồi mới viết reducers. Schemas là "contract" giữa AI và server.

### `SYSTEM_PROMPT` — Nhân cách của AI

```typescript
const SYSTEM_PROMPT = `You are Clawd, an AI assistant running in a terminal...`;
```

System prompt là "instruction manual" cho AI — chạy mỗi lần gọi API nhưng không hiển thị trong conversation history. Nó định nghĩa:
- AI là ai (Clawd)
- AI có thể làm gì (tools nào)
- AI nên respond như thế nào (concise)

### `DEFAULT_MODEL` — Linh hoạt với env

```typescript
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
```

Đọc model từ biến môi trường. Điều này cho phép dùng `Sonnet4.6` của ChiaSeGPU thay vì gọi thẳng Anthropic — tiết kiệm chi phí khi dev.

### `client` — Khởi tạo SDK

```typescript
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
});
```

Tạo một Anthropic client dùng cho toàn bộ session. Nếu có `ANTHROPIC_BASE_URL` trong `.env`, sẽ gọi đến đó thay vì `api.anthropic.com` — đây là cách kết nối ChiaSeGPU proxy mà không cần sửa code.

### `sendMessage()` — Hàm trung tâm

Đây là hàm quan trọng nhất trong M1. Phân tích từng bước:

**Bước 1: Map history sang SDK format**

```typescript
const apiMessages = messages.map((msg) => {
  if (msg.role === "user") {
    return { role: "user" as const, content: msg.content };
  }
  return {
    role: "assistant" as const,
    content: msg.content.map((block) => { ... }),
  };
});
```

`history[]` của chúng ta dùng types riêng (`Message`). SDK của Anthropic dùng types riêng của nó. Bước này chuyển đổi giữa hai formats.

**Bước 2: Mở stream**

```typescript
const stream = client.messages.stream({
  model,
  max_tokens: maxTokens,
  system: systemPrompt,
  messages: apiMessages,
  tools: tools as Anthropic.Tool[],
}, signal ? { signal } : undefined);
```

Thay vì gọi API một lần và đợi toàn bộ response (như `fetch()`), `stream()` mở một kết nối SSE (Server-Sent Events). Server gửi từng token một ngay khi tạo ra — giống như xem video stream thay vì download rồi xem.

`signal` là `AbortSignal` — nếu user nhấn Ctrl+C giữa chừng, stream sẽ bị hủy ngay lập tức.

**Bước 3: Print tokens real-time**

```typescript
stream.on("text", (text) => {
  process.stdout.write(text);
});
```

Mỗi khi một token mới tới từ server, ghi thẳng ra stdout ngay lập tức — không buffer, không đợi. Đây là thứ tạo ra hiệu ứng "AI đang gõ từng chữ".

**FE Analogy:** Giống như `ReadableStream` trong browser — `response.body.getReader()` rồi đọc từng chunk.

**Bước 4: Lấy final message**

```typescript
const finalMessage = await stream.finalMessage();
```

Sau khi stream kết thúc, lấy toàn bộ message đã được assembled. Từ đây extract ra `content`, `stop_reason`, và `usage`.

**Bước 5: Map về types của mình**

```typescript
const content: StreamResult["content"] = finalMessage.content
  .filter((block) => block.type === "text" || block.type === "tool_use")
  .map((block) => { ... });
```

SDK 0.87.0 có thêm nhiều block types mới (`ThinkingBlock`, `WebSearchBlock`...). Filter chỉ giữ lại `text` và `tool_use` — những gì M1 hiểu được. Map sang types của mình để `index.ts` không phụ thuộc vào SDK.

---

## 5. File `src/index.ts` — Tại sao cần?

Đây là "bộ não điều phối" — nối tất cả lại với nhau. Người dùng chỉ tương tác với file này.

### `printWelcome()` — Tại sao cần?

```typescript
function printWelcome(): void {
  console.log("🤖 Clawd Terminal (M1)");
  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log("Type your message. Ctrl+C to exit.");
  console.log("─────────────────────────────────\n");
}
```

Đơn giản: thông báo cho user biết app đã sẵn sàng, đang dùng model nào, và cách thoát. Ít dòng nhưng cần thiết để UX không bị lạ.

### `printToolCalls()` — Tại sao cần?

```typescript
function printToolCalls(blocks: ToolUseBlock[]): void {
  blocks.forEach((block, index) => {
    const label = blocks.length > 1
      ? `[Tool Call ${index + 1}/${blocks.length}] ${block.name}`
      : `[Tool Call] ${block.name}`;
    console.log(`\n${label}`);
    console.log(JSON.stringify(block.input, null, 2));
  });
  console.log("\n(Tool execution not implemented yet — will be added in M4)");
}
```

Khi AI muốn gọi tool, thay vì chạy luôn (nguy hiểm!), M1 chỉ hiển thị JSON mô tả tool call đó. Mục đích:
1. **Học** — bạn thấy AI "nghĩ" gì, muốn làm gì
2. **Debug** — kiểm tra AI có hiểu đúng yêu cầu không trước khi cho phép thực thi
3. **Foundation** — M4 sẽ thêm execution thật vào đây

Hàm handle cả trường hợp AI gọi nhiều tools cùng lúc (hiển thị `[Tool Call 1/2]`, `[Tool Call 2/2]`).

### `printUsage()` và `printMaxTokensWarning()`

```typescript
function printUsage(usage: StreamResult["usage"]): void {
  console.log(`\n[tokens: ${usage.inputTokens} in / ${usage.outputTokens} out]`);
}
```

Hiển thị số tokens mỗi lần gọi API. Tại sao cần?
- **Cost awareness** — mỗi token tốn tiền, biết mình đang dùng bao nhiêu
- **Debug context growth** — `inputTokens` tăng dần theo conversation vì `history[]` ngày càng dài

`printMaxTokensWarning()` cảnh báo khi AI bị cắt giữa chừng — response không hoàn chỉnh.

### `handleError()` — Tại sao cần?

```typescript
function handleError(err: unknown): void {
  if (message.includes("401") || message.includes("authentication")) {
    process.exit(1);   // Lỗi auth → không thể tiếp tục, thoát luôn
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return;            // Rate limit → thông báo, cho phép thử lại
  }
  if (message.includes("500") || message.includes("503")) {
    return;            // Server error → thông báo, cho phép thử lại
  }
  if (message.includes("fetch") || message.includes("econnrefused")) {
    return;            // Network error → thông báo, cho phép thử lại
  }
}
```

Phân loại lỗi theo mức độ nghiêm trọng:
- **Fatal** (401) → thoát app, không có cách fix nào ngoài đổi API key
- **Recoverable** (429, 500, mất mạng) → thông báo, user có thể thử lại

Không phân loại → mọi lỗi đều crash app → UX tệ.

### `main()` — Orchestrator

```typescript
async function main(): Promise<void> {
  // Guard: API key phải có trước khi làm bất cứ điều gì
  if (!process.env.ANTHROPIC_API_KEY) {
    process.exit(1);
  }

  printWelcome();
  const history: Message[] = [];    // Bộ nhớ của cuộc hội thoại

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.on("close", () => {            // Ctrl+C tại prompt → thoát sạch
    console.log("\nGoodbye!");
    process.exit(0);
  });

  prompt();  // Bắt đầu vòng lặp
}
```

**Tại sao check API key ở đây?**

Nếu không check, app sẽ start bình thường, user gõ tin nhắn, rồi mới báo lỗi sau lần gọi API đầu tiên — waste time. Check ngay từ đầu = fail fast.

**`history[]` là gì và tại sao quan trọng?**

Đây là thứ duy nhất tạo ra "memory" cho AI. Claude API không có memory — mỗi lần gọi là một request độc lập. Để AI "nhớ" conversation, bạn phải gửi toàn bộ lịch sử hội thoại lên mỗi lần:

```
Turn 1: gửi [userMsg1]                     → AI trả lời assistantMsg1
Turn 2: gửi [userMsg1, assistantMsg1, userMsg2]  → AI "nhớ" được turn 1
Turn 3: gửi [userMsg1, assistantMsg1, userMsg2, assistantMsg2, userMsg3]  → ...
```

**FE Analogy:** Giống như `useState` trong React — `history` là state của toàn bộ conversation, được truyền vào mỗi lần render (mỗi lần gọi API).

### `prompt()` — Vòng lặp chính

```typescript
const prompt = (): void => {
  rl.question("You > ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) { prompt(); return; }   // Bỏ qua input rỗng

    history.push({ role: "user", content: trimmed });  // Ghi vào history

    // AbortController — cho phép hủy stream khi Ctrl+C
    const controller = new AbortController();
    const sigintHandler = () => {
      controller.abort();
      process.stdout.write("\n[Stream interrupted]\n");
    };
    process.once("SIGINT", sigintHandler);  // Chỉ lắng nghe 1 lần

    try {
      const result = await sendMessage(history, { signal: controller.signal });
      history.push({ role: "assistant", content: result.content });  // Ghi response vào history

      // Hiển thị tool calls nếu có
      const toolCalls = result.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      if (toolCalls.length > 0) printToolCalls(toolCalls);

      if (result.stopReason === "max_tokens") printMaxTokensWarning();
      printUsage(result.usage);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User đã Ctrl+C → không cần thông báo thêm
      } else {
        handleError(err);
      }
    } finally {
      process.removeListener("SIGINT", sigintHandler);  // Dọn dẹp listener
    }

    console.log();
    prompt();   // Đệ quy → vòng lặp tiếp tục
  });
};
```

**Tại sao dùng đệ quy thay vì `while(true)`?**

`rl.question()` là async callback — nó không block thread. Nếu dùng `while(true)`, vòng lặp sẽ chạy liên tục mà không chờ user nhập. Đệ quy ở đây thực chất là "gọi lại prompt sau khi xử lý xong" — pattern chuẩn cho readline trong Node.js.

**AbortController pattern:**

```
Ctrl+C tại prompt (rl đang đợi input)
  → readline bắt được → emit "close" → "Goodbye!" → exit(0)

Ctrl+C giữa stream (API đang stream response)
  → process.once("SIGINT") bắt được → controller.abort()
  → stream dừng → AbortError thrown → catch block → không crash
  → prompt() tiếp tục → "You > " xuất hiện lại
```

Hai Ctrl+C, hai behavior khác nhau — tùy context.

---

## 6. Flow toàn bộ — Khi bạn gõ "Read file package.json"

```
Bạn gõ: "Read file package.json" + Enter
│
▼ stdin → readline → prompt() callback
│
├─ history.push({ role: "user", content: "Read file package.json" })
│
▼ sendMessage(history, { signal })
│
├─ Map history → apiMessages (SDK format)
├─ client.messages.stream({ model, tools: M1_TOOLS, messages: apiMessages, ... })
│
▼ Server nhận request, AI xử lý...
│
│  AI thấy tool "read_file" trong M1_TOOLS
│  AI quyết định: "Tôi cần dùng read_file với path=package.json"
│
▼ SSE events bắt đầu chảy về:
│
├─ event: text_delta("I'll read that file for you.")
│     └─ stream.on("text") → process.stdout.write → bạn thấy text ngay
│
├─ event: content_block_start (type: tool_use, name: "read_file")
├─ event: input_json_delta ('{"path": "pac')
├─ event: input_json_delta ('kage.json"}')
├─ event: content_block_stop
│
├─ event: message_delta (stop_reason: "tool_use")
├─ event: message_stop
│
▼ stream.finalMessage() → trả về full message
│
├─ content = [TextBlock("I'll read..."), ToolUseBlock("read_file", {path: "package.json"})]
├─ stopReason = "tool_use"
│
▼ Trở về prompt()
│
├─ history.push({ role: "assistant", content: [...] })
│
├─ toolCalls = [ToolUseBlock("read_file", {path: "package.json"})]
│
└─ printToolCalls([...]) in ra:
     [Tool Call] read_file
     {
       "path": "package.json"
     }
     (Tool execution not implemented yet — will be added in M4)

▼ printUsage → [tokens: 45 in / 30 out]
▼ prompt() → "You > " xuất hiện lại
```

---

## 7. Vì sao cần tách 3 files?

Nguyên tắc **Single Responsibility**:

| File | Biết gì | Không biết gì |
|---|---|---|
| `types.ts` | Shape của data | Logic nào dùng data đó |
| `providers/anthropic.ts` | Cách gọi Anthropic API | Có readline hay không, UI là gì |
| `index.ts` | Cách hiển thị, flow điều phối | SDK nào đang được dùng bên dưới |

**Lợi ích thực tế:**
- Muốn đổi từ Anthropic sang OpenAI → chỉ sửa `providers/anthropic.ts`
- Muốn thêm web UI thay vì terminal → chỉ thay `index.ts`
- Muốn thêm field vào data structure → chỉ sửa `types.ts`

---

## 8. M1 dạy bạn điều gì?

Sau M1, bạn hiểu rằng:

1. **Claude API = HTTP POST** — gửi `messages[]` lên, nhận về `content[]`. Không có magic.

2. **AI không có memory** — memory là `history[]` mà bạn tự quản lý và gửi lên mỗi lần.

3. **Streaming = SSE** — giống `ReadableStream` trong browser. Token tới thì print ngay, không đợi.

4. **Tool use = JSON output** — AI không tự chạy code. Nó tạo ra JSON mô tả muốn làm gì, server của bạn đọc và thực thi.

5. **stop_reason quan trọng** — `end_turn` vs `tool_use` vs `max_tokens` quyết định bạn làm gì tiếp theo.

> **Claude Code, Cursor, Clawd đều hoạt động theo cùng nguyên tắc này. Chỉ khác nhau ở scale và features xung quanh.**

---

## 9. Những gì M1 chưa có (và sẽ được thêm ở milestone sau)

| Tính năng | Milestone |
|---|---|
| Tool execution thật (đọc file, chạy bash) | M4 |
| Lưu conversation vào database | M2 |
| HTTP server để nhiều client kết nối | M2 |
| Agent tự loop: gọi tool → xem kết quả → gọi tool tiếp | M3 |
| Quản lý context khi history quá dài | M5 |
| Memory dài hạn (nhớ qua nhiều sessions) | M6 |

---

*Diagram kiến trúc: xem [`docs/diagrams/M1-terminal-chatbot-architecture.excalidraw`](../diagrams/M1-terminal-chatbot-architecture.excalidraw)*

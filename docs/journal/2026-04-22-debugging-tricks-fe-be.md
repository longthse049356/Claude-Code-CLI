# Debugging Tricks — FE/BE Bug Isolation

> Học được từ session debug SSE streaming (2026-04-21 → 2026-04-22).
> Bug thực tế: browser extension intercept `fetch().body` reader. Đã đoán mò qua Vite proxy, Bun http shim, encoding, React batching... trước khi tìm ra.

## 2 tricks để khoanh vùng bug FE vs BE

### Trick 1 — Mock BE ngay trong FE dev server

**Khi nào dùng:** API BE đã verify work qua `curl`/Postman, nhưng FE không nhận đúng. Đừng sửa song song cả 2 phía.

**Cách làm:** Tạo mock endpoint trong dev server (Vite plugin / Next.js route handler / `mockServiceWorker`...) trả response y hệt BE thật. Test FE với mock.

```ts
// vite.config.ts
function mockPlugin() {
  return {
    name: 'mock-be',
    configureServer(server) {
      server.middlewares.use('/api/stream', (req, res) => {
        // ... emit fake response giống BE thật
      });
    },
  };
}
```

**Diễn giải:**
- FE work với mock → bug ở BE (hoặc transport BE→FE)
- FE vẫn lỗi với mock → bug ở FE → dùng Trick 2

### Trick 2 — Strip FE xuống mức tối giản nhất

**Khi nào dùng:** Trick 1 cho thấy FE có lỗi, nhưng không biết tầng nào (state lib, render, component composition, browser env...).

**Cách làm:** Comment toàn bộ logic trong `App.tsx`. Thay bằng:
- 1 button trigger action
- 1 `useState` để hiển thị output
- **Không** React Query, Zustand, UI lib, markdown, router

```tsx
export default function App() {
  const [data, setData] = useState("");
  return (
    <>
      <button onClick={() => /* call API */}>Test</button>
      <pre>{data}</pre>
    </>
  );
}
```

**Diễn giải:**
- Bare-bones work → bug ở 1 wrapper layer (state lib batching, component re-render, library config)
- Bare-bones vẫn lỗi → bug ngoài code (browser extension, service worker, network proxy, OS)

### Verify environment khi nghi ngoại cảnh

Sau Trick 2 mà bare-bones vẫn lỗi, test trong **Incognito mode**. Nếu mượt → extension hoặc service worker đang intercept.

```js
// Console: check service worker
navigator.serviceWorker.getRegistrations().then(r => console.log(r));
```

## Nguyên tắc gốc

Cả 2 tricks đều cùng 1 ý: **giảm số biến số trước khi đoán**. Mỗi lần thêm 1 hypothesis về nguyên nhân (proxy buffer, encoding, SDK bug...) mà không khoanh vùng trước → đốt thời gian. Tricks này biến debug từ "đoán → thử → fail → đoán tiếp" thành "khoanh vùng → biết chắc tầng nào → fix".

## Khi nào áp dụng

- Bug streaming/async/realtime với nhiều plausible causes
- Bug "sometimes works, sometimes doesn't" giữa các môi trường
- Bug FE+BE đều có vẻ liên quan

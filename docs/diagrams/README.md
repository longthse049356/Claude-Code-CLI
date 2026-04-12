# Excalidraw — Lưu ý khi export file

## Vấn đề

MCP tool `create_view` dùng syntax shorthand `"label": {"text": "..."}` để render diagram trong Claude Code.
Tuy nhiên **đây không phải Excalidraw file format thật** — khi lưu ra `.excalidraw` và import vào excalidraw.com, shape hiện đúng nhưng **toàn bộ text/label biến mất**.

## Nguyên nhân

| | MCP `create_view` | File `.excalidraw` thật |
|---|---|---|
| Label syntax | `"label": {"text": "..."}` inline | `text` element riêng + `containerId` |
| Dùng cho | Render preview trong Claude | Import vào excalidraw.com |

## Cách viết đúng khi lưu file

**Sai (MCP shorthand — chỉ dùng để preview):**
```json
{
  "type": "rectangle",
  "id": "r1",
  "x": 100, "y": 100, "width": 200, "height": 80,
  "label": { "text": "Hello", "fontSize": 16 }
}
```

**Đúng (file format thật):**
```json
{
  "type": "rectangle",
  "id": "r1",
  "x": 100, "y": 100, "width": 200, "height": 80,
  "boundElements": [{"type": "text", "id": "r1_lbl"}]
},
{
  "type": "text",
  "id": "r1_lbl",
  "containerId": "r1",
  "x": 110, "y": 128,
  "width": 180, "height": 24,
  "text": "Hello",
  "fontSize": 16,
  "fontFamily": 1,
  "textAlign": "center",
  "verticalAlign": "middle",
  "strokeColor": "#1e1e1e",
  "backgroundColor": "transparent"
}
```

## Cấu trúc file `.excalidraw` tối thiểu

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [ ...các elements... ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "gridSize": null
  }
}
```

## Workflow gợi ý

1. Dùng MCP `create_view` để **thiết kế và preview** diagram (dùng `label` shorthand thoải mái)
2. Khi muốn **lưu file** để share/import, viết lại elements với `text` + `containerId` đúng format

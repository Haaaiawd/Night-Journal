---
name: testing-night-journal
description: Test Night-Journal's core features end-to-end including AI model settings, image upload, and entry creation. Use when verifying changes to settings, model config, or entry/image flows.
---

# Testing Night-Journal

## Prerequisites

- Docker running with MySQL container (`nightjournal-db`)
- Dev server running (`npm run dev`, defaults to port 3000)
- Test user registered (e.g. `testuser` / `testpass123`)
- A test image file available (any PNG/JPG)

## Devin Secrets Needed

- None required for basic testing (uses local dev environment)
- For real AI model testing, would need valid API keys for OpenAI/DeepSeek

## Dev Server Setup

```bash
cd /home/ubuntu/repos/Night-Journal
docker start nightjournal-db
npm run dev
```

Note: The port might vary (3000 or 3001). Check the Vite output.

## Key Test Flows

### 1. Test Connection Validation (Settings > 图片模型 / 写作模型)

- Enter invalid URL (e.g. `https://invalid.example.com/v1`) and any API key
- Click "测试连接"
- Expected: Shows "连接失败" with red error text (e.g. "fetch failed")
- If it shows "连接成功" with valid credentials issues, the test is fake

### 2. Model Presets CRUD (Settings > 图片模型 tab > 配置预设)

- Fill API Base URL, API Key, and model name fields
- Click "保存当前配置为预设" and enter a name
- Verify preset appears in list with model name and hostname
- Click "加载" on a different preset to verify form fields update
- Click X (delete) to verify preset is removed from list
- Note: The "测试连接" button requires all 3 fields (URL, Key, Model) to be filled

### 3. Image Upload in Entry Creation (Home page)

- Click "+" FAB to open the BottomDrawer
- Select a mood (required), type text (required)
- Upload image via the "点击上传图片" area
- Submit with "保存" button
- Verify: Fragment card shows image with `/api/uploads/` server URL, NOT `blob:` URL
- For programmatic file upload, use Playwright via CDP (`localhost:29229`):
  ```javascript
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('/path/to/image.png');
  ```

### 4. Image Persistence After Reload

- After creating an entry with image, press F5
- Image should still display (served from disk via `/api/uploads/:userId/:fileName`)

## Tips

- The app uses Chinese UI labels throughout (心情, 记录, 图片模型, 写作模型, etc.)
- Login redirects to `/` (Home page) on success
- Settings tabs: 账户, 图片模型, 写作模型, 主题, 数据
- The "测试连接" button is disabled until all fields are filled
- Playwright (via CDP at `localhost:29229`) is useful for file uploads since native file dialogs can't be controlled via computer-use tool
- Install playwright in `/tmp` if not available: `cd /tmp && npm install playwright`
- The tailwind config uses `.cjs` extension (CommonJS) due to `"type": "module"` in package.json

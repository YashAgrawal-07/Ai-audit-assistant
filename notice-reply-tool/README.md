# Notice Reply Tool

A comprehensive web application for drafting responses to GST, Income Tax, and TDS notices.

## Features

✓ **Upload & Extract** — Upload PDF or image scans of notices; automatically extract key details (section, amount, dates)
✓ **Figure Reconciliation** — Compare notice figures against your books; track differences
✓ **Smart Reply Templates** — Pre-filled legal templates for different sections (GST 73/74, IT 143(2), TDS 200A, etc.)
✓ **Quick Reply** — Paste notice text directly and generate a reply without uploading
✓ **Precedent Search** — Quick links to live case-law and circular databases
✓ **Fully Editable** — All drafts are editable before sending

## Setup & Run

### Prerequisites
- Node.js 14+
- npm

### Installation

1. **Clone and navigate:**
   ```bash
   git clone https://github.com/YashAgrawal-07/Ai-audit-assistant.git
   cd notice-reply-tool
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the backend:**
   ```bash
   npm start
   ```
   Backend runs on `http://localhost:4000`

4. **Open the frontend:**
   - Visit `http://localhost:4000` in your browser
   - You'll see "Backend: ● connected" in green at the top

### Quick Start

1. **Tab 1: Read Notice**
   - Upload a PDF/JPG/PNG scan of the notice
   - Click "Extract key points"
   - Review the auto-detected notice type, section, amounts

2. **Tab 2: Compare Figures**
   - Enter your book figures alongside the notice amounts
   - Differences are calculated automatically

3. **Tab 3: Draft Reply**
   - Select an appropriate template (auto-suggested)
   - Add specific instructions if needed
   - Click "Generate draft reply"
   - Edit and copy to send

4. **Tab 4: Precedents**
   - Links to Indian Kanoon, official circulars, TaxGuru, etc.
   - Search based on the notice's section and allegation

5. **Tab 5: Quick Reply**
   - Paste notice text (no file needed)
   - Generate reply directly

## Technology Stack

- **Backend:** Node.js, Express, Multer
- **OCR/PDF:** pdf-parse, Tesseract.js
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Fonts:** IBM Plex Sans/Mono, Source Serif 4

## File Structure

```
notice-reply-tool/
├── server.js              # Backend server & API
├── public/
│   ├── index.html        # Frontend interface
│   └── app.js            # Frontend logic
├── package.json          # Dependencies
└── README.md             # This file
```

## API Endpoints

### `POST /api/extract`
Upload a PDF or image; extracts notice details.
- **Request:** Multipart form with `file`
- **Response:** `{ extracted: { notice_type, section, notice_number, amount, ... } }`

### `POST /api/reply`
Generate a reply from extracted notice + figures table.
- **Request:** JSON with `{ notice, figures, instructions, template_key }`
- **Response:** `{ draft: "<drafted reply text>" }`

### `POST /api/quick-reply`
Generate reply from pasted notice text.
- **Request:** JSON with `{ notice_text, instructions, template_key }`
- **Response:** `{ draft: "<drafted reply text>" }`

### `GET /api/health`
Check if backend is running.
- **Response:** `{ status: 'ok', message: 'Backend is running' }`

## Notice Types Supported

- **GST:** Sections 73, 74, ASMT-10
- **Income Tax:** Sections 143(2), 148, 156
- **TDS:** Sections 200A, 201
- **Generic:** Fallback for unlisted notices

## Limitations

- PDF/image extraction quality depends on scan quality
- Manual review of extracted figures is recommended
- Drafted replies are templates and should be reviewed by a tax professional
- No data is stored; everything works in-session

## Troubleshooting

**Backend not reachable?**
- Ensure `npm start` is running
- Check Backend URL in the settings bar (default: `http://localhost:4000`)
- Verify port 4000 is not in use

**Extraction failing?**
- Ensure the PDF/image has readable text (not just scanned pictures)
- Try a higher-quality scan
- Use the Quick Reply tab instead (paste text directly)

**Module not found?**
- Run `npm install` again
- Check `package.json` dependencies

## License

MIT

## Support

For issues or feature requests, open an issue in the repo.

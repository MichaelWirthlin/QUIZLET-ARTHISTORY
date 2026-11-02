# Atelier — Art History Studio

A private, single-user study app for an art history course. Upload artwork images, draft identification and historical notes with AI, edit the reference notes, and practice written recall against them.

## Run

Requires Python 3.12 or newer. No third-party packages or build step.

For a download, exact macOS/Linux and Windows commands, and local API-key setup, see [LOCAL_SETUP.md](LOCAL_SETUP.md).

```sh
cd /workspace/QUIZLET-ARTHISTORY
python3 server.py
```

The server defaults to `127.0.0.1:3000`. `HOST` and `PORT` can override this. Keep the app private: it has no accounts or authentication and is intended for a single trusted user. Do not expose it publicly without adding authentication.

## Connect AI

Set `ART_STUDY_API_KEY` securely in your environment settings and permit HTTPS access to `api.openai.com`, then restart the server. An existing `OPENAI_API_KEY` is also supported. Do not commit credentials. The default model is `gpt-4.1-mini`; override using `ART_STUDY_MODEL` if needed. It must support image inputs and JSON object responses through Chat Completions. Open **Connect AI**, then **Check AI connection** to make a small live model request. The UI distinguishes a present key from a verified response; a key's presence alone never displays “AI connected.”

Images are sent to OpenAI only when **Identify & draft study notes** is clicked. Quiz answers and saved reference text are sent when AI grading is requested. API usage is billed to the configured account. Treat identification and grades as study assistance and verify generated facts with your course material. AI confidence is self-reported, not a calibrated probability.

Without a key, manual artwork entry, editing, collection search, and self-review quizzes work. The app explicitly labels self-review as unscored. It does not substitute keyword matching for AI grading.

## Study workflow

1. Add a JPEG, PNG, or WebP artwork image, up to 5 MB.
2. Optionally identify it with AI. Review and edit its name, maker, date, period, medium, historical context, and overview.
3. Save it. Quiz readiness requires an image, name, period, context, and overview.
4. Choose a session length (1, 5, or 10 artworks) and feedback style. Or use **Practice** on an artwork card to study just that work. Recall the name, period, context, and overview from the image.
5. Get feedback per field and an equally weighted practice score, or compare manually without AI. Blank answers score zero. Session results are temporary.

Artworks and images are stored in `.data/studio.sqlite` outside version control. Back up that database to preserve your collection. The app does not have cloud sync. **Try a sample artwork** adds The Starry Night with a bundled public-domain reproduction and editable study notes, ready to practice. It does not make an AI request. Artwork attribution is in `public/assets/CREDITS.md`.

## Validation

```sh
python3 -m unittest discover -s tests -v
node --check public/app.js
```

Tests exercise persistence, updates, deletion, image validation, quiz self-review, credential-free behavior, static file isolation, and cross-origin protections. Real model identification and grading require a configured API key and are not covered by the local tests.

An optional browser smoke test exercises the collection, upload/edit flow, unsaved-change protection, filters, quizzes, responsive widths, and mocked AI screens in a temporary database:

```sh
python3 tests/browser_smoke.py
```

This test requires Python Playwright and `/usr/bin/chromium` (already available in the current cloud machine). Mocked AI browser checks verify the interface, not live model behavior.

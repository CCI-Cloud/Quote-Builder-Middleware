# Quote Builder Middleware

Quote Builder Middleware is a small Node.js service that helps turn inbound quote request emails into structured data the rest of the business can use. It sits between upstream systems and the extraction logic, normalizes request payloads, and returns a clean JSON response for downstream processing.

## What It Does

- Accepts quote request data through an internal API endpoint
- Normalizes incoming payloads into a consistent shape
- Sends the content to OpenAI for extraction
- Returns structured quote details in JSON format

This project is designed to support a practical workflow: take messy email-based quote requests and make them easier to review, route, and process.

## Project Structure

- `src/server.js` starts the Express app
- `src/routes/quoteBuilder.js` handles the quote extraction endpoint
- `src/lib/normalize.js` prepares incoming data for processing
- `src/lib/openaiClient.js` handles the extraction request
- `src/lib/schema.js` defines the expected output shape

## Local Development

Install dependencies and start the app in watch mode:

```bash
npm install
npm run dev
```

Required environment variables are listed in `.env.example`.

## Validation

This project does not build front-end assets. The validation step checks the Node files for syntax issues:

```bash
npm run build
```

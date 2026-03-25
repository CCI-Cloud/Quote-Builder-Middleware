/**
 * Application entry point for the Quote Builder Middleware service.
 *
 * This file creates the Express app, registers shared middleware, and mounts
 * the two main route groups:
 * - `/quote-builder` for the internal quote extraction workflow
 * - `/webhooks/github-deploy` for GitHub-triggered deployment requests
 *
 * It also keeps the webhook route on raw-body parsing so GitHub signatures can
 * be verified against the exact bytes that were sent.
 */
import "dotenv/config";
import express from "express";
import deployWebhookRouter from "./routes/deployWebhook.js";
import quoteBuilderRouter from "./routes/quoteBuilder.js";

const app = express();

// GitHub signatures must be computed against the untouched request body.
app.use(
	"/webhooks/github-deploy",
	express.raw({ type: "*/*", limit: "10mb" }),
	deployWebhookRouter,
);
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
	res.status(200).json({ ok: true });
});

// Quote extraction requests use the standard JSON parser.
app.use("/quote-builder", quoteBuilderRouter);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
	console.log(`Quote Builder middleware listening on port ${port}`);
});

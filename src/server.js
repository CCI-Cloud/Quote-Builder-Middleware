import "dotenv/config";
import express from "express";
import deployWebhookRouter from "./routes/deployWebhook.js";
import quoteBuilderRouter from "./routes/quoteBuilder.js";

const app = express();

app.use(
	"/webhooks/github-deploy",
	express.raw({ type: "*/*", limit: "10mb" }),
	deployWebhookRouter,
);
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
	res.status(200).json({ ok: true });
});

app.use("/quote-builder", quoteBuilderRouter);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
	console.log(`Quote Builder middleware listening on port ${port}`);
});

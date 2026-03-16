import "dotenv/config";
import express from "express";
import quoteBuilderRouter from "./routes/quoteBuilder.js";

const app = express();

app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
	res.status(200).json({ ok: true });
});

app.use("/quote-builder", quoteBuilderRouter);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
	console.log(`Quote Builder middleware listening on port ${port}`);
});

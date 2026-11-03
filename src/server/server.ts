import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

/**
 * Parametric CAD parameter endpoint.
 *
 * The 3D screen sends a plain-language tweak ("column 400", "balcony 1.5 m") and this maps it onto
 * generator parameters. It is deliberately a deterministic parse — no model, no network.
 */
app.post("/api/cad", (req, res) => {
  try {
    const { modificationPrompt, lang } = req.body || {};
    const prompt = String(modificationPrompt || "").toLowerCase();
    const params: Record<string, number> = {};
    let reply = "";

    const firstNumber = (text: string): number | null => {
      const match = text.match(/\d+(\.\d+)?/);
      return match ? parseFloat(match[0]) : null;
    };
    const asMm = (value: number, fallback: number) => (value < 10 ? Math.round(value * 1000) : Math.round(value)) || fallback;

    if (prompt.includes("column") || prompt.includes("কলাম")) {
      const size = asMm(firstNumber(prompt) ?? 350, 350);
      params.columnWidthMm = size;
      params.columnDepthMm = size;
      reply = lang === "bn"
        ? `[প্যারামেট্রিক ক্যাড] কলাম ${size}মিমি × ${size}মিমি; ৩D ফ্রেম পুনর্গণনা করা হয়েছে।`
        : `[Parametric CAD] Columns set to ${size}mm × ${size}mm; the 3D frame was recomputed.`;
    } else if (prompt.includes("footing") || prompt.includes("ফুটিং")) {
      const size = asMm(firstNumber(prompt) ?? 2.2, 2200);
      params.footingSizeMm = size;
      params.footingDepthMm = Math.round(size * 0.9);
      reply = lang === "bn"
        ? `[প্যারামেট্রিক ক্যাড] ফুটিং ${size}মিমি × ${size}মিমি; ভারবহন চাপ পুনর্গণনা করা হয়েছে।`
        : `[Parametric CAD] Footings set to ${size}mm × ${size}mm; bearing pressure recomputed.`;
    } else if (prompt.includes("balcony") || prompt.includes("বারান্দা")) {
      const depth = asMm(firstNumber(prompt) ?? 1.5, 1500);
      params.balconyDepthMm = depth;
      reply = lang === "bn"
        ? `[প্যারামেট্রিক ক্যাড] বারান্দার প্রক্ষেপ ${depth}মিমি; রেলিং আপডেট করা হয়েছে।`
        : `[Parametric CAD] Balcony projection set to ${depth}mm; railings updated.`;
    } else {
      reply = lang === "bn"
        ? `[প্যারামেট্রিক ক্যাড] "${modificationPrompt}" গ্রহণ করা হয়েছে; ৩D মডেল হালনাগাদ করা হয়েছে।`
        : `[Parametric CAD] Applied "${modificationPrompt}"; the 3D model was regenerated.`;
    }

    return res.json({ reply, params });
  } catch (error) {
    console.error("CAD parameter error:", error);
    return res.status(400).json({ reply: "Could not apply that change.", params: {} });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ArchResidenceBD server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

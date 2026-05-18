import { chromium } from "playwright";

export class PdfRenderError extends Error {
  constructor(message, { code = "PDF_RENDER_FAILED", cause } = {}) {
    super(message);
    this.name = "PdfRenderError";
    this.code = code;
    this.cause = cause;
  }
}

function isMissingBrowserExecutable(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("Executable doesn't exist") ||
    message.includes("Please run the following command to download new browsers")
  );
}

function normalizePdfError(error) {
  if (error instanceof PdfRenderError) return error;

  if (isMissingBrowserExecutable(error)) {
    return new PdfRenderError(
      "Motorul PDF nu este instalat complet pe server. Ruleaza `npm exec playwright -- install chromium`.",
      { code: "PDF_BROWSER_MISSING", cause: error }
    );
  }

  return new PdfRenderError(
    String(error?.message || error || "Generarea PDF a esuat."),
    { code: "PDF_RENDER_FAILED", cause: error }
  );
}

export async function renderPdfBuffer(html) {
  let browser;

  try {
    browser = await chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" },
    });
  } catch (error) {
    throw normalizePdfError(error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

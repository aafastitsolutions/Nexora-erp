import fs from "node:fs";
import path from "node:path";

export const TREVORO_EMAIL_PAUSE_FILE = process.env.TREVORO_EMAIL_PAUSE_FILE
  || path.join(process.cwd(), "utile", "flags", "trevoro-email-sending-paused");

export function isTrevoroEmailSendingPaused() {
  return fs.existsSync(TREVORO_EMAIL_PAUSE_FILE);
}

export function exitIfTrevoroEmailSendingPaused(scriptName = "trevoro-email-script") {
  if (!isTrevoroEmailSendingPaused()) return;
  console.log(JSON.stringify({
    ok: false,
    skipped: true,
    reason: "trevoro_email_sending_paused",
    script: scriptName,
    pause_file: TREVORO_EMAIL_PAUSE_FILE,
    message: "Trimiterile automate de email Trevoro sunt oprite pana la repornire manuala."
  }, null, 2));
  process.exit(0);
}

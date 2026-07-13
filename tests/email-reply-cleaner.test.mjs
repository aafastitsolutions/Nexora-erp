import assert from "node:assert/strict";

import {
  cleanEmailBodyPreview,
  stripQuotedEmailText
} from "../lib/email-reply-cleaner.js";

const orangeOnly = "Envoyé depuis l'application Mail Orange ------------ De: contact@trevoro.ro Envoyé: mardi, 16 juin 2026, 12:49 À: christian.perrier@wanadoo.fr Cc: contact@trevoro.ro Objet: List your property on Trevoro We have closed our property Hello, We are contacting you from Trevoro.";

assert.equal(stripQuotedEmailText(orangeOnly), "");
assert.equal(cleanEmailBodyPreview(orangeOnly), "");

const orangeWithReply = "Bonjour, nous avons fermé notre propriété. Envoyé depuis l'application Mail Orange ------------ De: contact@trevoro.ro Envoyé: mardi, 16 juin 2026, 12:49 À: christian.perrier@wanadoo.fr Objet: List your property on Trevoro Hello, We are contacting you from Trevoro.";

assert.equal(stripQuotedEmailText(orangeWithReply), "Bonjour, nous avons fermé notre propriété.");
assert.equal(cleanEmailBodyPreview(orangeWithReply), "Bonjour, nous avons fermé notre propriété.");

const frenchHeader = "Merci, ce n'est plus disponible.\n\nDe: contact@trevoro.ro\nEnvoyé: mardi, 16 juin 2026, 12:49\nÀ: client@example.test\nObjet: List your property on Trevoro\nHello, We are contacting you from Trevoro.";

assert.equal(stripQuotedEmailText(frenchHeader), "Merci, ce n'est plus disponible.");

console.log("email reply cleaner tests passed");

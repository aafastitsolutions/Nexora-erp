const SUPPORTED_LANGUAGES = new Set(["ro", "en"]);

const RO_TO_EN = {
  "Deschide modulul": "Open module",
  "Setările au fost salvate.": "Settings have been saved.",
  "Abonamentul a fost actualizat.": "Subscription has been updated.",
  "Modulele active au fost actualizate.": "Active modules have been updated.",
  "Logo-ul de factură a fost actualizat.": "Invoice logo has been updated.",
  "Operațiunea a fost finalizată.": "The operation was completed.",
  "Operațiunea nu a putut fi finalizată.": "The operation could not be completed.",
  "Alege un fișier înainte de upload.": "Choose a file before upload.",
  "Modulele companiei sunt gestionate de super admin pe baza contractului.": "Company modules are managed by the super admin according to the contract.",
  "Setări generale": "General settings",
  "Date firmă": "Company details",
  "Abonament & module": "Subscription & modules",
  "Factură": "Invoice",
  "Logo": "Logo",
  "Interfață": "Interface",
  "Limbă aplicație": "Application language",
  "Limba aplicației": "Application language",
  "Alege limba în care vrei să vezi interfața Nexora.": "Choose the language used by the Nexora interface.",
  "Română": "Romanian",
  "Engleză": "English",
  "Salvează limba": "Save language",
  "Configurare companie, facturare, abonament, module și conectare ANAF pentru workspace-ul curent.": "Configure company details, invoicing, subscription, modules and ANAF connection for the current workspace.",
  "Identitate, reprezentant, CUI, TVA": "Identity, representative, VAT ID, VAT",
  "Plan, locuri, acces module": "Plan, seats, module access",
  "Serie, culoare, footer PDF": "Series, color, PDF footer",
  "Logo folosit pe facturi": "Logo used on invoices",
  "ANAF, OAuth, inbox/outbox": "ANAF, OAuth, inbox/outbox",
  "Contul tău": "Your account",
  "Preferință personală pentru limbă": "Personal language preference",
  "Companie": "Company",
  "Abonament": "Subscription",
  "Utilizatori": "Users",
  "Module active": "Active modules",
  "CUI neconfigurat": "VAT ID not configured",
  "Fără plan": "No plan",
  "locuri active": "active seats",
  "operaționale": "operational",
  "Utilizatori & roluri": "Users & roles",
  "Dashboard": "Dashboard",
  "Nume firmă": "Company name",
  "Registrul Comerțului": "Trade registry",
  "Reprezentant": "Representative",
  "Seria CI reprezentant": "Representative ID series",
  "Număr CI reprezentant": "Representative ID number",
  "CI eliberată de": "ID issued by",
  "Bancă": "Bank",
  "Telefon": "Phone",
  "Plătitor TVA": "VAT payer",
  "Capital social": "Share capital",
  "Adresă": "Address",
  "Motiv scutire TVA": "VAT exemption reason",
  "Salvează datele firmei": "Save company details",
  "administrator companie": "company administrator",
  "doar administratorul poate modifica": "only the administrator can edit",
  "Salvează abonamentul": "Save subscription",
  "Stripe checkout": "Stripe checkout",
  "Portal billing": "Billing portal",
  "Stripe este configurat.": "Stripe is configured.",
  "Stripe nu este configurat.": "Stripe is not configured.",
  "Webhook activ.": "Webhook active.",
  "Webhook lipsă.": "Webhook missing.",
  "Contract companie": "Company contract",
  "Modulele active sunt setate de super admin pentru companie. Accesul pentru fiecare persoană se acordă în Utilizatori & roluri.": "Active modules are set by the super admin for the company. Access for each person is granted in Users & roles.",
  "Salvează modulele": "Save modules",
  "Setări factură": "Invoice settings",
  "Numerotare, culoare PDF și footer": "Numbering, PDF color and footer",
  "Serie / număr de pornire": "Series / starting number",
  "Exemple: INV sau FITS-049.": "Examples: INV or FITS-049.",
  "Culoare factură": "Invoice color",
  "Footer factură": "Invoice footer",
  "Salvează factura": "Save invoice",
  "Logo factură": "Invoice logo",
  "Fișier separat pentru compania curentă": "Separate file for the current company",
  "Upload logo": "Upload logo",
  "Mediu ANAF": "ANAF environment",
  "Producție": "Production",
  "Conectează SPV": "Connect SPV",
  "Status ANAF": "ANAF status",
  "Inbox / sincronizare": "Inbox / sync",
  "Outbox": "Outbox",
  "Da": "Yes",
  "Nu": "No",
  "Logout": "Logout",
  "Forbidden": "Forbidden",

  "Financiar & Contabilitate": "Finance & Accounting",
  "Contabilitate generală": "General accounting",
  "Facturi": "Invoices",
  "Cheltuieli": "Expenses",
  "Declarații": "Declarations",
  "Trezorerie": "Treasury",
  "Plăți": "Payments",
  "Încasări": "Receipts",
  "Cashflow / lichidități": "Cashflow / liquidity",
  "Bugete": "Budgets",
  "Reconciliere bancară": "Bank reconciliation",
  "Registre": "Registers",
  "Bonuri de consum": "Consumption slips",
  "Balanță": "Trial balance",
  "Active fixe / Imobilizări": "Fixed assets",
  "ANAF Inbox": "ANAF Inbox",
  "ANAF Outbox": "ANAF Outbox",

  "Vânzări": "Sales",
  "Oferte": "Offers",
  "Comenzi": "Orders",
  "Clienți": "Clients",
  "Prețuri": "Prices",
  "Discounturi": "Discounts",
  "Contracte": "Contracts",
  "Livrări": "Deliveries",
  "Relații clienți": "Customer relations",
  "Lead-uri": "Leads",
  "Pipeline": "Pipeline",
  "Follow-up": "Follow-up",
  "Activități": "Activities",
  "Email tracking": "Email tracking",
  "Inventar & Gestiune": "Inventory & Stock Management",
  "Stocuri": "Stocks",
  "Registru active / Imobilizări": "Asset register / fixed assets",
  "Proiecte inventar": "Inventory projects",
  "Produse": "Products",
  "Depozite": "Warehouses",
  "Loturi / Serii": "Lots / Serial numbers",
  "Transferuri": "Transfers",
  "Inventar": "Inventory",
  "Recepții": "Receipts",
  "Picking / Packing": "Picking / Packing",
  "Coduri de bare": "Barcodes",
  "Achiziții": "Procurement",
  "Furnizori": "Suppliers",
  "Comenzi achiziție": "Purchase orders",
  "Aprobări achiziții": "Purchase approvals",
  "Costuri": "Costs",
  "Facturi furnizori": "Supplier bills",
  "Resurse Umane": "Human Resources",
  "Angajați": "Employees",
  "Payroll": "Payroll",
  "Concedii": "Leave",
  "Pontaj": "Timesheets",
  "Recrutare": "Recruitment",
  "Evaluări": "Reviews",
  "Producție / Plan necesar": "Production / Requirements planning",
  "Rețetar / listă materiale": "Bill of materials / recipe",
  "Ordine producție": "Production orders",
  "Plan necesar materiale": "Material requirements planning",
  "Consum materiale": "Material consumption",
  "Cost producție": "Production cost",
  "Control calitate": "Quality control",
  "Restaurant / Horeca": "Restaurant / Horeca",
  "Dashboard sală": "Floor dashboard",
  "Mese & sală restaurant": "Tables & dining room",
  "Comenzi pe masă": "Table orders",
  "POS vânzare rapidă": "Quick-sale POS",
  "Meniuri & produse": "Menus & products",
  "Rețetare": "Recipes",
  "Consum ingrediente": "Ingredient consumption",
  "Stoc bucătărie/bar": "Kitchen/bar stock",
  "Note de plată": "Bills",
  "Split bill": "Split bill",
  "Bacșiș": "Tips",
  "Rezervări": "Reservations",
  "Livrări / Takeaway": "Delivery / Takeaway",
  "Rapoarte ospătar/masă/produs/zi": "Reports by waiter/table/product/day",
  "Casă de marcat & e-Factura": "Cash register & e-Invoice",
  "Aplicații mobile": "Mobile apps",
  "Dashboard mobil": "Mobile dashboard",
  "Agenți vânzări": "Sales agents",
  "Tehnicieni / intervenții": "Technicians / field jobs",
  "Manager dashboard": "Manager dashboard",
  "Scanare coduri bare / QR": "Barcode / QR scanning",
  "Notificări push": "Push notifications",
  "Aprobări documente": "Document approvals",
  "Poze & semnături teren": "Field photos & signatures",
  "Pontaj / geolocație": "Timesheet / geolocation",
  "Comenzi rapide": "Quick orders",
  "Inventar mobil": "Mobile inventory",
  "Clienți / facturi / stocuri": "Clients / invoices / stocks",
  "Dispozitive": "Devices",
  "Fluxuri mobile": "Mobile flows",
  "Task-uri mobile": "Mobile tasks",
  "Sesiuni & PIN": "Sessions & PIN",
  "Supply Chain": "Supply Chain",
  "Logistică": "Logistics",
  "Transport": "Transport",
  "Distribuție": "Distribution",
  "Forecasting / previziuni": "Forecasting / predictions",
  "Proiecte": "Projects",
  "Portofoliu proiecte": "Project portfolio",
  "Adaugă proiect": "Add project",
  "Task-uri": "Tasks",
  "Rapoarte & BI (Business Intelligence)": "Reports & BI (Business Intelligence)",
  "Dashboard BI": "BI dashboard",
  "Dashboard-uri": "Dashboards",
  "Rapoarte": "Reports",
  "Export Excel / PDF": "Excel / PDF export",
  "Analytics": "Analytics",
  "Order Management (Management comenzi)": "Order Management",
  "Lifecycle comandă": "Order lifecycle",
  "Fulfillment": "Fulfillment",
  "Tracking": "Tracking",
  "Status livrare": "Delivery status",
  "Documente / DMS": "Documents / DMS",
  "Documente": "Documents",
  "Dosar Client": "Client file",
  "Completare automată": "Auto-fill",
  "Registru evidență": "Register",
  "Tipizate": "Templates",
  "Versiuni": "Versions",
  "Semnături": "Signatures",
  "Atașamente facturi": "Invoice attachments",
  "Workflow & Automatizări": "Workflow & Automation",
  "RPA Dashboard": "RPA Dashboard",
  "RPA Studio": "RPA Studio",
  "Automatizare facturi": "Invoice automation",
  "Reguli business": "Business rules",
  "Aprobări": "Approvals",
  "Notificări": "Notifications",
  "Istoric rulări": "Run history",
  "eCommerce & POS": "eCommerce & POS",
  "Magazin online": "Online store",
  "Sincronizare stocuri": "Stock sync",
  "Administrare platformă": "Platform administration",
  "Dashboard platformă": "Platform dashboard",
  "Companii": "Companies",
  "Setări": "Settings",
  "Setări generale": "General settings",
  "Module active": "Active modules",

  "Căutare": "Search",
  "Caută": "Search",
  "caută": "search",
  "Filtre": "Filters",
  "Status": "Status",
  "Acțiuni": "Actions",
  "Observații": "Notes",
  "Descriere": "Description",
  "Denumire": "Name",
  "Categorie": "Category",
  "Client": "Client",
  "Furnizor": "Supplier",
  "Produs": "Product",
  "Serviciu": "Service",
  "Preț": "Price",
  "Total": "Total",
  "Valoare": "Value",
  "Cantitate": "Quantity",
  "Responsabil": "Owner",
  "Prioritate": "Priority",
  "Termen": "Due date",
  "Data": "Date",
  "Perioadă": "Period",
  "Monedă": "Currency",
  "Tip": "Type",
  "Etapă": "Stage",
  "Sursă": "Source",
  "Adresă livrare": "Delivery address",
  "Persoană contact": "Contact person",
  "Telefon": "Phone",
  "Curier": "Courier",
  "Locație": "Location",
  "Comandă": "Order",
  "Livrare": "Delivery",
  "Eveniment": "Event",
  "Istoric": "History",
  "În lucru": "In progress",
  "Finalizat": "Completed",
  "Finalizată": "Completed",
  "Planificat": "Planned",
  "Pregătită": "Prepared",
  "Confirmată": "Confirmed",
  "Livrată": "Delivered",
  "Anulată": "Cancelled",
  "Blocat": "Blocked",
  "Întârziată": "Delayed",
  "Nouă": "New",
  "Deschisă": "Open",
  "Închisă": "Closed",
  "Draft": "Draft",
  "Aprobat": "Approved",
  "Respins": "Rejected",
  "Trimisă": "Sent",
  "Acceptată": "Accepted",
  "Expirată": "Expired",
  "Activ": "Active",
  "Inactiv": "Inactive",
  "toate": "all",
  "nouă": "new",
  "confirmată": "confirmed",
  "în lucru": "in progress",
  "livrată": "delivered",
  "anulată": "cancelled",
  "deschise": "open",
  "active": "active",
  "operaționale active": "active operational",
  "Salvează": "Save",
  "Creează": "Create",
  "Adaugă": "Add",
  "Actualizează": "Update",
  "Deschide": "Open",
  "Înapoi": "Back",
  "Aplică": "Apply",
  "Reset": "Reset",
  "Încarcă": "Upload",
  "Descarcă": "Download",
  "Generează": "Generate",
  "Importă": "Import",
  "Exportă": "Export",
  "Alege": "Choose",
  "Nu există înregistrări.": "No records.",
  "Nu există": "No",
  "Fără": "No",
  "Alege produs": "Choose product",
  "Alege comanda": "Choose order",
  "Fără comandă": "No order",
  "Fără livrare": "No delivery",
  "Fără depozit": "No warehouse",
  "Toate": "All",
  "Astăzi": "Today",
  "Lună": "Month",
  "An": "Year",
  "Ultimele": "Latest",
  "Recente": "Recent",
  "General": "General"
};

const REPLACEMENTS = Object.entries(RO_TO_EN)
  .sort((left, right) => right[0].length - left[0].length)
  .map(([source, target]) => [phrasePattern(source), target]);

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phrasePattern(source = "") {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(source)}(?![\\p{L}\\p{N}_])`, "gu");
}

function normalizeLanguage(value = "") {
  const normalized = String(value || "").trim().toLowerCase().slice(0, 2);
  return SUPPORTED_LANGUAGES.has(normalized) ? normalized : "ro";
}

function getRequestLanguage(req) {
  const cookieLanguage = parseCookieValue(req?.headers?.cookie || "", "nexora_lang");
  return normalizeLanguage(
    req?.session?.user?.language ||
    req?.session?.language ||
    req?.cookies?.nexora_lang ||
    cookieLanguage ||
    "ro"
  );
}

function parseCookieValue(cookieHeader = "", key = "") {
  const target = String(key || "").trim();
  if (!target) return "";
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const index = part.indexOf("=");
      return index >= 0 ? [part.slice(0, index), part.slice(index + 1)] : [part, ""];
    })
    .find(([name]) => name === target)?.[1] || "";
}

function translateText(text = "", lang = "ro") {
  if (lang !== "en") return text;
  const raw = String(text ?? "");
  if (!raw.trim()) return raw;
  const leading = raw.match(/^\s*/)?.[0] || "";
  const trailing = raw.match(/\s*$/)?.[0] || "";
  let core = raw.slice(leading.length, raw.length - trailing.length);
  if (!core.trim()) return raw;

  if (RO_TO_EN[core]) return `${leading}${RO_TO_EN[core]}${trailing}`;
  for (const [pattern, replacement] of REPLACEMENTS) {
    core = core.replace(pattern, replacement);
  }
  return `${leading}${core}${trailing}`;
}

function translateTagAttributes(tag = "", lang = "ro") {
  if (lang !== "en") return tag;
  return String(tag).replace(/\b(placeholder|title|aria-label|alt)=("([^"]*)"|'([^']*)')/giu, (match, attr, quoted, doubleValue, singleValue) => {
    const quote = quoted.startsWith("'") ? "'" : '"';
    const value = doubleValue ?? singleValue ?? "";
    return `${attr}=${quote}${translateText(value, lang)}${quote}`;
  });
}

function tagNameOf(tag = "") {
  const match = String(tag).match(/^<\/?\s*([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : "";
}

function translateHtml(html = "", lang = "ro") {
  if (lang !== "en" || typeof html !== "string" || !html) return html;
  const source = html.replace(/<html([^>]*)lang=(["'])ro\2([^>]*)>/i, "<html$1lang=\"en\"$3>");
  const tagPattern = /<[^>]*>/g;
  const skipTags = new Set(["script", "style", "pre", "code", "textarea"]);
  let output = "";
  let cursor = 0;
  let skip = "";
  let match;

  while ((match = tagPattern.exec(source))) {
    const text = source.slice(cursor, match.index);
    output += skip ? text : translateText(text, lang);

    const tag = match[0];
    const name = tagNameOf(tag);
    const isClosing = /^<\//.test(tag);
    const isSelfClosing = /\/>$/.test(tag);

    output += skip ? tag : translateTagAttributes(tag, lang);

    if (name && skipTags.has(name)) {
      if (isClosing && skip === name) skip = "";
      else if (!isClosing && !isSelfClosing) skip = name;
    }
    cursor = match.index + tag.length;
  }

  output += skip ? source.slice(cursor) : translateText(source.slice(cursor), lang);
  return output;
}

function i18nMiddleware() {
  return (req, res, next) => {
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      const language = getRequestLanguage(req);
      const contentType = String(res.getHeader("content-type") || "").toLowerCase();
      const isHtml = typeof body === "string" && (
        contentType.includes("text/html") ||
        body.trimStart().startsWith("<!doctype html") ||
        body.trimStart().startsWith("<html")
      );
      if (language === "en" && isHtml) {
        res.setHeader("Content-Language", "en");
        return originalSend(translateHtml(body, language));
      }
      if (language === "ro" && isHtml) res.setHeader("Content-Language", "ro");
      return originalSend(body);
    };
    next();
  };
}

export {
  SUPPORTED_LANGUAGES,
  getRequestLanguage,
  i18nMiddleware,
  normalizeLanguage,
  translateHtml,
  translateText
};

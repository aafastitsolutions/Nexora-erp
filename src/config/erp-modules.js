const ERP_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "home",
    path: "/nexora-dashboard",
    legacyModuleKeys: ["dashboard"],
    children: []
  },
  {
    key: "finance",
    label: "Financiar & Contabilitate",
    icon: "file-text",
    path: "/nexora/accounting",
    legacyModuleKeys: ["facturi", "accounting"],
    children: [
      { label: "Contabilitate generală", path: "/nexora/accounting" },
      { label: "Facturi", path: "/nexora/facturi" },
      { label: "Cheltuieli", path: "/nexora/accounting/expenses" },
      { label: "Declarații", path: "/nexora/accounting/declarations" },
      {
        label: "Trezorerie",
        path: "/nexora/accounting/cashflow",
        children: [
          { label: "Plăți", path: "/nexora/accounting/payments" },
          { label: "Încasări", path: "/nexora/accounting/receipts" },
          { label: "Cashflow / lichidități", path: "/nexora/accounting/cashflow" },
          { label: "Bugete", path: "/nexora/accounting/budgets" },
          { label: "Reconciliere bancară", path: "/nexora/accounting/bank-reconciliation" }
        ]
      },
      { label: "Registre", path: "/nexora/accounting/registers" },
      { label: "Bonuri de consum", path: "/nexora/accounting/consumption" },
      { label: "Balanță", path: "/nexora/accounting/trial-balance" },
      { label: "TVA", path: "/nexora/accounting/vat" },
      { label: "Active fixe / Imobilizări", path: "/nexora/accounting/fixed-assets" },
      {
        label: "ANAF e-Factura",
        path: "/nexora/anaf/status",
        children: [
          { label: "Status ANAF", path: "/nexora/anaf/status" },
          { label: "ANAF Inbox", path: "/nexora/anaf/inbox" },
          { label: "ANAF Outbox", path: "/nexora/anaf/outbox" }
        ]
      }
    ]
  },
  {
    key: "sales",
    label: "Vânzări",
    icon: "trending-up",
    path: "/nexora/sales",
    legacyModuleKeys: ["quotes", "contracts", "facturi", "clients"],
    children: [
      { label: "Oferte", path: "/nexora/quotes" },
      { label: "Import oferte", path: "/nexora/sales/import-foldere-oferte" },
      { label: "Comenzi", path: "/nexora/orders" },
      { label: "Clienți", path: "/nexora/clients" },
      { label: "Prețuri", path: "/nexora/sales/prices" },
      { label: "Discounturi", path: "/nexora/sales/discounts" },
      { label: "Contracte", path: "/nexora/contracts" },
      { label: "Livrări", path: "/nexora/deliveries" }
    ]
  },
  {
    key: "crm",
    label: "CRM",
    icon: "users",
    path: "/nexora/crm",
    legacyModuleKeys: ["clients"],
    children: [
      { label: "Lead Builder", path: "/nexora/lead-builder" },
      { label: "Lead-uri", path: "/nexora/crm/leads" },
      { label: "Pipeline", path: "/nexora/crm/pipeline" },
      { label: "Follow-up", path: "/nexora/crm/follow-up" },
      { label: "Activități", path: "/nexora/crm/activities" },
      { label: "Email tracking", path: "/nexora/crm/email-tracking" },
      { label: "Relații clienți", path: "/nexora/clients" }
    ]
  },
  {
    key: "inventory",
    label: "Inventar & Gestiune",
    icon: "box",
    path: "/nexora/inventory",
    legacyModuleKeys: ["produse", "inventory"],
    children: [
      { label: "Stocuri", path: "/nexora/inventory" },
      { label: "Registru active / Imobilizări", path: "/nexora/inventory/assets" },
      { label: "Proiecte inventar", path: "/nexora/inventory/projects" },
      { label: "Produse", path: "/nexora/products" },
      { label: "Depozite", path: "/nexora/inventory/warehouses" },
      { label: "Loturi / Serii", path: "/nexora/inventory/lots" },
      { label: "Transferuri", path: "/nexora/inventory/transfers" },
      { label: "Inventar", path: "/nexora/inventory/counts" },
      { label: "Recepții", path: "/nexora/inventory/receipts" },
      { label: "Picking / Packing", path: "/nexora/inventory/picking" },
      { label: "Coduri de bare", path: "/nexora/inventory/barcodes" }
    ]
  },
  {
    key: "procurement",
    label: "Achiziții",
    icon: "shopping-cart",
    path: "/nexora/procurement",
    legacyModuleKeys: [],
    children: [
      { label: "Radar IT/software", path: "/nexora/procurement/opportunities" },
      { label: "Furnizori", path: "/nexora/procurement/suppliers" },
      { label: "Comenzi achiziție", path: "/nexora/procurement/orders" },
      { label: "Recepții", path: "/nexora/procurement/receipts" },
      { label: "Aprobări achiziții", path: "/nexora/procurement/approvals" },
      { label: "Costuri", path: "/nexora/procurement/costs" },
      { label: "Facturi furnizori", path: "/nexora/procurement/bills" }
    ]
  },
  {
    key: "hr",
    label: "Resurse Umane",
    icon: "id-card",
    path: "/nexora/employees",
    legacyModuleKeys: ["employees"],
    children: [
      { label: "Angajați", path: "/nexora/employees" },
      { label: "Contracte", path: "/nexora/hr/contracts" },
      { label: "Payroll", path: "/nexora/hr/payroll" },
      { label: "Concedii", path: "/nexora/hr/leave" },
      { label: "Pontaj", path: "/nexora/hr/timesheets" },
      { label: "Recrutare", path: "/nexora/hr/recruitment" },
      { label: "Evaluări", path: "/nexora/hr/reviews" }
    ]
  },
  {
    key: "manufacturing",
    label: "Producție / Plan necesar",
    icon: "settings",
    path: "/nexora/manufacturing",
    legacyModuleKeys: [],
    children: [
      { label: "Rețetar / listă materiale", path: "/nexora/manufacturing/bom" },
      { label: "Ordine producție", path: "/nexora/manufacturing/orders" },
      { label: "Plan necesar materiale", path: "/nexora/manufacturing/planning" },
      { label: "Consum materiale", path: "/nexora/manufacturing/materials" },
      { label: "Cost producție", path: "/nexora/manufacturing/costs" },
      { label: "Control calitate", path: "/nexora/manufacturing/quality" }
    ]
  },
  {
    key: "restaurant",
    label: "Restaurant / Horeca",
    icon: "restaurant",
    path: "/nexora/horeca",
    legacyModuleKeys: [],
    children: [
      { label: "Dashboard sală", path: "/nexora/horeca" },
      { label: "Mese & sală restaurant", path: "/nexora/horeca/tables" },
      { label: "Comenzi pe masă", path: "/nexora/horeca/orders" },
      { label: "POS vânzare rapidă", path: "/nexora/horeca/pos" },
      { label: "Meniuri & produse", path: "/nexora/horeca/menu" },
      { label: "Rețetare", path: "/nexora/horeca/recipes" },
      { label: "Consum ingrediente", path: "/nexora/horeca/consumption" },
      { label: "Stoc bucătărie/bar", path: "/nexora/horeca/stock" },
      { label: "Note de plată", path: "/nexora/horeca/checks" },
      { label: "Split bill", path: "/nexora/horeca/split-bill" },
      { label: "Bacșiș", path: "/nexora/horeca/tips" },
      { label: "Rezervări", path: "/nexora/horeca/reservations" },
      { label: "Livrări / Takeaway", path: "/nexora/horeca/takeaway" },
      { label: "Rapoarte ospătar/masă/produs/zi", path: "/nexora/horeca/reports" },
      { label: "Casă de marcat & e-Factura", path: "/nexora/horeca/fiscal" }
    ]
  },
  {
    key: "travel",
    label: "Travel",
    icon: "map",
    path: "/nexora/travel/dashboard",
    legacyModuleKeys: [],
    children: [
      { label: "Dashboard", path: "/nexora/travel/dashboard" },
      { label: "International", path: "/nexora/travel/international" },
      { label: "Lead-uri Proprietăți", path: "/nexora/travel/leads" },
      { label: "Kanban Lead-uri", path: "/nexora/travel/kanban" },
      { label: "Lead-uri Trevoro", path: "/nexora/travel/leads?source=trevoro_landing" },
      { label: "Agenții", path: "/nexora/travel/agencies" },
      { label: "Proprietăți", path: "/nexora/travel/properties" },
      { label: "Inbox Support", path: "/nexora/travel/support" },
      { label: "Integrări", path: "/nexora/travel/integrations" },
      { label: "Content Factory", path: "/nexora/travel/content-factory" },
      { label: "Social Posts", path: "/nexora/travel/social-posts" },
      { label: "Grupuri Social", path: "/nexora/travel/social-groups" },
      { label: "Campanie 14 zile", path: "/nexora/travel/social-campaign" },
      { label: "SEO Pages", path: "/nexora/travel/seo-pages" },
      { label: "Campaigns", path: "/nexora/travel/campaigns" },
      { label: "Importuri", path: "/nexora/travel/imports" },
      { label: "Setări", path: "/nexora/travel/settings" }
    ]
  },
  {
    key: "emarqet",
    label: "e-Marqet",
    icon: "marketplace",
    path: "/nexora/e-marqet",
    legacyModuleKeys: [],
    children: [
      { label: "Dashboard", path: "/nexora/e-marqet" },
      { label: "Listări", path: "/nexora/e-marqet/listings" },
      { label: "Parteneri", path: "/nexora/e-marqet/partners" },
      { label: "Lead-uri", path: "/nexora/e-marqet/leads" },
      { label: "Abonamente", path: "/nexora/e-marqet/subscriptions" },
      { label: "Email & Suport", path: "/nexora/e-marqet/email" },
      { label: "Servicii", path: "/nexora/e-marqet/services" },
      { label: "Social", path: "/nexora/e-marqet/social" },
      { label: "Verticale", path: "/nexora/e-marqet/verticals" },
      { label: "Setări", path: "/nexora/e-marqet/settings" }
    ]
  },
  {
    key: "mobile_apps",
    label: "Aplicații mobile",
    icon: "smartphone",
    path: "/nexora/mobile-apps",
    legacyModuleKeys: [],
    children: [
      { label: "Dashboard mobil", path: "/nexora/mobile-apps" },
      { label: "Agenți vânzări", path: "/nexora/mobile-apps/sales-agents" },
      { label: "Tehnicieni / intervenții", path: "/nexora/mobile-apps/technicians" },
      { label: "Manager dashboard", path: "/nexora/mobile-apps/manager" },
      { label: "Scanare coduri bare / QR", path: "/nexora/mobile-apps/scanning" },
      { label: "Notificări push", path: "/nexora/mobile-apps/push" },
      { label: "Aprobări documente", path: "/nexora/mobile-apps/approvals" },
      { label: "Poze & semnături teren", path: "/nexora/mobile-apps/field-proof" },
      { label: "Pontaj / geolocație", path: "/nexora/mobile-apps/time-location" },
      { label: "Comenzi rapide", path: "/nexora/mobile-apps/quick-orders" },
      { label: "Inventar mobil", path: "/nexora/mobile-apps/mobile-inventory" },
      { label: "Clienți / facturi / stocuri", path: "/nexora/mobile-apps/client-data" },
      { label: "Dispozitive", path: "/nexora/mobile-apps/devices" },
      { label: "Fluxuri mobile", path: "/nexora/mobile-apps/workflows" },
      { label: "Task-uri mobile", path: "/nexora/mobile-apps/tasks" },
      { label: "Sesiuni & PIN", path: "/nexora/mobile-apps/sessions" }
    ]
  },
  {
    key: "scm",
    label: "Supply Chain",
    icon: "truck",
    path: "/nexora/supply-chain",
    legacyModuleKeys: [],
    children: [
      { label: "Dashboard Supply Chain", path: "/nexora/supply-chain" },
      { label: "Logistică", path: "/nexora/supply-chain/logistics" },
      { label: "Transport", path: "/nexora/supply-chain/transport" },
      { label: "Distribuție", path: "/nexora/supply-chain/distribution" },
      { label: "Forecasting / previziuni", path: "/nexora/supply-chain/forecasting" }
    ]
  },
  {
    key: "projects",
    label: "Proiecte",
    icon: "folder",
    path: "/nexora/projects",
    legacyModuleKeys: ["projects"],
    children: [
      { label: "Portofoliu proiecte", path: "/nexora/projects" },
      { label: "Adaugă proiect", path: "/nexora/projects/new" },
      { label: "Task-uri", path: "/nexora/projects/tasks" },
    ]
  },
  {
    key: "reports",
    label: "Rapoarte & BI (Business Intelligence)",
    icon: "bar-chart",
    path: "/nexora/reports",
    legacyModuleKeys: [],
    children: [
      { label: "Dashboard BI", path: "/nexora/reports" },
      { label: "Dashboard-uri", path: "/nexora/reports/dashboards" },
      { label: "KPI", path: "/nexora/reports/kpi" },
      { label: "Rapoarte", path: "/nexora/reports/saved" },
      { label: "Export Excel / PDF", path: "/nexora/reports/exports" },
      { label: "Analytics", path: "/nexora/reports/analytics" }
    ]
  },
  {
    key: "orders",
    label: "Order Management (Management comenzi)",
    icon: "clipboard-list",
    path: "/nexora/orders",
    legacyModuleKeys: [],
    children: [
      { label: "Comenzi", path: "/nexora/orders" },
      { label: "Lifecycle comandă", path: "/nexora/orders/lifecycle" },
      { label: "Fulfillment", path: "/nexora/orders/fulfillment" },
      { label: "Tracking", path: "/nexora/orders/tracking" },
      { label: "Status livrare", path: "/nexora/orders/delivery-status" }
    ]
  },
  {
    key: "documents",
    label: "Documente / DMS",
    icon: "files",
    path: "/nexora/documents",
    legacyModuleKeys: ["tipizate"],
    children: [
      { label: "Documente", path: "/nexora/documents" },
      { label: "Dosar Client", path: "/nexora/documents/client-files", companyAdminOnly: true },
      { label: "Completare automată", path: "/nexora/documents#autofill" },
      { label: "Registru evidență", path: "/nexora/documents/register" },
      { label: "Tipizate", path: "/nexora/documents/templates" },
      { label: "OCR", path: "/nexora/documents/ocr" },
      { label: "Versiuni", path: "/nexora/documents/versions" },
      { label: "Semnături", path: "/nexora/documents/signatures" },
      { label: "Atașamente facturi", path: "/nexora/documents/invoice-attachments" }
    ]
  },
  {
    key: "workflow",
    label: "Workflow & Automatizări",
    icon: "workflow",
    path: "/nexora/workflow",
    legacyModuleKeys: [],
    children: [
      { label: "RPA Dashboard", path: "/nexora/workflow" },
      { label: "RPA Studio", path: "/nexora/workflow/automations" },
      { label: "Automatizare facturi", path: "/nexora/workflow/invoice-automation" },
      { label: "Reguli business", path: "/nexora/workflow/rules" },
      { label: "Aprobări", path: "/nexora/workflow/approvals" },
      { label: "Notificări", path: "/nexora/workflow/notifications" },
      { label: "Istoric rulări", path: "/nexora/workflow/runs" }
    ]
  },
  {
    key: "ecommerce",
    label: "eCommerce & POS",
    icon: "store",
    path: "/nexora/ecommerce",
    legacyModuleKeys: [],
    children: [
      { label: "Magazin online", path: "/nexora/ecommerce/store" },
      { label: "POS", path: "/nexora/pos" },
      { label: "Sincronizare stocuri", path: "/nexora/ecommerce/stock-sync" },
      { label: "Plăți", path: "/nexora/ecommerce/payments" }
    ]
  },
  {
    key: "platform",
    label: "Administrare platformă",
    icon: "shield",
    path: "/nexora/super-admin",
    legacyModuleKeys: [],
    superAdminOnly: true,
    children: [
      { label: "Dashboard platformă", path: "/nexora/super-admin" },
      { label: "Companii", path: "/nexora/super-admin/companies" },
      { label: "Plăți", path: "/nexora/super-admin/payments" },
      { label: "Reconciliere Stripe", path: "/nexora/super-admin/stripe-reconciliation" }
    ]
  },
  {
    key: "settings",
    label: "Setări",
    icon: "sliders",
    path: "/nexora/settings",
    legacyModuleKeys: ["setari", "accounts"],
    children: [
      { label: "Setări generale", path: "/nexora/settings?tab=company" },
      { label: "Limbă aplicație", path: "/nexora/settings?tab=language" },
      { label: "Utilizatori & roluri", path: "/nexora/users" },
      { label: "Abonament", path: "/nexora/settings?tab=subscription" },
      { label: "Module active", path: "/nexora/settings?tab=subscription" },
      { label: "SPV / e-Factura", path: "/nexora/settings?tab=spv" }
    ]
  }
];

export {
  ERP_MODULES
};

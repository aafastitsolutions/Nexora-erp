const ERP_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "home",
    path: "/dashboard",
    legacyModuleKeys: ["dashboard"],
    children: []
  },
  {
    key: "finance",
    label: "Financiar & Contabilitate",
    icon: "file-text",
    path: "/facturi",
    legacyModuleKeys: ["facturi", "accounting"],
    children: [
      { label: "Contabilitate generală", path: "/accounting" },
      { label: "Facturi", path: "/facturi" },
      { label: "Plăți", path: "/accounting/payments" },
      { label: "Încasări", path: "/accounting/receipts" },
      { label: "Registre", path: "/accounting/registers" },
      { label: "Balanță", path: "/accounting/trial-balance" },
      { label: "Cashflow", path: "/accounting/cashflow" },
      { label: "Bugete", path: "/accounting/budgets" },
      { label: "Reconciliere bancară", path: "/accounting/bank-reconciliation" },
      { label: "TVA", path: "/accounting/vat" },
      { label: "Active fixe", path: "/accounting/fixed-assets" },
      { label: "ANAF e-Factura", path: "/anaf/outbox" }
    ]
  },
  {
    key: "sales",
    label: "Vânzări",
    icon: "trending-up",
    path: "/quotes",
    legacyModuleKeys: ["quotes", "contracts", "facturi", "clients"],
    children: [
      { label: "Oferte", path: "/quotes" },
      { label: "Comenzi", path: "/orders" },
      { label: "Clienți", path: "/clients" },
      { label: "Prețuri", path: "/sales/prices" },
      { label: "Discounturi", path: "/sales/discounts" },
      { label: "Contracte", path: "/contracte" },
      { label: "Facturare", path: "/facturi" },
      { label: "Livrări", path: "/deliveries" }
    ]
  },
  {
    key: "crm",
    label: "CRM",
    icon: "users",
    path: "/clients",
    legacyModuleKeys: ["clients"],
    children: [
      { label: "Lead-uri", path: "/crm/leads" },
      { label: "Pipeline", path: "/crm/pipeline" },
      { label: "Follow-up", path: "/crm/follow-up" },
      { label: "Activități", path: "/crm/activities" },
      { label: "Email tracking", path: "/crm/email-tracking" },
      { label: "Relații clienți", path: "/clients" }
    ]
  },
  {
    key: "inventory",
    label: "Inventar & Gestiune",
    icon: "box",
    path: "/inventory",
    legacyModuleKeys: ["produse", "inventory"],
    children: [
      { label: "Stocuri", path: "/inventory" },
      { label: "Produse", path: "/produse" },
      { label: "Depozite", path: "/inventory/warehouses" },
      { label: "Loturi / Serii", path: "/inventory/lots" },
      { label: "Transferuri", path: "/inventory/transfers" },
      { label: "Inventar", path: "/inventory/counts" },
      { label: "Recepții", path: "/inventory/receipts" },
      { label: "Picking / Packing", path: "/inventory/picking" },
      { label: "Coduri de bare", path: "/inventory/barcodes" }
    ]
  },
  {
    key: "procurement",
    label: "Achiziții",
    icon: "shopping-cart",
    path: "/procurement",
    legacyModuleKeys: [],
    children: [
      { label: "Furnizori", path: "/procurement/suppliers" },
      { label: "Comenzi achiziție", path: "/procurement/orders" },
      { label: "Recepții", path: "/procurement/receipts" },
      { label: "Aprobări achiziții", path: "/procurement/approvals" },
      { label: "Costuri", path: "/procurement/costs" },
      { label: "Facturi furnizori", path: "/procurement/bills" }
    ]
  },
  {
    key: "hr",
    label: "Resurse Umane",
    icon: "id-card",
    path: "/employees",
    legacyModuleKeys: ["employees"],
    children: [
      { label: "Angajați", path: "/employees" },
      { label: "Contracte", path: "/hr/contracts" },
      { label: "Payroll", path: "/hr/payroll" },
      { label: "Concedii", path: "/hr/leave" },
      { label: "Pontaj", path: "/hr/timesheets" },
      { label: "Recrutare", path: "/hr/recruitment" },
      { label: "Evaluări", path: "/hr/reviews" }
    ]
  },
  {
    key: "manufacturing",
    label: "Producție / MRP",
    icon: "settings",
    path: "/manufacturing",
    legacyModuleKeys: [],
    children: [
      { label: "BOM", path: "/manufacturing/bom" },
      { label: "Ordine producție", path: "/manufacturing/orders" },
      { label: "Planificare", path: "/manufacturing/planning" },
      { label: "Consum materiale", path: "/manufacturing/materials" },
      { label: "Cost producție", path: "/manufacturing/costs" },
      { label: "Quality control", path: "/manufacturing/quality" }
    ]
  },
  {
    key: "scm",
    label: "Supply Chain",
    icon: "truck",
    path: "/supply-chain",
    legacyModuleKeys: [],
    children: [
      { label: "Logistică", path: "/supply-chain/logistics" },
      { label: "Transport", path: "/supply-chain/transport" },
      { label: "Distribuție", path: "/supply-chain/distribution" },
      { label: "Forecasting", path: "/supply-chain/forecasting" }
    ]
  },
  {
    key: "projects",
    label: "Proiecte",
    icon: "folder",
    path: "/projects",
    legacyModuleKeys: [],
    children: [
      { label: "Proiecte", path: "/projects" },
      { label: "Task-uri", path: "/projects/tasks" },
      { label: "Timesheets", path: "/projects/timesheets" },
      { label: "Costuri", path: "/projects/costs" },
      { label: "Profitabilitate", path: "/projects/profitability" }
    ]
  },
  {
    key: "reports",
    label: "Rapoarte & BI",
    icon: "bar-chart",
    path: "/reports",
    legacyModuleKeys: ["dashboard"],
    children: [
      { label: "Dashboard-uri", path: "/reports/dashboards" },
      { label: "KPI", path: "/reports/kpi" },
      { label: "Rapoarte", path: "/reports" },
      { label: "Export Excel / PDF", path: "/reports/exports" },
      { label: "Analytics", path: "/reports/analytics" }
    ]
  },
  {
    key: "orders",
    label: "Order Management",
    icon: "clipboard-list",
    path: "/orders",
    legacyModuleKeys: [],
    children: [
      { label: "Lifecycle comandă", path: "/orders/lifecycle" },
      { label: "Fulfillment", path: "/orders/fulfillment" },
      { label: "Tracking", path: "/orders/tracking" },
      { label: "Status livrare", path: "/orders/delivery-status" }
    ]
  },
  {
    key: "documents",
    label: "Documente / DMS",
    icon: "files",
    path: "/tipizate",
    legacyModuleKeys: ["tipizate"],
    children: [
      { label: "Documente", path: "/documents" },
      { label: "Tipizate", path: "/tipizate" },
      { label: "OCR", path: "/documents/ocr" },
      { label: "Versiuni", path: "/documents/versions" },
      { label: "Semnături", path: "/documents/signatures" },
      { label: "Atașamente facturi", path: "/documents/invoice-attachments" }
    ]
  },
  {
    key: "workflow",
    label: "Workflow & Automatizări",
    icon: "workflow",
    path: "/workflow",
    legacyModuleKeys: [],
    children: [
      { label: "Aprobări", path: "/workflow/approvals" },
      { label: "Automatizări", path: "/workflow/automations" },
      { label: "Reguli business", path: "/workflow/rules" },
      { label: "Notificări", path: "/workflow/notifications" }
    ]
  },
  {
    key: "ecommerce",
    label: "eCommerce & POS",
    icon: "store",
    path: "/ecommerce",
    legacyModuleKeys: [],
    children: [
      { label: "Magazin online", path: "/ecommerce/store" },
      { label: "POS", path: "/pos" },
      { label: "Sincronizare stocuri", path: "/ecommerce/stock-sync" },
      { label: "Plăți", path: "/ecommerce/payments" }
    ]
  },
  {
    key: "settings",
    label: "Setări",
    icon: "sliders",
    path: "/setari",
    legacyModuleKeys: ["setari", "accounts"],
    children: [
      { label: "Setări generale", path: "/setari" },
      { label: "Utilizatori & roluri", path: "/accounts" },
      { label: "Abonament", path: "/setari/subscription" },
      { label: "Module active", path: "/setari/modules" },
      { label: "Integrare ANAF", path: "/setari#anaf" }
    ]
  }
];

export {
  ERP_MODULES
};

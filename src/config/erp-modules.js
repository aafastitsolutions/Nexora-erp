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
      { label: "Plăți", path: "/nexora/accounting/payments" },
      { label: "Încasări", path: "/nexora/accounting/receipts" },
      { label: "Registre", path: "/nexora/accounting/registers" },
      { label: "Bonuri de consum", path: "/nexora/accounting/consumption" },
      { label: "Balanță", path: "/nexora/accounting/trial-balance" },
      { label: "Cashflow", path: "/nexora/accounting/cashflow" },
      { label: "Bugete", path: "/nexora/accounting/budgets" },
      { label: "Reconciliere bancară", path: "/nexora/accounting/bank-reconciliation" },
      { label: "TVA", path: "/nexora/accounting/vat" },
      { label: "Active fixe", path: "/nexora/accounting/fixed-assets" },
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
      { label: "Registru active", path: "/nexora/inventory/assets" },
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
    label: "Producție / MRP",
    icon: "settings",
    path: "/nexora/manufacturing",
    legacyModuleKeys: [],
    children: [
      { label: "BOM", path: "/nexora/manufacturing/bom" },
      { label: "Ordine producție", path: "/nexora/manufacturing/orders" },
      { label: "Planificare", path: "/nexora/manufacturing/planning" },
      { label: "Consum materiale", path: "/nexora/manufacturing/materials" },
      { label: "Cost producție", path: "/nexora/manufacturing/costs" },
      { label: "Quality control", path: "/nexora/manufacturing/quality" }
    ]
  },
  {
    key: "scm",
    label: "Supply Chain",
    icon: "truck",
    path: "/nexora/supply-chain",
    legacyModuleKeys: [],
    children: [
      { label: "Logistică", path: "/nexora/supply-chain/logistics" },
      { label: "Transport", path: "/nexora/supply-chain/transport" },
      { label: "Distribuție", path: "/nexora/supply-chain/distribution" },
      { label: "Forecasting", path: "/nexora/supply-chain/forecasting" }
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
    label: "Rapoarte & BI",
    icon: "bar-chart",
    path: "/nexora/reports",
    legacyModuleKeys: [],
    children: [
      { label: "Dashboard-uri", path: "/nexora/reports/dashboards" },
      { label: "KPI", path: "/nexora/reports/kpi" },
      { label: "Rapoarte", path: "/nexora/reports" },
      { label: "Export Excel / PDF", path: "/nexora/reports/exports" },
      { label: "Analytics", path: "/nexora/reports/analytics" }
    ]
  },
  {
    key: "orders",
    label: "Order Management",
    icon: "clipboard-list",
    path: "/nexora/orders",
    legacyModuleKeys: [],
    children: [
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
      { label: "Aprobări", path: "/nexora/workflow/approvals" },
      { label: "Automatizări", path: "/nexora/workflow/automations" },
      { label: "Reguli business", path: "/nexora/workflow/rules" },
      { label: "Notificări", path: "/nexora/workflow/notifications" }
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
      { label: "Plăți", path: "/nexora/super-admin/payments" }
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
      { label: "Utilizatori & roluri", path: "/nexora/users" },
      { label: "Abonament", path: "/nexora/settings?tab=subscription" },
      { label: "Module active", path: "/nexora/settings?tab=subscription" },
      { label: "SPV / e-Factura", path: "/nexora/anaf/status" }
    ]
  }
];

export {
  ERP_MODULES
};

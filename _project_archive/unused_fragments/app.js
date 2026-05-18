function getDefaultDashboardSettings() {
  return {
    layout: '2col',
    widgets: [
      { id: 'kpi_cards', enabled: true, order: 1, column: 1, limit: 6 },
      { id: 'recent_activity', enabled: true, order: 2, column: 1, limit: 10 },
      { id: 'overdue_invoices', enabled: true, order: 1, column: 2, limit: 10 },
      { id: 'expiring_contracts', enabled: true, order: 2, column: 2, limit: 10 },
      { id: 'tasks_reminders', enabled: false, order: 3, column: 2, limit: 10 },
      { id: 'quick_actions', enabled: true, order: 3, column: 1 },
      { id: 'revenue_chart', enabled: false, order: 4, column: 1 },
      { id: 'client_timeline', enabled: false, order: 4, column: 2, limit: 12 }
    ]
  };
}

const DASHBOARD_WIDGETS = [
  { id: 'kpi_cards', label: 'KPI Cards', hasLimit: true },
  { id: 'recent_activity', label: 'Activitate recenta', hasLimit: true },
  { id: 'overdue_invoices', label: 'Facturi restante', hasLimit: true },
  { id: 'expiring_contracts', label: 'Contracte expirante', hasLimit: true },
  { id: 'tasks_reminders', label: 'Task-uri / remindere', hasLimit: true },
  { id: 'quick_actions', label: 'Actiuni rapide', hasLimit: false },
  { id: 'revenue_chart', label: 'Grafic venituri', hasLimit: false },
  { id: 'client_timeline', label: 'Timeline activitate clienti', hasLimit: true }
];

function normalizeDashboardWidgets(savedWidgets = []) {
  const defaults = getDefaultDashboardSettings().widgets;

  return DASHBOARD_WIDGETS.map((def, index) => {
    const saved = savedWidgets.find(w => w.id === def.id);
    const fallback = defaults.find(w => w.id === def.id) || {
      id: def.id,
      enabled: false,
      order: index + 1,
      column: 1
    };

    return {
      id: def.id,
      label: def.label,
      hasLimit: def.hasLimit,
      enabled: saved?.enabled ?? fallback.enabled,
      order: Number(saved?.order ?? fallback.order ?? index + 1),
      column: Number(saved?.column ?? fallback.column ?? 1),
      limit: Number(saved?.limit ?? fallback.limit ?? 10)
    };
  });
}

async function getDashboardSettings() {
  const settings = await getAppSettings();
  const dashboard = settings.dashboard || getDefaultDashboardSettings();

  return {
    layout: dashboard.layout || '2col',
    widgets: normalizeDashboardWidgets(dashboard.widgets || [])
  };
}

function buildDashboardColumns(dashboardSettings) {
  const layout = dashboardSettings.layout || '2col';
  const columnCount = layout === '1col' ? 1 : layout === '3col' ? 3 : 2;

  const columns = Array.from({ length: columnCount }, (_, i) => ({
    index: i + 1,
    widgets: []
  }));

  dashboardSettings.widgets
    .filter(w => w.enabled)
    .sort((a, b) => {
      if (a.column !== b.column) return a.column - b.column;
      return a.order - b.order;
    })
    .forEach(widget => {
      const target = Math.min(Math.max(widget.column || 1, 1), columnCount);
      columns[target - 1].widgets.push(widget);
    });

  return columns;
}


function sanitizeDashboardInput(input = {}) {
  const allowedIds = new Set(DASHBOARD_WIDGETS.map(w => w.id));
  const layout = ['1col', '2col', '3col'].includes(input.layout) ? input.layout : '2col';

  const widgets = Array.isArray(input.widgets) ? input.widgets : [];

  return {
    layout,
    widgets: widgets
      .filter(w => w && allowedIds.has(String(w.id || '')))
      .map((w, index) => ({
        id: String(w.id),
        enabled: !!w.enabled,
        order: Number(w.order || index + 1),
        column: Number(w.column || 1),
        limit: Number(w.limit || 10)
      }))
  };
}

app.post('/setari/dashboard', async (req, res) => {
  try {
    const settings = await getAppSettings();
    settings.dashboard = sanitizeDashboardInput(req.body || {});
    await setSetting('app', settings);
    res.json({ ok: true, dashboard: settings.dashboard });
  } catch (err) {
    console.error('POST /setari/dashboard error:', err);
    res.status(500).json({ ok: false, error: 'Eroare la salvarea dashboard-ului.' });
  }
});


app.get('/dashboard', async (req, res) => {
  try {
    const dashboard = await getDashboardSettings();
    const columns = buildDashboardColumns(dashboard);

    res.render('dashboard', {
      dashboard,
      columns
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Dashboard error');
  }
});


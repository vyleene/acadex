async function initTitleBar() {
    const $titleBar = $('#app-titlebar');
    const $themeBtn = $('#btn-theme');
    const $minimizeBtn = $('#btn-minimize');
    const $closeBtn = $('#btn-close');
    

    const excludeButtons = [$themeBtn[0], $minimizeBtn[0], $closeBtn[0]].filter(Boolean);
    if($titleBar.length) Neutralino.window.setDraggableRegion($titleBar[0], { exclude: excludeButtons });
    if($minimizeBtn.length) $minimizeBtn.on('click', async () => Neutralino.window.minimize());
    if($closeBtn.length) $closeBtn.on('click', async () => Neutralino.app.exit());

    function updateThemeBtn(theme) {
        const isDark = theme === 'dark';
        $themeBtn.attr('aria-pressed', isDark ? 'true' : 'false');
        $themeBtn.attr('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    }

    if ($themeBtn.length) {
        updateThemeBtn(document.documentElement.getAttribute('data-bs-theme'));

        $themeBtn.on('click', async () => {
            const next = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
            await applyTheme(next);
            updateThemeBtn(next);
        });
    }

    Neutralino.events.on('windowClose', () => Neutralino.app.exit());
}

function initDirectoryNav() {
    const $navItems = $('.app-nav__item');
    const $panels = $('.directory-panel');

    $navItems.on('click', function() {
        const target = $(this).attr('data-panel');

        $navItems.removeClass('is-active');
        $(this).addClass('is-active');

        $panels.each((_, panel) => {
            const $panel = $(panel);
            const isActive = $panel.attr('data-panel') === target;
            $panel.toggleClass('is-active', isActive);
        });

        if(typeof $ !== 'undefined' && $.fn.DataTable) $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust().responsive.recalc();
    });
}

function initDataTable(tableId, data = null, columns = null, extraOptions = {}) {
    if(typeof $ === 'undefined' || typeof $.fn.DataTable === 'undefined') return;

    const $table = $(`#${tableId}`);
    if(!$table.length) return;

    if($.fn.DataTable.isDataTable($table)) $table.DataTable().destroy();

    const tableMeta = {
        studentsTable: { openInfo: openStudentInfoModal },
        programsTable: { openInfo: openProgramInfoModal },
        collegesTable: { openInfo: openCollegeInfoModal },
    }[tableId];

    const tableOrder = {
        studentsTable: [[0, 'asc']],
        programsTable: [[2, 'asc']],
        collegesTable: [[0, 'asc']]
    };

    const options = {
        responsive: true,
        fixedHeader: true,
        paging: true,
        lengthChange: false,
        deferRender: true,
        searchDelay: 100,
        autoWidth: false,
        pageLength: 10,
        stateSave: true,
        ...(tableOrder[tableId] ? { order: tableOrder[tableId] } : {}),
        select: {
            style: 'single',
            selector: 'td:not(.actions-col)'
        },
        initComplete: function() {
            if(!tableMeta?.openInfo) return;
            const api = this.api();
            const $node = $(api.table().node());
            $node.off('select.dt.infoModal').on('select.dt.infoModal', function(_, dt, type, indexes) {
                if(type !== 'row' || !indexes?.length) return;
                const rowData = dt.row(indexes[0]).data();
                if(!rowData || !Array.isArray(rowData)) return;
                tableMeta.openInfo(rowData);
            });
        }
    };

    Object.assign(options, extraOptions);

    if(Array.isArray(data) && Array.isArray(columns)) {
        options.data = data;
        options.columns = columns;
    }

    $table.DataTable(options);
}

function refreshDataTable(tableId, data = null, columns = null) {
    if(typeof $ === 'undefined' || typeof $.fn.DataTable === 'undefined') return;

    const $table = $(`#${tableId}`);
    if(!$table.length) return;

    if($.fn.DataTable.isDataTable($table)) {
        const dataTable = $table.DataTable();
        if(Array.isArray(data)) {
            dataTable.clear();
            dataTable.rows.add(data).draw(false);
        } else {
            const rows = $table.find('tbody tr').toArray();
            dataTable.clear();
            dataTable.rows.add(rows).draw(false);
        }
    } else {
        initDataTable(tableId, data, columns);
    }
}

function showToast(message, variant) {
    const $toastContainer = $('.toast-container');
    if(!$toastContainer.length) return;

    const toastDuration = 3000;
    const toastIconByVariant = {
        success: 'icon-check-circle',
        warning: 'icon-exclamation-triangle',
        danger: 'icon-x-circle',
        info: 'icon-information-circle',
    };
    const iconClass = toastIconByVariant[variant] || 'icon-bell';

    const $toastEl = $('<div>').addClass(`toast align-items-center text-bg-${variant} border-0`).attr({ role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' });
    const $toastRow = $('<div>').addClass('d-flex');
    const $toastBody = $('<div>').addClass('toast-body d-flex align-items-center gap-2').html(`<span class="heroicon-url heroicon-url-outline ${iconClass}" aria-hidden="true"></span><span>${message}</span>`);
    const $toastClose = $('<button>').addClass('btn-close btn-close-white me-2 m-auto').attr({ type: 'button', 'data-bs-dismiss': 'toast', 'aria-label': 'Close' });
    const $progress = $('<div>').addClass('toast-progress progress').attr('role', 'presentation');
    const $progressBar = $('<div>').addClass('progress-bar toast-progress__bar').attr('role', 'progressbar');

    $toastRow.append($toastBody, $toastClose);
    $progress.append($progressBar);
    $toastEl.append($toastRow, $progress);

    $toastContainer.append($toastEl);

    $progressBar.css('animation-duration', `${toastDuration}ms`);

    const ToastClass = window.bootstrap?.Toast;
    if(ToastClass) {
        const toast = new ToastClass($toastEl[0], { delay: toastDuration, autohide: true });
        $toastEl.on('hidden.bs.toast', () => $toastEl.remove());
        toast.show();
    } else {
        $toastEl.addClass('show');
        setTimeout(() => $toastEl.remove(), toastDuration);
    }
}

function showImportModal(results) {
    const addedCount = results.filter(r => r.status === 'success').length;
    const dupCount = results.filter(r => r.status === 'duplicate').length;
    const missingCount = results.filter(r => r.status === 'missing').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    let summary = `${addedCount} record${addedCount === 1 ? '' : 's'} imported.`;
    if(dupCount) summary += ` ${dupCount} duplicate${dupCount === 1 ? '' : 's'} skipped.`;
    if(missingCount) summary += ` ${missingCount} invalid${missingCount === 1 ? '' : 's'} skipped.`;
    if(errorCount) summary += ` ${errorCount} error${errorCount === 1 ? '' : 's'}.`;
    $('#importResultSummary').html(`<b>SUMMARY:</b> ${summary}`);

    const statusBadge = (status, reason) => {
        const text = reason || (status === 'success' ? 'Imported' : status);
        switch(status) {
            case 'success':
                return `<span class="badge bg-success">${text}</span>`;
            case 'duplicate':
                return `<span class="badge bg-warning text-dark">${text}</span>`;
            case 'missing':
                return `<span class="badge bg-danger">${text}</span>`;
            case 'error':
                return `<span class="badge bg-danger">${text}</span>`;
            default:
                return `<span class="badge bg-secondary">${text}</span>`;
        }
    }

    const rows = results.map((r) => [r.record, statusBadge(r.status, r.reason)]);
    initDataTable('importResultTable', rows, [
        { data: 0 },
        { data: 1, orderable: false, searchable: false }
    ], { searching: false, select: false });
    const modalEl = $('#importResultModal');
    const ModalClass = window.bootstrap?.Modal;
    if(ModalClass && modalEl) {
        ModalClass.getOrCreateInstance(modalEl).show();
    }
}

$(document).ready(async () => {
    $(document).on('contextmenu', (e) => e.preventDefault());

    await initTitleBar();
    initDirectoryNav();

    const recordsByTable = await Promise.all(csvConfigs.map(config => loadCsvToTable(config)));
    csvConfigs.forEach((config, index) => initDataTable(config.tableId, recordsByTable[index], config.tableColumns));
});
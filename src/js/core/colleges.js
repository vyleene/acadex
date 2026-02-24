function renderCollegeActions(row) {
    const [code, name] = row;
    const $edit = $('<button>')
        .addClass('btn btn-sm btn-outline-primary me-1 edit-college')
        .attr({ 'data-id': code, 'data-name': name, 'aria-label': 'Edit college', title: 'Edit' })
        .html('<span class="heroicon-url heroicon-url-outline icon-pencil-square" aria-hidden="true"></span>');
    const $del = $('<button>')
        .addClass('btn btn-sm btn-outline-danger delete-college')
        .attr({ 'data-id': code, 'aria-label': 'Delete college', title: 'Delete' })
        .html('<span class="heroicon-url heroicon-url-outline icon-trash" aria-hidden="true"></span>');

    return $('<div>').append($edit, $del).html();
}

async function reloadCollegeTable(options = {}) {
    const { showNullWarning = true } = options;
    const $shell = $('#collegesTable').closest('.table-shell');
    $shell.addClass('is-loading');

    try {
        const records = await loadCsvToTable(csvConfigs[2]);
        refreshDataTable('collegesTable', records, csvConfigs[2].tableColumns);
        if(showNullWarning) await warnIfNullCollegeRecords();
    } finally {
        //await new Promise((resolve) => setTimeout(resolve, 500));
        $shell.removeClass('is-loading');
    }
}

async function warnIfNullCollegeRecords() {
    const { rows } = await getCsvHeaderAndRows(csvConfigs[2].csvPath, csvConfigs[2].headerLine);
    const nullCount = rows.reduce((count, line) => {
        const cells = line.split(',');
        return cells.some((cell) => cell === 'NULL') ? count + 1 : count;
    }, 0);

    if(nullCount) {
        const label = nullCount === 1 ? 'record' : 'records';
        showToast(`Found ${nullCount} college ${label} with NULL values.`, 'warning');
    }
}

let collegeRecordsCache = [];

function populateCollegeOptions(records = collegeRecordsCache) {
    if(Array.isArray(records) && records.length) {
        collegeRecordsCache = records;
    }

    const sourceRecords = Array.isArray(records) ? records : collegeRecordsCache;
    const $select = $('#program-college');
    const codes = Array.from(new Set(sourceRecords.map(([code]) => code))).sort();
    const collegeOptionsTemplate = [$('<option>').attr({ value: '', selected: true, hidden: true }).text('Select college code'), ...codes.map((code) => $('<option>').attr({ value: code }).text(code))];

    if(!$select.length) return;

    $select.empty().append(collegeOptionsTemplate.map((option) => option.clone()));
}

function openCollegeModal(mode, data = {}) {
    const $modal = $('#collegeModal');
    if(!$modal.length) return;

    const $form = $('#college-form');
    const $title = $('#collegeModalLabel');
    const $submit = $('#college-submit');

    const isEdit = mode === 'edit';
    $form.attr('data-mode', mode);
    $form.attr('data-id', data.code || '');
    $title.text(isEdit ? 'Edit College' : 'Add College');
    $submit.text(isEdit ? 'Save Changes' : 'Add College');

    $('#college-code').val(data.code || '').attr('placeholder', data.code || '');
    $('#college-name').val(data.name || '').attr('placeholder', data.name || '');

    const ModalClass = window.bootstrap?.Modal;
    if(ModalClass) {
        ModalClass.getOrCreateInstance($modal).show();
    }
}

async function getProgramCollegeUsage(collegeId) {
    const { rows } = await getCsvHeaderAndRows(csvConfigs[1].csvPath, csvConfigs[1].headerLine);
    let count = 0;

    rows.forEach((line) => {
        const cells = line.split(',');
        if((cells[2] || '') === collegeId) count += 1;
    });

    return count;
}

async function nullifyProgramCollegeCodes(collegeId) {
    const { normalizedPath, header, rows } = await getCsvHeaderAndRows(csvConfigs[1].csvPath, csvConfigs[1].headerLine);
    let updatedCount = 0;

    const updatedRows = rows.map((line) => {
        const cells = line.split(',');
        if((cells[2] || '') === collegeId) {
            cells[2] = 'NULL';
            updatedCount += 1;
        }
        return cells.join(',');
    });

    if(updatedCount) {
        await Neutralino.filesystem.writeFile(normalizedPath, [header, ...updatedRows].join('\n') + '\n');
    }

    return updatedCount;
}

async function updateProgramCollegeCodes(oldCollegeId, newCollegeId) {
    if(!oldCollegeId || !newCollegeId || oldCollegeId === newCollegeId) return 0;

    const { normalizedPath, header, rows } = await getCsvHeaderAndRows(csvConfigs[1].csvPath, csvConfigs[1].headerLine);
    let updatedCount = 0;

    const updatedRows = rows.map((line) => {
        const cells = line.split(',');
        if((cells[2] || '') === oldCollegeId) {
            cells[2] = newCollegeId;
            updatedCount += 1;
        }
        return cells.join(',');
    });

    if(updatedCount) {
        await Neutralino.filesystem.writeFile(normalizedPath, [header, ...updatedRows].join('\n') + '\n');
    }

    return updatedCount;
}

async function openDeleteCollegeModal(collegeId) {
    const $modal = $('#deleteCollegeModal');
    if(!$modal.length) return;

    $('#delete-college-id').val(collegeId || '');

    const $warning = $('#delete-college-warning');
    if($warning.length) {
        $warning.text('Checking program usage...');
    }

    try {
        const count = collegeId ? await getProgramCollegeUsage(collegeId) : 0;
        $modal.attr('data-program-count', String(count));
        if($warning.length) {
            if(count > 0) {
                const label = count === 1 ? 'program' : 'programs';
                $warning.html(`There ${count === 1 ? 'is' : 'are'} <b>${count} ${label}</b> using this college. Deleting will set their college code to NULL.`);
            } else {
                $warning.html('No programs are currently using this college.');
            }
        }
    } catch (error) {
        if($warning.length) {
            $warning.html('Unable to check program usage.');
        }
    }

    const ModalClass = window.bootstrap?.Modal;
    if(ModalClass) {
        ModalClass.getOrCreateInstance($modal).show();
    }
}

async function getCollegeStudentCount(collegeId) {
    if(!collegeId) return 0;

    const { rows: programRows } = await getCsvHeaderAndRows(csvConfigs[1].csvPath, csvConfigs[1].headerLine);
    const programToCollege = new Map();
    programRows.forEach((line) => {
        const [programCode, , programCollege] = line.split(',');
        if(programCode && programCollege) programToCollege.set(programCode, programCollege);
    });

    const { rows: studentRows } = await getCsvHeaderAndRows(csvConfigs[0].csvPath, csvConfigs[0].headerLine);
    let count = 0;
    studentRows.forEach((line) => {
        const cells = line.split(',');
        const programCode = cells[3] || '';
        if(programToCollege.get(programCode) === collegeId) count += 1;
    });

    return count;
}

async function openCollegeInfoModal(values) {
    const $modal = $('#collegeInfoModal');
    if(!$modal.length) return;

    const [collegeCode, collegeName] = values;

    $('#college-info-code').text(collegeCode || '-');
    $('#college-info-name').text(collegeName || '-');

    const $programCount = $('#college-info-program-count');
    $programCount.text('...');
    const $studentCount = $('#college-info-student-count');
    $studentCount.text('...');

    const ModalClass = window.bootstrap?.Modal;
    if(ModalClass) {
        ModalClass.getOrCreateInstance($modal).show();
    }

    if(!collegeCode) {
        $programCount.text('N/A');
        $studentCount.text('N/A');
        return;
    }

    try {
        const count = await getProgramCollegeUsage(collegeCode);
        const label = count === 1 ? 'program' : 'programs';
        $programCount.text(`${count} ${label}`);
    } catch (_) {
        $programCount.text('N/A');
    }

    try {
        const count = await getCollegeStudentCount(collegeCode);
        const label = count === 1 ? 'student' : 'students';
        $studentCount.text(`${count} ${label}`);
    } catch (_) {
        $studentCount.text('N/A');
    }
}

$(document).on('click', '#btn-upload-college', async () => {
    const results = await importCsv('collegesTable');
    if (!results) return;

    await reloadCollegeTable({ showNullWarning: false });
    showImportModal(results);
});

$(document).on('click', '#btn-refresh-college', () => reloadCollegeTable());

$(document).on('click', '#btn-add-college', () => openCollegeModal('add'));

$(document).on('click', '.edit-college', function() {
    const $btn = $(this);
    openCollegeModal('edit', {
        code: $btn.attr('data-id'),
        name: $btn.attr('data-name'),
    });
});

$(document).on('click', '.delete-college', async function() {
    const $btn = $(this);
    await openDeleteCollegeModal($btn.attr('data-id'));
});

$(document).on('submit', '#college-form', async function(event) {
    event.preventDefault();

    const $form = $(this);
    const mode = $form.attr('data-mode') || 'add';
    const originalId = $form.attr('data-id') || '';

    const collegeCode = ($('#college-code').val() || '').trim();
    const collegeName = ($('#college-name').val() || '').trim();

    if(!collegeCode || !collegeName) {
        showToast('Please complete all required fields.', 'warning');
        return;
    }

    try {
        const payload = {
            csvPath: csvConfigs[2].csvPath,
            headerLine: csvConfigs[2].headerLine,
            key: mode === 'edit' ? originalId : collegeCode,
            keyIndex: 0,
            rowValues: [collegeCode, collegeName],
            mode,
        };

        const result = await writeCsvRecord(payload);
        if(result.status === 'duplicate') {
            showToast('College code already exists.', 'danger');
            return;
        }

        if(result.status === 'missing') {
            showToast('College record not found.', 'danger');
            return;
        }

        let updatedProgramCount = 0;
        if(mode === 'edit' && originalId && collegeCode !== originalId) {
            updatedProgramCount = await updateProgramCollegeCodes(originalId, collegeCode);
        }

        await reloadCollegeTable({ showNullWarning: false });
        if(typeof reloadProgramTable === 'function' && updatedProgramCount) {
            await reloadProgramTable({ showNullWarning: false });
        }

        const modalEl = $('#collegeModal');
        const modalInstance = modalEl ? window.bootstrap?.Modal?.getInstance(modalEl) : null;
        modalInstance?.hide();
        const programSuffix = updatedProgramCount
            ? ` College codes updated for ${updatedProgramCount} program${updatedProgramCount === 1 ? '' : 's'}.`
            : '';
        const successMessage = mode === 'edit'
            ? `College <b>${collegeCode}</b> updated.${programSuffix}`
            : `College <b>${collegeCode}</b> added.`;
        showToast(successMessage, 'success');
        await warnIfNullCollegeRecords();
        if(updatedProgramCount) {
            await warnIfNullProgramRecords();
        }
    } catch (error) {
        const message = error?.message ? `Failed to save college: ${error.message}` : 'Failed to save college.';
        showToast(message, 'danger');
    }
});

$(document).on('click', '#confirm-delete-college', async function() {
    const collegeId = $('#delete-college-id').val() || '';
    if(!collegeId) return;

    try {
        const updatedProgramCount = await nullifyProgramCollegeCodes(collegeId);
        const result = await deleteCsvRecord({
            csvPath: csvConfigs[2].csvPath,
            headerLine: csvConfigs[2].headerLine,
            key: collegeId,
            keyIndex: 0,
        });

        if(result.status === 'missing') {
            showToast('College record not found.', 'danger');
            return;
        }

        await reloadCollegeTable({ showNullWarning: false });
        if(typeof reloadProgramTable === 'function' && updatedProgramCount) {
            await reloadProgramTable({ showNullWarning: false });
        }

        const modalEl = $('#deleteCollegeModal');
        const modalInstance = modalEl ? window.bootstrap?.Modal?.getInstance(modalEl) : null;
        modalInstance?.hide();
        if(updatedProgramCount) {
            const programSuffix = ` College codes set to NULL for ${updatedProgramCount} program${updatedProgramCount === 1 ? '' : 's'}.`;
            showToast(`College <b>${collegeId}</b> deleted.${programSuffix}`, 'warning');
        } else {
            showToast(`College <b>${collegeId}</b> deleted.`, 'success');
            await warnIfNullCollegeRecords();
        }
    } catch (error) {
        const message = error?.message ? `Failed to delete college: ${error.message}` : 'Failed to delete college.';
        showToast(message, 'danger');
    }
});
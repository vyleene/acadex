function renderProgramActions(row) {
    const [code, name, college] = row;
    const $edit = $('<button>')
        .addClass('btn btn-sm btn-outline-primary me-1 edit-program')
        .attr({
            'data-id': code,
            'data-name': name,
            'data-college': college,
            'aria-label': 'Edit program',
            title: 'Edit',
        })
        .html('<span class="heroicon-url heroicon-url-outline icon-pencil-square" aria-hidden="true"></span>');
    const $del = $('<button>')
        .addClass('btn btn-sm btn-outline-danger delete-program')
        .attr({ 'data-id': code, 'aria-label': 'Delete program', title: 'Delete' })
        .html('<span class="heroicon-url heroicon-url-outline icon-trash" aria-hidden="true"></span>');

    return $('<div>').append($edit, $del).html();
}

async function reloadProgramTable(options = {}) {
    const { showNullWarning = true } = options;
    const $shell = $('#programsTable').closest('.table-shell');
    $shell.addClass('is-loading');

    try {
        const records = await loadCsvToTable(csvConfigs[1]);
        refreshDataTable('programsTable', records, csvConfigs[1].tableColumns);
        if(showNullWarning) await warnIfNullProgramRecords();
    } finally {
        //await new Promise((resolve) => setTimeout(resolve, 500));
        $shell.removeClass('is-loading');
    }
}

async function warnIfNullProgramRecords() {
    const { rows } = await getCsvHeaderAndRows(csvConfigs[1].csvPath, csvConfigs[1].headerLine);
    const nullCount = rows.reduce((count, line) => {
        const cells = line.split(',');
        return cells.some((cell) => cell === 'NULL') ? count + 1 : count;
    }, 0);

    if(nullCount) {
        const label = nullCount === 1 ? 'record' : 'records';
        showToast(`Found ${nullCount} program ${label} with NULL values.`, 'warning');
    }
}

let programRecordsCache = [];

function populateProgramOptions(records = programRecordsCache) {
    if(Array.isArray(records) && records.length) {
        programRecordsCache = records;
    }

    const sourceRecords = Array.isArray(records) ? records : programRecordsCache;
    const $select = $('#student-program');
    const codes = Array.from(new Set(sourceRecords.map(([code]) => code))).sort();
    const programOptionsTemplate = [$('<option>').attr({ value: '', selected: true, disabled: true }).text('Select program code'), ...codes.map((code) => $('<option>').attr({ value: code }).text(code))];

    if(!$select.length) return;

    $select.empty().append(programOptionsTemplate.map((option) => option.clone()));
}

function openProgramModal(mode, data = {}) {
    const $modal = $('#programModal');
    if(!$modal.length) return;

    const $form = $('#program-form');
    const $title = $('#programModalLabel');
    const $submit = $('#program-submit');

    const isEdit = mode === 'edit';
    $form.attr('data-mode', mode);
    $form.attr('data-id', data.code || '');
    $title.text(isEdit ? 'Edit Program' : 'Add Program');
    $submit.text(isEdit ? 'Save Changes' : 'Add Program');

    $('#program-code').val(data.code || '').attr('placeholder', data.code || '');
    $('#program-name').val(data.name || '').attr('placeholder', data.name || '');
    
    populateCollegeOptions();

    const $collegeSelect = $('#program-college');
    if(data.college && !$collegeSelect.find(`option[value="${data.college}"]`).length) {
        $collegeSelect.append($('<option>').val(data.college).text(data.college));
    }
    $collegeSelect.val(data.college || '');

    const ModalClass = window.bootstrap?.Modal;
    if(ModalClass) {
        ModalClass.getOrCreateInstance($modal[0]).show();
    }
}

async function getStudentProgramUsage(programId) {
    const { rows } = await getCsvHeaderAndRows(csvConfigs[0].csvPath, csvConfigs[0].headerLine);
    let count = 0;

    rows.forEach((line) => {
        const cells = line.split(',');
        if((cells[3] || '') === programId) count += 1;
    });

    return count;
}

async function nullifyStudentProgramCodes(programId) {
    const { normalizedPath, header, rows } = await getCsvHeaderAndRows(csvConfigs[0].csvPath, csvConfigs[0].headerLine);
    let updatedCount = 0;

    const updatedRows = rows.map((line) => {
        const cells = line.split(',');
        if((cells[3] || '') === programId) {
            cells[3] = 'NULL';
            updatedCount += 1;
        }
        return cells.join(',');
    });

    if(updatedCount) {
        await Neutralino.filesystem.writeFile(normalizedPath, [header, ...updatedRows].join('\n') + '\n');
    }

    return updatedCount;
}

async function updateStudentProgramCodes(oldProgramId, newProgramId) {
    if(!oldProgramId || !newProgramId || oldProgramId === newProgramId) return 0;

    const { normalizedPath, header, rows } = await getCsvHeaderAndRows(csvConfigs[0].csvPath, csvConfigs[0].headerLine);
    let updatedCount = 0;

    const updatedRows = rows.map((line) => {
        const cells = line.split(',');
        if((cells[3] || '') === oldProgramId) {
            cells[3] = newProgramId;
            updatedCount += 1;
        }
        return cells.join(',');
    });

    if(updatedCount) {
        await Neutralino.filesystem.writeFile(normalizedPath, [header, ...updatedRows].join('\n') + '\n');
    }

    return updatedCount;
}

async function openDeleteProgramModal(programId) {
    const $modal = $('#deleteProgramModal');
    if(!$modal.length) return;

    $('#delete-program-id').val(programId || '');

    const $warning = $('#delete-program-warning');
    if($warning.length) {
        $warning.text('Checking program usage...');
    }

    try {
        const count = programId ? await getStudentProgramUsage(programId) : 0;
        $modal.attr('data-student-count', String(count));
        if($warning.length) {
            if(count > 0) {
                const label = count === 1 ? 'student' : 'students';
                $warning.html(`There ${count === 1 ? 'is' : 'are'} <b>${count} ${label}</b> using this program. Deleting will set their program code to <b>NULL</b>.`);
            } else {
                $warning.html('No students are currently using this program.');
            }
        }
    } catch (error) {
        if($warning.length) {
            $warning.html('Unable to check student usage.');
        }
    }

    const ModalClass = window.bootstrap?.Modal;
    if(ModalClass) {
        ModalClass.getOrCreateInstance($modal[0]).show();
    }
}

async function openProgramInfoModal(values) {
    const $modal = $('#programInfoModal');
    if(!$modal.length) return;

    const [programCode, programName, collegeCode] = values;
    let collegeName = '';

    if(typeof collegeRecordsCache !== 'undefined' && Array.isArray(collegeRecordsCache)) {
        const collegeRecord = collegeRecordsCache.find(([code]) => code === collegeCode);
        if(collegeRecord) {
            collegeName = collegeRecord[1] || '';
        }
    }

    $('#program-info-code').text(programCode || '-');
    $('#program-info-name').text(programName || '-');
    $('#program-info-college-name').text(collegeName || collegeCode || '-');
    const $collegeCode = $('#program-info-college-code');
    $collegeCode
        .text(collegeCode || '')
        .toggleClass('d-none', !collegeCode)
        .attr('data-college', collegeCode || '');

    const $studentCount = $('#program-info-student-count');
    $studentCount.text('...');

    const ModalClass = window.bootstrap?.Modal;
    if(ModalClass) {
        ModalClass.getOrCreateInstance($modal[0]).show();
    }

    if(!programCode) {
        $studentCount.text('N/A');
        return;
    }

    try {
        const count = await getStudentProgramUsage(programCode);
        const label = count === 1 ? 'student' : 'students';
        $studentCount.text(`${count} ${label}`);
    } catch (_) {
        $studentCount.text('N/A');
    }
}

$(document).on('click', '#btn-upload-program', async () => {
    const results = await importCsv('programsTable');
    if (!results) return;

    await reloadProgramTable({ showNullWarning: false });
    showImportModal(results);
});

$(document).on('click', '#btn-refresh-program', () => reloadProgramTable());

$(document).on('click', '#btn-add-program', () => openProgramModal('add'));

$(document).on('click', '.edit-program', function() {
    const $btn = $(this);
    openProgramModal('edit', {
        code: $btn.attr('data-id'),
        name: $btn.attr('data-name'),
        college: $btn.attr('data-college'),
    });
});

$(document).on('click', '.delete-program', async function() {
    const $btn = $(this);
    await openDeleteProgramModal($btn.attr('data-id'));
});

$(document).on('submit', '#program-form', async function(event) {
    event.preventDefault();

    const $form = $(this);
    const mode = $form.attr('data-mode') || 'add';
    const originalId = $form.attr('data-id') || '';

    const programCode = ($('#program-code').val() || '').trim();
    const programName = ($('#program-name').val() || '').trim();
    const collegeCode = $('#program-college').val() || '';

    if(!programCode || !programName || !collegeCode) {
        showToast('Please complete all required fields.', 'warning');
        return;
    }

    try {
        const payload = {
            csvPath: csvConfigs[1].csvPath,
            headerLine: csvConfigs[1].headerLine,
            key: mode === 'edit' ? originalId : programCode,
            keyIndex: 0,
            rowValues: [programCode, programName, collegeCode],
            mode,
        };

        const result = await writeCsvRecord(payload);
        if(result.status === 'duplicate') {
            showToast('Program code already exists.', 'danger');
            return;
        }

        if(result.status === 'missing') {
            showToast('Program record not found.', 'danger');
            return;
        }

        let updatedStudentCount = 0;
        if(mode === 'edit' && originalId && programCode !== originalId) {
            updatedStudentCount = await updateStudentProgramCodes(originalId, programCode);
        }

        await reloadProgramTable({ showNullWarning: false });
        if(typeof reloadStudentTable === 'function' && updatedStudentCount) {
            await reloadStudentTable({ showNullWarning: false });
        }

        const modalEl = $('#programModal');
        const modalInstance = modalEl ? window.bootstrap?.Modal?.getInstance(modalEl) : null;
        modalInstance?.hide();
        const studentSuffix = updatedStudentCount
            ? ` Program codes updated for ${updatedStudentCount} student${updatedStudentCount === 1 ? '' : 's'}.`
            : '';
        const successMessage = mode === 'edit'
            ? `Program <b>${programCode}</b> updated.${studentSuffix}`
            : `Program <b>${programCode}</b> added.`;
        showToast(successMessage, 'success');
        await warnIfNullProgramRecords();
        if(updatedStudentCount) {
            await warnIfNullStudentRecords();
        }
    } catch (error) {
        const message = error?.message ? `Failed to save program: ${error.message}` : 'Failed to save program.';
        showToast(message, 'danger');
    }
});

$(document).on('click', '#confirm-delete-program', async function() {
    const programId = $('#delete-program-id').val() || '';
    if(!programId) return;

    try {
        const updatedCount = await nullifyStudentProgramCodes(programId);
        const result = await deleteCsvRecord({
            csvPath: csvConfigs[1].csvPath,
            headerLine: csvConfigs[1].headerLine,
            key: programId,
            keyIndex: 0,
        });

        if(result.status === 'missing') {
            showToast('Program record not found.', 'danger');
            return;
        }

        await reloadProgramTable({ showNullWarning: false });
        if(typeof reloadStudentTable === 'function' && updatedCount) {
            await reloadStudentTable({ showNullWarning: false });
        }

        const modalEl = $('#deleteProgramModal');
        const modalInstance = modalEl ? window.bootstrap?.Modal?.getInstance(modalEl) : null;
        modalInstance?.hide();
        if(updatedCount) {
            const studentSuffix = ` Program codes set to NULL for ${updatedCount} student${updatedCount === 1 ? '' : 's'}.`;
            showToast(`Program <b>${programId}</b> deleted.${studentSuffix}`, 'warning');
        } else {
            showToast(`Program <b>${programId}</b> deleted.`, 'success');
            await warnIfNullProgramRecords();
        }
    } catch (error) {
        const message = error?.message ? `Failed to delete program: ${error.message}` : 'Failed to delete program.';
        showToast(message, 'danger');
    }
});
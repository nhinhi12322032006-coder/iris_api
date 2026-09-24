// Dự đoán mọi dòng của tệp và giữ nguyên các cột đầu vào khi xuất CSV.
(() => {
    const fileInput = document.getElementById('batch-file');
    const submit = document.getElementById('batch-submit');
    const download = document.getElementById('batch-download');
    const template = document.getElementById('batch-template');
    const status = document.getElementById('batch-status');
    const wrap = document.getElementById('batch-results-wrap');
    const body = document.getElementById('batch-results');
    const previewNote = document.getElementById('batch-preview-note');
    const summary = document.getElementById('batch-summary');
    const resultPanel = document.getElementById('batch-prediction');
    const dashboard = document.querySelector('#page-1 .dashboard-card');
    const manualInputs = document.getElementById('manual-inputs');
    const fileMode = document.getElementById('batch-file-mode');
    const singleModeButton = document.getElementById('mode-single');
    const fileModeButton = document.getElementById('mode-file');
    const fileName = document.getElementById('batch-file-name');
    document.querySelector('.batch-upload-zone').addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInput.click();
        }
    });
    let lastResult = null;

    function switchMode(mode) {
        const isFile = mode === 'file';
        manualInputs.hidden = isFile;
        fileMode.hidden = !isFile;
        dashboard.classList.toggle('is-batch-mode', isFile);
        singleModeButton.classList.toggle('is-active', !isFile);
        fileModeButton.classList.toggle('is-active', isFile);
        singleModeButton.setAttribute('aria-pressed', String(!isFile));
        fileModeButton.setAttribute('aria-pressed', String(isFile));
        resultPanel.hidden = !isFile || !lastResult;
        if (isFile) {
            const comparison = document.getElementById('quick-comparison');
            if (!comparison.hidden) document.getElementById('close-comparison').click();
        }
    }

    singleModeButton.addEventListener('click', () => switchMode('single'));
    fileModeButton.addEventListener('click', () => switchMode('file'));

    const columns = ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'];
    const csvCell = value => {
        let text = String(value ?? '');
        // Ngăn nội dung do người dùng cung cấp trở thành công thức khi mở bằng Excel.
        if (/^[\s]*[=+@\-]/.test(text) && !/^-?\d+(?:[.,]\d+)?$/.test(text.trim())) text = "'" + text;
        return `"${text.replace(/"/g, '""')}"`;
    };

    function saveCsv(name, rows) {
        const content = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([content], {type: 'text/csv;charset=utf-8'}));
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    template.addEventListener('click', event => {
        event.preventDefault();
        saveCsv('iris-mau.csv', [columns, [5.1, 3.5, 1.4, 0.2], [6.0, 2.9, 4.5, 1.5]]);
    });

    fileInput.addEventListener('change', () => {
        lastResult = null;
        download.hidden = true;
        resultPanel.hidden = true;
        wrap.hidden = true;
        body.replaceChildren();
        fileName.textContent = fileInput.files.length ? fileInput.files[0].name : '.csv hoặc .xlsx · tối đa 5 MB';
        status.textContent = fileInput.files.length ? `Đã chọn: ${fileInput.files[0].name}` : 'Chưa chọn tệp.';
    });

    function renderResult(data) {
        body.replaceChildren();
        for (const item of data.results.slice(0, 50)) {
            const tr = document.createElement('tr');
            const dimensions = columns.map(column => item.original[data.measurement_columns[column]] || '—').join(' / ');
            const cells = [item.row_number, dimensions, item.prediction || '—',
                item.confidence === null ? '—' : `${item.confidence}%`, item.error || item.warning || '—'];
            for (const value of cells) {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            }
            if (item.error) tr.className = 'batch-row-error';
            body.appendChild(tr);
        }
        wrap.hidden = false;
        resultPanel.hidden = false;
        download.hidden = false;
        status.textContent = `Đã xử lý ${data.total} dòng: ${data.success} dòng có kết quả, ${data.total - data.success} dòng cần sửa.`;
        summary.textContent = `${data.filename} · ${data.success}/${data.total} dòng có kết quả`;
        previewNote.textContent = data.total > 50
            ? 'Đang xem 50 dòng đầu · Tải CSV để nhận kết quả của toàn bộ tệp.'
            : 'Tệp tải xuống chứa tất cả các dòng, kể cả dòng cần sửa.';
        resultPanel.scrollIntoView({behavior: 'smooth', block: 'start'});
    }

    submit.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
            status.textContent = 'Hãy chọn một tệp CSV hoặc Excel (.xlsx).';
            return;
        }
        if (!/\.(csv|xlsx)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
            status.textContent = 'Chỉ hỗ trợ CSV hoặc Excel (.xlsx), dung lượng tối đa 5 MB.';
            return;
        }
        submit.disabled = true;
        download.hidden = true;
        resultPanel.hidden = true;
        wrap.hidden = true;
        lastResult = null;
        status.textContent = 'Đang xử lý tệp, vui lòng chờ...';
        try {
            const form = new FormData();
            form.append('file', file);
            const response = await fetch('/predict/file', {method: 'POST', body: form});
            const data = await response.json();
            if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Không thể đọc tệp.');
            lastResult = data;
            renderResult(data);
        } catch (error) {
            status.textContent = `Không thể xử lý tệp: ${error.message}`;
        } finally {
            submit.disabled = false;
        }
    });

    download.addEventListener('click', () => {
        if (!lastResult) return;
        const {columns: inputColumns, results, filename} = lastResult;
        const outputColumns = ['Dòng', ...inputColumns, 'Dự đoán', 'Độ tin cậy (%)',
            'Setosa (%)', 'Versicolor (%)', 'Virginica (%)', 'Lỗi', 'Lưu ý'];
        const rows = results.map(item => [item.row_number,
            ...inputColumns.map(column => item.original[column]), item.prediction || '',
            item.confidence ?? '', item.probabilities?.setosa ?? '',
            item.probabilities?.versicolor ?? '', item.probabilities?.virginica ?? '',
            item.error || '', item.warning || '']);
        const baseName = filename.replace(/\.(csv|xlsx)$/i, '').replace(/[^\p{L}\p{N}_-]+/gu, '_');
        saveCsv(`${baseName || 'iris'}-ket-qua.csv`, [outputColumns, ...rows]);
    });
})();

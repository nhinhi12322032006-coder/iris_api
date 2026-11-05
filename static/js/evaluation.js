
// Trang đánh giá: đọc kết quả đã lưu, không huấn luyện lại mô hình.
(() => {
    // --- PHẦN TỬ GIAO DIỆN VÀ TRẠNG THÁI ---
    const byId = (id) => document.getElementById(id);
    const page = byId('page-evaluation');
    const status = byId('evaluation-status');
    const content = byId('evaluation-content');
    const summaryRows = byId('evaluation-summary-rows');
    const detailSelect = byId('evaluation-detail-model');
    const reportRows = byId('evaluation-report-rows');
    const matrixWrap = byId('evaluation-matrix');
    const parameters = byId('evaluation-parameters');
    const dialog = byId('evaluation-metric-dialog');
    let evaluation = null;

    // --- GIẢI THÍCH CHỈ SỐ THEO YÊU CẦU ---
    const explanations = {
        accuracy: [
            'Accuracy · Độ chính xác',
            'Tỷ lệ dự đoán đúng trong toàn bộ mẫu kiểm tra. Ví dụ, đúng 29 trên 30 mẫu tương ứng khoảng 96,7%. Điểm 100% trên một tập nhỏ không bảo đảm đúng với mọi mẫu mới.',
        ],
        precision: [
            'Precision · Độ chính xác theo lớp',
            'Trong các mẫu được mô hình dự đoán là một loài, có bao nhiêu mẫu thực sự thuộc loài đó? Precision macro là trung bình Precision của ba loài, mỗi loài có trọng số bằng nhau.',
        ],
        recall: [
            'Recall · Khả năng nhận ra đúng từng loài',
            'Trong các mẫu thực sự thuộc một loài, mô hình nhận ra đúng được bao nhiêu mẫu? Recall macro là trung bình Recall của ba loài, mỗi loài có trọng số bằng nhau.',
        ],
        f1_score: [
            'F1 · Kết hợp Precision và Recall',
            'F1 là trung bình điều hòa của Precision và Recall: 2 × Precision × Recall / (Precision + Recall). F1 macro là trung bình F1 được tính riêng cho từng loài, không phải tính F1 từ hai giá trị macro.',
        ],
        cv_accuracy: [
            'Cross-validation · Kiểm định chéo',
            'Tập huấn luyện được chia thành các fold. Mỗi lượt dùng một fold để đánh giá và các fold còn lại để huấn luyện. CV accuracy là trung bình độ chính xác qua các lượt. SD là độ lệch chuẩn giữa các điểm số, không phải khoảng tin cậy. Tập kiểm tra cuối được giữ riêng.',
        ],
        cv_std: [
            'SD · Độ lệch chuẩn giữa các fold',
            'SD mô tả mức dao động của các điểm Accuracy giữa các fold, tính bằng điểm phần trăm. Ví dụ CV trung bình 95% và SD 2 điểm % không có nghĩa kết quả luôn nằm trong 93–97%. SD nhỏ hơn chỉ thể hiện ít dao động hơn trong cách chia này; đây không phải khoảng tin cậy.',
        ],
        brier_score: [
            'Brier · Sai lệch xác suất',
            'Mỗi mẫu có ba xác suất dự đoán và ba nhãn thật dạng 0 hoặc 1. Điểm ở đây là tổng sai lệch bình phương của ba lớp, sau đó lấy trung bình trên tập kiểm tra. Giá trị càng thấp càng tốt; đây không phải tỷ lệ phần trăm.',
        ],
        support: [
            'Support · Số mẫu',
            'Số mẫu thực tế của từng loài trong tập kiểm tra. Support giúp bạn đọc chỉ số cùng kích thước mẫu, thay vì chỉ nhìn phần trăm.',
        ],
    };

    function helpButton(key) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'evaluation-help';
        button.innerHTML =
            '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 5.5v1.5"/></svg>';
        button.dataset.metric = key;
        button.setAttribute('aria-label', `Giải thích ${explanations[key][0]}`);
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-controls', dialog.id);
        return button;
    }

    function showExplanation(key) {
        const item = explanations[key];
        if (!item) return;
        byId('evaluation-metric-title').textContent = item[0];
        byId('evaluation-metric-text').textContent = item[1];
        dialog.showModal();
    }

    // --- ĐỊNH DẠNG VÀ THÀNH PHẦN DÙNG CHUNG ---
    function number(value, digits = 2) {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
        return Number(value).toLocaleString('vi-VN', {
            maximumFractionDigits: digits,
            minimumFractionDigits: digits,
        });
    }

    function percent(value) {
        return value === null || value === undefined || !Number.isFinite(Number(value))
            ? '—'
            : `${number(value)}%`;
    }

    function cell(row, value, heading = false) {
        const element = document.createElement(heading ? 'th' : 'td');
        if (heading) element.scope = 'row';
        element.textContent = value;
        row.append(element);
        return element;
    }

    // --- ĐIỀU KIỆN ĐÁNH GIÁ VÀ GIỚI HẠN CỦA KẾT LUẬN ---
    function renderOverview() {
        const entries = Object.entries(evaluation.models);
        const metadata = byId('evaluation-method');
        metadata.replaceChildren();
        const facts = [
            [
                'Tập kiểm tra',
                evaluation.test_size == null ? 'Chưa ghi nhận' : `${evaluation.test_size} mẫu`,
            ],
            [
                'Cross-validation',
                evaluation.cv_folds == null
                    ? 'Chưa ghi nhận số fold'
                    : `${evaluation.cv_folds} fold trên tập huấn luyện`,
            ],
            ['Cách so sánh', 'Cùng tập kiểm tra và cùng các fold cho cả bốn mô hình SVM'],
            [
                'Random state',
                evaluation.random_state == null ? 'Chưa ghi nhận' : String(evaluation.random_state),
            ],
        ];
        for (const [label, value] of facts) {
            const item = document.createElement('span');
            const title = document.createElement('strong');
            title.textContent = `${label}: `;
            item.append(title, document.createTextNode(value));
            metadata.append(item);
        }
        const allPerfect = entries.every(([, metrics]) => metrics.accuracy === 100);
        byId('evaluation-observation-title').textContent = allPerfect
            ? `Cả ${entries.length} mô hình đều đúng toàn bộ mẫu kiểm tra.`
            : 'Một tập kiểm tra cho biết kết quả trong một điều kiện cụ thể.';
        byId('evaluation-observation').textContent = allPerfect
            ? 'Tập kiểm tra này chưa bộc lộ khác biệt về số mẫu đúng giữa các mô hình. Điểm 100% không bảo đảm đúng với mọi bông hoa mới. Hãy đọc thêm kiểm định chéo và điều kiện đánh giá trước khi kết luận.'
            : 'Đọc số mẫu đúng cùng điểm kiểm định chéo và độ dao động. Kết quả phụ thuộc dữ liệu và cách chia; chưa đủ để kết luận một mô hình luôn tốt hơn.';
    }

    function renderControls() {
        const previousDetail = detailSelect.value;
        detailSelect.replaceChildren();
        for (const [key, metrics] of Object.entries(evaluation.models)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = metrics.name || key;
            detailSelect.append(option);
        }
        if (evaluation.models[previousDetail]) detailSelect.value = previousDetail;
    }

    // Số mẫu đúng lấy từ đường chéo ma trận, không suy ngược từ phần trăm đã làm tròn.
    function correctSamples(matrix) {
        if (
            !Array.isArray(matrix) ||
            !matrix.length ||
            matrix.some(
                (row) =>
                    !Array.isArray(row) ||
                    row.length !== matrix.length ||
                    row.some((value) => !Number.isInteger(value) || value < 0),
            )
        )
            return 'Chưa có số mẫu';
        const total = matrix.flat().reduce((sum, value) => sum + value, 0);
        const correct = matrix.reduce((sum, row, index) => sum + row[index], 0);
        return `${correct} / ${total} mẫu`;
    }

    // --- BẢNG TỔNG HỢP, BÁO CÁO THEO LOÀI VÀ MA TRẬN ---
    function renderSummary() {
        const extras = byId('evaluation-extra-rows');
        summaryRows.replaceChildren();
        extras.replaceChildren();
        for (const [key, metrics] of Object.entries(evaluation.models)) {
            const row = document.createElement('tr');
            cell(row, metrics.name || key, true);
            cell(row, `${correctSamples(metrics.confusion_matrix)} · ${percent(metrics.accuracy)}`);
            cell(row, percent(metrics.cv_accuracy));
            cell(row, `${number(metrics.cv_std)} điểm %`);
            summaryRows.append(row);
            const extra = document.createElement('tr');
            cell(extra, metrics.name || key, true);
            ['precision', 'recall', 'f1_score'].forEach((metric) =>
                cell(extra, percent(metrics[metric])),
            );
            cell(extra, number(metrics.brier_score, 4));
            extras.append(extra);
        }
    }

    function renderDetail() {
        const key = detailSelect.value;
        const metrics = evaluation?.models[key];
        if (!metrics) return;
        byId('evaluation-selected-name').textContent = metrics.name || key;
        reportRows.replaceChildren();
        const report = metrics.classification_report || [];
        report.forEach((item) => {
            const row = document.createElement('tr');
            cell(row, item.species, true);
            ['precision', 'recall', 'f1_score'].forEach((metric) =>
                cell(row, percent(item[metric])),
            );
            cell(row, item.support);
            reportRows.append(row);
        });
        if (report.length) {
            const row = document.createElement('tr');
            row.className = 'evaluation-macro-row';
            cell(row, 'Trung bình macro', true);
            ['precision', 'recall', 'f1_score'].forEach((metric) =>
                cell(row, percent(metrics[metric])),
            );
            cell(
                row,
                report.reduce((sum, item) => sum + item.support, 0),
            );
            reportRows.append(row);
        } else {
            const row = document.createElement('tr');
            const message = cell(row, 'Chưa có báo cáo theo loài.');
            message.colSpan = 5;
            reportRows.append(row);
        }
        renderMatrix(metrics.confusion_matrix);
        parameters.replaceChildren();
        const parameterEntries = Object.entries(metrics.parameters || {});
        for (const [name, value] of parameterEntries) {
            const term = document.createElement('dt');
            term.textContent = name;
            const description = document.createElement('dd');
            description.textContent = value === null ? 'Không giới hạn / không đặt' : String(value);
            parameters.append(term, description);
        }
        if (!parameterEntries.length)
            parameters.textContent = 'Chưa có thông số trong phản hồi đánh giá.';
    }

    function renderMatrix(matrix) {
        matrixWrap.replaceChildren();
        const labels = evaluation.target_names || [];
        if (
            !Array.isArray(matrix) ||
            matrix.length !== labels.length ||
            !labels.length ||
            matrix.some((row) => !Array.isArray(row) || row.length !== labels.length)
        ) {
            matrixWrap.textContent = 'Chưa có ma trận nhầm lẫn.';
            return;
        }
        const table = document.createElement('table');
        table.className = 'evaluation-matrix';
        const caption = table.createCaption();
        caption.textContent = 'Số mẫu thực tế và dự đoán';
        caption.className = 'evaluation-sr-only';
        const header = table.createTHead().insertRow();
        const corner = document.createElement('th');
        corner.scope = 'col';
        corner.textContent = 'Thực tế / Dự đoán';
        header.append(corner);
        labels.forEach((label) => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = label;
            header.append(th);
        });
        const body = table.createTBody();
        const maximum = Math.max(1, ...matrix.flat());
        matrix.forEach((values, i) => {
            const row = body.insertRow();
            cell(row, labels[i], true);
            values.forEach((value, j) => {
                const td = cell(row, value);
                td.style.setProperty('--matrix-strength', String(0.06 + (0.42 * value) / maximum));
                td.className = i === j ? 'matrix-correct' : 'matrix-error';
                td.setAttribute(
                    'aria-label',
                    `Thực tế ${labels[i]}, dự đoán ${labels[j]}: ${value} mẫu`,
                );
            });
        });
        matrixWrap.append(table);
    }

    // --- TẢI KẾT QUẢ ĐÃ LƯU ---
    async function loadEvaluation() {
        content.hidden = true;
        status.textContent = 'Đang tải kết quả đánh giá đã lưu…';
        try {
            const response = await irisApiFetch('/models/evaluation', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Không thể tải kết quả (HTTP ${response.status}).`);
            const data = await response.json();
            if (!data.models || !Object.keys(data.models).length)
                throw new Error('Chưa có dữ liệu đánh giá.');
            evaluation = data;
            renderOverview();
            renderControls();
            renderSummary();
            renderDetail();
            content.hidden = false;
            status.textContent = '';
        } catch (error) {
            status.textContent = error.message || 'Không thể kết nối đến API đánh giá.';
        }
    }

    // --- SỰ KIỆN VÀ KHỞI TẠO ---
    detailSelect.addEventListener('change', renderDetail);
    page.addEventListener('click', (event) => {
        const button = event.target.closest('[data-metric]');
        if (button) showExplanation(button.dataset.metric);
    });
    byId('evaluation-metric-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
    page.querySelectorAll('[data-help-metric]').forEach((heading) =>
        heading.append(helpButton(heading.dataset.helpMetric)),
    );
    loadEvaluation();
})();

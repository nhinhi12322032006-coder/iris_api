
// Tương tác Câu chuyện Iris, tình huống giới hạn và đánh giá mô hình.
// 1. Minh họa bông hoa và các tình huống giới hạn.
(() => {
    // --- CÂU CHUYỆN IRIS: NỘI DUNG CÁC PHÉP ĐO ---
    const measurements = {
        petal_length: {
            field: 'PETAL LENGTH · cm',
            name: 'Chiều dài cánh hoa',
            description:
                'Đo theo trục dài của cánh hoa, từ gốc cánh đến đầu cánh. Đây là một trong bốn số đo đầu vào của mô hình.',
        },
        petal_width: {
            field: 'PETAL WIDTH · cm',
            name: 'Chiều rộng cánh hoa',
            description:
                'Đo ngang phần rộng của cánh hoa. Kết hợp với chiều dài cánh giúp mô tả kích thước cánh hoa.',
        },
        sepal_length: {
            field: 'SEPAL LENGTH · cm',
            name: 'Chiều dài lá đài',
            description:
                'Đo dọc một lá đài từ gốc đến đầu. Lá đài là phần bao quanh và nâng đỡ bông hoa.',
        },
        sepal_width: {
            field: 'SEPAL WIDTH · cm',
            name: 'Chiều rộng lá đài',
            description:
                'Đo ngang phần rộng của lá đài. Bốn số đo được dùng cùng nhau để phân loại hoa Iris.',
        },
    };
    const anatomyTargets = [...document.querySelectorAll('[data-anatomy]')];

    // --- TRANG CÂU CHUYỆN: SỐ ĐO VÀ MÔ HÌNH RIÊNG, MẶC ĐỊNH RBF ---
    const anatomyKeys = ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'];
    const anatomySvg = document.getElementById('anatomy-flower');
    const anatomyStatus = document.getElementById('anatomy-prediction-status');
    const anatomySpecies = document.getElementById('anatomy-prediction-species');
    const anatomySave = document.getElementById('anatomy-save');
    const anatomySaveMessage = document.getElementById('anatomy-save-message');
    const anatomyModel = document.getElementById('anatomy-model-select');
    const anatomyModelNames = Object.fromEntries(
        [...anatomyModel.options].map((option) => [option.value, option.text]),
    );
    const anatomyValues = {
        sepal_length: 5.9,
        sepal_width: 2.7,
        petal_length: 4.2,
        petal_width: 1.3,
    };
    const anatomyRanges = {
        sepal_length: {
            min: 3,
            max: 10,
            axis: 'x',
            origin: 180,
            tip: 73,
        },
        sepal_width: {
            min: 1,
            max: 6,
            axis: 'y',
            origin: 159,
            tip: 196,
        },
        petal_length: {
            min: 0.1,
            max: 10,
            axis: 'y',
            origin: 150,
            tip: 51,
        },
        petal_width: {
            min: 0.1,
            max: 4,
            axis: 'x',
            origin: 180,
            tip: 233,
        },
    };
    const minScale = 0.52;
    const maxScale = 1.38;
    let anatomyTimer;
    let anatomyRequest;
    let drag;
    let previewValues = null;
    let previewModel = null;
    let savingResult = false;
    let resultSaved = false;

    // --- CÂU CHUYỆN IRIS: CHỌN PHÉP ĐO VÀ VẼ HÌNH HOA ---
    function selectMeasurement(key) {
        const item = measurements[key];
        if (!item) return;
        for (const target of anatomyTargets) {
            const active = target.dataset.anatomy === key;
            target.classList.toggle('is-active', active);
            if (target.tagName.toLowerCase() !== 'g')
                target.setAttribute('aria-pressed', String(active));
        }
        document.querySelectorAll('.anatomy-readouts [data-measurement]').forEach((target) => {
            target.classList.toggle('is-active', target.dataset.measurement === key);
        });
        document.getElementById('anatomy-field').textContent = item.field;
        document.getElementById('anatomy-name').textContent = item.name;
        document.getElementById('anatomy-description').textContent = item.description;
    }
    function visualScale(key) {
        const { min, max } = anatomyRanges[key];
        return minScale + ((anatomyValues[key] - min) / (max - min)) * (maxScale - minScale);
    }

    function drawMeasuredFlower() {
        anatomyKeys.forEach((key) => {
            const value = anatomyValues[key].toFixed(1).replace('.', ',') + ' cm';
            document.getElementById(`anatomy-value-${key}`).textContent = value;
            const shape = document.querySelector(`.anatomy-svg-target[data-anatomy="${key}"]`);
            shape.setAttribute('aria-valuenow', anatomyValues[key].toFixed(1));
            shape.setAttribute('aria-valuetext', value);
        });
        const shapes = [
            ['petal_length', 180, 150, visualScale('petal_width'), visualScale('petal_length')],
            ['petal_width', 180, 150, visualScale('petal_width'), visualScale('petal_length')],
            ['sepal_length', 180, 158, visualScale('sepal_length'), visualScale('sepal_width')],
            ['sepal_width', 182, 159, visualScale('sepal_length'), visualScale('sepal_width')],
        ];
        shapes.forEach(([key, x, y, sx, sy]) => {
            const shape = document.querySelector(`.anatomy-svg-target[data-anatomy="${key}"]`);
            shape.setAttribute(
                'transform',
                `translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})`,
            );
        });
    }

    // --- XEM TRƯỚC KẾT QUẢ, KHÔNG LƯU LỊCH SỬ ---
    function updateSaveButton() {
        anatomyModel.disabled = savingResult;
        anatomySave.disabled = !previewValues || savingResult || resultSaved;
        anatomySave.textContent = savingResult
            ? 'Đang lưu...'
            : resultSaved
              ? 'Đã lưu ✓'
              : 'Lưu kết quả';
    }

    async function predictMeasuredFlower() {
        const values = { ...anatomyValues };
        const modelKey = anatomyModel.value;
        if (anatomyRequest) anatomyRequest.abort();
        const request = new AbortController();
        anatomyRequest = request;
        previewValues = null;
        previewModel = null;
        resultSaved = false;
        updateSaveButton();
        anatomyStatus.textContent = 'Đang dự đoán theo số đo hiện tại...';
        anatomySpecies.textContent = '…';
        try {
            const token = localStorage.getItem('irisai_token');
            if (!token) throw new Error('Bạn cần đăng nhập để xem dự đoán.');
            const response = await irisApiFetch('/predict/all', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ ...values, model_name: modelKey }),
                signal: request.signal,
            });
            if (!response.ok) {
                throw new Error(
                    response.status === 401
                        ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
                        : `Không thể dự đoán: HTTP ${response.status}.`,
                );
            }
            const data = (await response.json()).predictions?.[modelKey];
            if (
                !data ||
                !['setosa', 'versicolor', 'virginica'].includes(
                    String(data.prediction).toLowerCase(),
                )
            ) {
                throw new Error('Chưa nhận được kết quả mô hình hợp lệ.');
            }
            if (request.signal.aborted || request !== anatomyRequest) return;
            previewValues = values;
            previewModel = modelKey;
            anatomySpecies.textContent = 'Iris ' + data.prediction.toLowerCase();
            anatomyStatus.textContent =
                `Mô hình ${anatomyModelNames[modelKey]} · độ tin cậy ` +
                Number(data.confidence).toFixed(1).replace('.', ',') +
                '%';
            updateSaveButton();
        } catch (error) {
            if (request.signal.aborted || request !== anatomyRequest) return;
            anatomySpecies.textContent = 'Chưa có kết quả';
            anatomyStatus.textContent = error.message || 'Không thể kết nối đến API.';
        }
    }

    function queuePrediction(delay = 320) {
        clearTimeout(anatomyTimer);
        if (anatomyRequest) anatomyRequest.abort();
        previewValues = null;
        previewModel = null;
        resultSaved = false;
        anatomySaveMessage.textContent = '';
        anatomySaveMessage.classList.remove('is-success');
        updateSaveButton();
        anatomyStatus.textContent = 'Đang cập nhật kết quả...';
        anatomySpecies.textContent = '…';
        anatomyTimer = setTimeout(predictMeasuredFlower, delay);
    }

    // --- LƯU KẾT QUẢ KHI NGƯỜI DÙNG BẤM NÚT ---
    async function saveMeasuredFlower() {
        if (!previewValues || savingResult || resultSaved) return;
        const values = { ...previewValues };
        const modelKey = previewModel;
        savingResult = true;
        updateSaveButton();
        anatomySaveMessage.classList.remove('is-success');
        anatomySaveMessage.textContent = 'Đang lưu vào lịch sử...';
        try {
            const token = localStorage.getItem('irisai_token');
            if (!token) throw new Error('Bạn cần đăng nhập để lưu kết quả.');
            const response = await irisApiFetch('/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ ...values, model_name: modelKey }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(
                    response.status === 401
                        ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.'
                        : typeof data.detail === 'string'
                          ? data.detail
                          : 'Không thể lưu kết quả.',
                );
            }
            resultSaved = true;
            anatomySpecies.textContent = 'Iris ' + data.prediction;
            anatomyStatus.textContent =
                `Mô hình ${anatomyModelNames[modelKey]} · độ tin cậy ` +
                Number(data.confidence).toFixed(1).replace('.', ',') +
                '%';
            anatomySaveMessage.textContent = 'Đã lưu kết quả vào lịch sử.';
            anatomySaveMessage.classList.add('is-success');
            if (typeof loadPredictionHistory === 'function') loadPredictionHistory();
        } catch (error) {
            anatomySaveMessage.textContent = error.message || 'Không thể kết nối đến API.';
        } finally {
            savingResult = false;
            updateSaveButton();
        }
    }

    // --- CÂU CHUYỆN IRIS: CẬP NHẬT SỐ ĐO VÀ TỌA ĐỘ KÉO ---
    function setMeasurement(key, value) {
        if (savingResult) return false;
        const { min, max } = anatomyRanges[key];
        const clamped = Math.max(min, Math.min(max, Math.round(value * 10) / 10));
        if (clamped === anatomyValues[key]) return false;
        anatomyValues[key] = clamped;
        drawMeasuredFlower();
        queuePrediction();
        return true;
    }

    function svgPoint(event) {
        const point = anatomySvg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        return point.matrixTransform(anatomySvg.getScreenCTM().inverse());
    }
    function stopDragging(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const changed = drag.moved;
        drag = null;
        if (changed) queuePrediction(0);
    }
    // --- CÂU CHUYỆN IRIS: GẮN SỰ KIỆN CHỌN MÔ HÌNH, LƯU VÀ KÉO HOA ---
    anatomyTargets.forEach((target) => {
        target.addEventListener('click', () => selectMeasurement(target.dataset.anatomy));
        if (target.tagName.toLowerCase() === 'g') {
            target.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectMeasurement(target.dataset.anatomy);
                }
            });
        }
    });
    anatomyModel.addEventListener('change', () => queuePrediction(0));
    anatomySave.addEventListener('click', saveMeasuredFlower);

    anatomyTargets
        .filter((target) => target.tagName.toLowerCase() === 'g')
        .forEach((target) => {
            const key = target.dataset.anatomy;
            target.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                selectMeasurement(key);
                drag = {
                    key,
                    pointerId: event.pointerId,
                    start: svgPoint(event),
                    value: anatomyValues[key],
                    moved: false,
                };
                anatomySvg.setPointerCapture(event.pointerId);
            });
            target.addEventListener('keydown', (event) => {
                const direction = {
                    ArrowRight: 1,
                    ArrowUp: 1,
                    ArrowLeft: -1,
                    ArrowDown: -1,
                }[event.key];
                if (!direction) return;
                event.preventDefault();
                selectMeasurement(key);
                setMeasurement(key, anatomyValues[key] + direction * 0.1);
            });
        });
    anatomySvg.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const { min, max, axis, origin, tip } = anatomyRanges[drag.key];
        const delta = svgPoint(event)[axis] - drag.start[axis];
        const next = drag.value + ((delta / (tip - origin)) * (max - min)) / (maxScale - minScale);
        drag.moved = setMeasurement(drag.key, next) || drag.moved;
    });

    anatomySvg.addEventListener('pointerup', stopDragging);
    anatomySvg.addEventListener('pointercancel', stopDragging);
    anatomySvg.addEventListener('lostpointercapture', stopDragging);
    // --- CÂU CHUYỆN IRIS: KHỞI TẠO, KHÔNG TỰ LƯU KẾT QUẢ ---
    anatomyModel.value = 'svm_rbf';
    drawMeasuredFlower();

    // --- TRANG GIỚI HẠN: CÁC TÌNH HUỐNG ---
    const cases = {
        unusual: {
            tag: 'TÌNH HUỐNG 01 · SỐ ĐO',
            question: 'Nếu cánh hoa dài 9,8 cm thì sao?',
            response:
                'Mô hình vẫn có thể trả về một trong ba loài đã học, nhưng đây là số đo khác thường. Tên loài được trả về không xác nhận rằng mẫu hoa thực sự thuộc loài đó.',
            action: 'Kiểm tra lại số đo, đơn vị centimet và so sánh với phạm vi dữ liệu Iris trước khi sử dụng kết quả.',
        },
        unknown: {
            tag: 'TÌNH HUỐNG 02 · LOÀI HOA',
            question: 'Nếu đây là một loài Iris khác thì sao?',
            response:
                'Mô hình chỉ có ba lựa chọn: setosa, versicolor và virginica. Nó vẫn có thể đưa ra một tên trong ba loài này cho bông hoa ngoài phạm vi đã học.',
            action: 'Chỉ dùng kết quả để tham khảo trong phạm vi ba loài của bộ dữ liệu; không xem đây là cách xác định các loài Iris khác.',
        },
        confidence: {
            tag: 'TÌNH HUỐNG 03 · XÁC SUẤT',
            question: 'Nếu màn hình hiện độ tin cậy 97% thì sao?',
            response:
                '97% là xác suất mô hình ước lượng cho một loài trong ba loài đã học. Con số này không có nghĩa cứ 100 bông hoa thì mô hình chắc chắn đúng 97 bông.',
            action: 'Đối chiếu thêm các xác suất còn lại và phần đánh giá mô hình trước khi rút ra kết luận.',
        },
    };
    const caseButtons = [...document.querySelectorAll('.limits-case')];
    caseButtons.forEach((button) =>
        button.addEventListener('click', () => {
            const item = cases[button.dataset.case];
            if (!item) return;
            caseButtons.forEach((candidate) => {
                const active = candidate === button;
                candidate.classList.toggle('is-active', active);
                candidate.setAttribute('aria-pressed', String(active));
            });
            document.getElementById('limits-case-tag').textContent = item.tag;
            document.getElementById('limits-case-question').textContent = item.question;
            document.getElementById('limits-case-response').textContent = item.response;
            document.getElementById('limits-case-action').textContent = item.action;
        }),
    );
})();

// 2. Một bông hoa qua bốn mô hình SVM và thử nghiệm sai số trên tập kiểm tra.
// Thử nghiệm nhiễu số đo trên tập kiểm tra; không huấn luyện hoặc lưu lịch sử.
(() => {
    // --- GIAO DIỆN VÀ TRẠNG THÁI RIÊNG CỦA TRANG ĐÁNH GIÁ ---
    const byId = (id) => document.getElementById(id);
    const page = byId('page-evaluation');
    const slider = byId('limits-noise-level');
    const modelSelect = byId('limits-lab-model');
    const status = byId('limits-lab-status');
    const content = byId('limits-lab-content');
    const sampleSelect = byId('limits-sample');
    const cohort = byId('limits-cohort');
    const modelCards = new Map();
    if (!page || !slider || !modelSelect || !status || !content) return;

    const colors = ['#8b70d9', '#549f92', '#ce9d48', '#6482b6', '#c77d9b'];
    let result = null;
    let loading = false;
    let chart = null;

    // Giải thích nguyên lý chung; không mô phỏng lời giải thích cho một quyết định cụ thể.
    const principles = {
        svm_rbf:
            'SVM (RBF) dùng ranh giới có thể uốn cong để phân loại theo bốn số đo. Kết quả phụ thuộc cấu hình C, gamma và thang đo; không thể quy một lần đổi nhãn cho riêng một số đo chỉ từ thẻ này.',
        svm_linear:
            'SVM (Linear) dùng các mặt phẳng phân tách, ưu tiên khoảng cách lớn tới những mẫu gần ranh giới. Khi đầu vào đi qua ranh giới, nhãn có thể đổi.',
        svm_poly:
            'SVM (Polynomial) dùng kernel đa thức bậc 3 để biểu diễn quan hệ phi tuyến giữa bốn số đo. Kết quả phụ thuộc C, gamma, coef0 và thang đo dữ liệu.',
        svm_sigmoid:
            'SVM (Sigmoid) dùng hàm tanh trên tích vô hướng của các số đo. Với cấu hình mặc định và dữ liệu chưa chuẩn hóa, mô hình này có thể hoạt động kém; đây không phải kết luận cho mọi cấu hình Sigmoid.',

    };
    const featureLabels = ['Dài lá đài', 'Rộng lá đài', 'Dài cánh', 'Rộng cánh'];
    let featureMaxima = [];

    // --- ĐỊNH DẠNG, BẢNG VÀ CÁC CHỈ SỐ TẠI MỨC ĐANG CHỌN ---
    function number(value, digits = 2) {
        return Number(value).toLocaleString('vi-VN', { maximumFractionDigits: digits });
    }

    function cell(row, value, heading = false) {
        const element = document.createElement(heading ? 'th' : 'td');
        if (heading) element.scope = 'row';
        element.textContent = value;
        row.append(element);
    }

    function renderExperiment() {
        if (!result) return;
        const index = Number(slider.value);
        const level = result.noise_levels[index];
        const model = result.models[modelSelect.value];
        const baseline = model.runs[0];
        const current = model.runs[index];
        const difference = current.error_count - baseline.error_count;
        byId('limits-noise-label').textContent = `±${level}%`;
        slider.setAttribute(
            'aria-valuetext',
            `Sai lệch tương đối tối đa cộng hoặc trừ ${level} phần trăm`,
        );
        byId('limits-original-errors').textContent =
            `${baseline.error_count} / ${result.test_size}`;
        byId('limits-noisy-errors').textContent = `${current.error_count} / ${result.test_size}`;
        byId('limits-error-delta').textContent = `${difference > 0 ? '+' : ''}${difference} mẫu`;
        byId('limits-changed-count').textContent =
            `${current.changed_predictions} / ${result.test_size}`;
        const insight = byId('limits-lab-insight');
        insight.textContent =
            level === 0
                ? `${model.name}: chưa thêm nhiễu. Tỷ lệ phân loại sai gốc là ${number(baseline.error_rate)}%. Kéo thanh để quan sát tác động của sai lệch số đo.`
                : `${model.name}: ở mức sai lệch tối đa ±${level}%, mô phỏng có ${current.error_count}/${result.test_size} mẫu sai (${number(current.error_rate)}%), so với ${baseline.error_count} mẫu sai ban đầu. ${current.changed_predictions} mẫu đổi dự đoán; đổi dự đoán và dự đoán sai là hai chỉ số khác nhau.`;
        byId('limits-lab-comparison-title').textContent =
            `Cả bốn mô hình SVM nhận cùng dữ liệu ở mức sai lệch tối đa ±${level}%`;
        const rows = byId('limits-lab-model-rows');
        rows.replaceChildren();
        for (const model of Object.values(result.models)) {
            const run = model.runs[index];
            const row = document.createElement('tr');
            cell(row, model.name, true);
            cell(row, `${run.error_count}/${result.test_size}`);
            cell(row, `${number(run.error_rate)}%`);
            cell(row, `${number(run.accuracy)}%`);
            cell(row, run.changed_predictions);
            rows.append(row);
        }
        renderSample();
        renderExamples(current);
        renderChart();
    }

    // --- TƯƠNG TÁC MỘT MẪU: SỐ ĐO VÀ BỐN KẾT QUẢ NGANG HÀNG ---
    function initializePlayground() {
        sampleSelect.replaceChildren();
        // Giữ chỉ số gốc của tập kiểm tra để tra cứu đúng dự đoán, chỉ sắp thứ tự trình bày.
        const samples = result.samples.map((sample, index) => ({ ...sample, index }));
        samples.sort((a, b) => a.sample_id - b.sample_id);
        for (const sample of samples) {
            const option = document.createElement('option');
            option.value = String(sample.index);
            option.textContent = `#${sample.sample_id} · ${sample.actual}`;
            sampleSelect.append(option);
        }
        sampleSelect.value = String(
            result.samples.findIndex((sample) => sample.actual === 'versicolor'),
        );
        if (sampleSelect.selectedIndex < 0) sampleSelect.selectedIndex = 0;
        sampleSelect.disabled = false;
        featureMaxima = featureLabels.map((_, feature) =>
            Math.max(
                1,
                ...result.measurements_by_level.flatMap((rows) => rows.map((row) => row[feature])),
            ),
        );
        const cards = byId('playground-models');
        cards.replaceChildren();
        for (const [key, model] of Object.entries(result.models)) {
            const card = document.createElement('article');
            card.className = 'playground-model';
            card.dataset.model = key;
            const name = document.createElement('h4');
            name.textContent = model.name;
            const caption = document.createElement('p');
            caption.className = 'playground-change';
            caption.textContent = 'Dự đoán gốc → sau lệch';
            const prediction = document.createElement('p');
            prediction.className = 'playground-prediction';
            const verdict = document.createElement('p');
            verdict.className = 'playground-verdict';
            const change = document.createElement('p');
            change.className = 'playground-change';
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Cách mô hình này học';
            const principle = document.createElement('p');
            principle.textContent = principles[key] || 'Chưa có mô tả nguyên lý cho mô hình này.';
            details.append(summary, principle);
            card.append(name, caption, prediction, verdict, change, details);
            cards.append(card);
            modelCards.set(key, { card, prediction, verdict, change });
        }
    }

    function renderSample() {
        const sampleIndex = Number(sampleSelect.value);
        const levelIndex = Number(slider.value);
        const sample = result.samples[sampleIndex];
        const after = result.measurements_by_level[levelIndex][sampleIndex];
        byId('playground-truth').textContent =
            `Mẫu #${sample.sample_id} · Loài thật: ${sample.actual}`;
        const measurements = byId('playground-measurements');
        measurements.replaceChildren();
        featureLabels.forEach((label, index) => {
            const tile = document.createElement('div');
            tile.className = 'playground-measurement';
            const title = document.createElement('strong');
            title.textContent = label;
            const value = document.createElement('p');
            value.textContent = `${number(sample.before[index], 3)} → ${number(after[index], 3)} cm`;
            tile.append(title, value);
            for (const [name, amount, type] of [
                ['Gốc', sample.before[index], 'original'],
                ['Thử', after[index], 'perturbed'],
            ]) {
                const row = document.createElement('div');
                row.className = 'playground-bar-row';
                const caption = document.createElement('span');
                caption.textContent = name;
                const track = document.createElement('div');
                track.className = 'playground-bar-track';
                track.setAttribute('aria-hidden', 'true');
                const bar = document.createElement('span');
                bar.className = `playground-bar ${type}`;
                bar.style.width = `${(amount / featureMaxima[index]) * 100}%`;
                track.append(bar);
                row.append(caption, track);
                tile.append(row);
            }
            measurements.append(tile);
        });
        let correct = 0;
        let changed = 0;
        const answers = new Set();
        for (const [key, model] of Object.entries(result.models)) {
            const baseline = model.runs[0].predictions[sampleIndex];
            const prediction = model.runs[levelIndex].predictions[sampleIndex];
            const isCorrect = prediction === sample.actual;
            const isChanged = prediction !== baseline;
            correct += Number(isCorrect);
            changed += Number(isChanged);
            answers.add(prediction);
            const elements = modelCards.get(key);
            elements.prediction.textContent = `${baseline} → ${prediction}`;
            elements.verdict.textContent = isCorrect
                ? '✓ Đúng với loài thật'
                : '✕ Sai so với loài thật';
            elements.verdict.classList.toggle('is-correct', isCorrect);
            elements.verdict.classList.toggle('is-wrong', !isCorrect);
            elements.change.textContent = isChanged
                ? 'Đã đổi dự đoán so với số đo gốc'
                : 'Giữ nguyên dự đoán so với số đo gốc';
        }
        const count = Object.keys(result.models).length;
        byId('playground-message').textContent =
            `Ở mức ±${result.noise_levels[levelIndex]}%: ${correct}/${count} mô hình đoán đúng mẫu #${sample.sample_id}; ${changed} mô hình đổi dự đoán. ` +
            (answers.size === 1
                ? 'Cả bốn cùng một đáp án; cùng đáp án không có nghĩa luôn đúng.'
                : `Các mô hình đưa ra ${answers.size} đáp án khác nhau.`);
    }

    function findDisagreement() {
        if (!result) return;
        const index = Number(slider.value);
        const start = Number(sampleSelect.value);
        for (let offset = 1; offset <= result.samples.length; offset++) {
            const candidate = (start + offset) % result.samples.length;
            const answers = new Set(
                Object.values(result.models).map(
                    (model) => model.runs[index].predictions[candidate],
                ),
            );
            if (answers.size > 1) {
                sampleSelect.value = String(candidate);
                renderSample();
                return;
            }
        }
        byId('playground-message').textContent =
            `Chưa có mẫu nào khiến các mô hình bất đồng ở mức ±${result.noise_levels[index]}% trong 30 mẫu này. Hãy thử tăng mức lệch hoặc chọn mẫu khác.`;
    }

    function renderExamples(run) {
        const rows = byId('limits-lab-example-rows');
        rows.replaceChildren();
        byId('limits-lab-examples-note').textContent = run.error_count
            ? `Hiển thị ${run.examples.length} mẫu đầu trong ${run.error_count} mẫu bị phân loại sai của mô hình đang chọn. Mỗi ô số đo ghi giá trị gốc → giá trị sau nhiễu, đơn vị cm.`
            : 'Không có mẫu phân loại sai ở mức này trong lượt mô phỏng. Điều đó không bảo đảm đúng với mọi bông hoa mới.';
        for (const example of run.examples) {
            const row = document.createElement('tr');
            cell(row, `#${example.sample_id}`, true);
            cell(row, example.actual);
            cell(row, example.baseline_prediction);
            cell(row, example.prediction);
            example.before.forEach((value, index) =>
                cell(row, `${number(value, 3)} → ${number(example.after[index], 3)}`),
            );
            rows.append(row);
        }
        if (!run.examples.length) {
            const row = document.createElement('tr');
            const message = document.createElement('td');
            message.colSpan = 8;
            message.textContent = 'Không có mẫu sai để hiển thị.';
            row.append(message);
            rows.append(row);
        }
    }

    // --- BIỂU ĐỒ: CÙNG THƯỚC ĐO CHO CẢ BỐN MÔ HÌNH SVM ---
    function renderChart() {
        if (!result || !page.classList.contains('active') || !cohort.open) return;
        const canvas = byId('limits-lab-chart');
        const available = typeof Chart !== 'undefined';
        canvas.parentElement.hidden = !available;
        byId('limits-lab-chart-note').hidden = available;
        if (!available) return;
        if (chart) chart.destroy();
        const selected = Number(slider.value);
        const maximumErrors = Math.max(
            1,
            ...Object.values(result.models).flatMap((model) =>
                model.runs.map((run) => run.error_count),
            ),
        );
        const upperBound = Math.min(
            result.test_size,
            Math.max(5, Math.ceil(maximumErrors / 5) * 5),
        );
        const dark = document.documentElement.classList.contains('theme-dark');
        const textColor = dark ? '#c4cbe0' : '#736987';
        const selectedLevel = {
            id: 'selectedNoiseLevel',
            beforeDatasetsDraw(instance) {
                const { ctx, chartArea, scales } = instance;
                if (!chartArea) return;
                const x = scales.x.getPixelForValue(result.noise_levels[selected]);
                ctx.save();
                ctx.strokeStyle = dark ? '#c3b3ef' : '#9380b8';
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);
                ctx.stroke();
                ctx.restore();
            },
        };
        chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: result.noise_levels.map((level) => `±${level}%`),
                datasets: Object.values(result.models).map((model, index) => ({
                    label: model.name,
                    data: model.runs.map((run) => ({ x: run.noise_pct, y: run.error_count })),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    borderWidth: 2,
                    tension: 0,
                    fill: false,
                    pointRadius: result.noise_levels.map((_, index) =>
                        index === selected ? 5 : 2,
                    ),
                    pointHoverRadius: 6,
                })),
            },
            plugins: [selectedLevel],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, boxWidth: 12, padding: 16 },
                    },
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: 0,
                        max: Math.max(...result.noise_levels),
                        title: {
                            display: true,
                            text: 'Sai lệch tối đa của mỗi số đo',
                            color: textColor,
                        },
                        ticks: {
                            color: textColor,
                            maxTicksLimit: window.matchMedia('(max-width: 600px)').matches ? 3 : 11,
                            maxRotation: 0,
                            callback: (value) => `±${value}%`,
                        },
                        grid: { display: false },
                    },
                    y: {
                        beginAtZero: true,
                        min: 0,
                        max: upperBound,
                        title: {
                            display: true,
                            text: `Số mẫu phân loại sai (trên ${result.test_size})`,
                            color: textColor,
                        },
                        ticks: { precision: 0, color: textColor },
                        grid: { color: dark ? '#414a6744' : '#e9e5f3' },
                    },
                },
            },
        });
    }

    // --- ĐỌC KẾT QUẢ KHI NGƯỜI DÙNG MỞ TRANG ĐÁNH GIÁ ---
    async function loadExperiment() {
        if (result || loading) return;
        loading = true;
        status.textContent = 'Đang chạy thử nghiệm nhiễu số đo trên các mô hình đã lưu…';
        try {
            const response = await irisApiFetch('/models/robustness');
            const data = await response.json();
            if (!response.ok)
                throw new Error(
                    typeof data.detail === 'string' ? data.detail : 'Chưa chạy được thử nghiệm.',
                );
            if (!data.models || !Object.keys(data.models).length || !data.noise_levels?.length)
                throw new Error('Chưa có số liệu thử nghiệm.');
            if (
                !data.samples?.length ||
                !data.measurements_by_level?.length ||
                Object.values(data.models).some((model) => !model.runs[0]?.predictions)
            )
                throw new Error(
                    'Hãy cập nhật app.py và khởi động lại backend để dùng thử nghiệm từng mẫu.',
                );
            result = data;
            initializePlayground();
            modelSelect.replaceChildren();
            for (const [key, model] of Object.entries(result.models)) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = model.name;
                modelSelect.append(option);
            }
            slider.max = String(result.noise_levels.length - 1);
            slider.value = '0';
            slider.disabled = false;
            modelSelect.disabled = false;
            content.hidden = false;
            byId('limits-lab-method').textContent =
                `${result.test_size} mẫu kiểm tra có nhãn · Seed chia dữ liệu: ${result.split_seed} · Seed nhiễu: ${result.noise_seed}. Mỗi số đo được nhân với một hệ số ngẫu nhiên trong khoảng 1 − mức nhiễu đến 1 + mức nhiễu; nhãn loài giữ nguyên.`;
            status.textContent = '';
            renderExperiment();
        } catch (error) {
            status.textContent =
                error.message ||
                'Không thể tải thử nghiệm. Hãy kiểm tra backend và thử mở lại trang.';
        } finally {
            loading = false;
        }
    }

    // --- SỰ KIỆN VÀ KHỞI TẠO ---
    slider.addEventListener('input', renderExperiment);
    modelSelect.addEventListener('change', renderExperiment);
    sampleSelect.addEventListener('change', renderSample);
    byId('playground-disagreement').addEventListener('click', findDisagreement);
    byId('playground-reset').addEventListener('click', () => {
        slider.value = '0';
        renderExperiment();
    });
    cohort.addEventListener('toggle', () => {
        if (cohort.open) requestAnimationFrame(renderChart);
    });
    new MutationObserver(() => {
        if (page.classList.contains('active')) {
            if (!result) loadExperiment();
            else requestAnimationFrame(renderChart);
        }
    }).observe(page, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(() => {
        if (page.classList.contains('active')) renderChart();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (page.classList.contains('active')) loadExperiment();
})();

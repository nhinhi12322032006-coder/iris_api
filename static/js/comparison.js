
// So sánh dự đoán của năm mô hình trên cùng số đo, không ưu tiên mô hình nào.
(() => {
    const predictionList = document.getElementById('model-predictions');
    const predictionStatus = document.getElementById('model-prediction-status');
    const compareButton = document.getElementById('compare-current-input');
    const comparisonPanel = document.getElementById('quick-comparison');
    const closeButton = document.getElementById('close-comparison');
    const speciesNames = {
        setosa: 'Setosa',
        versicolor: 'Versicolor',
        virginica: 'Virginica',
    };
    let requestId = 0;
    // --- DÙNG CHUNG: HIỂN THỊ CHỈ SỐ ---
    function metric(label, value, unit = '%') {
        const box = document.createElement('div');
        box.className = 'model-metric';
        const number = document.createElement('strong');
        number.textContent = Number.isFinite(Number(value))
            ? `${Number(value)
                  .toFixed(unit ? 2 : 4)
                  .replace(/\.00$/, '')}${unit}`
            : '—';
        const caption = document.createElement('span');
        caption.textContent = label;
        box.append(number, caption);
        return box;
    }

    function row(model, subtitle, values) {
        const card = document.createElement('div');
        card.className = 'model-row';
        const heading = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'model-title';
        name.textContent = model.name;
        const detail = document.createElement('div');
        detail.className = 'model-subtitle';
        detail.textContent = subtitle;
        heading.append(name, detail);
        const figures = document.createElement('div');
        figures.className = 'model-metrics';
        values.forEach(([label, value, unit]) => figures.append(metric(label, value, unit)));
        card.append(heading, figures);
        return card;
    }
    // --- TRANG DỰ ĐOÁN: SO SÁNH NĂM MÔ HÌNH ---
    compareButton.addEventListener('click', async () => {
        comparisonPanel.hidden = false;
        compareButton.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() =>
            comparisonPanel.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            }),
        );
        const ids = ['num-sepal-len', 'num-sepal-wid', 'num-petal-len', 'num-petal-wid'];
        const numbers = ids.map((id) => Number(document.getElementById(id).value));
        if (numbers.some((value) => !Number.isFinite(value) || value <= 0)) {
            predictionStatus.textContent = 'Vui lòng nhập đủ bốn số đo lớn hơn 0 ở phía trên.';
            return;
        }
        const currentRequest = ++requestId;
        compareButton.disabled = true;
        predictionStatus.textContent = 'Đang so sánh các mô hình…';
        predictionList.replaceChildren();
        try {
            const response = await irisApiFetch('/predict/all', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(
                    Object.fromEntries(
                        ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'].map(
                            (key, index) => [key, numbers[index]],
                        ),
                    ),
                ),
            });
            if (!response.ok) throw new Error('API chưa có /predict/all');
            const data = await response.json();
            if (currentRequest !== requestId) return;
            for (const [key, item] of Object.entries(data.predictions || {})) {
                const card = row(
                    {
                        name: item.model_display_name,
                    },
                    `Dự đoán: ${speciesNames[item.prediction] || item.prediction}`,
                    [
                        ['Độ tin cậy', item.confidence],
                        ['Setosa', item.probabilities?.setosa],
                        ['Versicolor', item.probabilities?.versicolor],
                        ['Virginica', item.probabilities?.virginica],
                        ['Thời gian dự đoán', item.prediction_time_ms, ' ms'],
                    ],
                );
                card.dataset.modelKey = key;
                predictionList.append(card);
            }
            predictionStatus.textContent = `Đã so sánh ${data.total_models} mô hình trên cùng bốn số đo.`;
        } catch (error) {
            if (currentRequest === requestId)
                predictionStatus.textContent =
                    'Chưa thể so sánh. Hãy kiểm tra API đang chạy và thử lại.';
        } finally {
            if (currentRequest === requestId) compareButton.disabled = false;
        }
    });
    closeButton.addEventListener('click', () => {
        requestId++;
        comparisonPanel.hidden = true;
        compareButton.disabled = false;
        compareButton.setAttribute('aria-expanded', 'false');
        compareButton.focus();
    });
    // --- CẬP NHẬT KHI SỐ ĐO THAY ĐỔI ---
    function invalidateComparison() {
        if (comparisonPanel.hidden) return;
        requestId++;
        compareButton.disabled = false;
        predictionList.replaceChildren();
        predictionStatus.textContent =
            'Số đo đã thay đổi. Bấm “So sánh 5 mô hình” để xem kết quả mới.';
    }
    [
        'num-sepal-len',
        'num-sepal-wid',
        'num-petal-len',
        'num-petal-wid',
        'sepal-len',
        'sepal-wid',
        'petal-len',
        'petal-wid',
    ].forEach((id) => {
        document.getElementById(id).addEventListener('input', invalidateComparison);
    });
    document.querySelectorAll('.preset-btn').forEach((button) => {
        button.addEventListener('click', invalidateComparison);
    });
    document.addEventListener('click', (event) => {
        if (event.target.closest('.history-retry')) invalidateComparison();
    });
})();

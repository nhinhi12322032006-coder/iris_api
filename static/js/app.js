// --- ĐIỀU HƯỚNG VÀ THẺ CÂU CHUYỆN ---
function flipPersonCard(card, name) {
    const flipped = card.classList.toggle('flipped');
    card.setAttribute('aria-pressed', String(flipped));
    card.setAttribute('aria-label', name + (flipped ? ', nhấn để quay lại mặt trước' :
        ', nhấn để xem câu chuyện'));
}

function switchPage(pageId, btnElement) {
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.remove('active');
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    btnElement.classList.add('active');
    if (pageId === 'page-history') {
        loadPredictionHistory();
    }
}
// --- TRANG DỰ ĐOÁN: SỐ ĐO VÀ KẾT QUẢ ---
const elements = {
    'sepal-len': {
        slider: document.getElementById('sepal-len'),
        input: document.getElementById('num-sepal-len')
    },
    'sepal-wid': {
        slider: document.getElementById('sepal-wid'),
        input: document.getElementById('num-sepal-wid')
    },
    'petal-len': {
        slider: document.getElementById('petal-len'),
        input: document.getElementById('num-petal-len')
    },
    'petal-wid': {
        slider: document.getElementById('petal-wid'),
        input: document.getElementById('num-petal-wid')
    }
};
const subtitleBox = document.getElementById('subtitle-box');
const resultBox = document.getElementById('result');
const contentSplit = document.getElementById('content-split');
const flowerImg = document.getElementById('flower-img');
const descContainer = document.getElementById('flower-desc');
const predictBtn = document.getElementById('predict-btn');
const confidenceBox = document.getElementById('confidence-box');
const highestScore = document.getElementById('highest-score');
const highestBar = document.getElementById('highest-bar');
const irisData = {
    'setosa': {
        img: "setosa.jpg",
        text: "Iris setosa"
    },
    'versicolor': {
        img: "versicolor.jpg",
        text: "Iris versicolor"
    },
    'virginica': {
        img: "virginica.jpg",
        text: "Iris virginica"
    }
};
let irisSummaryData = [];
async function loadIrisSummaryData() {
    try {
        const response = await fetch('/iris/summary');
        if (!response.ok) {
            throw new Error('Không thể tải đặc điểm sơ lược Iris.');
        }
        irisSummaryData = await response.json();
    } catch (error) {
        console.error('Lỗi tải đặc điểm sơ lược Iris:', error);
    }
}

function updateFlowerDetails(predictionLabel) {
    const cleanLabel = String(predictionLabel).toLowerCase();
    let matchedKey = 'setosa';
    if (cleanLabel.includes('versicolor')) {
        matchedKey = 'versicolor';
    } else if (cleanLabel.includes('virginica')) {
        matchedKey = 'virginica';
    } else if (cleanLabel.includes('setosa')) {
        matchedKey = 'setosa';
    }
    const data = irisData[matchedKey];
    if (data) {
        subtitleBox.style.display = 'block';
        resultBox.className = "prediction-text";
        resultBox.innerText = data.text;
        flowerImg.src = data.img;
        const summary = irisSummaryData.find(item => item.Species_Name.toLowerCase() === matchedKey);
        if (summary) {
            descContainer.innerHTML = `
                <div class="bio-title">
                    Đặc điểm sinh học:
                </div>
                <ul>
                    <li>
                        <b>Cánh hoa (Petal):</b>
                        ${summary.Petal_Feature}
                    </li>

                    <li>
                        <b>Lá đài (Sepal):</b>
                        ${summary.Sepal_Feature}
                    </li>

                    <li>
                        <b>Tổng quan:</b>
                        ${summary.General_Feature}
                    </li>

                    <li>
                        <b>Nơi sống:</b>
                        ${summary.Habitat}
                    </li>
                </ul>
            `;
        }
        contentSplit.style.display = 'flex';
    }
}

function getConfidence(data) {
    const raw = data.confidence;
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    const percent = value >= 0 && value <= 1 ? value * 100 : value;
    return percent >= 0 && percent <= 100 ? Math.round(percent * 10) / 10 : null;
}
async function fetchPrediction(recordHistory = true) {
    const sepalLen = parseFloat(elements['sepal-len'].input.value);
    const sepalWid = parseFloat(elements['sepal-wid'].input.value);
    const petalLen = parseFloat(elements['petal-len'].input.value);
    const petalWidth = parseFloat(elements['petal-wid'].input.value);
    if (sepalLen <= 0 || sepalWid <= 0 || petalLen <= 0 || petalWidth <= 0 || isNaN(sepalLen) || isNaN(
            sepalWid) || isNaN(petalLen) || isNaN(petalWidth)) {
        subtitleBox.style.display = 'none';
        resultBox.className = "prediction-text warning-text";
        resultBox.innerText = "⚠️ Vui lòng không nhập giá trị 0cm hoặc để trống!";
        contentSplit.style.display = 'none';
        confidenceBox.style.display = 'none';
        return;
    }
    subtitleBox.style.display = 'none';
    resultBox.innerText = "Đang dự đoán...";
    resultBox.className = "prediction-text loading";
    const payload = {
        sepal_length: sepalLen,
        sepal_width: sepalWid,
        petal_length: petalLen,
        petal_width: petalWidth
    };
    try {
        const token = localStorage.getItem("irisai_token");
        if (!token) {
            throw new Error("Bạn cần đăng nhập trước khi dự đoán.");
        }
        const response = await fetch("/predict", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                localStorage.removeItem("irisai_token");
                localStorage.removeItem("irisai_username");
                localStorage.removeItem("irisai_role");
                window.dispatchEvent(new Event("irisai-logout"));
                throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
            }
            throw new Error(errorData.detail || "Không thể dự đoán.");
        }
        const data = await response.json();
        const predictedClass = data.prediction;
        if (typeof predictedClass !== 'string' || !/setosa|versicolor|virginica/i.test(predictedClass)) {
            throw new Error('Unexpected prediction');
        }
        updateFlowerDetails(predictedClass);
        const confidence = getConfidence(data);
        if (recordHistory) {
            await loadPredictionHistory();
        }
        confidenceBox.style.display = 'block';
        document.getElementById('confidence-note').style.display = confidence === null ? 'block' : 'none';
        confidenceBox.querySelector('.progress-bar-bg').style.display = confidence === null ? 'none' :
            'block';
        confidenceBox.querySelector('.classes-grid').style.display = 'none';
        if (confidence === null) highestScore.innerText = '—';
        if (confidence !== null) {
            highestScore.innerText = `${confidence}%`;
            highestBar.style.width = `${confidence}%`;
            // Chỉ hiện xác suất từng loài khi API cung cấp đủ ba giá trị thật.
            const probabilities = data.probabilities;
            const cardsGrid = confidenceBox.querySelector('.classes-grid');
            const keys = ['setosa', 'versicolor', 'virginica'];
            const scores = keys.map(key => probabilities && Number(probabilities[key]));
            const hasScores = probabilities && scores.every(value => Number.isFinite(value) && value >=
                0 && value <= 100);
            cardsGrid.style.display = hasScores ? '' : 'none';
            if (hasScores) keys.forEach((key, index) => {
                document.getElementById(`score-${key}`).innerText = `${scores[index]}%`;
                document.getElementById(`card-${key}`).classList.toggle('active-class',
                    predictedClass.toLowerCase().includes(key));
            });
        }
    } catch (error) {
        subtitleBox.style.display = 'none';
        resultBox.className = "prediction-text warning-text";
        resultBox.innerText = error.message || "Không thể kết nối đến API server!";
        contentSplit.style.display = 'none';
        confidenceBox.style.display = 'none';
    }
}
Object.keys(elements).forEach(key => {
    const item = elements[key];
    item.slider.addEventListener('input', (e) => {
        item.input.value = e.target.value;
    });
    item.input.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value);
        const min = parseFloat(item.slider.min);
        const max = parseFloat(item.slider.max);
        if (!isNaN(val)) {
            if (val < min) val = min;
            if (val > max) val = max;
            item.slider.value = val;
        }
    });
});
predictBtn.addEventListener('click', () => fetchPrediction());

// --- TRANG DỰ ĐOÁN: MẪU NHANH TỪ SQL ---
let irisSampleData = [];
async function loadIrisSampleData() {
    try {
        const response = await fetch('/iris/sample');
        if (!response.ok) {
            throw new Error('Không thể tải dữ liệu mẫu Iris.');
        }
        irisSampleData = await response.json();
    } catch (error) {
        console.error('Lỗi tải dữ liệu mẫu Iris:', error);
    }
}

function applyPreset(speciesName) {
    const sample = irisSampleData.find(item => item.Species_Name.toLowerCase() === speciesName.toLowerCase());
    if (!sample) {
        console.error('Không tìm thấy mẫu Iris:', speciesName);
        return;
    }
    elements['sepal-len'].input.value = sample.Sepal_Length;
    elements['sepal-len'].slider.value = sample.Sepal_Length;
    elements['sepal-wid'].input.value = sample.Sepal_Width;
    elements['sepal-wid'].slider.value = sample.Sepal_Width;
    elements['petal-len'].input.value = sample.Petal_Length;
    elements['petal-len'].slider.value = sample.Petal_Length;
    elements['petal-wid'].input.value = sample.Petal_Width;
    elements['petal-wid'].slider.value = sample.Petal_Width;
    fetchPrediction();
}
// --- TRANG LỊCH SỬ: TẢI, LỌC, XÓA, XUẤT VÀ DỰ ĐOÁN LẠI ---
let predictionHistory = [];
// Lịch sử của tài khoản được đọc và xóa qua API SQL.
const historyRows = document.getElementById('history-rows');
const historyEmpty = document.getElementById('history-empty');
const historyTableWrap = document.getElementById('history-table-wrap');
const historyMessage = document.getElementById('history-message');
const clearPredictionsBtn = document.getElementById('clear-predictions');
const exportPredictionsBtn = document.getElementById('export-predictions');
const historySearch = document.getElementById('history-search');
const historyFilter = document.getElementById('history-filter');
const historyCount = document.getElementById('history-count');
const historyNoMatch = document.getElementById('history-no-match');
async function loadPredictionHistory() {
    const token = localStorage.getItem("irisai_token");
    if (!token) {
        predictionHistory = [];
        renderPredictionHistory();
        return;
    }
    try {
        historyMessage.textContent = "Đang tải lịch sử...";
        const response = await fetch("/history", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem("irisai_token");
                localStorage.removeItem("irisai_username");
                localStorage.removeItem("irisai_role");
                throw new Error("Phiên đăng nhập đã hết hạn.");
            }
            throw new Error("Không thể tải lịch sử.");
        }
        const records = await response.json();
        predictionHistory = records.map(record => ({
            id: record.Prediction_ID,
            time: record.Created_Time,
            sepalLength: record.Sepal_Length,
            sepalWidth: record.Sepal_Width,
            petalLength: record.Petal_Length,
            petalWidth: record.Petal_Width,
            prediction: record.Prediction,
            confidence: record.Confidence
        }));
        predictionHistory.sort(
            (a, b) => new Date(b.time) - new Date(a.time));
        historyMessage.textContent = "";
        renderPredictionHistory();
    } catch (error) {
        predictionHistory = [];
        historyMessage.textContent = error.message;
        renderPredictionHistory();
    }
}

function renderPredictionHistory() {
    const entries = predictionHistory;
    historyRows.replaceChildren();
    historyEmpty.hidden = entries.length > 0;
    historyTableWrap.hidden = entries.length === 0;
    clearPredictionsBtn.disabled = entries.length === 0;
    exportPredictionsBtn.disabled = entries.length === 0;
    const search = historySearch.value.trim().toLocaleLowerCase('vi-VN');
    const species = historyFilter.value;
    const filtered = entries.filter(item => {
        const fields = [item.prediction, item.sepalLength, item.sepalWidth, item.petalLength, item
            .petalWidth
        ];
        return (!species || String(item.prediction).toLowerCase().includes(species)) && (!search ||
            fields.some(value => String(value).toLocaleLowerCase('vi-VN').includes(search)));
    });
    historyCount.textContent = entries.length ? `Hiển thị ${filtered.length}/${entries.length} lượt dự đoán` :
        '';
    historyNoMatch.hidden = filtered.length > 0;
    const labels = ['Thời gian', 'Dài lá đài', 'Rộng lá đài', 'Dài cánh hoa', 'Rộng cánh hoa', 'Kết quả',
        'Độ tin cậy'
    ];
    for (const item of filtered) {
        const row = document.createElement('tr');
        const timestamp = new Date(item.time);
        const values = [
            Number.isNaN(timestamp.getTime()) ? '—' : timestamp.toLocaleString('vi-VN'),
            item.sepalLength + ' cm', item.sepalWidth + ' cm',
            item.petalLength + ' cm', item.petalWidth + ' cm', item.prediction,
            typeof item.confidence === 'number' ? `${item.confidence}%` : '—'
        ];
        values.forEach((value, index) => {
            const cell = document.createElement('td');
            cell.dataset.label = labels[index];
            cell.textContent = value;
            if (index === 5) cell.className = 'history-result';
            row.appendChild(cell);
        });
        const actionCell = document.createElement('td');
        actionCell.dataset.label = 'Thao tác';
        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'history-retry';
        retryButton.textContent = 'Dự đoán lại ↗';
        retryButton.setAttribute('aria-label', 'Dự đoán lại với số đo của ' + values[0]);
        retryButton.addEventListener('click', () => retryPrediction(item));
        actionCell.appendChild(retryButton);
        row.appendChild(actionCell);
        historyRows.appendChild(row);
    }
}
clearPredictionsBtn.addEventListener('click', async () => {
    const confirmed = confirm('Bạn có chắc muốn xóa toàn bộ lịch sử dự đoán của tài khoản này?');
    if (!confirmed) {
        return;
    }
    const token = localStorage.getItem("irisai_token");
    if (!token) {
        historyMessage.textContent = "Bạn cần đăng nhập trước.";
        return;
    }
    try {
        clearPredictionsBtn.disabled = true;
        historyMessage.textContent = "Đang xóa lịch sử...";
        const response = await fetch("/history", {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem("irisai_token");
                localStorage.removeItem("irisai_username");
                localStorage.removeItem("irisai_role");
                throw new Error("Phiên đăng nhập đã hết hạn.");
            }
            throw new Error(data.detail || "Không thể xóa lịch sử.");
        }
        historyMessage.textContent = `Đã xóa ${data.deleted_count} lượt dự đoán.`;
        await loadPredictionHistory();
    } catch (error) {
        historyMessage.textContent = error.message;
    }
});
historySearch.addEventListener('input', renderPredictionHistory);
historyFilter.addEventListener('change', renderPredictionHistory);
exportPredictionsBtn.addEventListener('click', () => {
    const entries = predictionHistory;
    if (!entries.length) return;
    const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [
        ['Thời gian', 'Dài lá đài (cm)', 'Rộng lá đài (cm)', 'Dài cánh hoa (cm)',
            'Rộng cánh hoa (cm)', 'Kết quả', 'Độ tin cậy (%)'
        ], ...entries.map(item => [item.time, item.sepalLength, item.sepalWidth, item.petalLength,
            item.petalWidth, item.prediction, item.confidence ?? ''
        ])
    ];
    const blob = new Blob(['\uFEFF' + lines.map(row => row.map(escapeCsv).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lich-su-du-doan-iris-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener("irisai-login",
    () => {
        loadPredictionHistory();
    });
window.addEventListener("irisai-logout",
    () => {
        predictionHistory = [];
        renderPredictionHistory();
    });
// --- LỊCH SỬ: NẠP LẠI SỐ ĐO ĐỂ DỰ ĐOÁN ---
function retryPrediction(item) {
    const measurements = [item.sepalLength, item.sepalWidth, item.petalLength, item.petalWidth];
    const keys = ['sepal-len', 'sepal-wid', 'petal-len', 'petal-wid'];
    if (measurements.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
        historyMessage.textContent = 'Số đo đã lưu không hợp lệ, không thể dự đoán lại.';
        return;
    }
    keys.forEach((key, index) => {
        elements[key].input.value = measurements[index];
        elements[key].slider.value = measurements[index];
    });
    switchPage('page-1', document.querySelector('.nav-btn[onclick*="page-1"]'));
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
    fetchPrediction();
}
// --- TRANG PHÂN TÍCH: BIỂU ĐỒ VÀ BỘ LỌC LOÀI ---
// Khởi tạo các biểu đồ Chart.js ở trang 2 khi trang tải xong
window.addEventListener('DOMContentLoaded', () => {
    // Biểu đồ 1: Scatter Plot
    // Dữ liệu lấy từ 150 mẫu Iris trong SQL Server thông qua API /iris/data
    const chartSpeciesInputs = [...document.querySelectorAll('input[name="chart-species"]')];
    const chartFilterMessage = document.getElementById('chart-filter-message');
    const separationGuides = {
        id: 'separationGuides',
        beforeDatasetsDraw(chart) {
            const {
                ctx,
                chartArea,
                scales
            } = chart;
            if (!chartArea || !scales.x) return;
            const regions = [{
                from: chartArea.left,
                to: scales.x.getPixelForValue(2.85),
                color: 'rgba(56, 178, 172, 0.10)'
            }, {
                from: scales.x.getPixelForValue(2.85),
                to: scales.x.getPixelForValue(5),
                color: 'rgba(221, 107, 32, 0.09)'
            }, {
                from: scales.x.getPixelForValue(5),
                to: chartArea.right,
                color: 'rgba(107, 70, 193, 0.09)'
            }];
            ctx.save();
            for (const [index, region] of regions.entries()) {
                if (!chart.isDatasetVisible(index)) continue;
                const left = Math.max(chartArea.left, region.from);
                const right = Math.min(chartArea.right, region.to);
                if (right > left) {
                    ctx.fillStyle = region.color;
                    ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea
                        .top);
                }
            }
            ctx.strokeStyle = 'rgba(74, 85, 104, 0.65)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            for (const [index, value] of [2.85, 5].entries()) {
                if (!chart.isDatasetVisible(index) || !chart.isDatasetVisible(index + 1)) {
                    continue;
                }
                const x = scales.x.getPixelForValue(value);
                if (x > chartArea.left && x < chartArea.right) {
                    ctx.beginPath();
                    ctx.moveTo(x, chartArea.top);
                    ctx.lineTo(x, chartArea.bottom);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }
    };
    const ctxScatter = document.getElementById('irisScatterChart').getContext('2d');
    let scatterChart;
    async function loadIrisScatterData() {
        try {
            const response = await fetch('/iris/data');
            if (!response.ok) {
                throw new Error('Không thể tải 150 mẫu Iris từ SQL.');
            }
            const irisData = await response.json();
            const setosaData = irisData.filter(item => item.Species_Name.toLowerCase() ===
                'setosa').map(item => ({
                x: item.Petal_Length,
                y: item.Petal_Width
            }));
            const versicolorData = irisData.filter(item => item.Species_Name.toLowerCase() ===
                'versicolor').map(item => ({
                x: item.Petal_Length,
                y: item.Petal_Width
            }));
            const virginicaData = irisData.filter(item => item.Species_Name.toLowerCase() ===
                'virginica').map(item => ({
                x: item.Petal_Length,
                y: item.Petal_Width
            }));
            scatterChart = new Chart(ctxScatter, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Setosa',
                        data: setosaData,
                        backgroundColor: '#38b2ac'
                    }, {
                        label: 'Versicolor',
                        data: versicolorData,
                        backgroundColor: '#dd6b20'
                    }, {
                        label: 'Virginica',
                        data: virginicaData,
                        backgroundColor: '#6b46c1'
                    }]
                },
                plugins: [
                    separationGuides
                ],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Chiều dài cánh hoa - Petal Length (cm)'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Chiều rộng cánh hoa - Petal Width (cm)'
                            }
                        }
                    }
                }
            });
            updateChartSpecies();
            console.log(`Đã tải ${irisData.length} mẫu Iris từ SQL.`);
        } catch (error) {
            console.error('Lỗi tải dữ liệu Biểu đồ 1:', error);
            chartFilterMessage.textContent = 'Không thể tải dữ liệu biểu đồ từ SQL.';
        }
    }
    loadIrisScatterData();
    // Biểu đồ 2: Bar Chart (So sánh thông số trung bình)
    // Dữ liệu lấy từ SQL Server thông qua API /iris/sample
    const ctxBar = document.getElementById('irisBarChart').getContext('2d');
    let barChart;
    async function loadIrisAverageData() {
        try {
            const response = await fetch('/iris/sample');
            if (!response.ok) {
                throw new Error('Không thể tải dữ liệu Iris từ SQL.');
            }
            const irisSamples = await response.json();
            const setosa = irisSamples.find(item => item.Species_Name.toLowerCase() === 'setosa');
            const versicolor = irisSamples.find(item => item.Species_Name.toLowerCase() ===
                'versicolor');
            const virginica = irisSamples.find(item => item.Species_Name.toLowerCase() ===
                'virginica');
            barChart = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: ['Sepal Length', 'Sepal Width', 'Petal Length',
                        'Petal Width'],
                    datasets: [{
                        label: 'Setosa',
                        data: [
                            setosa.Sepal_Length,
                            setosa.Sepal_Width,
                            setosa.Petal_Length,
                            setosa.Petal_Width
                        ],
                        backgroundColor: '#38b2ac',
                        borderRadius: 6
                    }, {
                        label: 'Versicolor',
                        data: [
                            versicolor.Sepal_Length,
                            versicolor.Sepal_Width,
                            versicolor.Petal_Length,
                            versicolor.Petal_Width
                        ],
                        backgroundColor: '#dd6b20',
                        borderRadius: 6
                    }, {
                        label: 'Virginica',
                        data: [
                            virginica.Sepal_Length,
                            virginica.Sepal_Width,
                            virginica.Petal_Length,
                            virginica.Petal_Width
                        ],
                        backgroundColor: '#6b46c1',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: 'Giá trị trung bình (cm)'
                            },
                            beginAtZero: true
                        }
                    }
                }
            });
            updateChartSpecies();
        } catch (error) {
            console.error('Lỗi tải dữ liệu Biểu đồ 2:', error);
        }
    }
    loadIrisAverageData();

    function updateChartSpecies() {
        const selected = new Set(chartSpeciesInputs.filter(input => input.checked).map(input => input
            .value));
        const charts = [scatterChart, barChart];
        for (const chart of charts) {
            if (!chart) continue;
            chart.data.datasets.forEach(
                (dataset, index) => {
                    chart.setDatasetVisibility(index, selected.has(dataset.label));
                });
            chart.update();
        }
        chartFilterMessage.textContent = selected.size === 3 ? 'Đang hiển thị cả 3 loài.' :
            `Đang hiển thị: ${[...selected].join(', ')}.`;
    }
    chartSpeciesInputs.forEach(input => input.addEventListener('change', () => {
        if (!chartSpeciesInputs.some(option => option.checked)) {
            input.checked = true;
            chartFilterMessage.textContent = 'Hãy giữ ít nhất một loài để hiển thị.';
            return;
        }
        updateChartSpecies();
    }));
});
// --- KHỞI TẠO DỮ LIỆU VÀ NÚT MẪU ---
loadIrisSummaryData();
loadIrisSampleData();
loadPredictionHistory();
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.preset-btn').forEach(button => {
        button.addEventListener('click', () => {
            const speciesName = button.dataset.species;
            applyPreset(speciesName);
        });
    });
});
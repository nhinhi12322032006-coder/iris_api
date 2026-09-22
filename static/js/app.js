function flipPersonCard(card, name) {
    const flipped = card.classList.toggle('flipped');
    card.setAttribute('aria-pressed', String(flipped));
    card.setAttribute('aria-label', name + (flipped ? ', nhấn để quay lại mặt trước' : ', nhấn để xem câu chuyện'));
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
}

const elements = {
    'sepal-len': { slider: document.getElementById('sepal-len'), input: document.getElementById('num-sepal-len') },
    'sepal-wid': { slider: document.getElementById('sepal-wid'), input: document.getElementById('num-sepal-wid') },
    'petal-len': { slider: document.getElementById('petal-len'), input: document.getElementById('num-petal-len') },
    'petal-wid': { slider: document.getElementById('petal-wid'), input: document.getElementById('num-petal-wid') }
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
        text: "Iris setosa",
        desc: `
            <div class="bio-title">Đặc điểm sinh học:</div>
            <ul>
                <li><b>Cánh hoa (Petal):</b> Rất ngắn và hẹp.</li>
                <li><b>Lá đài (Sepal):</b> Tương đối rộng và tròn.</li>
                <li><b>Tổng quan:</b> Tổng thể nhỏ gọn, dễ phân biệt.</li>
                <li><b>Nơi sống:</b> Thường mọc tự nhiên ở các vùng lạnh giá phía bắc như Alaska, Canada, vùng Đông Bắc Á (Siberia, Nhật Bản).</li>
            </ul>
        `
    },
    'versicolor': {
        img: "versicolor.jpg",
        text: "Iris versicolor",
        desc: `
            <div class="bio-title">Đặc điểm sinh học:</div>
            <ul>
                <li><b>Cánh hoa (Petal):</b> Kích thước trung bình.</li>
                <li><b>Lá đài (Sepal):</b> Thon dài, cân đối.</li>
                <li><b>Tổng quan:</b> Kích thước trung bình so với Setosa và Virginica.</li>
                <li><b>Nơi sống:</b> Phổ biến ở miền đông Bắc Mỹ, mọc hoang ở đất ẩm ướt, bờ ao, đầm lầy hoặc vùng ngập nước nông.</li>
            </ul>
        `
    },
    'virginica': {
        img: "virginica.jpg",
        text: "Iris virginica",
        desc: `
            <div class="bio-title">Đặc điểm sinh học:</div>
            <ul>
                <li><b>Cánh hoa (Petal):</b> Dài và phát triển lớn nhất.</li>
                <li><b>Lá đài (Sepal):</b> Kích thước rộng, dài và khỏe khoắn.</li>
                <li><b>Tổng quan:</b> Cấu trúc bông hoa lớn vượt trội.</li>
                <li><b>Nơi sống:</b> Tìm thấy ở miền đông và đông nam Hoa Kỳ, ưa môi trường đất ẩm ven sông suối, đầm lầy.</li>
            </ul>
        `
    }
    
};

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
        descContainer.innerHTML = data.desc;
        contentSplit.style.display = 'flex'; 
    }
}

// Lưu trên thiết bị hiện tại; không ghi các lần dự đoán lỗi hoặc lần tự chạy khi mở trang.
const HISTORY_KEY = 'irisai-prediction-history-v1';
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

function getConfidence(data) {
    const raw = data.confidence;
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    const percent = value >= 0 && value <= 1 ? value * 100 : value;
    return percent >= 0 && percent <= 100 ? Math.round(percent * 10) / 10 : null;
}

function readPredictionHistory() {
    try {
        const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        historyMessage.textContent = 'Không thể đọc lịch sử đã lưu trên trình duyệt này.';
        return [];
    }
}

function renderPredictionHistory() {
    const entries = readPredictionHistory();
    historyRows.replaceChildren();
    historyEmpty.hidden = entries.length > 0;
    historyTableWrap.hidden = entries.length === 0;
    clearPredictionsBtn.disabled = entries.length === 0;
    exportPredictionsBtn.disabled = entries.length === 0;
    const search = historySearch.value.trim().toLocaleLowerCase('vi-VN');
    const species = historyFilter.value;
    const filtered = entries.filter(item => {
        const fields = [item.prediction, item.sepalLength, item.sepalWidth, item.petalLength, item.petalWidth];
        return (!species || String(item.prediction).toLowerCase().includes(species)) &&
            (!search || fields.some(value => String(value).toLocaleLowerCase('vi-VN').includes(search)));
    });
    historyCount.textContent = entries.length ? `Hiển thị ${filtered.length}/${entries.length} lượt dự đoán` : '';
    historyNoMatch.hidden = filtered.length > 0;
    const labels = ['Thời gian', 'Dài lá đài', 'Rộng lá đài', 'Dài cánh hoa', 'Rộng cánh hoa', 'Kết quả', 'Độ tin cậy'];
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

function savePrediction(payload, prediction, confidence) {
    try {
        const entries = readPredictionHistory();
        entries.unshift({
            time: new Date().toISOString(),
            sepalLength: payload.sepal_length, sepalWidth: payload.sepal_width,
            petalLength: payload.petal_length, petalWidth: payload.petal_width,
            prediction, confidence
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
        historyMessage.textContent = '';
        renderPredictionHistory();
    } catch (error) {
        historyMessage.textContent = 'Không thể lưu lịch sử trên trình duyệt này. Hãy kiểm tra chế độ riêng tư hoặc dung lượng lưu trữ.';
    }
}

clearPredictionsBtn.addEventListener('click', () => {
    if (!confirm('Xóa toàn bộ lịch sử dự đoán trên trình duyệt này?')) return;
    try {
        localStorage.removeItem(HISTORY_KEY);
        historyMessage.textContent = '';
        renderPredictionHistory();
    } catch (error) {
        historyMessage.textContent = 'Không thể xóa lịch sử trên trình duyệt này.';
    }
});
historySearch.addEventListener('input', renderPredictionHistory);
historyFilter.addEventListener('change', renderPredictionHistory);
exportPredictionsBtn.addEventListener('click', () => {
    const entries = readPredictionHistory();
    if (!entries.length) return;
    const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [['Thời gian', 'Dài lá đài (cm)', 'Rộng lá đài (cm)', 'Dài cánh hoa (cm)', 'Rộng cánh hoa (cm)', 'Kết quả', 'Độ tin cậy (%)'],
        ...entries.map(item => [item.time, item.sepalLength, item.sepalWidth, item.petalLength, item.petalWidth, item.prediction, item.confidence ?? ''])];
    const blob = new Blob(['\uFEFF' + lines.map(row => row.map(escapeCsv).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lich-su-du-doan-iris-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
renderPredictionHistory();

async function fetchPrediction(recordHistory = true) {
    const sepalLen = parseFloat(elements['sepal-len'].input.value);
    const sepalWid = parseFloat(elements['sepal-wid'].input.value);
    const petalLen = parseFloat(elements['petal-len'].input.value);
    const petalWidth = parseFloat(elements['petal-wid'].input.value);

    if (sepalLen <= 0 || sepalWid <= 0 || petalLen <= 0 || petalWidth <= 0 || 
        isNaN(sepalLen) || isNaN(sepalWid) || isNaN(petalLen) || isNaN(petalWidth)) {
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
        const response = await fetch("https://iris-api-5jf3.onrender.com/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("API Error");

        const data = await response.json();
        const predictedClass = data.prediction;

        if (typeof predictedClass !== 'string' || !/setosa|versicolor|virginica/i.test(predictedClass)) {
            throw new Error('Unexpected prediction');
        }
        updateFlowerDetails(predictedClass);
        const confidence = getConfidence(data);
        if (recordHistory) savePrediction(payload, resultBox.innerText, confidence);
        confidenceBox.style.display = 'block';
        document.getElementById('confidence-note').style.display = confidence === null ? 'block' : 'none';
        confidenceBox.querySelector('.progress-bar-bg').style.display = confidence === null ? 'none' : 'block';
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
            const hasScores = probabilities && scores.every(value => Number.isFinite(value) && value >= 0 && value <= 100);
            cardsGrid.style.display = hasScores ? '' : 'none';
            if (hasScores) keys.forEach((key, index) => {
                document.getElementById(`score-${key}`).innerText = `${scores[index]}%`;
                document.getElementById(`card-${key}`).classList.toggle('active-class', predictedClass.toLowerCase().includes(key));
            });
        }

    } catch (error) {
        subtitleBox.style.display = 'none';
        resultBox.className = "prediction-text warning-text";
        resultBox.innerText = "Không thể kết nối đến API server!";
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetchPrediction();
}

function applyPreset(sepalLen, sepalWid, petalLen, petalWidth) {
    elements['sepal-len'].input.value = sepalLen; elements['sepal-len'].slider.value = sepalLen;
    elements['sepal-wid'].input.value = sepalWid; elements['sepal-wid'].slider.value = sepalWid;
    elements['petal-len'].input.value = petalLen; elements['petal-len'].slider.value = petalLen;
    elements['petal-wid'].input.value = petalWidth; elements['petal-wid'].slider.value = petalWidth;
    fetchPrediction();
}

// Khởi tạo các biểu đồ Chart.js ở trang 2 khi trang tải xong
window.addEventListener('DOMContentLoaded', () => {
    fetchPrediction(false);

    // Biểu đồ 1: Scatter Plot
    const ctxScatter = document.getElementById('irisScatterChart').getContext('2d');
    new Chart(ctxScatter, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Setosa',
                    data: [{x: 1.4, y: 0.2}, {x: 1.5, y: 0.2}, {x: 1.3, y: 0.2}, {x: 1.6, y: 0.4}, {x: 1.4, y: 0.3}, {x: 1.7, y: 0.4}],
                    backgroundColor: '#38b2ac'
                },
                {
                    label: 'Versicolor',
                    data: [{x: 4.5, y: 1.5}, {x: 4.7, y: 1.4}, {x: 4.3, y: 1.3}, {x: 4.6, y: 1.5}, {x: 4.0, y: 1.0}, {x: 4.9, y: 1.8}],
                    backgroundColor: '#dd6b20'
                },
                {
                    label: 'Virginica',
                    data: [{x: 5.1, y: 2.0}, {x: 5.9, y: 2.1}, {x: 5.6, y: 2.0}, {x: 5.8, y: 2.2}, {x: 6.6, y: 2.1}, {x: 5.5, y: 1.8}],
                    backgroundColor: '#6b46c1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Chiều dài cánh hoa - Petal Length (cm)' } },
                y: { title: { display: true, text: 'Chiều rộng cánh hoa - Petal Width (cm)' } }
            }
        }
    });

    // Biểu đồ 2: Bar Chart (So sánh thông số trung bình)
    const ctxBar = document.getElementById('irisBarChart').getContext('2d');
    new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Sepal Length', 'Sepal Width', 'Petal Length', 'Petal Width'],
            datasets: [
                {
                    label: 'Setosa',
                    data: [5.0, 3.4, 1.5, 0.2],
                    backgroundColor: '#38b2ac',
                    borderRadius: 6
                },
                {
                    label: 'Versicolor',
                    data: [5.9, 2.7, 4.2, 1.3],
                    backgroundColor: '#dd6b20',
                    borderRadius: 6
                },
                {
                    label: 'Virginica',
                    data: [6.5, 3.0, 5.5, 2.0],
                    backgroundColor: '#6b46c1',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Giá trị trung bình (cm)' }, beginAtZero: true }
            }
        }
    });
});

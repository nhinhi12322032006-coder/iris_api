// Tương tác minh họa riêng cho trang Câu chuyện và Giới hạn.
(() => {
    const measurements = {
        petal_length: {
            field: 'PETAL LENGTH · cm', name: 'Chiều dài cánh hoa',
            description: 'Đo theo trục dài của cánh hoa, từ gốc cánh đến đầu cánh. Đây là một trong bốn số đo đầu vào của mô hình.'
        },
        petal_width: {
            field: 'PETAL WIDTH · cm', name: 'Chiều rộng cánh hoa',
            description: 'Đo ngang phần rộng của cánh hoa. Kết hợp với chiều dài cánh giúp mô tả kích thước cánh hoa.'
        },
        sepal_length: {
            field: 'SEPAL LENGTH · cm', name: 'Chiều dài lá đài',
            description: 'Đo dọc một lá đài từ gốc đến đầu. Lá đài là phần bao quanh và nâng đỡ bông hoa.'
        },
        sepal_width: {
            field: 'SEPAL WIDTH · cm', name: 'Chiều rộng lá đài',
            description: 'Đo ngang phần rộng của lá đài. Bốn số đo được dùng cùng nhau để phân loại hoa Iris.'
        }
    };

    const anatomyTargets = [...document.querySelectorAll('[data-anatomy]')];
    function selectMeasurement(key) {
        const item = measurements[key];
        if (!item) return;
        for (const target of anatomyTargets) {
            const active = target.dataset.anatomy === key;
            target.classList.toggle('is-active', active);
            if (target.tagName.toLowerCase() !== 'g') target.setAttribute('aria-pressed', String(active));
        }
        document.querySelectorAll('.anatomy-readouts [data-measurement]').forEach(target => {
            target.classList.toggle('is-active', target.dataset.measurement === key);
        });
        document.getElementById('anatomy-field').textContent = item.field;
        document.getElementById('anatomy-name').textContent = item.name;
        document.getElementById('anatomy-description').textContent = item.description;
    }
    anatomyTargets.forEach(target => {
        target.addEventListener('click', () => selectMeasurement(target.dataset.anatomy));
        if (target.tagName.toLowerCase() === 'g') {
            target.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectMeasurement(target.dataset.anatomy);
                }
            });
        }
    });

    // Trang Câu chuyện: kéo trực tiếp trên hình để thay đổi số đo và gọi SVM (RBF).
    const anatomyKeys = ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'];
    const anatomySvg = document.getElementById('anatomy-flower');
    const anatomyStatus = document.getElementById('anatomy-prediction-status');
    const anatomySpecies = document.getElementById('anatomy-prediction-species');
    const anatomyValues = { sepal_length: 5.9, sepal_width: 2.7, petal_length: 4.2, petal_width: 1.3 };
    const anatomyRanges = {
        sepal_length: { min: 3, max: 10, axis: 'x', origin: 180, tip: 73 },
        sepal_width: { min: 1, max: 6, axis: 'y', origin: 159, tip: 196 },
        petal_length: { min: 0.1, max: 10, axis: 'y', origin: 150, tip: 51 },
        petal_width: { min: 0.1, max: 4, axis: 'x', origin: 180, tip: 233 }
    };
    const minScale = 0.52;
    const maxScale = 1.38;
    let anatomyTimer;
    let anatomyRequest;
    let drag;

    function visualScale(key) {
        const { min, max } = anatomyRanges[key];
        return minScale + (anatomyValues[key] - min) / (max - min) * (maxScale - minScale);
    }

    function drawMeasuredFlower() {
        anatomyKeys.forEach(key => {
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
            ['sepal_width', 182, 159, visualScale('sepal_length'), visualScale('sepal_width')]
        ];
        shapes.forEach(([key, x, y, sx, sy]) => {
            const shape = document.querySelector(`.anatomy-svg-target[data-anatomy="${key}"]`);
            shape.setAttribute('transform', `translate(${x} ${y}) scale(${sx} ${sy}) translate(${-x} ${-y})`);
        });
    }

    async function predictMeasuredFlower() {
        const values = { ...anatomyValues };
        if (anatomyRequest) anatomyRequest.abort();
        const request = new AbortController();
        anatomyRequest = request;
        anatomyStatus.textContent = 'Đang dự đoán theo số đo hiện tại...';
        anatomySpecies.textContent = '…';
        try {
            const response = await fetch('/predict', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...values, model_name: 'svm_rbf' }), signal: request.signal
            });
            if (!response.ok) throw new Error('Máy chủ chưa trả về kết quả.');
            const data = await response.json();
            if (!['setosa', 'versicolor', 'virginica'].includes(String(data.prediction).toLowerCase())) {
                throw new Error('Kết quả dự đoán không hợp lệ.');
            }
            if (request !== anatomyRequest) return;
            anatomySpecies.textContent = 'Iris ' + data.prediction.toLowerCase();
            anatomyStatus.textContent = 'Mô hình SVM (RBF) · ' +
                (Number.isFinite(Number(data.confidence)) ? `độ tin cậy ${Number(data.confidence).toFixed(1).replace('.', ',')}%` : 'đã dự đoán');
        } catch (error) {
            if (error.name === 'AbortError' || request !== anatomyRequest) return;
            anatomySpecies.textContent = 'Chưa có kết quả';
            anatomyStatus.textContent = 'Không kết nối được API. Hãy chạy ứng dụng rồi kéo một điểm trên hình để thử lại.';
        }
    }

    function queuePrediction(delay = 320) {
        clearTimeout(anatomyTimer);
        if (anatomyRequest) anatomyRequest.abort();
        anatomyStatus.textContent = 'Đang cập nhật kết quả...';
        anatomySpecies.textContent = '…';
        anatomyTimer = setTimeout(predictMeasuredFlower, delay);
    }

    function setMeasurement(key, value) {
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

    anatomyTargets.filter(target => target.tagName.toLowerCase() === 'g').forEach(target => {
        const key = target.dataset.anatomy;
        target.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            selectMeasurement(key);
            drag = { key, pointerId: event.pointerId, start: svgPoint(event), value: anatomyValues[key], moved: false };
            anatomySvg.setPointerCapture(event.pointerId);
        });
        target.addEventListener('keydown', event => {
            const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
            if (!direction) return;
            event.preventDefault();
            selectMeasurement(key);
            setMeasurement(key, anatomyValues[key] + direction * 0.1);
        });
    });

    anatomySvg.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const { min, max, axis, origin, tip } = anatomyRanges[drag.key];
        const delta = svgPoint(event)[axis] - drag.start[axis];
        const next = drag.value + delta / (tip - origin) * (max - min) / (maxScale - minScale);
        drag.moved = setMeasurement(drag.key, next) || drag.moved;
    });
    function stopDragging(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const changed = drag.moved;
        drag = null;
        if (changed) queuePrediction(0);
    }
    anatomySvg.addEventListener('pointerup', stopDragging);
    anatomySvg.addEventListener('pointercancel', stopDragging);
    anatomySvg.addEventListener('lostpointercapture', stopDragging);

    drawMeasuredFlower();
    predictMeasuredFlower();

    const cases = {
        unusual: {
            tag: 'TÌNH HUỐNG 01 · SỐ ĐO', question: 'Nếu cánh hoa dài 9,8 cm thì sao?',
            response: 'Mô hình vẫn có thể trả về một trong ba loài đã học, nhưng đây là số đo khác thường. Tên loài được trả về không xác nhận rằng mẫu hoa thực sự thuộc loài đó.',
            action: 'Kiểm tra lại số đo, đơn vị centimet và so sánh với phạm vi dữ liệu Iris trước khi sử dụng kết quả.'
        },
        unknown: {
            tag: 'TÌNH HUỐNG 02 · LOÀI HOA', question: 'Nếu đây là một loài Iris khác thì sao?',
            response: 'Mô hình chỉ có ba lựa chọn: setosa, versicolor và virginica. Nó vẫn có thể đưa ra một tên trong ba loài này cho bông hoa ngoài phạm vi đã học.',
            action: 'Chỉ dùng kết quả để tham khảo trong phạm vi ba loài của bộ dữ liệu; không xem đây là cách xác định các loài Iris khác.'
        },
        confidence: {
            tag: 'TÌNH HUỐNG 03 · XÁC SUẤT', question: 'Nếu màn hình hiện độ tin cậy 97% thì sao?',
            response: '97% là xác suất mô hình ước lượng cho một loài trong ba loài đã học. Con số này không có nghĩa cứ 100 bông hoa thì mô hình chắc chắn đúng 97 bông.',
            action: 'Đối chiếu thêm các xác suất còn lại và phần đánh giá mô hình trước khi rút ra kết luận.'
        }
    };

    const caseButtons = [...document.querySelectorAll('.limits-case')];
    caseButtons.forEach(button => button.addEventListener('click', () => {
        const item = cases[button.dataset.case];
        if (!item) return;
        caseButtons.forEach(candidate => {
            const active = candidate === button;
            candidate.classList.toggle('is-active', active);
            candidate.setAttribute('aria-pressed', String(active));
        });
        document.getElementById('limits-case-tag').textContent = item.tag;
        document.getElementById('limits-case-question').textContent = item.question;
        document.getElementById('limits-case-response').textContent = item.response;
        document.getElementById('limits-case-action').textContent = item.action;
    }));
})();

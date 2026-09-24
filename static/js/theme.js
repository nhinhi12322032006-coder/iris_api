// Giao diện sáng/tối dùng chung cho năm trang. Không thay đổi dữ liệu dự đoán.
(() => {
    const key = 'irisai-theme';
    const saved = (() => {
        try { return localStorage.getItem(key); } catch { return null; }
    })();
    const root = document.documentElement;
    const lightChartText = window.Chart?.defaults.color;
    const lightChartGrid = window.Chart?.defaults.borderColor;

    function updateCharts(dark) {
        if (!window.Chart) return;
        const textColor = dark ? '#d2d9eb' : lightChartText;
        const gridColor = dark ? 'rgba(193, 201, 229, .18)' : lightChartGrid;
        Chart.defaults.color = textColor;
        Chart.defaults.borderColor = gridColor;
        ['irisScatterChart', 'irisBarChart'].forEach(id => {
            const chart = Chart.getChart(id);
            if (!chart) return;
            chart.options.color = textColor;
            chart.options.plugins.legend.labels.color = textColor;
            Object.values(chart.options.scales).forEach(scale => {
                scale.ticks.color = textColor;
                scale.title.color = textColor;
                scale.grid.color = gridColor;
            });
            chart.update('none');
        });
    }

    function applyTheme(dark) {
        root.classList.toggle('theme-dark', dark);
        const button = document.getElementById('theme-toggle');
        if (button) {
            button.setAttribute('aria-pressed', String(dark));
            button.setAttribute('aria-label', dark ? 'Bật chế độ sáng' : 'Bật chế độ tối');
            document.getElementById('theme-icon').textContent = dark ? '☀' : '☾';
            document.getElementById('theme-label').textContent = dark ? 'Chế độ sáng' : 'Chế độ tối';
        }
        updateCharts(dark);
    }

    // Áp dụng ngay trong <head> để tránh chớp nền sáng khi tải lại trang.
    applyTheme(saved === 'dark');
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(root.classList.contains('theme-dark'));
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const dark = !root.classList.contains('theme-dark');
            applyTheme(dark);
            try { localStorage.setItem(key, dark ? 'dark' : 'light'); } catch { /* Trình duyệt không cho lưu tùy chọn. */ }
        });
    });
})();

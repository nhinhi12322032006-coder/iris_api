// --- TRANG CÂU CHUYỆN: DỮ LIỆU CHI TIẾT LOÀI ---
let speciesData = {};
async function loadSpeciesData() {
    try {
        const response = await fetch("/iris/detail", {
            cache: "no-store"
        });
        if (!response.ok) {
            throw new Error("API /iris/detail lỗi: HTTP " + response.status);
        }
        const data = await response.json();
        console.log("SQL /iris/detail:", data);
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("SQL không trả về dữ liệu Iris.");
        }
        data.forEach(item => {
            const key = String(item.Species_Name).trim().toLowerCase();
            speciesData[key] = {
                title: "Iris " + item.Species_Name,
                img: key + ".jpg",
                petal: item.Petal_Detail || "",
                sepal: item.Sepal_Detail || "",
                // QUAN TRỌNG:
                // Data_Analysis chứa cả thông tin màu sắc
                data: item.Data_Analysis || "",
                physiology: item.Physiological_Feature || "",
                habitat: item.Habitat_Detail || ""
            };
        });
        console.log("speciesData sau khi đọc SQL:", speciesData);
        // Mặc định
        switchSpecies("setosa");
    } catch (error) {
        console.error("Không thể kết nối dữ liệu Iris từ SQL:", error);
    }
}
// --- CHUYỂN LOÀI VÀ CẬP NHẬT THẺ ---
function switchSpecies(key) {
    console.log("Đang chuyển sang:", key);
    const data = speciesData[key];
    if (!data) {
        console.error("Không tìm thấy dữ liệu cho:", key, speciesData);
        return;
    }
    // ==============================
    // TAB
    // ==============================
    document.querySelectorAll(".species-tab").forEach(tab => {
        tab.style.background = "#f8fafc";
        tab.style.color = "#4a5568";
        tab.style.borderColor = "#cbd5e0";
    });
    const activeTab = document.getElementById("tab-" + key);
    if (activeTab) {
        activeTab.style.background = key === "setosa" ? "#e6fffa" : key === "versicolor" ? "#fffaf0" :
            "#f5f3ff";
        activeTab.style.color = key === "setosa" ? "#00796b" : key === "versicolor" ? "#dd6b20" : "#6b46c1";
        activeTab.style.borderColor = key === "setosa" ? "#38b2ac" : key === "versicolor" ? "#f6ad55" :
            "#b794f4";
    }
    // ==============================
    // ẢNH
    // ==============================
    const image = document.getElementById("species-img");
    if (image) {
        image.src = data.img;
    }
    // ==============================
    // TÊN
    // ==============================
    const title = document.getElementById("species-title");
    if (title) {
        title.textContent = data.title;
        title.style.color = key === "setosa" ? "#00796b" : key === "versicolor" ? "#dd6b20" : "#6b46c1";
    }
    // ==============================
    // 5 DỮ LIỆU TỪ SQL
    // ==============================
    const petal = document.getElementById("info-petal");
    if (petal) {
        petal.textContent = data.petal || "Chưa có dữ liệu.";
    }
    const sepal = document.getElementById("info-sepal");
    if (sepal) {
        sepal.textContent = data.sepal || "Chưa có dữ liệu.";
    }
    const analysis = document.getElementById("info-data");
    if (analysis) {
        analysis.textContent = data.data || "Chưa có dữ liệu.";
    }
    const physiology = document.getElementById("info-physiology");
    if (physiology) {
        physiology.textContent = data.physiology || "Chưa có dữ liệu.";
    }
    const habitat = document.getElementById("info-habitat");
    if (habitat) {
        habitat.textContent = data.habitat || "Chưa có dữ liệu.";
    }
}
// ==============================
// KHỞI ĐỘNG
// ==============================
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSpeciesData);
} else {
    loadSpeciesData();
}
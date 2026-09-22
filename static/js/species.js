const speciesData = {
    'setosa': {
        title: "Iris Setosa",
        color: "#00796b",
        img: "setosa.jpg",
        petal: "Rất ngắn và hẹp, kích thước nhỏ nhất trong 3 loài. Có màu tím nhạt hoặc xanh lam đồng điệu với hoa nhưng trơn, không có các vệt màu vàng ở gốc.",
        sepal: "Tương đối rộng, hình bầu dục tròn trịa. Thường có màu xanh tím hoặc tím nhạt, ở gốc đài hoa có một vùng màu vàng sẫm hoặc vàng trắng kèm theo các đường gân đậm màu rất rõ nét.",
        data: "Tạo thành một cụm hoàn toàn tách biệt ở phía trái biểu đồ, dễ phân loại nhất.",
        physiology: "Chịu lạnh cực tốt, thích nghi với mùa đông dài băng giá.",
        habitat: "Vùng khí hậu lạnh giá phía bắc, thích nghi với đất ẩm lạnh.",
        bg: "#e6fffa", border: "#38b2ac"
    },
    'versicolor': {
        title: "Iris Versicolor",
        color: "#dd6b20",
        img: "versicolor.jpg",
        petal: "Kích thước nằm ở mức trung gian giữa setosa và virginica. Có màu sắc pha trộn giữa tím và xanh lam (đồng điệu với màu nền của hoa nhưng trơn, không có đốm vàng/trắng ở gốc).",
        sepal: "Thon dài, cân đối vừa phải. Có màu sắc rực rỡ pha trộn giữa tím, xanh lam và có các đốm vàng/trắng ở phần gốc.",
        data: "Nằm ở vùng trung gian trên biểu đồ, có sự giao thoa nhẹ với các loài khác.",
        physiology: "Sức sống dẻo dai, linh hoạt với sự thay đổi pH của đất.",
        habitat: "Phổ biến ở miền đông Bắc Mỹ, mọc hoang ở đất ẩm ướt, đầm lầy.",
        bg: "#fffaf0", border: "#f6ad55"
    },
    'virginica': {
        title: "Iris Virginica",
        color: "#6b46c1",
        img: "virginica.jpg",
        petal: "Dài và phát triển mạnh mẽ nhất trong 3 loài, có xu hướng hơi ngả nhẹ ra ngoài. Có màu tím/xanh đậm đồng màu với đài hoa, trơn và không có đốm vàng ở gốc, đôi khi có gân tím sẫm chạy dọc thân cánh. ",
        sepal: "Rộng, dài và khỏe khoắn. Mang sắc tím đậm hoặc xanh lam sẫm rực rỡ, ở gốc đài hoa có một đốm màu vàng tươi sáng (đốm mật) nổi bật nhưng các đường gân thường mờ hơn hoặc mịn hơn so với versicolor.",
        data: "Chiếm vị trí ở phía phải biểu đồ với các giá trị thông số cao nhất.",
        physiology: "Ưa sáng mạnh, phát triển nhanh khi có đủ ánh nắng mặt trời.",
        habitat: "Sinh trưởng mạnh tại các vùng ngập nước ven sông suối, đầm lầy.",
        bg: "#f5f3ff", border: "#b794f4"
    }
};

function switchSpecies(key) {
    // Cập nhật giao diện nút Tabs
    document.querySelectorAll('.species-tab').forEach(tab => {
        tab.style.background = "#f8fafc";
        tab.style.color = "#4a5568";
        tab.style.borderColor = "#cbd5e0";
    });
    
    const activeTab = document.getElementById(`tab-${key}`);
    const data = speciesData[key];

    activeTab.style.background = data.bg;
    activeTab.style.color = data.color;
    activeTab.style.borderColor = data.border;

    // Cập nhật nội dung hiển thị
    document.getElementById('species-img').src = data.img;
    document.getElementById('species-title').innerText = data.title;
    document.getElementById('species-title').style.color = data.color;
    document.getElementById('info-petal').innerText = data.petal;
    document.getElementById('info-sepal').innerText = data.sepal;
    document.getElementById('info-data').innerText = data.data;
    document.getElementById('info-physiology').innerText = data.physiology;
    document.getElementById('info-habitat').innerText = data.habitat;
}

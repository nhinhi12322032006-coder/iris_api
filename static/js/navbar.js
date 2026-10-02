// --- DÙNG CHUNG: ẨN / HIỆN NAVBAR KHI CUỘN ---
document.addEventListener("DOMContentLoaded", () => {
    const navbar = document.querySelector(".navbar");
    if (!navbar) return;
    let lastScroll = 0;
    window.addEventListener("scroll", () => {
        let currentScroll = window.scrollY;
        if (currentScroll > lastScroll && currentScroll > 50) {
            navbar.classList.add("nav-hidden");
        } else {
            navbar.classList.remove("nav-hidden");
        }
        lastScroll = currentScroll;
    });
});
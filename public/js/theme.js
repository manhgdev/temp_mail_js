const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle?.querySelector('i');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

function updateThemeButton(theme) {
    if (!themeToggle || !themeIcon) {
        return;
    }

    const isDark = theme === 'dark';
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.setAttribute('aria-pressed', String(isDark));

    themeIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

// Apply theme with smooth transition
function applyTheme(theme, animate = false) {
    if (animate) {
        document.documentElement.style.transition = 'background 0.35s ease, color 0.35s ease';
        setTimeout(() => {
            document.documentElement.style.transition = '';
        }, 400);
    }

    document.documentElement.setAttribute('data-theme', theme);
    updateThemeButton(theme);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.content = theme === 'dark' ? '#0F172A' : '#2563EB';
    }
}

function getResolvedTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

function toggleTheme() {
    const nextTheme = getResolvedTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme, true);
    localStorage.setItem('theme', nextTheme);
}

if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    applyTheme(savedTheme);
} else {
    applyTheme(prefersDarkScheme.matches ? 'dark' : 'light');
}

prefersDarkScheme.addEventListener('change', (event) => {
    if (!localStorage.getItem('theme')) {
        applyTheme(event.matches ? 'dark' : 'light', true);
    }
});

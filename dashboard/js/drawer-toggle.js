/* ═══ Drawer open/close + theme icon sync ═══ */
function openDrawer(){ var d=document.getElementById('zdrawer'),o=document.getElementById('zdrawerOverlay'); if(d)d.classList.add('open'); if(o)o.classList.add('open'); syncDrawerTheme(); }
function closeDrawer(){ var d=document.getElementById('zdrawer'),o=document.getElementById('zdrawerOverlay'); if(d)d.classList.remove('open'); if(o)o.classList.remove('open'); }
function syncDrawerTheme() {
    var ic = document.getElementById('drawerThemeIcon');
    if (ic) {
        var t = (typeof THEME !== 'undefined')
            ? THEME
            : (document.documentElement.getAttribute('data-theme') || 'light');

        ic.textContent = (t === 'dark') ? '🌙' : '☀️';
    }
}
document.addEventListener('DOMContentLoaded', syncDrawerTheme);

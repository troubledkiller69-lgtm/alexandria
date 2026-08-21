export const ui = {
    showToast(message) {
        const existing = document.querySelector('.alexandria-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'alexandria-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
    }
};

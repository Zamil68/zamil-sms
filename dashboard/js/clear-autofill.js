        window.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('input[type="text"]').forEach(input => {
                input.value = '';
                input.setAttribute('autocomplete', 'off');
            });
        });

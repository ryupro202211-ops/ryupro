(() => {
  const button = document.querySelector('.nav-toggle');
  const menu = document.getElementById('primaryNav');
  if (!button || !menu) return;

  const closeMenu = ({ returnFocus = false } = {}) => {
    menu.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) button.focus();
  };

  button.addEventListener('click', () => {
    const isOpen = button.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      closeMenu();
      return;
    }
    menu.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      closeMenu({ returnFocus: true });
    }
  });

  button.hidden = false;
  document.body.classList.add('js-enabled');
})();

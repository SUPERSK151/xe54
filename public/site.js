// XE 54 — navigation, scroll reveal and enquiry forms
document.documentElement.classList.remove('no-js');

const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');
if (toggle) toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
  toggle.textContent = open ? 'CLOSE' : 'MENU';
});

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
}

document.querySelectorAll('form[data-enquiry]').forEach(form => {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = form.querySelector('.form-msg');
    const btn = form.querySelector('button[type="submit"]');
    const data = { type: form.dataset.enquiry };
    new FormData(form).forEach((v, k) => { data[k] = v; });
    form.querySelectorAll('input[type="checkbox"]').forEach(c => { data[c.name] = c.checked; });
    msg.textContent = ''; msg.className = 'form-msg';
    btn.disabled = true;
    try {
      const r = await fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
      const panel = form.closest('.form-panel') || form.parentElement;
      panel.innerHTML = `<div class="form-done" role="status"><div class="ok">✓</div>
        <h3>${form.dataset.done || 'Thank you. Your message has been received.'}</h3>
        <p class="muted">A confirmation has been sent to your email. Reference: <b>${out.reference}</b></p></div>`;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      msg.textContent = err.message; msg.className = 'form-msg err';
      btn.disabled = false;
    }
  });
});

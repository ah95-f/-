(() => {
  const STORAGE_KEY = 'sobi-meomchwo-items-v1';
  const WAIT_MS = 24 * 60 * 60 * 1000;
  const screens = {
    home: document.querySelector('#home-screen'),
    form: document.querySelector('#form-screen'),
    decision: document.querySelector('#decision-screen'),
  };
  const list = document.querySelector('#item-list');
  const empty = document.querySelector('#empty-state');
  const totalEl = document.querySelector('#saved-total');
  const countEl = document.querySelector('#item-count');
  const form = document.querySelector('#item-form');
  const toast = document.querySelector('#toast');
  let activeItemId = null;
  let ticker = null;
  let toastTimer = null;

  function readItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data.filter((item) => item && typeof item.id === 'string' && Number.isFinite(item.price) && Number.isFinite(item.createdAt)) : [];
    } catch {
      return [];
    }
  }
  function saveItems(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); return true; }
    catch { return false; }
  }
  function getStatus(item, now = Date.now()) {
    if (item.status === 'bought' || item.status === 'skipped') return item.status;
    return now >= item.createdAt + WAIT_MS ? 'ready' : 'pending';
  }
  function won(value) { return `${Number(value).toLocaleString('ko-KR')}원`; }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function remainingLabel(item, now = Date.now()) {
    const ms = Math.max(0, item.createdAt + WAIT_MS - now);
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${hours}시간 ${mins}분 ${secs}초 남음`;
  }
  function badge(status) {
    const labels = { pending: '보류 중', ready: '결정 가능', bought: '구매함', skipped: '구매 안 함' };
    return `<span class="status-badge status-${status}">${labels[status]}</span>`;
  }
  function renderItems() {
    const items = readItems();
    const now = Date.now();
    list.innerHTML = '';
    countEl.textContent = items.length;
    const savedTotal = items.reduce((sum, item) => getStatus(item, now) === 'skipped' ? sum + item.price : sum, 0);
    totalEl.innerHTML = `${savedTotal.toLocaleString('ko-KR')}<span>원</span>`;
    empty.hidden = items.length > 0;
    list.hidden = items.length === 0;
    for (const item of [...items].sort((a, b) => b.createdAt - a.createdAt)) {
      const status = getStatus(item, now);
      const card = document.createElement('article');
      card.className = 'item-card';
      card.innerHTML = `<div class="item-main"><div class="item-title-row"><span class="item-name">${escapeHtml(item.name)}</span>${badge(status)}</div><p class="item-price">${won(item.price)}</p>${item.reason ? `<p class="item-reason">${escapeHtml(item.reason)}</p>` : ''}${status === 'pending' ? `<span class="countdown"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.5V8l2.2 1.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>${remainingLabel(item, now)}</span>` : ''}</div>${status === 'ready' ? `<div class="item-actions"><button class="mini-button" type="button" data-decision="${item.id}" data-status="bought">구매함</button><button class="mini-button accept" type="button" data-decision="${item.id}" data-status="skipped">구매 안 함</button></div>` : ''}`;
      list.append(card);
    }
  }
  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    if (ticker) clearInterval(ticker);
    ticker = name === 'home' ? setInterval(renderItems, 1000) : null;
    if (name === 'home') renderItems();
    document.querySelector('#app').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }
  function clearErrors() {
    document.querySelectorAll('.field').forEach((field) => field.classList.remove('invalid'));
    document.querySelectorAll('.error').forEach((el) => { el.textContent = ''; });
    document.querySelector('#storage-error').hidden = true;
  }
  function setError(input, message) {
    const field = input.closest('.field');
    field.classList.add('invalid');
    field.querySelector('.error').textContent = message;
    field.querySelector('.field-meta span:first-child').textContent = '입력 내용을 확인해주세요.';
  }
  function validate(name, rawPrice, reason) {
    clearErrors();
    const nameInput = document.querySelector('#item-name');
    const priceInput = document.querySelector('#item-price');
    const reasonInput = document.querySelector('#item-reason');
    let valid = true;
    if (!name.trim()) { setError(nameInput, '물건 이름을 입력해주세요.'); valid = false; }
    else if (name.trim().length > 40) { setError(nameInput, '물건 이름은 40자 이하로 입력해주세요.'); valid = false; }
    const cleanedPrice = rawPrice.replace(/[ ,원]/g, '');
    const price = /^\d+$/.test(cleanedPrice) ? Number(cleanedPrice) : NaN;
    if (!cleanedPrice || !Number.isSafeInteger(price) || price < 1) { setError(priceInput, '가격은 1원 이상의 숫자로 입력해주세요.'); valid = false; }
    else if (price > 10000000) { setError(priceInput, '가격은 1,000만 원 이하로 입력해주세요.'); valid = false; }
    if (reason.length > 100) { setError(reasonInput, '구매 이유는 100자 이하로 입력해주세요.'); valid = false; }
    return { valid, price };
  }
  function openDecision(id, preferredAction = '') {
    const item = readItems().find((entry) => entry.id === id);
    if (!item) { showScreen('home'); return; }
    activeItemId = id;
    const status = getStatus(item);
    const card = document.querySelector('#decision-card');
    card.innerHTML = `<div class="item-title-row"><span class="item-name">${escapeHtml(item.name)}</span>${badge(status)}</div><p class="item-price">${won(item.price)}</p>${item.reason ? `<p class="item-reason">${escapeHtml(item.reason)}</p>` : ''}`;
    const warning = document.querySelector('#decision-warning');
    const actions = document.querySelector('#decision-actions');
    const result = document.querySelector('#decision-result');
    const title = document.querySelector('#decision-title');
    const subtitle = document.querySelector('#decision-subtitle');
    result.hidden = true; warning.hidden = true;
    actions.hidden = status !== 'ready';
    if (status === 'pending') {
      title.innerHTML = '아직 조금 더 기다려요<span class="green-dot">.</span>';
      subtitle.textContent = '충분히 생각할 시간이 남아 있어요.';
      warning.hidden = false;
      warning.textContent = `아직 구매를 결정할 수 없어요. ${remainingLabel(item)}.`;
    } else if (status === 'bought' || status === 'skipped') {
      title.innerHTML = '결정을 기록했어요<span class="green-dot">.</span>';
      subtitle.textContent = '다시 선택하고 싶다면 목록에서 확인할 수 있어요.';
      result.hidden = false;
      result.innerHTML = `<strong>${status === 'bought' ? '구매함' : '구매 안 함'}</strong>${status === 'skipped' ? `${won(item.price)}을 구매하지 않기로 했어요. 합계에 반영했어요.` : '구매하지 않은 금액 합계에는 더하지 않았어요.'}`;
    } else {
      title.innerHTML = '24시간이 지났어요<span class="green-dot">.</span>';
      subtitle.textContent = '지금도 구매하고 싶나요?';
    }
    showScreen('decision');
    if (status === 'ready' && preferredAction) commitDecision(id, preferredAction);
  }
  function commitDecision(id, status) {
    const items = readItems();
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    if (Date.now() < item.createdAt + WAIT_MS) {
      openDecision(id);
      return;
    }
    if (item.status === 'bought' || item.status === 'skipped') { openDecision(id); return; }
    item.status = status;
    item.decidedAt = Date.now();
    if (!saveItems(items)) {
      document.querySelector('#storage-error').hidden = false;
      return;
    }
    renderItems();
    openDecision(id);
    showToast(status === 'bought' ? '구매함으로 기록했어요.' : '구매하지 않기로 했어요.');
  }

  document.querySelectorAll('[data-go-home]').forEach((button) => button.addEventListener('click', () => showScreen('home')));
  document.querySelectorAll('[data-open-form]').forEach((button) => button.addEventListener('click', () => { form.reset(); clearErrors(); updateCounters(); showScreen('form'); document.querySelector('#item-name').focus(); }));
  document.querySelector('#add-item-top').addEventListener('click', () => { form.reset(); clearErrors(); updateCounters(); showScreen('form'); document.querySelector('#item-name').focus(); });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-decision]');
    if (!button) return;
    const card = button.closest('.item-card');
    openDecision(button.dataset.decision, button.dataset.status);
  });
  document.querySelector('#buy-button').addEventListener('click', () => commitDecision(activeItemId, 'bought'));
  document.querySelector('#skip-button').addEventListener('click', () => commitDecision(activeItemId, 'skipped'));
  function updateCounters() {
    document.querySelector('#name-count').textContent = `${document.querySelector('#item-name').value.length} / 40`;
    document.querySelector('#reason-count').textContent = `${document.querySelector('#item-reason').value.length} / 100`;
  }
  document.querySelector('#item-name').addEventListener('input', updateCounters);
  document.querySelector('#item-reason').addEventListener('input', updateCounters);
  document.querySelector('#item-price').addEventListener('input', (event) => {
    const input = event.target;
    const digits = input.value.replace(/\D/g, '').slice(0, 8);
    input.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.querySelector('#item-name').value;
    const rawPrice = document.querySelector('#item-price').value;
    const reason = document.querySelector('#item-reason').value;
    const { valid, price } = validate(name, rawPrice, reason);
    if (!valid) { document.querySelector('.field.invalid input, .field.invalid textarea').focus(); return; }
    const items = readItems();
    items.push({ id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), name: name.trim(), price, reason: reason.trim(), createdAt: Date.now(), status: 'pending' });
    if (!saveItems(items)) { document.querySelector('#storage-error').hidden = false; return; }
    form.reset(); updateCounters(); showScreen('home'); showToast('24시간 보류를 시작했어요!');
  });
  renderItems();
  ticker = setInterval(renderItems, 1000);
  function updateCounters() {
    const name = document.querySelector('#item-name');
    const reason = document.querySelector('#item-reason');
    document.querySelector('#name-count').textContent = `${name.value.length} / 40`;
    document.querySelector('#reason-count').textContent = `${reason.value.length} / 100`;
  }
})();

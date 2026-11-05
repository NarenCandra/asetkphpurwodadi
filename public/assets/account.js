'use strict';
/* Akun penyewa, pengajuan, berkas, perpanjangan, dan halaman admin tambahan.
   Memakai helper global dari app.js ($, esc, api, shell, adminShell, navigate, toast, empty, field, textarea). */
const APP_STATUS = {diproses:'Diproses', terjadwal:'Survei terjadwal', selesai:'Selesai', perlu_perbaikan:'Perlu perbaikan', disetujui:'Disetujui', ditolak:'Ditolak', dibatalkan:'Dibatalkan'};
const APP_KIND = {survei:'Pengajuan Survei', sewa_baru:'Permohonan Sewa Baru', perpanjangan:'Perpanjangan Sewa'};
const PAYMENT = {belum:'Pembayaran belum dikonfirmasi', dp:'DP dikonfirmasi', lunas:'Pelunasan dikonfirmasi'};
const DOC_STATUS = {menunggu:'Menunggu verifikasi', terverifikasi:'Terverifikasi', diterima:'Diterima', perlu_perbaikan:'Perlu perbaikan', tersedia:'Tersedia'};
const TONE = {disetujui:'', terverifikasi:'', diterima:'', tersedia:'', lunas:'', dp:'reserved', menunggu:'attention', diproses:'attention', terjadwal:'attention', selesai:'', perlu_perbaikan:'overdue', ditolak:'draft', dibatalkan:'draft', belum:'draft'};
const chip = (text, key) => `<span class="badge ${TONE[key] ?? ''}">${esc(text)}</span>`;
const dateId = value => value ? new Date(value + (value.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : '-';

function waLink(message) {
  const number = state.config?.whatsapp;
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}
function readFile(input, limit = 5 * 1024 * 1024) {
  if (window.SEWARUMA_NETLIFY) limit = Math.min(limit, 3 * 1048576);
  return new Promise((resolve, reject) => {
    const file = input?.files?.[0];
    if (!file) return reject(new Error('Pilih berkas terlebih dahulu.'));
    if (file.size > limit) return reject(new Error(`Ukuran berkas maksimal ${Math.round(limit / 1048576)} MB.`));
    const reader = new FileReader();
    reader.onload = () => resolve({name: file.name, data: String(reader.result).split(',')[1]});
    reader.onerror = () => reject(new Error('Berkas tidak dapat dibaca.'));
    reader.readAsDataURL(file);
  });
}
function askConfirm(title, text, yes = 'Ya, lanjutkan') {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal confirm-modal';
  dialog.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="admin-actions"><button class="btn secondary" data-no>Batal</button><button class="btn" data-yes>${esc(yes)}</button></div>`;
  document.body.append(dialog);
  return new Promise(resolve => {
    let result = false;
    dialog.querySelector('[data-no]').onclick = () => dialog.close();
    dialog.querySelector('[data-yes]').onclick = () => { result = true; dialog.close(); };
    dialog.onclose = () => { dialog.remove(); resolve(result); };
    dialog.showModal();
  });
}
function guard(button, work) {
  return async event => {
    event?.preventDefault?.();
    if (button.disabled) return;
    button.disabled = true;
    try { await work(); } catch (error) { toast(error.message); }
    finally { if (button.isConnected) button.disabled = false; }
  };
}

const Account = {
  async route(path, id) {
    if (['/masuk', '/daftar'].includes(path)) { if (!window.SEWARUMA_STATIC_DEMO) { Account.authPage(path === '/daftar'); return true; } return false; }
    if (path === '/akun' || path.startsWith('/akun/')) {
      if (window.SEWARUMA_STATIC_DEMO) return false;
      if (!state.user?.authenticated) { navigate('/masuk?next=' + encodeURIComponent(path)); return true; }
      if (path === '/akun') { navigate('/akun/pengajuan'); return true; }
      const tab = path.match(/^\/akun\/(pengajuan|sewa|profil)$/);
      if (tab) { const data = await Account.load(); if (id === navigationId) Account['page_' + tab[1]](data); return true; }
      const match = path.match(/^\/akun\/pengajuan\/([a-f0-9]+)$/);
      if (match) { const application = await api('/api/my/applications/' + match[1]); if (id === navigationId) Account.applicationPage(application); return true; }
      return false;
    }
    if (/^\/admin\/(pengajuan|impor|penyewa)/.test(path)) {
      if (window.SEWARUMA_STATIC_DEMO) return false;
      state.session = await api('/api/session');
      if (id !== navigationId) return true;
      if (!state.session.authenticated) { login(); return true; }
      if (path === '/admin/impor') { Account.importPage(); return true; }
      if (path === '/admin/pengajuan') { Account.adminList(); return true; }
      if (path === '/admin/penyewa') { Account.tenantList(); return true; }
      const tenantMatch = path.match(/^\/admin\/penyewa\/([a-f0-9]+)$/);
      if (tenantMatch) { const tenant = await api('/api/admin/tenants/' + tenantMatch[1]); if (id === navigationId) Account.tenantDetail(tenant); return true; }
      const match = path.match(/^\/admin\/pengajuan\/([a-f0-9]+)$/);
      if (match) { const application = await api('/api/admin/applications/' + match[1]); if (id === navigationId) Account.adminDetail(application); return true; }
    }
    return false;
  },

  async load() {
    const [applications, ktp, leases] = await Promise.all([api('/api/my/applications'), api('/api/my/ktp'), api('/api/my/leases')]);
    return {applications, ktp, leases};
  },

  // ---------------------------------------------------------- daftar / masuk
  authPage(register) {
    const next = new URLSearchParams(location.search).get('next') || '/akun/pengajuan';
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/akun/pengajuan';
    const query = safeNext === '/akun/pengajuan' ? '' : '?next=' + encodeURIComponent(safeNext);
    shell(`<div class="container tenant-auth"><div class="tenant-auth-layout"><section class="tenant-auth-intro"><img src="/assets/perhutani-forest-logo.png" alt="" width="86" height="86"><h1>${register ? 'Mulai dari akun Anda.' : 'Selamat datang kembali.'}</h1><p>Kelola pengajuan dan dokumen sewa dalam satu tempat.</p><ul><li>Ajukan survei tanpa mengunggah KTP.</li><li>Lengkapi berkas saat mengajukan sewa.</li><li>Pantau masa sewa dan riwayat perpanjangan.</li></ul><p class="tenant-auth-note">Jadwal survei dan kesepakatan sewa tetap dibahas bersama pengelola melalui WhatsApp.</p></section><section class="tenant-auth-form"><h2>${register ? 'Daftar penyewa' : 'Masuk penyewa'}</h2><p>${register ? 'KTP tidak diperlukan saat membuat akun.' : 'Katalog tetap bisa dijelajahi tanpa akun.'}</p><form id="auth-form" novalidate><p class="error" id="auth-error" role="alert" hidden></p><fieldset>${register ? '<div class="field"><label for="name">Nama lengkap</label><input id="name" autocomplete="name" placeholder="Nama sesuai identitas" required></div><div class="field"><label for="whatsapp">Nomor WhatsApp</label><input id="whatsapp" type="tel" inputmode="tel" autocomplete="tel" placeholder="0812xxxxxxxx" required></div>' : ''}<div class="field"><label for="email">Identitas login (email)</label><input id="email" type="email" autocomplete="email" placeholder="nama@email.com" required></div><div class="field"><label for="password">Kata sandi${register ? ' (minimal 8 karakter)' : ''}</label><input id="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required></div><button class="btn" type="submit">${register ? 'Buat akun' : 'Masuk'}</button></fieldset></form><p class="tenant-auth-switch">${register ? 'Sudah memiliki akun?' : 'Belum memiliki akun?'} <a href="/${register ? 'masuk' : 'daftar'}${query}">${register ? 'Masuk' : 'Daftar penyewa'}</a></p>${query ? `<a class="muted small" href="${esc(safeNext)}">Kembali ke detail aset</a>` : ''}</section></div></div>`, register ? 'Daftar Penyewa' : 'Masuk Penyewa');
    $('#auth-form').onsubmit = async event => {
      event.preventDefault();
      const button = $('button[type=submit]', event.target), error = $('#auth-error');
      button.disabled = true; error.hidden = true;
      const body = {email: $('#email').value, password: $('#password').value};
      if (register) Object.assign(body, {name: $('#name').value, whatsapp: $('#whatsapp').value});
      try {
        state.user = await api(register ? '/api/register' : '/api/user/login', {method: 'POST', body: JSON.stringify(body)});
        navigate(safeNext);
      } catch (failure) { error.textContent = failure.message; error.hidden = false; button.disabled = false; }
    };
  },
  async logout() {
    try { await api('/api/user/logout', {method: 'POST', body: '{}'}); } catch { /* sesi sudah berakhir */ }
    state.user = {authenticated: false};
    navigate('/');
  },

  // ---------------------------------------------------------------- area akun
  accountShell(active, data, body, title) {
    const links = [['profil', 'Profil & Dokumen'], ['pengajuan', 'Pengajuan Saya'], ['sewa', 'Sewa Saya']];
    shell(`<div class="container tenant-page"><div class="tenant-layout"><aside class="tenant-sidebar"><p>Area penyewa</p><nav aria-label="Navigasi akun">${links.map(([key, label]) => `<a href="/akun/${key}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><a class="tenant-catalog-link" href="/rumah">Kembali ke katalog</a><button type="button" class="text-button tenant-demo-logout" id="user-logout">Keluar</button></aside><section class="tenant-content"><div class="page-head"><h1>${esc(title)}</h1></div>${body}</section></div></div>`, title);
    $('#user-logout').onclick = () => Account.logout();
  },
  stepper(a) {
    const labels = a.kind === 'survei' ? ['Diajukan', 'Jadwal survei', 'Survei selesai'] : ['Lengkapi berkas', 'Verifikasi pengelola', 'Pembayaran', 'Sewa aktif'];
    const allDone = a.applied || (a.kind === 'survei' && a.status === 'selesai');
    return `<ol class="stepper${a.step === 0 ? ' closed' : ''}" aria-label="Tahapan pengajuan">${labels.map((label, i) => {
      const n = i + 1, mode = allDone || (a.step > 0 && n < a.step) ? 'done' : n === a.step ? 'current' : '';
      return `<li class="${mode}"${mode === 'current' ? ' aria-current="step"' : ''}><span class="step-dot">${mode === 'done' ? '✓' : n}</span><span class="step-label">${label}</span></li>`;
    }).join('')}</ol>`;
  },
  page_pengajuan(data) {
    const filters = [['', 'Semua'], ['survei', 'Survei'], ['sewa_baru', 'Baru sewa'], ['perpanjangan', 'Perpanjangan']];
    const card = a => `<article class="tenant-panel app-card"><div class="app-card-head"><div><h2>${esc(APP_KIND[a.kind])}</h2><p class="small">${esc(a.house?.name)} (${esc(a.house?.code)}) · ${esc(a.ref)}</p></div><div>${chip(APP_STATUS[a.status], a.status)}${a.kind === 'survei' ? '' : ' ' + chip(PAYMENT[a.payment], a.payment)}</div></div>${Account.stepper(a)}<p class="next-action"><strong>Langkah berikutnya:</strong> ${esc(a.next)}</p><a class="btn small" href="/akun/pengajuan/${a.id}">Buka Pengajuan</a></article>`;
    Account.accountShell('pengajuan', data, `<div class="tenant-tabs" role="group" aria-label="Jenis pengajuan">${filters.map(([key, label], i) => `<button type="button" class="${i === 0 ? 'is-selected' : ''}" data-kind="${key}">${label}</button>`).join('')}</div><div id="app-list"></div><div class="tenant-help"><h3>Dokumen mengikuti tahap pengajuan</h3><p>Survei tidak memerlukan KTP. Permohonan baru sewa membutuhkan KTP dan surat permohonan. Perpanjangan menggunakan surat yang berbeda dan dapat memakai kembali KTP terverifikasi.</p></div>`, 'Pengajuan Saya');
    const draw = kind => {
      const rows = data.applications.filter(a => !kind || a.kind === kind);
      $('#app-list').innerHTML = rows.length ? rows.map(card).join('') : `<div class="tenant-panel preview-empty"><div class="empty-symbol" aria-hidden="true">${glyph('location')}</div><h2>Belum ada pengajuan${kind ? ' ' + filters.find(f => f[0] === kind)[1].toLowerCase() : ''}</h2><p>Pilih aset di katalog lalu ajukan survei. Nomor referensi serta tindakan berikutnya akan terlihat di sini.</p><a class="btn" href="/rumah">Jelajahi Aset</a></div>`;
      $$('.tenant-tabs button').forEach(button => button.classList.toggle('is-selected', button.dataset.kind === kind));
    };
    $$('.tenant-tabs button').forEach(button => button.onclick = () => draw(button.dataset.kind));
    draw('');
  },
  page_sewa(data) {
    const leases = data.leases.length ? data.leases.map(l => `<article class="tenant-panel app-card"><div><h2>${esc(l.house.name)} (${esc(l.house.code)})</h2><p>Periode aktif: <strong>${dateId(l.current.start)} – ${dateId(l.current.end)}</strong> (${l.current.period === 'monthly' ? 'bulanan' : 'tahunan'})</p></div>${l.periods.length > 1 ? `<details><summary class="small">Riwayat periode (${l.periods.length})</summary><ul>${l.periods.map(p => `<li>${dateId(p.start)} – ${dateId(p.end)}</li>`).join('')}</ul></details>` : ''}</article>`).join('') : '<div class="tenant-panel preview-empty"><h2>Belum ada sewa aktif</h2><p>Aset, tanggal sewa, dan riwayat periode akan terlihat setelah pengajuan disetujui serta pelunasan dikonfirmasi admin.</p><a class="btn" href="/rumah">Jelajahi Aset</a></div>';
    const row = (extra, action) => `<div class="document-item"><div class="document-symbol" aria-hidden="true">↻</div><div><h3>Surat Permohonan Perpanjangan Sewa</h3><p>${extra}Pengelola menyiapkan surat. Anda mengunduh, menandatangani di luar website, lalu mengunggah hasilnya.</p></div>${action}</div>`;
    const renew = data.leases.length ? data.leases.map(l => row(`${esc(l.house.name)}. `, l.open_renewal ? '<span class="document-status">Perpanjangan diproses</span>' : `<button class="btn secondary small" data-renew="${esc(l.id)}">Ajukan Perpanjangan</button>`)).join('') : row('', '<button class="btn secondary small" disabled>Ajukan Perpanjangan</button>');
    Account.accountShell('sewa', data, `${leases}<div class="tenant-panel"><h2>Perpanjangan sewa</h2><p>Perpanjangan diajukan dari sewa yang tercatat. Periode baru dan surat perpanjangan disimpan terpisah agar riwayat sebelumnya tetap tersedia.</p>${renew}</div>`, 'Sewa Saya');
    $$('[data-renew]').forEach(button => button.onclick = guard(button, async () => {
      if (!await askConfirm('Ajukan perpanjangan?', 'Surat permohonan perpanjangan disiapkan pengelola. Anda mengunduh, menandatangani di luar website, lalu mengunggah hasilnya. KTP terverifikasi dipakai kembali.')) return;
      const created = await api(`/api/my/leases/${button.dataset.renew}/renew`, {method: 'POST', body: '{}'});
      navigate('/akun/pengajuan/' + created.id);
    }));
  },
  page_profil(data) {
    const user = state.user.user, latest = data.ktp.latest;
    Account.accountShell('profil', data, `<div class="tenant-panel"><div class="panel-heading"><div><h2>Profil penyewa</h2><p>Identitas dan nomor WhatsApp untuk berkomunikasi dengan pengelola.</p></div></div><form id="profile-form" class="form-grid"><div class="field"><label for="p-name">Nama lengkap</label><input id="p-name" value="${esc(user.name)}" autocomplete="name" required></div><div class="field"><label for="p-wa">Nomor WhatsApp</label><input id="p-wa" type="tel" value="${esc('0' + user.whatsapp.replace(/^62/, ''))}" autocomplete="tel" required></div><div class="field"><label for="p-email">Email (identitas login)</label><input id="p-email" value="${esc(user.email)}" readonly></div><div class="field full"><button class="btn small" type="submit">Simpan Profil</button></div></form></div><div class="tenant-panel" id="dokumen"><div class="panel-heading"><div><h2>Dokumen identitas</h2><p>KTP hanya diperlukan saat mengajukan sewa.</p></div><span class="document-status">${latest ? esc(DOC_STATUS[latest.status]) : 'Belum Diunggah'}</span></div><div class="document-item"><div class="document-symbol" aria-hidden="true">ID</div><div><h3>Kartu Tanda Penduduk</h3><p>${latest ? `Versi ${latest.version} diunggah ${dateId(latest.created)}. ` : ''}KTP terverifikasi dapat digunakan kembali untuk perpanjangan selama data masih sesuai.</p>${latest?.reason ? `<div class="notice"><strong>Perlu perbaikan:</strong> ${esc(latest.reason)}</div>` : ''}${latest ? `<p><a class="small" href="${esc(latest.url)}" download>Unduh berkas saya</a></p>` : ''}</div><div><input id="ktp-file" type="file" accept="application/pdf,image/jpeg,image/png" hidden><button class="btn secondary small" type="button" id="ktp-btn">${latest ? 'Ganti KTP' : 'Unggah KTP'}</button></div></div><p class="document-privacy">Dokumen hanya dapat diakses pemilik akun dan admin. Format PDF, JPG, atau PNG, maksimal ${window.SEWARUMA_NETLIFY?3:5} MB; setiap unggahan disimpan sebagai versi baru.</p></div>`, 'Profil & Dokumen Saya');
    const profile = $('#profile-form');
    profile.onsubmit = guard($('button', profile), async () => {
      state.user = await api('/api/my/profile', {method: 'PUT', body: JSON.stringify({name: $('#p-name').value, whatsapp: $('#p-wa').value})});
      toast('Profil tersimpan.');
      Account.page_profil(await Account.load());
    });
    const pick = $('#ktp-file'), btn = $('#ktp-btn');
    btn.onclick = () => pick.click();
    pick.onchange = guard(btn, async () => {
      const file = await readFile(pick);
      await api('/api/my/ktp', {method: 'POST', body: JSON.stringify(file)});
      toast('KTP terunggah dan menunggu verifikasi pengelola.');
      Account.page_profil(await Account.load());
    });
  },

  // ------------------------------------------------------------ detail pengajuan
  applicationPage(a) {
    const form = a.kind !== 'survei';
    const ktp = a.ktp, letters = a.documents.filter(d => d.kind === 'surat_siap_ttd'), signed = a.documents.filter(d => d.kind === 'surat_ttd');
    const newest = signed[signed.length - 1], template = letters[letters.length - 1];
    const house = a.house || {};
    const name = state.user.user.name;
    const survey = `Halo, saya ${name}, ingin menjadwalkan survei ${house.name} (${house.code}). Nomor pengajuan saya ${a.ref}. Tautan aset: ${location.origin}/rumah/${house.id}. Mohon informasi jadwal yang tersedia.`;
    const payMsg = `Halo, saya ${name}. Terkait ${APP_KIND[a.kind]} ${a.ref} untuk ${house.name} (${house.code}), mohon informasi pembayaran.`;
    const chat = waLink(form ? payMsg : survey);
    const open = !a.closed && a.payment === 'belum' && !a.applied;
    const steps = !form ? `<section class="tenant-panel"><h2>Langkah berikutnya</h2><ol><li>Hubungi pengelola melalui WhatsApp dengan nomor referensi <strong>${esc(a.ref)}</strong> untuk menyepakati jadwal survei.</li><li>Setelah survei dan ada kesepakatan, ajukan kerja sama dari detail aset.</li></ol><p class="small muted">Membuka WhatsApp belum berarti jadwal disetujui. Pengelola mencatat jadwal pada pengajuan ini.</p>${chat && open ? `<a class="btn" href="${esc(chat)}" target="_blank" rel="noopener noreferrer">Lanjut ke WhatsApp</a>` : ''}${!a.closed && house.status === 'Tersedia' ? '<button class="btn secondary" id="continue-btn">Lanjut ke Permohonan Sewa</button><p class="small muted">Gunakan setelah survei dan ada kesepakatan. Ketersediaan aset diperiksa ulang.</p>' : ''}</section>`
      : `<section class="tenant-panel"><h2>Kelengkapan berkas</h2><ol class="steps"><li><strong>KTP</strong> ${ktp ? chip(DOC_STATUS[ktp.status], ktp.status) : chip('Belum diunggah', 'perlu_perbaikan')}${ktp?.reason ? `<div class="notice">Perlu perbaikan: ${esc(ktp.reason)}</div>` : ''}<p class="small muted">${ktp?.status === 'terverifikasi' ? 'KTP terverifikasi dipakai kembali, tidak perlu unggah ulang.' : 'Kelola KTP di '}${ktp?.status === 'terverifikasi' ? '' : '<a href="/akun/profil">Profil & Dokumen</a>.'}</p></li><li><strong>Surat siap tanda tangan</strong> ${template ? `<a href="${esc(template.url)}" download>Unduh surat</a>` : '<span class="muted">Menunggu pengelola menyiapkan surat.</span>'}<p class="small muted">Cetak, tanda tangani di luar website, lalu foto atau pindai dan unggah hasilnya.</p></li><li><strong>Surat bertanda tangan</strong> ${newest ? chip(DOC_STATUS[newest.status], newest.status) : chip('Belum diunggah', 'perlu_perbaikan')}${newest?.reason ? `<div class="notice">Perlu perbaikan: ${esc(newest.reason)}</div>` : ''}${signed.length ? `<ul>${signed.map(d => `<li>Versi ${d.version} · ${dateId(d.created)} · ${esc(DOC_STATUS[d.status])}</li>`).join('')}</ul>` : ''}${template && !a.closed ? `<form id="sign-form" class="form-grid"><div class="field full"><label for="sign-file">${newest ? 'Unggah ulang surat bertanda tangan' : 'Unggah surat bertanda tangan'}</label><input id="sign-file" type="file" accept="application/pdf,image/jpeg,image/png" required></div><div class="field full"><button class="btn small" type="submit">Unggah</button></div></form>` : ''}</li><li><strong>Keputusan pengelola</strong> ${chip(APP_STATUS[a.status], a.status)}${a.admin_note ? `<p>${esc(a.admin_note)}</p>` : ''}</li><li><strong>Pembayaran</strong> ${chip(PAYMENT[a.payment], a.payment)}<p class="small muted">Pembayaran dilakukan melalui WhatsApp setelah pengajuan disetujui. Status dikonfirmasi manual oleh pengelola.</p>${a.status === 'disetujui' && chat && !a.applied ? `<a class="btn small" href="${esc(chat)}" target="_blank" rel="noopener noreferrer">Lanjut ke WhatsApp</a>` : ''}</li></ol>${a.applied ? '<div class="notice">Pengajuan ini sudah aktif dan tercatat pada <a href="/akun/sewa">Sewa Saya</a>.</div>' : ''}</section>`;
    Account.accountShell('pengajuan', null, `<a class="breadcrumb" href="/akun/pengajuan">Kembali ke pengajuan saya</a><div class="tenant-panel"><div class="panel-heading"><div><h2>${esc(a.ref)}</h2><p>Aset: <a href="/rumah/${esc(house.id)}">${esc(house.name)} (${esc(house.code)})</a></p></div><div>${chip(APP_STATUS[a.status], a.status)}${form ? ' ' + chip(PAYMENT[a.payment], a.payment) : ''}</div></div>${Account.stepper(a)}<p class="next-action"><strong>Langkah berikutnya:</strong> ${esc(a.next)}</p></div>${steps}${open && a.status !== 'disetujui' ? '<button class="btn secondary small" id="cancel-app">Batalkan Pengajuan</button>' : ''}`, APP_KIND[a.kind]);
    const refresh = async () => Account.applicationPage(await api('/api/my/applications/' + a.id));
    const sign = $('#sign-form');
    if (sign) sign.onsubmit = guard($('button', sign), async () => {
      const file = await readFile($('#sign-file'));
      await api(`/api/my/applications/${a.id}/documents`, {method: 'POST', body: JSON.stringify(file)});
      toast('Surat terunggah dan menunggu pemeriksaan pengelola.');
      await refresh();
    });
    const cont = $('#continue-btn');
    if (cont) cont.onclick = guard(cont, async () => {
      const created = await api('/api/my/applications', {method: 'POST', body: JSON.stringify({kind: 'sewa_baru', house_id: house.id})});
      toast(created.existing ? 'Membuka permohonan sewa Anda.' : 'Permohonan sewa dibuat. Lengkapi berkas Anda.');
      navigate('/akun/pengajuan/' + created.id);
    });
    const cancel = $('#cancel-app');
    if (cancel) cancel.onclick = guard(cancel, async () => {
      if (!await askConfirm('Batalkan pengajuan?', 'Pengajuan ditutup. Anda dapat membuat pengajuan baru nanti.', 'Ya, batalkan')) return;
      await api(`/api/my/applications/${a.id}/cancel`, {method: 'POST', body: '{}'});
      await refresh();
    });
  },

  // -------------------------------------------------- tombol di detail aset
  async requireLogin() {
    if (state.user?.authenticated) return true;
    toast('Silakan masuk atau daftar terlebih dahulu.');
    navigate('/masuk?next=' + encodeURIComponent(location.pathname));
    return false;
  },
  async startSurvey(house) {
    if (!await Account.requireLogin()) return;
    if (!await askConfirm('Ajukan survei?', `Pengajuan survei untuk ${house.name} akan dicatat di akun Anda, lalu Anda melanjutkan ke WhatsApp untuk menyepakati jadwal.`, 'Ajukan Survei')) return;
    const a = await api('/api/my/applications', {method: 'POST', body: JSON.stringify({kind: 'survei', house_id: house.id})});
    const message = `Halo, saya ${state.user.user.name}, ingin menjadwalkan survei ${house.name} (${house.code}). Nomor pengajuan saya ${a.ref}. Tautan aset: ${location.origin}/rumah/${house.id}. Mohon informasi jadwal yang tersedia.`;
    const link = waLink(message);
    const dialog = document.createElement('dialog');
    dialog.className = 'modal confirm-modal';
    dialog.innerHTML = `<h2>Pengajuan tersimpan</h2><p>Nomor referensi Anda: <strong>${esc(a.ref)}</strong>${a.existing ? ' (pengajuan survei aktif Anda untuk aset ini)' : ''}.</p><p class="small muted">Jadwal baru berlaku setelah dikonfirmasi pengelola melalui WhatsApp.</p><div class="admin-actions">${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Lanjut ke WhatsApp</a>` : '<span class="muted">Nomor WhatsApp pengelola belum dikonfigurasi.</span>'}<a class="btn secondary" href="/akun/pengajuan/${a.id}">Lihat Pengajuan</a><button class="btn secondary" data-close>Tutup</button></div>`;
    document.body.append(dialog);
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.onclose = () => dialog.remove();
    dialog.addEventListener('click', event => { if (event.target.closest('a[href^="/akun"]')) dialog.close(); });
    dialog.showModal();
  },
  async startCooperation(house) {
    if (!await Account.requireLogin()) return;
    const a = await api('/api/my/applications', {method: 'POST', body: JSON.stringify({kind: 'sewa_baru', house_id: house.id})});
    toast(a.existing ? 'Membuka pengajuan kerja sama Anda.' : 'Pengajuan kerja sama dibuat. Lengkapi berkas Anda.');
    navigate('/akun/pengajuan/' + a.id);
  },

  // ------------------------------------------------------------------- admin
  adminList() {
    const params = new URLSearchParams(location.search);
    const kinds = Object.entries(APP_KIND).map(([k, v]) => `<option value="${k}"${params.get('kind') === k ? ' selected' : ''}>${v}</option>`).join('');
    const statuses = Object.entries(APP_STATUS).map(([k, v]) => `<option value="${k}"${params.get('status') === k ? ' selected' : ''}>${v}</option>`).join('');
    adminShell(`<div class="admin-filter filter-3"><div class="field"><label for="f-q">Cari referensi, nama, atau email</label><input id="f-q" type="search" value="${esc(params.get('q') || '')}"></div><div class="field"><label for="f-kind">Jenis</label><select id="f-kind"><option value="">Semua jenis</option>${kinds}</select></div><div class="field"><label for="f-status">Status</label><select id="f-status"><option value="">Semua status</option>${statuses}</select></div></div><p class="small muted" id="app-count" aria-live="polite"></p><div id="app-table"></div>`, 'Pengajuan dan Dokumen');
    const load = async () => {
      const query = new URLSearchParams();
      for (const [key, id] of [['q', 'f-q'], ['kind', 'f-kind'], ['status', 'f-status']]) if ($('#' + id).value) query.set(key, $('#' + id).value);
      try {
        const rows = await api('/api/admin/applications?' + query);
        $('#app-count').textContent = `${rows.length} pengajuan`;
        $('#app-table').innerHTML = rows.length ? `<div class="table-wrap asset-register"><table role="table"><caption class="sr-only">Daftar pengajuan penyewa</caption><thead><tr><th scope="col">Referensi</th><th scope="col">Penyewa</th><th scope="col">Aset</th><th scope="col">Jenis</th><th scope="col">Status</th><th scope="col">Pembayaran</th><th scope="col">KTP</th><th scope="col">Berkas menunggu</th><th scope="col">Tindakan</th></tr></thead><tbody>${rows.map(a => `<tr><td data-label="Referensi">${esc(a.ref)}</td><td data-label="Penyewa">${esc(a.tenant.name)}<small>${esc(a.tenant.email)}</small></td><td data-label="Aset">${esc(a.house?.name)} (${esc(a.house?.code)})</td><td data-label="Jenis">${esc(APP_KIND[a.kind])}</td><td data-label="Status">${chip(APP_STATUS[a.status], a.status)}</td><td data-label="Pembayaran">${a.kind === 'survei' ? '-' : chip(PAYMENT[a.payment], a.payment)}</td><td data-label="KTP">${a.ktp_status ? chip(DOC_STATUS[a.ktp_status], a.ktp_status) : '-'}</td><td data-label="Berkas menunggu">${a.pending_documents || 0}</td><td data-label="Tindakan"><a class="nowrap" href="/admin/pengajuan/${a.id}">Kelola</a></td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada pengajuan', 'Pengajuan penyewa akan tampil di sini.');
        history.replaceState({}, '', '/admin/pengajuan' + (query.size ? '?' + query : ''));
      } catch (error) { toast(error.message); }
    };
    $('#f-q').oninput = () => { clearTimeout(Account.timer); Account.timer = setTimeout(load, 250); };
    $('#f-kind').onchange = load; $('#f-status').onchange = load;
    load();
  },

  docReview(d, extra = '') {
    const options = (d.kind === 'ktp' ? ['menunggu', 'terverifikasi', 'perlu_perbaikan'] : ['menunggu', 'diterima', 'perlu_perbaikan']);
    return `<div class="attention-row" data-doc="${esc(d.id)}"><div><strong>${d.kind === 'ktp' ? 'KTP' : 'Surat bertanda tangan'} versi ${d.version}</strong> ${chip(DOC_STATUS[d.status], d.status)}<p class="small">${esc(d.name)} · ${dateId(d.created)}</p>${extra}<a href="${esc(d.url)}" download>Unduh berkas</a>${d.reason ? `<p class="small">Alasan: ${esc(d.reason)}</p>` : ''}<div class="form-grid"><div class="field"><label for="ds-${d.id}">Hasil pemeriksaan</label><select id="ds-${d.id}">${options.map(o => `<option value="${o}"${d.status === o ? ' selected' : ''}>${DOC_STATUS[o]}</option>`).join('')}</select></div><div class="field"><label for="dr-${d.id}">Alasan perbaikan</label><input id="dr-${d.id}" value="${esc(d.reason)}"></div></div><button class="btn small" data-save-doc="${esc(d.id)}">Simpan Pemeriksaan</button></div></div>`;
  },

  adminDetail(a) {
    const form = a.kind !== 'survei';
    const statusOptions = Object.keys(APP_STATUS).filter(s => form ? s !== 'terjadwal' && (s !== 'selesai' || a.status === 'selesai') : !['perlu_perbaikan', 'disetujui'].includes(s));
    const letters = a.documents.filter(d => d.kind === 'surat_siap_ttd'), signed = a.documents.filter(d => d.kind === 'surat_ttd');
    const wa = `https://wa.me/${a.tenant.whatsapp}`;
    const canActivate = a.kind === 'sewa_baru' && ['disetujui', 'selesai'].includes(a.status) && a.payment === 'lunas' && !a.applied && !a.closed;
    const canExtend = a.kind === 'perpanjangan' && ['disetujui', 'selesai'].includes(a.status) && a.payment === 'lunas' && !a.applied && !a.closed;
    const house = a.house || {};
    adminShell(`<div class="breadcrumb"><a href="/admin/pengajuan">Pengajuan</a> / ${esc(a.ref)}</div><section class="admin-section"><h2>${esc(APP_KIND[a.kind])} · ${esc(a.ref)}</h2><p><strong>${esc(a.tenant.name)}</strong> · ${esc(a.tenant.email)} · <a href="${esc(wa)}" target="_blank" rel="noopener noreferrer">+${esc(a.tenant.whatsapp)}</a></p><p>Aset: <a href="/admin/rumah/${esc(house.id)}">${esc(house.name)} (${esc(house.code)})</a> · status aset ${esc(house.status)}</p><p>${chip(APP_STATUS[a.status], a.status)} ${form ? chip(PAYMENT[a.payment], a.payment) : ''}${a.applied ? ' <span class="badge">Sudah diaktifkan</span>' : ''}</p></section><section class="admin-section"><h2>Keputusan${form ? ' dan pembayaran' : ''}</h2><form id="app-form" class="form-grid"><div class="field"><label for="a-status">Status pengajuan</label><select id="a-status">${statusOptions.map(s => `<option value="${s}"${a.status === s ? ' selected' : ''}>${APP_STATUS[s]}</option>`).join('')}</select></div>${form ? `<div class="field"><label for="a-payment">Konfirmasi pembayaran</label><select id="a-payment">${Object.entries(PAYMENT).map(([k, v]) => `<option value="${k}"${a.payment === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}<div class="field full"><label for="a-note">Catatan untuk penyewa (alasan perbaikan, jadwal survei, dsb.)</label><textarea id="a-note">${esc(a.admin_note)}</textarea></div>${form ? `<div class="field full"><label for="a-pnote">Catatan pembayaran internal</label><textarea id="a-pnote">${esc(a.payment_note)}</textarea></div>` : ''}<div class="field full"><button class="btn" type="submit"${a.applied ? ' disabled' : ''}>Simpan</button><p class="small muted">${form ? 'Persetujuan memerlukan KTP Terverifikasi dan surat bertanda tangan Diterima. Pembayaran hanya dapat dikonfirmasi setelah pengajuan disetujui. Dokumen diterima tidak otomatis menyetujui atau melunasi.' : 'Mengubah status survei tidak mengubah status aset.'}</p></div></form></section>${form ? `<section class="admin-section"><h2>KTP penyewa</h2>${a.ktp ? Account.docReview(a.ktp, '<p class="small">Versi yang dirujuk pengajuan ini.</p>') : empty('KTP belum ada', 'Penyewa belum mengunggah KTP.')}${a.ktp_versions.length > 1 ? `<details><summary class="small">Semua versi KTP (${a.ktp_versions.length})</summary><ul>${a.ktp_versions.map(v => `<li>Versi ${v.version} · ${dateId(v.created)} · ${esc(DOC_STATUS[v.status])} · <a href="${esc(v.url)}" download>Unduh</a></li>`).join('')}</ul></details>` : ''}</section><section class="admin-section"><h2>Surat permohonan ${a.kind === 'perpanjangan' ? 'perpanjangan' : 'baru sewa'}</h2><p class="small muted">Isi template resmi secara manual, lalu unggah versi siap tanda tangan agar dapat diunduh penyewa.</p>${letters.length ? `<ul>${letters.map(l => `<li>Versi ${l.version} · ${dateId(l.created)} · <a href="${esc(l.url)}" download>Unduh</a></li>`).join('')}</ul>` : '<p class="muted">Belum ada surat siap tanda tangan.</p>'}${a.closed ? '' : '<form id="letter-form" class="form-grid"><div class="field full"><label for="letter-file">Unggah surat siap tanda tangan</label><input id="letter-file" type="file" accept="application/pdf,image/jpeg,image/png" required></div><div class="field full"><button class="btn small" type="submit">Unggah Surat</button></div></form>'}<h3>Hasil tanda tangan dari penyewa</h3>${signed.length ? signed.map(d => Account.docReview(d)).join('') : '<p class="muted">Belum ada unggahan.</p>'}</section>` : ''}${canActivate ? `<section class="admin-section"><h2>Aktifkan sewa</h2><p class="small muted">Aset harus berstatus Dipesan. Aset otomatis menjadi Tersewa dan hilang dari katalog publik.</p><form id="activate-form" class="form-grid"><div class="field"><label for="x-period">Periode aktif</label><select id="x-period"><option value="monthly">Bulanan</option><option value="yearly" selected>Tahunan</option></select></div><div class="field"><label for="x-start">Tanggal mulai</label><input id="x-start" type="date" required></div><div class="field"><label for="x-end">Tanggal akhir</label><input id="x-end" type="date" required></div><div class="field full"><button class="btn" type="submit">Aktifkan Sewa</button></div></form></section>` : ''}${canExtend ? `<section class="admin-section"><h2>Catat perpanjangan</h2><p class="small muted">Periode baru ditambahkan sebagai catatan baru; riwayat tidak ditimpa.</p><form id="extend-form" class="form-grid"><div class="field"><label for="x-period">Periode</label><select id="x-period"><option value="monthly">Bulanan</option><option value="yearly" selected>Tahunan</option></select></div><div class="field"><label for="x-end">Tanggal akhir baru</label><input id="x-end" type="date" required></div><div class="field full"><button class="btn" type="submit">Catat Perpanjangan</button></div></form></section>` : ''}${a.lease_periods?.length ? `<section class="admin-section"><h2>Riwayat periode sewa</h2><ul>${a.lease_periods.map(p => `<li>${dateId(p.start)} – ${dateId(p.end)} (${p.period === 'monthly' ? 'bulanan' : 'tahunan'})</li>`).join('')}</ul></section>` : ''}`, 'Kelola Pengajuan');
    const reload = async () => Account.adminDetail(await api('/api/admin/applications/' + a.id));
    const appForm = $('#app-form');
    appForm.onsubmit = guard($('button[type=submit]', appForm), async () => {
      const body = {status: $('#a-status').value, admin_note: $('#a-note').value};
      if (form) Object.assign(body, {payment: $('#a-payment').value, payment_note: $('#a-pnote').value});
      if (['disetujui', 'ditolak'].includes(body.status) && body.status !== a.status && !await askConfirm(`Ubah status ke ${APP_STATUS[body.status]}?`, 'Perubahan ini terlihat oleh penyewa.')) return;
      await api('/api/admin/applications/' + a.id, {method: 'PUT', body: JSON.stringify(body)});
      toast('Pengajuan tersimpan.');
      await reload();
    });
    Account.bindDocs(reload);
    const letter = $('#letter-form');
    if (letter) letter.onsubmit = guard($('button', letter), async () => {
      const file = await readFile($('#letter-file'));
      await api(`/api/admin/applications/${a.id}/documents`, {method: 'POST', body: JSON.stringify(file)});
      toast('Surat siap tanda tangan tersedia untuk penyewa.');
      await reload();
    });
    for (const [formId, endpoint, confirmText] of [['activate-form', 'activate', 'Aset akan berstatus Tersewa dan disembunyikan dari publik. Pastikan pelunasan sudah Anda verifikasi.'], ['extend-form', 'extend', 'Periode baru dicatat dan tanggal akhir aktif diperbarui. Pastikan pembayaran perpanjangan sudah Anda verifikasi.']]) {
      const element = $('#' + formId);
      if (!element) continue;
      element.onsubmit = guard($('button', element), async () => {
        if (!await askConfirm('Konfirmasi', confirmText)) return;
        const body = {confirm: true, period: $('#x-period').value, end: $('#x-end').value};
        if ($('#x-start')) body.start = $('#x-start').value;
        await api(`/api/admin/applications/${a.id}/${endpoint}`, {method: 'POST', body: JSON.stringify(body)});
        toast('Tersimpan.');
        await reload();
      });
    }
  },

  bindDocs(reload) {
    $$('[data-save-doc]').forEach(button => button.onclick = guard(button, async () => {
      const id = button.dataset.saveDoc;
      await api('/api/admin/documents/' + id, {method: 'PUT', body: JSON.stringify({status: $('#ds-' + id).value, reason: $('#dr-' + id).value})});
      toast('Pemeriksaan berkas tersimpan.');
      await reload();
    }));
  },

  tenantList() {
    adminShell(`<div class="admin-filter"><div class="field"><label for="t-q">Cari nama, email, atau WhatsApp</label><input id="t-q" type="search"></div><div class="field"><label for="t-ktp">Status KTP</label><select id="t-ktp"><option value="">Semua status KTP</option><option value="none">Belum diunggah</option><option value="menunggu">Menunggu verifikasi</option><option value="terverifikasi">Terverifikasi</option><option value="perlu_perbaikan">Perlu perbaikan</option></select></div></div><p class="small muted" id="t-count" aria-live="polite"></p><div id="t-table"></div>`, 'Penyewa dan KTP');
    let all = [];
    const draw = () => {
      const filter = $('#t-ktp').value;
      const rows = all.filter(t => !filter || (filter === 'none' ? !t.ktp : t.ktp?.status === filter));
      $('#t-count').textContent = `${rows.length} penyewa`;
      $('#t-table').innerHTML = rows.length ? `<div class="table-wrap asset-register"><table role="table"><caption class="sr-only">Daftar penyewa</caption><thead><tr><th scope="col">Penyewa</th><th scope="col">WhatsApp</th><th scope="col">KTP</th><th scope="col">Pengajuan</th><th scope="col">Tindakan</th></tr></thead><tbody>${rows.map(t => `<tr><td data-label="Penyewa">${esc(t.name)}<small>${esc(t.email)}</small></td><td data-label="WhatsApp">+${esc(t.whatsapp)}</td><td data-label="KTP">${t.ktp ? chip(DOC_STATUS[t.ktp.status], t.ktp.status) : chip('Belum diunggah', 'belum')}</td><td data-label="Pengajuan">${t.applications} (${t.open} aktif)</td><td data-label="Tindakan"><a class="nowrap" href="/admin/penyewa/${t.id}">${t.ktp?.status === 'menunggu' ? 'Periksa KTP' : 'Lihat'}</a></td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada penyewa', 'Akun penyewa yang mendaftar akan tampil di sini.');
    };
    const load = async () => { try { all = await api('/api/admin/tenants?q=' + encodeURIComponent($('#t-q').value)); draw(); } catch (error) { toast(error.message); } };
    $('#t-q').oninput = () => { clearTimeout(Account.timer); Account.timer = setTimeout(load, 250); };
    $('#t-ktp').onchange = draw;
    load();
  },

  tenantDetail(t) {
    adminShell(`<div class="breadcrumb"><a href="/admin/penyewa">Penyewa dan KTP</a> / ${esc(t.name)}</div><section class="admin-section"><h2>${esc(t.name)}</h2><dl class="profile-list"><div><dt>Email</dt><dd>${esc(t.email)}</dd></div><div><dt>WhatsApp</dt><dd><a href="https://wa.me/${esc(t.whatsapp)}" target="_blank" rel="noopener noreferrer">+${esc(t.whatsapp)}</a></dd></div><div><dt>Terdaftar</dt><dd>${dateId(t.created)}</dd></div></dl></section><section class="admin-section"><h2>KTP</h2>${t.ktp ? Account.docReview(t.ktp_versions[0]) : empty('KTP belum diunggah', 'Penyewa belum mengunggah KTP.')}${t.ktp_versions.length > 1 ? `<details><summary class="small">Versi sebelumnya (${t.ktp_versions.length - 1})</summary><ul>${t.ktp_versions.slice(1).map(v => `<li>Versi ${v.version} · ${dateId(v.created)} · ${esc(DOC_STATUS[v.status])} · <a href="${esc(v.url)}" download>Unduh</a></li>`).join('')}</ul></details>` : ''}</section><section class="admin-section"><h2>Pengajuan</h2>${t.application_list.length ? `<ul>${t.application_list.map(a => `<li><a href="/admin/pengajuan/${a.id}">${esc(a.ref)}</a> · ${esc(APP_KIND[a.kind])} · ${esc(a.house?.name)} · ${esc(APP_STATUS[a.status])}</li>`).join('')}</ul>` : '<p class="muted">Belum ada pengajuan.</p>'}</section>${t.leases.length ? `<section class="admin-section"><h2>Sewa</h2>${t.leases.map(l => `<p><strong>${esc(l.house.name)}</strong>: ${dateId(l.current.start)} – ${dateId(l.current.end)}</p>`).join('')}</section>` : ''}`, 'Detail Penyewa');
    Account.bindDocs(async () => Account.tenantDetail(await api('/api/admin/tenants/' + t.id)));
  },

  importPage() {
    adminShell(`<section class="admin-section"><h2>Impor data aset dari Excel</h2><p class="muted small">Gunakan format Daftar Potensi Optimalisasi Aset (kolom OBJEK, NO. INVENTARIS, LOKASI, KONDISI, ALAS HAK, BENTUK KERJA SAMA, REAL 2025, ESTIMASI 2026, REAL 2026, RENCANA 2027, KETERANGAN). Baris masuk sebagai <strong>Draft</strong> bertipe Bangunan, kecuali Anda mencentang opsi tayangkan. Untuk bentuk kerja sama "sewa 1 th", harga sewa tahunan diisi dari kolom Estimasi 2026 (dapat diubah admin). Foto, Maps, dan luas boleh dilengkapi belakangan. Impor ulang tidak menggandakan data.</p><form id="import-form" class="form-grid"><div class="field full"><label for="xlsx">Berkas Excel (.xlsx, maks. ${window.SEWARUMA_NETLIFY?3:10} MB)</label><input id="xlsx" type="file" accept=".xlsx" required></div><div class="field"><label for="sheet">Lembar kerja (opsional)</label><input id="sheet" placeholder="Otomatis: Purwodadi"></div><div class="field full"><label class="checkbox-label"><input type="checkbox" id="publish">Langsung tayangkan baris yang belum tersewa (Keterangan kosong, \"proses\", atau \"belum\") sebagai Tersedia</label></div><div class="field full"><button class="btn secondary" type="submit" id="preview-btn">Pratinjau</button> <button class="btn" type="button" id="commit-btn" disabled>Impor sebagai Draft</button></div></form><div id="import-result"></div></section>`, 'Impor Excel');
    const result = $('#import-result');
    const run = async commit => {
      const file = await readFile($('#xlsx'), 10 * 1048576);
      const body = {data: file.data, commit, publish: $('#publish').checked};
      if ($('#sheet').value.trim()) body.sheet = $('#sheet').value.trim();
      return api('/api/admin/import', {method: 'POST', body: JSON.stringify(body)});
    };
    const show = r => {
      result.innerHTML = `<div class="notice">Lembar <strong>${esc(r.sheet)}</strong> (tersedia: ${r.sheets.map(esc).join(', ')}). Ditemukan ${r.found} baris; ${r.committed ? `<strong>${r.new} diimpor</strong>` : `${r.new} akan diimpor`}, ${r.skipped} dilewati karena sudah pernah diimpor${r.priced_existing?` (${r.priced_existing} di antaranya dilengkapi harga tahunan)`:''}.${r.published_new||r.published_existing?` Ditayangkan: ${r.published_new} baru${r.published_existing?` dan ${r.published_existing} yang sebelumnya Draft`:''}.`:''}</div>${r.preview.length ? `<div class="table-wrap asset-register"><table role="table"><caption class="sr-only">Contoh baris</caption><thead><tr><th scope="col">Kode</th><th scope="col">Objek</th><th scope="col">Lokasi</th><th scope="col">Kondisi</th><th scope="col">Bentuk kerja</th><th scope="col">Real 2025</th><th scope="col">Est. 2026</th><th scope="col">Keterangan</th></tr></thead><tbody>${r.preview.map(p => `<tr><td data-label="Kode">${esc(p.code)}</td><td data-label="Objek">${esc(p.name)}</td><td data-label="Lokasi">${esc(p.address) || '-'}</td><td data-label="Kondisi">${esc(p.asset_condition) || '-'}</td><td data-label="Bentuk kerja">${esc(p.cooperation_type) || '-'}</td><td data-label="Real 2025">${p.real_2025 == null ? '-' : money(p.real_2025)}</td><td data-label="Est. 2026">${p.estimasi_2026 == null ? '-' : money(p.estimasi_2026)}</td><td data-label="Keterangan">${esc(p.keterangan) || '-'}</td></tr>`).join('')}</tbody></table></div><p class="small muted">Menampilkan ${r.preview.length} contoh pertama.</p>` : ''}${r.committed ? '<a class="btn" href="/admin/rumah?status=Draft">Lihat Draft</a>' : ''}`;
      $('#commit-btn').disabled = r.committed || !r.new;
    };
    $('#import-form').onsubmit = guard($('#preview-btn'), async () => show(await run(false)));
    $('#commit-btn').onclick = guard($('#commit-btn'), async () => {
      if (!await askConfirm('Impor data?', 'Semua baris baru dimasukkan sebagai Draft. Data yang sudah ada tidak diubah.', 'Impor')) return;
      show(await run(true));
      toast('Impor selesai.');
    });
  },
};

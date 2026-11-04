'use strict';
/* Akun penyewa, pengajuan, berkas, perpanjangan, dan halaman admin tambahan.
   Memakai helper global dari app.js ($, esc, api, shell, adminShell, navigate, toast, empty, field, textarea). */
const APP_STATUS = {diproses:'Diproses', terjadwal:'Survei terjadwal', selesai:'Survei selesai', perlu_perbaikan:'Perlu perbaikan', disetujui:'Disetujui', ditolak:'Ditolak', dibatalkan:'Dibatalkan'};
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
      if (path === '/akun') { const data = await Account.load(); if (id === navigationId) Account.home(data); return true; }
      const match = path.match(/^\/akun\/pengajuan\/([a-f0-9]+)$/);
      if (match) { const application = await api('/api/my/applications/' + match[1]); if (id === navigationId) Account.applicationPage(application); return true; }
      return false;
    }
    if (/^\/admin\/(pengajuan|impor)/.test(path)) {
      if (window.SEWARUMA_STATIC_DEMO) return false;
      state.session = await api('/api/session');
      if (id !== navigationId) return true;
      if (!state.session.authenticated) { login(); return true; }
      if (path === '/admin/impor') { Account.importPage(); return true; }
      if (path === '/admin/pengajuan') { Account.adminList(); return true; }
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
    const next = new URLSearchParams(location.search).get('next') || '/akun';
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/akun';
    shell(`<div class="login-wrap"><h1>${register ? 'Daftar Akun Penyewa' : 'Masuk Penyewa'}</h1><p class="muted">${register ? 'Akun diperlukan untuk mengajukan survei dan permohonan sewa. KTP tidak diminta saat mendaftar.' : 'Masuk untuk mengajukan survei, mengunggah berkas, dan melihat status sewa Anda.'}</p><form class="login-form" id="auth-form"><div class="error form-error" id="auth-error" role="alert"></div>${register ? '<div class="field"><label for="name">Nama lengkap</label><input id="name" autocomplete="name" required></div><div class="field"><label for="whatsapp">Nomor WhatsApp</label><input id="whatsapp" type="tel" inputmode="tel" autocomplete="tel" placeholder="0812xxxxxxxx" required></div>' : ''}<div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" required></div><div class="field"><label for="password">Kata sandi${register ? ' (minimal 8 karakter)' : ''}</label><input id="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="${register ? 8 : 1}" required></div><button class="btn" type="submit">${register ? 'Daftar' : 'Masuk'}</button><p class="small muted">${register ? `Sudah punya akun? <a href="/masuk?next=${encodeURIComponent(safeNext)}">Masuk</a>` : `Belum punya akun? <a href="/daftar?next=${encodeURIComponent(safeNext)}">Daftar</a>`}</p></form></div>`, register ? 'Daftar' : 'Masuk');
    $('#auth-form').onsubmit = async event => {
      event.preventDefault();
      const button = $('button[type=submit]', event.target);
      button.disabled = true;
      const body = {email: $('#email').value, password: $('#password').value};
      if (register) Object.assign(body, {name: $('#name').value, whatsapp: $('#whatsapp').value});
      try {
        state.user = await api(register ? '/api/register' : '/api/user/login', {method: 'POST', body: JSON.stringify(body)});
        navigate(safeNext);
      } catch (error) { $('#auth-error').textContent = error.message; button.disabled = false; }
    };
  },
  async logout() {
    try { await api('/api/user/logout', {method: 'POST', body: '{}'}); } catch { /* sesi sudah berakhir */ }
    state.user = {authenticated: false};
    navigate('/');
  },

  // ---------------------------------------------------------------- akun saya
  home({applications, ktp, leases}) {
    const user = state.user.user;
    const latest = ktp.latest;
    const ktpBlock = `<section class="admin-section" id="dokumen"><h2>Dokumen Saya</h2><p class="muted small">KTP dipakai ulang untuk permohonan dan perpanjangan berikutnya selama datanya masih sesuai. Format PDF, JPG, atau PNG, maksimal 5 MB.</p>${latest ? `<div class="attention-row"><div><strong>KTP versi ${latest.version}</strong> ${chip(DOC_STATUS[latest.status], latest.status)}<p>Diunggah ${dateId(latest.created)}</p>${latest.reason ? `<div class="notice"><strong>Alasan perbaikan:</strong> ${esc(latest.reason)}</div>` : ''}</div><a class="btn secondary small" href="${esc(latest.url)}" download>Unduh</a></div>` : empty('KTP belum diunggah', 'KTP baru wajib saat mengajukan permohonan sewa. Mengajukan survei tidak memerlukan KTP.')}<form id="ktp-form" class="form-grid"><div class="field full"><label for="ktp-file">${latest ? 'Ganti KTP (versi baru)' : 'Unggah KTP'}</label><input id="ktp-file" type="file" accept="application/pdf,image/jpeg,image/png" required></div><div class="field full"><button class="btn small" type="submit">Unggah KTP</button></div></form></section>`;
    const leaseBlock = `<section class="admin-section" id="sewa"><h2>Sewa Saya</h2>${leases.length ? leases.map(l => `<div class="attention-row"><div><strong>${esc(l.house.name)} (${esc(l.house.code)})</strong><p>Periode aktif: ${dateId(l.current.start)} – ${dateId(l.current.end)} (${l.current.period === 'monthly' ? 'bulanan' : 'tahunan'})</p>${l.periods.length > 1 ? `<details><summary class="small">Riwayat periode (${l.periods.length})</summary><ul>${l.periods.map(p => `<li>${dateId(p.start)} – ${dateId(p.end)}</li>`).join('')}</ul></details>` : ''}</div>${l.open_renewal ? '<span class="badge attention">Perpanjangan diproses</span>' : `<button class="btn small" data-renew="${esc(l.id)}">Ajukan Perpanjangan</button>`}</div>`).join('') : empty('Belum ada sewa aktif', 'Sewa yang telah diaktifkan pengelola akan tampil di sini beserta tanggal berakhirnya.')}</section>`;
    const appBlock = `<section class="admin-section" id="pengajuan"><h2>Pengajuan Saya</h2>${applications.length ? `<div class="table-wrap asset-register"><table role="table"><caption class="sr-only">Daftar pengajuan Anda</caption><thead><tr><th scope="col">No. Referensi</th><th scope="col">Jenis</th><th scope="col">Aset</th><th scope="col">Status</th><th scope="col">Pembayaran</th><th scope="col">Tindakan</th></tr></thead><tbody>${applications.map(a => `<tr><td data-label="No. Referensi">${esc(a.ref)}</td><td data-label="Jenis">${esc(APP_KIND[a.kind])}</td><td data-label="Aset">${esc(a.house?.name)} (${esc(a.house?.code)})</td><td data-label="Status">${chip(APP_STATUS[a.status], a.status)}</td><td data-label="Pembayaran">${a.kind === 'survei' ? '-' : chip(PAYMENT[a.payment], a.payment)}</td><td data-label="Tindakan"><a class="nowrap" href="/akun/pengajuan/${a.id}">Lihat Detail</a></td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada pengajuan', 'Pilih aset di katalog lalu ajukan survei.', '<a class="btn" href="/rumah">Jelajahi Aset</a>')}</section>`;
    shell(`<div class="container admin-bottom"><div class="admin-top"><div><h1>Akun Saya</h1><p class="muted small">${esc(user.name)} · ${esc(user.email)} · +${esc(user.whatsapp)}</p></div><div class="admin-actions"><button class="btn secondary small" id="user-logout">Keluar</button></div></div>${appBlock}${leaseBlock}${ktpBlock}</div>`, 'Akun Saya');
    $('#user-logout').onclick = Account.logout;
    const ktpForm = $('#ktp-form');
    ktpForm.onsubmit = guard($('button', ktpForm), async () => {
      const file = await readFile($('#ktp-file'));
      await api('/api/my/ktp', {method: 'POST', body: JSON.stringify(file)});
      toast('KTP terunggah dan menunggu verifikasi pengelola.');
      Account.home(await Account.load());
    });
    $$('[data-renew]').forEach(button => button.onclick = guard(button, async () => {
      if (!await askConfirm('Ajukan perpanjangan?', 'Pengajuan perpanjangan akan dicatat. Surat permohonan perpanjangan disiapkan pengelola, lalu Anda unduh, tanda tangani, dan unggah kembali.')) return;
      const created = await api(`/api/my/leases/${button.dataset.renew}/renew`, {method: 'POST', body: '{}'});
      navigate('/akun/pengajuan/' + created.id);
    }));
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
    const steps = !form ? `<section class="detail-block"><h2>Langkah berikutnya</h2><ol><li>Hubungi pengelola melalui WhatsApp dengan nomor referensi <strong>${esc(a.ref)}</strong> untuk menyepakati jadwal survei.</li><li>Setelah survei dan ada kesepakatan, ajukan kerja sama dari detail aset.</li></ol><p class="small muted">Membuka WhatsApp belum berarti jadwal disetujui. Pengelola mencatat jadwal pada pengajuan ini.</p>${chat && open ? `<a class="btn" href="${esc(chat)}" target="_blank" rel="noopener noreferrer">Lanjut ke WhatsApp</a>` : ''}${a.status !== 'dibatalkan' && house.status === 'Tersedia' ? `<a class="btn secondary" href="/rumah/${esc(house.id)}">Ajukan Kerja Sama di Detail Aset</a>` : ''}</section>`
      : `<section class="detail-block"><h2>Kelengkapan berkas</h2><ol class="steps"><li><strong>KTP</strong> ${ktp ? chip(DOC_STATUS[ktp.status], ktp.status) : chip('Belum diunggah', 'perlu_perbaikan')}${ktp?.reason ? `<div class="notice">Perlu perbaikan: ${esc(ktp.reason)}</div>` : ''}<p class="small muted">${ktp?.status === 'terverifikasi' ? 'KTP terverifikasi dipakai kembali, tidak perlu unggah ulang.' : 'Kelola KTP di '}${ktp?.status === 'terverifikasi' ? '' : '<a href="/akun#dokumen">Dokumen Saya</a>.'}</p></li><li><strong>Surat siap tanda tangan</strong> ${template ? `<a href="${esc(template.url)}" download>Unduh surat</a>` : '<span class="muted">Menunggu pengelola menyiapkan surat.</span>'}<p class="small muted">Cetak, tanda tangani di luar website, lalu foto atau pindai dan unggah hasilnya.</p></li><li><strong>Surat bertanda tangan</strong> ${newest ? chip(DOC_STATUS[newest.status], newest.status) : chip('Belum diunggah', 'perlu_perbaikan')}${newest?.reason ? `<div class="notice">Perlu perbaikan: ${esc(newest.reason)}</div>` : ''}${signed.length ? `<ul>${signed.map(d => `<li>Versi ${d.version} · ${dateId(d.created)} · ${esc(DOC_STATUS[d.status])}</li>`).join('')}</ul>` : ''}${template && !a.closed ? `<form id="sign-form" class="form-grid"><div class="field full"><label for="sign-file">${newest ? 'Unggah ulang surat bertanda tangan' : 'Unggah surat bertanda tangan'}</label><input id="sign-file" type="file" accept="application/pdf,image/jpeg,image/png" required></div><div class="field full"><button class="btn small" type="submit">Unggah</button></div></form>` : ''}</li><li><strong>Keputusan pengelola</strong> ${chip(APP_STATUS[a.status], a.status)}${a.admin_note ? `<p>${esc(a.admin_note)}</p>` : ''}</li><li><strong>Pembayaran</strong> ${chip(PAYMENT[a.payment], a.payment)}<p class="small muted">Pembayaran dilakukan melalui WhatsApp setelah pengajuan disetujui. Status dikonfirmasi manual oleh pengelola.</p>${a.status === 'disetujui' && chat && !a.applied ? `<a class="btn small" href="${esc(chat)}" target="_blank" rel="noopener noreferrer">Lanjut ke WhatsApp</a>` : ''}</li></ol>${a.applied ? '<div class="notice">Pengajuan ini sudah aktif dan tercatat pada <a href="/akun#sewa">Sewa Saya</a>.</div>' : ''}</section>`;
    shell(`<div class="container admin-bottom"><div class="breadcrumb"><a href="/akun">Akun Saya</a> / ${esc(a.ref)}</div><div class="admin-top"><div><h1>${esc(APP_KIND[a.kind])}</h1><p class="muted">${esc(a.ref)} · <a href="/rumah/${esc(house.id)}">${esc(house.name)} (${esc(house.code)})</a></p></div><div>${chip(APP_STATUS[a.status], a.status)}</div></div>${steps}${open && a.status !== 'disetujui' ? '<button class="btn secondary small" id="cancel-app">Batalkan Pengajuan</button>' : ''}</div>`, a.ref);
    const refresh = async () => Account.applicationPage(await api('/api/my/applications/' + a.id));
    const sign = $('#sign-form');
    if (sign) sign.onsubmit = guard($('button', sign), async () => {
      const file = await readFile($('#sign-file'));
      await api(`/api/my/applications/${a.id}/documents`, {method: 'POST', body: JSON.stringify(file)});
      toast('Surat terunggah dan menunggu pemeriksaan pengelola.');
      await refresh();
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
    adminShell(`<div class="admin-filter"><div class="field"><label for="f-q">Cari referensi, nama, atau email</label><input id="f-q" type="search" value="${esc(params.get('q') || '')}"></div><div class="field"><label for="f-kind">Jenis</label><select id="f-kind"><option value="">Semua jenis</option>${kinds}</select></div><div class="field"><label for="f-status">Status</label><select id="f-status"><option value="">Semua status</option>${statuses}</select></div></div><p class="small muted" id="app-count" aria-live="polite"></p><div id="app-table"></div>`, 'Pengajuan dan Dokumen');
    const load = async () => {
      const query = new URLSearchParams();
      for (const [key, id] of [['q', 'f-q'], ['kind', 'f-kind'], ['status', 'f-status']]) if ($('#' + id).value) query.set(key, $('#' + id).value);
      try {
        const rows = await api('/api/admin/applications?' + query);
        $('#app-count').textContent = `${rows.length} pengajuan`;
        $('#app-table').innerHTML = rows.length ? `<div class="table-wrap asset-register"><table role="table"><caption class="sr-only">Daftar pengajuan penyewa</caption><thead><tr><th scope="col">Referensi</th><th scope="col">Penyewa</th><th scope="col">Aset</th><th scope="col">Jenis</th><th scope="col">Status</th><th scope="col">Pembayaran</th><th scope="col">Berkas menunggu</th><th scope="col">Tindakan</th></tr></thead><tbody>${rows.map(a => `<tr><td data-label="Referensi">${esc(a.ref)}</td><td data-label="Penyewa">${esc(a.tenant.name)}<small>${esc(a.tenant.email)}</small></td><td data-label="Aset">${esc(a.house?.name)} (${esc(a.house?.code)})</td><td data-label="Jenis">${esc(APP_KIND[a.kind])}</td><td data-label="Status">${chip(APP_STATUS[a.status], a.status)}</td><td data-label="Pembayaran">${a.kind === 'survei' ? '-' : chip(PAYMENT[a.payment], a.payment)}</td><td data-label="Berkas menunggu">${a.pending_documents || 0}</td><td data-label="Tindakan"><a class="nowrap" href="/admin/pengajuan/${a.id}">Kelola</a></td></tr>`).join('')}</tbody></table></div>` : empty('Belum ada pengajuan', 'Pengajuan penyewa akan tampil di sini.');
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
    const statusOptions = Object.keys(APP_STATUS).filter(s => form ? !['terjadwal', 'selesai'].includes(s) : !['perlu_perbaikan', 'disetujui'].includes(s));
    const letters = a.documents.filter(d => d.kind === 'surat_siap_ttd'), signed = a.documents.filter(d => d.kind === 'surat_ttd');
    const wa = `https://wa.me/${a.tenant.whatsapp}`;
    const canActivate = a.kind === 'sewa_baru' && a.status === 'disetujui' && a.payment === 'lunas' && !a.applied && !a.closed;
    const canExtend = a.kind === 'perpanjangan' && a.status === 'disetujui' && a.payment === 'lunas' && !a.applied && !a.closed;
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
    $$('[data-save-doc]').forEach(button => button.onclick = guard(button, async () => {
      const id = button.dataset.saveDoc;
      await api('/api/admin/documents/' + id, {method: 'PUT', body: JSON.stringify({status: $('#ds-' + id).value, reason: $('#dr-' + id).value})});
      toast('Pemeriksaan berkas tersimpan.');
      await reload();
    }));
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

  importPage() {
    adminShell(`<section class="admin-section"><h2>Impor data aset dari Excel</h2><p class="muted small">Gunakan format Daftar Potensi Optimalisasi Aset (kolom OBJEK, NO. INVENTARIS, LOKASI, KONDISI, ALAS HAK, BENTUK KERJA SAMA, REAL 2025, ESTIMASI 2026, REAL 2026, RENCANA 2027, KETERANGAN). Baris masuk sebagai <strong>Draft</strong> bertipe Bangunan, kecuali Anda mencentang opsi tayangkan. Untuk bentuk kerja sama "sewa 1 th", harga sewa tahunan diisi dari kolom Estimasi 2026 (dapat diubah admin). Foto, Maps, dan luas boleh dilengkapi belakangan. Impor ulang tidak menggandakan data.</p><form id="import-form" class="form-grid"><div class="field full"><label for="xlsx">Berkas Excel (.xlsx, maks. 10 MB)</label><input id="xlsx" type="file" accept=".xlsx" required></div><div class="field"><label for="sheet">Lembar kerja (opsional)</label><input id="sheet" placeholder="Otomatis: Purwodadi"></div><div class="field full"><label class="checkbox-label"><input type="checkbox" id="publish">Langsung tayangkan baris yang belum tersewa (Keterangan kosong, \"proses\", atau \"belum\") sebagai Tersedia</label></div><div class="field full"><button class="btn secondary" type="submit" id="preview-btn">Pratinjau</button> <button class="btn" type="button" id="commit-btn" disabled>Impor sebagai Draft</button></div></form><div id="import-result"></div></section>`, 'Impor Excel');
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

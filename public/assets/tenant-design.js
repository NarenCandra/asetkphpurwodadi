/* PRD 0.3 interface previews. Demo login never grants access to backend data. */
let tenantDemoMemory = false;
function tenantDemoActive() {
  try { return sessionStorage.getItem('perhutani-tenant-demo')==='active'; }
  catch { return tenantDemoMemory; }
}
function setTenantDemo(active) {
  tenantDemoMemory=active;
  try {
    if(active)sessionStorage.setItem('perhutani-tenant-demo','active');
    else sessionStorage.removeItem('perhutani-tenant-demo');
  } catch { /* Preview remains usable when browser storage is disabled. */ }
}
function designNotice() {
  return `<div class="design-notice" role="note"><strong>${tenantDemoActive()?'Akun demo penyewa':'Pratinjau desain akun penyewa'}</strong><span>Login demo hanya untuk mencoba tampilan. Pengajuan dan dokumen nyata belum aktif. Jangan masukkan data pribadi.</span></div>`;
}
function previewNext() {
  const next = new URLSearchParams(location.search).get('next') || '';
  return /^\/rumah\/[a-f0-9]+$/.test(next) ? next : '';
}
function tenantAuth(register=false) {
  const next = previewNext(), query = next ? '?next='+encodeURIComponent(next) : '';
  shell(`<div class="container tenant-auth">${designNotice()}<div class="tenant-auth-layout"><section class="tenant-auth-intro"><img src="/assets/perhutani-forest-logo.png" alt="" width="86" height="86"><h1>${register?'Mulai dari akun Anda.':'Selamat datang kembali.'}</h1><p>Kelola pengajuan dan dokumen sewa dalam satu tempat.</p><ul><li>Ajukan survei tanpa mengunggah KTP.</li><li>Lengkapi berkas saat mengajukan sewa.</li><li>Pantau masa sewa dan riwayat perpanjangan.</li></ul><p class="tenant-auth-note">Jadwal survei dan kesepakatan sewa tetap dibahas bersama pengelola melalui WhatsApp.</p></section><section class="tenant-auth-form"><h2>${register?'Daftar penyewa':'Masuk penyewa'}</h2><p>${register?'KTP tidak diperlukan saat membuat akun.':'Katalog tetap bisa dijelajahi tanpa akun.'}</p><fieldset disabled>${register?'<div class="field"><label for="tenant-name">Nama lengkap</label><input id="tenant-name" autocomplete="off" placeholder="Nama sesuai identitas"></div><div class="field"><label for="tenant-phone">Nomor WhatsApp</label><input id="tenant-phone" placeholder="Nomor WhatsApp aktif"></div>':''}<div class="field"><label for="tenant-login">Identitas login</label><input id="tenant-login" autocomplete="off" placeholder="Metode login akan ditetapkan"></div><div class="field"><label for="tenant-password">Kata sandi</label><input id="tenant-password" type="password" autocomplete="off" placeholder="Belum tersedia pada pratinjau"></div><button class="btn" type="button">${register?'Buat akun':'Masuk'}</button></fieldset><p class="tenant-auth-switch">${register?'Sudah memiliki akun?':'Belum memiliki akun?'} <a href="/${register?'masuk':'daftar'}${query}">${register?'Masuk':'Daftar penyewa'}</a></p><a class="text-button" href="${next?'/akun/survei?aset='+next.split('/').pop():'/akun/profil'}">Lihat pratinjau ${next?'pengajuan survei':'area penyewa'}</a>${next?`<a class="muted small" href="${next}">Kembali ke detail aset</a>`:''}</section></div></div>`,register?'Daftar Penyewa':'Masuk Penyewa');

  if (!register) {
    const fieldset=$('.tenant-auth-form fieldset');
    fieldset.disabled=false;
    const form=document.createElement('form');
    form.id='tenant-demo-login';
    fieldset.before(form);
    form.append(fieldset);
    $('#tenant-login').placeholder='penyewa.demo';
    $('#tenant-login').required=true;
    $('#tenant-login').autocomplete='off';
    $('#tenant-password').placeholder='Kata sandi akun demo';
    $('#tenant-password').required=true;
    const submit=$('button',fieldset);
    submit.type='submit';submit.textContent='Masuk akun demo';
    const hint=document.createElement('div');
    hint.className='tenant-demo-credentials';
    hint.innerHTML='<strong>Akun untuk mencoba tampilan</strong><p>Username: <code>penyewa.demo</code><br>Kata sandi: <code>DemoPenyewa123!</code></p><button type="button" class="text-button" id="fill-demo">Isi akun demo</button>';
    form.before(hint);
    $('#fill-demo').onclick=()=>{$('#tenant-login').value='penyewa.demo';$('#tenant-password').value='DemoPenyewa123!';};
    const error=document.createElement('p');error.className='error';error.setAttribute('role','alert');error.hidden=true;form.append(error);
    form.onsubmit=event=>{
      event.preventDefault();
      if($('#tenant-login').value.trim()!=='penyewa.demo'||$('#tenant-password').value!=='DemoPenyewa123!') {
        error.hidden=false;error.textContent='Username atau kata sandi demo tidak sesuai.';return;
      }
      setTenantDemo(true);
      navigate(next?'/akun/survei?aset='+next.split('/').pop():'/akun/profil');
    };
  }
}
function tenantShell(content,title,active) {
  const links=[['profil','Profil & Dokumen'],['pengajuan','Pengajuan Saya'],['sewa','Sewa Saya']];
  shell(`<div class="container tenant-page">${designNotice()}<div class="tenant-layout"><aside class="tenant-sidebar"><p>Area penyewa</p><nav aria-label="Navigasi akun">${links.map(([key,label])=>`<a href="/akun/${key}" ${active===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav><a class="tenant-catalog-link" href="/rumah">Kembali ke katalog</a></aside><section class="tenant-content"><div class="page-head"><h1>${title}</h1></div>${content}</section></div></div>`,title);

  if (tenantDemoActive()) {
    const button=document.createElement('button');button.type='button';button.className='text-button tenant-demo-logout';button.textContent='Keluar akun demo';
    $('.tenant-sidebar').append(button);
    button.onclick=()=>{setTenantDemo(false);navigate('/masuk');};
  }
}
function tenantProfile() {
  tenantShell(`<div class="tenant-panel"><div class="panel-heading"><div><h2>Profil penyewa</h2><p>Identitas dan nomor WhatsApp untuk berkomunikasi dengan pengelola.</p></div></div><fieldset disabled class="form-grid"><div class="field"><label for="profile-name">Nama lengkap</label><input id="profile-name" placeholder="Belum ada akun aktif"></div><div class="field"><label for="profile-phone">Nomor WhatsApp</label><input id="profile-phone" placeholder="Belum ada akun aktif"></div></fieldset></div><div class="tenant-panel"><div class="panel-heading"><div><h2>Dokumen identitas</h2><p>KTP hanya diperlukan saat mengajukan sewa.</p></div><span class="document-status">Belum Diunggah</span></div><div class="document-item"><div class="document-symbol" aria-hidden="true">ID</div><div><h3>Kartu Tanda Penduduk</h3><p>KTP terverifikasi dapat digunakan kembali untuk perpanjangan selama data masih sesuai.</p></div><button class="btn secondary small" disabled>Unggah KTP</button></div><p class="document-privacy">Dokumen hanya dapat diakses pemilik akun dan admin. Format serta batas ukuran unggahan akan ditetapkan pengelola.</p></div>`,'Profil & Dokumen Saya','profil');

  if (tenantDemoActive()) {
    $('#profile-name').value='Penyewa Demo';
    $('#profile-phone').placeholder='Nomor WhatsApp belum diisi (demo)';
  }
}
function tenantApplications() {
  tenantShell(`<div class="tenant-tabs" role="group" aria-label="Jenis pengajuan">${['Semua','Survei','Baru sewa','Perpanjangan'].map((label,i)=>`<button type="button" class="${i===0?'is-selected':''}" data-application-tab="${label}">${label}</button>`).join('')}</div><div class="tenant-panel preview-empty"><div class="empty-symbol" aria-hidden="true">${glyph('location')}</div><h2 id="application-empty-title">Belum ada pengajuan</h2><p>Setelah akun dan layanan pengajuan aktif, nomor referensi serta tindakan berikutnya akan terlihat di sini.</p><a class="btn" href="/rumah">Jelajahi Aset</a></div><div class="tenant-help"><a class="text-button" href="/akun/pengajuan/pratinjau">Lihat pratinjau detail pengajuan</a><h3>Dokumen mengikuti tahap pengajuan</h3><p>Survei tidak memerlukan KTP. Permohonan baru sewa membutuhkan KTP dan surat permohonan. Perpanjangan menggunakan surat yang berbeda dan dapat memakai kembali KTP terverifikasi.</p></div>`,'Pengajuan Saya','pengajuan');
  $$('[data-application-tab]').forEach(button=>button.onclick=()=>{
    $$('[data-application-tab]').forEach(item=>item.classList.toggle('is-selected',item===button));
    $('#application-empty-title').textContent=button.dataset.applicationTab==='Semua'?'Belum ada pengajuan':'Belum ada pengajuan '+button.dataset.applicationTab.toLowerCase();
  });
}
function tenantLeases() {
  tenantShell(`<div class="tenant-panel preview-empty"><h2>Belum ada sewa aktif</h2><p>Aset, tanggal sewa, dan riwayat periode akan terlihat setelah pengajuan disetujui serta pelunasan dikonfirmasi admin.</p><a class="btn" href="/rumah">Jelajahi Aset</a></div><div class="tenant-panel"><h2>Perpanjangan sewa</h2><a class="text-button" href="/akun/perpanjangan">Lihat pratinjau permohonan perpanjangan</a><p>Perpanjangan diajukan dari sewa yang tercatat. Periode baru dan surat perpanjangan disimpan terpisah agar riwayat sebelumnya tetap tersedia.</p><div class="document-item"><div class="document-symbol" aria-hidden="true">↻</div><div><h3>Surat Permohonan Perpanjangan Sewa</h3><p>Pengelola menyiapkan surat. Anda mengunduh, menandatangani di luar website, lalu mengunggah hasilnya.</p></div><button class="btn secondary small" disabled>Ajukan Perpanjangan</button></div></div>`,'Sewa Saya','sewa');
}
function submissionDetailDesign() {
  tenantShell(`<a class="breadcrumb" href="/akun/pengajuan">Kembali ke pengajuan saya</a><div class="tenant-panel"><h2>Rincian pengajuan</h2><p>Belum ada pengajuan dipilih. Bagian ini memperlihatkan susunan informasi yang akan tersedia pada pengajuan milik penyewa.</p><dl class="request-facts"><div><dt>Nomor referensi</dt><dd>Belum diterbitkan</dd></div><div><dt>Aset terkait</dt><dd>Belum dipilih</dd></div><div><dt>Jenis pengajuan</dt><dd>Belum ditentukan</dd></div><div><dt>Keputusan admin</dt><dd>Belum ada keputusan</dd></div></dl></div><div class="tenant-panel"><h2>Dokumen pengajuan</h2><p>Surat yang ditampilkan mengikuti jenis pengajuan: baru sewa atau perpanjangan. Template resmi disediakan pengelola.</p><div class="document-item"><div class="document-symbol" aria-hidden="true">ID</div><div><h3>KTP penyewa</h3><p>Belum Diunggah. KTP diperlukan saat mengajukan sewa, bukan untuk survei.</p></div><a class="text-button" href="/akun/profil">Dokumen Saya</a></div><div class="document-item"><div class="document-symbol" aria-hidden="true">↓</div><div><h3>Surat siap tanda tangan</h3><p>Menunggu surat dari admin. Penandatanganan dilakukan di luar website.</p></div><button class="btn secondary small" disabled>Unduh surat</button></div><div class="document-item"><div class="document-symbol" aria-hidden="true">↑</div><div><h3>Surat yang sudah ditandatangani</h3><p>Belum Diunggah. Jika perlu perbaikan, alasan admin akan ditampilkan pada dokumen terkait.</p></div><button class="btn secondary small" disabled>Unggah hasil</button></div></div><div class="tenant-panel"><h2>Pembayaran dan tindak lanjut</h2><p>Belum ada konfirmasi pembayaran. Dokumen yang diterima tidak berarti permohonan disetujui atau pembayaran sudah lunas.</p><button class="btn" disabled>Lanjut ke WhatsApp</button><p class="small muted">Nomor referensi perlu tersimpan sebelum melanjutkan percakapan dengan pengelola.</p></div>`,'Detail Pengajuan','pengajuan');
}
function renewalDesign() {
  tenantShell(`<a class="breadcrumb" href="/akun/sewa">Kembali ke Sewa Saya</a><div class="tenant-panel"><h2>Ajukan perpanjangan</h2><p>Perpanjangan harus berasal dari sewa yang tercatat. Belum ada akun atau sewa aktif pada pratinjau ini.</p><fieldset disabled class="form-grid"><div class="field"><label for="renewal-lease">Sewa sebelumnya</label><select id="renewal-lease"><option>Belum ada sewa aktif</option></select></div><div class="field"><label for="renewal-period">Periode baru</label><select id="renewal-period"><option>Dibahas bersama pengelola</option></select></div></fieldset></div><div class="tenant-panel"><h2>Dokumen untuk perpanjangan</h2><div class="document-item"><div class="document-symbol" aria-hidden="true">ID</div><div><h3>Gunakan KTP terverifikasi</h3><p>KTP tidak perlu diunggah ulang jika identitas masih sesuai. Perubahan data atau permintaan perbaikan dari admin memerlukan pemeriksaan ulang.</p></div><a class="text-button" href="/akun/profil">Dokumen Saya</a></div><div class="document-item"><div><h3>Surat Permohonan Perpanjangan Sewa</h3><p>Admin menyiapkan surat perpanjangan yang berbeda dari surat baru sewa. Surat dan periode sebelumnya tetap tersimpan sebagai riwayat.</p></div></div><button class="btn" disabled>Simpan permohonan perpanjangan</button><p class="small muted">Pengajuan ini tidak otomatis memperpanjang sewa. Tanggal aktif diperbarui setelah persetujuan serta konfirmasi pembayaran oleh admin.</p></div>`,'Permohonan Perpanjangan','sewa');
}
async function surveyDesign() {
  const id=new URLSearchParams(location.search).get('aset');
  if (!/^[a-f0-9]+$/.test(id||'')) return tenantApplications();
  const house=await api('/api/houses/'+id);
  tenantShell(`<a class="breadcrumb" href="/rumah/${house.id}">Kembali ke detail aset</a><div class="tenant-panel survey-preview"><h2>Konfirmasi pengajuan survei</h2><div class="survey-property">${photo(house)}<div><h3>${esc(house.name)}</h3><p>${esc(house.code)} · ${esc(house.area)}</p>${badge(house.status)}</div></div><p>KTP tidak diperlukan untuk mengajukan survei. Setelah layanan aktif, nomor referensi disimpan terlebih dahulu sebelum Anda melanjutkan percakapan ke WhatsApp.</p><div class="notice">Ini pratinjau tampilan. Belum ada pengajuan atau nomor referensi yang dibuat.</div><button class="btn" disabled>${house.status==='Dipesan'?'Survei tidak tersedia untuk aset Dipesan':'Simpan pengajuan survei'}</button><p class="small muted">Jadwal perlu dikonfirmasi pengelola. Pengajuan survei tidak memesan aset atau mengubah status ketersediaannya.</p></div>`,'Pengajuan Survei','pengajuan');
}
function adminRequestsDesign() {
  adminShell(`<div class="design-notice"><strong>Rancangan pengajuan dan dokumen</strong><span>Modul ini belum terhubung ke akun penyewa atau penyimpanan privat.</span></div><section class="admin-section"><div class="section-heading"><div><h2>Pengajuan masuk</h2><p>Survei, permohonan baru sewa, dan perpanjangan.</p></div></div><div class="form-grid"><div class="field"><label for="request-type">Jenis pengajuan</label><select id="request-type"><option>Semua jenis</option><option>Survei</option><option>Baru sewa</option><option>Perpanjangan</option></select></div><div class="field"><label for="request-status">Status pengajuan</label><select id="request-status"><option>Semua status</option><option>Diproses</option><option>Perlu perbaikan</option><option>Disetujui</option><option>Ditolak</option></select></div></div>${empty('Belum ada pengajuan tersimpan','Pengajuan akan ditampilkan setelah layanan akun penyewa aktif.')}</section><section class="admin-section"><h2>Template permohonan</h2><p>Gunakan dua template resmi dari pengelola. Surat perjanjian dan tanda tangan digital tidak termasuk layanan ini.</p><div class="document-item"><div><h3>Surat Permohonan Baru Sewa</h3><p>Template resmi belum tersedia.</p></div><button class="btn secondary small" disabled>Unggah template</button></div><div class="document-item"><div><h3>Surat Permohonan Perpanjangan Sewa</h3><p>Template resmi belum tersedia.</p></div><button class="btn secondary small" disabled>Unggah template</button></div></section><section class="admin-section"><h2>Pemeriksaan terpisah</h2><div class="verification-grid"><div><h3>Dokumen</h3><p>Belum Diunggah, Menunggu Verifikasi, Terverifikasi untuk KTP atau Diterima untuk surat, serta Perlu Perbaikan dengan alasan.</p></div><div><h3>Pengajuan</h3><p>Keputusan permohonan ditinjau manual dan terpisah dari kelengkapan berkas.</p></div><div><h3>Pembayaran</h3><p>DP dan pelunasan dikonfirmasi admin setelah pemeriksaan di luar website.</p></div></div></section>`,'Kelola Pengajuan & Dokumen');
}

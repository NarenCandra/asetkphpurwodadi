'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = amount => new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR',maximumFractionDigits:0}).format(amount);
const periodName = p => p === 'monthly' ? 'bulan' : 'tahun';
const state = {config:null, session:{authenticated:false}, houses:[], adminHouses:[], filters:{area:'',period:'',min:null,max:null,sort:''}};
let navigationId = 0;
let toastTimer;
let cleanNavigation = () => {};
let cleanHero = () => {};
let pageTransition = null;
let pageEntrance = null;
let pageRequest = 0;
const icon = '<span class="brand-icon" aria-hidden="true"><img src="/assets/perhutani-forest-logo.png" alt="" width="32" height="32"></span>';
function glyph(name) {
  const paths = {
    location:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    bed:'<path d="M3 18v3m18-3v3M3 18h18v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Zm2-8V5h14v5M12 5v5"/>',
    bath:'<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Zm3 8v2m12-2v2M6 12V5a3 3 0 0 1 6 0v1h-3"/>',
  };
  return `<svg class="glyph" aria-hidden="true" viewBox="0 0 24 24">${paths[name]||''}</svg>`;
}

let demoDataPromise;
async function api(path, options={}) {
  if (window.SEWARUMA_STATIC_DEMO) {
    if (options.method && options.method !== 'GET') throw new Error('Perubahan data tidak tersedia pada demo.');
    if (!demoDataPromise) {
      demoDataPromise = fetch('/demo-data.json').then(response=>{
        if (!response.ok) throw new Error('Data demonstrasi belum tersedia.');
        return response.json();
      }).catch(error=>{demoDataPromise=null;throw error;});
    }
    const demo = await demoDataPromise;
    if (path==='/api/config') return demo.config;
    if (path==='/api/houses') return demo.houses;
    if (/^\/api\/houses\/[a-f0-9]+$/.test(path)) {
      const house = demo.houses.find(h=>h.id===path.split('/').pop());
      if (!house) throw new Error('Properti tidak tersedia');
      return house;
    }
    throw new Error('Fitur ini membutuhkan backend aktif.');
  }
  const response = await fetch(path, {...options, headers:{'Content-Type':'application/json',...(state.session.csrf ? {'X-CSRF-Token':state.session.csrf}:{}),...options.headers}});
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/login') state.session = {authenticated:false};
    throw new Error(data.error || 'Permintaan gagal. Coba kembali.');
  }
  return data;
}
function toast(message) {
  $('#toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 4500);
}
function badge(status) {
  return `<span class="badge ${status==='Dipesan'?'reserved':status==='Tersewa'?'rented':status==='Draft'?'draft':''}">${esc(status)}</span>`;
}
function noticeBadge(notice) {
  return notice ? `<span class="badge ${notice==='Perlu ditinjau'?'overdue':'attention'}">${esc(notice)}</span>` : '';
}
function photo(house, index=0, eager=false) {
  return house.photos?.[index] ? `<img src="${esc(house.photos[index].url)}" alt="${esc(house.name)}${index ? ', foto '+(index+1) : ''}" ${eager?'fetchpriority="high"':'loading="lazy"'}>` : '<div class="placeholder">Foto belum ditambahkan</div>';
}
function selected(value, expected) {return value === expected ? ' selected' : '';}
function priceLabel(house, period) {
  const p = period || (house.monthly ? 'monthly' : 'yearly');
  return house[p] ? `<div class="price">${money(house[p].price)}<small>per ${periodName(p)}</small></div>` : '<span class="muted">Harga belum diisi</span>';
}
function assetSpecs(house) {
  return `<div><strong>${house.asset_type==='land'?'Tanah kosong':'Bangunan'}</strong><span>Jenis aset</span></div><div><strong>${house.land_size} m²</strong><span>Luas tanah</span></div>${house.asset_type==='land'?'':`<div><strong>${house.building_size} m²</strong><span>Luas bangunan</span></div>`}`;
}
function card(house, period='') {
  return `<article class="house-card"><div class="card-photo"><a href="/rumah/${house.id}" aria-label="Lihat ${esc(house.name)}">${photo(house)}</a>${badge(house.status)}</div><div class="card-body"><p class="card-area">${glyph('location')}${esc(house.area)}</p><h3><a href="/rumah/${house.id}">${esc(house.name)}</a></h3><div class="card-code">${esc(house.code)}${house.demo?' · Data contoh':''}</div><div class="card-specs"><span>${house.asset_type==='land'?'Tanah kosong':'Bangunan'}</span><span>${house.land_size} m² tanah</span>${house.asset_type==='land'?'':`<span>${house.building_size} m² bangunan</span>`}</div><div class="card-bottom">${priceLabel(house,period)}<a href="/rumah/${house.id}">Lihat Detail</a></div></div></article>`;
}
function empty(title, description, action='') {return `<div class="empty"><h3>${title}</h3><p>${description}</p>${action}</div>`;}
function whatsapp(house=null) {
  if (!state.config.whatsapp) return null;
  const message = house ? `Halo, saya tertarik dengan ${house.name} (${house.code}) yang saya lihat di ${location.origin}/rumah/${house.id}. Saya ingin menanyakan ketersediaan dan menjadwalkan survei.` : 'Halo, saya ingin menanyakan informasi sewa aset.';
  return `https://wa.me/${state.config.whatsapp}?text=${encodeURIComponent(message)}`;
}
function shell(content, title='Sewa aset') {
  // Keep the error page usable without treating failed configuration as loaded.
  const businessName = state.config?.name || 'Sewa Aset Perhutani KPH Purwodadi';
  cleanNavigation();
  cleanHero();
  cleanHero = () => {};
  document.title = `${title} | ${businessName}`;
  const path = location.pathname;
  document.body.dataset.view = path.startsWith('/admin') ? 'admin' : path==='/' ? 'home' : 'public';
  $('#app').innerHTML = `<header class="site-header"><div class="container header-inner"><a class="brand" href="/">${icon}<span class="header-logo-text">${esc(businessName)}</span></a><button class="menu-toggle" aria-expanded="false" aria-controls="nav">Menu</button><nav class="nav" id="nav" aria-label="Navigasi utama"><a href="/" ${path==='/'?'aria-current="page"':''}>Beranda</a><a href="/rumah" ${path.startsWith('/rumah')?'aria-current="page"':''}>Daftar Aset</a><a href="/tentang" ${path==='/tentang'?'aria-current="page"':''}>Tentang & Kontak</a>${path.startsWith('/admin')?'<a href="/admin">Kelola Aset</a>':''}</nav></div></header><main id="main" tabindex="-1">${content}</main><footer class="site-footer"><div class="container footer-inner"><div><a class="brand" href="/">${icon}<span>${esc(businessName)}</span></a></div><div class="footer-links"><a href="/rumah">Daftar Aset</a><a href="/tentang">Kontak</a><a href="/admin">Kelola Aset</a></div></div></footer>`;
  if (businessName.toLowerCase()==='sewaruma') {
    $$('.brand').forEach(brand => {
      brand.setAttribute('aria-label', businessName);
      brand.lastElementChild.innerHTML = '<span class="brand-sewa">Sewa</span><span class="brand-ruma">ruma</span>';
    });
  }
  if (businessName==='Sewa Aset Perhutani KPH Purwodadi') {
    $$('.brand').forEach(brand=>{
      brand.setAttribute('aria-label', businessName);
      brand.classList.add('brand-organization');
      brand.lastElementChild.innerHTML = '<span class="organization-name">Sewa Aset Perhutani</span><span class="organization-unit">KPH Purwodadi</span>';
    });
  }
  const toggle = $('.menu-toggle'), nav = $('#nav');
  toggle.type = 'button';
  toggle.innerHTML = '<span class="nav-toggle-icon" aria-hidden="true"><span></span><span></span><span></span></span><span>Menu</span>';
  const setMenu = (open, restoreFocus = false) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Tutup menu navigasi' : 'Buka menu navigasi');
    nav.classList.toggle('open', open);
    if (restoreFocus) toggle.focus();
  };
  setMenu(false);
  if (path.startsWith('/admin')) $('a[href="/admin"]', nav)?.setAttribute('aria-current', 'page');
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  const outsideClick = event => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) setMenu(false);
  };
  const onKey = event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setMenu(false, true);
  };
  const onFocus = event => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) setMenu(false);
  };
  const desktop = matchMedia('(min-width: 721px)');
  const onResize = () => setMenu(false);
  const header = $('.site-header');
  const onScroll = () => {
    const scrolled = header.classList.contains('is-scrolled');
    header.classList.toggle('is-scrolled', scrolled ? window.scrollY > 8 : window.scrollY > 32);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, {passive:true});
  document.addEventListener('click', outsideClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('focusin', onFocus);
  desktop.addEventListener('change', onResize);
  cleanNavigation = () => {
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('click', outsideClick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('focusin', onFocus);
    desktop.removeEventListener('change', onResize);
  };
}
function landing() {
  const available = state.houses.filter(h => h.status==='Tersedia');
  const hero = available.find(h => h.photos.length) || state.houses.find(h => h.photos.length);
  shell(`<div class="container hero"><div class="hero-copy"><h1>Temukan Bangunan dan Tanah Sesuai Kebutuhan Anda</h1><p>Jelajahi pilihan bangunan dan tanah kosong yang disewakan oleh Opset Perhutani KPH Purwodadi.</p><a class="btn" href="/rumah">Jelajahi Aset</a></div><div class="hero-visual">${hero?photo(hero,0,true):'<div class="placeholder">Foto utama akan tampil setelah aset dipublikasikan.</div>'}</div></div>`, 'Beranda');
  $('.site-footer').remove();
  const slideshowHouses = available.some(h=>h.photos.length) ? available : state.houses;
  const slides = slideshowHouses.flatMap(h=>h.photos.slice(0,1).map(p=>({url:p.url,alt:h.name})));
  if (slides.length===1 && hero) slides.push(...hero.photos.slice(1).map(p=>({url:p.url,alt:hero.name})));
  startHeroSlideshow(slides);
}
function startHeroSlideshow(slides) {
  slides = slides.slice(0,5);
  if (slides.length<2) return;
  const hero=$('.hero'), visual=$('.hero-visual'), first=$('img',visual);
  if (!first) return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const second=new Image();
  first.classList.add('hero-slide','is-active');
  second.className='hero-slide';
  second.alt='';
  second.decoding='async';
  visual.append(second);
  let timer, cancelled=false, visible=true, index=0, active=first;
  const canPlay=()=>!cancelled&&!document.hidden&&visible&&!motion.matches;
  const schedule=()=>{clearTimeout(timer);if(canPlay())timer=setTimeout(advance,6000);};
  async function advance() {
    if (!canPlay()) return;
    const nextIndex=(index+1)%slides.length;
    const next=active===first?second:first;
    next.src=slides[nextIndex].url;
    next.alt=slides[nextIndex].alt;
    try {await next.decode();} catch {schedule();return;}
    if(!canPlay()) {schedule();return;}
    next.classList.add('is-active');active.classList.remove('is-active');
    active=next;index=nextIndex;schedule();
  }
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();});
  observer.observe(hero);
  document.addEventListener('visibilitychange',schedule);
  motion.addEventListener('change',schedule);
  schedule();
  cleanHero=()=>{cancelled=true;clearTimeout(timer);observer.disconnect();document.removeEventListener('visibilitychange',schedule);motion.removeEventListener('change',schedule);};
}
function priceBounds(period) {
  const prices = state.houses.filter(h=>h[period]).map(h=>h[period].price);
  return prices.length ? [Math.min(...prices),Math.max(...prices)] : [0,0];
}
function catalog() {
  const f = state.filters;
  const [lower,upper] = priceBounds(f.period);
  if (f.min===null) f.min=lower;
  if (f.max===null) f.max=upper;
  const areas = [...new Set(state.houses.map(h=>h.area))].sort();
  shell(`<div class="container"><div class="page-head"><h1>Daftar Aset</h1><p>Temukan pilihan berdasarkan kawasan, periode, dan anggaran Anda.</p></div><div class="catalog-layout"><aside class="filters" aria-label="Filter aset"><section class="filter-box"><h2>Pilihan aset</h2><div class="filter-fields"><div class="field"><label for="area">Kawasan</label><select id="area"><option value="">Semua kawasan</option>${areas.map(a=>`<option${selected(f.area,a)}>${esc(a)}</option>`).join('')}</select></div><div class="field"><label for="period">Periode sewa</label><select id="period"><option value="">Pilih periode</option><option value="monthly"${selected(f.period,'monthly')}>Bulanan</option><option value="yearly"${selected(f.period,'yearly')}>Tahunan</option></select></div></div></section><section class="filter-box"><h2>Rentang harga</h2><div class="small muted" id="price-unit">${f.period?'Harga per '+periodName(f.period):'Pilih periode terlebih dahulu'}</div><div class="range-track"><input type="range" id="price-min" aria-label="Harga minimum" min="${lower}" max="${upper}" step="1" value="${f.min}" ${!f.period||lower===upper?'disabled':''}><input type="range" id="price-max" aria-label="Harga maksimum" min="${lower}" max="${upper}" step="1" value="${f.max}" ${!f.period||lower===upper?'disabled':''}></div><div class="range-values"><span>Minimum<strong id="min-value">${f.period?money(f.min):'—'}</strong></span><span>Maksimum<strong id="max-value">${f.period?money(f.max):'—'}</strong></span></div><p class="range-note">${!f.period?'Slider aktif setelah periode dipilih.':lower===upper?'Hanya satu harga tersedia untuk periode ini.':'Geser kedua titik untuk menyesuaikan anggaran.'}</p></section><button id="reset-filters" class="text-button">Hapus filter</button></aside><section aria-label="Hasil pencarian"><div class="results-bar"><p id="result-count" aria-live="polite"></p><label><span class="small">Urutkan </span><select class="sort-select" id="sort" aria-label="Urutkan harga" ${!f.period?'disabled':''}><option value="">Rekomendasi</option><option value="asc"${selected(f.sort,'asc')}>Harga terendah</option><option value="desc"${selected(f.sort,'desc')}>Harga tertinggi</option></select></label></div><div class="grid catalog-grid" id="results"></div></section></div></div>`, 'Daftar Aset');
  const selection = document.createElement('span');
  selection.className = 'range-selection';
  selection.setAttribute('aria-hidden', 'true');
  $('.range-track').prepend(selection);
  $('#area').addEventListener('change', e=>{f.area=e.target.value;updateResults();});
  $('#period').addEventListener('change', e=>{f.period=e.target.value; f.min=null; f.max=null; f.sort=''; catalog();});
  $('#sort').addEventListener('change', e=>{f.sort=e.target.value;updateResults();});
  for (const which of ['min','max']) $('#price-'+which).addEventListener('input', e=>{
    const value = Number(e.target.value);
    f[which] = which==='min' ? Math.min(value,f.max) : Math.max(value,f.min);
    e.target.value=f[which]; updateResults();
  });
  $('#reset-filters').addEventListener('click', resetFilters);
  updateResults();
}
function resetFilters() {state.filters={area:'',period:'',min:null,max:null,sort:''};catalog();}
function updateResults() {
  const f = state.filters;
  const [lower, upper] = priceBounds(f.period);
  const span = upper - lower;
  const hasAreas = state.houses.some(h=>h.area);
  const periods = ['monthly','yearly'].filter(period=>state.houses.some(h=>h[period]));
  $('#area').closest('.field').hidden = !hasAreas;
  $('#period').closest('.field').hidden = !periods.length;
  for (const option of $('#period').options) {
    if (option.value) option.hidden = !periods.includes(option.value);
  }
  $('.filter-fields').closest('.filter-box').hidden = !hasAreas && !periods.length;
  $('#price-min').closest('.filter-box').hidden = !f.period || span<=0;
  $('#sort').closest('label').hidden = !f.period || span<=0;
  $('#reset-filters').hidden = !(f.area || f.period);
  $('.filters').hidden = !hasAreas && !periods.length;
  $('.catalog-layout').classList.toggle('without-filters', !hasAreas && !periods.length);
  const track = $('.range-track');
  track.classList.toggle('is-disabled', !f.period);
  track.style.setProperty('--range-left', `${span ? (f.min-lower)/span*100 : 0}%`);
  track.style.setProperty('--range-right', `${span ? (upper-f.max)/span*100 : 0}%`);
  $('#price-min').classList.toggle('overlap-thumb', f.min===f.max && f.min>lower);
  let houses=state.houses.filter(h=>(!f.area||h.area===f.area)&&(!f.period||(h[f.period]&&h[f.period].price>=f.min&&h[f.period].price<=f.max)));
  houses.sort((a,b)=> (a.status==='Dipesan')-(b.status==='Dipesan') || (f.sort ? (a[f.period].price-b[f.period].price)*(f.sort==='asc'?1:-1) : a.name.localeCompare(b.name)));
  $('#result-count').textContent=`${houses.length} aset ditemukan`;
  $('#results').innerHTML=houses.map(h=>card(h,f.period)).join('') || empty('Belum ada aset yang sesuai','Coba perluas rentang harga atau hapus filter pencarian.','<button class="btn secondary" id="empty-reset">Hapus filter</button>');
  if ($('#empty-reset')) $('#empty-reset').onclick=resetFilters;
  for (const which of ['min','max']) {
    $('#'+which+'-value').textContent=f.period?money(f[which]):'—';
    $('#price-'+which).setAttribute('aria-valuetext', f.period?`${money(f[which])} per ${periodName(f.period)}`:'Pilih periode terlebih dahulu');
  }
}
function detail(house) {
  const chat = whatsapp(house);
  const canChat = house.status==='Tersedia'&&chat;
  shell(`<div class="container"><div class="breadcrumb"><a href="/rumah">Daftar Aset</a> / ${esc(house.name)}</div><div class="gallery">${house.photos.slice(0,3).map((p,i)=>`<button data-gallery="${i}" aria-label="Buka galeri foto ${i+1}">${photo(house,i,i===0)}</button>`).join('')||'<div class="placeholder">Foto belum tersedia</div>'}</div>${house.photos.length>3?`<button id="all-photos" class="text-button">Lihat ${house.photos.length} foto</button>`:''}<div class="detail-layout"><div>${badge(house.status)}<h1>${esc(house.name)}</h1><p class="muted">${esc(house.code)} · ${esc(house.area)}</p>${house.demo?'<div class="notice">Data dan foto demonstrasi. Bukan penawaran aset sebenarnya.</div>':''}<div class="spec-grid">${assetSpecs(house)}</div>${house.asset_type==='land'?`<section class="detail-block"><h2>Akses dan kondisi lahan</h2><p>${esc(house.access)||'Informasi akses dibahas saat survei.'}</p><p>${esc(house.land_condition)||'Kondisi lahan dikonfirmasi saat survei.'}</p></section>`:''}<section class="detail-block"><h2>Tentang aset</h2><p>${esc(house.description)}</p></section><section class="detail-block"><h2>Fasilitas</h2><div class="amenities">${house.amenities.map(a=>`<span>${esc(a)}</span>`).join('')||'<p>Belum ada informasi fasilitas.</p>'}</div></section><section class="detail-block"><h2>Lokasi aset</h2><p>${esc(house.address)}</p>${house.maps_url?`<a href="${esc(house.maps_url)}" target="_blank" rel="noopener noreferrer">Buka Google Maps</a>`:''}</section><section class="detail-block"><h2>Ketentuan sewa</h2><p>${esc(house.terms)||'Ketentuan dibahas bersama pengelola.'}</p><p>Survei wajib sebelum kesepakatan sewa. Nominal DP, tenggat pelunasan, dan aturan pengembalian disepakati melalui WhatsApp sebelum pembayaran.</p><h3>Biaya tambahan</h3><p>${esc(house.extra_costs)||'Konfirmasikan biaya tambahan kepada pengelola.'}</p></section></div><aside class="offer-panel"><h2>Pilihan sewa</h2>${['monthly','yearly'].filter(p=>house[p]).map(p=>`<div class="offer">${priceLabel(house,p)}<p>Minimum sewa ${house[p].minimum} ${periodName(p)}</p></div>`).join('')}<p class="small">Harga dapat dinegosiasikan melalui WhatsApp.</p>${canChat?`<a class="btn" href="${esc(chat)}" target="_blank" rel="noopener noreferrer">Jadwalkan Survei via WhatsApp</a>`:`<button class="btn" disabled>Jadwalkan Survei via WhatsApp</button>`}<p class="small">${house.status==='Dipesan'?'Aset sedang dipesan. Pengajuan survei dinonaktifkan.':!chat?'Nomor WhatsApp pengelola belum dikonfigurasi.':'Jadwal survei perlu dikonfirmasi pengelola melalui percakapan. Membuka chat belum berarti aset dipesan.'}</p>${house.status==='Dipesan'?'<a class="small" href="/tentang">Kontak umum pengelola</a>':''}</aside></div></div><dialog class="modal" id="gallery-modal"><div id="gallery-image"></div><div class="modal-bar"><button class="btn secondary small" id="photo-prev">Sebelumnya</button><p id="photo-counter"></p><button class="btn secondary small" id="photo-next">Berikutnya</button><button class="text-button" id="photo-close">Tutup</button></div></dialog>`,house.name);
  let current=0;
  $('#gallery-modal').setAttribute('aria-label', `Galeri foto ${house.name}`);
  const showPhoto = i=>{current=(i+house.photos.length)%house.photos.length;$('#gallery-image').innerHTML=photo(house,current,true);$('#photo-counter').textContent=`${current+1} / ${house.photos.length}`;};
  $$('[data-gallery]').forEach(b=>b.onclick=()=>{showPhoto(Number(b.dataset.gallery));$('#gallery-modal').showModal();});
  if ($('#all-photos')) $('#all-photos').onclick=()=>{showPhoto(0);$('#gallery-modal').showModal();};
  $('#photo-close').onclick=()=>$('#gallery-modal').close();
  $('#photo-prev').onclick=()=>showPhoto(current-1);$('#photo-next').onclick=()=>showPhoto(current+1);
  $('#gallery-modal').addEventListener('keydown', event => {
    if (event.key==='ArrowLeft' || event.key==='ArrowRight') {
      event.preventDefault();showPhoto(current+(event.key==='ArrowLeft'?-1:1));
    }
  });
}
function about() {
  const c=state.config, chat=whatsapp();
  shell(`<div class="container"><div class="page-head"><h1>Tentang & Kontak</h1><p>Kenali pengelola dan bicarakan kebutuhan aset Anda.</p></div><div class="contact-grid"><section><h2>${esc(c.name)}</h2><p>${esc(c.profile)}</p><p class="muted">Informasi aset dan kesesuaian kebutuhan dapat dibahas langsung dengan pengelola. Lakukan survei sebelum menyepakati penyewaan.</p></section><section class="contact-panel"><h2>Hubungi pengelola</h2><div class="contact-row"><strong>Kawasan layanan</strong><p>${esc(c.areas)}</p></div><div class="contact-row"><strong>Jam layanan</strong><p>${esc(c.hours)}</p></div><div class="contact-row"><strong>WhatsApp</strong><p>${c.whatsapp?'+'+esc(c.whatsapp):'Nomor pengelola belum dikonfigurasi.'}</p></div>${chat?`<a class="btn" href="${esc(chat)}" target="_blank" rel="noopener noreferrer">Hubungi via WhatsApp</a>`:'<button class="btn" disabled>Hubungi via WhatsApp</button>'}</section></div></div>`,'Tentang & Kontak');
  if (!c.whatsapp) $('.contact-row:last-of-type p').textContent = c.whatsapp_display;
}
function login() {
  shell(`<div class="login-wrap"><h1>Login Admin</h1><p class="muted">Masuk untuk mengelola aset dan masa sewa.</p><form class="login-form" id="login-form"><div class="error form-error" id="login-error" role="alert"></div><div class="field"><label for="username">Nama pengguna</label><input id="username" name="username" autocomplete="username" required></div><div class="field"><label for="password">Kata sandi</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button class="btn" type="submit">Masuk</button><p class="small muted">Akses khusus satu akun pengelola.</p></form></div>`,'Login Admin');
  const loginWrap = $('.login-wrap');
  const scene = document.createElement('div');
  scene.className = 'login-scene';
  loginWrap.before(scene);
  scene.innerHTML = '<div class="login-art" aria-hidden="true"><img src="/assets/login-house.svg" alt=""><span class="login-art-caption">Sewa Aset Perhutani<br>KPH Purwodadi</span></div>';
  scene.append(loginWrap);
  $('#login-form').onsubmit=async e=>{
    e.preventDefault();const button=$('button',e.target);button.disabled=true;
    try {state.session=await api('/api/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});navigate('/admin');}
    catch(error){$('#login-error').textContent=error.message;button.disabled=false;}
  };
}
function adminShell(content,title,actions='') {
  shell(`<div class="container admin-bottom"><div class="admin-top"><div><h1>${title}</h1><p class="muted small">Panel pengelola</p></div><div class="admin-actions">${actions}<button class="btn secondary small" id="logout">Keluar</button></div></div><nav class="admin-nav" aria-label="Navigasi admin"><a href="/admin" ${location.pathname==='/admin'?'aria-current="page"':''}>Beranda Admin</a><a href="/admin/rumah" ${location.pathname.startsWith('/admin/rumah')?'aria-current="page"':''}>Kelola Aset</a></nav>${content}</div>`,title);
  $('#logout').onclick=async()=>{try{await api('/api/logout',{method:'POST',body:'{}'});state.session={authenticated:false};navigate('/admin');}catch(error){toast(error.message);}};
}
function adminTable(houses) {
  return houses.length?`<div class="table-wrap"><table role="table"><caption class="sr-only">Daftar rumah yang dikelola</caption><thead role="rowgroup"><tr role="row"><th scope="col">Rumah</th><th scope="col">Kawasan</th><th scope="col">Status</th><th scope="col">Tindakan</th></tr></thead><tbody role="rowgroup">${houses.map(h=>`<tr role="row"><td role="cell"><div class="table-house">${h.photos.length?photo(h):''}<div><strong>${esc(h.name)}</strong><small>${esc(h.code)}</small></div></div></td><td role="cell" data-label="Kawasan">${esc(h.area)||'Belum diisi'}</td><td role="cell" data-label="Status">${badge(h.status)} ${noticeBadge(h.notice)}</td><td role="cell"><a class="nowrap" href="/admin/rumah/${h.id}">Edit Aset</a></td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada rumah','Tambahkan aset baru atau ubah filter daftar.');
}
function dashboard() {
  const houses=state.adminHouses, attention=houses.filter(h=>h.notice);
  adminShell(`<div class="stats">${['Tersedia','Dipesan','Tersewa','Draft'].map(s=>`<a class="stat" href="/admin/rumah?status=${encodeURIComponent(s)}"><span>${s}</span><strong>${houses.filter(h=>h.status===s).length}</strong></a>`).join('')}</div><section class="admin-section"><h2>Perlu Perhatian</h2><p class="muted small">Penanda mengikuti tanggal kalender ${esc(state.config.timezone)}. Status tetap dikelola manual.</p>${attention.length?attention.map(h=>`<div class="attention-row"><div><strong>${esc(h.name)} (${esc(h.code)})</strong><p>Sewa ${periodName(h.lease_period)}an · berakhir ${esc(h.lease_end)}</p>${noticeBadge(h.notice)}</div><a class="btn secondary small" href="/admin/rumah/${h.id}#lease">Kelola Masa Sewa</a></div>`).join(''):empty('Tidak ada masa sewa yang perlu perhatian','Penanda akan muncul menjelang atau setelah tanggal akhir sewa.')}</section><section class="admin-section"><div class="section-heading"><h2>Aset Anda</h2><a href="/admin/rumah">Lihat Semua</a></div>${adminTable(houses.slice(0,5))}</section>`,'Beranda Admin','<a class="btn small" href="/admin/rumah/baru">Tambah Aset</a><a class="btn secondary small" href="/admin/rumah">Kelola Aset</a>');
}
function manage() {
  const status=new URLSearchParams(location.search).get('status')||'';
  adminShell(`<div class="admin-filter"><div class="field"><label for="admin-search">Cari nama atau kode aset</label><input id="admin-search" type="search" placeholder="Nama atau kode aset"></div><div class="field"><label for="admin-status">Status</label><select id="admin-status"><option value="">Semua status</option>${['Draft','Tersedia','Dipesan','Tersewa'].map(s=>`<option${selected(status,s)}>${s}</option>`).join('')}</select></div></div><p class="small muted" id="admin-count" aria-live="polite"></p><div id="admin-table"></div>`,'Kelola Aset','<a class="btn small" href="/admin/rumah/baru">Tambah Aset</a>');
  const update=()=>{
    const query=$('#admin-search').value.toLocaleLowerCase(); const selectedStatus=$('#admin-status').value;
    const houses=state.adminHouses.filter(h=>(!selectedStatus||h.status===selectedStatus)&&`${h.name} ${h.code}`.toLocaleLowerCase().includes(query));
    $('#admin-count').textContent=`${houses.length} rumah`;$('#admin-table').innerHTML=adminTable(houses);
    history.replaceState({},'', '/admin/rumah'+(selectedStatus?'?status='+encodeURIComponent(selectedStatus):''));
  };
  $('#admin-search').oninput=update;$('#admin-status').onchange=update;update();
}
function field(name,label,value='',type='text',required=false,full=false) {
  return `<div class="field${full?' full':''}"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${type==='number'?'min="0" step="1"':''}></div>`;
}
function textarea(name,label,value='') {return `<div class="field full"><label for="${name}">${label}</label><textarea id="${name}" name="${name}">${esc(value)}</textarea></div>`;}
async function confirmStatus(oldStatus,newStatus) {
  const descriptions={
    Tersedia:'Aset akan ditawarkan kepada publik. Pastikan aset siap dan pembatalan atau masa sewa sebelumnya sudah diselesaikan.',
    Dipesan:'Pastikan DP telah Anda verifikasi. Aset tetap terlihat, sementara pengajuan survei akan dinonaktifkan.',
    Tersewa:'Pastikan pelunasan telah Anda verifikasi dan tanggal masa sewa sudah benar. Aset akan disembunyikan dari publik.',
    Draft:'Aset beserta fotonya akan ditarik dari akses publik. Data tetap tersimpan.'
  };
  const dialog=document.createElement('dialog');dialog.className='modal confirm-modal';
  dialog.innerHTML=`<h2>Ubah status ke ${newStatus}?</h2><p>${descriptions[newStatus]}</p><div class="admin-actions"><button class="btn secondary" id="cancel-status">Batal</button><button class="btn" id="confirm-status">Ya, saya konfirmasi</button></div>`;
  document.body.append(dialog);
  return new Promise(resolve=>{let result=false;$('#cancel-status',dialog).onclick=()=>dialog.close();$('#confirm-status',dialog).onclick=()=>{result=true;dialog.close();};dialog.onclose=()=>{dialog.remove();resolve(result);};dialog.showModal();});
}
function editor(house=null) {
  const isNew=!house;
  const h=house||{name:'',code:'',status:'Draft',photos:[],amenities:[],monthly:null,yearly:null};
  const transitions={Draft:['Draft','Tersedia'],Tersedia:['Tersedia','Dipesan','Draft'],Dipesan:['Dipesan','Tersewa','Tersedia','Draft'],Tersewa:['Tersewa','Tersedia','Draft']};
  adminShell(`<form id="house-form"><div class="error form-error" id="save-error" role="alert"></div>${h.demo?'<div class="notice">Aset demonstrasi. Ganti seluruh konten dan foto sebelum digunakan sebagai penawaran nyata.</div>':''}<div class="edit-layout"><div><section class="form-section"><h2>Identitas dan lokasi</h2><div class="form-grid"><div class="field"><label for="asset_type">Jenis aset</label><select id="asset_type"><option value="building"${selected(h.asset_type||'building','building')}>Bangunan</option><option value="land"${selected(h.asset_type,'land')}>Tanah kosong</option></select></div>${field('name','Nama aset',h.name,'text',true)}${field('code','Kode unik',h.code,'text',true)}${textarea('description','Deskripsi',h.description)}${field('area','Kawasan',h.area)}${field('maps_url','Tautan Google Maps (HTTPS)',h.maps_url,'url')}${textarea('address','Alamat lengkap',h.address)}</div></section><section class="form-section"><h2>Spesifikasi dan fasilitas</h2><div class="form-grid">${field('land_size','Luas tanah (m²)',h.land_size||0,'number')}${field('building_size','Luas bangunan (m²)',h.building_size||0,'number')}${textarea('access','Akses menuju aset',h.access)}${textarea('land_condition','Kondisi lahan',h.land_condition)}${textarea('amenities','Fasilitas (satu per baris)',h.amenities.join('\n'))}</div></section><section class="form-section"><h2>Foto aset</h2><div id="photo-manager">${isNew?'<p class="muted">Simpan Draft terlebih dahulu untuk mengunggah foto.</p>':photoManager(h)}</div></section><section class="form-section"><h2>Harga dan periode</h2><p class="small muted">Harga bulanan dan tahunan ditentukan secara terpisah.</p>${['monthly','yearly'].map(p=>`<fieldset><legend>Sewa ${p==='monthly'?'bulanan':'tahunan'}</legend><label class="checkbox-label"><input type="checkbox" id="${p}-enabled" ${h[p]?'checked':''}>Tawarkan periode ${p==='monthly'?'bulanan':'tahunan'}</label><div class="form-grid">${field(p+'-price','Harga per '+periodName(p)+' (Rp)',h[p]?.price||'','number')}${field(p+'-minimum','Minimum sewa ('+periodName(p)+')',h[p]?.minimum||1,'number')}</div></fieldset>`).join('')}</section><section class="form-section"><h2>Ketentuan</h2>${textarea('terms','Ketentuan aset',h.terms)}${textarea('extra_costs','Biaya tambahan',h.extra_costs)}</section></div><aside class="edit-side"><section class="form-section"><h2>Status penayangan</h2><div class="field"><label for="status">Status aset</label><select id="status">${(isNew?['Draft']:transitions[h.status]).map(s=>`<option${selected(h.status,s)}>${s}</option>`).join('')}</select></div><p class="status-explanation" id="status-help"></p><p class="small muted">Publikasi memerlukan foto, lokasi, spesifikasi inti, dan minimal satu penawaran. Perubahan status memerlukan konfirmasi Anda.</p></section><section class="form-section" id="lease"><h2>Masa sewa internal</h2><p class="small muted">Hanya admin yang dapat membaca informasi ini. Wajib diisi saat status Tersewa.</p><div class="field"><label for="lease_period">Periode aktif</label><select id="lease_period"><option value="">Pilih periode aktif</option><option value="monthly"${selected(h.lease_period,'monthly')}>Bulanan</option><option value="yearly"${selected(h.lease_period,'yearly')}>Tahunan</option></select></div>${field('lease_start','Tanggal mulai',h.lease_start,'date')}${field('lease_end','Tanggal akhir',h.lease_end,'date')}${textarea('internal_notes','Catatan internal',h.internal_notes)}${noticeBadge(h.notice)}</section><div class="form-footer"><button class="btn" type="submit">${isNew?'Simpan Draft':'Simpan Perubahan'}</button><a href="/admin/rumah">Kembali</a></div></aside></div></form>`,isNew?'Tambah Aset':'Edit Aset');
  const statusHelp={Draft:'Hanya terlihat admin.',Tersedia:'Tampil publik. Pengajuan survei aktif.',Dipesan:'DP telah diverifikasi. Tampil publik; survei nonaktif.',Tersewa:'Pelunasan telah diverifikasi. Disembunyikan dari publik.'};
  const updateStatus=()=>{$('#status-help').textContent=statusHelp[$('#status').value];for(const id of ['lease_period','lease_start','lease_end']) $('#'+id).required=$('#status').value==='Tersewa';};
  $('#status').onchange=updateStatus;updateStatus();
  for(const p of ['monthly','yearly']) {
    const toggle=()=>{for(const suffix of ['price','minimum']){const input=$('#'+p+'-'+suffix);input.disabled=!$('#'+p+'-enabled').checked;input.required=!input.disabled;input.min=1;}};
    $('#'+p+'-enabled').onchange=toggle;toggle();
  }
  const syncAssetFields=()=>{
    const land=$('#asset_type').value==='land';
    $('#building_size').closest('.field').hidden=land;
    $('#building_size').disabled=land;
    $('#land_condition').closest('.field').hidden=!land;
    $('#land_condition').disabled=!land;
  };
  $('#asset_type').onchange=syncAssetFields;
  syncAssetFields();
  $('#house-form').onsubmit=async e=>{
    e.preventDefault();const errorBox=$('#save-error');errorBox.textContent='';
    const body={revision:h.revision,status:$('#status').value,asset_type:$('#asset_type').value,bedrooms:0,bathrooms:0};
    for(const key of ['name','code','description','area','address','maps_url','terms','extra_costs','lease_period','lease_start','lease_end','internal_notes','access','land_condition']) body[key]=$('#'+key).value;
    for(const key of ['land_size','building_size'])body[key]=Number($('#'+key).value);
    body.amenities=$('#amenities').value.split('\n').map(x=>x.trim()).filter(Boolean);
    for(const p of ['monthly','yearly'])body[p]=$('#'+p+'-enabled').checked?{price:Number($('#'+p+'-price').value),minimum:Number($('#'+p+'-minimum').value)}:null;
    if(body.status!==h.status){if(!await confirmStatus(h.status,body.status))return;body.confirm_status=true;}
    const button=$('button[type=submit]',e.target);button.disabled=true;
    try {
      const result=await api(isNew?'/api/admin/houses':`/api/admin/houses/${h.id}`,{method:isNew?'POST':'PUT',body:JSON.stringify(body)});
      toast(isNew?'Draft tersimpan. Anda dapat menambahkan foto.':'Perubahan aset tersimpan.');
      if(isNew)navigate('/admin/rumah/'+result.id);else{const fresh=await api('/api/admin/houses/'+h.id);editor(fresh);}
    } catch(error){errorBox.textContent=error.message;errorBox.scrollIntoView({block:'center'});button.disabled=false;}
  };
  if(!isNew)bindPhotos(h);
  if(location.hash==='#lease')$('#lease').scrollIntoView({block:'start'});
}
function photoManager(h) {
  return `<div class="photo-list">${h.photos.map((p,i)=>`<div class="photo-edit"><img src="${esc(p.url)}" alt="Foto ${i+1} ${esc(h.name)}">${i===0?'<span>Foto utama</span>':''}<div class="photo-controls">${i?`<button type="button" data-main="${i}">Jadikan utama</button><button type="button" data-move="${i}" data-direction="-1" aria-label="Geser foto ${i+1} ke kiri">Kiri</button>`:''}${i<h.photos.length-1?`<button type="button" data-move="${i}" data-direction="1" aria-label="Geser foto ${i+1} ke kanan">Kanan</button>`:''}<button type="button" data-delete-photo="${p.id}">Hapus</button></div></div>`).join('')}</div><p class="photo-help">JPEG, PNG, atau WebP. Maksimal 8 MB per foto, 20 foto per aset. Foto pertama menjadi foto utama. Perubahan foto langsung disimpan.</p><div class="field"><label for="photo-upload">Unggah foto</label><input type="file" id="photo-upload" accept="image/jpeg,image/png,image/webp" multiple></div><p id="upload-status" class="small" role="status"></p>`;
}
function bindPhotos(h) {
  const refresh=async()=>{const fresh=await api('/api/admin/houses/'+h.id);h.photos=fresh.photos;h.revision=fresh.revision;$('#photo-manager').innerHTML=photoManager(h);bindPhotos(h);};
  const order=async(ids)=>{try{await api(`/api/admin/houses/${h.id}/photo-order`,{method:'PUT',body:JSON.stringify({ids})});await refresh();toast('Urutan foto disimpan.');}catch(error){toast(error.message);}};
  $$('[data-main]').forEach(b=>b.onclick=()=>{const ids=h.photos.map(p=>p.id);ids.unshift(ids.splice(Number(b.dataset.main),1)[0]);order(ids);});
  $$('[data-move]').forEach(b=>b.onclick=()=>{const ids=h.photos.map(p=>p.id);const from=Number(b.dataset.move),to=from+Number(b.dataset.direction);[ids[from],ids[to]]=[ids[to],ids[from]];order(ids);});
  $$('[data-delete-photo]').forEach(b=>b.onclick=async()=>{
    if(!window.confirm('Hapus foto ini dari penyimpanan?'))return;
    try{await api(`/api/admin/houses/${h.id}/photos`,{method:'DELETE',body:JSON.stringify({photo_id:b.dataset.deletePhoto})});await refresh();toast('Foto dihapus.');}catch(error){toast(error.message);}
  });
  $('#photo-upload').onchange=async e=>{
    const files=[...e.target.files];e.target.disabled=true;const status=$('#upload-status');
    try {
      for(let i=0;i<files.length;i++){
        const file=files[i];if(file.size>8*1024*1024)throw new Error('Foto maksimal 8 MB.');
        status.textContent=`Mengunggah foto ${i+1} dari ${files.length}…`;
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('Foto gagal dibaca.'));reader.readAsDataURL(file);});
        await api(`/api/admin/houses/${h.id}/photos`,{method:'POST',body:JSON.stringify({data})});
      }
      toast('Foto tersimpan.');
    }catch(error){toast(error.message);}
    finally{await refresh();}
  };
}
async function route() {
  const id=++navigationId;
  const path=location.pathname;
  try {
    if(!state.config)state.config=await api('/api/config');
    if(path.startsWith('/admin')){
      if(window.SEWARUMA_STATIC_DEMO) {
        shell(`<div class="container section">${empty('Panel admin belum tersedia pada demo','Website ini menampilkan data contoh. Pengelolaan aset memerlukan backend dan penyimpanan data aktif.','<a class="btn" href="/rumah">Lihat katalog demo</a>')}</div>`,'Demo Admin');
        return;
      }
      state.session=await api('/api/session');
      if(id!==navigationId)return;
      if(!state.session.authenticated)return login();
      if(path==='/admin') {state.adminHouses=await api('/api/admin/houses');if(id===navigationId)dashboard();return;}
      if(path==='/admin/rumah'){state.adminHouses=await api('/api/admin/houses');if(id===navigationId)manage();return;}
      if(path==='/admin/rumah/baru')return editor();
      if(/^\/admin\/rumah\/[a-f0-9]+$/.test(path)){const house=await api('/api/admin/houses/'+path.split('/').pop());if(id===navigationId)editor(house);return;}
    }else if(path==='/'||path==='/rumah'){
      state.houses=await api('/api/houses');if(id!==navigationId)return;
      return path==='/'?landing():catalog();
    }else if(path==='/tentang')return about();
    else if(/^\/rumah\/[a-f0-9]+$/.test(path)){const house=await api('/api/houses/'+path.split('/').pop());if(id===navigationId)detail(house);return;}
    shell(`<div class="container section">${empty('Halaman tidak ditemukan','Periksa alamat halaman atau kembali ke katalog.','<a class="btn" href="/rumah">Kembali ke katalog</a>')}</div>`,'Halaman tidak ditemukan');
  }catch(error){if(id===navigationId)shell(`<div class="container section">${empty(error.message==='Properti tidak tersedia'?'Properti tidak tersedia':'Halaman belum dapat dimuat',esc(error.message),'<a class="btn" href="/rumah">Kembali ke katalog</a>')}</div>`,'Informasi');}
}
function transitionToPage(resetScroll=false) {
  const request=++pageRequest;
  ++navigationId;
  pageTransition?.skipTransition();
  pageEntrance?.cancel();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const update=async()=>{
    if(resetScroll)window.scrollTo({top:0,left:0,behavior:'instant'});
    await route();
    if(request!==pageRequest)return;
    if(resetScroll)window.scrollTo(0,0);
  };
  if(document.startViewTransition && !reduced) {
    const transition=document.startViewTransition(update);
    pageTransition=transition;
    transition.ready.catch(()=>{});
    const clear=()=>{if(pageTransition===transition)pageTransition=null;};
    transition.finished.then(clear,clear);
  } else {
    update().then(()=>{
      if(!reduced && request===pageRequest && $('#main')?.animate) {
        pageEntrance=$('#main').animate([
          {opacity:0},
          {opacity:1}
        ],{duration:480,easing:'cubic-bezier(.22,.61,.36,1)'});
      }
    });
  }
}
function navigate(path){history.pushState({},'',path);transitionToPage(true);}
document.addEventListener('click',async e=>{
  const a=e.target.closest('a');
  if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target||a.hasAttribute('download'))return;
  const url=new URL(a.href);
  if(url.origin!==location.origin||a.getAttribute('href').startsWith('#'))return;
  e.preventDefault();
  if(a.matches('.hero .btn[href="/rumah"]') && !matchMedia('(prefers-reduced-motion: reduce)').matches && a.animate) {
    if(a.getAttribute('aria-busy')==='true')return;
    const currentNavigation=navigationId;
    a.setAttribute('aria-busy','true');
    const box=a.getBoundingClientRect(), size=Math.max(box.width,box.height)*2;
    const ripple=document.createElement('span');
    ripple.className='explore-ripple';ripple.setAttribute('aria-hidden','true');
    ripple.style.width=ripple.style.height=`${size}px`;
    ripple.style.left=`${(e.detail?e.clientX-box.left:box.width/2)-size/2}px`;
    ripple.style.top=`${(e.detail?e.clientY-box.top:box.height/2)-size/2}px`;
    a.append(ripple);
    const wave=ripple.animate([{transform:'scale(0)',opacity:.7},{transform:'scale(1)',opacity:0}],{duration:450,easing:'ease-out',fill:'forwards'});
    wave.finished.then(()=>ripple.remove(),()=>ripple.remove());
    const press=a.animate([{transform:'scale(1)'},{transform:'scale(.95)',offset:.4},{transform:'scale(1)'}],{duration:220,easing:'ease-out'});
    try {await press.finished;} catch { /* Continue navigation if the browser cancels the press effect. */ }
    a.removeAttribute('aria-busy');
    if(!a.isConnected || navigationId!==currentNavigation)return;
  }
  navigate(url.pathname+url.search+url.hash);
});
window.addEventListener('popstate',()=>transitionToPage());
route();

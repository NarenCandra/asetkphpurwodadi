/* Build a static demo using bundled content only, never .env or runtime data. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.mkdirSync(output, {recursive:true});
fs.cpSync(path.join(root, 'public'), output, {recursive:true});
const records = JSON.parse(fs.readFileSync(path.join(root, 'demo/houses.json'), 'utf8'));
const houses = records.flatMap((house, index) => {
  if (!['Tersedia','Dipesan'].includes(house.status)) return [];
  const id = crypto.createHash('sha256').update(house.code).digest('hex').slice(0,24);
  const photos = Array.from({length:2}, (_, position) => {
    const name = `house-${(index+position)%3+1}.jpg`;
    fs.copyFileSync(path.join(root, 'demo', name), path.join(output, 'assets', name));
    return {id:`${id}-${position}`,url:`/assets/${name}`};
  });
  const fields = ['code','name','area','address','maps_url','description','land_size','building_size','bedrooms','bathrooms','amenities','monthly','yearly','terms','extra_costs','status'];
  const publicHouse = Object.fromEntries(fields.map(key=>[key,house[key]]));
  return [{...publicHouse,id,revision:1,demo:true,photos}];
});
const config = {
  name:'Sewaruma',
  profile:'Jelajahi pilihan rumah sewa bulanan dan tahunan. Profil, foto, lokasi, dan harga pada website ini merupakan data demonstrasi, bukan penawaran properti sebenarnya.',
  areas:'Kawasan Taman, Selatan, dan Barat (contoh)',
  hours:'Senin–Sabtu, 09.00–17.00 WIB (contoh)',
  whatsapp:null,whatsapp_display:'Nomor pengelola belum dikonfigurasi.',timezone:'Asia/Jakarta'
};
fs.writeFileSync(path.join(output,'demo-data.json'), JSON.stringify({config,houses}));
fs.writeFileSync(path.join(output,'assets/deployment.js'), 'window.SEWARUMA_STATIC_DEMO = true;\n');
console.log(`Static demo built: ${houses.length} public houses. No runtime database or admin credentials exported.`);

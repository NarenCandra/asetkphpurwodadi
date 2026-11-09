import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import importconv as C


def R(row, cells):
    return {'row': row, 'cells': cells}


ROWS = [
    R(3, {0: 'No', 1: 'Uraian/Nama Aset', 2: 'Tentang Aset', 3: 'Lokasi', 4: 'Luas (m²)', 6: 'Rekomentasi Peruntukan', 7: 'Harga / Th', 8: 'Titik Koordinat', 9: 'Foto', 10: 'Fasikitas'}),
    R(4, {4: 'Bangunan', 5: 'Tanah'}),
    R(5, {i: i + 1 for i in range(11)}),
    R(7, {0: 1, 1: 'Rumah Dinas A', 3: 'Kec. Brati', 4: 60, 5: '1.200,5', 7: 'Rp 12.000.000', 10: 'AC, Wifi (kencang, cepat)'}),
    R(8, {0: 2, 1: 'Lahan B', 5: 300}),
    R(9, {0: 3}),
]


class ConvertTest(unittest.TestCase):
    def test_header_two_rows_typo_and_numbering(self):
        header = C.detect_header(ROWS)
        self.assertEqual(header['row'], 3)
        mapping, unmapped = C.map_columns(header['labels'])
        by = {m['key']: m['col'] for m in mapping}
        self.assertEqual([by[k] for k in ('nama', 'luas_bangunan', 'luas_tanah', 'peruntukan', 'harga', 'fasilitas')], [1, 4, 5, 6, 7, 10])
        records = C.extract_rows(ROWS, header, mapping, 0)
        self.assertEqual([(r['_no'], r['nama']) for r in records], [(1, 'Rumah Dinas A'), (2, 'Lahan B')])

    def test_build_house(self):
        header = C.detect_header(ROWS)
        mapping, _ = C.map_columns(header['labels'])
        a, b = (C.build_house(r, 'PWD-00%d' % i) for i, r in enumerate(C.extract_rows(ROWS, header, mapping, 0), 1))
        self.assertEqual((a['asset_type'], a['building_size'], a['land_size']), ('building', 60, 1200.5))
        self.assertEqual(a['yearly'], {'price': 12000000, 'minimum': 1})
        self.assertEqual(a['amenities'], ['AC', 'Wifi (kencang, cepat)'])
        self.assertEqual((b['asset_type'], b['building_size'], b['land_size'], b['description']), ('land', 0, 300, ''))
        self.assertEqual(a['status'], 'Draft')

    def test_status_and_numbers(self):
        self.assertEqual(C.build_house({'nama': 'X', 'status': 'Tersedia'}, 'P', True)['status'], 'Tersedia')
        self.assertEqual(C.build_house({'nama': 'X', 'status': 'Tersedia'}, 'P')['status'], 'Draft')
        self.assertEqual(C.build_house({'nama': 'X', 'status': 'Tidak tersedia'}, 'P', True)['status'], 'Draft')
        self.assertEqual(C.parse_number('Rp 2.000.000/th'), 2000000)
        self.assertEqual(C.build_house({'nama': 'A', 'minimum': '18 bulan', 'harga': '1000'}, 'P')['yearly']['minimum'], 2)
        self.assertTrue(C.is_numbering({0: 1, 1: 2, 2: 3}))
        self.assertFalse(C.is_numbering({0: 1, 1: 'Rumah', 2: 3}))


if __name__ == '__main__':
    unittest.main()

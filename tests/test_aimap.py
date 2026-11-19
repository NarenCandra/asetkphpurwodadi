import json, sys, threading, unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import importconv as C

UNMAPPED = [{'col': 5, 'header': 'Pemilik Lahan'}, {'col': 6, 'header': 'Tentang Lokasi'}, {'col': 7, 'header': 'Tgl. Survei'}]
ROWS = [{'row': 9, 'cells': {5: 'Pak Budi', 6: 'Dekat pasar', 7: '2026-01-02'}}]


class Fake(BaseHTTPRequestHandler):
    reply, status, seen = None, 200, []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        Fake.seen.append({'path': self.path, 'headers': {k.lower(): v for k, v in self.headers.items()}, 'body': body})
        data = json.dumps(Fake.reply).encode()
        self.send_response(Fake.status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def log_message(self, *a): pass


def groq_reply(mapping, fenced=False):
    text = json.dumps(mapping)
    return {'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': f'```json\n{text}\n```' if fenced else text}}]}


class AiMappingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('127.0.0.1', 0), Fake)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close()

    def setUp(self):
        Fake.seen, Fake.status = [], 200

    def groq_env(self, **extra):
        return {'GROQ_API_KEY': 'gsk_uji', 'GROQ_BASE_URL': self.base + '/openai/v1', **extra}

    def test_groq_bentuk_permintaan_dan_pembacaan_jawaban(self):
        Fake.reply = groq_reply({'Pemilik Lahan': 'inventaris', 'Tentang Lokasi': 'deskripsi', 'Tgl. Survei': None})
        mapping, used, note = C.ai_mapping(UNMAPPED, ROWS, self.groq_env())
        self.assertEqual((mapping, used, note), ({'Pemilik Lahan': 'inventaris', 'Tentang Lokasi': 'deskripsi'}, True, None))
        call = Fake.seen[0]
        self.assertEqual(call['path'], '/openai/v1/chat/completions')
        self.assertEqual(call['headers']['authorization'], 'Bearer gsk_uji')
        self.assertEqual(call['body']['model'], 'llama-3.3-70b-versatile')
        self.assertEqual(call['body']['response_format'], {'type': 'json_object'})
        self.assertEqual([m['role'] for m in call['body']['messages']], ['system', 'user'])
        self.assertIn('JSON', call['body']['messages'][0]['content'])           # syarat mode JSON Groq
        self.assertIn('Pak Budi', call['body']['messages'][1]['content'])      # contoh isi sel ikut terkirim (maks. 3 baris)
        self.assertNotIn('inventaris', call['body']['messages'][1]['content'].split('Pak Budi')[0].lower())

    def test_model_dapat_diganti_dan_pagar_kode_dibuang(self):
        Fake.reply = groq_reply({'Pemilik Lahan': 'kondisi'}, fenced=True)
        mapping, used, _ = C.ai_mapping(UNMAPPED, ROWS, self.groq_env(GROQ_MODEL='openai/gpt-oss-120b'))
        self.assertTrue(used); self.assertEqual(mapping, {'Pemilik Lahan': 'kondisi'})
        self.assertEqual(Fake.seen[0]['body']['model'], 'openai/gpt-oss-120b')

    def test_jawaban_tidak_valid_disaring(self):
        Fake.reply = groq_reply({'Pemilik Lahan': 'kunci_ngawur', 'Kolom Asing': 'nama', 'Tentang Lokasi': 'alamat', 'Tgl. Survei': 123})
        mapping, used, _ = C.ai_mapping(UNMAPPED, ROWS, self.groq_env())
        self.assertEqual(mapping, {'Tentang Lokasi': 'alamat'})

    def test_gagal_tidak_melempar_error(self):
        Fake.reply, Fake.status = {'error': 'x'}, 500
        mapping, used, note = C.ai_mapping(UNMAPPED, ROWS, self.groq_env())
        self.assertEqual((mapping, used), ({}, False)); self.assertIn('AI tidak dapat dihubungi', note)
        Fake.status, Fake.reply = 200, {'choices': [{'message': {'content': 'bukan json'}}]}
        self.assertEqual(C.ai_mapping(UNMAPPED, ROWS, self.groq_env())[1], False)

    def test_tanpa_kunci_tidak_memanggil_apa_pun(self):
        self.assertEqual(C.ai_mapping(UNMAPPED, ROWS, {}), ({}, False, None))
        self.assertEqual(Fake.seen, [])

    def test_groq_diutamakan_dan_anthropic_jadi_cadangan(self):
        Fake.reply = groq_reply({'Pemilik Lahan': 'nama'})
        C.ai_mapping(UNMAPPED, ROWS, {**self.groq_env(), 'ANTHROPIC_API_KEY': 'sk-ant-uji', 'ANTHROPIC_BASE_URL': self.base})
        self.assertEqual([c['path'] for c in Fake.seen], ['/openai/v1/chat/completions'])
        Fake.seen.clear()
        Fake.reply = {'content': [{'type': 'text', 'text': '{"Pemilik Lahan": "kondisi"}'}]}
        mapping, used, _ = C.ai_mapping(UNMAPPED, ROWS, {'ANTHROPIC_API_KEY': 'sk-ant-uji', 'ANTHROPIC_BASE_URL': self.base})
        self.assertEqual((mapping, used), ({'Pemilik Lahan': 'kondisi'}, True))
        self.assertEqual(Fake.seen[0]['path'], '/v1/messages'); self.assertEqual(Fake.seen[0]['headers']['x-api-key'], 'sk-ant-uji')


if __name__ == '__main__':
    unittest.main()

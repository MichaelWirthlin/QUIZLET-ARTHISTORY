import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib import request, error
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('studio', Path(__file__).resolve().parents[1] / 'server.py')
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)

# Real one-pixel PNG, not a remote fixture.
IMAGE = 'data:image/png;base64,' + base64.b64encode(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1cAAAAASUVORK5CYII=')).decode()


class StudioTests(unittest.TestCase):
    def setUp(self):
        studio.AI_VERIFIED = False

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.previous_data, cls.previous_key = studio.DATA, studio.KEY
        studio.DATA, studio.KEY = Path(cls.temp.name), None
        cls.server = studio.ThreadingHTTPServer(('127.0.0.1', 0), studio.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        studio.DATA, studio.KEY = cls.previous_data, cls.previous_key
        cls.temp.cleanup()

    def call(self, path, body=None, headers=None):
        req = request.Request(self.url + path, data=json.dumps(body).encode() if body is not None else None,
                              headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            with request.urlopen(req) as response:
                return response.status, json.loads(response.read())
        except error.HTTPError as exc:
            return exc.code, json.loads(exc.read())

    def artwork(self):
        status, art = self.call('/api/artworks', {'title': 'Test work', 'image': IMAGE, 'period': 'Test period',
                                                'context': 'Reference context', 'overview': 'Reference overview'})
        self.assertEqual(status, 200)
        return art

    def test_create_update_persist_delete(self):
        art = self.artwork()
        art['context'] = 'Edited course notes'
        self.assertEqual(self.call('/api/artworks', art)[0], 200)
        rows = self.call('/api/artworks')[1]
        self.assertEqual(next(x for x in rows if x['id'] == art['id'])['context'], 'Edited course notes')
        with studio.db() as conn:
            self.assertIsNotNone(conn.execute('SELECT body FROM artworks WHERE id=?', (art['id'],)).fetchone())
        self.assertEqual(self.call('/api/delete', {'id': art['id']})[0], 200)
        self.assertFalse(any(x['id'] == art['id'] for x in self.call('/api/artworks')[1]))

    def test_manual_quiz_uses_saved_reference(self):
        art = self.artwork()
        status, result = self.call('/api/grade', {'id': art['id'], 'answers': {'title': 'My guess'}})
        self.assertEqual(status, 200)
        self.assertEqual(result['mode'], 'self')
        self.assertEqual(result['reference']['context'], 'Reference context')
        self.assertNotIn('score', result)

    def test_ai_missing_is_explicit(self):
        status, result = self.call('/api/identify', {'image': IMAGE})
        self.assertEqual(status, 400)
        self.assertIn('not connected', result['error'])
        self.assertEqual(self.call('/api/status')[1]['ai'], False)

    def test_ai_connection_requires_credentials(self):
        status, result = self.call('/api/ai/test', {})
        self.assertEqual(status, 400)
        self.assertIn('not connected', result['error'])
        self.assertEqual(self.call('/api/status')[1]['verified'], False)

    def test_ai_presence_does_not_claim_verified_connection(self):
        with patch.object(studio, 'KEY', 'test-only'):
            status = self.call('/api/status')[1]
        self.assertTrue(status['ai'])
        self.assertFalse(status['verified'])

    def test_ai_connection_check_success(self):
        with patch.object(studio, 'KEY', 'test-only'), patch.object(studio, 'ai', return_value={'ok': True}):
            status, result = self.call('/api/ai/test', {})
            self.assertEqual(status, 200)
            self.assertTrue(result['connected'])
            self.assertTrue(self.call('/api/status')[1]['verified'])

    def test_ai_connection_check_rejects_incomplete_response(self):
        with patch.object(studio, 'KEY', 'test-only'), patch.object(studio, 'ai', return_value={'ok': False}):
            self.assertEqual(self.call('/api/ai/test', {})[0], 400)
            self.assertFalse(self.call('/api/status')[1]['verified'])

    def test_self_review_can_be_selected_with_ai_configured(self):
        art = self.artwork()
        with patch.object(studio, 'KEY', 'test-only'), patch.object(studio, 'ai') as mocked:
            status, result = self.call('/api/grade', {'id': art['id'], 'answers': {'title': 'Test'}, 'mode': 'self'})
            mocked.assert_not_called()
        self.assertEqual(status, 200)
        self.assertEqual(result['mode'], 'self')

    def test_identification_requires_complete_notes(self):
        with patch.object(studio, 'KEY', 'test-only'), patch.object(studio, 'ai', return_value={'title': 'Incomplete'}):
            status, _ = self.call('/api/identify', {'image': IMAGE})
        self.assertEqual(status, 400)

    def test_ai_grade_contract_and_weighting(self):
        art = self.artwork()
        fields = [{'field': key, 'score': score, 'feedback': 'Feedback'} for key, score in
                  zip(('title', 'period', 'context', 'overview'), (100, 100, 50, 70))]
        with patch.object(studio, 'KEY', 'test-only'), patch.object(studio, 'ai', return_value={'fields': fields, 'summary': 'Summary'}) as mocked:
            status, result = self.call('/api/grade', {'id': art['id'], 'answers': {'title': 'Test work', 'period': 'Test period', 'context': 'A context answer', 'overview': 'An overview answer'}})
        self.assertEqual(status, 200)
        self.assertEqual(result['score'], 80)
        sent = json.loads(mocked.call_args[0][0][1]['content'])
        self.assertEqual(sent['reference']['overview'], 'Reference overview')
        self.assertEqual(sent['answers']['period'], 'Test period')

    def test_blank_answers_cannot_receive_ai_credit(self):
        art = self.artwork()
        fields = [{'field': key, 'score': 100, 'feedback': 'Incorrectly generous model response'} for key in ('title', 'period', 'context', 'overview')]
        with patch.object(studio, 'KEY', 'test-only'), patch.object(studio, 'ai', return_value={'fields': fields}):
            status, result = self.call('/api/grade', {'id': art['id'], 'answers': {'title': 'Test work', 'period': '   '}})
        self.assertEqual(status, 200)
        self.assertEqual(result['score'], 25)
        self.assertTrue(all(field['score'] == 0 for field in result['fields'] if field['field'] != 'title'))

    def test_incomplete_ai_grade_is_rejected(self):
        art = self.artwork()
        with patch.object(studio, 'KEY', 'test-only'), patch.object(studio, 'ai', return_value={'fields': []}):
            self.assertEqual(self.call('/api/grade', {'id': art['id'], 'answers': {}})[0], 400)

    def test_invalid_images_and_missing_title(self):
        for image in ['data:image/svg+xml;base64,PHN2Zz4=', 'https://example.com/a.jpg', 'data:image/png;base64,YWJj']:
            self.assertEqual(self.call('/api/artworks', {'title': 'Bad', 'image': image})[0], 400)
        self.assertEqual(self.call('/api/artworks', {'title': '   '})[0], 400)

    def test_cross_origin_write_rejected(self):
        status, _ = self.call('/api/artworks', {'title': 'Rejected'}, {'Origin': 'https://untrusted.example'})
        self.assertEqual(status, 403)

    def test_static_files_cannot_expose_data_or_server(self):
        for path in ['/server.py', '/.data/studio.sqlite', '/../server.py']:
            with self.assertRaises(error.HTTPError) as response:
                request.urlopen(self.url + path)
            self.assertEqual(response.exception.code, 404)

    def test_unknown_artwork_not_graded(self):
        self.assertEqual(self.call('/api/grade', {'id': 'missing', 'answers': {}})[0], 400)


if __name__ == '__main__':
    unittest.main()

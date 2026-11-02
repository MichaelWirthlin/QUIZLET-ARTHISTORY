"""Optional browser smoke tests: needs Playwright and /usr/bin/chromium.
Uses a temporary database. AI responses are mocked, not live.
"""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('studio', ROOT / 'server.py')
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)

with tempfile.TemporaryDirectory() as directory:
    studio.DATA = Path(directory)
    studio.KEY = None
    server = studio.ThreadingHTTPServer(('127.0.0.1', 0), studio.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
            page = browser.new_page(viewport={'width':1440, 'height':1000})
            page.set_default_timeout(10000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base)
            page.locator('#connection span').get_by_text('Connect AI', exact=True).wait_for()
            page.screenshot(path='/tmp/atelier-v2-home.png', full_page=True)
            # Explicit missing-key path is actionable and makes no upstream request.
            page.locator('#connection').click()
            page.locator('#test-ai').click()
            page.locator('#connection-result.error').wait_for()
            assert 'not connected' in page.locator('#connection-result').inner_text()
            page.locator('#close-settings').click()
            # The sample is genuinely quiz-ready and image loading is successful.
            page.locator('#load-samples').click()
            page.get_by_role('button', name='Edit The Starry Night', exact=True).wait_for()
            assert page.locator('#ready-count').inner_text() == '1'
            assert page.locator('.art-image img').evaluate('(img)=>img.complete && img.naturalWidth > 0')
            # Upload, edit and reload preserve local data.
            page.locator('#add-art').click()
            page.locator('#image-file').set_input_files(str(ROOT / 'public/assets/starry-night.jpg'))
            for key, value in {'title':'Browser test artwork','artist':'Test artist','period':'Test period','context':'Saved historical context.','overview':'Saved visual overview.'}.items():
                page.locator(f'#art-form [name={key}]').fill(value)
            assert 'All set' in page.locator('#editor-readiness').inner_text()
            page.locator('#save-art').click()
            page.get_by_role('button', name='Edit Browser test artwork', exact=True).wait_for()
            page.reload()
            page.get_by_role('button', name='Edit Browser test artwork', exact=True).click()
            page.locator('#art-form [name=context]').fill('Edited historical context.')
            page.screenshot(path='/tmp/atelier-v2-editor.png', full_page=True)
            page.locator('#save-art').click()
            page.locator('#editor').wait_for(state='hidden')
            # Unsaved work is protected, and native dialogs have been replaced.
            page.get_by_role('button', name='Edit Browser test artwork', exact=True).click()
            page.locator('#art-form [name=title]').fill('Unsaved change')
            page.locator('.close-modal').first.click()
            page.locator('#confirm-dialog').wait_for()
            page.locator('#confirm-cancel').click()
            assert page.locator('#editor').is_visible()
            page.locator('.close-modal').first.click()
            page.locator('#confirm-accept').click()
            page.locator('#editor').wait_for(state='hidden')
            page.locator('#search').fill('no artwork has this name')
            page.locator('#no-results').wait_for(state='visible')
            page.locator('#clear-filters').click()
            assert page.locator('.art-card').count() == 2
            page.locator('[data-filter=incomplete]').click()
            page.locator('#no-results').wait_for(state='visible')
            page.locator('#clear-filters').click()
            page.screenshot(path='/tmp/atelier-v2-collection.png', full_page=True)
            # Practice an individual work. The reference stays hidden until submission.
            page.get_by_role('button', name='Practice Browser test artwork', exact=True).click()
            page.locator('#quiz-form').wait_for()
            assert 'Browser test artwork' not in page.locator('#quiz-content').inner_text()
            page.locator('#quiz-form [name=title]').fill('My guess')
            page.locator('#quiz-form [name=context]').fill('An answer about the culture.')
            page.locator('#grade-answer').click()
            page.locator('#quiz-results').wait_for(state='visible')
            assert 'This session is unscored.' in page.locator('#quiz-results').inner_text()
            assert 'Edited historical context.' in page.locator('#quiz-results').inner_text()
            page.screenshot(path='/tmp/atelier-v2-review.png', full_page=True)
            page.locator('#next-question').click()
            assert '1' in page.locator('.session-score').inner_text()
            page.locator('#done').click()
            # Mobile library, editor and quiz must fit at common device widths.
            for width in (375,390,768):
                page.set_viewport_size({'width':width,'height':844})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Page overflow at {width}'
                page.locator('#add-art').click()
                assert page.locator('#editor').evaluate('(el)=>el.scrollWidth <= el.clientWidth'), f'Editor overflow at {width}'
                if width==390:
                    page.screenshot(path='/tmp/atelier-v2-mobile-editor.png',full_page=True)
                page.locator('.close-modal').first.click()
            page.set_viewport_size({'width':390,'height':844})
            page.screenshot(path='/tmp/atelier-v2-mobile.png',full_page=True)
            # Mocked AI UI states: present key is not presented as a verified connection.
            page.route('**/api/status', lambda route: route.fulfill(json={'ai':True,'verified':False,'model':'mock-model'}))
            page.route('**/api/ai/test', lambda route: route.fulfill(json={'connected':True,'model':'mock-model'}))
            page.reload()
            page.locator('#connection span').get_by_text('Check AI connection',exact=True).wait_for()
            page.locator('#connection').click()
            page.locator('#test-ai').click()
            page.locator('#connection-result.success').wait_for()
            assert 'AI connected' in page.locator('#connection').inner_text()
            page.locator('#close-settings').click()
            draft = {'title':'AI draft artwork','artist':'Draft artist','date':'1889','period':'Post-Impressionism','medium':'Oil','context':'AI draft context.','overview':'AI draft overview.','confidence':'high','caveat':'Verify against class notes.'}
            page.route('**/api/identify', lambda route: route.fulfill(json=draft))
            page.locator('#add-art').click()
            page.locator('#image-file').set_input_files(str(ROOT / 'public/assets/starry-night.jpg'))
            page.locator('#identify').click()
            page.locator('#art-form [name=title]').get_attribute('value')
            page.wait_for_function("document.querySelector('#art-form [name=title]').value === 'AI draft artwork'")
            page.locator('#save-art').click()
            page.get_by_role('button',name='Edit AI draft artwork',exact=True).wait_for()
            page.route('**/api/grade', lambda route: route.fulfill(json={'mode':'ai','score':75,'summary':'Mock feedback for UI verification.','fields':[{'field':key,'score':75,'feedback':'A correct main idea; add more detail.'} for key in ('title','period','context','overview')]}))
            page.get_by_role('button',name='Practice AI draft artwork',exact=True).click()
            page.locator('#quiz-form [name=title]').fill('A student answer')
            page.locator('#grade-answer').click()
            page.locator('#quiz-results').wait_for(state='visible')
            assert '75' in page.locator('#quiz-results .score').inner_text()
            assert page.locator('.result-field').count() == 4
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#next-question').click()
            page.locator('#done').click()
            page.get_by_role('button',name='Edit AI draft artwork',exact=True).click()
            page.locator('#delete-art').click()
            page.locator('#confirm-accept').click()
            page.locator('#editor').wait_for(state='hidden')
            assert page.locator('.art-card').count() == 2
            assert not errors, errors
            browser.close()
            print('PASS: sample, upload, edit, reload, discard protection, filters, self-review, mobile widths, mocked AI connection/identification/grading, deletion; no JS errors.')
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

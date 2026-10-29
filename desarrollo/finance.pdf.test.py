from collections import defaultdict
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

root = Path(__file__).parent / 'verification' / 'finance'


def read(name):
    return ' '.join(' '.join(page.extract_text() for page in PdfReader(root / name).pages).split())


event = read('event.pdf')
assert 'Boda Camila' in event and '50 invitados adicionales' in event
assert '1.100,00' in event and '750,00' in event and '400,00' in event
assert 'Comida para invitados' in event and 'Alquiler' in event
assert 'ANULADO' in event and 'Registro de prueba duplicado' in event
monthly = read('monthly.pdf')
assert '550,00' in monthly and '700,00' in monthly
assert 'Electricidad del mes' in monthly and 'Boda Camila' in monthly
assert 'Flujo neto (no es ganancia)' in monthly
assert 'Registro de prueba duplicado' not in monthly
assert 'Por completar' in read('incomplete-month.pdf')
stress = read('stress-event.pdf')
assert all('Gasto ' + str(n) in stress for n in range(35))
assert len(PdfReader(root / 'stress-event.pdf').pages) > 3
for pdf in root.glob('*.pdf'):
    with pdfplumber.open(pdf) as document:
        for number, page in enumerate(document.pages, 1):
            rows = defaultdict(list)
            for char in page.chars:
                assert 35 <= char['x0'] <= char['x1'] <= 560, (pdf.name, number, char)
                assert 20 <= char['top'] <= char['bottom'] <= 835, (pdf.name, number, char)
                rows[round(char['top'], 1)].append(char)
            for row in rows.values():
                row.sort(key=lambda char: char['x0'])
                for left, right in zip(row, row[1:]):
                    assert left['x1'] <= right['x0'] + 0.5, (pdf.name, number, left, right)
            assert f'Pagina {number} de {len(document.pages)}' in page.extract_text()
print('PASS: financial PDF totals, event/month references, unknown prices, extras and voided vs active cash')
print('PASS: long multipage financial reports retain every expense, bounded text and no column overlaps')

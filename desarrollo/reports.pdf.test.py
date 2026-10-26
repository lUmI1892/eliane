from collections import defaultdict
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

root = Path(__file__).parent / 'verification' / 'reports'


def read(name):
    return '\n'.join(page.extract_text() for page in PdfReader(root / name).pages)


summary = read('events.pdf')
assert summary.index('Boda Camila') < summary.index('PERICO DE LOS PALOTES')
assert 'Sin definir' in summary and '650' in summary
assert len(PdfReader(root / 'events.pdf').pages) == 5
filtered = read('filtered.pdf')
assert 'PERICO' in filtered and 'Boda Maria' not in filtered
assert len(PdfReader(root / 'filtered.pdf').pages) == 1
delivery = read('delivery.pdf')
assert 'Materiales para entregar' in delivery and 'REVISAR FECHA' in delivery
assert '30/01/0001' in delivery and 'Faltante' not in delivery
pending = read('return-pending.pdf')
assert 'pendiente de confirmar' in pending and 'Por revisar' in pending
assert 'REVISAR CONTEO' in pending and 'Revisar' in pending
assert 'Da\xf1ado' in pending
confirmed = read('return-confirmed.pdf')
assert 'Devolucion confirmada' in confirmed and 'Faltante' in confirmed
assert 'Por revisar' not in confirmed
assert 'No hay eventos' in read('empty.pdf')
assert '17.500,00' in read('inventory.pdf')
stress = read('stress.pdf')
assert 'FIN DE OBSERVACIONES' in stress
assert all('LONG-' + str(i) in stress for i in range(60))
assert len(PdfReader(root / 'stress.pdf').pages) > 10

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
print('PASS: PDF content, chronological summary, filters, unknown/zero guests, provisional vs confirmed returns and date/count warnings')
print('PASS: multipage long names/notes, repeated table headers, page numbers, text bounds and no overlapping columns')

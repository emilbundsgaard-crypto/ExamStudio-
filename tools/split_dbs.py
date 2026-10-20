"""Split large gzip'ed databases into 20 MB parts (web hosts and transfers cope better with small files).
Writes public/data/db/parts.json = {name: number_of_parts}; the browser fetches and joins the parts."""
import os, json, glob
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'data', 'db')
PART = 20 * 1024 * 1024
parts = {}
for f in sorted(glob.glob(os.path.join(D, '*.db.gz'))):
    name = os.path.basename(f)[:-6]
    data = open(f, 'rb').read()
    for old in glob.glob(f + '.*'):
        os.remove(old)
    if len(data) <= PART:
        parts[name] = 0
        continue
    n = (len(data) + PART - 1) // PART
    for i in range(n):
        open(f'{f}.{i:03d}', 'wb').write(data[i * PART:(i + 1) * PART])
    os.remove(f)
    parts[name] = n
    print(name, n, 'parts')
json.dump(parts, open(os.path.join(D, 'parts.json'), 'w'))
print(parts)

from qlib import sql

SRC = 'CS50 songs'
C = 'songs'
sql('S01', C, 'songs', 'List the names and energy of all songs in the database (two columns: name, energy).',
    'SELECT name, energy FROM songs', ['SELECT'], source=SRC + ' 1.sql', secs=30,
    variants=[('SELECT name FROM songs', 'Two columns were asked for: name and energy.')])
sql('S02', C, 'songs', 'List the names of all songs in decreasing order of tempo (one column: name).',
    'SELECT name FROM songs ORDER BY tempo DESC', ['ORDER BY'], order=[0], source=SRC + ' 2.sql', secs=45,
    variants=[('SELECT name FROM songs ORDER BY tempo', 'Decreasing order needs DESC.')])
sql('S03', C, 'songs', 'List the names of the top 3 longest songs, longest first.',
    'SELECT name FROM songs ORDER BY duration_ms DESC LIMIT 3', ['ORDER BY', 'LIMIT'], order=[0], source=SRC + ' 3.sql', secs=45,
    variants=[('SELECT name FROM songs ORDER BY duration_ms LIMIT 3', 'Those are the three shortest songs – sort DESC.')])
sql('S04', C, 'songs', 'List the names of songs that have danceability, energy and valence all greater than 0.6.',
    'SELECT name FROM songs WHERE danceability > 0.6 AND energy > 0.6 AND valence > 0.6', ['WHERE', 'AND'], source=SRC + ' 4.sql', secs=45,
    variants=[('SELECT name FROM songs WHERE danceability > 0.6 OR energy > 0.6 OR valence > 0.6', 'All three conditions must hold – use AND, not OR.'),
              ('SELECT name FROM songs WHERE danceability >= 0.6 AND energy >= 0.6 AND valence >= 0.6', '"Greater than" excludes 0.6 itself.')])
sql('S05', C, 'songs', 'Return the average tempo of all songs (one row, one column).',
    'SELECT AVG(tempo) FROM songs', ['AVG'], source=SRC + ' 5.sql', secs=30)
sql('S06', C, 'songs', 'List the names of the songs by Drake. Do not assume you know Drake\'s artist_id.',
    "SELECT name FROM songs WHERE artist_id = (SELECT id FROM artists WHERE name = 'Drake')", ['subqueries', 'JOIN'], source=SRC + ' 6.sql', secs=60,
    variants=[("SELECT songs.name FROM songs, artists WHERE artists.name = 'Drake'", 'Your join has no join condition (songs.artist_id = artists.id), so every song is paired with Drake.')])
sql('S07', C, 'songs', 'Return the average energy of songs by Post Malone.',
    "SELECT AVG(energy) FROM songs JOIN artists ON songs.artist_id = artists.id WHERE artists.name = 'Post Malone'", ['JOIN', 'AVG'], source=SRC + ' 7.sql', secs=60,
    variants=[('SELECT AVG(energy) FROM songs', 'That is the average over all songs – restrict to Post Malone.')])
sql('S08', C, 'songs', 'List the names of songs that feature other artists ("feat." appears in the song name).',
    "SELECT name FROM songs WHERE name LIKE '%feat.%'", ['LIKE', 'wildcards'], source=SRC + ' 8.sql', secs=45,
    variants=[("SELECT name FROM songs WHERE name = 'feat.'", '= looks for an exact match; use LIKE with % wildcards.')])
# variants in the style of an exam bank
for f in ['energy', 'danceability']:
    for t in (0.4, 0.6, 0.8):
        k = f'{f[0].upper()}{int(t * 10)}'
        sql(f'S1{k}', C, 'songs', f'Find the number of songs with {f} above {t} and their average duration_ms (one row: count, average).',
            f'SELECT COUNT(*), AVG(duration_ms) FROM songs WHERE {f} > {t}', ['WHERE', 'aggregates'], group='SV', secs=45,
            variants=[(f'SELECT COUNT(*), AVG(duration_ms) FROM songs WHERE {f} >= {t}', 'Above means strictly greater (>).'),
                      (f'SELECT COUNT(*), AVG(duration_ms) FROM songs', f'You forgot the {f} condition.')])
sql('S20', C, 'songs', 'Show artist names and the average danceability of their songs, highest average first (columns: name, average).',
    'SELECT artists.name, AVG(songs.danceability) AS avg_d FROM songs JOIN artists ON songs.artist_id = artists.id GROUP BY artists.id, artists.name ORDER BY avg_d DESC',
    ['JOIN', 'GROUP BY', 'ORDER BY'], order=[1], group='SV', secs=90, level=2,
    variants=[('SELECT artists.name, AVG(songs.danceability) AS avg_d FROM songs JOIN artists ON songs.artist_id = artists.id GROUP BY artists.id ORDER BY avg_d', 'Highest first means ORDER BY ... DESC.')])
sql('S21', C, 'songs', 'Show artist names and the number of songs for artists with more than two songs, most songs first (columns: name, songs).',
    'SELECT artists.name, COUNT(*) AS n FROM songs JOIN artists ON songs.artist_id = artists.id GROUP BY artists.id, artists.name HAVING COUNT(*) > 2 ORDER BY n DESC',
    ['GROUP BY', 'HAVING'], order=[1], group='SV', secs=90, level=2,
    variants=[('SELECT artists.name, COUNT(*) AS n FROM songs JOIN artists ON songs.artist_id = artists.id GROUP BY artists.id, artists.name HAVING COUNT(*) >= 2 ORDER BY n DESC', 'More than two means > 2.')])
sql('S22', C, 'songs', "Find the number of songs whose name contains the word 'you' (any case) and their average energy.",
    "SELECT COUNT(*), AVG(energy) FROM songs WHERE name LIKE '%you%'", ['LIKE', 'aggregates'], group='SV', secs=60,
    explain="In SQLite LIKE ignores upper/lower case for ASCII letters, so 'You' and 'you' both match.")
sql('S23', C, 'songs', 'Find the lowest, highest and average duration_ms across all songs (one row, three columns).',
    'SELECT MIN(duration_ms), MAX(duration_ms), AVG(duration_ms) FROM songs', ['aggregates'], group='SV', secs=45)
sql('S24', C, 'songs', 'Show song name, artist name and tempo for songs with tempo above 150, fastest first.',
    'SELECT songs.name, artists.name, tempo FROM songs JOIN artists ON songs.artist_id = artists.id WHERE tempo > 150 ORDER BY tempo DESC',
    ['JOIN', 'WHERE', 'ORDER BY'], order=[2], group='SV', secs=60)

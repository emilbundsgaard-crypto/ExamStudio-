from qlib import sql

SRC = 'CS50 movies'
C = 'movies'
HP = "Harry Potter and the Sorcerer''s Stone"
HP_TXT = "Harry Potter and the Sorcerer's Stone"
sql('M01', C, 'movies', 'List the titles of all movies released in 2007.', 'SELECT title FROM movies WHERE year = 2007', ['WHERE'], source=SRC + ' 1.sql', secs=30)
sql('M02', C, 'movies', 'Determine the birth year of Johnny Depp (one row, one column).', "SELECT birth FROM people WHERE name = 'Johnny Depp'", ['WHERE'], source=SRC + ' 2.sql', secs=30)
sql('M03', C, 'movies', 'List the titles of all movies released in 2017 or later, in alphabetical order.',
    'SELECT title FROM movies WHERE year >= 2017 ORDER BY title', ['WHERE', 'ORDER BY'], order=[0], source=SRC + ' 3.sql', secs=45,
    variants=[('SELECT title FROM movies WHERE year > 2017 ORDER BY title', 'Movies released in 2017 must be included (>=).'),
              ('SELECT title FROM movies WHERE year = 2017 ORDER BY title', 'Future releases (after 2017) must be included too.')])
sql('M04', C, 'movies', 'Determine the number of movies with an IMDb rating greater than 9.0.',
    'SELECT COUNT(*) FROM ratings WHERE rating > 9.0', ['COUNT', 'WHERE'], source=SRC + ' 4.sql', secs=30,
    variants=[('SELECT COUNT(*) FROM ratings WHERE rating >= 9.0', 'Greater than 9.0 excludes 9.0 itself.')])
sql('M05', C, 'movies', 'List the titles and release years of all Toy Story movies (title begins with "Toy Story"), in chronological order.',
    "SELECT title, year FROM movies WHERE title LIKE 'Toy Story%' ORDER BY year", ['LIKE', 'ORDER BY'], order=[1], source=SRC + ' 5.sql', secs=45,
    variants=[("SELECT title, year FROM movies WHERE title LIKE '%Toy Story%' ORDER BY year", 'The title must begin with "Toy Story" – no wildcard at the start.')])
sql('M06', C, 'movies', 'Determine the average rating of all movies released in 2013.',
    'SELECT AVG(rating) FROM ratings JOIN movies ON ratings.movie_id = movies.id WHERE year = 2013', ['JOIN', 'AVG'], source=SRC + ' 6.sql', secs=60,
    variants=[('SELECT AVG(rating) FROM ratings', 'You averaged all years – filter on year = 2013.')])
sql('M07', C, 'movies', 'List all movies released in 2011 and their ratings, highest rating first; ties alphabetically by title. Exclude movies without ratings.',
    'SELECT title, rating FROM movies JOIN ratings ON movies.id = ratings.movie_id WHERE year = 2011 ORDER BY rating DESC, title', ['JOIN', 'ORDER BY'], order=[1, 0], source=SRC + ' 7.sql', secs=90, level=2,
    variants=[('SELECT title, rating FROM movies JOIN ratings ON movies.id = ratings.movie_id WHERE year = 2011 ORDER BY rating DESC', 'Ties must be ordered alphabetically by title as a second sort key.'),
              ('SELECT title, rating FROM movies LEFT JOIN ratings ON movies.id = ratings.movie_id WHERE year = 2011 ORDER BY rating DESC, title', 'A LEFT JOIN keeps movies without ratings – they must be excluded.')])
sql('M08', C, 'movies', f'List the names of all people who starred in {HP_TXT}.',
    f"SELECT name FROM people WHERE id IN (SELECT person_id FROM stars WHERE movie_id = (SELECT id FROM movies WHERE title = '{HP}'))", ['subqueries', 'JOIN'], source=SRC + ' 8.sql', secs=90, level=2)
sql('M09', C, 'movies', 'List the names of all people who starred in a movie released in 2004, each person once, ordered by birth year.',
    'SELECT DISTINCT people.name, people.birth FROM people JOIN stars ON people.id = stars.person_id JOIN movies ON stars.movie_id = movies.id WHERE movies.year = 2004 ORDER BY people.birth',
    ['JOIN', 'DISTINCT', 'ORDER BY'], order=[1], source=SRC + ' 9.sql (adapted: 2004, name and birth)', secs=150, level=3,
    variants=[('SELECT people.name, people.birth FROM people JOIN stars ON people.id = stars.person_id JOIN movies ON stars.movie_id = movies.id WHERE movies.year = 2004 ORDER BY people.birth', 'People who appeared in several 2004 movies are listed more than once – use DISTINCT.')],
    explain='Show name and birth so the ordering can be checked. Note DISTINCT on (name, birth) still keeps two different people who share a name.')
sql('M10', C, 'movies', 'List the names of all people who directed a movie with a rating of at least 9.0, each person once.',
    'SELECT DISTINCT people.id, people.name FROM people JOIN directors ON people.id = directors.person_id JOIN ratings ON directors.movie_id = ratings.movie_id WHERE rating >= 9.0',
    ['JOIN', 'DISTINCT'], source=SRC + ' 10.sql (adapted: 9.0, id and name)', secs=120, level=2,
    variants=[('SELECT people.id, people.name FROM people JOIN directors ON people.id = directors.person_id JOIN ratings ON directors.movie_id = ratings.movie_id WHERE rating >= 9.0', 'Directors with several qualifying movies appear more than once – use DISTINCT.'),
              ('SELECT DISTINCT people.id, people.name FROM people JOIN directors ON people.id = directors.person_id JOIN ratings ON directors.movie_id = ratings.movie_id WHERE rating > 9.0', '"At least" means >=.')],
    explain='Return id and name: two different directors can share a name, so DISTINCT name alone would merge them.')
sql('M11', C, 'movies', 'List the titles of the five highest-rated movies Helena Bonham Carter starred in, highest first.',
    "SELECT title FROM movies JOIN stars ON movies.id = stars.movie_id JOIN people ON stars.person_id = people.id JOIN ratings ON movies.id = ratings.movie_id WHERE people.name = 'Helena Bonham Carter' ORDER BY rating DESC, title LIMIT 5",
    ['JOIN', 'ORDER BY', 'LIMIT'], source=SRC + ' 11.sql', secs=120, level=2,
    explain='If two movies share a rating at the cut-off, the 5th title depends on the tie-break; this reference breaks ties by title.')
sql('M12', C, 'movies', 'List the titles of all movies in which both Johnny Depp and Helena Bonham Carter starred.',
    "SELECT title FROM movies WHERE id IN (SELECT movie_id FROM stars JOIN people ON stars.person_id = people.id WHERE name = 'Johnny Depp') AND id IN (SELECT movie_id FROM stars JOIN people ON stars.person_id = people.id WHERE name = 'Helena Bonham Carter')",
    ['subqueries', 'INTERSECT'], source=SRC + ' 12.sql', secs=150, level=3,
    variants=[("SELECT title FROM movies WHERE id IN (SELECT movie_id FROM stars JOIN people ON stars.person_id = people.id WHERE name = 'Johnny Depp' OR name = 'Helena Bonham Carter')", 'OR returns movies with either actor. Both must appear.')])
sql('M13', C, 'movies', 'List the names of all people who starred in a movie in which Kevin Bacon (born 1958) also starred. Exclude Kevin Bacon himself.',
    "SELECT DISTINCT people.id, people.name FROM people JOIN stars ON people.id = stars.person_id WHERE stars.movie_id IN (SELECT movie_id FROM stars WHERE person_id = (SELECT id FROM people WHERE name = 'Kevin Bacon' AND birth = 1958)) AND people.id <> (SELECT id FROM people WHERE name = 'Kevin Bacon' AND birth = 1958)",
    ['subqueries', 'DISTINCT'], source=SRC + ' 13.sql (id and name)', secs=180, level=3,
    variants=[("SELECT DISTINCT people.id, people.name FROM people JOIN stars ON people.id = stars.person_id WHERE stars.movie_id IN (SELECT movie_id FROM stars WHERE person_id = (SELECT id FROM people WHERE name = 'Kevin Bacon' AND birth = 1958))", 'Kevin Bacon himself must be excluded.')])
# exam-bank style variants per year
for y in (2000, 2005, 2010, 2015):
    sql(f'MY{y}A', C, 'movies', f'Find the average rating and the number of rated movies released in {y} (one row: average, count).',
        f'SELECT AVG(rating), COUNT(*) FROM movies JOIN ratings ON movies.id = ratings.movie_id WHERE year = {y}', ['JOIN', 'aggregates'], group='MY', secs=60,
        variants=[(f'SELECT AVG(rating), (SELECT COUNT(*) FROM movies WHERE year = {y}) FROM movies JOIN ratings ON movies.id = ratings.movie_id WHERE year = {y}', 'Your count includes movies without a rating.')])
    sql(f'MY{y}B', C, 'movies', f'Count rated movies released in {y} that received at least 10000 votes.',
        f'SELECT COUNT(*) FROM movies JOIN ratings ON movies.id = ratings.movie_id WHERE year = {y} AND votes >= 10000', ['JOIN', 'WHERE'], group='MY', secs=60,
        variants=[(f'SELECT COUNT(*) FROM movies JOIN ratings ON movies.id = ratings.movie_id WHERE year = {y} AND votes > 10000', 'At least means >=.')])
    sql(f'MY{y}C', C, 'movies', f'Show title and rating of movies released in {y} with a rating of at least 8.0 and at least 10000 votes, highest rating first.',
        f'SELECT title, rating FROM movies JOIN ratings ON movies.id = ratings.movie_id WHERE year = {y} AND rating >= 8.0 AND votes >= 10000 ORDER BY rating DESC', ['JOIN', 'ORDER BY'], order=[1], group='MY', secs=90)
    sql(f'MY{y}D', C, 'movies', f'How many different people starred in at least one movie released in {y}? (Count people, not appearances.)',
        f'SELECT COUNT(DISTINCT stars.person_id) FROM stars JOIN movies ON stars.movie_id = movies.id WHERE movies.year = {y}', ['JOIN', 'DISTINCT'], group='MY', secs=90, level=2,
        variants=[(f'SELECT COUNT(*) FROM stars JOIN movies ON stars.movie_id = movies.id WHERE movies.year = {y}', 'That counts appearances. People in several movies are counted more than once – use COUNT(DISTINCT person_id).'),
                  (f'SELECT COUNT(DISTINCT people.name) FROM stars JOIN movies ON stars.movie_id = movies.id JOIN people ON people.id = stars.person_id WHERE movies.year = {y}', 'Different people can share a name – count distinct ids, not names.')])
sql('MY01', C, 'movies', 'Show average movie rating by release year from 2010 through 2015 (columns: year, average), oldest first.',
    'SELECT year, AVG(rating) FROM movies JOIN ratings ON movies.id = ratings.movie_id WHERE year BETWEEN 2010 AND 2015 GROUP BY year ORDER BY year', ['GROUP BY', 'BETWEEN'], order=[0], group='MY', secs=90)
sql('MY02', C, 'movies', 'Show the names of directors with at least three movies released in 2015, and their number of 2015 movies, most first (columns: name, movies).',
    'SELECT people.name, COUNT(*) AS n FROM directors JOIN movies ON directors.movie_id = movies.id JOIN people ON people.id = directors.person_id WHERE year = 2015 GROUP BY people.id, people.name HAVING COUNT(*) >= 3 ORDER BY n DESC',
    ['GROUP BY', 'HAVING', 'JOIN'], order=[1], group='MY', secs=150, level=3,
    variants=[('SELECT people.name, COUNT(*) AS n FROM directors JOIN movies ON directors.movie_id = movies.id JOIN people ON people.id = directors.person_id WHERE year = 2015 GROUP BY people.name HAVING COUNT(*) >= 3 ORDER BY n DESC', 'Grouping by name merges different directors who share a name – group by id.')])

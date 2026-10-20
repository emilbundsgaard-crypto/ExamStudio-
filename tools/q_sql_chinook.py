from qlib import sql, run

SRC = 'PWC SQL assignment'
C = 'chinook'
DB = 'chinook'
# Original PWC questions. Expected answers from "PWC answers.docx" are asserted where the document gives one.
def chk(qid, got, want):
    assert abs(float(got) - float(want)) < 1e-9 if isinstance(want, (int, float)) else str(got) == want, (qid, got, want)

_, r = sql('C01', C, DB, 'How many columns does the Customer table have? (Return one number.)',
           "SELECT COUNT(*) FROM pragma_table_info('Customer')", ['schema'], source=SRC + ' Q1', secs=45,
           hint="SQLite: SELECT * FROM pragma_table_info('Customer') lists the columns.")
chk('C01', r[0][0], 13)
_, r = sql('C02', C, DB, 'If you select only the first 5 rows of Customer (by CustomerId), what is the country in the last row?',
           'SELECT Country FROM (SELECT * FROM Customer ORDER BY CustomerId LIMIT 5) ORDER BY CustomerId DESC LIMIT 1', ['LIMIT', 'ORDER BY'], source=SRC + ' Q2', secs=45)
chk('C02', r[0][0], 'Czech Republic')
_, r = sql('C03', C, DB, 'If you sort Customer on last name, what is the last name in the third row?',
           'SELECT LastName FROM Customer ORDER BY LastName LIMIT 1 OFFSET 2', ['ORDER BY', 'LIMIT/OFFSET'], source=SRC + ' Q3', secs=45)
chk('C03', r[0][0], 'Bernard')
_, r = sql('C04', C, DB, 'How many rows are in the Invoice table?', 'SELECT COUNT(*) FROM Invoice', ['COUNT'], source=SRC + ' Q4', secs=20)
chk('C04', r[0][0], 412)
_, r = sql('C05', C, DB, 'How many invoices have totals greater than $20?', 'SELECT COUNT(*) FROM Invoice WHERE Total > 20', ['WHERE'], source=SRC + ' Q5', secs=30,
           variants=[('SELECT COUNT(*) FROM Invoice WHERE Total >= 20', 'Greater than excludes 20 itself.')])
chk('C05', r[0][0], 4)
_, r = sql('C06', C, DB, 'How many invoices have totals greater than $10 and less than $20?', 'SELECT COUNT(*) FROM Invoice WHERE Total > 10 AND Total < 20', ['WHERE', 'AND'], source=SRC + ' Q6', secs=30,
           variants=[('SELECT COUNT(*) FROM Invoice WHERE Total BETWEEN 10 AND 20', 'BETWEEN includes both end points; the question excludes them.')])
chk('C06', r[0][0], 60)
_, r = sql('C07', C, DB, 'How many invoices are from customers in Brazil, Argentina or Chile? (Use the customer\'s country.)',
           "SELECT COUNT(*) FROM Invoice JOIN Customer ON Invoice.CustomerId = Customer.CustomerId WHERE Customer.Country IN ('Brazil','Argentina','Chile')", ['IN', 'JOIN'], source=SRC + ' Q7', secs=60)
chk('C07', r[0][0], 49)
_, r = sql('C08', C, DB, 'How many invoices have a billing country that starts with "C"?', "SELECT COUNT(*) FROM Invoice WHERE BillingCountry LIKE 'C%'", ['LIKE'], source=SRC + ' Q8', secs=30,
           variants=[("SELECT COUNT(*) FROM Invoice WHERE BillingCountry LIKE '%C%'", '"%C%" finds a C anywhere. Starts with C is \'C%\'.')])
chk('C08', r[0][0], 77)
_, r = sql('C09', C, DB, 'How many customers list their company?', 'SELECT COUNT(Company) FROM Customer', ['COUNT', 'NULL'], source=SRC + ' Q9', secs=30,
           variants=[('SELECT COUNT(*) FROM Customer', 'COUNT(*) counts all rows. COUNT(Company) skips NULLs.')])
chk('C09', r[0][0], 10)
_, r = sql('C10', C, DB, 'How many employees does Chinook have?', 'SELECT COUNT(*) FROM Employee', ['COUNT'], source=SRC + ' Q10', secs=20)
chk('C10', r[0][0], 8)
sql('C11', C, DB, 'Show each employee\'s last name and phone number without the area code, i.e. the part after ") " (columns: LastName, phone).',
    "SELECT LastName, SUBSTR(Phone, INSTR(Phone, ') ') + 2) FROM Employee", ['text functions', 'SUBSTR', 'INSTR'], source=SRC + ' Q11', secs=90, level=2)
_, r = sql('C12', C, DB, 'How long is the longest employee last name (number of characters)?', 'SELECT MAX(LENGTH(LastName)) FROM Employee', ['LENGTH', 'MAX'], source=SRC + ' Q12', secs=30)
chk('C12', r[0][0], 8)
_, r = sql('C13', C, DB, 'How many employees were born on a Sunday?', "SELECT COUNT(*) FROM Employee WHERE strftime('%w', BirthDate) = '0'", ['dates', 'strftime'], source=SRC + ' Q13', secs=60,
           hint="strftime('%w', date) returns 0 for Sunday … 6 for Saturday.")
chk('C13', r[0][0], 2)
sql('C14', C, DB, 'How old (in whole completed years) was the oldest employee when hired? Return one number.',
    "SELECT MAX(CAST((julianday(HireDate) - julianday(BirthDate)) / 365.25 AS INTEGER)) FROM Employee", ['dates', 'julianday'], source=SRC + ' Q14 (answer key: approx. 55.5 years)', secs=90, level=2)
sql('C15', C, DB, 'Return a list of billing countries by the total value of invoices, largest first (columns: BillingCountry, total).',
    'SELECT BillingCountry, SUM(Total) AS t FROM Invoice GROUP BY BillingCountry ORDER BY t DESC', ['GROUP BY', 'SUM'], order=[1], source=SRC + ' Q15', secs=60)
_, r = sql('C16', C, DB, 'How many invoice line items are there?', 'SELECT COUNT(*) FROM InvoiceLine', ['COUNT'], source=SRC + ' Q16', secs=20)
chk('C16', r[0][0], 2240)
_, r = sql('C17', C, DB, 'How many distinct unit prices are there in InvoiceLine?', 'SELECT COUNT(DISTINCT UnitPrice) FROM InvoiceLine', ['DISTINCT'], source=SRC + ' Q17', secs=30)
chk('C17', r[0][0], 2)
sql('C18', C, DB, 'How many downloads (units sold) of each price have happened? (columns: UnitPrice, downloads)',
    'SELECT UnitPrice, SUM(Quantity) FROM InvoiceLine GROUP BY UnitPrice', ['GROUP BY'], source=SRC + ' Q18', secs=45)
_, r = sql('C19', C, DB, 'What is the largest number of times a single track has been downloaded, and how many tracks share that number? (one row: downloads, tracks)',
           'SELECT n, COUNT(*) FROM (SELECT TrackId, SUM(Quantity) AS n FROM InvoiceLine GROUP BY TrackId) WHERE n = (SELECT MAX(n) FROM (SELECT SUM(Quantity) AS n FROM InvoiceLine GROUP BY TrackId))',
           ['subqueries', 'GROUP BY'], source=SRC + ' Q19', secs=120, level=3)
assert r[0] == [2, 256], r
sql('C20', C, DB, 'What is the range of invoice dates: the first date, the last date and the number of days between them?',
    'SELECT MIN(InvoiceDate), MAX(InvoiceDate), julianday(MAX(InvoiceDate)) - julianday(MIN(InvoiceDate)) FROM Invoice', ['dates', 'MIN/MAX'], source=SRC + ' Q20', secs=60)
_, r = sql('C22', C, DB, 'How many distinct albums have at least one track that was downloaded?',
           'SELECT COUNT(DISTINCT Track.AlbumId) FROM InvoiceLine JOIN Track ON InvoiceLine.TrackId = Track.TrackId', ['JOIN', 'DISTINCT'], source=SRC + ' Q22 (simpler definition than the answer key\'s)', secs=60)
_, r = sql('C23', C, DB, 'What is the most popular genre by units sold, and how many units? (one row: genre, units)',
           'SELECT Genre.Name, SUM(InvoiceLine.Quantity) AS u FROM InvoiceLine JOIN Track ON InvoiceLine.TrackId = Track.TrackId JOIN Genre ON Track.GenreId = Genre.GenreId GROUP BY Genre.GenreId, Genre.Name ORDER BY u DESC LIMIT 1',
           ['JOIN', 'GROUP BY', 'ORDER BY'], source=SRC + ' Q23', secs=90, level=2)
chk('C23', r[0][0], 'Rock')
# exam-bank variants
for ctry in ['Brazil', 'Germany', 'USA', 'Canada', 'France']:
    sql(f'CV{ctry[:3]}1', C, DB, f'Show customer first name, last name and the total of their invoices billed to {ctry}, largest total first.',
        f"SELECT c.FirstName, c.LastName, SUM(i.Total) AS t FROM Invoice i JOIN Customer c ON i.CustomerId = c.CustomerId WHERE i.BillingCountry = '{ctry}' GROUP BY c.CustomerId, c.FirstName, c.LastName ORDER BY t DESC",
        ['JOIN', 'GROUP BY'], order=[2], group='CV', secs=90,
        variants=[(f"SELECT c.FirstName, c.LastName, i.Total FROM Invoice i JOIN Customer c ON i.CustomerId = c.CustomerId WHERE i.BillingCountry = '{ctry}' ORDER BY i.Total DESC", 'You listed every invoice. Sum per customer with GROUP BY.')])
    sql(f'CV{ctry[:3]}2', C, DB, f'Show total units sold (Quantity) by genre name on invoices billed to {ctry}, most units first (columns: genre, units).',
        f"SELECT g.Name, SUM(il.Quantity) AS u FROM InvoiceLine il JOIN Invoice i ON il.InvoiceId = i.InvoiceId JOIN Track t ON il.TrackId = t.TrackId JOIN Genre g ON t.GenreId = g.GenreId WHERE i.BillingCountry = '{ctry}' GROUP BY g.GenreId, g.Name ORDER BY u DESC",
        ['JOIN', 'GROUP BY', 'multi-table joins'], order=[1], group='CV', secs=150, level=3,
        variants=[(f"SELECT g.Name, COUNT(DISTINCT il.TrackId) AS u FROM InvoiceLine il JOIN Invoice i ON il.InvoiceId = i.InvoiceId JOIN Track t ON il.TrackId = t.TrackId JOIN Genre g ON t.GenreId = g.GenreId WHERE i.BillingCountry = '{ctry}' GROUP BY g.GenreId ORDER BY u DESC", 'You counted distinct tracks. Units are recorded in Quantity – use SUM(Quantity).')])
sql('CV01', C, DB, 'Show each support representative\'s last name and the number of customers they support, most first (columns: LastName, customers).',
    'SELECT e.LastName, COUNT(*) AS n FROM Customer c JOIN Employee e ON c.SupportRepId = e.EmployeeId GROUP BY e.EmployeeId, e.LastName ORDER BY n DESC', ['JOIN', 'GROUP BY'], order=[1], group='CV', secs=90)
sql('CV02', C, DB, 'Show invoice IDs and totals for invoices above 15, highest first (columns: InvoiceId, Total).',
    'SELECT InvoiceId, Total FROM Invoice WHERE Total > 15 ORDER BY Total DESC', ['WHERE', 'ORDER BY'], order=[1], group='CV', secs=45)
sql('CV03', C, DB, 'Show total invoice value per year (columns: year, total), oldest first.',
    "SELECT strftime('%Y', InvoiceDate) AS y, SUM(Total) FROM Invoice GROUP BY y ORDER BY y", ['dates', 'GROUP BY'], order=[0], group='CV', secs=60)
sql('CV04', C, DB, 'Which 5 artists have the most tracks in the catalogue? (columns: artist name, tracks), most first.',
    'SELECT ar.Name, COUNT(*) AS n FROM Track t JOIN Album al ON t.AlbumId = al.AlbumId JOIN Artist ar ON al.ArtistId = ar.ArtistId GROUP BY ar.ArtistId, ar.Name ORDER BY n DESC LIMIT 5',
    ['JOIN', 'GROUP BY', 'LIMIT'], order=[1], group='CV', secs=120, level=2)

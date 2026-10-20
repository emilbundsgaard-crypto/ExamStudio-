from qlib import sql

SRC = 'Analytics mindset – P-card case'
C = 'pcards'
DB = 'pcards'
NOTE = ' Use the Year and Month columns for periods. Purchases have Amount > 0; returns/refunds have Amount < 0.'

# ---------------- Task 4: basic querying
sql('P01', C, DB, 'What is the total number of P-card transactions in the database? Label the column TotalTrans.',
    'SELECT COUNT(*) AS TotalTrans FROM pcards', ['COUNT'], source=SRC + ' Task 4.1', secs=20)
sql('P02', C, DB, 'How many transactions have an amount of $5,000 or more? Label the column TotalTransGT5k.',
    'SELECT COUNT(*) AS TotalTransGT5k FROM pcards WHERE Amount >= 5000', ['WHERE'], source=SRC + ' Task 4.2', secs=30,
    variants=[('SELECT COUNT(*) FROM pcards WHERE Amount > 5000', '"More than or equal to" includes exactly 5,000.')])
sql('P03', C, DB, 'What is the total dollar amount of returns (negative amounts) from January to March 2014, inclusive? Label it TotalReturns2014Q1.' + NOTE,
    'SELECT SUM(Amount) AS TotalReturns2014Q1 FROM pcards WHERE Amount < 0 AND Year = 2014 AND Month BETWEEN 1 AND 3', ['WHERE', 'SUM', 'BETWEEN'], source=SRC + ' Task 4.3', secs=60,
    variants=[('SELECT SUM(Amount) FROM pcards WHERE Year = 2014 AND Month BETWEEN 1 AND 3', 'That is the net of purchases and returns. Returns are the negative amounts only.'),
              ('SELECT SUM(Amount) FROM pcards WHERE Amount < 0 AND Year = 2014 AND Month BETWEEN 1 AND 2', 'Inclusive of March: Month BETWEEN 1 AND 3.')])
sql('P04', C, DB, 'Show the number of transactions for each year, most recent year first (columns: Year, TotalTrans).',
    'SELECT Year, COUNT(*) AS TotalTrans FROM pcards GROUP BY Year ORDER BY Year DESC', ['GROUP BY', 'ORDER BY'], order=[0], source=SRC + ' Task 4.4', secs=45)
sql('P05', C, DB, 'List cardholders (FullName) who had more than 10 transactions in 2014, most transactions first (columns: FullName, NumTrans).' + NOTE,
    'SELECT FullName, COUNT(*) AS NumTrans FROM pcards WHERE Year = 2014 GROUP BY FullName HAVING COUNT(*) > 10 ORDER BY NumTrans DESC', ['GROUP BY', 'HAVING'], order=[1], source=SRC + ' Task 4.5/4.7', secs=90,
    variants=[('SELECT FullName, COUNT(*) AS NumTrans FROM pcards WHERE Year = 2014 GROUP BY FullName ORDER BY NumTrans DESC', 'Only cardholders with more than 10 transactions – add HAVING COUNT(*) > 10.'),
              ('SELECT FullName, COUNT(*) AS NumTrans FROM pcards GROUP BY FullName HAVING COUNT(*) > 10 ORDER BY NumTrans DESC', 'Restrict to Year = 2014 before grouping.')])
sql('P06', C, DB, 'List people who returned more than $1,000 of goods in 2014, largest returned value first. Columns: FullName, ReturnedGoodsValue (as a positive number), ReturnedGoodsCount.' + NOTE,
    'SELECT FullName, -SUM(Amount) AS ReturnedGoodsValue, COUNT(*) AS ReturnedGoodsCount FROM pcards WHERE Year = 2014 AND Amount < 0 GROUP BY FullName HAVING -SUM(Amount) > 1000 ORDER BY ReturnedGoodsValue DESC',
    ['GROUP BY', 'HAVING', 'WHERE'], order=[1], source=SRC + ' Task 4.6/4.8', secs=120, level=2,
    variants=[('SELECT FullName, -SUM(Amount) AS v, COUNT(*) FROM pcards WHERE Year = 2014 AND Amount < 0 GROUP BY FullName HAVING SUM(Amount) > 1000 ORDER BY v DESC', 'Returns are negative: SUM(Amount) is never > 1000. Compare the positive value (−SUM) or use SUM(Amount) < −1000.')])
sql('P07', C, DB, 'OSU would earn 0.75% on Amazon.com purchases of $500 or more and 0.50% on smaller ones. What would OSU have earned in 2014? Label the column AmazonEarning. (Vendor is "Amazon.com" in any capitalisation; purchases only.)' + NOTE,
    "SELECT SUM(CASE WHEN Amount >= 500 THEN Amount * 0.0075 ELSE Amount * 0.005 END) AS AmazonEarning FROM pcards WHERE Year = 2014 AND Vendor LIKE 'amazon.com' AND Amount > 0",
    ['CASE WHEN', 'SUM'], source=SRC + ' Task 4 (Amazon)', secs=120, level=2,
    variants=[("SELECT SUM(CASE WHEN Amount >= 500 THEN Amount * 0.0075 ELSE Amount * 0.005 END) FROM pcards WHERE Year = 2014 AND Vendor = 'Amazon.com' AND Amount > 0", 'In SQLite = is case-sensitive: some transactions are recorded as "AMAZON.COM". LIKE ignores case.'),
              ("SELECT SUM(CASE WHEN Amount >= 500 THEN Amount * 0.0075 ELSE Amount * 0.005 END) FROM pcards WHERE Year = 2014 AND Vendor LIKE '%amazon%' AND Amount > 0", '%amazon% also matches Amazon Marketplace, Kindle, Web Services … – the question is about the vendor Amazon.com.'),
              ("SELECT SUM(CASE WHEN Amount >= 500 THEN Amount * 0.0075 ELSE Amount * 0.005 END) FROM pcards WHERE Year = 2014 AND Vendor LIKE 'amazon.com'", 'Refunds are included – earnings apply to purchases (Amount > 0).')])
sql('P08', C, DB, 'For vendors with purchases in both 2013 and 2014, show how much more (or less) was spent in 2014 than in 2013. Columns: Vendor, DiffSpending; largest increase first; show the top 10.' + NOTE,
    'SELECT Vendor, SUM(CASE WHEN Year = 2014 THEN Amount ELSE 0 END) - SUM(CASE WHEN Year = 2013 THEN Amount ELSE 0 END) AS DiffSpending FROM pcards WHERE Year IN (2013, 2014) GROUP BY Vendor HAVING SUM(Year = 2013 AND Amount > 0) > 0 AND SUM(Year = 2014 AND Amount > 0) > 0 ORDER BY DiffSpending DESC LIMIT 10',
    ['CASE WHEN', 'GROUP BY', 'HAVING'], order=[1], source=SRC + ' Task 4 (vendor change)', secs=240, level=3)
# ---------------- Task 5: tests of internal controls (2014)
sql('P10', C, DB, 'Control: single transactions must not exceed $5,000. How many 2014 purchases exceed $5,000, and what is their total? (one row: count, total)' + NOTE,
    'SELECT COUNT(*), SUM(Amount) FROM pcards WHERE Year = 2014 AND Amount > 5000', ['internal control', 'WHERE'], source=SRC + ' Task 5', secs=60,
    variants=[('SELECT COUNT(*), SUM(Amount) FROM pcards WHERE Amount > 5000', 'Restrict to 2014.')])
sql('P11', C, DB, 'Split purchases (same cardholder, same vendor, same TransactionDate): find 2014 groups with more than one transaction whose combined total exceeds $5,000. Columns: FullName, Vendor, TransactionDate, number of transactions, total.' + NOTE,
    'SELECT FullName, Vendor, TransactionDate, COUNT(*) AS n, SUM(Amount) AS total FROM pcards WHERE Year = 2014 GROUP BY FullName, Vendor, TransactionDate HAVING COUNT(*) > 1 AND SUM(Amount) > 5000',
    ['internal control', 'GROUP BY', 'HAVING'], source=SRC + ' Task 5 (split purchases)', secs=240, level=3,
    variants=[('SELECT FullName, Vendor, TransactionDate, COUNT(*), SUM(Amount) FROM pcards WHERE Year = 2014 GROUP BY FullName, Vendor, TransactionDate HAVING SUM(Amount) > 5000', 'A single large purchase is not a split – require COUNT(*) > 1.'),
              ('SELECT FullName, Vendor, TransactionDate, COUNT(*), SUM(Amount) FROM pcards WHERE Year = 2014 GROUP BY FullName, TransactionDate HAVING COUNT(*) > 1 AND SUM(Amount) > 5000', 'Group by vendor as well – this test is the same person at the same vendor.')])
sql('P12', C, DB, 'Split between two cardholders: find 2014 vendor/date combinations with exactly two different cardholders and a combined total above $5,000. Columns: Vendor, TransactionDate, cardholders, total.' + NOTE,
    'SELECT Vendor, TransactionDate, COUNT(DISTINCT FullName) AS holders, SUM(Amount) AS total FROM pcards WHERE Year = 2014 GROUP BY Vendor, TransactionDate HAVING COUNT(DISTINCT FullName) = 2 AND SUM(Amount) > 5000',
    ['internal control', 'COUNT DISTINCT', 'HAVING'], source=SRC + ' Task 5 (split between cardholders)', secs=240, level=3,
    variants=[('SELECT Vendor, TransactionDate, COUNT(*), SUM(Amount) FROM pcards WHERE Year = 2014 GROUP BY Vendor, TransactionDate HAVING COUNT(*) = 2 AND SUM(Amount) > 5000', 'COUNT(*) counts transactions; the test is about two different cardholders – COUNT(DISTINCT FullName).')])
# ---------------- Task 7: forensic tests
sql('P13', C, DB, 'Possible duplicate payments: in 2014, how many groups of transactions share the same cardholder, vendor, TransactionDate and Amount (more than one row)? Return one number.' + NOTE,
    'SELECT COUNT(*) FROM (SELECT 1 FROM pcards WHERE Year = 2014 GROUP BY FullName, Vendor, TransactionDate, Amount HAVING COUNT(*) > 1)', ['forensics', 'GROUP BY', 'subqueries'], source=SRC + ' Task 7', secs=180, level=3)
sql('P14', C, DB, 'Who has the most possible duplicate groups in 2014 (same vendor, date and amount)? List the 5 cardholders with the most such groups (columns: FullName, groups), most first.' + NOTE,
    'SELECT FullName, COUNT(*) AS g FROM (SELECT FullName FROM pcards WHERE Year = 2014 GROUP BY FullName, Vendor, TransactionDate, Amount HAVING COUNT(*) > 1) GROUP BY FullName ORDER BY g DESC LIMIT 5',
    ['forensics', 'subqueries'], order=[1], source=SRC + ' Task 7', secs=180, level=3)
sql('P15', C, DB, 'Round-number test: how many 2014 transactions have a four-digit whole-dollar amount ending in 000 (1000, 2000 … 9000), and what is their total?' + NOTE,
    'SELECT COUNT(*), SUM(Amount) FROM pcards WHERE Year = 2014 AND Amount IN (1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000)', ['forensics', 'IN'], source=SRC + ' Task 7', secs=90, level=2,
    variants=[('SELECT COUNT(*), SUM(Amount) FROM pcards WHERE Year = 2014 AND Amount % 1000 = 0', 'Without a range you also catch 0, negative refunds and amounts ≥ 10,000.')])
# ---------------- exam-bank variants
for v, kw in [('AMAZON', 'AMAZON'), ('WAL-MART', 'WAL-MART'), ('OFFICE', 'OFFICE'), ('HOTEL', 'HOTEL'), ('DELL', 'DELL')]:
    sql(f'PV{kw[:3]}', C, DB, f'Find the number and total Amount of purchases (Amount > 0) from vendors whose name contains {kw} (any case), all years.',
        f"SELECT COUNT(*), SUM(Amount) FROM pcards WHERE Vendor LIKE '%{kw}%' AND Amount > 0", ['LIKE', 'aggregates'], group='PV', secs=60,
        variants=[(f"SELECT COUNT(*), SUM(Amount) FROM pcards WHERE Vendor LIKE '%{kw}%'", 'Refunds are included – purchases only (Amount > 0).'),
                  (f"SELECT COUNT(*), SUM(Amount) FROM pcards WHERE instr(Vendor, '{kw}') > 0 AND Amount > 0", 'instr() is case-sensitive; "any case" needs LIKE (or UPPER()).'),
                  (f"SELECT COUNT(*), SUM(Amount) FROM pcards WHERE Vendor = '{kw}' AND Amount > 0", '= needs an exact match. Use LIKE with % wildcards.')])
for y in (2011, 2012, 2013):
    sql(f'PY{y}', C, DB, f'Show cardholders with purchases (Amount > 0) totalling more than $100,000 in {y}, largest total first (columns: FullName, total).' + NOTE,
        f'SELECT FullName, SUM(Amount) AS t FROM pcards WHERE Year = {y} AND Amount > 0 GROUP BY FullName HAVING SUM(Amount) > 100000 ORDER BY t DESC',
        ['GROUP BY', 'HAVING'], order=[1], group='PY', secs=90,
        variants=[(f'SELECT FullName, SUM(Amount) AS t FROM pcards WHERE Year = {y} GROUP BY FullName HAVING SUM(Amount) > 100000 ORDER BY t DESC', 'Refunds were netted in – the question is about purchases only.')])
    sql(f'PY{y}R', C, DB, f'In {y}, how many refunds (Amount < 0) were there and what is their total value as a positive number?' + NOTE,
        f'SELECT COUNT(*), -SUM(Amount) FROM pcards WHERE Year = {y} AND Amount < 0', ['WHERE', 'aggregates'], group='PY', secs=45)
sql('PM01', C, DB, 'Which merchant category (MCC) had the highest total purchases in 2014? Show the top 5 (columns: MCC, total), largest first.' + NOTE,
    'SELECT MCC, SUM(Amount) AS t FROM pcards WHERE Year = 2014 AND Amount > 0 GROUP BY MCC ORDER BY t DESC LIMIT 5', ['GROUP BY', 'LIMIT'], order=[1], group='PV', secs=90)

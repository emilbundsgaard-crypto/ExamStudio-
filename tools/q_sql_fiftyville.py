from qlib import sql

SRC = 'CS50 Fiftyville mystery (optional)'
C = 'fiftyville'
DB = 'fiftyville'
sql('Z01', C, DB, 'Find the crime scene report for the theft of the duck on 28 July 2020 on Chamberlin Street. Return its id and description.',
    "SELECT id, description FROM crime_scene_reports WHERE year = 2020 AND month = 7 AND day = 28 AND street = 'Chamberlin Street'", ['WHERE'], source=SRC, secs=60)
sql('Z02', C, DB, 'Which interviews from 28 July 2020 mention the courthouse? Return name and transcript.',
    "SELECT name, transcript FROM interviews WHERE year = 2020 AND month = 7 AND day = 28 AND transcript LIKE '%courthouse%'", ['LIKE'], source=SRC, secs=60)
sql('Z03', C, DB, 'Who is the thief? Combine the evidence (courthouse exit 10:15–10:25, ATM withdrawal on Fifer Street, a call under a minute, earliest flight out on 29 July). Return one name.',
    """SELECT name FROM people
WHERE license_plate IN (SELECT license_plate FROM courthouse_security_logs WHERE year=2020 AND month=7 AND day=28 AND hour=10 AND minute BETWEEN 15 AND 25 AND activity='exit')
AND id IN (SELECT person_id FROM bank_accounts WHERE account_number IN (SELECT account_number FROM atm_transactions WHERE year=2020 AND month=7 AND day=28 AND atm_location='Fifer Street' AND transaction_type='withdraw'))
AND phone_number IN (SELECT caller FROM phone_calls WHERE year=2020 AND month=7 AND day=28 AND duration < 60)
AND passport_number IN (SELECT passport_number FROM passengers WHERE flight_id = (SELECT id FROM flights WHERE year=2020 AND month=7 AND day=29 AND origin_airport_id=(SELECT id FROM airports WHERE city='Fiftyville') ORDER BY hour, minute LIMIT 1))""",
    ['subqueries', 'investigation'], source=SRC, secs=900, level=3)
sql('Z04', C, DB, 'Which city did the thief escape to? Return one city name.',
    "SELECT city FROM airports WHERE id = (SELECT destination_airport_id FROM flights WHERE year=2020 AND month=7 AND day=29 AND origin_airport_id=(SELECT id FROM airports WHERE city='Fiftyville') ORDER BY hour, minute LIMIT 1)",
    ['subqueries', 'investigation'], source=SRC, secs=300, level=3)

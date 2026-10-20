import sys, os, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qlib
mods = sys.argv[1:] or ['q_film', 'q_etl', 'q_integrate', 'q_restaurant', 'q_sql_songs', 'q_sql_movies', 'q_sql_chinook', 'q_sql_pcards', 'q_sql_fiftyville']
for m in mods:
    if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), m + '.py')):
        n0 = len(qlib.QUESTIONS)
        importlib.import_module(m)
        print(f'{m}: {len(qlib.QUESTIONS) - n0}')
qlib.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'questions.json'))

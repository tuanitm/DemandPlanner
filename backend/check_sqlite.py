import sqlite3
import pandas as pd

def check_sqlite():
    conn = sqlite3.connect('demandplanner.db')
    tables = pd.read_sql_query("SELECT name FROM sqlite_master WHERE type='table'", conn)
    
    print("Tables and row counts in SQLite:")
    for index, row in tables.iterrows():
        table_name = row['name']
        try:
            count = pd.read_sql_query(f"SELECT COUNT(*) as cnt FROM {table_name}", conn).iloc[0]['cnt']
            print(f"- {table_name}: {count} rows")
        except Exception as e:
            print(f"- {table_name}: Error {e}")
    conn.close()

if __name__ == "__main__":
    check_sqlite()

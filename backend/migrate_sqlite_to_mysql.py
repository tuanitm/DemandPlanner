import os
from sqlalchemy import create_engine, MetaData, Table, inspect, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Ensure we're in the backend directory for relative paths
backend_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(backend_dir)

load_dotenv()

# URLs
SQLITE_URL = "sqlite:///./demandplanner.db"
# Retrieve the MySQL URL from .env, remembering to replace %%40 back to %40 if it exists
MYSQL_URL = os.environ.get("DATABASE_URL_SYNC", "").replace("%%", "%")

if not MYSQL_URL:
    print("MySQL URL not found in .env")
    exit(1)

# Engines
sqlite_engine = create_engine(SQLITE_URL)
mysql_engine = create_engine(MYSQL_URL)

# Reflect metadata from SQLite to get table structures and order
metadata = MetaData()
metadata.reflect(bind=sqlite_engine)

def migrate_data():
    # Use sorted_tables to insert in dependency order (parents before children)
    tables = metadata.sorted_tables
    
    print(f"Found {len(tables)} tables to migrate.")
    
    with sqlite_engine.connect() as sqlite_conn:
        with mysql_engine.begin() as mysql_conn:
            # We temporarily disable foreign key checks just in case there are circular dependencies
            # or if the sorted_tables is not perfectly resolving everything in this specific schema
            mysql_conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))

            for table in tables:
                if table.name == 'alembic_version':
                    continue # Skip Alembic version table since MySQL has its own
                
                print(f"Migrating table: {table.name}...")
                
                # Fetch all rows from SQLite
                rows = sqlite_conn.execute(table.select()).fetchall()
                print(f"  - Found {len(rows)} rows.")
                
                if not rows:
                    continue
                
                # Insert rows into MySQL
                # Fetch target table columns to handle schema differences (like dropped/added columns)
                mysql_metadata = MetaData()
                mysql_metadata.reflect(bind=mysql_engine, only=[table.name])
                mysql_table = mysql_metadata.tables[table.name]
                mysql_keys = mysql_table.columns.keys()
                
                sqlite_keys = table.columns.keys()
                common_keys = [k for k in sqlite_keys if k in mysql_keys]
                
                insert_data = []
                for row in rows:
                    row_dict = dict(zip(sqlite_keys, row))
                    filtered_dict = {k: row_dict[k] for k in common_keys}
                    insert_data.append(filtered_dict)
                
                try:
                    # Truncate table first to be safe, if there's any existing data
                    mysql_conn.execute(table.delete())
                    
                    # Insert
                    mysql_conn.execute(table.insert(), insert_data)
                    print(f"  - Inserted {len(insert_data)} rows successfully.")
                except Exception as e:
                    print(f"  - Error inserting into {table.name}: {e}")
                    
            mysql_conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))

    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate_data()

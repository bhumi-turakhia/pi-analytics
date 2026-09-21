from app.database import check_database_connection

if check_database_connection():
    print("PostgreSQL connection successful!")
else:
    print("PostgreSQL connection failed!")
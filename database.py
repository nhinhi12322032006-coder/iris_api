import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base


SERVER = r"localhost\MSSQLSERVER02"
DATABASE = "IrisAI_DB"

LOCAL_DATABASE_URL = (
    "mssql+pyodbc://"
    f"{SERVER}/{DATABASE}"
    "?driver=ODBC+Driver+18+for+SQL+Server"
    "&trusted_connection=yes"
    "&TrustServerCertificate=yes"
)

DATABASE_URL = os.getenv("DATABASE_URL") or LOCAL_DATABASE_URL

# Trên Render dùng PostgreSQL; trên máy cá nhân dùng SQL Server.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
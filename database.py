from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base


SERVER = r"localhost\MSSQLSERVER02"
DATABASE = "IrisAI_DB"


DATABASE_URL = (
    "mssql+pyodbc://"
    f"{SERVER}/{DATABASE}"
    "?driver=ODBC+Driver+18+for+SQL+Server"
    "&trusted_connection=yes"
    "&TrustServerCertificate=yes"
)


engine = create_engine(
    DATABASE_URL,
    echo=True
)


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
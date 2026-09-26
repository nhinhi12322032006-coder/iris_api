from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func

from database import Base


class User(Base):

    __tablename__ = "Users"

    User_ID = Column(
        Integer,
        primary_key=True,
        index=True
    )

    Username = Column(
        String(50),
        unique=True,
        nullable=False
    )

    Email = Column(
        String(100),
        unique=True,
        nullable=False
    )

    Password = Column(
        String(255),
        nullable=False
    )

    Role = Column(
        String(20),
        default="user"
    )

    Created_Time = Column(
        DateTime,
        server_default=func.now()
    )



class Prediction(Base):

    __tablename__ = "Predictions"


    Prediction_ID = Column(
        Integer,
        primary_key=True,
        index=True
    )


    User_ID = Column(
        Integer,
        ForeignKey("Users.User_ID")
    )


    Sepal_Length = Column(Float)

    Sepal_Width = Column(Float)

    Petal_Length = Column(Float)

    Petal_Width = Column(Float)


    Prediction = Column(
        String(50)
    )


    Confidence = Column(
        Float
    )


    Created_Time = Column(
        DateTime,
        server_default=func.now()
    )
    
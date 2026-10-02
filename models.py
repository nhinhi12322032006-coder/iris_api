from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func

from database import Base

# --- TÀI KHOẢN ---
class User(Base):
    __tablename__ = "Users"
    User_ID = Column(Integer, primary_key=True, index=True)
    Username = Column(String(50), unique=True, nullable=False)
    Email = Column(String(100), unique=True, nullable=False)
    Password = Column(String(255), nullable=False)
    Role = Column(String(20), default="user")
    Created_Time = Column(DateTime, server_default=func.now())

# --- LỊCH SỬ DỰ ĐOÁN ---
class Prediction(Base):
    __tablename__ = "Predictions"
    Prediction_ID = Column(Integer, primary_key=True, index=True)
    User_ID = Column(Integer, ForeignKey("Users.User_ID"))
    Sepal_Length = Column(Float)
    Sepal_Width = Column(Float)
    Petal_Length = Column(Float)
    Petal_Width = Column(Float)
    Prediction = Column(String(50))
    Confidence = Column(Float)
    Created_Time = Column(DateTime, server_default=func.now())

# --- MẪU NHANH VÀ THÔNG SỐ ĐẠI DIỆN ---
class IrisMau(Base):
    __tablename__ = "Iris_Mau"
    Mau_ID = Column(Integer, primary_key=True, index=True)
    Species_Name = Column(String(50), unique=True, nullable=False)
    Sepal_Length = Column(Float)
    Sepal_Width = Column(Float)
    Petal_Length = Column(Float)
    Petal_Width = Column(Float)
    Sample_Count = Column(Integer)

# --- ĐẶC ĐIỂM SƠ LƯỢC CHO KẾT QUẢ ---
class IrisSpeciesSoluoc(Base):
    __tablename__ = "Iris_Species_SOLUOC"
    Detail_ID = Column(Integer, primary_key=True, index=True)
    Species_Name = Column(String(50), unique=True, nullable=False)
    Petal_Feature = Column(String)
    Sepal_Feature = Column(String)
    General_Feature = Column(String)
    Habitat = Column(String)

# --- THẺ CHI TIẾT LOÀI ---
class IrisSpeciesChitiet(Base):
    __tablename__ = "Iris_Species_CHITIET"
    Analysis_ID = Column(Integer, primary_key=True, index=True)
    Species_Name = Column(String(50), unique=True, nullable=False)
    Petal_Detail = Column(String)
    Sepal_Detail = Column(String)
    Data_Analysis = Column(String)
    Physiological_Feature = Column(String)
    Habitat_Detail = Column(String)

# --- TỆP MẪU CHO DỰ ĐOÁN HÀNG LOẠT ---
class SampleFile(Base):
    __tablename__ = "Sample_Files"
    File_ID = Column(Integer, primary_key=True, index=True)
    File_Name = Column(String(100), nullable=False)
    File_Format = Column(String(20))
    Description = Column(String)
    File_Path = Column(String(255), nullable=False)
    Created_Time = Column(DateTime, server_default=func.now())

# --- DỮ LIỆU BIỂU ĐỒ PHÂN TÍCH ---
class IrisData(Base):
    __tablename__ = "Iris_Data"
    Data_ID = Column(Integer, primary_key=True, autoincrement=True)
    Sepal_Length = Column(Float, nullable=False)
    Sepal_Width = Column(Float, nullable=False)
    Petal_Length = Column(Float, nullable=False)
    Petal_Width = Column(Float, nullable=False)
    Species_Name = Column(String(50), nullable=False)

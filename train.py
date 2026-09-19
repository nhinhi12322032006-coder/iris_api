from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.svm import SVC
import joblib

# 1. Load dữ liệu Iris kinh điển
iris = load_iris()
X = iris.data
y = iris.target

# Chuẩn hóa tên nhãn về chữ viết thường để đồng bộ với JS
target_names = [name.lower() for name in iris.target_names]

# 2. Chia tập dữ liệu Train / Test (80% / 20%)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# 3. Khởi tạo mô hình Support Vector Machine (SVM)
model = SVC(kernel='rbf', probability=True, random_state=42)

# 4. Huấn luyện mô hình
model.fit(X_train, y_train)

# 5. Lưu mô hình và danh sách tên lớp hoa ra file .pkl
data_to_save = {
    'model': model,
    'target_names': target_names
}
joblib.dump(data_to_save, 'iris_svm_model.pkl')
print("-> Đã huấn luyện và lưu mô hình 'iris_svm_model.pkl' thành công!")

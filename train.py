from pathlib import Path

import joblib
import numpy as np
from sklearn.datasets import load_iris
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.svm import SVC
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.tree import DecisionTreeClassifier


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "iris_svm_model.pkl"

# Dùng cùng một tập kiểm thử để việc so sánh năm mô hình công bằng.
iris = load_iris()
X_train, X_test, y_train, y_test = train_test_split(
    iris.data,
    iris.target,
    test_size=0.2,
    random_state=42,
)
target_names = [name.lower() for name in iris.target_names]

models = {
    "svm_rbf": SVC(kernel="rbf", probability=True, random_state=42),
    "svm_linear": SVC(kernel="linear", probability=True, random_state=42),
    "logistic_regression": LogisticRegression(max_iter=1000, random_state=42),
    "knn": KNeighborsClassifier(n_neighbors=5),
    "decision_tree": DecisionTreeClassifier(max_depth=4, random_state=42),
}

model_names = {
    "svm_rbf": "SVM (RBF)",
    "svm_linear": "SVM (Linear)",
    "logistic_regression": "Logistic Regression",
    "knn": "K-Nearest Neighbors",
    "decision_tree": "Decision Tree",
}

model_types = {
    "svm_rbf": ("SVM", "Phi tuyến tính"),
    "svm_linear": ("SVM", "Tuyến tính"),
    "logistic_regression": ("Mô hình xác suất", "Tuyến tính"),
    "knn": ("Học dựa trên láng giềng", "Phi tuyến tính"),
    "decision_tree": ("Mô hình cây", "Phi tuyến tính"),
}

evaluations = {}
cross_validation = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
for key, current_model in models.items():
    current_model.fit(X_train, y_train)
    y_pred = current_model.predict(X_test)
    probabilities = current_model.predict_proba(X_test)
    one_hot = (y_test[:, None] == current_model.classes_[None, :]).astype(float)
    brier_score = np.mean(np.sum((probabilities - one_hot) ** 2, axis=1))
    # Kiểm định chéo chỉ trên tập huấn luyện, giữ tập kiểm tra độc lập.
    cv_scores = cross_val_score(current_model, X_train, y_train, cv=cross_validation, scoring="accuracy")
    evaluations[key] = {
        "name": model_names[key],
        "family": model_types[key][0],
        "boundary": model_types[key][1],
        "accuracy": round(float(accuracy_score(y_test, y_pred)) * 100, 2),
        "precision": round(float(precision_score(y_test, y_pred, average="macro", zero_division=0)) * 100, 2),
        "recall": round(float(recall_score(y_test, y_pred, average="macro", zero_division=0)) * 100, 2),
        "f1_score": round(float(f1_score(y_test, y_pred, average="macro", zero_division=0)) * 100, 2),
        "cv_accuracy": round(float(cv_scores.mean()) * 100, 2),
        "cv_std": round(float(cv_scores.std()) * 100, 2),
        "brier_score": round(float(brier_score), 4),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
    }

data_to_save = {
    # Giữ khóa model để tương thích với phiên bản cũ; SVM vẫn là mô hình chính.
    "model": models["svm_rbf"],
    "target_names": target_names,
    "models": models,
    "model_names": model_names,
    "model_types": model_types,
    "evaluations": evaluations,
    "default_model": "svm_rbf",
    "test_size": len(y_test),
    "random_state": 42,
    "cv_folds": 5,
}

joblib.dump(data_to_save, MODEL_PATH)

print(f"-> Đã huấn luyện {len(models)} mô hình và lưu vào '{MODEL_PATH.name}'.")
for metrics in evaluations.values():
    print(f"   {metrics['name']}: Accuracy = {metrics['accuracy']}%")
